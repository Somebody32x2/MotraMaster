/** Personal records per exercise (research §3.6, outlier rule §3.5). */
import type { ExerciseCtx, Session } from './context.ts';
import type { EnrichedSet, PrEvent, PrType } from './types.ts';
import { DAY_MS } from './util.ts';

interface Point {
  w: number;
  r: number;
}

/** e1RM jump above this multiple of the previous 30-day best is held until a second session confirms it. */
const OUTLIER_JUMP = 1.25;

function event(ex: ExerciseCtx, sess: Session, type: PrType, set: { weightLb: number | null; reps: number | null }, value: number, previous: number | null): PrEvent {
  return {
    date: sess.date,
    workoutId: sess.workoutId,
    exerciseKey: ex.key,
    exerciseName: ex.name,
    type,
    weightLb: set.weightLb,
    reps: set.reps,
    value,
    previous,
  };
}

/**
 * Walk an exercise's sessions chronologically. The first session is the
 * baseline (no events); later sessions are compared against all earlier ones.
 * At most one event per type per session, except Pareto rep PRs (one per new frontier point).
 * Fills `session.prTypes` and returns events in order.
 */
export function detectPrs(ex: ExerciseCtx): PrEvent[] {
  const out: PrEvent[] = [];
  let maxWeight = 0;
  let maxE1rm = 0;
  let maxSetVol = 0;
  let maxSessVol = 0;
  let frontier: Point[] = [];
  const e1rmHist: { t: number; v: number }[] = [];

  ex.sessions.forEach((sess, i) => {
    const lifts = sess.sets.filter((s) => s.reps !== null && s.reps >= 1);
    const baseline = i === 0;
    const types = new Set<PrType>();
    let top: EnrichedSet | null = null;
    let topVol: EnrichedSet | null = null;
    for (const s of lifts) {
      const w = s.weightLb ?? 0;
      if (w > 0 && (!top || w > top.weightLb! || (w === top.weightLb && s.reps! > top.reps!))) top = s;
      if (w > 0 && (!topVol || s.volumeLb > topVol.volumeLb)) topVol = s;
    }

    if (!baseline) {
      if (top && maxWeight > 0 && top.weightLb! > maxWeight) {
        out.push(event(ex, sess, 'weight', top, top.weightLb!, maxWeight));
        types.add('weight');
      }

      const e = sess.e1rm;
      if (e && maxE1rm > 0 && e.e1rm > maxE1rm) {
        const t = sess.date.getTime();
        let best30 = 0;
        for (const h of e1rmHist) if (h.t >= t - 30 * DAY_MS && h.v > best30) best30 = h.v;
        // Suspected miscount (> 25% over the 30-day best): hold the record until another session reaches it.
        if (!(best30 > 0 && e.e1rm > best30 * OUTLIER_JUMP)) {
          out.push(event(ex, sess, 'e1rm', e, e.e1rm, maxE1rm));
          types.add('e1rm');
        }
      }

      // Pareto rep PRs: (w, r) not dominated by any earlier set; skip new-weight sets (already weight PRs).
      const candidates: Point[] = [];
      for (const s of lifts) {
        const p = { w: s.weightLb ?? 0, r: s.reps! };
        if (p.w > maxWeight || p.w < 0) continue;
        if (frontier.some((f) => f.w >= p.w && f.r >= p.r)) continue;
        if (candidates.some((c) => c.w >= p.w && c.r >= p.r)) continue;
        for (let k = candidates.length - 1; k >= 0; k--) {
          if (p.w >= candidates[k].w && p.r >= candidates[k].r) candidates.splice(k, 1);
        }
        candidates.push(p);
      }
      for (const p of candidates.sort((a, b) => b.w - a.w)) {
        let prev: number | null = null;
        for (const f of frontier) if (f.w >= p.w && (prev === null || f.r > prev)) prev = f.r;
        out.push(event(ex, sess, 'reps', { weightLb: p.w > 0 ? p.w : null, reps: p.r }, p.r, prev));
        types.add('reps');
      }

      if (topVol && maxSetVol > 0 && topVol.volumeLb > maxSetVol) {
        out.push(event(ex, sess, 'setVolume', topVol, topVol.volumeLb, maxSetVol));
        types.add('setVolume');
      }
      if (maxSessVol > 0 && sess.volumeLb > maxSessVol) {
        out.push(event(ex, sess, 'sessionVolume', { weightLb: null, reps: null }, sess.volumeLb, maxSessVol));
        types.add('sessionVolume');
      }
    }

    if (top) maxWeight = Math.max(maxWeight, top.weightLb!);
    if (topVol) maxSetVol = Math.max(maxSetVol, topVol.volumeLb);
    maxSessVol = Math.max(maxSessVol, sess.volumeLb);
    if (sess.e1rm) {
      // An unconfirmed outlier stays out of the record but enters the history, so a repeat confirms it.
      if (baseline || types.has('e1rm') || sess.e1rm.e1rm <= maxE1rm) maxE1rm = Math.max(maxE1rm, sess.e1rm.e1rm);
      else if (maxE1rm === 0) maxE1rm = sess.e1rm.e1rm;
      e1rmHist.push({ t: sess.date.getTime(), v: sess.e1rm.e1rm });
    }
    for (const s of lifts) {
      const p = { w: Math.max(0, s.weightLb ?? 0), r: s.reps! };
      if (frontier.some((f) => f.w >= p.w && f.r >= p.r)) continue;
      frontier = frontier.filter((f) => !(p.w >= f.w && p.r >= f.r));
      frontier.push(p);
    }
    sess.prTypes = [...types];
  });
  return out;
}
