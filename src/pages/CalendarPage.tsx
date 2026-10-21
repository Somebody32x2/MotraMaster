import { useMemo, useState } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { calendarStats, workoutSummaries } from '../core/analytics'
import type { DayMetric, WeekdayStat, WorkoutSummary } from '../core/analytics/types'
import { detailed, settings } from '../state'
import { Card } from '../ui/components/Card'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { Select } from '../ui/components/Select'
import { StatTile } from '../ui/components/StatTile'
import { formatNumber, formatPercent, plural } from '../ui/format'
import { IconCalendar } from '../ui/icons'
import { MonthCalendar } from './calendar/MonthCalendar'
import { METRIC_BY_ID, METRICS, WEEKDAY_LONG, formatClock, hourRange, loadMetric, quantileScale, saveMetric } from './calendar/metrics'
import { HourBars, WeekdayHourGrid } from './calendar/TimeOfDay'
import { WeekdayPanel } from './calendar/WeekdayPanel'
import { WeekdayTable } from './calendar/WeekdayTable'
import { activeRange } from './overview/util'
import './calendar/calendar.css'

const METRIC_OPTIONS = METRICS.map((m) => ({ value: m.value, label: m.label }))
const DAY_MS = 86_400_000

export default function CalendarPage() {
  const idx = analysisIndex.value
  const win = analysisWindow.value
  const units = settings.value.units
  const isDetailed = detailed.value
  const [metricId, setMetricId] = useState<DayMetric>(loadMetric)
  const metric = METRIC_BY_ID[metricId]

  const stats = useMemo(() => (idx ? calendarStats(idx, win) : null), [idx, win])
  const summaries = useMemo(() => {
    const m = new Map<string, WorkoutSummary>()
    if (idx) for (const s of workoutSummaries(idx, win)) m.set(s.workout.id, s)
    return m
  }, [idx, win])
  const scale = useMemo(
    () => quantileScale(stats ? stats.days.filter((d) => d.workoutIds.length > 0).map((d) => d.metrics[metricId]) : []),
    [stats, metricId],
  )

  const facts = useMemo(() => {
    if (!stats) return null
    let workouts = 0
    let trainingDays = 0
    let longestGap = 0
    let prev: Date | null = null
    for (const d of stats.days) {
      if (d.workoutIds.length === 0) continue
      workouts += d.workoutIds.length
      trainingDays += 1
      if (prev) longestGap = Math.max(longestGap, Math.round((d.date.getTime() - prev.getTime()) / DAY_MS) - 1)
      prev = d.date
    }
    let best: WeekdayStat | null = null
    for (const w of stats.weekdays) {
      if (w.workouts <= 0) continue
      if (!best || w.workouts > best.workouts || (w.workouts === best.workouts && w.hitRate > best.hitRate)) best = w
    }
    const topDay = best ? best.weekday : null
    let peakHour: number | null = null
    for (let h = 0; h < stats.hours.length; h++) {
      if (stats.hours[h] > 0 && (peakHour == null || stats.hours[h] > stats.hours[peakHour])) peakHour = h
    }
    const startedHours = stats.hours.reduce((a, b) => a + b, 0)
    return { workouts, trainingDays, longestGap, topDay, peakHour, startedHours, spanDays: stats.days.length }
  }, [stats])

  const pickMetric = (m: DayMetric) => {
    setMetricId(m)
    saveMetric(m)
  }

  if (!idx || !stats || !facts) return <PageHeader title="Calendar" />

  const range = activeRange()
  const header = (
    <PageHeader
      title="Calendar"
      eyebrow={range.title}
      subtitle={facts.workouts ? 'When you train, and what those days look like.' : undefined}
    />
  )

  if (facts.workouts === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="No workouts in this range" icon={<IconCalendar size={22} />} plain>
            Pick a longer range in the top bar to see your training calendar.
          </EmptyState>
        </Card>
      </>
    )
  }

  const top = facts.topDay != null ? stats.weekdays.find((w) => w.weekday === facts.topDay) : undefined
  const weeks = facts.spanDays / 7
  const perWeek = weeks >= 1 ? facts.workouts / weeks : null

  return (
    <>
      {header}
      <div class="stack" style={{ '--gap': 'var(--s4)' }}>
        <div class="stats-row">
          <StatTile
            label="Training days"
            value={formatNumber(facts.trainingDays, { maxDecimals: 0 })}
            sub={`${formatPercent(facts.trainingDays / Math.max(1, facts.spanDays), { decimals: 0 })} of ${plural(facts.spanDays, 'day')}`}
          />
          <StatTile
            label="Per week"
            value={formatNumber(perWeek, { maxDecimals: 1 })}
            sub={perWeek != null ? 'workouts on average' : 'Needs a full week'}
          />
          <StatTile
            label="Most common day"
            value={top ? WEEKDAY_LONG[top.weekday] : '—'}
            sub={top ? `${formatPercent(top.hitRate, { decimals: 0 })} of ${WEEKDAY_LONG[top.weekday]}s trained` : undefined}
          />
          <StatTile
            label="Usual start"
            value={facts.peakHour != null ? formatClock(facts.peakHour) : '—'}
            sub={
              facts.peakHour != null
                ? `${plural(stats.hours[facts.peakHour], 'workout')} began ${hourRange(facts.peakHour)}`
                : 'No start times recorded'
            }
          />
          {isDetailed && (
            <StatTile
              label="Longest break"
              value={facts.trainingDays > 1 ? formatNumber(facts.longestGap, { maxDecimals: 0 }) : '—'}
              unit={facts.trainingDays > 1 ? (facts.longestGap === 1 ? 'day' : 'days') : undefined}
              sub={facts.trainingDays > 1 ? 'between two training days' : 'Needs two training days'}
            />
          )}
        </div>

        <Card
          title="Training calendar"
          subtitle={`Days colored by ${metric.noun}, relative to your other training days. ${metric.info}`}
          actions={<Select label="Color by" hideLabel value={metricId} options={METRIC_OPTIONS} onChange={pickMetric} />}
        >
          <MonthCalendar
            days={stats.days}
            metric={metric}
            scale={scale}
            units={units}
            summaries={summaries}
            latestDate={idx.latestDate}
          />
        </Card>

        <Card
          title="Day of the week"
          subtitle="How often each weekday is trained, its average, and the muscles it usually covers."
          flush
        >
          <WeekdayPanel weekdays={stats.weekdays} metric={metric} scale={scale} units={units} topDay={facts.topDay} />
        </Card>

        <div class={isDetailed ? 'grid-2' : 'stack'}>
          <Card
            title="Start times"
            subtitle={facts.startedHours ? `${plural(facts.startedHours, 'workout')} by local start hour` : 'Workouts by local start hour'}
          >
            <HourBars hours={stats.hours} />
          </Card>
          {isDetailed && (
            <Card title="Weekday × hour" subtitle="Where your sessions cluster across the week.">
              <WeekdayHourGrid grid={stats.weekdayHour} />
            </Card>
          )}
        </div>

        {isDetailed && (
          <Card title="Weekday averages" subtitle="Every metric averaged over training days on each weekday." flush>
            <WeekdayTable weekdays={stats.weekdays} selected={metricId} units={units} />
          </Card>
        )}
      </div>
    </>
  )
}
