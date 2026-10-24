/** Dashboard overview (research §4.3 N1–N8, §4.4 D5/D6/D8/D10/D12/D14/D15/D17). */
import { REGIONS } from '../regions.ts';
import { getCtx, memo, windowSets, windowWorkouts, type Ctx, type WorkoutAgg } from './context.ts';
import { exerciseSummaries, intensityAndReps, restOf } from './exercises.ts';
import { muscleSummaries, weekStarts } from './muscles.ts';
import type { AnalysisIndex, BalanceRatios, DayPoint, OverviewStats, RegionId, SeriesPoint, WeekPoint, Window } from './types.ts';
import { addDays, bucket, dayDiff, dayKey, median, num, shares, spanStart, startOfDay, startOfWeek } from './util.ts';

const MAX_DAYS = 371;
const REST_BOUNDS = [60, 120, 180, 300];

function totals(ws: WorkoutAgg[]): { workouts: number; hardSets: number; volumeLb: number; durationSec: number } {
  let hardSets = 0;
  let volumeLb = 0;
  let durationSec = 0;
  for (const w of ws) {
    hardSets += w.hardSets;
    volumeLb += w.volumeLb;
    durationSec += w.effectiveSec ?? 0;
  }
  return { workouts: ws.length, hardSets, volumeLb, durationSec };
}

function streaks(ctx: Ctx, end: Date): { current: number; longest: number } {
  const weeks = new Set<number>();
  for (const w of windowWorkouts(ctx, null, end)) weeks.add(dayKey(startOfWeek(w.date!)));
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const w of windowWorkouts(ctx, null, end)) {
    const wk = startOfWeek(w.date!);
    if (prev && dayKey(wk) === dayKey(prev)) continue;
    run = prev && dayKey(addDays(prev, 7)) === dayKey(wk) ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = wk;
  }
  let wk = startOfWeek(end);
  // The current week may still be in progress: a streak alive last week still counts.
  if (!weeks.has(dayKey(wk))) wk = addDays(wk, -7);
  let current = 0;
  while (weeks.has(dayKey(wk))) {
    current++;
    wk = addDays(wk, -7);
  }
  return { current, longest };
}

/** Fractional weekly sets over the trailing 8 weeks, grouped per research D10. */
function balance(ctx: Ctx, end: Date): BalanceRatios {
  const r: Partial<Record<RegionId, number>> = {};
  let frontShoulders = 0;
  let rearShoulders = 0;
  for (const s of windowSets(ctx, spanStart(end, 56), end)) {
    if (s.credit <= 0) continue;
    const rear = ctx.exercises.get(s.exerciseKey)?.rearShare ?? 0;
    for (const credit of [s.primary, s.secondary]) {
      for (const [id, share] of Object.entries(credit) as [RegionId, number][]) {
        const c = share * s.credit;
        r[id] = (r[id] ?? 0) + c;
        if (id === 'shoulders') {
          rearShoulders += c * rear;
          frontShoulders += c * (1 - rear);
        }
      }
    }
  }
  const sum = (ids: RegionId[]) => ids.reduce((a, id) => a + (r[id] ?? 0), 0) / 8;
  const byGroup = (g: 'upper' | 'lower') => sum((Object.keys(REGIONS) as RegionId[]).filter((id) => REGIONS[id].group === g));
  return {
    pushPull: [sum(['chest', 'triceps']) + frontShoulders / 8, sum(['lats', 'traps', 'biceps']) + rearShoulders / 8],
    quadHam: [sum(['quads']), sum(['hamstrings'])],
    upperLower: [byGroup('upper'), byGroup('lower')],
    anteriorPosterior: [
      sum(['chest', 'biceps', 'abs', 'obliques', 'quads', 'hipFlexors', 'tibialisAnterior']) + frontShoulders / 8,
      sum(['traps', 'lats', 'triceps', 'lowerBack', 'glutes', 'hamstrings', 'calves']) + rearShoulders / 8,
    ],
  };
}

function computeOverview(idx: AnalysisIndex, ctx: Ctx, win: Window): OverviewStats {
  const end = win.end;
  const ws = windowWorkouts(ctx, win.start, end);
  const sets = windowSets(ctx, win.start, end);
  const t = totals(ws);
  let calories = 0;
  let trimmedSec = 0;
  let trimmedWorkouts = 0;
  const durations: number[] = [];
  for (const w of ws) {
    calories += num(w.workout.calories) ?? 0;
    const d = w.effectiveSec;
    if (d !== null && d > 0) durations.push(d);
    if (w.trimmedSec > 0) {
      trimmedSec += w.trimmedSec;
      trimmedWorkouts++;
    }
  }

  let previous: OverviewStats['previous'] = null;
  if (win.start) {
    const prevEnd = new Date(win.start.getTime() - 1);
    const prevStart = new Date(win.start.getTime() - (end.getTime() - win.start.getTime()) - 1);
    previous = totals(windowWorkouts(ctx, prevStart, prevEnd));
  }

  // Weekly series, zero-filled.
  const weekStartsList = weekStarts(ctx, win);
  const weekIndex = new Map(weekStartsList.map((w, i) => [dayKey(w), i]));
  const weekly: WeekPoint[] = weekStartsList.map((weekStart) => ({ weekStart, workouts: 0, sets: 0, hardSets: 0, volumeLb: 0, durationSec: 0, calories: 0 }));
  const densityAcc = weekStartsList.map(() => [] as number[]);
  const hrAcc = weekStartsList.map(() => [0, 0, 0, 0, 0]);
  let anyHr = false;
  for (const w of ws) {
    const i = weekIndex.get(dayKey(startOfWeek(w.date!)));
    if (i === undefined) continue;
    const row = weekly[i];
    const dur = w.effectiveSec;
    row.workouts++;
    row.sets += w.sets.length;
    row.hardSets += w.hardSets;
    row.volumeLb += w.volumeLb;
    row.durationSec += dur ?? 0;
    row.calories += num(w.workout.calories) ?? 0;
    if (dur !== null && dur > 0 && w.volumeLb > 0) densityAcc[i].push(w.volumeLb / (dur / 60));
    const hr = w.workout.hrZonesSec;
    if (hr && hr.length) {
      anyHr = true;
      for (let z = 0; z < 5; z++) hrAcc[i][z] += num(hr[z]) ?? 0;
    }
  }
  const density: SeriesPoint[] = [];
  densityAcc.forEach((xs, i) => {
    if (xs.length) density.push({ date: weekStartsList[i], value: xs.reduce((a, b) => a + b, 0) / xs.length });
  });

  // Daily series: the window (or last 365 days for all time), at most 371 days.
  let dayFrom = win.start ? startOfDay(win.start) : spanStart(end, 365);
  if (dayDiff(dayFrom, end) + 1 > MAX_DAYS) dayFrom = spanStart(end, MAX_DAYS);
  const days: DayPoint[] = [];
  const dayIndex = new Map<number, number>();
  for (let d = dayFrom; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    dayIndex.set(dayKey(d), days.length);
    days.push({ date: d, workouts: 0, volumeLb: 0, sets: 0 });
  }
  for (const w of windowWorkouts(ctx, dayFrom, end)) {
    const row = days[dayIndex.get(dayKey(w.date!)) ?? -1];
    if (!row) continue;
    row.workouts++;
    row.volumeLb += w.volumeLb;
    row.sets += w.sets.length;
  }

  const week7 = spanStart(end, 7);
  const days28 = spanStart(end, 28);
  const { current, longest } = streaks(ctx, end);

  const topLifts = exerciseSummaries(idx, win)
    .filter((e) => e.weighted && e.valueUnit === 'lb')
    .sort((a, b) => b.sessions - a.sessions || b.sets - a.sets)
    .slice(0, 6);

  const prFrom = addDays(end, -30);
  const recentPrs = idx.prs
    .filter((p) => p.date <= end && p.date >= prFrom && (!win.start || p.date >= win.start))
    .reverse();

  const { zones, reps } = intensityAndReps(ctx, sets);
  const restCounts = [0, 0, 0, 0, 0];
  const rests: number[] = [];
  const effort = new Array<number>(10).fill(0);
  let anyEffort = false;
  for (const s of sets) {
    const r = restOf(s);
    if (r !== null) {
      rests.push(r);
      restCounts[bucket(r, REST_BOUNDS)]++;
    }
    if (s.effort !== null) {
      anyEffort = true;
      effort[Math.min(10, Math.max(1, Math.round(s.effort))) - 1]++;
    }
  }

  let acute = 0;
  let chronic = 0;
  for (const s of windowSets(ctx, days28, end)) {
    if (s.credit <= 0) continue;
    chronic += s.credit;
    if (s.date >= week7) acute += s.credit;
  }
  const enoughHistory = ctx.firstDate !== null && dayDiff(ctx.firstDate, end) >= 27;
  const loadRatio = enoughHistory && chronic > 0 ? acute / (chronic / 4) : null;

  const newExercises: OverviewStats['newExercises'] = [];
  for (const ex of ctx.exercises.values()) {
    if (ex.firstDate <= end && (!win.start || ex.firstDate >= win.start)) newExercises.push({ key: ex.key, name: ex.name, firstDate: ex.firstDate });
  }
  newExercises.sort((a, b) => b.firstDate.getTime() - a.firstDate.getTime() || a.name.localeCompare(b.name));

  return {
    window: win,
    workouts: t.workouts,
    sets: sets.length,
    hardSets: t.hardSets,
    volumeLb: t.volumeLb,
    durationSec: t.durationSec,
    calories,
    avgDurationSec: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    trimmedSec,
    trimmedWorkouts,
    previous,
    workoutsThisWeek: windowWorkouts(ctx, week7, end).length,
    avgWorkoutsPerWeek4w: windowWorkouts(ctx, days28, end).length / 4,
    currentStreakWeeks: current,
    longestStreakWeeks: longest,
    weekly,
    days,
    topLifts,
    recentPrs,
    muscles: muscleSummaries(idx, win),
    balance: balance(ctx, end),
    intensityZones: zones,
    repRanges: reps,
    restBuckets: shares(restCounts),
    medianRestSec: median(rests),
    density,
    hrWeekly: anyHr ? weekStartsList.map((weekStart, i) => ({ weekStart, zones: hrAcc[i] })) : [],
    effortHistogram: anyEffort ? effort : null,
    loadRatio,
    newExercises,
  };
}

export function overviewStats(idx: AnalysisIndex, win: Window): OverviewStats {
  const ctx = getCtx(idx);
  return memo(ctx, 'overview', win, () => computeOverview(idx, ctx, win));
}
