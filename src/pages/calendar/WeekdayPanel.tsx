import type { WeekdayStat } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { EMPTY, formatNumber, formatPercent } from '../../ui/format'
import { RegionChips } from '../../ui/widgets'
import { WEEKDAY_LONG, WEEKDAY_SHORT, type MetricDef, type MetricScale } from './metrics'

export interface WeekdayPanelProps {
  weekdays: WeekdayStat[]
  metric: MetricDef
  /** The day scale, so weekday averages share the calendar's colors. */
  scale: MetricScale
  units: Units
  /** Weekday index with the most workouts, or null when there are none. */
  topDay: number | null
}

/** Seven rows, Monday first: how often each weekday is trained, the chosen metric's average and the usual muscles. */
export function WeekdayPanel({ weekdays, metric, scale, units, topDay }: WeekdayPanelProps) {
  const rows = [...weekdays].sort((a, b) => a.weekday - b.weekday)
  const avgHeader = `Avg ${metric.noun}`
  return (
    <div class="wd-list" role="table" aria-label="Training by day of the week">
      <div class="wd-row wd-row--head" role="row">
        <span role="columnheader">Day</span>
        <span role="columnheader">Hit rate</span>
        <span role="columnheader" class="wd-num">
          Workouts
        </span>
        <span role="columnheader" class="wd-num">
          {avgHeader}
        </span>
        <span role="columnheader" class="wd-regions">
          Usually trains
        </span>
      </div>
      {rows.map((w) => {
        const avg = w.avg[metric.value]
        const level = w.workouts > 0 ? scale.level(avg) : 0
        const top = w.weekday === topDay
        return (
          <div key={w.weekday} class={`wd-row${top ? ' is-top' : ''}${w.workouts === 0 ? ' is-empty' : ''}`} role="row">
            <span class="wd-day" role="rowheader">
              <span aria-hidden="true">{WEEKDAY_SHORT[w.weekday]}</span>
              <span class="sr-only">{WEEKDAY_LONG[w.weekday]}</span>
              {top && <span class="wd-top">Most common</span>}
            </span>
            <span
              class="wd-hit"
              role="cell"
              data-label="Hit rate"
              title={`Trained on ${formatPercent(w.hitRate)} of ${WEEKDAY_LONG[w.weekday]}s in this range`}
            >
              <span class="wd-hit__pct num">{formatPercent(w.hitRate, { decimals: 0 })}</span>
              <span class="wd-bar" aria-hidden="true">
                <span class="wd-bar__fill" style={{ width: `${Math.max(0, Math.min(1, w.hitRate)) * 100}%` }} />
              </span>
            </span>
            <span class="wd-num num" role="cell" data-label="Workouts">
              {formatNumber(w.workouts, { maxDecimals: 0 })}
              <span class="faint wd-share"> · {formatPercent(w.share, { decimals: 0 })}</span>
            </span>
            <span class="wd-num wd-avg num" role="cell" data-label={avgHeader}>
              {level > 0 && <span class={`cal-swatch cal-day--l${level}`} aria-hidden="true" />}
              {w.workouts > 0 ? metric.format(avg, units) : <span class="faint">{EMPTY}</span>}
            </span>
            <span class="wd-regions" role="cell">
              {w.topRegions.length ? <RegionChips regions={w.topRegions} max={3} /> : <span class="faint">{EMPTY}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
