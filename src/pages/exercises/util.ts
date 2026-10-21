import type { AnalysisIndex, SeriesPoint, Window } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import type { LinePoint } from '../../ui/charts'
import { formatNumber, toDisplayWeight, unitLabel } from '../../ui/format'

export function inWindow(d: Date, win: Window): boolean {
  const t = d.getTime()
  return (win.start == null || t >= win.start.getTime()) && t <= win.end.getTime()
}

/** Chart values must already be in display units so axis ticks read correctly. */
export function weightPoints(points: SeriesPoint[], units: Units): LinePoint[] {
  return points.map((p) => ({ x: p.date, y: toDisplayWeight(p.value, units) }))
}

/** Turns a running-max series into a step line (holds each value until the next change). */
export function stepPoints(points: LinePoint[]): LinePoint[] {
  const out: LinePoint[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const prev = out[out.length - 1]
    if (prev && prev.y !== p.y) out.push({ x: p.x, y: prev.y })
    out.push(p)
  }
  return out
}

/** Formatter for chart values that are already converted to display units. */
export function displayWeightFormat(units: Units, opts: { compact?: boolean } = {}): (n: number) => string {
  const unit = unitLabel(units)
  return (n) => `${formatNumber(n, { compact: opts.compact, maxDecimals: units === 'kg' && Math.abs(n) < 1000 ? 1 : 0 })} ${unit}`
}

export interface RepStats {
  /** Σ reps over the window. */
  totalReps: number
  /** Most reps in one set. */
  bestReps: number | null
  /** Longest timed set (sec), for holds/carries without reps. */
  bestDurationSec: number | null
}

/** Rep/duration stats per exercise for bodyweight and timed work (no e1RM exists for these). */
export function repStatsByExercise(idx: AnalysisIndex, win: Window): Map<string, RepStats> {
  const out = new Map<string, RepStats>()
  for (const s of idx.sets) {
    if (!inWindow(s.date, win)) continue
    let r = out.get(s.exerciseKey)
    if (!r) {
      r = { totalReps: 0, bestReps: null, bestDurationSec: null }
      out.set(s.exerciseKey, r)
    }
    if (s.reps != null && s.reps > 0) {
      r.totalReps += s.reps
      if (r.bestReps == null || s.reps > r.bestReps) r.bestReps = s.reps
    }
    if (s.durationSec != null && s.durationSec > 0 && (s.reps == null || s.reps === 0)) {
      if (r.bestDurationSec == null || s.durationSec > r.bestDurationSec) r.bestDurationSec = s.durationSec
    }
  }
  return out
}

/** Equipment/lift-specific estimate caveats (research §3.5), derived from the exercise name. */
export function exerciseCaveats(name: string): string[] {
  const n = name.toLowerCase()
  const out: string[] = []
  if (/machine|smith|cable|lever|sled|hammer strength|selectorized|pulldown|pec deck|leg press|leg extension|leg curl/.test(n)) {
    out.push('Machine numbers are stack or plate values; they are only comparable on this same machine, never across brands or to free weights.')
  }
  if (/dumbbell|\bdb\b|kettlebell/.test(n)) {
    out.push('Dumbbell and kettlebell weights are logged per hand, so the estimate is per hand too.')
  }
  if (/deadlift|rdl|romanian|rack pull/.test(n)) {
    out.push('Rep-based formulas tend to under-predict deadlift-type pulls (LeSuer 1997).')
  }
  return out
}
