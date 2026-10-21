import { useMemo } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { muscleDetail } from '../core/analytics'
import type { ExerciseSummary, MuscleDetail, RegionId } from '../core/analytics/types'
import { displayLabel } from '../core/labels'
import { isRegionId, REGIONS, regionName } from '../core/regions'
import type { Units } from '../core/types'
import { href, paths } from '../router'
import { detailed, settings } from '../state'
import { BodyMap } from '../ui/bodymap'
import { BarChart, LineChart, Sparkline, type BarDatum } from '../ui/charts'
import { Card } from '../ui/components/Card'
import { DataTable, type Column } from '../ui/components/DataTable'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { StatStrip } from '../ui/components/StatStrip'
import { StatTile } from '../ui/components/StatTile'
import { formatDate, formatNumber, formatPercent, formatRelative, formatWeight, plural, toDisplayWeight, unitLabel } from '../ui/format'
import { IconMuscles } from '../ui/icons'
import { BwBadge, formatHold, formatStrength, formatUnitValue, PrList, strengthBestLabel, TrendBadge, VolumeBandBadge } from '../ui/widgets'
import { displayWeightFormat, repStatsByExercise, type RepStats } from './exercises/util'
import { FRACTIONAL_INFO, TARGET_HI, TARGET_LO, WEEKLY_SETS_INFO } from './muscles/bands'
import './muscles/muscles.css'

const GROUP_LABEL = { upper: 'Upper body', core: 'Core', lower: 'Lower body', other: 'Not a body region' } as const
const PUSH_PULL_LABEL = { push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core' } as const
/** Bars beyond this many weeks get too thin to read; older weeks are dropped from the chart. */
const MAX_WEEKS = 52
const EMPTY = <span class="faint">–</span>
/** Regions the body map lists as chips instead of drawing; kept off the small map. */
const UNDRAWN: Partial<Record<RegionId, true>> = { fullBody: true, cardio: true, other: true }

export default function MuscleDetailPage({ muscleKey }: { muscleKey: string }) {
  const idx = analysisIndex.value
  const win = analysisWindow.value
  const isDetailed = detailed.value
  const units = settings.value.units
  const region = isRegionId(muscleKey) ? muscleKey : null

  const detail = useMemo(() => (idx && region ? muscleDetail(idx, region, win) : null), [idx, region, win])
  const repStats = useMemo(() => (idx ? repStatsByExercise(idx, win) : new Map<string, RepStats>()), [idx, win])

  const back = { path: paths.muscles(), label: 'All muscles' }

  if (!region) {
    return (
      <>
        <PageHeader title={displayLabel(muscleKey)} back={back} />
        <EmptyState
          icon={<IconMuscles size={20} />}
          title="Unknown muscle"
          action={
            <a class="btn btn--sm" href={href(paths.muscles())}>
              Browse muscles
            </a>
          }
        >
          “{muscleKey}” is not one of the body regions MotraMaster tracks.
        </EmptyState>
      </>
    )
  }

  const info = REGIONS[region]
  const context = [
    GROUP_LABEL[info.group],
    info.pushPull && info.group !== 'core' ? PUSH_PULL_LABEL[info.pushPull] : null,
    detail && detail.windowSets > 0 ? `${plural(Math.round(detail.windowSets), 'hard set')} in range` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const header = <PageHeader title={regionName(region)} subtitle={context} back={back} />

  if (!detail || (detail.windowSets === 0 && detail.lastTrained == null && detail.exercises.length === 0)) {
    return (
      <>
        {header}
        <EmptyState icon={<IconMuscles size={20} />} title={`No ${regionName(region).toLowerCase()} work in this range`}>
          Choose a longer range above, or log an exercise that targets this muscle.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {header}
      <div class="stack mdetail">
        <Stats d={detail} units={units} detailed={isDetailed} />

        <div class="msplit msplit--8-4">
          <WeeklySetsCard d={detail} detailed={isDetailed} />
          <PairedCard d={detail} />
        </div>

        <ExercisesCard rows={detail.exercises} units={units} repStats={repStats} detailed={isDetailed} />

        <div class="msplit msplit--7-5">
          <StrengthIndexCard d={detail} />
          <Card title="Recent PRs">
            <PrList prs={detail.recentPrs} units={units} limit={8} empty="No records in this range yet." />
          </Card>
        </div>

        {isDetailed && (
          <div class="msplit msplit--8-4">
            <WeeklyVolumeCard d={detail} units={units} />
            <RawLabelsCard d={detail} />
          </div>
        )}
      </div>
    </>
  )
}

function Stats({ d, units, detailed }: { d: MuscleDetail; units: Units; detailed: boolean }) {
  const delta = d.weeklySets - d.avgWeeklySets4w
  return (
    <StatStrip lead>
      <StatTile
        label="Weekly sets"
        value={formatNumber(d.weeklySets, { maxDecimals: 1 })}
        unit={<VolumeBandBadge band={d.band} />}
        delta={Number.isFinite(delta) && d.avgWeeklySets4w > 0 ? delta : null}
        deltaFormat="number"
        deltaLabel="vs 4-week average"
        hint={WEEKLY_SETS_INFO}
        sub="Last 7 days"
      />
      {detailed && (
        <StatTile
          label="Fractional sets"
          value={formatNumber(d.weeklyFractional, { maxDecimals: 1 })}
          sub={`4-week avg ${formatNumber(d.avgWeeklySets4w, { maxDecimals: 1 })} direct`}
          hint={FRACTIONAL_INFO}
        />
      )}
      <StatTile label="Frequency" value={formatNumber(d.frequencyPerWeek, { maxDecimals: 1 })} unit="days/wk" sub="4-week average" />
      <StatTile
        label="Last trained"
        value={d.lastTrained ? formatRelative(d.lastTrained) : 'Never'}
        sub={d.lastTrained ? formatDate(d.lastTrained, 'weekday') : 'No hard sets logged'}
      />
      <StatTile
        label="Volume in range"
        value={d.volumeLb > 0 ? formatWeight(d.volumeLb, units, { compact: true, unit: false }) : EMPTY}
        unit={d.volumeLb > 0 ? unitLabel(units) : undefined}
        sub={plural(Math.round(d.windowSets), 'hard set')}
        hint="Weight × reps over the range, split equally when an exercise lists several primary muscles. Bodyweight sets add no volume."
      />
    </StatStrip>
  )
}

function WeeklySetsCard({ d, detailed }: { d: MuscleDetail; detailed: boolean }) {
  const weeks = d.weekly.slice(-MAX_WEEKS)
  const data: BarDatum[] = weeks.map((w) => ({
    key: w.weekStart.toISOString(),
    label: formatDate(w.weekStart, 'short'),
    values: detailed ? [w.sets, Math.max(0, w.fractional - w.sets)] : w.sets,
  }))
  return (
    <Card title="Weekly sets" info={detailed ? FRACTIONAL_INFO : WEEKLY_SETS_INFO}>
      <BarChart
        data={data}
        stackLabels={detailed ? ['Direct', 'Secondary (×0.5)'] : undefined}
        targetBand={{ lo: TARGET_LO, hi: TARGET_HI, label: '10–20 typical range' }}
        valueFormat={(n) => formatNumber(n, { maxDecimals: 1 })}
        height={240}
        emptyText="No weeks with sets in this range."
        ariaLabel={`Weekly hard sets for ${d.name}`}
      />
      {d.weekly.length > MAX_WEEKS && <p class="chart-note">Showing the latest {MAX_WEEKS} weeks.</p>}
    </Card>
  )
}

/** Small body map (this muscle solid, session partners hatched) beside the share of sessions they appear in. */
function PairedCard({ d }: { d: MuscleDetail }) {
  const partners = d.pairedWith.filter((p) => p.share > 0)
  const rows = partners.slice(0, 8)
  const secondary: Partial<Record<RegionId, number>> = {}
  for (const p of partners) if (!UNDRAWN[p.region]) secondary[p.region] = p.share
  return (
    <Card title="Trained alongside" subtitle="Share of sessions that also hit each muscle">
      <div class="paired-block">
        {!UNDRAWN[d.region] && (
          <div class="paired-block__map">
            <BodyMap values={{ [d.region]: 1 }} secondary={secondary} scale="relative" selected={d.region} size="sm" legend={false} />
          </div>
        )}
        {rows.length === 0 ? (
          <p class="muted paired-block__list">No other muscles trained in the same sessions.</p>
        ) : (
          <ul class="paired paired-block__list">
            {rows.map((p) => (
              <li key={p.region} class="paired__row">
                <a href={href(paths.muscle(p.region))}>{regionName(p.region)}</a>
                <span class="share-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(1, p.share) * 100}%` }} />
                </span>
                <span class="paired__pct num">{formatPercent(p.share, { decimals: 0 })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function StrengthIndexCard({ d }: { d: MuscleDetail }) {
  const points = d.strengthIndex
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ x: p.date, y: (p.value - 1) * 100 }))
  const pct = (n: number) => `${formatNumber(n, { sign: true, maxDecimals: 1 })}%`
  return (
    <Card
      title="Strength index"
      subtitle="Change in e1RM across this muscle’s weighted exercises"
      info="Each week averages every weighted exercise’s session e1RM relative to its first session in the range, so 0% is where you started."
    >
      {points.length < 2 ? (
        <EmptyState plain title="Not enough weighted sessions">
          A trend appears after two or more weeks of weighted sets for this muscle.
        </EmptyState>
      ) : (
        <LineChart
          series={[{ id: 'index', label: 'Strength index', points, area: true, color: 'var(--accent)' }]}
          height={220}
          yFormat={pct}
          xFormat={(x) => formatDate(x instanceof Date ? x : new Date(x), 'medium')}
          ariaLabel={`Strength index for ${d.name}, latest ${pct(points[points.length - 1].y as number)}`}
        />
      )}
    </Card>
  )
}

function exerciseColumns(units: Units, repStats: Map<string, RepStats>, detailed: boolean): Column<ExerciseSummary>[] {
  const metric = settings.value.strengthMetric
  const cols: Column<ExerciseSummary>[] = [
    {
      id: 'name',
      header: 'Exercise',
      value: (e) => e.name,
      kind: 'label',
      render: (e) => (
        <span class="ex-name">
          <span class="ex-name__text">{e.name}</span>
          <BwBadge load={e.load} />
        </span>
      ),
    },
    { id: 'sets', header: 'Sets', value: (e) => e.sets, kind: 'number', title: 'All logged sets in range' },
    {
      id: 'best',
      header: strengthBestLabel(metric),
      kind: 'number',
      value: (e) => (e.valueUnit === 'lb' ? (e.bestStrength?.value ?? e.bestWeightLb) : null),
      title:
        metric === 'actual'
          ? 'Heaviest weight actually lifted (with its reps), or most reps in a set for bodyweight work'
          : 'Best estimated 1RM, or most reps in a set for bodyweight work',
      render: (e) => {
        if (e.valueUnit === 'sec') {
          const best = e.bestHoldSec ?? e.bestStrength?.holdSec ?? null
          return best != null ? `${formatHold(best)} hold` : EMPTY
        }
        if (e.valueUnit === 'lb') return e.bestStrength ? formatStrength(e.bestStrength, metric, units) : formatWeight(e.bestWeightLb, units)
        const r = repStats.get(e.key)?.bestReps
        return r != null ? `${formatNumber(r, { maxDecimals: 0 })} reps` : EMPTY
      },
    },
    {
      id: 'spark',
      header: 'Progress',
      sortable: false,
      priority: 2,
      render: (e) => (
        <Sparkline
          values={e.spark}
          width={88}
          height={24}
          trendColor
          valueFormat={(n) => formatUnitValue(n, e.valueUnit, units)}
          ariaLabel={`${e.name} session trend`}
        />
      ),
    },
    {
      id: 'trend',
      header: 'Trend',
      value: (e) => e.ratePerMonth,
      kind: 'number',
      align: 'left',
      render: (e) => <TrendBadge status={e.status} ratePerMonth={e.ratePerMonth} />,
    },
  ]
  if (detailed) {
    cols.splice(2, 0, { id: 'hard', header: 'Hard', value: (e) => e.hardSets, kind: 'number', priority: 3, title: 'Working sets (warm-ups excluded)' })
    cols.push({ id: 'last', header: 'Last', value: (e) => e.lastDate?.getTime() ?? null, kind: 'number', priority: 3, render: (e) => formatDate(e.lastDate, 'short') })
  }
  return cols
}

function ExercisesCard({ rows, units, repStats, detailed }: { rows: ExerciseSummary[]; units: Units; repStats: Map<string, RepStats>; detailed: boolean }) {
  return (
    <Card title="Exercises" subtitle={`${plural(rows.length, 'exercise')} in range`}>
      <DataTable
        columns={exerciseColumns(units, repStats, detailed)}
        rows={rows}
        rowKey={(e) => e.key}
        rowHref={(e) => paths.exercise(e.key)}
        initialSort={{ id: 'sets' }}
        limit={10}
        empty="No exercises for this muscle in range."
        caption="Exercises for this muscle"
      />
    </Card>
  )
}

function WeeklyVolumeCard({ d, units }: { d: MuscleDetail; units: Units }) {
  const weeks = d.weekly.slice(-MAX_WEEKS)
  const fmt = displayWeightFormat(units, { compact: true })
  const data: BarDatum[] = weeks.map((w) => ({
    key: w.weekStart.toISOString(),
    label: formatDate(w.weekStart, 'short'),
    values: toDisplayWeight(w.volumeLb, units),
  }))
  const any = weeks.some((w) => w.volumeLb > 0)
  return (
    <Card title="Weekly volume load" subtitle="Weight × reps, split equally across primary muscles">
      {any ? (
        <BarChart data={data} valueFormat={fmt} height={200} ariaLabel={`Weekly volume load for ${d.name}`} />
      ) : (
        <p class="muted">Only bodyweight work in this range, so there is no volume load.</p>
      )}
    </Card>
  )
}

function RawLabelsCard({ d }: { d: MuscleDetail }) {
  return (
    <Card title="Export labels" subtitle={`Raw muscle labels counted as ${d.name}`}>
      {d.rawLabels.length === 0 ? (
        <p class="muted">Credited only through the exercise catalog, with no direct labels.</p>
      ) : (
        <ul class="label-list">
          {d.rawLabels.map((l) => (
            <li key={l} class="label-list__item num">
              {l}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
