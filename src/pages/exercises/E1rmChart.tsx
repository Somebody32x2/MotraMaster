import type { ExerciseDetail } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { navigate, paths } from '../../router'
import { LineChart, type LineMarker, type LinePoint, type LineSeries } from '../../ui/charts'
import { formatDate, formatNumber, formatWeight, toDisplayWeight } from '../../ui/format'
import { displayWeightFormat, stepPoints, weightPoints } from './util'

const dateLabel = (x: Date | number) => formatDate(x instanceof Date ? x : new Date(x), 'medium')

/** Session e1RM points, 21-day EWMA trend, dashed best-so-far envelope and e1RM PR markers. */
export function E1rmChart({ d, units, height = 260 }: { d: ExerciseDetail; units: Units; height?: number }) {
  const sessions = d.sessionsE1rm
  const sessionPoints: LinePoint[] = sessions.map((s) => ({
    x: s.date,
    y: toDisplayWeight(s.e1rm, units),
    label: `${formatWeight(s.weightLb, units)} × ${formatNumber(s.reps, { maxDecimals: 0 })}${s.confidence === 'medium' ? ' · medium confidence' : ''}`,
  }))
  const series: LineSeries[] = [
    { id: 'session', label: 'Session e1RM', color: 'var(--text-faint)', points: sessionPoints, showPoints: true },
  ]
  if (d.trend.length > 1) {
    series.push({ id: 'trend', label: 'Trend (21-day)', color: 'var(--accent)', points: weightPoints(d.trend, units) })
  }
  if (d.prEnvelope.length > 1) {
    series.push({ id: 'best', label: 'Best so far', color: 'var(--c2)', dashed: true, points: stepPoints(weightPoints(d.prEnvelope, units)) })
  }
  const markers: LineMarker[] = d.prs
    .filter((p) => p.type === 'e1rm')
    .map((p) => ({ x: p.date, label: `e1RM PR · ${formatWeight(p.value, units)}` }))

  return (
    <LineChart
      series={series}
      markers={markers}
      height={height}
      yFormat={displayWeightFormat(units)}
      xFormat={dateLabel}
      emptyText="No weighted sets to estimate a 1RM from in this range."
      ariaLabel={`Estimated 1RM for ${d.name} across ${sessions.length} sessions`}
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
