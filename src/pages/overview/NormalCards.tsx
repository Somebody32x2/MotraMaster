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
import { StatTile } from '../../ui/components/StatTile'
import { formatDate, formatDuration, formatNumber, formatWeight, plural, toDisplayWeight, unitLabel } from '../../ui/format'
import { settings } from '../../state'
import { BwBadge, formatStrength, formatUnitValue, PrList, TrendBadge } from '../../ui/widgets'
import { CardEmpty, Metric } from './parts'
import { StrengthLiftList } from './RelativeStrength'
import { BAND_COLOR, activeRange, bandOf, dayKey, isNum, mean, pctDelta, sum } from './util'

const round1 = (n: number) => Math.round(n * 10) / 10

/** Compact display-unit formatter for chart axes fed with display-unit values. */
function weightAxis(units: Units): (n: number) => string {
  const unit = unitLabel(units)
  return (n) => `${formatNumber(n, { compact: true })} ${unit}`
}

/* ---------- KPI row (N6 averages + window totals) ---------- */

export function KpiRow({ stats, units, detailed }: { stats: OverviewStats; units: Units; detailed: boolean }) {
  const prev = stats.previous
  const deltaLabel = prev ? `vs prior ${activeRange().label}` : undefined
  const avgVolume = stats.workouts > 0 ? stats.volumeLb / stats.workouts : null
  const avgHard = stats.workouts > 0 ? stats.hardSets / stats.workouts : null
  const rawSec = stats.durationSec + stats.trimmedSec
  const kcalPerMin = stats.calories > 0 && rawSec > 0 ? stats.calories / (rawSec / 60) : null
  return (
    <div class="stats-row ov-span-12">
      <StatTile
        label="Workouts"
        value={formatNumber(stats.workouts, { maxDecimals: 0 })}
        delta={pctDelta(stats.workouts, prev?.workouts)}
        deltaLabel={deltaLabel}
        sub={`${formatNumber(stats.avgWorkoutsPerWeek4w, { maxDecimals: 1 })} per week, last 4 weeks`}
      />
      <StatTile
        label="Hard sets"
        value={formatNumber(stats.hardSets, { maxDecimals: 0 })}
        delta={pctDelta(stats.hardSets, prev?.hardSets)}
        deltaLabel={deltaLabel}
        hint="Working sets only: effort 6+ when logged, otherwise at least 60% of that exercise’s top weight in the session. Warm-ups are excluded."
        sub={avgHard != null ? `${formatNumber(avgHard, { maxDecimals: 1 })} per workout` : `${plural(stats.sets, 'set')} logged`}
      />
      <StatTile
        label="Volume"
        value={formatWeight(stats.volumeLb, units, { unit: false, compact: true })}
        unit={unitLabel(units)}
        delta={pctDelta(stats.volumeLb, prev?.volumeLb)}
        deltaLabel={deltaLabel}
        hint="Weight × reps summed over all sets, using Motra’s total volume lifted (TVL) per workout when present."
        sub={avgVolume != null ? `${formatWeight(avgVolume, units, { compact: true })} per workout` : undefined}
      />
      <StatTile
        label="Training time"
        value={formatDuration(stats.durationSec)}
        delta={pctDelta(stats.durationSec, prev?.durationSec)}
        deltaLabel={deltaLabel}
        sub={stats.avgDurationSec != null ? `${formatDuration(stats.avgDurationSec)} per session` : undefined}
        hint={
          stats.trimmedWorkouts > 0 && stats.trimmedSec > 0
            ? `${formatDuration(stats.trimmedSec)} idle trimmed from ${plural(stats.trimmedWorkouts, 'workout')} that ran on after the last set. Change this in Settings.`
            : undefined
        }
      />
      {detailed && (
        <StatTile
          label="Calories"
          value={formatNumber(stats.calories, { maxDecimals: 0 })}
          unit="kcal"
          hint="Apple Health’s estimate as reported by Motra; treat it as approximate."
          sub={kcalPerMin != null ? `${formatNumber(kcalPerMin, { maxDecimals: 1 })} kcal/min` : 'Not recorded'}
        />
      )}
    </div>
  )
}

/* ---------- N1 Consistency ---------- */

export function ConsistencyCard({ stats, idx, units, class: cls }: { stats: OverviewStats; idx: AnalysisIndex; units: Units; class?: string }) {
  const byVolume = stats.days.some((d) => d.volumeLb > 0)
  const days = stats.days.map((d) => ({
    date: d.date,
    value: byVolume ? toDisplayWeight(d.volumeLb, units) : d.sets,
    title: d.workouts > 0 ? `${plural(d.workouts, 'workout')} · ${plural(d.sets, 'set')}` : undefined,
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
  const avg = stats.avgWorkoutsPerWeek4w

  return (
    <Card
      title="Consistency"
      info="A week streak counts consecutive Monday–Sunday weeks with at least one workout. Showing up regularly is the biggest driver of progress."
      class={cls}
    >
      <div class="ov-metrics">
        <Metric
          label="Last 7 days"
          value={plural(stats.workoutsThisWeek, 'workout')}
          note={avg > 0 ? `4-week average ${formatNumber(avg, { maxDecimals: 1 })}` : 'No workouts in the prior 4 weeks'}
        />
        <Metric
          label="Current streak"
          value={plural(stats.currentStreakWeeks, 'week')}
          note={stats.currentStreakWeeks > 0 && stats.currentStreakWeeks >= stats.longestStreakWeeks ? 'Your best yet' : undefined}
        />
        <Metric label="Longest streak" value={plural(stats.longestStreakWeeks, 'week')} />
      </div>
      <CalendarHeatmap
        days={days}
        end={stats.window.end}
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
        Last 4 weeks vs previous 4:{' '}
        <span class={`delta delta--${change > 0 ? 'pos' : change < 0 ? 'neg' : 'flat'}`}>
          {formatNumber(change * 100, { sign: true, maxDecimals: 0 })}%
        </span>
      </>
    ) : isNum(lastMa) && n > 1 ? (
      `8-week average ${fmt(lastMa)} per week`
    ) : undefined

  return (
    <Card
      title="Weekly volume"
      subtitle={subtitle}
      info="Weight × reps per Monday–Sunday week, with an 8-week moving average to show the overall direction of your workload."
      actions={n > 1 ? <Segmented size="sm" label="Volume view" options={TREND_VIEWS} value={view} onChange={setView} /> : undefined}
      class={cls}
    >
      {view === 'bars' || n <= 1 ? (
        <BarChart
          data={weekly.map((w, i) => ({ key: dayKey(w.weekStart), label: formatDate(w.weekStart, 'short'), values: vals[i] }))}
          valueFormat={fmt}
          height={210}
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
          height={210}
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
      subtitle={`Hard sets in the 7 days ending ${formatDate(end, 'short')}`}
      info={
        fractional
          ? 'Fractional counting adds secondary muscles from the Motra catalog at half a set, which best fits growth and strength outcomes (Pelland 2026).'
          : '10–20 hard sets per muscle per week is the typical hypertrophy range (Schoenfeld 2017). Informational, not a prescription.'
      }
      actions={detailed ? <Segmented size="sm" label="Set counting" options={SET_MODES} value={mode} onChange={setMode} /> : undefined}
      class={cls}
    >
      <div class="ov-muscle">
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
              <span class="ov-note__label">Not trained this week:</span> {neglected.slice(0, 8).join(', ')}
              {neglected.length > 8 ? ` and ${neglected.length - 8} more` : ''}
            </p>
          )}
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
      subtitle={actual ? 'Latest heaviest set' : 'Latest estimated 1RM'}
      info={`${actual ? 'The heaviest set you actually lifted each session, whatever the reps.' : 'Estimated 1RM from your best set each session.'} The rate is the median change per month over the last 90 days (Theil–Sen), robust to one-off good or bad days.`}
      actions={
        <a class="link" href={href(paths.exercises())}>
          All exercises
        </a>
      }
      class={cls}
    >
      {rows.length ? (
        <ul class="ov-lifts" role="list">
          {rows.map((l) => (
            <li key={l.key}>
              <div class="ov-lifts__name">
                <span class="ov-lifts__title">
                  <a class="link" href={href(paths.exercise(l.key))}>
                    {l.name}
                  </a>
                  <BwBadge load={l.load} />
                </span>
                <span class="faint">
                  {plural(l.sessions, 'session')}
                  {detailed && l.bestStrength ? ` · best ${formatStrength(l.bestStrength, l.metric, units, l.valueUnit)}` : ''}
                </span>
              </div>
              <span class="ov-lifts__value num">{formatStrength(l.latestStrength, l.metric, units, l.valueUnit)}</span>
              <Sparkline
                class="ov-lifts__spark"
                values={l.valueUnit === 'lb' ? l.spark.map((v) => toDisplayWeight(v, units)) : l.spark}
                width={84}
                height={26}
                valueFormat={(n) => (l.valueUnit === 'lb' ? `${formatNumber(n)} ${unit}` : formatUnitValue(n, l.valueUnit, units))}
              />
              <TrendBadge status={l.status} ratePerMonth={l.ratePerMonth} />
            </li>
          ))}
        </ul>
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
  const subtitle = n > 0 ? `${plural(n, 'PR')} in the last 30 days · ${formatNumber(n / (30 / 7), { maxDecimals: 1 })} per week` : 'Last 30 days'
  return (
    <Card
      title="Recent PRs"
      subtitle={subtitle}
      info="Weight, rep and estimated-1RM records. An exercise’s first session is its baseline, so records start from the second session."
      class={cls}
    >
      <PrList prs={prs} units={units} limit={6} showExercise empty="No records yet. PRs appear from an exercise’s second session onward." />
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
      subtitle={rows.length > shown.length ? `Days per week, top ${shown.length} of ${rows.length}` : 'Days per week with a hard set'}
      info="Average days per week each muscle got at least one hard set over the last 4 weeks. With volume equal, frequency matters little for growth but helps strength (Pelland 2026)."
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
      subtitle={`At current bodyweight, ${formatWeight(bw, settings.units)}`}
      info="Best recent estimated 1RM ÷ bodyweight. Levels are approximate Strength Level standards; real thresholds vary with bodyweight."
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
