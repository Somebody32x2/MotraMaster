/**
 * Internal precomputed structures attached to an AnalysisIndex (via WeakMap) so
 * window queries stay O(window) for large histories. Not part of the public API.
 */
import type { CatalogEntry } from '../regions.ts';
import type { Dataset, Settings, Workout } from '../types.ts';
import type { AnalysisIndex, EnrichedSet, ExerciseLoadModel, PrEvent, PrType, RegionId, SessionE1rm, SessionStrength, StrengthMetric, Window } from './types.ts';
import { sliceRange } from './util.ts';

/** One exercise within one workout. */
export interface Session {
  exerciseKey: string;
  workoutId: string;
  date: Date;
  sets: EnrichedSet[];
  e1rm: SessionE1rm | null;
  volumeLb: number;
  reps: number;
  topWeightLb: number | null;
  prTypes: PrType[];
  /** Best session e1RM over the trailing 8 weeks including this session. */
  trail8Best: number | null;
  /** Session strength under each metric (null when the session has no value for it). */
  byMetric: Record<StrengthMetric, SessionStrength | null>;
  /** byMetric[active metric]. */
  strength: SessionStrength | null;
}

export interface ExerciseCtx {
  key: string;
  name: string;
  /** Dated sets, chronological. */
  sets: EnrichedSet[];
  times: number[];
  sessions: Session[];
  sessionTimes: number[];
  regionCredit: Partial<Record<RegionId, number>>;
  /** Directly credited regions, strongest first. */
  regions: RegionId[];
  /** Any set with effective load > 0. */
  weighted: boolean;
  load: ExerciseLoadModel;
  catalog: CatalogEntry | null;
  /** Share of shoulder credit that is rear delt (pull/posterior) for balance ratios. */
  rearShare: number;
  prs: PrEvent[];
  firstDate: Date;
}

export interface WorkoutAgg {
  workout: Workout;
  date: Date | null;
  sets: EnrichedSet[];
  hardSets: number;
  /** Motra TVL when present, else Σ w·r. */
  volumeLb: number;
  exercises: number;
  regionHard: Partial<Record<RegionId, number>>;
  prs: PrEvent[];
  /** Duration as reported (Total Duration, else end − start); null when unknown. */
  rawDurationSec: number | null;
  /** Raw duration minus trimmed idle tail; null when raw is unknown. */
  effectiveSec: number | null;
  /** Idle seconds trimmed after the last set (0 when untouched). */
  trimmedSec: number;
}

export interface Ctx {
  ds: Dataset;
  /** Active strength metric (settings.strengthMetric, validated). */
  metric: StrengthMetric;
  settings: Settings;
  /** Dated sets, chronological (same array as idx.sets). */
  sets: EnrichedSet[];
  times: number[];
  exercises: Map<string, ExerciseCtx>;
  workouts: Map<string, WorkoutAgg>;
  /** Dated workouts, chronological. */
  dated: WorkoutAgg[];
  datedTimes: number[];
  /** setId → weight ÷ trailing-8-week best e1RM of its exercise. */
  setPct: Map<string, number>;
  /** Region → chronological times of hard sets with direct credit. */
  regionTimes: Map<RegionId, number[]>;
  regionLabels: Map<RegionId, string[]>;
  firstDate: Date | null;
  cache: Map<string, unknown>;
}

const contexts = new WeakMap<AnalysisIndex, Ctx>();

export function attachCtx(idx: AnalysisIndex, ctx: Ctx): void {
  contexts.set(idx, ctx);
}

export function getCtx(idx: AnalysisIndex): Ctx {
  const ctx = contexts.get(idx);
  if (!ctx) throw new Error('AnalysisIndex was not created by buildIndex()');
  return ctx;
}

export function windowSets(ctx: Ctx, start: Date | null, end: Date): EnrichedSet[] {
  const [a, b] = sliceRange(ctx.times, start, end);
  return ctx.sets.slice(a, b);
}

export function windowWorkouts(ctx: Ctx, start: Date | null, end: Date): WorkoutAgg[] {
  const [a, b] = sliceRange(ctx.datedTimes, start, end);
  return ctx.dated.slice(a, b);
}

export function windowSessions(ex: ExerciseCtx, start: Date | null, end: Date): Session[] {
  const [a, b] = sliceRange(ex.sessionTimes, start, end);
  return ex.sessions.slice(a, b);
}

/** Memoize a window query per index (window objects are recreated, so key on times). */
export function memo<T>(ctx: Ctx, name: string, win: Window, fn: () => T): T {
  const key = `${name}|${win.start?.getTime() ?? ''}|${win.end.getTime()}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key) as T;
  if (ctx.cache.size > 64) ctx.cache.clear();
  const value = fn();
  ctx.cache.set(key, value);
  return value;
}
