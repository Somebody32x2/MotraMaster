/**
 * Dataset assembly: merges freshly parsed workouts into the stored dataset
 * and rebuilds the exercise / muscle indexes.
 *
 * Runtime imports carry explicit `.ts` extensions so Node can load this
 * module directly (see scripts/catalog.ts).
 */
import { compareLabels, displayLabel, normalizeKey, splitMuscles } from './labels.ts';
import type { Dataset, ExerciseInfo, MuscleInfo, ParseWarning, Workout } from './types.ts';

const MAX_WARNINGS = 200;

/** Keys sorted by descending count, ties broken alphabetically for stable output. */
function byFrequency(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || compareLabels(a[0], b[0]))
    .map(([key]) => key);
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function compareWorkouts(a: Workout, b: Workout): number {
  if (a.start === b.start) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (a.start === null) return 1;
  if (b.start === null) return -1;
  return a.start < b.start ? -1 : 1;
}

/**
 * Merge newly parsed workouts into `previous` (deduplicated by Workout.id;
 * the new import wins) and rebuild the derived indexes.
 */
export function buildDataset(
  input: { workouts: Workout[]; warnings: ParseWarning[]; sourceFiles: string[] },
  previous?: Dataset | null,
): Dataset {
  const byId = new Map<string, Workout>();
  for (const w of previous?.workouts ?? []) byId.set(w.id, w);
  for (const w of input.workouts) byId.set(w.id, w);
  const workouts = [...byId.values()].sort(compareWorkouts);

  const exerciseRaw = new Map<string, Map<string, number>>();
  const exerciseMuscles = new Map<string, Map<string, number>>();
  const muscleRaw = new Map<string, Map<string, number>>();

  for (const w of workouts) {
    for (const s of w.sets) {
      if (!s.exerciseKey) continue;
      let raws = exerciseRaw.get(s.exerciseKey);
      if (!raws) exerciseRaw.set(s.exerciseKey, (raws = new Map()));
      bump(raws, s.exerciseRaw);
      let muscles = exerciseMuscles.get(s.exerciseKey);
      if (!muscles) exerciseMuscles.set(s.exerciseKey, (muscles = new Map()));
      for (const m of s.muscleKeys) bump(muscles, m);

      // Raw muscle spellings: re-split the cell and attribute each part to its key.
      for (const part of splitMuscles(s.muscleRaw)) {
        const key = normalizeKey(part);
        if (!s.muscleKeys.includes(key)) continue;
        let mr = muscleRaw.get(key);
        if (!mr) muscleRaw.set(key, (mr = new Map()));
        bump(mr, part);
      }
      for (const key of s.muscleKeys) {
        if (!muscleRaw.has(key)) muscleRaw.set(key, new Map([[key, 1]]));
      }
    }
  }

  const exercises: Record<string, ExerciseInfo> = {};
  for (const [key, raws] of exerciseRaw) {
    const rawNames = byFrequency(raws);
    exercises[key] = {
      key,
      name: displayLabel(rawNames[0] ?? key),
      rawNames,
      muscleKeys: byFrequency(exerciseMuscles.get(key) ?? new Map()),
    };
  }

  const muscles: Record<string, MuscleInfo> = {};
  for (const [key, raws] of muscleRaw) {
    const rawNames = byFrequency(raws);
    muscles[key] = { key, name: displayLabel(rawNames[0] ?? key), rawNames };
  }

  // Warnings from a file being re-imported are superseded by the fresh parse.
  const reimported = new Set(input.sourceFiles);
  const kept = (previous?.warnings ?? []).filter((w) => !reimported.has(w.file));
  const warnings = [...input.warnings, ...kept].slice(0, MAX_WARNINGS);
  const sourceFiles = [...new Set([...(previous?.sourceFiles ?? []), ...input.sourceFiles])];

  return {
    version: 1,
    importedAt: new Date().toISOString(),
    workouts,
    exercises,
    muscles,
    warnings,
    sourceFiles,
  };
}
