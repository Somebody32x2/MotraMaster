/** Workout summaries and detail (research N6, D8, D12, D13). */
import { getCtx, memo, windowWorkouts, type Ctx, type WorkoutAgg } from './context.ts';
import type { AnalysisIndex, RegionId, Window, WorkoutDetail, WorkoutSummary } from './types.ts';
import { finiteOrNull, num } from './util.ts';

export function topRegions(credit: Partial<Record<RegionId, number>>, n: number): RegionId[] {
  return (Object.entries(credit) as [RegionId, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

function summarize(w: WorkoutAgg): WorkoutSummary {
  const durationSec = w.effectiveSec;
  const minutes = durationSec !== null && durationSec > 0 ? durationSec / 60 : null;
  const rawMinutes = w.rawDurationSec !== null && w.rawDurationSec > 0 ? w.rawDurationSec / 60 : null;
  const calories = num(w.workout.calories);
  return {
    workout: w.workout,
    date: w.date,
    durationSec,
    rawDurationSec: w.rawDurationSec,
    trimmedSec: w.trimmedSec,
    sets: w.sets.length,
    hardSets: w.hardSets,
    volumeLb: w.volumeLb,
    exercises: w.exercises,
    topRegions: topRegions(w.regionHard, 3),
    prCount: w.prs.length,
    density: minutes !== null && w.volumeLb > 0 ? finiteOrNull(w.volumeLb / minutes) : null,
    kcalPerMin: rawMinutes !== null && calories !== null && calories > 0 ? finiteOrNull(calories / rawMinutes) : null,
  };
}

export function workoutSummaries(idx: AnalysisIndex, win: Window): WorkoutSummary[] {
  const ctx = getCtx(idx);
  return memo(ctx, 'workouts', win, () => {
    const out = windowWorkouts(ctx, win.start, win.end).map(summarize).reverse();
    // Undated workouts only belong to the all-time view, after everything dated.
    if (win.start === null) for (const w of ctx.workouts.values()) if (!w.date) out.push(summarize(w));
    return out;
  });
}

function exerciseName(ctx: Ctx, key: string): string {
  return ctx.exercises.get(key)?.name ?? ctx.ds.exercises[key]?.name ?? key;
}

export function workoutDetail(idx: AnalysisIndex, id: string): WorkoutDetail | null {
  const ctx = getCtx(idx);
  const w = ctx.workouts.get(id);
  if (!w) return null;
  const blocks: WorkoutDetail['blocks'] = [];
  const credits: Partial<Record<RegionId, number>>[] = [];
  const restSeries: { index: number; restSec: number }[] = [];
  for (const [i, s] of w.sets.entries()) {
    let block = blocks[blocks.length - 1];
    if (!block || s.firstOfBlock) {
      block = {
        exerciseKey: s.exerciseKey,
        name: exerciseName(ctx, s.exerciseKey),
        regions: [],
        sets: [],
        volumeLb: 0,
        bestE1rm: null,
        prs: w.prs.filter((p) => p.exerciseKey === s.exerciseKey),
      };
      blocks.push(block);
      credits.push({});
    }
    const credit = credits[credits.length - 1];
    block.sets.push(s);
    block.volumeLb += s.volumeLb;
    if (s.e1rm && (block.bestE1rm === null || s.e1rm.value > block.bestE1rm)) block.bestE1rm = s.e1rm.value;
    for (const [r, c] of Object.entries(s.primary) as [RegionId, number][]) credit[r] = (credit[r] ?? 0) + c;
    if (!s.firstOfBlock && s.restSec !== null && s.restSec > 0) restSeries.push({ index: i, restSec: s.restSec });
  }
  blocks.forEach((b, i) => {
    b.regions = topRegions(credits[i], 4);
  });
  return {
    ...summarize(w),
    blocks,
    regionSets: { ...w.regionHard },
    hrZonesSec: w.workout.hrZonesSec && w.workout.hrZonesSec.length ? w.workout.hrZonesSec.map((z) => num(z) ?? 0) : null,
    restSeries,
    prs: [...w.prs],
  };
}
