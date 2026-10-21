/** Training calendar: per-day metrics, weekday patterns and start-time distribution. */
import { getCtx, memo, windowWorkouts, type WorkoutAgg } from './context.ts';
import { restOf } from './exercises.ts';
import type { AnalysisIndex, CalendarDay, CalendarStats, DayMetric, RegionId, WeekdayStat, Window } from './types.ts';
import { addDays, dayKey, finiteOrNull, median, num, startOfDay } from './util.ts';
import { topRegions } from './workouts.ts';

type Credit = Partial<Record<RegionId, number>>;

const METRICS: DayMetric[] = ['workouts', 'volume', 'duration', 'density', 'hardSets', 'calories', 'kcalPerMin', 'avgRest', 'exercises', 'startHour'];

function emptyMetrics(): Record<DayMetric, number | null> {
  const out = {} as Record<DayMetric, number | null>;
  for (const m of METRICS) out[m] = null;
  return out;
}

/** Monday = 0 … Sunday = 6. */
function weekdayOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addCredit(into: Credit, from: Credit): void {
  for (const [id, c] of Object.entries(from) as [RegionId, number][]) into[id] = (into[id] ?? 0) + c;
}

/** Metrics over one day's workouts (chronological, non-empty). */
function dayMetrics(ws: WorkoutAgg[]): Record<DayMetric, number | null> {
  let volume = 0;
  let hardSets = 0;
  let effective = 0;
  let anyDuration = false;
  let calories = 0;
  let anyCalories = false;
  let rateCalories = 0;
  let rateRawSec = 0;
  const rests: number[] = [];
  const exercises = new Set<string>();
  for (const w of ws) {
    volume += w.volumeLb;
    hardSets += w.hardSets;
    if (w.effectiveSec !== null) {
      effective += w.effectiveSec;
      anyDuration = true;
    }
    const cal = num(w.workout.calories);
    if (cal !== null && cal > 0) {
      calories += cal;
      anyCalories = true;
      if (w.rawDurationSec !== null && w.rawDurationSec > 0) {
        rateCalories += cal;
        rateRawSec += w.rawDurationSec;
      }
    }
    for (const s of w.sets) {
      exercises.add(s.exerciseKey);
      const r = restOf(s);
      if (r !== null) rests.push(r);
    }
  }
  const first = ws[0].date!;
  return {
    workouts: ws.length,
    volume,
    duration: anyDuration ? effective : null,
    density: effective > 0 && volume > 0 ? finiteOrNull(volume / (effective / 60)) : null,
    hardSets,
    calories: anyCalories ? calories : null,
    kcalPerMin: rateRawSec > 0 ? finiteOrNull(rateCalories / (rateRawSec / 60)) : null,
    avgRest: median(rests),
    exercises: exercises.size,
    startHour: first.getHours() + first.getMinutes() / 60,
  };
}

function computeCalendar(idx: AnalysisIndex, win: Window): CalendarStats {
  const ctx = getCtx(idx);
  const ws = windowWorkouts(ctx, win.start, win.end);

  // Calendar span: window start (but not before the first workout) through window end.
  let from: Date | null = ctx.firstDate ? startOfDay(ctx.firstDate) : null;
  if (win.start && (!from || win.start > from)) from = startOfDay(win.start);

  const byDay = new Map<number, WorkoutAgg[]>();
  for (const w of ws) {
    const k = dayKey(w.date!);
    const arr = byDay.get(k);
    if (arr) arr.push(w);
    else byDay.set(k, [w]);
  }

  const days: CalendarDay[] = [];
  const calendarDays = [0, 0, 0, 0, 0, 0, 0];
  const activeDays = [0, 0, 0, 0, 0, 0, 0];
  const metricSums = Array.from({ length: 7 }, () => emptyMetrics());
  const metricCounts = Array.from({ length: 7 }, () => Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<DayMetric, number>);
  if (from && Number.isFinite(win.end.getTime())) {
    // Step by calendar date (addDays) so DST transitions never skip or repeat a day.
    for (let d = from; d.getTime() <= win.end.getTime(); d = addDays(d, 1)) {
      const wd = weekdayOf(d);
      calendarDays[wd]++;
      const list = byDay.get(dayKey(d));
      if (!list) {
        days.push({ date: d, workoutIds: [], metrics: { ...emptyMetrics(), workouts: 0 }, topRegions: [] });
        continue;
      }
      activeDays[wd]++;
      const metrics = dayMetrics(list);
      for (const m of METRICS) {
        const v = metrics[m];
        if (v === null) continue;
        metricSums[wd][m] = (metricSums[wd][m] ?? 0) + v;
        metricCounts[wd][m]++;
      }
      const credit: Credit = {};
      for (const w of list) addCredit(credit, w.regionHard);
      days.push({ date: d, workoutIds: list.map((w) => w.workout.id), metrics, topRegions: topRegions(credit, 3) });
    }
  }

  const hours = new Array<number>(24).fill(0);
  const weekdayHour = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const weekdayWorkouts = [0, 0, 0, 0, 0, 0, 0];
  const weekdayCredit: Credit[] = Array.from({ length: 7 }, () => ({}));
  for (const w of ws) {
    const wd = weekdayOf(w.date!);
    const h = w.date!.getHours();
    hours[h]++;
    weekdayHour[wd][h]++;
    weekdayWorkouts[wd]++;
    addCredit(weekdayCredit[wd], w.regionHard);
  }

  const weekdays: WeekdayStat[] = weekdayWorkouts.map((count, wd) => {
    const avg = emptyMetrics();
    for (const m of METRICS) {
      const n = metricCounts[wd][m];
      if (n > 0) avg[m] = finiteOrNull(metricSums[wd][m]! / n);
    }
    return {
      weekday: wd,
      workouts: count,
      share: ws.length > 0 ? count / ws.length : 0,
      hitRate: calendarDays[wd] > 0 ? activeDays[wd] / calendarDays[wd] : 0,
      avg,
      topRegions: topRegions(weekdayCredit[wd], 3),
    };
  });

  return { window: win, days, weekdays, hours, weekdayHour };
}

export function calendarStats(idx: AnalysisIndex, win: Window): CalendarStats {
  return memo(getCtx(idx), 'calendar', win, () => computeCalendar(idx, win));
}
