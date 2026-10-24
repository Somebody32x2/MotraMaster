/**
 * Analytics contract. Implementations live beside this file; pages consume
 * only these shapes. All weights are pounds (display conversion is the UI's
 * job). All dates are local `Date`s built from Workout.start.
 *
 * See docs/research.md for the definitions behind every number.
 */
import type { OneRmFormula, StrengthMetric, Workout } from '../types';
export type { StrengthMetric } from '../types';

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
/** 'hold' = longest timed hold (value in seconds). */
export type PrType = 'weight' | 'reps' | 'e1rm' | 'setVolume' | 'sessionVolume' | 'hold';

/**
 * How an exercise is measured.
 * - weighted: external load (barbell, machine, dumbbell…).
 * - bodyweight: the body is (part of) the load — dips, pull-ups, push-ups, assisted machines; sit-ups/crunches too, but those have no bodyweight factor and progress by reps.
 * - timed: holds (plank, dead hang, wall sit) — progress by hold time; added weight is tracked alongside.
 */
export type ExerciseKind = 'weighted' | 'bodyweight' | 'timed';

/**
 * How a set's effective load (`loadLb`) was derived from the logged weight.
 * - external: logged weight as-is (weighted exercises).
 * - bodyweightAdded: logged weight was 0 or below half bodyweight → factor × bodyweight + logged weight.
 * - bodyweightIncluded: logged weight ≥ half bodyweight → assumed to already include bodyweight; used as-is.
 * - assisted: assisted machine → factor × bodyweight − logged assistance.
 * - bodyweightUnknown: bodyweight exercise but no bodyweight in Settings → logged weight as-is (null when 0).
 * - none: nothing to compute (no weight on a reps-only/timed exercise).
 */
export type LoadBasis = 'external' | 'bodyweightAdded' | 'bodyweightIncluded' | 'assisted' | 'bodyweightUnknown' | 'none';

/**
 * Rule that decided whether a set is hard (research §4.1):
 * effort / easy = logged effort ≥ 6 / < 6; load / light = at least / under 60% of the
 * exercise's top load in the workout; bodyweight = reps without a load to compare;
 * hold / shortHold = timed hold ≥ 10 s / shorter; drop = detected drop set;
 * notPerformed = no reps or time (or a distance-only cardio row).
 */
export type HardReason = 'effort' | 'easy' | 'load' | 'light' | 'bodyweight' | 'hold' | 'shortHold' | 'drop' | 'notPerformed';

export interface ExerciseLoadModel {
  kind: ExerciseKind;
  /** Share of bodyweight moved (dips/pull-ups 1, push-ups ≈ 0.64); null when bodyweight isn't counted as load. */
  bodyweightFactor: number | null;
  assisted: boolean;
  /** Why it was classified this way (e.g. 'name matches "pull-up"', 'most sets have time but no reps'), for the UI note. */
  reason: string;
}

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
  /** Working-set heuristic (research §4.1): taken with real effort. False for warm-ups and unperformed rows. */
  hard: boolean;
  /** Which rule decided `hard`. */
  hardReason: HardReason;
  /** Hard sets this set adds to every count: 0 when not hard, 1 for a working set, the drop-set setting for a drop. */
  credit: number;
  /** Detected drop: a lighter set of the same exercise straight after the previous one (research §4.1). */
  drop: boolean;
  /** Effective load ÷ the exercise's heaviest load in this workout; null without a load. */
  pctOfTop: number | null;
  /** First set of an exercise block within the workout (its rest includes changeover). */
  firstOfBlock: boolean;
  /** Effective load × reps (0 when either is missing). */
  volumeLb: number;
  /** e1RM from the effective load. */
  e1rm: E1rmEstimate | null;
  /** Effective load per the exercise's load model; weightLb remains the logged value. */
  loadLb: number | null;
  loadBasis: LoadBasis;
  /** Hold time for timed exercises (durationSec), else null. */
  holdSec: number | null;
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

/** A session's headline strength value under the active StrengthMetric. */
export interface SessionStrength {
  workoutId: string;
  date: Date;
  /** e1RM (metric 'e1rm') or the set's weight (metric 'actual'). */
  value: number;
  /** The set that produced `value`: for 'actual', the heaviest set (ties → most reps). */
  weightLb: number;
  reps: number;
  e1rm: number | null;
  /** e1RM confidence; null for 'actual'. */
  confidence: Confidence | null;
  /** Timed exercises: the hold in seconds (`value` is then this hold, `weightLb` the load held). */
  holdSec: number | null;
  /** How weightLb (the effective load) was derived. */
  loadBasis: LoadBasis;
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
  /** Metric the strength fields below (and ratePerMonth/status/spark) are computed with. */
  metric: StrengthMetric;
  /** Latest/best session value under `metric`, with the set behind it. */
  latestStrength: SessionStrength | null;
  bestStrength: SessionStrength | null;
  /** Theil–Sen %/month over the last 90 days of the `metric` series; null when insufficient. */
  ratePerMonth: number | null;
  status: TrendStatus;
  /** Session values under `metric` (or total session reps if unweighted), oldest → newest, for sparklines. */
  spark: number[];
  /** Matched in the bundled Motra catalog. */
  inCatalog: boolean;
  load: ExerciseLoadModel;
  /** Unit of latestStrength/bestStrength.value and spark: 'lb' (load), 'sec' (holds), 'reps' (reps-only bodyweight work). */
  valueUnit: 'lb' | 'sec' | 'reps';
  /** Longest hold in the window (timed exercises; null otherwise). */
  bestHoldSec: number | null;
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
  sets: { weightLb: number | null; loadLb: number | null; loadBasis: LoadBasis; reps: number | null; e1rm: number | null; hard: boolean; hardReason: HardReason; credit: number; drop: boolean; pctOfTop: number | null; effort: number | null; restSec: number | null; durationSec: number | null; holdSec: number | null }[];
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
  /** Session points under the active metric (what the progress chart plots). */
  sessionsStrength: SessionStrength[];
  /** EWMA (21-day half-life) through sessionsStrength. */
  trend: SeriesPoint[];
  /** Running all-time max of sessionsStrength (step). */
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
  /** Latest session e1RM vs the nearest session at/before 30/90/365 days earlier, as a fraction (0.05 = +5%). */
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

/** A set as it counts toward one muscle: `credit` = set credit × the muscle's share (0 when not counted). */
export interface CountedSet {
  set: EnrichedSet;
  credit: number;
}

/** One exercise's contribution to a muscle over a span. */
export interface MuscleWeekExercise {
  key: string;
  name: string;
  /** 'direct' = the muscle is a primary mover; 'secondary' = catalog secondary at half credit. */
  role: 'direct' | 'secondary';
  /** Σ credit over the sets below. */
  sets: number;
  /** Workouts in date order, each with every logged set of this exercise (warm-ups included, at 0). */
  sessions: { workoutId: string; date: Date; sets: CountedSet[] }[];
}

/** What made up a muscle's set count over [start, end]. */
export interface MuscleWeek {
  region: RegionId;
  start: Date;
  end: Date;
  /** Direct hard sets; equals MuscleSummary.weeklySets for the trailing 7 days. */
  sets: number;
  /** Direct + secondary; equals MuscleSummary.weeklyFractional for the trailing 7 days. */
  fractional: number;
  /** Direct contributors first, each group by credit (most first). */
  exercises: MuscleWeekExercise[];
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
  /** Effective duration: raw duration minus trimmed idle time (equals raw when trimming is off or not triggered). */
  durationSec: number | null;
  /** Duration as Motra reported it (Total Duration, else end − start). */
  rawDurationSec: number | null;
  /** Idle seconds removed after the last set; 0 when nothing was trimmed. */
  trimmedSec: number;
  sets: number;
  hardSets: number;
  volumeLb: number;
  exercises: number;
  topRegions: RegionId[];
  prCount: number;
  /** lb per minute of effective duration. */
  density: number | null;
  /** Calories ÷ raw duration minutes (calories include the idle time, so the raw duration is the honest divisor). */
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
  /** Idle time trimmed from workouts in the window, and how many workouts were trimmed. */
  trimmedSec: number;
  trimmedWorkouts: number;
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
  strengthMetric: StrengthMetric;
  /** Idle trimming in effect; graceSec = trimGraceMin × 60. */
  trim: { enabled: boolean; graceSec: number };
  /** Hard-set credit per drop (Settings.dropSetCredit). */
  dropSetCredit: number;
}

/** Per-day metrics the calendar can color by. All per-day values sum/average over that day's workouts. */
export type DayMetric =
  | 'workouts' | 'volume' | 'duration' | 'density' | 'hardSets'
  | 'calories' | 'kcalPerMin' | 'avgRest' | 'exercises' | 'startHour';

export interface CalendarDay {
  /** Local midnight. */
  date: Date;
  workoutIds: string[];
  /** null when no workout that day (or metric unavailable, e.g. no calories). */
  metrics: Record<DayMetric, number | null>;
  /** Regions with the most direct hard sets that day, strongest first (≤3). */
  topRegions: RegionId[];
}

export interface WeekdayStat {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** Workouts that started on this weekday in the window. */
  workouts: number;
  /** Share of all workouts in the window (0..1). */
  share: number;
  /** Fraction of this weekday's calendar days in the window that had a workout (0..1). */
  hitRate: number;
  /** Mean of each DayMetric over days with a workout on this weekday. */
  avg: Record<DayMetric, number | null>;
  /** Regions most trained on this weekday by direct hard sets (≤3). */
  topRegions: RegionId[];
}

export interface CalendarStats {
  window: Window;
  /** Every calendar day from window start (or first workout for all-time) to window end, chronological. */
  days: CalendarDay[];
  weekdays: WeekdayStat[];
  /** Workouts by local start hour, index 0..23. */
  hours: number[];
  /** 7 × 24 counts, [weekday Mon=0][hour]. */
  weekdayHour: number[][];
}
