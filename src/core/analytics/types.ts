/**
 * Analytics contract. Implementations live beside this file; pages consume
 * only these shapes. All weights are pounds (display conversion is the UI's
 * job). All dates are local `Date`s built from Workout.start.
 *
 * See docs/research.md for the definitions behind every number.
 */
import type { OneRmFormula, Workout } from '../types';

/** Canonical body regions (Motra's 18 ids + neck) and three undrawn buckets. */
export type RegionId =
  | 'chest' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques' | 'lats' | 'traps' | 'lowerBack'
  | 'glutes' | 'hipFlexors' | 'quads' | 'hamstrings' | 'adductors'
  | 'abductors' | 'calves' | 'tibialisAnterior' | 'neck'
  | 'fullBody' | 'cardio' | 'other';

export type DeltHead = 'front' | 'side' | 'rear';

/** Inclusive analysis window. `start: null` = all time. */
export interface Window {
  start: Date | null;
  end: Date;
}

export type Confidence = 'high' | 'medium';
export type TrendStatus = 'progressing' | 'plateau' | 'dip' | 'insufficient';
/** Weekly hard-set band per research §2.1: 0 | <5 | 5–9 | 10–20 | >20. */
export type VolumeBand = 'none' | 'low' | 'moderate' | 'target' | 'high';
export type PrType = 'weight' | 'reps' | 'e1rm' | 'setVolume' | 'sessionVolume';

export interface E1rmEstimate {
  value: number;
  confidence: Confidence;
  /** Reps after the RPE→RIR adjustment. */
  effectiveReps: number;
  formula: Exclude<OneRmFormula, 'auto'> | 'actual' | 'blend';
}

/** A set enriched with everything analytics needs. Built once per dataset+settings. */
export interface EnrichedSet {
  setId: string;
  workoutId: string;
  date: Date;
  exerciseKey: string;
  weightLb: number | null;
  reps: number | null;
  durationSec: number | null;
  restSec: number | null;
  effort: number | null;
  /** Direct (primary) region credit; sums of group labels may be fractional (e.g. back → lats .5, traps .5). */
  primary: Partial<Record<RegionId, number>>;
  /** Secondary credit from the bundled Motra catalog (0.5 for catalog weight 6–7); empty when exercise unknown. */
  secondary: Partial<Record<RegionId, number>>;
  /** Working-set heuristic (research §4.1). */
  hard: boolean;
  /** First set of an exercise block within the workout (its rest includes changeover). */
  firstOfBlock: boolean;
  volumeLb: number;
  e1rm: E1rmEstimate | null;
}

export interface SeriesPoint {
  date: Date;
  value: number;
}

export interface WeekPoint {
  /** Monday 00:00 local. */
  weekStart: Date;
  workouts: number;
  sets: number;
  hardSets: number;
  volumeLb: number;
  durationSec: number;
  calories: number;
}

export interface DayPoint {
  date: Date;
  workouts: number;
  volumeLb: number;
  sets: number;
}

export interface PrEvent {
  date: Date;
  workoutId: string;
  exerciseKey: string;
  exerciseName: string;
  type: PrType;
  weightLb: number | null;
  reps: number | null;
  /** The record value: lb for weight/e1rm/volume types, reps for 'reps'. */
  value: number;
  previous: number | null;
}

export interface SessionE1rm {
  workoutId: string;
  date: Date;
  e1rm: number;
  confidence: Confidence;
  weightLb: number;
  reps: number;
}

export interface ExerciseSummary {
  key: string;
  name: string;
  /** Regions credited directly, strongest first. */
  regions: RegionId[];
  sets: number;
  hardSets: number;
  sessions: number;
  firstDate: Date | null;
  lastDate: Date | null;
  volumeLb: number;
  /** Has any set with weight > 0. */
  weighted: boolean;
  bestWeightLb: number | null;
  bestE1rm: number | null;
  latestE1rm: number | null;
  /** Theil–Sen %/month over the last 90 days; null when insufficient. */
  ratePerMonth: number | null;
  status: TrendStatus;
  /** Session e1RMs (or session volume if unweighted), oldest → newest, for sparklines. */
  spark: number[];
  /** Matched in the bundled Motra catalog. */
  inCatalog: boolean;
}

export interface RepMaxRow {
  reps: number;
  /** Heaviest weight actually lifted for at least this many reps. */
  actualLb: number | null;
  actualDate: Date | null;
  /** Predicted from current best e1RM via inverse Epley. */
  predictedLb: number | null;
}

export interface ExerciseSessionRow {
  workoutId: string;
  date: Date;
  sets: { weightLb: number | null; reps: number | null; e1rm: number | null; hard: boolean; restSec: number | null; durationSec: number | null }[];
  volumeLb: number;
  bestE1rm: number | null;
  topWeightLb: number | null;
  prTypes: PrType[];
}

export interface ExerciseDetail extends ExerciseSummary {
  muscleRaw: string[];
  /** Secondary regions from the catalog with credit (0.5) — empty when not in catalog. */
  secondaryRegions: RegionId[];
  delts: DeltHead[];
  sessionsE1rm: SessionE1rm[];
  /** EWMA (21-day half-life) through sessionsE1rm. */
  trend: SeriesPoint[];
  /** Running all-time max e1RM (step). */
  prEnvelope: SeriesPoint[];
  /** Session volume (Σ w·r). */
  sessionVolume: SeriesPoint[];
  /** Heaviest set weight per session. */
  topWeight: SeriesPoint[];
  prs: PrEvent[];
  repMax: RepMaxRow[];
  /** Every formula applied to the best recent set (Detailed). */
  formulas: { name: string; key: Exclude<OneRmFormula, 'auto'>; value: number }[] | null;
  formulasBasis: { weightLb: number; reps: number; date: Date } | null;
  deltas: { d30: number | null; d90: number | null; d365: number | null };
  medianRestSec: number | null;
  medianSecPerRep: number | null;
  /** Mean within-session rep drop-off (0..1) for sessions with ≥3 sets at the same weight. */
  fatigueDropoff: number | null;
  /** Share of hard sets in %e1RM zones: <60, 60–70, 70–80, 80–90, ≥90. */
  intensityZones: number[];
  /** Rep-range mix of hard sets: 1–5, 6–12, 13–20, 21+. */
  repRanges: number[];
  history: ExerciseSessionRow[];
  /** Relative strength vs bodyweight when available. */
  relative: StrengthLift | null;
}

export interface MuscleSummary {
  region: RegionId;
  name: string;
  /** Hard sets (direct credit) in the 7 days ending at window end. */
  weeklySets: number;
  /** Direct + secondary credit for the same 7 days. */
  weeklyFractional: number;
  /** Mean weekly direct hard sets over the 4 weeks ending at window end. */
  avgWeeklySets4w: number;
  band: VolumeBand;
  /** Direct hard sets over the whole window. */
  windowSets: number;
  /** Σ w·r attributed (split across multiple primaries) over the window. */
  volumeLb: number;
  /** Mean days/week with ≥1 hard set, 4 weeks ending at window end. */
  frequencyPerWeek: number;
  lastTrained: Date | null;
  topExercises: { key: string; name: string; sets: number }[];
  /** Raw labels that resolved into this region (essential for 'other'). */
  rawLabels: string[];
}

export interface MuscleDetail extends MuscleSummary {
  weekly: { weekStart: Date; sets: number; fractional: number; volumeLb: number }[];
  exercises: ExerciseSummary[];
  /** Normalized e1RM progress of this muscle's weighted exercises: mean of (session e1RM / first e1RM in window) per week. */
  strengthIndex: SeriesPoint[];
  recentPrs: PrEvent[];
  /** Muscles most often trained in the same session (co-occurrence share 0..1). */
  pairedWith: { region: RegionId; share: number }[];
}

export interface BalanceRatios {
  /** Each is [a, b] weekly fractional sets over the trailing 8 weeks; UI shows a:b. */
  pushPull: [number, number];
  quadHam: [number, number];
  upperLower: [number, number];
  anteriorPosterior: [number, number];
}

export type StrengthLevel = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export interface StrengthLift {
  exerciseKey: string;
  name: string;
  e1rmLb: number;
  ratio: number;
  /** null when sex unspecified or below beginner. */
  level: StrengthLevel | null;
  nextLevel: StrengthLevel | null;
  /** 0..1 progress from level to nextLevel. */
  progress: number | null;
}

export interface StrengthProfile {
  bodyweightLb: number | null;
  lifts: StrengthLift[];
  /** Estimated from e1RMs; null unless bodyweight+sex set and lifts present. */
  dots: { value: number; basis: 'total' | 'bench' } | null;
  ipfGl: { value: number; basis: 'total' | 'bench' } | null;
  wilks: number | null;
  bmi: number | null;
}

export interface WorkoutSummary {
  workout: Workout;
  date: Date | null;
  durationSec: number | null;
  sets: number;
  hardSets: number;
  volumeLb: number;
  exercises: number;
  topRegions: RegionId[];
  prCount: number;
  /** lb per minute. */
  density: number | null;
  kcalPerMin: number | null;
}

export interface WorkoutDetail extends WorkoutSummary {
  blocks: {
    exerciseKey: string;
    name: string;
    regions: RegionId[];
    sets: EnrichedSet[];
    volumeLb: number;
    bestE1rm: number | null;
    prs: PrEvent[];
  }[];
  /** Region → direct hard sets this session. */
  regionSets: Partial<Record<RegionId, number>>;
  hrZonesSec: number[] | null;
  /** Rest seconds between sets in order, excluding block starts. */
  restSeries: { index: number; restSec: number }[];
  prs: PrEvent[];
}

export interface OverviewStats {
  window: Window;
  workouts: number;
  sets: number;
  hardSets: number;
  volumeLb: number;
  durationSec: number;
  calories: number;
  avgDurationSec: number | null;
  /** Same metrics for the immediately preceding window of equal length (null for all-time). */
  previous: { workouts: number; hardSets: number; volumeLb: number; durationSec: number } | null;
  workoutsThisWeek: number;
  avgWorkoutsPerWeek4w: number;
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  weekly: WeekPoint[];
  /** Every day in the window (or last 365 days for all-time), zero-filled. */
  days: DayPoint[];
  topLifts: ExerciseSummary[];
  recentPrs: PrEvent[];
  muscles: MuscleSummary[];
  balance: BalanceRatios;
  intensityZones: number[];
  repRanges: number[];
  /** Rest distribution shares: <60, 60–120, 120–180, 180–300, >300 s. */
  restBuckets: number[];
  medianRestSec: number | null;
  /** Weekly mean lb/min. */
  density: SeriesPoint[];
  /** Weekly HR-zone seconds [z1..z5]. */
  hrWeekly: { weekStart: Date; zones: number[] }[];
  effortHistogram: number[] | null;
  /** Acute (7d hard sets) ÷ chronic (28d weekly mean). null if <4 weeks data. */
  loadRatio: number | null;
  newExercises: { key: string; name: string; firstDate: Date }[];
}

/** Precomputed per dataset + settings; pass to every query. */
export interface AnalysisIndex {
  sets: EnrichedSet[];
  workouts: Workout[];
  workoutDates: Map<string, Date | null>;
  /** All PR events over full history (chronological). */
  prs: PrEvent[];
  latestDate: Date | null;
  formula: OneRmFormula;
  bodyweightLb: number | null;
}
