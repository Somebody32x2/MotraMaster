import { describe, expect, it } from 'vitest';
import { buildDataset } from '../dataset.ts';
import { normalizeKey } from '../labels.ts';
import { DEFAULT_SETTINGS, type Dataset, type SetRecord, type Settings, type Workout } from '../types.ts';
import {
  buildIndex,
  calendarStats,
  effectiveLoad,
  estimateE1rm,
  exerciseLoadModel,
  exerciseDetail,
  exerciseSummaries,
  muscleDetail,
  muscleSummaries,
  muscleWeek,
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
  note?: string;
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
    note: s.note ?? null,
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

describe('drop sets', () => {
  const fly = (w: number, rest: number, extra: Partial<SetSpec> = {}): SetSpec => ({ ex: 'Machine Fly', w, r: 8, rest, ...extra });
  const bench = (w: number, rest: number): SetSpec => ({ ex: 'Barbell Bench Press', w, r: 6, rest });
  // Three straight sets then two quick drops (the last below 60% of the top set), then a
  // bench ramp-up and a slower back-off set that is not a drop.
  const sets: SetSpec[] = [fly(100, 0), fly(100, 120), fly(100, 120), fly(70, 10), fly(50, 8), bench(60, 150), bench(135, 120), bench(115, 150)];
  const day = '2026-03-02T18:00:00';
  const win: Window = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 2, 23, 59, 59, 999) };
  const build = (specs: SetSpec[], settings: Settings = DEFAULT_SETTINGS) => buildIndex(dataset([workout('a', day, specs)]), settings);
  const chestSets = (settings: Settings) => muscleSummaries(build(sets, settings), win).find((m) => m.region === 'chest')!.weeklySets;

  it('flags quick lighter sets of the same exercise and counts them even below 60% of the top set', () => {
    const idx = build(sets);
    expect(idx.sets.map((s) => s.drop)).toEqual([false, false, false, true, true, false, false, false]);
    expect(idx.sets.map((s) => s.hardReason)).toEqual(['load', 'load', 'load', 'drop', 'drop', 'light', 'load', 'load']);
    expect(idx.sets.map((s) => s.credit)).toEqual([1, 1, 1, 0.5, 0.5, 0, 1, 1]);
    expect(workoutSummaries(idx, win)[0].hardSets).toBe(6);
  });

  it('credits each drop per the setting', () => {
    expect(chestSets({ ...DEFAULT_SETTINGS, dropSetCredit: 0 })).toBe(5);
    expect(chestSets(DEFAULT_SETTINGS)).toBe(6);
    expect(chestSets({ ...DEFAULT_SETTINGS, dropSetCredit: 1 })).toBe(7);
  });

  it('needs rest data unless the set is marked, and respects a low logged effort', () => {
    const untimed = build(sets.map((s) => ({ ...s, rest: 0 })));
    expect(untimed.sets.some((s) => s.drop)).toBe(false);
    expect(untimed.sets[4].hardReason).toBe('light');
    const marked = build([fly(100, 0), fly(60, 90, { note: 'Drop set' })]);
    expect(marked.sets[1]).toMatchObject({ drop: true, hardReason: 'drop', credit: 0.5 });
    const easy = build([fly(100, 0), fly(70, 10, { effort: 4 })]);
    expect(easy.sets[1]).toMatchObject({ drop: true, hard: false, hardReason: 'easy', credit: 0 });
  });

  it('traces a muscle’s count to each exercise and set, warm-ups included at zero', () => {
    const week = muscleWeek(build(sets), 'chest', win.start!, win.end);
    expect(week.sets).toBe(6);
    expect(week.exercises.map((e) => [e.key, e.role, e.sets])).toEqual([
      ['machine fly', 'direct', 4],
      ['barbell bench press', 'direct', 2],
    ]);
    expect(week.exercises[1].sessions[0].sets.map((c) => c.credit)).toEqual([0, 1, 1]);
    // Secondary muscles carry half credit from the catalog (bench → triceps).
    const triceps = muscleWeek(build(sets), 'triceps', win.start!, win.end).exercises.find((e) => e.key === 'barbell bench press')!;
    expect(triceps).toMatchObject({ role: 'secondary', sets: 1 });
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
      assertClean(calendarStats(idx, w));
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

describe('idle trimming', () => {
  const timed = (rests: number[], dur = 30): SetSpec[] => rests.map((rest) => ({ ex: 'Barbell Bench Press', w: 100, r: 5, rest, dur }));
  // Active time: 3 × 30 s + 0 + 120 + 120 = 330 s.
  const tail = workout('tail', '2026-03-02T18:00:00', timed([0, 120, 120]), { durationSec: 3600, calories: 300 });
  // A legit 30-min break mid-workout: active = 90 + 1800 + 120 = 2010 s; reported 2300 ≤ 2010 + 300.
  const gap = workout('gap', '2026-03-04T18:00:00', timed([0, 1800, 120]), { durationSec: 2300 });
  const untimed = workout('untimed', '2026-03-06T18:00:00', [{ ex: 'Barbell Bench Press', w: 100, r: 5 }], { durationSec: 3600 });
  const fromEnd = workout('fromEnd', '2026-03-07T18:00:00', timed([0, 120, 120]), {
    durationSec: null,
    end: '2026-03-07T19:00:00',
  });
  const ds = dataset([tail, gap, untimed, fromEnd]);
  const win: Window = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 8, 23, 59, 59, 999) };
  const byId = (settings: Settings) => new Map(workoutSummaries(buildIndex(ds, settings), win).map((w) => [w.workout.id, w]));

  it('trims only the idle tail beyond the grace and keeps mid-workout gaps', () => {
    const idx = buildIndex(ds, DEFAULT_SETTINGS);
    expect(idx.trim).toEqual({ enabled: true, graceSec: 300 });
    const w = byId(DEFAULT_SETTINGS);
    expect(w.get('tail')).toMatchObject({ durationSec: 630, rawDurationSec: 3600, trimmedSec: 2970 });
    expect(w.get('tail')!.density).toBeCloseTo(500 * 3 / (630 / 60), 6);
    // Calories ÷ raw minutes: the idle time was still counted by the watch.
    expect(w.get('tail')!.kcalPerMin).toBeCloseTo(300 / 60, 6);
    expect(w.get('gap')).toMatchObject({ durationSec: 2300, rawDurationSec: 2300, trimmedSec: 0 });
    expect(w.get('untimed')).toMatchObject({ durationSec: 3600, rawDurationSec: 3600, trimmedSec: 0 });
    // Raw falls back to end − start when Total Duration is missing.
    expect(w.get('fromEnd')).toMatchObject({ durationSec: 630, rawDurationSec: 3600, trimmedSec: 2970 });

    const o = overviewStats(idx, win);
    expect(o.trimmedSec).toBe(2970 * 2);
    expect(o.trimmedWorkouts).toBe(2);
    expect(o.durationSec).toBe(630 + 2300 + 3600 + 630);
    expect(o.avgDurationSec).toBeCloseTo((630 + 2300 + 3600 + 630) / 4, 6);
  });

  it('respects the grace setting', () => {
    expect(byId({ ...DEFAULT_SETTINGS, trimGraceMin: 0 }).get('tail')).toMatchObject({ durationSec: 330, trimmedSec: 3270 });
    // 330 s + 60 min grace exceeds the reported hour: nothing to trim.
    expect(byId({ ...DEFAULT_SETTINGS, trimGraceMin: 60 }).get('tail')).toMatchObject({ durationSec: 3600, trimmedSec: 0 });
  });

  it('leaves durations untouched when disabled', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, trimIdle: false };
    expect(buildIndex(ds, settings).trim.enabled).toBe(false);
    const w = byId(settings);
    expect(w.get('tail')).toMatchObject({ durationSec: 3600, rawDurationSec: 3600, trimmedSec: 0 });
    expect(overviewStats(buildIndex(ds, settings), win).trimmedWorkouts).toBe(0);
  });
});

describe('actual-max strength metric', () => {
  const base = new Date(2026, 0, 5);
  // Weight climbs while reps fall: e1RM drifts down, the heaviest lift goes up.
  const climb = Array.from({ length: 8 }, (_, i) =>
    workout(`c${i}`, isoDay(base, i * 7), [{ ex: 'Climb Press', w: 100 + 2 * i, r: 10 - i }, { ex: 'Climb Press', w: 80, r: 10 }]),
  );
  const tie = workout('tie', isoDay(base, 50), [
    { ex: 'Tie Row', w: 110, r: 3 },
    { ex: 'Tie Row', w: 110, r: 5 },
    { ex: 'Tie Row', w: 100, r: 8 },
    { ex: 'Tie Row', w: 120, r: 0 },
  ]);
  const ds = dataset([...climb, tie]);
  const win: Window = { start: null, end: new Date(2026, 1, 25, 23, 59, 59) };
  const e1rmSettings: Settings = { ...DEFAULT_SETTINGS, oneRmFormula: 'epley' };
  const actualSettings: Settings = { ...e1rmSettings, strengthMetric: 'actual' };
  const summaries = (settings: Settings) => new Map(exerciseSummaries(buildIndex(ds, settings), win).map((e) => [e.key, e]));

  it('picks the heaviest set with ties broken by most reps', () => {
    const idx = buildIndex(ds, actualSettings);
    expect(idx.strengthMetric).toBe('actual');
    const row = summaries(actualSettings).get('tie row')!;
    expect(row.metric).toBe('actual');
    expect(row.latestStrength).toMatchObject({ value: 110, weightLb: 110, reps: 5, confidence: null });
    expect(row.latestStrength!.e1rm).toBeCloseTo(110 * (1 + 5 / 30), 6);
    expect(row.spark).toEqual([110]);
  });

  it('drives spark, rate and status from the active metric', () => {
    const e = summaries(e1rmSettings).get('climb press')!;
    const a = summaries(actualSettings).get('climb press')!;
    expect(e.metric).toBe('e1rm');
    expect(e.status).toBe('dip');
    expect(a.status).toBe('progressing');
    expect(a.ratePerMonth!).toBeGreaterThan(1);
    expect(a.spark).toEqual(climb.map((_, i) => 100 + 2 * i));
    expect(e.spark[0]).toBeCloseTo(100 * (1 + 10 / 30), 6);
    expect(a.bestStrength).toMatchObject({ value: 114, reps: 3 });
    // e1RM-only fields stay e1RM under either metric.
    expect(a.bestE1rm).toBeCloseTo(e.bestE1rm!, 6);

    const d = exerciseDetail(buildIndex(ds, actualSettings), 'climb press', win, actualSettings)!;
    expect(d.sessionsStrength.map((s) => s.value)).toEqual(a.spark);
    expect(d.sessionsE1rm[0].e1rm).toBeCloseTo(100 * (1 + 10 / 30), 6);
    expect(d.prEnvelope[d.prEnvelope.length - 1].value).toBe(114);
    // Latest (day 49) vs the nearest session at/before day 19 → day 14 (104 lb).
    expect(d.deltas.d30).toBeCloseTo(114 / 104 - 1, 6);
  });
});

describe('calendar', () => {
  const bench: SetSpec[] = [{ ex: 'Barbell Bench Press', w: 100, r: 5 }];
  // 2026-03-02 is a Monday.
  const ds = dataset([
    workout('m1', '2026-03-02T09:30:00', bench),
    workout('m2', '2026-03-02T18:00:00', bench),
    workout('w1', '2026-03-04T07:00:00', bench, { calories: null }),
    workout('m3', '2026-03-09T18:00:00', bench),
  ]);
  const idx = buildIndex(ds, DEFAULT_SETTINGS);
  const win: Window = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 10, 23, 59, 59, 999) };
  const cal = calendarStats(idx, win);

  it('spans first workout → window end with per-day metrics', () => {
    expect(cal.days).toHaveLength(9);
    expect(cal.days[0].date).toEqual(new Date(2026, 2, 2));
    const mon = cal.days[0];
    expect(mon.workoutIds).toEqual(['m1', 'm2']);
    expect(mon.metrics).toMatchObject({ workouts: 2, volume: 1000, duration: 7200, hardSets: 2, calories: 600, exercises: 1, startHour: 9.5 });
    expect(mon.metrics.density).toBeCloseTo(1000 / 120, 6);
    expect(mon.metrics.kcalPerMin).toBeCloseTo(5, 6);
    expect(mon.topRegions).toEqual(['chest']);
    const tue = cal.days[1];
    expect(tue.workoutIds).toEqual([]);
    expect(tue.metrics.workouts).toBe(0);
    for (const [k, v] of Object.entries(tue.metrics)) if (k !== 'workouts') expect(v).toBeNull();
    expect(cal.days[2].metrics.calories).toBeNull();
  });

  it('assigns weekdays Monday = 0 with hit rates over calendar days', () => {
    const [mon, tue, wed] = cal.weekdays;
    expect(cal.weekdays).toHaveLength(7);
    expect(mon).toMatchObject({ weekday: 0, workouts: 3, share: 0.75, hitRate: 1 });
    expect(mon.avg.workouts).toBe(1.5);
    expect(tue).toMatchObject({ weekday: 1, workouts: 0, hitRate: 0 });
    expect(tue.avg.volume).toBeNull();
    expect(wed).toMatchObject({ weekday: 2, workouts: 1, share: 0.25, hitRate: 1 });
    expect(wed.avg.calories).toBeNull();
    expect(cal.hours[18]).toBe(2);
    expect(cal.hours[9]).toBe(1);
    expect(cal.weekdayHour[0][18]).toBe(2);
    expect(cal.weekdayHour[2][7]).toBe(1);
  });

  it('steps by calendar date across DST changes', () => {
    const spring = dataset([workout('a', '2026-03-01T12:00:00', bench), workout('b', '2026-03-31T12:00:00', bench)]);
    const s = calendarStats(buildIndex(spring, DEFAULT_SETTINGS), { start: null, end: new Date(2026, 2, 31, 23, 59, 59, 999) });
    expect(s.days).toHaveLength(31);
    s.days.forEach((d, i) => {
      expect(d.date.getDate()).toBe(i + 1);
      expect(d.date.getHours()).toBe(0);
    });
    const fall = dataset([workout('c', '2026-10-30T12:00:00', bench)]);
    const f = calendarStats(buildIndex(fall, DEFAULT_SETTINGS), { start: new Date(2026, 9, 20), end: new Date(2026, 10, 5, 23, 59, 59, 999) });
    expect(f.days.map((d) => d.date.getDate())).toEqual([30, 31, 1, 2, 3, 4, 5]);
    expect(f.days.every((d) => d.date.getHours() === 0)).toBe(true);
  });
});

describe('bodyweight and timed load model', () => {
  const reps = (w: number | null, r: number | null, durationSec: number | null = null) => ({ weightLb: w, reps: r, durationSec });

  it('classifies by name and data', () => {
    expect(exerciseLoadModel('Dips', [reps(0, 10)])).toMatchObject({ kind: 'bodyweight', bodyweightFactor: 1, assisted: false });
    for (const n of ['Pull-Up', 'Chin-Up', 'Hammer-Grip Pull-Up', 'Ring Pull-Up', 'Pullup']) {
      expect(exerciseLoadModel(n, [reps(0, 8)])).toMatchObject({ kind: 'bodyweight', bodyweightFactor: 1 });
    }
    expect(exerciseLoadModel('Push-Up', [reps(0, 20)]).bodyweightFactor).toBe(0.64);
    expect(exerciseLoadModel('Machine Assisted Pull-Up', [reps(40, 8)])).toMatchObject({ kind: 'bodyweight', bodyweightFactor: 1, assisted: true });
    expect(exerciseLoadModel('Machine Seated Dip', [reps(150, 10)])).toMatchObject({ kind: 'weighted' });
    expect(exerciseLoadModel('Plank', [reps(0, 1)])).toMatchObject({ kind: 'timed' });
    expect(exerciseLoadModel('Ab Wheel Iso', [reps(0, 0, 30), reps(null, null, 40), reps(0, 10)])).toMatchObject({ kind: 'timed', reason: 'most sets have time but no reps' });
    expect(exerciseLoadModel('Sit-Up', [reps(0, 20)])).toMatchObject({ kind: 'bodyweight', bodyweightFactor: null });
    expect(exerciseLoadModel('Ab Rollout', [reps(0, 12), reps(null, 10)])).toMatchObject({ kind: 'bodyweight', bodyweightFactor: null });
    expect(exerciseLoadModel('Barbell Bench Press', [reps(135, 5)])).toMatchObject({ kind: 'weighted', bodyweightFactor: null });
  });

  it('applies the bodyweight load rule at its boundaries', () => {
    const dips = exerciseLoadModel('Dips', []);
    const push = exerciseLoadModel('Push-Up', []);
    const assisted = exerciseLoadModel('Assisted Dip', []);
    expect(effectiveLoad(dips, 0, 200)).toEqual({ loadLb: 200, loadBasis: 'bodyweightAdded' });
    expect(effectiveLoad(dips, null, 200)).toEqual({ loadLb: 200, loadBasis: 'bodyweightAdded' });
    expect(effectiveLoad(dips, -30, 200)).toEqual({ loadLb: 170, loadBasis: 'bodyweightAdded' });
    expect(effectiveLoad(dips, 98, 200)).toEqual({ loadLb: 298, loadBasis: 'bodyweightAdded' });
    expect(effectiveLoad(dips, 100, 200)).toEqual({ loadLb: 100, loadBasis: 'bodyweightIncluded' });
    expect(effectiveLoad(dips, 225, 200)).toEqual({ loadLb: 225, loadBasis: 'bodyweightIncluded' });
    expect(effectiveLoad(push, 0, 200).loadLb).toBeCloseTo(128, 6);
    expect(effectiveLoad(dips, 25, null)).toEqual({ loadLb: 25, loadBasis: 'bodyweightUnknown' });
    expect(effectiveLoad(dips, 0, null)).toEqual({ loadLb: null, loadBasis: 'bodyweightUnknown' });
    expect(effectiveLoad(assisted, 40, 200)).toEqual({ loadLb: 160, loadBasis: 'assisted' });
    expect(effectiveLoad(assisted, -40, 200)).toEqual({ loadLb: 160, loadBasis: 'assisted' });
    expect(effectiveLoad(assisted, 250, 200)).toEqual({ loadLb: 0, loadBasis: 'assisted' });
    const sit = exerciseLoadModel('Sit-Up', []);
    expect(effectiveLoad(sit, 0, 200)).toEqual({ loadLb: null, loadBasis: 'none' });
    expect(effectiveLoad(sit, 10, 200)).toEqual({ loadLb: 10, loadBasis: 'external' });
  });

  it('uses the effective load for e1RM, volume and actual max on dips', () => {
    const ds = dataset([
      workout('d1', '2026-03-02T18:00:00', [{ ex: 'Dips', w: 0, r: 10 }, { ex: 'Dips', w: 25, r: 5 }]),
      workout('d2', '2026-03-09T18:00:00', [{ ex: 'Dips', w: 185, r: 5 }]),
    ]);
    const bwSettings: Settings = { ...DEFAULT_SETTINGS, bodyweightLb: 180 };
    const idx = buildIndex(ds, bwSettings);
    const [plain, added] = idx.sets.filter((s) => s.workoutId === 'd1');
    expect(plain).toMatchObject({ loadLb: 180, loadBasis: 'bodyweightAdded', volumeLb: 1800, holdSec: null });
    expect(added).toMatchObject({ loadLb: 205, loadBasis: 'bodyweightAdded', volumeLb: 1025 });
    expect(added.e1rm!.value).toBeCloseTo(estimateE1rm(205, 5, null, 'auto')!.value, 6);
    const included = idx.sets.find((s) => s.workoutId === 'd2')!;
    expect(included).toMatchObject({ loadLb: 185, loadBasis: 'bodyweightIncluded' });

    const sum = exerciseSummaries(idx, ALL).find((e) => e.name === 'Dips')!;
    expect(sum).toMatchObject({ weighted: true, valueUnit: 'lb', bestWeightLb: 185, bestHoldSec: null });
    expect(sum.load).toMatchObject({ kind: 'bodyweight', bodyweightFactor: 1 });
    const actual = buildIndex(ds, { ...bwSettings, strengthMetric: 'actual' });
    expect(exerciseSummaries(actual, ALL).find((e) => e.name === 'Dips')!.bestStrength).toMatchObject({ value: 205, weightLb: 205, reps: 5, loadBasis: 'bodyweightAdded' });
    const detail = exerciseDetail(idx, sum.key, ALL, bwSettings)!;
    expect(detail.history[1].sets[0]).toMatchObject({ weightLb: 0, loadLb: 180, loadBasis: 'bodyweightAdded', holdSec: null });

    // Without bodyweight the zero-weight set has no load.
    const noBw = buildIndex(ds, DEFAULT_SETTINGS).sets.find((s) => s.workoutId === 'd1')!;
    expect(noBw).toMatchObject({ loadLb: null, loadBasis: 'bodyweightUnknown', volumeLb: 0, e1rm: null });
  });

  it('tracks planks by longest hold with hold and weight PRs', () => {
    const base = new Date(2026, 0, 5);
    const plank = (w: number, dur: number): SetSpec => ({ ex: 'Plank', w, r: 0, dur, muscles: ['abs'] });
    const ds = dataset([
      workout('p0', isoDay(base, 0), [plank(0, 30), plank(0, 25)]),
      workout('p1', isoDay(base, 7), [plank(0, 45), plank(0, 5)]),
      workout('p2', isoDay(base, 14), [plank(25, 40)]),
      workout('p3', isoDay(base, 21), [plank(0, 60), plank(35, 30)]),
    ]);
    const idx = buildIndex(ds, { ...DEFAULT_SETTINGS, bodyweightLb: 180 });
    const sets = idx.sets.filter((s) => s.exerciseKey === normalizeKey('Plank'));
    expect(sets.map((s) => s.holdSec)).toEqual([30, 25, 45, 5, 40, 60, 30]);
    expect(sets.map((s) => s.hard)).toEqual([true, true, true, false, true, true, true]);
    expect(sets.every((s) => s.e1rm === null && s.volumeLb === 0)).toBe(true);
    expect(sets[4]).toMatchObject({ loadLb: 25, loadBasis: 'external' });

    const sum = exerciseSummaries(idx, ALL).find((e) => e.name === 'Plank')!;
    expect(sum).toMatchObject({ valueUnit: 'sec', bestHoldSec: 60, weighted: true, spark: [30, 45, 40, 60] });
    expect(sum.load.kind).toBe('timed');
    expect(sum.latestStrength).toMatchObject({ value: 60, holdSec: 60, weightLb: 0, loadBasis: 'none' });

    const prs = idx.prs.filter((p) => p.exerciseName === 'Plank').map((p) => [p.workoutId, p.type, p.value, p.previous]);
    expect(prs).toEqual([
      ['p1', 'hold', 45, 30],
      ['p3', 'weight', 35, 25],
      ['p3', 'hold', 60, 45],
    ]);
  });
});
