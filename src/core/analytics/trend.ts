/** Session e1RM trend, rate of gain and status labels (research §3.4). */
import type { ExerciseCtx, Session } from './context.ts';
import type { SeriesPoint, TrendStatus, Window } from './types.ts';
import { addDays, DAY_MS, finiteOrNull, median, sliceRange } from './util.ts';

const HALF_LIFE_DAYS = 21;
const RATE_DAYS = 90;
const MIN_SESSIONS = 4;
const MIN_SPAN_DAYS = 21;
const FLAT_RATE = 1;

/** EWMA with a 21-day half-life: α = 1 − 0.5^(Δdays/21). */
export function ewma(points: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let s = 0;
  let prev = 0;
  for (const [i, p] of points.entries()) {
    if (i === 0) s = p.value;
    else {
      const dt = Math.max(0, (p.date.getTime() - prev) / DAY_MS);
      s += (1 - 0.5 ** (dt / HALF_LIFE_DAYS)) * (p.value - s);
    }
    prev = p.date.getTime();
    out.push({ date: p.date, value: s });
  }
  return out;
}

/** Theil–Sen slope (median of pairwise slopes) in value per day; null without distinct days. */
export function theilSen(points: SeriesPoint[]): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dt = (points[j].date.getTime() - points[i].date.getTime()) / DAY_MS;
      if (Math.abs(dt) >= 0.5) slopes.push((points[j].value - points[i].value) / dt);
    }
  }
  return median(slopes);
}

/** Session e1RM points for the sessions that have one. */
export function e1rmPoints(sessions: Session[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const s of sessions) if (s.e1rm) out.push({ date: s.date, value: s.e1rm.e1rm });
  return out;
}

/**
 * %/month over the last 90 days of the window: Theil–Sen slope × 30.44 ÷ median e1RM × 100.
 * Needs ≥ 4 sessions spanning ≥ 21 days.
 */
export function ratePerMonth(ex: ExerciseCtx, win: Window): number | null {
  const from90 = addDays(win.end, -RATE_DAYS);
  const start = win.start && win.start > from90 ? win.start : from90;
  const [a, b] = sliceRange(ex.sessionTimes, start, win.end);
  const pts = e1rmPoints(ex.sessions.slice(a, b));
  if (pts.length < MIN_SESSIONS) return null;
  if ((pts[pts.length - 1].date.getTime() - pts[0].date.getTime()) / DAY_MS < MIN_SPAN_DAYS) return null;
  const slope = theilSen(pts);
  const med = median(pts.map((p) => p.value));
  if (slope === null || !med) return null;
  return finiteOrNull((slope * 30.44 * 100) / med);
}

/**
 * progressing (> +1%/mo), dip (< −1%/mo); otherwise plateau when no e1RM PR in
 * the last 5 sessions and none within 28 days, else progressing.
 */
export function trendStatus(ex: ExerciseCtx, rate: number | null, win: Window): TrendStatus {
  if (rate === null) return 'insufficient';
  if (rate > FLAT_RATE) return 'progressing';
  if (rate < -FLAT_RATE) return 'dip';
  const [, b] = sliceRange(ex.sessionTimes, null, win.end);
  const recentFrom = addDays(win.end, -28).getTime();
  for (let i = b - 1; i >= 0; i--) {
    const s = ex.sessions[i];
    if (b - i > 5 && s.date.getTime() < recentFrom) break;
    if (s.prTypes.includes('e1rm')) return 'progressing';
  }
  return 'plateau';
}

/** Running all-time max of session e1RM (step line). */
export function prEnvelope(points: SeriesPoint[]): SeriesPoint[] {
  let max = 0;
  return points.map((p) => {
    max = Math.max(max, p.value);
    return { date: p.date, value: max };
  });
}
