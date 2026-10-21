import { describe, expect, it } from 'vitest';
import { buildDataset } from './dataset.ts';
import type { ParseWarning, SetRecord, Workout } from './types.ts';

function set(workoutId: string, index: number, exerciseRaw: string, muscleRaw: string, muscleKeys: string[]): SetRecord {
  return {
    id: `${workoutId}:${index}`,
    workoutId,
    index,
    exerciseKey: exerciseRaw.toLowerCase(),
    exerciseRaw,
    weightLb: 100,
    reps: 5,
    durationSec: null,
    distanceFt: null,
    restSec: null,
    effort: null,
    effortRaw: null,
    muscleKeys,
    muscleRaw,
    note: null,
    extra: {},
  };
}

function workout(id: string, start: string | null, sets: [string, string, string[]][] = [], title = id): Workout {
  return {
    id,
    title,
    start,
    end: null,
    durationSec: null,
    totalSets: sets.length,
    calories: null,
    tvlLb: null,
    effort: null,
    effortRaw: null,
    hrZonesSec: null,
    summaryExtra: {},
    sets: sets.map(([ex, mr, mk], i) => set(id, i, ex, mr, mk)),
    sourceFile: 'a.xlsx',
  };
}

const warn = (file: string, message: string): ParseWarning => ({ file, message });

describe('buildDataset', () => {
  it('builds a fresh dataset sorted by start with undated workouts last', () => {
    const d = buildDataset({
      workouts: [
        workout('c', null),
        workout('b', '2026-10-02T08:00:00'),
        workout('a', '2026-10-01T08:00:00'),
      ],
      warnings: [],
      sourceFiles: ['a.xlsx'],
    });
    expect(d.version).toBe(1);
    expect(d.workouts.map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(d.sourceFiles).toEqual(['a.xlsx']);
    expect(Number.isNaN(Date.parse(d.importedAt))).toBe(false);
  });

  it('merges with the previous dataset, newer import winning on id clashes', () => {
    const previous = buildDataset({
      workouts: [workout('a', '2026-10-01T08:00:00', [], 'Old title'), workout('b', '2026-10-02T08:00:00')],
      warnings: [warn('a.xlsx', 'old a'), warn('b.xlsx', 'old b')],
      sourceFiles: ['a.xlsx', 'b.xlsx'],
    });
    const d = buildDataset(
      {
        workouts: [workout('a', '2026-10-01T08:00:00', [], 'New title'), workout('z', '2026-09-30T08:00:00')],
        warnings: [warn('a.xlsx', 'new a')],
        sourceFiles: ['a.xlsx', 'c.xlsx'],
      },
      previous,
    );
    expect(d.workouts.map((w) => w.id)).toEqual(['z', 'a', 'b']);
    expect(d.workouts.find((w) => w.id === 'a')?.title).toBe('New title');
    expect(d.sourceFiles).toEqual(['a.xlsx', 'b.xlsx', 'c.xlsx']);
    expect(d.warnings.map((w) => w.message)).toEqual(['new a', 'old b']);
  });

  it('treats a null previous dataset as empty', () => {
    const d = buildDataset({ workouts: [workout('a', null)], warnings: [], sourceFiles: ['a.xlsx'] }, null);
    expect(d.workouts).toHaveLength(1);
  });

  it('indexes exercises and muscles by frequency', () => {
    const d = buildDataset({
      workouts: [
        workout('w1', '2026-10-01T08:00:00', [
          ['barbell row', 'Lats, Biceps', ['lats', 'biceps']],
          ['Barbell Row', 'lats', ['lats']],
          ['Barbell Row', 'Lats & lower_back', ['lats', 'lower back']],
        ]),
      ],
      warnings: [],
      sourceFiles: ['a.xlsx'],
    });
    const row = d.exercises['barbell row'];
    expect(row.name).toBe('Barbell Row');
    expect(row.rawNames).toEqual(['Barbell Row', 'barbell row']);
    expect(row.muscleKeys).toEqual(['lats', 'biceps', 'lower back']);
    expect(Object.keys(d.muscles).sort()).toEqual(['biceps', 'lats', 'lower back']);
    expect(d.muscles['lats'].rawNames).toEqual(['Lats', 'lats']);
    expect(d.muscles['lats'].name).toBe('Lats');
    expect(d.muscles['lower back'].name).toBe('Lower Back');
  });

  it('caps warnings at 200', () => {
    const warnings = Array.from({ length: 250 }, (_, i) => warn('a.xlsx', `w${i}`));
    expect(buildDataset({ workouts: [], warnings, sourceFiles: ['a.xlsx'] }).warnings).toHaveLength(200);
  });
});
