import { describe, expect, it } from 'vitest';
import { buildDataset } from '../dataset.ts';
import { normalizeKey } from '../labels.ts';
import { DEFAULT_SETTINGS, type Dataset, type SetRecord, type Settings, type Workout } from '../types.ts';
import {
  buildIndex,
  estimateE1rm,
  exerciseDetail,
  exerciseSummaries,
  muscleDetail,
  muscleSummaries,
  oneRmFormulas,
  overviewStats,
  strengthProfile,
  workoutDetail,
  workoutSummaries,
  type PrType,
  type Window,
} from './index.ts';
import { volumeBand } from './muscles.ts';
import { dotsCoefficient, LB_TO_KG, wilksCoefficient } from './strength.ts';

interface SetSpec {
  ex: string;
  w: number | null;
  r: number | null;
  muscles?: string[];
  effort?: number | null;
  rest?: number | null;
  dur?: number | null;
}

function workout(id: string, start: string, specs: SetSpec[], extra: Partial<Workout> = {}): Workout {
  const sets: SetRecord[] = specs.map((s, i) => ({
    id: `${id}:${i}`,
    workoutId: id,
    index: i,
    exerciseKey: normalizeKey(s.ex),
    exerciseRaw: s.ex,
    weightLb: s.w,
    reps: s.r,
    durationSec: s.dur ?? null,
    distanceFt: null,
    restSec: s.rest ?? null,
    effort: s.effort ?? null,
    effortRaw: s.effort == null ? null : String(s.effort),
    muscleKeys: (s.muscles ?? ['chest']).map(normalizeKey),
    muscleRaw: (s.muscles ?? ['chest']).join(', '),
    note: null,
    extra: {},
  }));
  return {
    id,
    title: id,
    start,
    end: null,
    durationSec: 3600,
    totalSets: sets.length,
    calories: 300,
    tvlLb: null,
    effort: null,
    effortRaw: null,
    hrZonesSec: null,
    summaryExtra: {},
    sets,
    sourceFile: 'test.xlsx',
    ...extra,
  };
}

function dataset(workouts: Workout[]): Dataset {
  return buildDataset({ workouts, warnings: [], sourceFiles: ['test.xlsx'] });
}

const ALL: Window = { start: null, end: new Date(2026, 11, 31, 23, 59, 59, 999) };

function isoDay(base: Date, plusDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + plusDays, 18);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00:00`;
}

describe('e1RM', () => {
  const fn = (key: string) => oneRmFormulas.find((f) => f.key === key)!.fn;

  it('matches the research §3.1 example (100 × 6)', () => {
    expect(fn('epley')(100, 6)).toBeCloseTo(120.0, 1);
    expect(fn('brzycki')(100, 6)).toBeCloseTo(116.1, 1);
    expect(fn('wathan')(100, 6)).toBeCloseTo(120.3, 1);
    expect(fn('mayhew')(100, 6)).toBeCloseTo(121.5, 1);
    expect(fn('lombardi')(100, 6)).toBeCloseTo(119.6, 1);
    expect(fn('oconner')(100, 6)).toBeCloseTo(115.0, 1);
    for (const f of oneRmFormulas) expect(f.fn(100, 1)).toBe(100);
  });

  it('auto mode picks the formula by effective reps', () => {
    expect(estimateE1rm(100, 1, null, 'auto')).toMatchObject({ value: 100, confidence: 'high', formula: 'actual' });
    const six = estimateE1rm(100, 6, null, 'auto')!;
    expect(six.formula).toBe('blend');
    expect(six.value).toBeCloseTo((120 + 3600 / 31) / 2, 6);
    expect(estimateE1rm(100, 12, null, 'auto')).toMatchObject({ confidence: 'medium', formula: 'wathan' });
    expect(estimateE1rm(100, 16, null, 'auto')).toBeNull();
    expect(estimateE1rm(0, 5, null, 'auto')).toBeNull();
    expect(estimateE1rm(100, 0, null, 'auto')).toBeNull();
  });

  it('adds reps in reserve from effort ≥ 6 only', () => {
    const rpe8 = estimateE1rm(100, 6, 8, 'auto')!;
    expect(rpe8.effectiveReps).toBe(8);
    expect(rpe8.value).toBeCloseTo((100 * (1 + 8 / 30) + 3600 / 29) / 2, 6);
    expect(estimateE1rm(100, 6, 5, 'auto')!.effectiveReps).toBe(6);
    expect(estimateE1rm(100, 6, 2, 'auto')!.effectiveReps).toBe(6);
    // rir is capped at 4: 13 + 4 = 17 > 15.
    expect(estimateE1rm(100, 13, 6, 'auto')).toBeNull();
  });

  it('uses a chosen formula up to 15 effective reps', () => {
    expect(estimateE1rm(100, 6, null, 'epley')!.value).toBeCloseTo(120, 6);
    expect(estimateE1rm(100, 15, null, 'brzycki')!.confidence).toBe('medium');
    expect(estimateE1rm(100, 16, null, 'epley')).toBeNull();
  });
});

describe('PR detection', () => {
  const bench = (w: number, r: number): SetSpec => ({ ex: 'Barbell Bench Press', w, r });
  const ds = dataset([
    workout('w1', '2026-01-05T18:00:00', [bench(100, 5), bench(100, 5)]),
    workout('w2', '2026-01-12T18:00:00', [bench(105, 5)]),
    workout('w3', '2026-01-19T18:00:00', [bench(100, 8)]),
    workout('w4', '2026-01-26T18:00:00', [bench(90, 6)]),
  ]);
  const idx = buildIndex(ds, DEFAULT_SETTINGS);
  const types = (id: string): PrType[] => idx.prs.filter((p) => p.workoutId === id).map((p) => p.type);

  it('treats the first session as baseline', () => {
    expect(types('w1')).toEqual([]);
  });

  it('detects weight PRs against all earlier sets', () => {
    const weight = idx.prs.find((p) => p.workoutId === 'w2' && p.type === 'weight');
    expect(weight).toMatchObject({ value: 105, previous: 100, exerciseName: 'Barbell Bench Press' });
    expect(types('w2')).not.toContain('reps');
  });

  it('detects Pareto rep PRs and ignores dominated sets', () => {
    const reps = idx.prs.find((p) => p.workoutId === 'w3' && p.type === 'reps');
    expect(reps).toMatchObject({ value: 8, previous: 5, weightLb: 100 });
    expect(types('w3')).toContain('e1rm');
    expect(types('w4')).toEqual([]);
  });

  it('feeds PR counts into workout summaries', () => {
    const w3 = workoutSummaries(idx, ALL).find((w) => w.workout.id === 'w3')!;
    expect(w3.prCount).toBe(types('w3').length);
  });
});

describe('trend status (Theil–Sen)', () => {
  const base = new Date(2026, 0, 5);
  const series = (ex: string, weight: (i: number) => number, n = 8): Workout[] =>
    Array.from({ length: n }, (_, i) => workout(`${ex}${i}`, isoDay(base, i * 7), [{ ex, w: weight(i), r: 5 }]));
  const ds = dataset([
    ...series('Up Press', (i) => 100 + 5 * i),
    ...series('Flat Press', () => 100),
    ...series('Down Press', (i) => 140 - 5 * i),
    ...series('Short Press', (i) => 100 + i, 2),
  ]);
  const idx = buildIndex(ds, DEFAULT_SETTINGS);
  const win: Window = { start: null, end: new Date(2026, 1, 25, 23, 59, 59) };
  const byKey = new Map(exerciseSummaries(idx, win).map((e) => [e.key, e]));

  it('labels progressing, plateau, dip and insufficient', () => {
    expect(byKey.get('up press')!.status).toBe('progressing');
    expect(byKey.get('up press')!.ratePerMonth!).toBeGreaterThan(1);
    expect(byKey.get('flat press')!.status).toBe('plateau');
    expect(byKey.get('flat press')!.ratePerMonth).toBeCloseTo(0, 6);
    expect(byKey.get('down press')!.status).toBe('dip');
    expect(byKey.get('short press')!.status).toBe('insufficient');
    expect(byKey.get('short press')!.ratePerMonth).toBeNull();
  });
});

describe('muscle volume', () => {
  it('bands weekly sets per research §2.1', () => {
    expect(volumeBand(0)).toBe('none');
    expect(volumeBand(4.5)).toBe('low');
    expect(volumeBand(5)).toBe('moderate');
    expect(volumeBand(9.5)).toBe('moderate');
    expect(volumeBand(10)).toBe('target');
    expect(volumeBand(20)).toBe('target');
    expect(volumeBand(21)).toBe('high');
  });

  it('counts hard sets per region, excluding warm-ups, with full credit per listed muscle', () => {
    const chest: SetSpec[] = [{ ex: 'Barbell Bench Press', w: 40, r: 10 }];
    for (let i = 0; i < 12; i++) chest.push({ ex: 'Barbell Bench Press', w: 100, r: 8 });
    const dl: SetSpec[] = [{ ex: 'Barbell Deadlift', w: 200, r: 5, muscles: ['glutes', 'hamstrings', 'lowerBack'] }];
    const ds = dataset([workout('a', '2026-03-02T18:00:00', chest), workout('b', '2026-03-04T18:00:00', dl)]);
    const idx = buildIndex(ds, DEFAULT_SETTINGS);
    const win: Window = { start: new Date(2026, 1, 6), end: new Date(2026, 2, 5, 23, 59, 59, 999) };
    const muscles = new Map(muscleSummaries(idx, win).map((m) => [m.region, m]));
    expect(muscles.get('chest')).toMatchObject({ weeklySets: 12, band: 'target' });
    expect(muscles.get('glutes')!.weeklySets).toBe(1);
    expect(muscles.get('lowerBack')!.weeklySets).toBe(1);
    // Catalog secondaries (bench: triceps 7, shoulders 6) count 0.5 in fractional sets.
    expect(muscles.get('triceps')!.weeklyFractional).toBe(6);
    // Every drawn region is listed; undrawn buckets only with data.
    expect(muscles.has('calves')).toBe(true);
    expect(muscles.has('other')).toBe(false);
    expect(muscleDetail(idx, 'chest', win)!.exercises.map((e) => e.key)).toEqual(['barbell bench press']);
  });
});

describe('strength scores', () => {
  it('uses the OpenPowerlifting coefficients', () => {
    expect(wilksCoefficient(100, 'male')).toBeCloseTo(0.6085890719, 8);
    expect(wilksCoefficient(100, 'female')).toBeCloseTo(0.8325833167, 8);
    expect(dotsCoefficient(100, 'male')).toBeCloseTo(0.6155157646, 8);
  });

  it('computes a bench-only DOTS when squat/deadlift are missing', () => {
    const bw = 100 / LB_TO_KG;
    const ds = dataset([workout('a', '2026-03-02T18:00:00', [{ ex: 'Barbell Bench Press', w: bw, r: 1 }])]);
    const settings: Settings = { ...DEFAULT_SETTINGS, bodyweightLb: bw, sex: 'male', heightCm: 200 };
    const profile = strengthProfile(buildIndex(ds, settings), settings);
    expect(profile.dots!.basis).toBe('bench');
    expect(profile.dots!.value).toBeCloseTo(100 * 0.6155157646, 4);
    expect(profile.wilks).toBeNull();
    expect(profile.bmi).toBeCloseTo(25, 6);
    expect(profile.lifts[0]).toMatchObject({ ratio: 1, level: 'novice', nextLevel: 'intermediate' });
  });
});

describe('sparse data', () => {
  function assertClean(value: unknown, path = 'root'): void {
    if (value === undefined) throw new Error(`undefined at ${path}`);
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${value} at ${path}`);
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw new Error(`invalid date at ${path}`);
      return;
    }
    if (Array.isArray(value)) value.forEach((v, i) => assertClean(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) assertClean(v, `${path}.${k}`);
  }

  it('one workout yields no NaN/Infinity/undefined anywhere', () => {
    const ds = dataset([
      workout('only', '2026-10-20T07:30:00', [
        { ex: 'Barbell Bench Press', w: 135, r: 8, rest: 0, dur: 25 },
        { ex: 'Barbell Bench Press', w: 135, r: 7, rest: 120, dur: 24 },
        { ex: 'Push Up', w: 0, r: 20, muscles: [] },
        { ex: 'Mystery Move', w: null, r: null, muscles: ['n/a'] },
      ], { durationSec: null, calories: null }),
    ]);
    const settings: Settings = { ...DEFAULT_SETTINGS, bodyweightLb: 180, sex: 'female' };
    const idx = buildIndex(ds, settings);
    const win: Window = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 20, 23, 59, 59, 999) };
    const all: Window = { start: null, end: win.end };
    for (const w of [win, all]) {
      const o = overviewStats(idx, w);
      assertClean(o);
      expect(o.workouts).toBe(1);
      expect(o.previous === null).toBe(w.start === null);
      expect(o.loadRatio).toBeNull();
      assertClean(muscleSummaries(idx, w));
      assertClean(muscleDetail(idx, 'chest', w));
      assertClean(muscleDetail(idx, 'other', w));
      for (const e of exerciseSummaries(idx, w)) assertClean(exerciseDetail(idx, e.key, w, settings));
      assertClean(workoutSummaries(idx, w));
    }
    assertClean(workoutDetail(idx, 'only'));
    assertClean(strengthProfile(idx, settings));
    expect(workoutDetail(idx, 'missing')).toBeNull();
    expect(exerciseDetail(idx, 'missing', win, settings)).toBeNull();
  });
});
