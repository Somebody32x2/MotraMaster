/**
 * Scale, tick and formatting helpers shared by every chart.
 * Pure functions, no DOM access — safe to unit test.
 */

export type XValue = Date | number;

export const DAY_MS = 86_400_000;

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
  invert(px: number): number;
}

export interface TimeScale {
  (value: XValue): number;
  domain: [number, number];
  range: [number, number];
  invert(px: number): Date;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function toNumber(x: XValue): number {
  return x instanceof Date ? x.getTime() : x;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Maps `domain` linearly onto `range`. A degenerate domain (min === max)
 * maps every value to the middle of the range instead of dividing by zero.
 */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const degenerate = !Number.isFinite(span) || span === 0;
  const scale = ((v: number) => (degenerate ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))) as LinearScale;
  scale.domain = [d0, d1];
  scale.range = [r0, r1];
  scale.invert = (px: number) => {
    const rs = r1 - r0;
    if (degenerate || rs === 0) return d0;
    return d0 + ((px - r0) / rs) * span;
  };
  return scale;
}

/** Linear scale over epoch milliseconds that accepts Dates or numbers. */
export function timeScale(domain: readonly [XValue, XValue], range: readonly [number, number]): TimeScale {
  const inner = linearScale([toNumber(domain[0]), toNumber(domain[1])], range);
  const scale = ((v: XValue) => inner(toNumber(v))) as TimeScale;
  scale.domain = inner.domain;
  scale.range = inner.range;
  scale.invert = (px: number) => new Date(inner.invert(px));
  return scale;
}

function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = 10 ** exp;
  const f = rough / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * base;
}

function decimalsFor(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  return clamp(-Math.floor(Math.log10(step) + 1e-9), 0, 12);
}

/**
 * "Nice" tick values (multiples of 1, 2 or 5 × 10ⁿ) covering [min, max]:
 * the first tick is ≤ min and the last ≥ max, so charts can use the
 * outer ticks as their value domain. Equal bounds are widened so a flat
 * series still gets a sensible axis. Returns [] for non-finite input.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (lo === hi) {
    if (lo === 0) {
      hi = 1;
    } else {
      const pad = Math.abs(lo) * 0.1;
      lo -= pad;
      hi += pad;
    }
  }
  const n = Math.max(1, Math.round(count));
  const step = niceStep((hi - lo) / n);
  const decimals = decimalsFor(step);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const raw = start + i * step;
    if (raw > end + step * 1e-6) break;
    const v = Number(raw.toFixed(decimals));
    ticks.push(v === 0 ? 0 : v);
  }
  return ticks;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function numberFormat(min: number, max: number): Intl.NumberFormat {
  const key = `${min}:${max}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });
    nfCache.set(key, f);
  }
  return f;
}

/** General-purpose value format: grouping, at most 1–2 decimals. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 1000) return numberFormat(0, 0).format(n);
  if (abs >= 10) return numberFormat(0, 1).format(n);
  return numberFormat(0, 2).format(n);
}

/** Axis label formatter with a precision consistent across all `ticks`. */
export function makeTickFormat(ticks: readonly number[]): (n: number) => string {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  let maxAbs = 0;
  for (const t of ticks) maxAbs = Math.max(maxAbs, Math.abs(t));
  if (maxAbs >= 1e7) {
    const d = Math.min(2, decimalsFor(step / 1e6));
    const f = numberFormat(d, d);
    return (n) => (n === 0 ? '0' : `${f.format(n / 1e6)}M`);
  }
  if (maxAbs >= 1e4) {
    const d = Math.min(2, decimalsFor(step / 1e3));
    const f = numberFormat(d, d);
    return (n) => (n === 0 ? '0' : `${f.format(n / 1e3)}K`);
  }
  const d = Math.min(6, decimalsFor(step));
  const f = numberFormat(d, d);
  return (n) => f.format(n);
}

export type TimeUnit = 'day' | 'week' | 'month' | 'year';

export interface TimeTick {
  value: Date;
  label: string;
  unit: TimeUnit;
}

const UNIT_MS: Record<TimeUnit, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30.44 * DAY_MS,
  year: 365.25 * DAY_MS,
};

const INTERVALS: ReadonlyArray<readonly [TimeUnit, number]> = [
  ['day', 1],
  ['day', 2],
  ['week', 1],
  ['week', 2],
  ['month', 1],
  ['month', 2],
  ['month', 3],
  ['month', 6],
  ['year', 1],
  ['year', 2],
  ['year', 5],
  ['year', 10],
  ['year', 25],
  ['year', 50],
  ['year', 100],
];

const dayMonthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
const fullDateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const weekdayDateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** "Oct 21, 2026" */
export function formatDate(d: XValue): string {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '–' : fullDateFmt.format(date);
}

/** "Wed, Oct 21, 2026" */
export function formatDateLong(d: XValue): string {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '–' : weekdayDateFmt.format(date);
}

/** "Oct 21" */
export function formatDayMonth(d: XValue): string {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '–' : dayMonthFmt.format(date);
}

export function startOfDay(d: XValue): Date {
  const date = new Date(toNumber(d));
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Monday 00:00 of the week containing `d` (local time). */
export function startOfWeek(d: XValue): Date {
  const date = startOfDay(d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

/** Monday-first weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Calendar-day key `YYYY-MM-DD` in local time. */
export function dayKey(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`;
}

function addUnits(d: Date, unit: TimeUnit, n: number): Date {
  const next = new Date(d.getTime());
  if (unit === 'day') next.setDate(next.getDate() + n);
  else if (unit === 'week') next.setDate(next.getDate() + 7 * n);
  else if (unit === 'month') next.setMonth(next.getMonth() + n);
  else next.setFullYear(next.getFullYear() + n);
  return next;
}

function firstBoundary(start: Date, unit: TimeUnit, n: number): Date {
  if (unit === 'day') {
    const d = startOfDay(start);
    return d.getTime() < start.getTime() ? addUnits(d, 'day', 1) : d;
  }
  if (unit === 'week') {
    const d = startOfWeek(start);
    return d.getTime() < start.getTime() ? addUnits(d, 'week', 1) : d;
  }
  if (unit === 'month') {
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    let cur = d.getTime() < start.getTime() ? addUnits(d, 'month', 1) : d;
    while (cur.getMonth() % n !== 0) cur = addUnits(cur, 'month', 1);
    return cur;
  }
  let year = start.getFullYear();
  if (new Date(year, 0, 1).getTime() < start.getTime()) year += 1;
  year = Math.ceil(year / n) * n;
  return new Date(year, 0, 1);
}

function tickLabel(d: Date, unit: TimeUnit): string {
  if (unit === 'year') return String(d.getFullYear());
  if (unit === 'month') return d.getMonth() === 0 ? String(d.getFullYear()) : monthFmt.format(d);
  return dayMonthFmt.format(d);
}

/**
 * Calendar-aligned ticks between `start` and `end` (inclusive), choosing
 * day / week (Mondays) / month / year granularity so that at most `count`
 * ticks are produced. Labels are short: "Oct 21", "Oct", "2027".
 */
export function timeTicks(start: XValue, end: XValue, count = 6): TimeTick[] {
  let s = toNumber(start);
  let e = toNumber(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return [];
  if (s > e) [s, e] = [e, s];
  const max = Math.max(1, Math.floor(count));
  const span = e - s;
  let chosen: readonly [TimeUnit, number] = INTERVALS[INTERVALS.length - 1];
  for (const iv of INTERVALS) {
    if (span / (UNIT_MS[iv[0]] * iv[1]) <= max) {
      chosen = iv;
      break;
    }
  }
  const [unit, n] = chosen;
  const ticks: TimeTick[] = [];
  let cur = firstBoundary(new Date(s), unit, n);
  for (let i = 0; i < 500 && cur.getTime() <= e; i++) {
    ticks.push({ value: cur, label: tickLabel(cur, unit), unit });
    cur = addUnits(cur, unit, n);
  }
  return ticks;
}

/** Compact formatter with one compaction level for all ticks; optional unit suffix (e.g. ' lb'). */
export function compactTickFormatter(ticks: readonly number[], unit = ''): (n: number) => string {
  const base = makeTickFormat(ticks);
  return (n) => `${base(n)}${unit}`;
}

/**
 * Formats axis ticks. With a caller format, labels that mix compacted (K/M)
 * and plain values are re-formatted with one compaction level, keeping the unit suffix.
 */
export function formatTicks(ticks: readonly number[], format?: (n: number) => string): string[] {
  if (!format) return ticks.map(makeTickFormat(ticks));
  const labels = ticks.map(format);
  const compact = /\d(?:[.,]\d+)?\s?[kKmM]\b/;
  const hits = labels.filter((l) => compact.test(l)).length;
  if (hits === 0 || hits === labels.length) return labels;
  const sample = labels.find((l) => compact.test(l)) ?? '';
  const unit = /[\d.,]\s?[kKmM]?(\s*[^\d\s.,][^\d]*)$/.exec(sample)?.[1] ?? '';
  return ticks.map(compactTickFormatter(ticks, unit.replace(/^[kKmM]/, '')));
}
