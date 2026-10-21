/** Exercise summaries and detail (research §3, §4.4 D3–D9). */
import { normalizeKey } from '../labels.ts';
import type { Settings } from '../types.ts';
import { getCtx, memo, windowSessions, type Ctx, type ExerciseCtx } from './context.ts';
import { oneRmFormulas } from './e1rm.ts';
import { liftFor } from './strength.ts';
import { ewma, prEnvelope, ratePerMonth, strengthPoints, trendStatus } from './trend.ts';
import type {
  AnalysisIndex,
  EnrichedSet,
  ExerciseDetail,
  ExerciseSessionRow,
  ExerciseSummary,
  RegionId,
  RepMaxRow,
  SessionStrength,
  StrengthMetric,
  Window,
} from './types.ts';
import { addDays, bucket, finiteOrNull, median, shares, sliceRange } from './util.ts';

const SPARK_POINTS = 24;
export const ZONE_BOUNDS = [0.6, 0.7, 0.8, 0.9];
export const REP_BOUNDS = [6, 13, 21];
export const REST_MAX = 600;

export function summarize(ex: ExerciseCtx, win: Window, metric: StrengthMetric): ExerciseSummary | null {
  const [a, b] = sliceRange(ex.times, win.start, win.end);
  if (a >= b) return null;
  let hardSets = 0;
  let volumeLb = 0;
  let bestWeightLb: number | null = null;
  let bestE1rm: number | null = null;
  let bestHoldSec: number | null = null;
  for (let i = a; i < b; i++) {
    const s = ex.sets[i];
    if (s.hard) hardSets++;
    volumeLb += s.volumeLb;
    if (s.weightLb !== null && s.weightLb > 0 && (bestWeightLb === null || s.weightLb > bestWeightLb)) bestWeightLb = s.weightLb;
    if (s.holdSec !== null && s.holdSec > 0 && (bestHoldSec === null || s.holdSec > bestHoldSec)) bestHoldSec = s.holdSec;
  }
  const sessions = windowSessions(ex, win.start, win.end);
  let latestE1rm: number | null = null;
  let latestStrength: SessionStrength | null = null;
  let bestStrength: SessionStrength | null = null;
  for (const s of sessions) {
    const st = s.strength;
    if (st) {
      latestStrength = st;
      if (!bestStrength || st.value > bestStrength.value || (st.value === bestStrength.value && st.reps > bestStrength.reps)) bestStrength = st;
    }
    if (!s.e1rm) continue;
    if (bestE1rm === null || s.e1rm.e1rm > bestE1rm) bestE1rm = s.e1rm.e1rm;
    latestE1rm = s.e1rm.e1rm;
  }
  const rate = ratePerMonth(ex, win);
  const valueUnit: ExerciseSummary['valueUnit'] = ex.load.kind === 'timed' ? 'sec' : ex.weighted ? 'lb' : 'reps';
  const spark = valueUnit === 'reps'
    ? sessions.map((s) => s.reps)
    : sessions.filter((s) => s.strength).map((s) => s.strength!.value);
  const [, last] = sliceRange(ex.times, null, win.end);
  return {
    key: ex.key,
    name: ex.name,
    regions: ex.regions,
    sets: b - a,
    hardSets,
    sessions: sessions.length,
    firstDate: ex.firstDate,
    lastDate: last > 0 ? ex.sets[last - 1].date : null,
    volumeLb,
    weighted: ex.weighted,
    bestWeightLb,
    bestE1rm,
    latestE1rm,
    metric,
    latestStrength,
    bestStrength,
    ratePerMonth: rate,
    status: trendStatus(ex, rate, win, metric),
    spark: spark.slice(-SPARK_POINTS),
    inCatalog: ex.catalog !== null,
    load: ex.load,
    valueUnit,
    bestHoldSec,
  };
}

export function exerciseSummaries(idx: AnalysisIndex, win: Window): ExerciseSummary[] {
  const ctx = getCtx(idx);
  return memo(ctx, 'exercises', win, () => {
    const out: ExerciseSummary[] = [];
    for (const ex of ctx.exercises.values()) {
      const s = summarize(ex, win, ctx.metric);
      if (s) out.push(s);
    }
    return out.sort((x, y) => y.sets - x.sets || y.sessions - x.sessions || x.name.localeCompare(y.name));
  });
}

/** Restable intervals: not a block start, 0 < rest ≤ 600 s (research D6). */
export function restOf(s: EnrichedSet): number | null {
  return !s.firstOfBlock && s.restSec !== null && s.restSec > 0 && s.restSec <= REST_MAX ? s.restSec : null;
}

/** Zone/rep-range counts over hard sets. */
export function intensityAndReps(ctx: Ctx, sets: EnrichedSet[]): { zones: number[]; reps: number[] } {
  const zones = [0, 0, 0, 0, 0];
  const reps = [0, 0, 0, 0];
  for (const s of sets) {
    if (!s.hard) continue;
    const pct = ctx.setPct.get(s.setId);
    if (pct !== undefined) zones[bucket(pct, ZONE_BOUNDS)]++;
    if (s.reps !== null && s.reps >= 1) reps[bucket(s.reps, REP_BOUNDS)]++;
  }
  return { zones: shares(zones), reps: shares(reps) };
}

function delta(points: { date: Date; value: number }[], days: number): number | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const target = addDays(latest.date, -days).getTime();
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].date.getTime() <= target) return finiteOrNull(latest.value / points[i].value - 1);
  }
  return null;
}

/** Mean drop-off 1 − reps_last/reps_first over sessions with ≥ 3 hard sets at one weight. */
function fatigueDropoff(sessions: { sets: EnrichedSet[] }[]): number | null {
  const values: number[] = [];
  for (const sess of sessions) {
    const byWeight = new Map<number, EnrichedSet[]>();
    for (const s of sess.sets) {
      if (!s.hard || s.reps === null || s.reps < 1) continue;
      const w = s.loadLb ?? 0;
      const arr = byWeight.get(w);
      if (arr) arr.push(s);
      else byWeight.set(w, [s]);
    }
    let group: EnrichedSet[] | null = null;
    for (const g of byWeight.values()) if (g.length >= 3 && (!group || g.length > group.length)) group = g;
    if (group) values.push(Math.min(1, Math.max(0, 1 - group[group.length - 1].reps! / group[0].reps!)));
  }
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function exerciseDetail(idx: AnalysisIndex, key: string, win: Window, settings: Settings): ExerciseDetail | null {
  const ctx = getCtx(idx);
  const ex = ctx.exercises.get(key) ?? ctx.exercises.get(normalizeKey(key));
  if (!ex) return null;

  let summary = summarize(ex, win, ctx.metric);
  if (!summary) {
    // No sets in the window: keep identity fields from full history, zero the window counts.
    const all = summarize(ex, { start: null, end: new Date(8.64e15) }, ctx.metric)!;
    summary = {
      ...all,
      sets: 0,
      hardSets: 0,
      sessions: 0,
      volumeLb: 0,
      bestWeightLb: null,
      bestE1rm: null,
      latestE1rm: null,
      latestStrength: null,
      bestStrength: null,
      ratePerMonth: null,
      status: 'insufficient',
      spark: [],
      bestHoldSec: null,
    };
  }

  const sessions = windowSessions(ex, win.start, win.end);
  const [a, b] = sliceRange(ex.times, win.start, win.end);
  const sets = ex.sets.slice(a, b);

  // Trend: EWMA and envelope run over full history, then clip to the window.
  const allPoints = strengthPoints(ex.sessions);
  const inWin = (p: { date: Date }) => p.date.getTime() <= win.end.getTime() && (!win.start || p.date >= win.start);
  const sessionsE1rm = sessions.filter((s) => s.e1rm).map((s) => s.e1rm!);
  const sessionsStrength = sessions.filter((s) => s.strength).map((s) => s.strength!);
  const trend = ewma(allPoints).filter(inWin);
  const envelope = prEnvelope(allPoints).filter(inWin);
  const upToEnd = allPoints.filter((p) => p.date.getTime() <= win.end.getTime());

  // Rep-max table over all history up to window end; predictions from best e1RM of the last 90 days.
  const [, endIdx] = sliceRange(ex.times, null, win.end);
  const best: { w: number; date: Date }[] = Array.from({ length: 16 }, () => ({ w: 0, date: new Date(0) }));
  for (let i = 0; i < endIdx; i++) {
    const s = ex.sets[i];
    if (s.loadLb === null || s.loadLb <= 0 || s.reps === null || s.reps < 1) continue;
    for (let r = 1; r <= Math.min(15, Math.floor(s.reps)); r++) {
      if (s.loadLb > best[r].w) best[r] = { w: s.loadLb, date: s.date };
    }
  }
  const from90 = addDays(win.end, -90);
  const recent = windowSessions(ex, from90, win.end);
  let recentBest = 0;
  for (const s of recent) if (s.e1rm && s.e1rm.e1rm > recentBest) recentBest = s.e1rm.e1rm;
  const repMax: RepMaxRow[] = [];
  if (ex.weighted && ex.load.kind !== 'timed') {
    for (let r = 1; r <= 15; r++) {
      repMax.push({
        reps: r,
        actualLb: best[r].w > 0 ? best[r].w : null,
        actualDate: best[r].w > 0 ? best[r].date : null,
        predictedLb: recentBest > 0 ? (r === 1 ? recentBest : recentBest / (1 + r / 30)) : null,
      });
    }
  }

  // Formulas side by side on the best set (by e1RM) of the last 90 days with ≤ 15 reps.
  let basis: EnrichedSet | null = null;
  for (const sess of recent) {
    for (const s of sess.sets) {
      if (!s.e1rm || s.reps === null || s.reps > 15) continue;
      if (!basis || s.e1rm.value > basis.e1rm!.value) basis = s;
    }
  }
  const formulas = basis
    ? oneRmFormulas.map((f) => ({ name: f.name, key: f.key, value: f.fn(basis!.loadLb!, basis!.reps!) }))
    : null;

  const rests: number[] = [];
  const secPerRep: number[] = [];
  for (const s of sets) {
    const r = restOf(s);
    if (r !== null) rests.push(r);
    if (s.durationSec !== null && s.reps !== null && s.reps > 0) {
      const spr = s.durationSec / s.reps;
      if (spr >= 0.3 && spr <= 15) secPerRep.push(spr);
    }
  }

  const { zones, reps } = intensityAndReps(ctx, sets);
  const history: ExerciseSessionRow[] = sessions.map((s) => ({
    workoutId: s.workoutId,
    date: s.date,
    sets: s.sets.map((x) => ({ weightLb: x.weightLb, loadLb: x.loadLb, loadBasis: x.loadBasis, reps: x.reps, e1rm: x.e1rm?.value ?? null, hard: x.hard, restSec: x.restSec, durationSec: x.durationSec, holdSec: x.holdSec })),
    volumeLb: s.volumeLb,
    bestE1rm: s.e1rm?.e1rm ?? null,
    topWeightLb: s.topWeightLb,
    prTypes: s.prTypes,
  })).reverse();

  const primary = new Set(ex.regions);
  const secondaryRegions = ex.catalog
    ? (Object.entries(ex.catalog.m) as [RegionId, number][])
        .filter(([id, w]) => w >= 6 && w < 8 && !primary.has(id))
        .sort((x, y) => y[1] - x[1])
        .map(([id]) => id)
    : [];

  return {
    ...summary,
    muscleRaw: (ctx.ds.exercises[ex.key]?.muscleKeys ?? []).map((k) => ctx.ds.muscles[k]?.name ?? k),
    secondaryRegions,
    delts: ex.catalog?.d ?? [],
    sessionsE1rm,
    sessionsStrength,
    trend,
    prEnvelope: envelope,
    sessionVolume: sessions.map((s) => ({ date: s.date, value: s.volumeLb })),
    topWeight: sessions.filter((s) => s.topWeightLb !== null).map((s) => ({ date: s.date, value: s.topWeightLb! })),
    prs: ex.prs.filter(inWin).reverse(),
    repMax,
    formulas,
    formulasBasis: basis ? { weightLb: basis.loadLb!, reps: basis.reps!, date: basis.date } : null,
    deltas: { d30: delta(upToEnd, 30), d90: delta(upToEnd, 90), d365: delta(upToEnd, 365) },
    medianRestSec: median(rests),
    medianSecPerRep: median(secPerRep),
    fatigueDropoff: fatigueDropoff(sessions),
    intensityZones: zones,
    repRanges: reps,
    history,
    relative: liftFor(ctx, ex, settings),
  };
}
