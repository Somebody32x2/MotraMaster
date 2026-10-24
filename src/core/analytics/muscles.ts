/** Per-region volume, frequency and progress (research §2, §4.1, N2/N7, D1/D2). */
import { isRegionId, REGION_ORDER, REGIONS, regionName } from '../regions.ts';
import { getCtx, memo, windowSets, windowWorkouts, type Ctx } from './context.ts';
import { exerciseSummaries } from './exercises.ts';
import type { AnalysisIndex, CountedSet, EnrichedSet, MuscleDetail, MuscleSummary, MuscleWeek, MuscleWeekExercise, RegionId, SeriesPoint, VolumeBand, Window } from './types.ts';
import { addDays, dayKey, spanStart, startOfWeek, upperBound } from './util.ts';

/** Research §2.1 / §4.2 bands: 0 · < 5 · 5–9 · 10–20 · > 20 weekly sets. */
export function volumeBand(weeklySets: number): VolumeBand {
  if (!(weeklySets > 0)) return 'none';
  if (weeklySets < 5) return 'low';
  if (weeklySets < 10) return 'moderate';
  if (weeklySets <= 20) return 'target';
  return 'high';
}

/** Primary regions' share of a set's volume, proportional to credit. */
export function volumeShare(s: EnrichedSet, region: RegionId): number {
  const c = s.primary[region];
  if (!c || s.volumeLb <= 0) return 0;
  let total = 0;
  for (const v of Object.values(s.primary)) total += v ?? 0;
  return total > 0 ? (s.volumeLb * c) / total : 0;
}

interface Acc {
  weekly: number;
  weeklyFrac: number;
  sets4w: number;
  days4w: Set<number>;
  windowSets: number;
  volumeLb: number;
  exercises: Map<string, number>;
}

/** `everyRegion` also keeps undrawn buckets with no data (used for detail pages). */
function computeSummaries(ctx: Ctx, win: Window, everyRegion = false): MuscleSummary[] {
  const acc = new Map<RegionId, Acc>();
  const get = (id: RegionId): Acc => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { weekly: 0, weeklyFrac: 0, sets4w: 0, days4w: new Set(), windowSets: 0, volumeLb: 0, exercises: new Map() }));
    return a;
  };
  for (const s of windowSets(ctx, win.start, win.end)) {
    for (const [id, c] of Object.entries(s.primary) as [RegionId, number][]) {
      const a = get(id);
      a.volumeLb += volumeShare(s, id);
      if (s.credit <= 0) continue;
      a.windowSets += c * s.credit;
      a.exercises.set(s.exerciseKey, (a.exercises.get(s.exerciseKey) ?? 0) + s.credit);
    }
  }
  const week = spanStart(win.end, 7).getTime();
  for (const s of windowSets(ctx, spanStart(win.end, 28), win.end)) {
    if (s.credit <= 0) continue;
    const recent = s.date.getTime() >= week;
    for (const [id, c] of Object.entries(s.primary) as [RegionId, number][]) {
      const a = get(id);
      a.sets4w += c * s.credit;
      a.days4w.add(dayKey(s.date));
      if (recent) {
        a.weekly += c * s.credit;
        a.weeklyFrac += c * s.credit;
      }
    }
    if (recent) for (const [id, c] of Object.entries(s.secondary) as [RegionId, number][]) get(id).weeklyFrac += c * s.credit;
  }

  const out: MuscleSummary[] = [];
  for (const region of REGION_ORDER) {
    const a = acc.get(region);
    // Any credited set (hard or not) in range counts as data, so undrawn buckets never hide sets.
    if (!a && !everyRegion && !REGIONS[region].drawn) continue;
    const times = ctx.regionTimes.get(region);
    const last = times ? upperBound(times, win.end.getTime()) : 0;
    const topExercises = a
      ? [...a.exercises.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 5)
          .map(([key, sets]) => ({ key, name: ctx.exercises.get(key)?.name ?? key, sets }))
      : [];
    const weeklySets = a?.weekly ?? 0;
    out.push({
      region,
      name: regionName(region),
      weeklySets,
      weeklyFractional: a?.weeklyFrac ?? 0,
      avgWeeklySets4w: (a?.sets4w ?? 0) / 4,
      band: volumeBand(weeklySets),
      windowSets: a?.windowSets ?? 0,
      volumeLb: a?.volumeLb ?? 0,
      frequencyPerWeek: (a?.days4w.size ?? 0) / 4,
      lastTrained: times && last > 0 ? new Date(times[last - 1]) : null,
      topExercises,
      rawLabels: ctx.regionLabels.get(region) ?? [],
    });
  }

  return out.sort((x, y) => y.weeklySets - x.weeklySets || y.windowSets - x.windowSets || x.name.localeCompare(y.name));
}

export function muscleSummaries(idx: AnalysisIndex, win: Window): MuscleSummary[] {
  const ctx = getCtx(idx);
  return memo(ctx, 'muscles', win, () => computeSummaries(ctx, win));
}

/** ISO weeks from the window start (or first workout) through the window end. */
export function weekStarts(ctx: Ctx, win: Window): Date[] {
  const from = startOfWeek(win.start ?? ctx.firstDate ?? win.end);
  const to = startOfWeek(win.end).getTime();
  const out: Date[] = [];
  for (let w = from; w.getTime() <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

/**
 * Every set of every exercise that credits `region` over [start, end], with what each
 * set added (warm-ups included at 0), so a week's count can be traced set by set.
 */
export function muscleWeek(idx: AnalysisIndex, region: RegionId, start: Date, end: Date): MuscleWeek {
  const ctx = getCtx(idx);
  const byKey = new Map<string, MuscleWeekExercise>();
  let sets = 0;
  let fractional = 0;
  for (const s of windowSets(ctx, start, end)) {
    const direct = s.primary[region] ?? 0;
    const secondary = s.secondary[region] ?? 0;
    if (direct <= 0 && secondary <= 0) continue;
    const credit = (direct + secondary) * s.credit;
    if (direct > 0) sets += credit;
    fractional += credit;
    let ex = byKey.get(s.exerciseKey);
    if (!ex) {
      ex = { key: s.exerciseKey, name: ctx.exercises.get(s.exerciseKey)?.name ?? s.exerciseKey, role: 'secondary', sets: 0, sessions: [] };
      byKey.set(s.exerciseKey, ex);
    }
    if (direct > 0) ex.role = 'direct';
    ex.sets += credit;
    const last = ex.sessions[ex.sessions.length - 1];
    const counted: CountedSet = { set: s, credit };
    if (last && last.workoutId === s.workoutId) last.sets.push(counted);
    else ex.sessions.push({ workoutId: s.workoutId, date: s.date, sets: [counted] });
  }
  const exercises = [...byKey.values()].sort(
    (a, b) => (a.role === b.role ? 0 : a.role === 'direct' ? -1 : 1) || b.sets - a.sets || a.name.localeCompare(b.name),
  );
  return { region, start, end, sets, fractional, exercises };
}

export function muscleDetail(idx: AnalysisIndex, region: RegionId, win: Window): MuscleDetail | null {
  if (!isRegionId(region)) return null;
  const ctx = getCtx(idx);
  const summary = muscleSummaries(idx, win).find((m) => m.region === region)
    ?? computeSummaries(ctx, win, true).find((m) => m.region === region);
  if (!summary) return null;

  const weeks = weekStarts(ctx, win);
  const weekIndex = new Map(weeks.map((w, i) => [dayKey(w), i]));
  const weekly = weeks.map((weekStart) => ({ weekStart, sets: 0, fractional: 0, volumeLb: 0 }));
  const sets = windowSets(ctx, win.start, win.end);
  for (const s of sets) {
    const row = weekly[weekIndex.get(dayKey(startOfWeek(s.date))) ?? -1];
    if (!row) continue;
    const direct = s.primary[region] ?? 0;
    row.volumeLb += volumeShare(s, region);
    if (s.credit <= 0) continue;
    row.sets += direct * s.credit;
    row.fractional += (direct + (s.secondary[region] ?? 0)) * s.credit;
  }

  // Exercises that credit this region directly on at least half their sets.
  const credited = new Set<string>();
  for (const ex of ctx.exercises.values()) {
    if ((ex.regionCredit[region] ?? 0) >= ex.sets.length * 0.5) credited.add(ex.key);
  }
  const exercises = exerciseSummaries(idx, win).filter((e) => credited.has(e.key));

  // Strength index: weekly mean of session e1RM ÷ first in-window session e1RM per exercise.
  const ratios = new Map<number, number[]>();
  for (const e of exercises) {
    const ex = ctx.exercises.get(e.key)!;
    if (!ex.weighted) continue;
    let base = 0;
    for (const sess of ex.sessions) {
      if (!sess.e1rm || sess.date > win.end || (win.start && sess.date < win.start)) continue;
      if (base === 0) base = sess.e1rm.e1rm;
      const wk = startOfWeek(sess.date).getTime();
      const arr = ratios.get(wk);
      if (arr) arr.push(sess.e1rm.e1rm / base);
      else ratios.set(wk, [sess.e1rm.e1rm / base]);
    }
  }
  const strengthIndex: SeriesPoint[] = [...ratios.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([t, v]) => ({ date: new Date(t), value: v.reduce((p, q) => p + q, 0) / v.length }));

  const recentPrs = idx.prs
    .filter((p) => credited.has(p.exerciseKey) && p.date <= win.end && (!win.start || p.date >= win.start))
    .reverse()
    .slice(0, 20);

  // Co-occurrence: share of sessions training this region that also trained each other region.
  let together = 0;
  const pairs = new Map<RegionId, number>();
  for (const w of windowWorkouts(ctx, win.start, win.end)) {
    if (!w.regionHard[region]) continue;
    together++;
    for (const id of Object.keys(w.regionHard) as RegionId[]) {
      if (id !== region && REGIONS[id]?.drawn) pairs.set(id, (pairs.get(id) ?? 0) + 1);
    }
  }
  const pairedWith = together
    ? [...pairs.entries()].map(([r, n]) => ({ region: r, share: n / together })).sort((x, y) => y.share - x.share).slice(0, 6)
    : [];

  return { ...summary, weekly, exercises, strengthIndex, recentPrs, pairedWith };
}
