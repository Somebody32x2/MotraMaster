import type { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type {
  AnalysisIndex,
  ExerciseSummary,
  MuscleSummary,
  OverviewStats,
  PrEvent,
  RegionId,
  StrengthProfile,
} from '../../core/analytics/types'
import { REGIONS } from '../../core/regions'
import type { Settings, Units } from '../../core/types'
import { href, navigate, paths } from '../../router'
import { BodyMap } from '../../ui/bodymap'
import { BarChart, CalendarHeatmap, LineChart, Sparkline } from '../../ui/charts'
import { Card } from '../../ui/components/Card'
import { Segmented, type SegmentedOption } from '../../ui/components/Segmented'
import { StatStrip } from '../../ui/components/StatStrip'
import { StatTile } from '../../ui/components/StatTile'
import { formatDate, formatDuration, formatNumber, formatWeight, plural, toDisplayWeight, unitLabel } from '../../ui/format'
import { settings } from '../../state'
import { BwBadge, formatStrength, formatUnitValue, HARD_SET_RULE, PrList, TrendBadge } from '../../ui/widgets'
import { CardEmpty } from './parts'
import { StrengthLiftList } from './RelativeStrength'
import { BAND_COLOR, activeRange, bandOf, dayKey, isNum, mean, pctDelta, sum } from './util'

const round1 = (n: number) => Math.round(n * 10) / 10
const WEEK_MS = 7 * 86_400_000

/** Compact display-unit formatter for chart axes fed with display-unit values. */
function weightAxis(units: Units): (n: number) => string {
  const unit = unitLabel(units)
  return (n) => `${formatNumber(n, { compact: true })} ${unit}`
}

const per = (total: number, n: number | null | undefined): number | null => (isNum(n) && n > 0 ? total / n : null)

/** Monday 00:00 of the week containing `d`. */
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

/* ---------- Hero sentence + stat strip ---------- */

function Fig({ children }: { children: ComponentChildren }) {
  return <span class="ov-hero__n tnum">{children}</span>
}

/** "42 workouts in the last 3 months. 747 hard sets, 1.02M lb moved, 42h 57m under the bar." */
export function OverviewHero({ stats, units }: { stats: OverviewStats; units: Units }) {
  const r = activeRange()
  const all = r.value === 'all'
  const when = all ? 'in total' : `in the ${r.title.toLowerCase()}`
  if (stats.workouts === 0) return <p class="ov-hero">{all ? 'No workouts yet.' : `No workouts ${when}.`}</p>

  const parts: ComponentChildren[] = [
    <>
      <Fig>{formatNumber(stats.hardSets, { maxDecimals: 0 })}</Fig> hard {stats.hardSets === 1 ? 'set' : 'sets'}
    </>,
  ]
  if (stats.volumeLb > 0) {
    parts.push(
      <>
        <Fig>{formatWeight(stats.volumeLb, units, { compact: true })}</Fig> moved
      </>,
    )
  }
  if (stats.durationSec > 0) {
    parts.push(
      <>
        <Fig>{formatDuration(stats.durationSec)}</Fig> under the bar
      </>,
    )
  }
  return (
    <p class="ov-hero">
      <Fig>{formatNumber(stats.workouts, { maxDecimals: 0 })}</Fig> {stats.workouts === 1 ? 'workout' : 'workouts'} {when}.{' '}
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {p}
        </span>
      ))}
      .
    </p>
  )
}

/** Per-week and per-workout rates with deltas vs the preceding window of equal length. */
export function OverviewStrip({ stats, units, detailed }: { stats: OverviewStats; units: Units; detailed: boolean }) {
  const prev = stats.previous
  const title = activeRange().title
  const deltaLabel = prev ? `vs prior ${title.startsWith('Last ') ? title.slice(5) : 'period'}` : undefined
  const weeks = Math.max(1, stats.weekly.length)
  const avg4w = stats.avgWorkoutsPerWeek4w
  const hardPer = per(stats.hardSets, stats.workouts)
  const volPer = per(stats.volumeLb, stats.workouts)
  const rawSec = stats.durationSec + stats.trimmedSec
  const kcalPerMin = stats.calories > 0 && rawSec > 0 ? stats.calories / (rawSec / 60) : null

  return (
    <StatStrip lead>
      <StatTile
        label="Workouts per week"
        value={formatNumber(stats.workouts / weeks, { maxDecimals: 1 })}
        delta={pctDelta(stats.workouts, prev?.workouts)}
        deltaLabel={deltaLabel}
        sub={`${formatNumber(avg4w, { maxDecimals: 1 })} over the last 4 weeks`}
      />
      <StatTile
        label="Hard sets per workout"
        value={formatNumber(hardPer, { maxDecimals: 1 })}
        delta={prev ? pctDelta(hardPer, per(prev.hardSets, prev.workouts)) : null}
        deltaLabel={deltaLabel}
        hint={HARD_SET_RULE}
      />
      <StatTile
        label="Volume per workout"
        value={formatWeight(volPer, units, { unit: false, compact: true })}
        unit={volPer != null ? unitLabel(units) : undefined}
        delta={prev ? pctDelta(volPer, per(prev.volumeLb, prev.workouts)) : null}
        deltaLabel={deltaLabel}
      />
      <StatTile
        label="Session length"
        value={formatDuration(stats.avgDurationSec)}
        delta={prev ? pctDelta(per(stats.durationSec, stats.workouts), per(prev.durationSec, prev.workouts)) : null}
        deltaLabel={deltaLabel}
        hint={
          stats.trimmedWorkouts > 0 && stats.trimmedSec > 0
            ? `${formatDuration(stats.trimmedSec)} of idle time trimmed from ${plural(stats.trimmedWorkouts, 'workout')} that ran on after the last set. Change this in Settings.`
            : undefined
        }
      />
      {detailed && (
        <StatTile
          label="Calories per minute"
          value={formatNumber(kcalPerMin, { maxDecimals: 1 })}
          unit={kcalPerMin != null ? 'kcal' : undefined}
          sub={stats.calories > 0 ? `${formatNumber(stats.calories, { maxDecimals: 0 })} kcal in total, Apple Health estimate` : 'Not recorded'}
        />
      )}
    </StatStrip>
  )
}

/* ---------- N1 Consistency ---------- */

/** Widest heatmap the 4-column companion can hold without shrinking cells to dots. */
const MAX_HEATMAP_WEEKS = 26

export function ConsistencyCard({ stats, idx, units, class: cls }: { stats: OverviewStats; idx: AnalysisIndex; units: Units; class?: string }) {
  const byVolume = stats.days.some((d) => d.volumeLb > 0)
  const days = stats.days.map((d) => ({
    date: d.date,
    value: byVolume ? toDisplayWeight(d.volumeLb, units) : d.sets,
    title: d.workouts > 0 ? `${plural(d.workouts, 'workout')}, ${plural(d.sets, 'set')}` : undefined,
  }))
  const workoutByDay = useMemo(() => {
    const m = new Map<string, string>()
    for (const [id, date] of idx.workoutDates) {
      if (!date) continue
      const k = dayKey(date)
      if (!m.has(k)) m.set(k, id)
    }
    return m
  }, [idx])
  const { start, end } = stats.window
  const spanWeeks = start ? Math.round((mondayOf(end).getTime() - mondayOf(start).getTime()) / WEEK_MS) + 1 : null
  const weeks = spanWeeks != null && spanWeeks <= MAX_HEATMAP_WEEKS ? spanWeeks : undefined
  const avg = stats.avgWorkoutsPerWeek4w
  const thisWeek = stats.workoutsThisWeek
  const best = stats.currentStreakWeeks > 0 && stats.currentStreakWeeks >= stats.longestStreakWeeks

  return (
    <Card title="Consistency" class={cls}>
      <p class="ov-consist__lead">
        <span class="ov-figure tnum">{formatNumber(thisWeek, { maxDecimals: 0 })}</span>
        <span>{thisWeek === 1 ? 'workout' : 'workouts'} in the last 7 days</span>
      </p>
      <p class="ov-consist__note">
        {avg > 0 ? `4-week average: ${formatNumber(avg, { maxDecimals: 1 })} per week` : 'No workouts in the prior 4 weeks'}
      </p>
      <dl class="ov-facts">
        <div>
          <dt>Current streak</dt>
          <dd class="tnum">
            {plural(stats.currentStreakWeeks, 'week')}
            {best && <span class="ov-facts__note">best yet</span>}
          </dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd class="tnum">{plural(stats.longestStreakWeeks, 'week')}</dd>
        </div>
      </dl>
      <CalendarHeatmap
        days={days}
        weeks={weeks}
        end={end}
        valueLabel={byVolume ? 'Volume' : 'Sets'}
        valueFormat={byVolume ? weightAxis(units) : (n) => formatNumber(n, { maxDecimals: 0 })}
        emptyDayText="Rest day"
        onDayClick={(date) => {
          const id = workoutByDay.get(dayKey(date))
          if (id) navigate(paths.workout(id))
        }}
        ariaLabel={`Training calendar: ${plural(stats.workouts, 'workout')} in this range`}
      />
    </Card>
  )
}

/* ---------- N3 Volume trend ---------- */

type TrendView = 'bars' | 'trend'
const TREND_VIEWS: SegmentedOption<TrendView>[] = [
  { value: 'bars', label: 'Weekly' },
  { value: 'trend', label: 'Average' },
]

export function VolumeTrendCard({ stats, units, class: cls }: { stats: OverviewStats; units: Units; class?: string }) {
  const [view, setView] = useState<TrendView>('bars')
  const weekly = stats.weekly
  const vals = weekly.map((w) => toDisplayWeight(w.volumeLb, units))
  const ma = vals.map((_, i) => mean(vals.slice(Math.max(0, i - 7), i + 1)))
  const fmt = weightAxis(units)
  const n = weekly.length
  const change = n >= 8 ? pctDelta(sum(vals.slice(n - 4)), sum(vals.slice(n - 8, n - 4))) : null
  const lastMa = n ? ma[n - 1] : null

  const subtitle =
    change != null ? (
      <>
        Last 4 weeks vs the 4 before:{' '}
        <span class={`delta delta--${change > 0 ? 'pos' : change < 0 ? 'neg' : 'flat'}`}>
          {formatNumber(change * 100, { sign: true, maxDecimals: 0 })}%
        </span>
      </>
    ) : isNum(lastMa) && n > 1 ? (
      `8-week average: ${fmt(lastMa)} per week`
    ) : undefined

  return (
    <Card
      title="Weekly volume"
      subtitle={subtitle}
      actions={n > 1 ? <Segmented size="sm" label="Volume view" options={TREND_VIEWS} value={view} onChange={setView} /> : undefined}
      class={cls}
    >
      {view === 'bars' || n <= 1 ? (
        <BarChart
          data={weekly.map((w, i) => ({ key: dayKey(w.weekStart), label: formatDate(w.weekStart, 'short'), values: vals[i] }))}
          valueFormat={fmt}
          height={240}
          emptyText="No workouts in this range."
          ariaLabel={`Weekly volume over ${plural(n, 'week')}`}
        />
      ) : (
        <LineChart
          series={[
            {
              id: 'weekly',
              label: 'Weekly volume',
              points: weekly.map((w, i) => ({ x: w.weekStart, y: vals[i] })),
              area: true,
              showPoints: n <= 16,
            },
            {
              id: 'ma',
              label: '8-week average',
              color: 'var(--text-muted)',
              dashed: true,
              points: weekly.map((w, i) => ({ x: w.weekStart, y: ma[i] })),
            },
          ]}
          yFormat={fmt}
          zeroBased
          height={240}
          emptyText="No workouts in this range."
        />
      )}
    </Card>
  )
}

/* ---------- N2 This week by muscle ---------- */

type SetMode = 'direct' | 'fractional'
const SET_MODES: SegmentedOption<SetMode>[] = [
  { value: 'direct', label: 'Direct', title: 'Primary muscles only (1 set each)' },
  { value: 'fractional', label: 'Fractional', title: 'Adds secondary muscles from the Motra catalog at 0.5 set' },
]

export function MuscleWeekCard({
  muscles,
  end,
  detailed,
  class: cls,
}: {
  muscles: MuscleSummary[]
  end: Date
  detailed: boolean
  class?: string
}) {
  const [mode, setMode] = useState<SetMode>('direct')
  const fractional = detailed && mode === 'fractional'
  const val = (m: MuscleSummary) => {
    const v = fractional ? m.weeklyFractional : m.weeklySets
    return isNum(v) ? v : 0
  }
  const values: Partial<Record<RegionId, number>> = {}
  for (const m of muscles) values[m.region] = val(m)
  const ranked = muscles.filter((m) => val(m) > 0).sort((a, b) => val(b) - val(a) || a.name.localeCompare(b.name))
  const neglected = muscles.filter((m) => REGIONS[m.region]?.drawn && val(m) <= 0).map((m) => m.name)

  return (
    <Card
      title="This week by muscle"
      subtitle={`Hard sets in the 7 days to ${formatDate(end, 'short')}`}
      info={
        fractional
          ? 'Fractional counting credits each set’s secondary muscles from the Motra catalog with half a set.'
          : undefined
      }
      actions={detailed ? <Segmented size="sm" label="Set counting" options={SET_MODES} value={mode} onChange={setMode} /> : undefined}
      class={cls}
    >
      <div class="ov-muscle">
        <div class="ov-muscle__grid">
          <BodyMap values={values} scale="weeklySets" legend size="md" onSelect={(r) => navigate(paths.muscle(r))} />
          <div class="ov-muscle__list">
            {ranked.length ? (
              <BarChart
                orientation="horizontal"
                data={ranked.map((m) => {
                  const v = round1(val(m))
                  return { key: m.region, label: m.name, values: v, color: BAND_COLOR[bandOf(v)], href: href(paths.muscle(m.region)) }
                })}
                targetBand={{ lo: 10, hi: 20, label: '10–20 sets' }}
                valueFormat={(n) => formatNumber(n, { maxDecimals: 1 })}
                ariaLabel="Weekly hard sets per muscle"
              />
            ) : (
              <CardEmpty>No hard sets in the last 7 days of this range.</CardEmpty>
            )}
            {neglected.length > 0 && ranked.length > 0 && (
              <p class="ov-note">
                Not trained this week: {neglected.slice(0, 8).join(', ')}
                {neglected.length > 8 ? ` and ${neglected.length - 8} more` : ''}.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ---------- N4 Top lifts ---------- */

export function TopLiftsCard({
  lifts,
  units,
  detailed,
  class: cls,
}: {
  lifts: ExerciseSummary[]
  units: Units
  detailed: boolean
  class?: string
}) {
  const rows = lifts.slice(0, 6)
  const unit = unitLabel(units)
  const actual = settings.value.strengthMetric === 'actual'
  return (
    <Card
      title="Top lifts"
      info={`${
        actual
          ? 'The heaviest set you actually lifted each session, at any reps.'
          : 'Estimated 1RM (e1RM): the most you could lift once, estimated from your best set each session.'
      } Trend is the median change per month over the last 90 days.`}
      actions={
        <a class="link" href={href(paths.exercises())}>
          All exercises
        </a>
      }
      class={cls}
    >
      {rows.length ? (
        <table class="ov-table">
          <thead>
            <tr>
              <th scope="col">Exercise</th>
              <th scope="col" class="is-right">
                {actual ? 'Heaviest set' : 'e1RM'}
              </th>
              {detailed && (
                <th scope="col" class="is-right ov-table__opt">
                  Best
                </th>
              )}
              <th scope="col" class="ov-table__spark">
                <span class="sr-only">History</span>
              </th>
              <th scope="col" class="is-right">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.key}>
                <td class="ov-table__name">
                  <span class="ov-table__title">
                    <a class="ov-link" href={href(paths.exercise(l.key))}>
                      {l.name}
                    </a>
                    <BwBadge load={l.load} />
                  </span>
                  <span class="ov-table__meta">{plural(l.sessions, 'session')}</span>
                </td>
                <td class="is-right num">{formatStrength(l.latestStrength, l.metric, units, l.valueUnit)}</td>
                {detailed && (
                  <td class="is-right num ov-table__opt">{l.bestStrength ? formatStrength(l.bestStrength, l.metric, units, l.valueUnit) : '–'}</td>
                )}
                <td class="ov-table__spark">
                  <Sparkline
                    values={l.valueUnit === 'lb' ? l.spark.map((v) => toDisplayWeight(v, units)) : l.spark}
                    width={84}
                    height={24}
                    valueFormat={(n) => (l.valueUnit === 'lb' ? `${formatNumber(n)} ${unit}` : formatUnitValue(n, l.valueUnit, units))}
                  />
                </td>
                <td class="is-right ov-table__trend">
                  <TrendBadge status={l.status} ratePerMonth={l.ratePerMonth} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <CardEmpty>Log a few weighted sets to start tracking {actual ? 'your heaviest sets' : 'estimated 1RMs'}.</CardEmpty>
      )}
    </Card>
  )
}

/* ---------- N5 Recent PRs ---------- */

/** `prs` are the window's records from the last 30 days, newest first. */
export function RecentPrsCard({ prs, units, class: cls }: { prs: PrEvent[]; units: Units; class?: string }) {
  const n = prs.length
  const subtitle = n > 0 ? `${n} in the last 30 days, ${formatNumber(n / (30 / 7), { maxDecimals: 1 })} per week` : 'Last 30 days'
  return (
    <Card title="Recent PRs" subtitle={subtitle} class={cls}>
      <PrList prs={prs} units={units} limit={6} showExercise empty="No records yet. PRs start from an exercise’s second session." />
    </Card>
  )
}

/* ---------- N7 Muscle frequency ---------- */

export function FrequencyCard({ muscles, class: cls }: { muscles: MuscleSummary[]; class?: string }) {
  const rows = muscles
    .filter((m) => isNum(m.frequencyPerWeek) && m.frequencyPerWeek > 0)
    .sort((a, b) => b.frequencyPerWeek - a.frequencyPerWeek || a.name.localeCompare(b.name))
  const shown = rows.slice(0, 10)
  return (
    <Card
      title="Muscle frequency"
      subtitle={
        rows.length > shown.length
          ? `Days per week with a hard set, last 4 weeks, top ${shown.length} of ${rows.length}`
          : 'Days per week with a hard set, last 4 weeks'
      }
      class={cls}
    >
      {shown.length ? (
        <BarChart
          orientation="horizontal"
          data={shown.map((m) => ({
            key: m.region,
            label: m.name,
            values: round1(m.frequencyPerWeek),
            color: 'var(--c3)',
            href: href(paths.muscle(m.region)),
          }))}
          valueFormat={(n) => `${formatNumber(n, { maxDecimals: 1 })}×/wk`}
          ariaLabel="Training days per week per muscle"
        />
      ) : (
        <CardEmpty>No hard sets in the last 4 weeks of this range.</CardEmpty>
      )}
    </Card>
  )
}

/* ---------- N8 Relative strength ---------- */

export function RelativeStrengthCard({
  profile,
  settings,
  class: cls,
}: {
  profile: StrengthProfile | null
  settings: Settings
  class?: string
}) {
  const bw = settings.bodyweightLb
  if (bw == null) {
    return (
      <Card title="Relative strength" class={cls}>
        <p class="ov-prompt">
          Add your bodyweight in{' '}
          <a class="link" href={href(paths.settings())}>
            Settings
          </a>{' '}
          to see your main lifts as multiples of bodyweight.
        </p>
      </Card>
    )
  }
  const lifts = profile?.lifts ?? []
  return (
    <Card
      title="Relative strength"
      subtitle={`At ${formatWeight(bw, settings.units)} bodyweight`}
      info="Best recent estimated 1RM divided by bodyweight. Levels are approximate Strength Level standards; real thresholds vary with bodyweight."
      class={cls}
    >
      {lifts.length ? (
        <>
          <StrengthLiftList lifts={lifts} units={settings.units} />
          {settings.sex === 'unspecified' && (
            <p class="ov-note">
              Set your sex in{' '}
              <a class="link" href={href(paths.settings())}>
                Settings
              </a>{' '}
              to see approximate strength levels.
            </p>
          )}
        </>
      ) : (
        <CardEmpty>No bench press, squat, deadlift or overhead press with an estimated 1RM yet.</CardEmpty>
      )}
    </Card>
  )
}
