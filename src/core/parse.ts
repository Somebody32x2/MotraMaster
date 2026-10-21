/**
 * Motra `.xlsx` export parser.
 *
 * Every sheet is scanned row by row with a small state machine. A workout
 * block looks like:
 *
 *   <title>
 *   Workout Start | 2026-10-21 13:04:28
 *   ...summary label rows...
 *   Heart Rate Zones
 *   Zone 1 | Zone 2 | ...
 *   18m 51s | 20m 28s | ...
 *   All Sets
 *   Exercise | Weight (lbs) | Reps | ...
 *   <set rows until a blank row or the next title>
 *
 * Blocks may be stacked in one sheet or split one per sheet. Labels and
 * headers are matched loosely (case, spacing, units) and anything unknown is
 * preserved in `summaryExtra` / `extra`. Malformed content never throws; it
 * produces ParseWarnings. Only a file that is not a readable workbook throws.
 *
 * Runtime imports carry explicit `.ts` extensions so `scripts/catalog.ts` can
 * load this module with Node's type stripping.
 */
import * as XLSX from 'xlsx';
import { normalizeKey, splitMuscles } from './labels.ts';
import type { LocalIso, ParseWarning, SetRecord, Workout } from './types.ts';

type Cell = string | number | boolean | Date | null;
type Row = Cell[];

export interface ParseResult {
  workouts: Workout[];
  warnings: ParseWarning[];
}

/**
 * Vocabulary observed while parsing (labels, headers, units — never values).
 * Used by `scripts/catalog.ts` to learn the export format without exposing data.
 */
export interface ParseVocabulary {
  sheets: { name: string; rows: number; workouts: number }[];
  /** Set-table header cell text → number of tables it appeared in. */
  setHeaders: Record<string, number>;
  /** Summary label text (recognized or not) → occurrences. */
  summaryLabels: Record<string, number>;
  /** Set-table headers that mapped to no known field. */
  unknownColumns: Record<string, number>;
  /** Summary labels that mapped to no known field. */
  unknownSummaryLabels: Record<string, number>;
  /** Units found in header / label parentheses, e.g. `lbs`, `seconds`. */
  units: Record<string, number>;
}

export interface DetailedParseResult extends ParseResult {
  vocabulary: ParseVocabulary;
}

const LB_PER_KG = 2.2046226218487757;
const FT_PER_M = 3.280839895013123;
const MAX_WARNINGS_PER_FILE = 100;

/* ------------------------------------------------------------------ */
/* Cell helpers                                                        */
/* ------------------------------------------------------------------ */

function cellText(v: Cell | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v);
}

/** Lowercase alphanumerics only: `Total TVL (lbs)` → `totaltvllbs`. */
function compact(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

const NULL_MARKERS: Record<string, true> = {
  '': true, 'n/a': true, 'na': true, '-': true, '--': true, '—': true, '–': true,
  'none': true, 'null': true, 'nan': true, 'undefined': true,
};

function isNullMarker(text: string): boolean {
  return Object.hasOwn(NULL_MARKERS, text.trim().toLowerCase());
}

/** Number from a numeric cell or numeric-looking string (`'1,234'`, `'135 lbs'`, `'2,5'`). */
export function parseNumber(v: Cell | undefined): number | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  const text = v.trim();
  if (isNullMarker(text)) return null;
  let m = /^([-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?)\s*[\p{L}%]*\.?$/u.exec(text);
  if (m) return Number(m[1].replace(/,/g, ''));
  m = /^([-+]?\d+),(\d{1,2})\s*[\p{L}%]*$/u.exec(text);
  if (m) return Number(`${m[1]}.${m[2]}`);
  m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*[\p{L}%]*\.?$/iu.exec(text);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Seconds from `'1h 2m 3s'`, `'18m 51s'`, `'0s'`, `'12:34'`, `'1:02:03'` or a number of seconds. */
export function parseDuration(v: Cell | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const text = v.trim().toLowerCase();
  if (isNullMarker(text)) return null;
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(text);
  if (clock) {
    return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  }
  const unitRe = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g;
  let total = 0;
  let matched = false;
  let consumed = '';
  for (let m = unitRe.exec(text); m; m = unitRe.exec(text)) {
    matched = true;
    consumed += m[0];
    const n = Number(m[1]);
    const unit = m[2];
    if (unit.startsWith('h')) total += n * 3600;
    else if (unit.startsWith('m')) total += n * 60;
    else total += n;
  }
  if (matched && text.replace(/[\s,]+/g, '').length === consumed.replace(/\s+/g, '').length) {
    return total;
  }
  return parseNumber(text);
}

function pad(n: number, width = 2): string {
  return String(Math.trunc(n)).padStart(width, '0');
}

function makeIso(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): LocalIso | null {
  if (!(y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s < 61)) return null;
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(Math.min(59, Math.floor(s)))}`;
}

function isoFromLocalDate(date: Date): LocalIso | null {
  if (Number.isNaN(date.getTime())) return null;
  return makeIso(
    date.getFullYear(), date.getMonth() + 1, date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(),
  );
}

function to24h(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const pm = meridiem.toLowerCase().startsWith('p');
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

/**
 * Normalize a timestamp cell to local `YYYY-MM-DDTHH:mm:ss`. Accepts Excel
 * serial numbers, Date objects, ISO-ish strings (`-` or `/`, space or `T`),
 * US `M/D/YYYY` strings (or `D/M/YYYY` when the first part exceeds 12),
 * optional AM/PM, and strings with an explicit zone (converted to local time).
 */
export function parseDateTime(v: Cell | undefined, date1904 = false): LocalIso | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (v instanceof Date) return isoFromLocalDate(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    if (v > 1e11) return isoFromLocalDate(new Date(v));
    if (v > 1e9) return isoFromLocalDate(new Date(v * 1000));
    if (v <= 0 || v > 200000) return null;
    const p = XLSX.SSF.parse_date_code(v, { date1904 });
    if (!p) return null;
    return makeIso(p.y, p.m, p.d, p.H, p.M, p.S);
  }
  const text = v.trim();
  if (isNullMarker(text)) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return parseDateTime(Number(text), date1904);

  const time = String.raw`(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*([ap]\.?m\.?)?)?`;
  const zone = String.raw`\s*(z|[+-]\d{2}:?\d{2})?$`;

  let m = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})` + time + zone, 'i').exec(text);
  if (m) {
    if (m[8]) {
      const zoned = new Date(
        `${m[1]}-${pad(+m[2])}-${pad(+m[3])}T${pad(+(m[4] ?? 0))}:${m[5] ?? '00'}:${m[6] ?? '00'}${m[8].toUpperCase() === 'Z' ? 'Z' : m[8].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`,
      );
      return isoFromLocalDate(zoned);
    }
    return makeIso(+m[1], +m[2], +m[3], to24h(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  m = new RegExp(String.raw`^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})` + time + String.raw`\s*$`, 'i').exec(text);
  if (m) {
    let month = +m[1];
    let day = +m[2];
    if (month > 12 && day <= 12) [month, day] = [day, month];
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return makeIso(year, month, day, to24h(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0));
  }
  const fallback = Date.parse(text);
  return Number.isNaN(fallback) ? null : isoFromLocalDate(new Date(fallback));
}

function isoToMs(iso: LocalIso): number {
  return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), +iso.slice(11, 13), +iso.slice(14, 16), +iso.slice(17, 19));
}

/** Two independent 32-bit FNV-1a passes → 16 hex chars; stable across runs and platforms. */
export function stableHash(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Unit text inside parentheses / brackets, e.g. `Weight (lbs)` → `lbs`. */
function unitOf(text: string): string | null {
  const m = /[([]\s*([^)\]]+?)\s*[)\]]\s*$/.exec(text);
  return m ? m[1].toLowerCase() : null;
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Label classification                                                */
/* ------------------------------------------------------------------ */

type SummaryField = 'start' | 'end' | 'duration' | 'totalSets' | 'calories' | 'tvl' | 'effort';

function summaryField(label: string): SummaryField | null {
  const k = compact(label);
  if (!k) return null;
  if (/^(workout)?(start|started|begin)(time|date|datetime|at)?$/.test(k)) return 'start';
  if (/^(workout)?(end|ended|finish|finished|stop)(time|date|datetime|at)?$/.test(k)) return 'end';
  if (/^(total)?(workout)?(duration|time|elapsedtime)(seconds|secs|sec|s|minutes|mins|min|hours|hrs|h)?$/.test(k)) return 'duration';
  if (/^(total)?(numberof)?sets$|^setcount$/.test(k)) return 'totalSets';
  if (/^(burned|burnt|active|total)?(calories|kcal|energy)(burned|burnt)?(kcal|cal)?$/.test(k)) return 'calories';
  if (/^(total)?(tvl|volume|volumeload)(lbs|lb|kgs|kg)?$/.test(k)) return 'tvl';
  if (/^(workout)?(effort|rpe|intensity)$/.test(k)) return 'effort';
  return null;
}

function isHrSection(label: string): boolean {
  return /^(heartrate|hr)(zones?)?$/.test(compact(label));
}

function isSetsSection(label: string): boolean {
  return /^(all)?(sets|exercises)$/.test(compact(label));
}

function zoneNumber(text: string): number | null {
  const m = /^(?:hr[\s_-]*)?zone[\s_-]*(\d{1,2})\b/i.exec(text.trim());
  return m ? Number(m[1]) : null;
}

type SetField = 'exercise' | 'weight' | 'reps' | 'time' | 'distance' | 'rest' | 'effort' | 'muscles' | 'note';

interface ColumnMap {
  fields: Partial<Record<SetField, number>>;
  /** Multiplier from the column's unit to the stored unit (lb, s, ft). */
  scale: Partial<Record<SetField, number>>;
  extra: { index: number; header: string }[];
}

function setField(header: string): SetField | null {
  const k = compact(header);
  if (!k) return null;
  if (/^(exercise|exercisename|movement|lift)/.test(k)) return 'exercise';
  if (/^rest/.test(k)) return 'rest';
  if (/^(weight|load|resistance)/.test(k)) return 'weight';
  if (/^(reps|rep|repetitions|repcount)/.test(k)) return 'reps';
  if (/^(time|duration|setduration|timeundertension|tut)/.test(k)) return 'time';
  if (/^(distance|dist)/.test(k)) return 'distance';
  if (/^(effort|rpe)/.test(k)) return 'effort';
  if (/^(primary)?(muscle|muscles|musclegroups?|targetmuscles?|bodypart)/.test(k)) return 'muscles';
  if (/^(note|notes|comment|comments)/.test(k)) return 'note';
  return null;
}

function unitScale(field: SetField, header: string): number {
  // Prefer the parenthesized unit; otherwise scan the whole header (`weight_kg`, `Distance m`).
  const unit = unitOf(header) ?? header.toLowerCase().replace(/[_-]+/g, ' ');
  switch (field) {
    case 'weight':
      return /\bkgs?\b|kilo/.test(unit) ? LB_PER_KG : 1;
    case 'time':
    case 'rest':
      if (/\bms\b|milli/.test(unit)) return 0.001;
      if (/\bmins?\b|minute/.test(unit)) return 60;
      if (/\bh(ou)?rs?\b/.test(unit)) return 3600;
      return 1;
    case 'distance':
      if (/\bkm\b|kilomet/.test(unit)) return 1000 * FT_PER_M;
      if (/\bmi(les?)?\b/.test(unit)) return 5280;
      if (/\by(ar)?ds?\b/.test(unit)) return 3;
      if (/\bm\b|\bmet(er|re)s?\b/.test(unit)) return FT_PER_M;
      return 1;
    default:
      return 1;
  }
}

/** Interpret a row as a set-table header; requires an exercise column plus one other known column. */
function detectHeader(texts: string[]): ColumnMap | null {
  const fields: ColumnMap['fields'] = {};
  const scale: ColumnMap['scale'] = {};
  const extra: ColumnMap['extra'] = [];
  let known = 0;
  texts.forEach((text, index) => {
    if (!text) return;
    const field = setField(text);
    if (field && fields[field] === undefined) {
      fields[field] = index;
      scale[field] = unitScale(field, text);
      known++;
    } else {
      extra.push({ index, header: text });
    }
  });
  if (fields.exercise === undefined || known < 2) return null;
  return { fields, scale, extra };
}

/* ------------------------------------------------------------------ */
/* Workout assembly                                                    */
/* ------------------------------------------------------------------ */

type SetDraft = Omit<SetRecord, 'id' | 'workoutId' | 'index'>;

interface Draft {
  title: string | null;
  firstRow: number;
  start: LocalIso | null;
  startSeen: boolean;
  end: LocalIso | null;
  durationSec: number | null;
  totalSets: number | null;
  calories: number | null;
  tvlLb: number | null;
  effort: number | null;
  effortRaw: string | null;
  hrZonesSec: number[] | null;
  summaryExtra: Record<string, string | number | null>;
  sets: SetDraft[];
  hasSummary: boolean;
}

function newDraft(firstRow: number, title: string | null): Draft {
  return {
    title, firstRow, start: null, startSeen: false, end: null, durationSec: null,
    totalSets: null, calories: null, tvlLb: null, effort: null, effortRaw: null,
    hrZonesSec: null, summaryExtra: {}, sets: [], hasSummary: false,
  };
}

function rawValue(v: Cell | undefined): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const text = cellText(v);
  return isNullMarker(text) ? null : text;
}

function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function scaled(v: Cell | undefined, factor: number | undefined, duration = false): number | null {
  const n = duration ? parseDuration(v) : parseNumber(v);
  if (n === null) return null;
  return factor === undefined || factor === 1 ? n : round(n * factor);
}

class Collector {
  readonly warnings: ParseWarning[] = [];
  private suppressed = 0;
  readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  warn(message: string, sheet?: string, row?: number): void {
    if (this.warnings.length >= MAX_WARNINGS_PER_FILE) {
      this.suppressed++;
      return;
    }
    const w: ParseWarning = { file: this.file, message };
    if (sheet !== undefined) w.sheet = sheet;
    if (row !== undefined) w.row = row;
    this.warnings.push(w);
  }

  finish(): ParseWarning[] {
    if (this.suppressed > 0) {
      this.warnings.push({ file: this.file, message: `${this.suppressed} more warnings were suppressed.` });
      this.suppressed = 0;
    }
    return this.warnings;
  }
}

function emptyVocabulary(): ParseVocabulary {
  return { sheets: [], setHeaders: {}, summaryLabels: {}, unknownColumns: {}, unknownSummaryLabels: {}, units: {} };
}

type Mode = 'idle' | 'summary' | 'hrHeader' | 'hrValues' | 'setsHeader' | 'sets';

const DEFAULT_HEADER = [
  'Exercise', 'Weight (lbs)', 'Reps', 'Time (seconds)', 'Distance (ft)',
  'Rest Time (seconds)', 'Effort', 'Primary Muscle Groups', 'Note',
];

function parseSheet(
  input: unknown[],
  sheet: string,
  fileName: string,
  date1904: boolean,
  log: Collector,
  vocab: ParseVocabulary,
  usedIds: Map<string, number>,
): Workout[] {
  const workouts: Workout[] = [];
  const rows: Row[] = input.map((r) => (Array.isArray(r) ? (r as Row) : []));
  const texts: string[][] = rows.map((r) => Array.from(r, cellText));
  const isBlank = (i: number) => texts[i].every((t) => t === '');
  const nonEmpty = (i: number) => texts[i].reduce((n, t) => (t ? n + 1 : n), 0);
  const firstIdx = (i: number) => texts[i].findIndex((t) => t !== '');

  let draft: Draft | null = null;
  let mode: Mode = 'idle';
  let columns: ColumnMap | null = null;
  let zoneCols: { index: number; zone: number }[] = [];
  let ignoredRows = 0;

  /** Value cell for a label row: first non-empty cell after the label. */
  const valueOf = (i: number, labelIdx: number): Cell => {
    const row = rows[i];
    for (let c = labelIdx + 1; c < row.length; c++) {
      if (texts[i][c] !== '') return row[c];
    }
    return null;
  };

  const opensBlock = (i: number): boolean => {
    const f = firstIdx(i);
    if (f < 0) return false;
    const label = texts[i][f];
    return summaryField(label) !== null || isHrSection(label) || isSetsSection(label) || detectHeader(texts[i]) !== null;
  };

  const isTitleRow = (i: number): boolean => {
    if (nonEmpty(i) !== 1) return false;
    const f = firstIdx(i);
    const cell = rows[i][f];
    if (typeof cell !== 'string') return false;
    const label = texts[i][f];
    if (summaryField(label) || isHrSection(label) || isSetsSection(label) || zoneNumber(label) !== null) return false;
    if (parseNumber(label) !== null || !/\p{L}/u.test(label)) return false;
    for (let j = i + 1; j < rows.length && j <= i + 6; j++) {
      if (isBlank(j)) continue;
      const fj = firstIdx(j);
      const next = texts[j][fj];
      // A following start label always means a new block. Otherwise only treat the row as a title
      // when no block is open yet or the open one already has sets; a lone label inside an open
      // summary is a sub-section, not a new workout.
      if (summaryField(next) === 'start') return true;
      if (draft !== null && draft.sets.length === 0) return false;
      return opensBlock(j);
    }
    return false;
  };

  const finish = () => {
    if (!draft) return;
    const d = draft;
    draft = null;
    if (!d.start && d.sets.length === 0) {
      if (d.hasSummary) log.warn('Ignored a workout block with neither a start time nor sets.', sheet, d.firstRow);
      return;
    }
    if (!d.start) log.warn('Workout has no start time.', sheet, d.firstRow);
    if (d.durationSec === null && d.start && d.end) {
      const diff = (isoToMs(d.end) - isoToMs(d.start)) / 1000;
      if (diff >= 0) d.durationSec = diff;
    }
    const title = d.title ?? (d.start ? `Workout ${d.start.slice(0, 10)}` : `Workout (${sheet})`);
    const baseId = stableHash(d.start ? `${d.start}|${title}` : `${sheet}|${d.firstRow}|${title}`);
    const seen = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, seen + 1);
    const id = seen === 0 ? baseId : `${baseId}-${seen + 1}`;
    if (seen > 0) log.warn('Duplicate workout (same start and title) kept separately.', sheet, d.firstRow);
    workouts.push({
      id,
      title,
      start: d.start,
      end: d.end,
      durationSec: d.durationSec,
      totalSets: d.totalSets,
      calories: d.calories,
      tvlLb: d.tvlLb,
      effort: d.effort,
      effortRaw: d.effortRaw,
      hrZonesSec: d.hrZonesSec,
      summaryExtra: d.summaryExtra,
      sets: d.sets.map((s, index) => ({ id: `${id}:${index}`, workoutId: id, index, ...s })),
      sourceFile: fileName,
    });
  };

  const ensureDraft = (row: number): Draft => {
    if (!draft) draft = newDraft(row, null);
    return draft;
  };

  const useHeader = (map: ColumnMap, headerTexts: string[], row: number) => {
    for (const t of headerTexts) if (t) bump(vocab.setHeaders, t);
    for (const t of headerTexts) {
      const u = t ? unitOf(t) : null;
      if (u) bump(vocab.units, u);
    }
    for (const e of map.extra) bump(vocab.unknownColumns, e.header);
    if (!draft || (draft.sets.length > 0 && mode !== 'sets' && mode !== 'setsHeader')) {
      if (draft && draft.sets.length > 0) finish();
      if (!draft) {
        draft = newDraft(row, null);
        log.warn('Set table found without a workout summary; created a workout for it.', sheet, row);
      }
    }
  };

  const readSet = (i: number, map: ColumnMap) => {
    const row = rows[i];
    const t = texts[i];
    const f = map.fields;
    const exerciseRaw = f.exercise !== undefined ? t[f.exercise] ?? '' : '';
    const otherCells = row.filter((c, idx) => idx !== f.exercise && cellText(c) !== '');
    if (!exerciseRaw) {
      if (otherCells.length > 0) log.warn('Set row without an exercise name was skipped.', sheet, i + 1);
      return;
    }
    const d = ensureDraft(i + 1);
    const effortCell = f.effort !== undefined ? row[f.effort] : null;
    const effortText = cellText(effortCell);
    const muscleRaw = f.muscles !== undefined ? t[f.muscles] ?? '' : '';
    const noteText = f.note !== undefined ? t[f.note] ?? '' : '';
    const extra: Record<string, string | number | null> = {};
    for (const e of map.extra) extra[e.header] = rawValue(row[e.index]);
    const muscleKeys: string[] = [];
    for (const part of splitMuscles(muscleRaw)) {
      const key = normalizeKey(part);
      if (key && !muscleKeys.includes(key)) muscleKeys.push(key);
    }
    const exerciseKey = normalizeKey(exerciseRaw) || exerciseRaw.toLowerCase();
    d.sets.push({
      exerciseKey,
      exerciseRaw,
      weightLb: f.weight !== undefined ? scaled(row[f.weight], map.scale.weight) : null,
      reps: f.reps !== undefined ? parseNumber(row[f.reps]) : null,
      durationSec: f.time !== undefined ? scaled(row[f.time], map.scale.time, true) : null,
      distanceFt: f.distance !== undefined ? scaled(row[f.distance], map.scale.distance) : null,
      restSec: f.rest !== undefined ? scaled(row[f.rest], map.scale.rest, true) : null,
      effort: parseNumber(effortCell),
      effortRaw: isNullMarker(effortText) ? null : effortText,
      muscleKeys,
      muscleRaw,
      note: noteText || null,
      extra,
    });
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 1;
    if (isBlank(i)) {
      if (mode === 'sets') mode = 'idle';
      continue;
    }
    const f = firstIdx(i);
    const label = texts[i][f];

    if (isTitleRow(i)) {
      finish();
      draft = newDraft(rowNum, label);
      mode = 'summary';
      continue;
    }

    const field = summaryField(label);
    const cellCount = nonEmpty(i);
    const labelLike = typeof rows[i][f] === 'string' && cellCount <= 3;

    if (field === 'start' && labelLike && (mode !== 'sets' || parseDateTime(valueOf(i, f), date1904) !== null)) {
      if (draft && (draft.startSeen || draft.sets.length > 0)) finish();
      const d = ensureDraft(rowNum);
      d.startSeen = true;
      d.hasSummary = true;
      bump(vocab.summaryLabels, label);
      const u = unitOf(label);
      if (u) bump(vocab.units, u);
      const value = valueOf(i, f);
      d.start = parseDateTime(value, date1904);
      if (d.start === null && cellText(value) !== '') log.warn(`Unreadable start time "${cellText(value).slice(0, 40)}".`, sheet, rowNum);
      mode = 'summary';
      continue;
    }

    if (mode !== 'sets' && isHrSection(label) && cellCount === 1) {
      ensureDraft(rowNum).hasSummary = true;
      bump(vocab.summaryLabels, label);
      mode = 'hrHeader';
      zoneCols = [];
      continue;
    }

    if (mode !== 'sets' && isSetsSection(label) && cellCount === 1) {
      bump(vocab.summaryLabels, label);
      mode = 'setsHeader';
      continue;
    }

    const header = detectHeader(texts[i]);
    if (header) {
      useHeader(header, texts[i], rowNum);
      columns = header;
      mode = 'sets';
      continue;
    }

    if (mode === 'sets' && columns) {
      readSet(i, columns);
      continue;
    }

    if ((mode === 'hrHeader' || (draft && mode === 'summary')) && zoneNumber(label) !== null) {
      zoneCols = [];
      texts[i].forEach((t, index) => {
        const z = t ? zoneNumber(t) : null;
        if (z !== null && z > 0) zoneCols.push({ index, zone: z });
      });
      ensureDraft(rowNum).hasSummary = true;
      mode = 'hrValues';
      continue;
    }

    if (mode === 'hrValues' || mode === 'hrHeader') {
      const cols: { index: number; zone: number }[] = mode === 'hrValues' ? zoneCols : [];
      if (cols.length === 0) {
        texts[i].forEach((t, index) => {
          if (t && index >= f) cols.push({ index, zone: index - f + 1 });
        });
      }
      const zones = new Array<number>(Math.max(5, ...cols.map((c) => c.zone))).fill(0);
      let read = 0;
      let unreadable = 0;
      for (const c of cols) {
        const sec = parseDuration(rows[i][c.index]);
        if (sec !== null && c.zone >= 1) {
          zones[c.zone - 1] = sec;
          read++;
        } else if (texts[i][c.index]) {
          unreadable++;
        }
      }
      // Without a "Zone N" header row, only accept a row made entirely of durations.
      if (read > 0 && (mode === 'hrValues' || unreadable === 0)) {
        ensureDraft(rowNum).hrZonesSec = zones;
        if (unreadable > 0) log.warn('Some heart-rate zone values could not be read.', sheet, rowNum);
        mode = 'summary';
        continue;
      }
      log.warn('Expected heart-rate zone values.', sheet, rowNum);
      mode = 'summary';
      // fall through: the row may still be a summary label
    }

    if (mode === 'setsHeader') {
      const setLike = typeof rows[i][f] === 'string' && rows[i].some((c, idx) => idx !== f && typeof c === 'number');
      const fallback = setLike ? detectHeader(DEFAULT_HEADER) : null;
      if (fallback) {
        log.warn('Set table header not recognized; assuming the standard Motra column order.', sheet, rowNum);
        useHeader(fallback, [], rowNum);
        columns = fallback;
        mode = 'sets';
        readSet(i, fallback);
        continue;
      }
    }

    if (field && labelLike) {
      let d = ensureDraft(rowNum);
      if (d.sets.length > 0) {
        finish();
        d = ensureDraft(rowNum);
      }
      d.hasSummary = true;
      bump(vocab.summaryLabels, label);
      const u = unitOf(label);
      if (u) bump(vocab.units, u);
      const value = valueOf(i, f);
      const unit = (u ?? '').toLowerCase();
      switch (field) {
        case 'end':
          d.end = parseDateTime(value, date1904);
          break;
        case 'duration': {
          const sec = parseDuration(value);
          const factor = /\bmin/.test(unit) ? 60 : /\bh(ou)?rs?\b/.test(unit) ? 3600 : 1;
          d.durationSec = sec === null ? null : sec * factor;
          break;
        }
        case 'totalSets':
          d.totalSets = parseNumber(value);
          break;
        case 'calories':
          d.calories = parseNumber(value);
          break;
        case 'tvl': {
          const n = parseNumber(value);
          d.tvlLb = n === null ? null : /\bkgs?\b|kilo/.test(unit) ? round(n * LB_PER_KG) : n;
          break;
        }
        case 'effort': {
          const t = cellText(value);
          d.effortRaw = isNullMarker(t) ? null : t;
          d.effort = parseNumber(value);
          break;
        }
      }
      if (field !== 'effort' && field !== 'start' && value !== null && cellText(value) !== '' && !isNullMarker(cellText(value))) {
        const parsed = field === 'end' ? d.end : field === 'duration' ? d.durationSec : field === 'totalSets' ? d.totalSets : field === 'calories' ? d.calories : d.tvlLb;
        if (parsed === null) log.warn(`Unreadable value for "${label}".`, sheet, rowNum);
      }
      continue;
    }

    // A blank row inside a set table: keep reading sets when the row still looks like one.
    if (
      mode === 'idle' && columns && draft && draft.sets.length > 0 &&
      f === columns.fields.exercise && rows[i].some((c, idx) => idx !== f && typeof c === 'number')
    ) {
      mode = 'sets';
      readSet(i, columns);
      continue;
    }

    if (draft && mode === 'summary' && labelLike && cellCount <= 2 && /\p{L}/u.test(label)) {
      bump(vocab.summaryLabels, label);
      bump(vocab.unknownSummaryLabels, label);
      const u = unitOf(label);
      if (u) bump(vocab.units, u);
      (draft as Draft).summaryExtra[label] = rawValue(valueOf(i, f));
      continue;
    }

    ignoredRows++;
    if (ignoredRows <= 5) log.warn('Unrecognized row ignored.', sheet, rowNum);
  }
  finish();
  if (ignoredRows > 5) log.warn(`${ignoredRows - 5} more unrecognized rows ignored.`, sheet);
  return workouts;
}

/** Parse with the vocabulary report used by the catalog script. */
export function parseWorkbookDetailed(data: ArrayBuffer | Uint8Array, fileName: string): DetailedParseResult {
  let wb: XLSX.WorkBook;
  try {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  } catch (err) {
    throw new Error(`"${fileName}" could not be read as a spreadsheet${err instanceof Error ? `: ${err.message}` : '.'}`);
  }
  if (!wb || !Array.isArray(wb.SheetNames)) throw new Error(`"${fileName}" could not be read as a spreadsheet.`);

  const log = new Collector(fileName);
  const vocab = emptyVocabulary();
  const workouts: Workout[] = [];
  const usedIds = new Map<string, number>();
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);

  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    let rows: Row[] = [];
    try {
      rows = ws ? (XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null }) ?? []) : [];
    } catch {
      log.warn('Sheet could not be read.', sheet);
    }
    let found: Workout[] = [];
    try {
      found = parseSheet(rows, sheet, fileName, date1904, log, vocab, usedIds);
    } catch (err) {
      log.warn(`Sheet skipped after an unexpected error${err instanceof Error ? `: ${err.message}` : ''}.`, sheet);
    }
    vocab.sheets.push({ name: sheet, rows: rows.length, workouts: found.length });
    workouts.push(...found);
  }
  if (workouts.length === 0) log.warn('No workouts were found in this file.');
  return { workouts, warnings: log.finish(), vocabulary: vocab };
}

/** Parse a Motra export. Throws only when the file is not a readable workbook. */
export function parseWorkbook(data: ArrayBuffer | Uint8Array, fileName: string): ParseResult {
  const { workouts, warnings } = parseWorkbookDetailed(data, fileName);
  return { workouts, warnings };
}
