import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseDateTime, parseDuration, parseNumber, parseWorkbook } from './parse.ts';

type Aoa = (string | number | null)[][];

const HEADER = [
  'Exercise', 'Weight (lbs)', 'Reps', 'Time (seconds)', 'Distance (ft)',
  'Rest Time (seconds)', 'Effort', 'Primary Muscle Groups', 'Note',
];

const SETS: Aoa = [
  ['Barbell Bench Press', 135, 10, 29.885069847106934, 0, 0, '', 'chest', ''],
  ['Machine Seated Chest Press', 220, 8, 27.89, 0, 211, '', 'chest', ''],
  ['Machine Fly (Pec Dec)', 100, 10, 27.89, 0, 448, '', 'chest', ''],
];

interface BlockOptions {
  title?: string | null;
  start?: string | number;
  end?: string | number;
  hr?: boolean;
  header?: (string | number | null)[];
  sets?: Aoa;
  effort?: string | number;
}

/** One workout block laid out exactly like the Motra sample export. */
function block(o: BlockOptions = {}): Aoa {
  const sets = o.sets ?? SETS;
  const rows: Aoa = [];
  if (o.title !== null) rows.push([o.title ?? 'Wednesday Afternoon Chest Shoulders and Triceps Session']);
  rows.push(
    ['Workout Start', o.start ?? '2026-10-21 13:04:28'],
    ['Workout End', o.end ?? '2026-10-21 13:47:51'],
    ['Total Duration (seconds)', 2603],
    ['Total Sets', sets.length],
    ['Burned Calories', 254],
    ['Total TVL (lbs)', 10140],
    ['Effort', o.effort ?? 'N/A'],
    ['   '],
  );
  if (o.hr !== false) {
    rows.push(
      ['Heart Rate Zones'],
      ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'],
      ['18m 51s', '20m 28s', '1m 16s', '0s', '0s'],
      ['   '],
    );
  }
  rows.push(['All Sets'], o.header ?? HEADER, ...sets, ['']);
  return rows;
}

function workbook(sheets: Record<string, Aoa>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('parseWorkbook — sample layout', () => {
  const { workouts, warnings } = parseWorkbook(workbook({ Workouts: block() }), 'export.xlsx');
  const w = workouts[0];

  it('produces one workout without warnings', () => {
    expect(workouts).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('reads the summary block', () => {
    expect(w.title).toBe('Wednesday Afternoon Chest Shoulders and Triceps Session');
    expect(w.start).toBe('2026-10-21T13:04:28');
    expect(w.end).toBe('2026-10-21T13:47:51');
    expect(w.durationSec).toBe(2603);
    expect(w.totalSets).toBe(3);
    expect(w.calories).toBe(254);
    expect(w.tvlLb).toBe(10140);
    expect(w.effort).toBeNull();
    expect(w.effortRaw).toBeNull();
    expect(w.summaryExtra).toEqual({});
    expect(w.sourceFile).toBe('export.xlsx');
  });

  it('reads heart-rate zones as seconds', () => {
    expect(w.hrZonesSec).toEqual([1131, 1228, 76, 0, 0]);
  });

  it('reads sets with keys, muscles and ids', () => {
    expect(w.sets).toHaveLength(3);
    const [first, , fly] = w.sets;
    expect(first).toMatchObject({
      id: `${w.id}:0`,
      workoutId: w.id,
      index: 0,
      exerciseKey: 'barbell bench press',
      exerciseRaw: 'Barbell Bench Press',
      weightLb: 135,
      reps: 10,
      distanceFt: 0,
      restSec: 0,
      effort: null,
      effortRaw: null,
      muscleKeys: ['chest'],
      muscleRaw: 'chest',
      note: null,
      extra: {},
    });
    expect(first.durationSec).toBeCloseTo(29.885, 3);
    expect(fly.exerciseKey).toBe('machine fly (pec dec)');
    expect(fly.restSec).toBe(448);
  });

  it('derives a stable id from start and title', () => {
    const again = parseWorkbook(workbook({ Other: block() }), 'renamed.xlsx').workouts[0];
    expect(again.id).toBe(w.id);
    expect(w.id).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('parseWorkbook — layout variations', () => {
  it('splits stacked workouts in one sheet', () => {
    const aoa = [
      ...block(),
      ...block({ title: 'Friday Legs', start: '2026-10-23 08:00:00', end: '2026-10-23 09:00:00', sets: [SETS[0]] }),
    ];
    const { workouts, warnings } = parseWorkbook(workbook({ Workouts: aoa }), 'f.xlsx');
    expect(warnings).toEqual([]);
    expect(workouts.map((w) => [w.title, w.sets.length])).toEqual([
      ['Wednesday Afternoon Chest Shoulders and Triceps Session', 3],
      ['Friday Legs', 1],
    ]);
    expect(workouts[0].id).not.toBe(workouts[1].id);
  });

  it('splits stacked workouts with no blank row between them', () => {
    const first = block();
    first.pop();
    const aoa = [...first, ...block({ title: 'Next', start: '2026-10-22 10:00:00' })];
    const { workouts } = parseWorkbook(workbook({ S: aoa }), 'f.xlsx');
    expect(workouts.map((w) => w.sets.length)).toEqual([3, 3]);
    expect(workouts[1].title).toBe('Next');
  });

  it('reads one workout per sheet', () => {
    const { workouts } = parseWorkbook(
      workbook({
        A: block({ title: 'Push', start: '2026-10-01 10:00:00' }),
        B: block({ title: 'Pull', start: '2026-10-02 10:00:00' }),
      }),
      'f.xlsx',
    );
    expect(workouts.map((w) => w.title)).toEqual(['Push', 'Pull']);
  });

  it('splits multi-muscle cells and normalizes spellings', () => {
    const sets: Aoa = [
      ['Deadlift', 225, 5, 20, 0, 0, '', 'glutes, hamstrings, lowerBack', ''],
      ['Lat Pulldown', 120, 10, 30, 0, 90, '', 'Lats & Biceps', ''],
      ['Back Extension', 0, 12, 30, 0, 60, '', 'lower_back', ''],
    ];
    const w = parseWorkbook(workbook({ S: block({ sets }) }), 'f.xlsx').workouts[0];
    expect(w.sets.map((s) => s.muscleKeys)).toEqual([
      ['glutes', 'hamstrings', 'lower back'],
      ['lats', 'biceps'],
      ['lower back'],
    ]);
    expect(w.sets[1].muscleRaw).toBe('Lats & Biceps');
  });

  it('accepts snake_case labels and headers', () => {
    const aoa: Aoa = [
      ['Snake Session'],
      ['workout_start', '2026-10-21 13:04:28'],
      ['total_duration_seconds', 100],
      ['total_tvl_lbs', 500],
      ['heart_rate_zones'],
      ['zone_1', 'zone_2'],
      ['1h 2m 3s', '45s'],
      ['all_sets'],
      ['exercise', 'weight_lbs', 'reps', 'primary_muscle_groups'],
      ['bench_press', 100, 5, 'upper_chest'],
    ];
    const { workouts } = parseWorkbook(workbook({ S: aoa }), 'f.xlsx');
    const w = workouts[0];
    expect(w.start).toBe('2026-10-21T13:04:28');
    expect(w.durationSec).toBe(100);
    expect(w.tvlLb).toBe(500);
    expect(w.hrZonesSec).toEqual([3723, 45, 0, 0, 0]);
    expect(w.sets[0]).toMatchObject({ exerciseKey: 'bench press', weightLb: 100, reps: 5, muscleKeys: ['upper chest'] });
  });

  it('converts kg weight columns to pounds', () => {
    const header = ['Exercise', 'Weight (kg)', 'Reps', 'Primary Muscle Groups'];
    const w = parseWorkbook(workbook({ S: block({ header, sets: [['Squat', 100, 5, 'quads']] }) }), 'f.xlsx').workouts[0];
    expect(w.sets[0].weightLb).toBeCloseTo(220.462, 2);
  });

  it('reads Excel serial dates', () => {
    const serial = (h: number, m: number, s: number) =>
      (Date.UTC(2026, 9, 21, h, m, s) - Date.UTC(1899, 11, 30)) / 86400000;
    const w = parseWorkbook(
      workbook({ S: block({ start: serial(13, 4, 28), end: serial(13, 47, 51) }) }),
      'f.xlsx',
    ).workouts[0];
    expect(w.start).toBe('2026-10-21T13:04:28');
    expect(w.end).toBe('2026-10-21T13:47:51');
  });

  it('handles a missing heart-rate section', () => {
    const { workouts, warnings } = parseWorkbook(workbook({ S: block({ hr: false }) }), 'f.xlsx');
    expect(warnings).toEqual([]);
    expect(workouts[0].hrZonesSec).toBeNull();
    expect(workouts[0].sets).toHaveLength(3);
  });

  it('maps reordered columns and keeps unknown ones in extra', () => {
    const header = ['Reps', 'Tempo', 'Exercise', 'Primary Muscle Groups', 'Weight (lbs)', 'Side'];
    const sets: Aoa = [[8, '3-1-1', 'Incline Press', 'Chest, Shoulders', '95', 'L']];
    const s = parseWorkbook(workbook({ S: block({ header, sets }) }), 'f.xlsx').workouts[0].sets[0];
    expect(s).toMatchObject({
      exerciseKey: 'incline press',
      reps: 8,
      weightLb: 95,
      muscleKeys: ['chest', 'shoulders'],
      durationSec: null,
      restSec: null,
      extra: { Tempo: '3-1-1', Side: 'L' },
    });
  });

  it('reads numeric effort', () => {
    const sets: Aoa = [['Squat', 100, 5, 20, 0, 0, 8, 'quads', 'felt good']];
    const w = parseWorkbook(workbook({ S: block({ effort: 7, sets }) }), 'f.xlsx').workouts[0];
    expect(w.effort).toBe(7);
    expect(w.effortRaw).toBe('7');
    expect(w.sets[0]).toMatchObject({ effort: 8, effortRaw: '8', note: 'felt good' });
  });

  it('synthesizes a title when the title row is missing', () => {
    const w = parseWorkbook(workbook({ S: block({ title: null }) }), 'f.xlsx').workouts[0];
    expect(w.title).toBe('Workout 2026-10-21');
    expect(w.sets).toHaveLength(3);
  });

  it('keeps unknown summary labels', () => {
    const aoa = block();
    aoa.splice(7, 0, ['Average Heart Rate (bpm)', 121]);
    const w = parseWorkbook(workbook({ S: aoa }), 'f.xlsx').workouts[0];
    expect(w.summaryExtra).toEqual({ 'Average Heart Rate (bpm)': 121 });
    expect(w.calories).toBe(254);
  });

  it('builds a workout from a sheet that only has a set table', () => {
    const { workouts, warnings } = parseWorkbook(workbook({ Legs: [HEADER, ...SETS] }), 'f.xlsx');
    expect(workouts).toHaveLength(1);
    expect(workouts[0].start).toBeNull();
    expect(workouts[0].title).toBe('Workout (Legs)');
    expect(workouts[0].sets).toHaveLength(3);
    expect(warnings.some((w) => /without a workout summary/.test(w.message))).toBe(true);
  });

  it('survives garbage sheets with warnings', () => {
    const garbage: Aoa = [['foo', 1, 2], [null, 'bar'], [3], ['Zone 9'], ['All Sets'], ['x', 'y', 'z']];
    const { workouts, warnings } = parseWorkbook(workbook({ Garbage: garbage, Workouts: block() }), 'f.xlsx');
    expect(workouts).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((w) => w.file === 'f.xlsx')).toBe(true);
    expect(warnings.some((w) => w.sheet === 'Garbage')).toBe(true);
  });

  it('reports a workbook without workouts', () => {
    const { workouts, warnings } = parseWorkbook(workbook({ Empty: [] }), 'f.xlsx');
    expect(workouts).toEqual([]);
    expect(warnings.map((w) => w.message)).toContain('No workouts were found in this file.');
  });
});

describe('cell parsers', () => {
  it.each([
    ['2026-10-21 13:04:28', '2026-10-21T13:04:28'],
    ['2026-10-21T13:04:28', '2026-10-21T13:04:28'],
    ['2026/10/21 13:04', '2026-10-21T13:04:00'],
    ['10/21/2026 1:04:28 PM', '2026-10-21T13:04:28'],
    ['21/10/2026 13:04:28', '2026-10-21T13:04:28'],
    ['2026-10-21', '2026-10-21T00:00:00'],
    ['N/A', null],
    ['', null],
    ['not a date', null],
  ])('parseDateTime(%j)', (input, expected) => {
    expect(parseDateTime(input)).toBe(expected);
  });

  it.each([
    ['18m 51s', 1131],
    ['1h 2m 3s', 3723],
    ['0s', 0],
    ['12:34', 754],
    ['1:02:03', 3723],
    [90, 90],
    ['90', 90],
    ['N/A', null],
    ['soon', null],
  ])('parseDuration(%j)', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each([
    [135, 135],
    ['135', 135],
    ['10,140', 10140],
    ['135 lbs', 135],
    ['2,5', 2.5],
    ['N/A', null],
    ['-', null],
    ['', null],
    [null, null],
    ['heavy', null],
  ])('parseNumber(%j)', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

/** Node's fs, reached without @types/node so this file type-checks in the browser project. */
interface NodeFs {
  existsSync(path: URL): boolean;
  readFileSync(path: URL): Uint8Array;
}
const fs = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process
  ?.getBuiltinModule?.('node:fs') as NodeFs | undefined;
const SAMPLE = new URL('../../Motra_Workouts_Export_2026-10-21 2.xlsx', import.meta.url);
const hasSample = Boolean(fs?.existsSync(SAMPLE));

describe('real sample export', () => {
  it.skipIf(!hasSample)('parses the sample file', () => {
    const { workouts, warnings } = parseWorkbook(fs!.readFileSync(SAMPLE), 'sample.xlsx');
    expect(warnings).toEqual([]);
    expect(workouts).toHaveLength(1);
    expect(workouts[0].sets).toHaveLength(10);
    expect(workouts[0].tvlLb).toBe(10140);
    expect(workouts[0].hrZonesSec?.[0]).toBe(1131);
  });
});
