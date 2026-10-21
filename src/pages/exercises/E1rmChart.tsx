import type { ExerciseDetail, SessionStrength } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { navigate, paths } from '../../router'
import { LineChart, type LineMarker, type LinePoint, type LineSeries } from '../../ui/charts'
import { formatDate, formatNumber, formatWeight, toDisplayWeight } from '../../ui/format'
import { formatHold } from '../../ui/widgets'
import { describeLoadedSet, displayWeightFormat, holdFormat, stepPoints, weightPoints } from './util'

const dateLabel = (x: Date | number) => formatDate(x instanceof Date ? x : new Date(x), 'medium')

/** Session strength points (active metric), 21-day EWMA trend, dashed best-so-far envelope and PR markers. */
export function E1rmChart({ d, units, height = 260 }: { d: ExerciseDetail; units: Units; height?: number }) {
  const actual = d.metric === 'actual'
  const sessions = d.sessionsStrength
  const sessionPoints: LinePoint[] = sessions.map((s) => {
    const set = loggedSet(d, s, units)
    const label = actual
      ? `${set}${s.loadBasis === 'external' || s.loadBasis === 'bodyweightUnknown' ? ` ${s.reps === 1 ? 'rep' : 'reps'}` : ''}${s.e1rm != null && Number.isFinite(s.e1rm) ? ` · e1RM ${formatWeight(s.e1rm, units)}` : ''}`
      : `${formatWeight(s.value, units)} e1RM · from ${set}${s.confidence === 'medium' ? ' · medium confidence' : ''}`
    return { x: s.date, y: toDisplayWeight(s.value, units), label }
  })
  const series: LineSeries[] = [
    { id: 'session', label: actual ? 'Heaviest set' : 'Session e1RM', color: 'var(--text)', points: sessionPoints, showPoints: true },
  ]
  if (d.trend.length > 1) {
    series.push({ id: 'trend', label: 'Trend (21-day)', color: 'var(--accent)', points: weightPoints(d.trend, units) })
  }
  if (d.prEnvelope.length > 1) {
    series.push({ id: 'best', label: 'Best so far', color: 'var(--c2)', dashed: true, points: stepPoints(weightPoints(d.prEnvelope, units)) })
  }
  const prType = actual ? 'weight' : 'e1rm'
  const markers: LineMarker[] = d.prs
    .filter((p) => p.type === prType)
    .map((p) => ({ x: p.date, label: `${actual ? 'Weight' : 'e1RM'} PR · ${formatWeight(p.value, units)}` }))

  return (
    <LineChart
      series={series}
      markers={markers}
      height={height}
      yFormat={displayWeightFormat(units)}
      xFormat={dateLabel}
      emptyText={actual ? 'No weighted sets in this range.' : 'No weighted sets to estimate a 1RM from in this range.'}
      ariaLabel={`${actual ? 'Heaviest set' : 'Estimated 1RM'} for ${d.name} across ${sessions.length} sessions`}
      onPointClick={(p) => {
        if (p.seriesId !== 'session') return
        const s = sessions[p.index]
        if (s) navigate(paths.workout(s.workoutId))
      }}
    />
  )
}

/** The logged set behind a session point, with bodyweight spelled out ('BW + 25 lb × 8 = 205 lb'). */
function loggedSet(d: ExerciseDetail, s: SessionStrength, units: Units): string {
  const row = d.history.find((r) => r.workoutId === s.workoutId)
  const match = row?.sets.find((x) => x.reps === s.reps && x.loadLb != null && Math.abs(x.loadLb - s.weightLb) < 0.01)
  if (match) return describeLoadedSet(match, units)
  return `${formatWeight(s.weightLb, units)} × ${formatNumber(s.reps, { maxDecimals: 0 })}`
}

/** Timed exercises: longest hold per session (seconds), trend and best-so-far. */
export function HoldChart({ d, units, height = 260 }: { d: ExerciseDetail; units: Units; height?: number }) {
  const sessions = d.sessionsStrength
  const sessionPoints: LinePoint[] = sessions.map((s) => {
    const hold = s.holdSec ?? s.value
    const label = `${formatHold(hold)} hold${s.weightLb > 0 ? ` · +${formatWeight(s.weightLb, units)}` : ' · no added weight'}`
    return { x: s.date, y: hold, label }
  })
  const series: LineSeries[] = [
    { id: 'session', label: 'Longest hold', color: 'var(--text)', points: sessionPoints, showPoints: true },
  ]
  const raw = (pts: { date: Date; value: number }[]): LinePoint[] => pts.map((p) => ({ x: p.date, y: p.value }))
  if (d.trend.length > 1) series.push({ id: 'trend', label: 'Trend (21-day)', color: 'var(--accent)', points: raw(d.trend) })
  if (d.prEnvelope.length > 1) {
    series.push({ id: 'best', label: 'Best so far', color: 'var(--c2)', dashed: true, points: stepPoints(raw(d.prEnvelope)) })
  }
  const markers: LineMarker[] = d.prs.filter((p) => p.type === 'hold').map((p) => ({ x: p.date, label: `Hold PR · ${formatHold(p.value)}` }))
  return (
    <LineChart
      series={series}
      markers={markers}
      height={height}
      yFormat={holdFormat}
      xFormat={dateLabel}
      emptyText="No timed sets in this range."
      ariaLabel={`Longest hold for ${d.name} across ${sessions.length} sessions`}
      onPointClick={(p) => {
        if (p.seriesId !== 'session') return
        const s = sessions[p.index]
        if (s) navigate(paths.workout(s.workoutId))
      }}
    />
  )
}

/** Generic dated series (top weight, session volume, reps) in display units. */
export function SimpleLineChart({
  points,
  label,
  format,
  height = 200,
  empty,
  area,
  color,
}: {
  points: LinePoint[]
  label: string
  format: (n: number) => string
  height?: number
  empty: string
  area?: boolean
  color?: string
}) {
  return (
    <LineChart
      series={[{ id: 's', label, points, area, showPoints: points.length <= 40, color: color ?? 'var(--accent)' }]}
      height={height}
      yFormat={format}
      xFormat={dateLabel}
      emptyText={empty}
      ariaLabel={label}
    />
  )
}
