/**
 * Shared data model. Every module (parser, analytics, UI) speaks these types.
 *
 * Units are stored exactly as Motra exports them (pounds, feet, seconds);
 * conversion to kg / m happens only at display time (see Settings.units).
 *
 * Labels: `*Key` fields are normalized identifiers produced by
 * `normalizeKey()` in src/core/labels.ts (lowercase, words joined by single
 * spaces, punctuation other than parentheses/hyphens stripped). Display text
 * always comes from `displayLabel()`; never render a key directly.
 * Unknown/new labels are expected — nothing may assume a closed vocabulary.
 */

/** Local wall-clock timestamp as exported, normalized to `YYYY-MM-DDTHH:mm:ss` (no zone). */
export type LocalIso = string;

export interface SetRecord {
  /** `${workoutId}:${index}` */
  id: string;
  workoutId: string;
  /** 0-based order within the workout. */
  index: number;
  exerciseKey: string;
  /** Exercise name exactly as it appeared in the file. */
  exerciseRaw: string;
  weightLb: number | null;
  reps: number | null;
  /** Time under tension / set duration in seconds. */
  durationSec: number | null;
  distanceFt: number | null;
  /** Rest taken before this set, seconds (Motra reports 0 for the first set). */
  restSec: number | null;
  /** Numeric effort if the cell parsed as a number, else null. */
  effort: number | null;
  /** Raw effort cell text when non-empty ('' and 'N/A' become null). */
  effortRaw: string | null;
  /** Normalized muscle keys; a cell may list several (comma/semicolon/slash/'&' separated). */
  muscleKeys: string[];
  /** Raw "Primary Muscle Groups" cell. */
  muscleRaw: string;
  note: string | null;
  /** Any columns not recognized, keyed by the header text. */
  extra: Record<string, string | number | null>;
}

export interface Workout {
  /** Stable across re-imports: hash of start timestamp + title. */
  id: string;
  title: string;
  start: LocalIso | null;
  end: LocalIso | null;
  durationSec: number | null;
  /** As reported in the summary block (may disagree with sets.length). */
  totalSets: number | null;
  calories: number | null;
  /** Total volume load as reported by Motra (lbs). */
  tvlLb: number | null;
  effort: number | null;
  effortRaw: string | null;
  /** Seconds spent in heart-rate zones 1..5 (index 0 = zone 1); null if absent. */
  hrZonesSec: number[] | null;
  /** Summary rows that were not recognized, keyed by label. */
  summaryExtra: Record<string, string | number | null>;
  sets: SetRecord[];
  /** File name the workout was imported from. */
  sourceFile: string;
}

export interface ExerciseInfo {
  key: string;
  /** Display name (from displayLabel of the most common raw spelling). */
  name: string;
  rawNames: string[];
  /** Union of muscle keys seen for this exercise, most frequent first. */
  muscleKeys: string[];
}

export interface MuscleInfo {
  key: string;
  name: string;
  rawNames: string[];
}

export interface ParseWarning {
  file: string;
  sheet?: string;
  /** 1-based spreadsheet row when applicable. */
  row?: number;
  message: string;
}

export interface Dataset {
  version: 1;
  /** ISO timestamp (UTC) of the most recent import. */
  importedAt: string;
  /** Sorted by start ascending; workouts without a start sort last. */
  workouts: Workout[];
  exercises: Record<string, ExerciseInfo>;
  muscles: Record<string, MuscleInfo>;
  warnings: ParseWarning[];
  sourceFiles: string[];
}

export type Units = 'lb' | 'kg';
export type ThemePref = 'system' | 'light' | 'dark';
export type DetailLevel = 'normal' | 'detailed';
export type OneRmFormula = 'auto' | 'epley' | 'brzycki' | 'lombardi' | 'mayhew' | 'wathan' | 'oconner';
export type Sex = 'male' | 'female' | 'unspecified';

export interface Settings {
  units: Units;
  theme: ThemePref;
  detail: DetailLevel;
  oneRmFormula: OneRmFormula;
  /** Body weight in lbs (stored in lbs regardless of display units); null when unset. */
  bodyweightLb: number | null;
  /** Height in cm; null when unset. */
  heightCm: number | null;
  sex: Sex;
  /** Birth year for age-adjusted comparisons; null when unset. */
  birthYear: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'lb',
  theme: 'system',
  detail: 'normal',
  oneRmFormula: 'auto',
  bodyweightLb: null,
  heightCm: null,
  sex: 'unspecified',
  birthYear: null,
};
