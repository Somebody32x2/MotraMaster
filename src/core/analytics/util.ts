/** Date and statistics helpers shared by the analytics modules. All dates are local. */
export const DAY_MS = 86_400_000;

/** Local wall-clock parse of `YYYY-MM-DD[ T]HH:mm[:ss]` (mirrors ui/format parseLocalIso); null when invalid. */
export function parseLocalIso(iso: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(iso.trim());
  const d = m
    ? new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0)
    : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendar-day shift (DST-safe), keeping the time of day. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/** Monday 00:00 local of the ISO week containing `d`. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

/** Whole calendar days from a to b. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

export function dayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** 00:00 of the first day of the `days`-day span ending on `end`'s day. */
export function spanStart(end: Date, days: number): Date {
  return addDays(startOfDay(end), -(days - 1));
}

/** First index with arr[i] >= t. */
export function lowerBound(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index with arr[i] > t. */
export function upperBound(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index range [from, to) of sorted times within [start, end]. */
export function sliceRange(times: number[], start: Date | null, end: Date): [number, number] {
  return [start ? lowerBound(times, start.getTime()) : 0, upperBound(times, end.getTime())];
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function finiteOrNull(x: number): number | null {
  return Number.isFinite(x) ? x : null;
}

/** Counts → shares summing to 1; all zeros when empty. */
export function shares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  return total > 0 ? counts.map((c) => c / total) : counts.map(() => 0);
}

/** Finite number or null. */
export function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

/** Bucket index for value against ascending upper bounds (value < bounds[i] → i). */
export function bucket(value: number, bounds: number[]): number {
  let i = 0;
  while (i < bounds.length && value >= bounds[i]) i++;
  return i;
}
