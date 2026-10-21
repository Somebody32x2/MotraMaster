import { useMemo, useState } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { exerciseSummaries } from '../core/analytics'
import type { ExerciseSummary, RegionId } from '../core/analytics/types'
import { normalizeKey } from '../core/labels'
import { REGION_ORDER, regionName } from '../core/regions'
import type { StrengthMetric, Units } from '../core/types'
import { paths } from '../router'
import { detailed, settings } from '../state'
import { Sparkline } from '../ui/charts'
import { Card } from '../ui/components/Card'
import { DataTable, type Column } from '../ui/components/DataTable'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { formatDate, formatNumber, formatWeight, plural } from '../ui/format'
import { IconCheck, IconExercises } from '../ui/icons'
import { BwBadge, formatHold, formatRate, formatStrength, formatUnitValue, RegionChips, strengthBestLabel, strengthContext, TrendBadge } from '../ui/widgets'
import { repStatsByExercise, type RepStats } from './exercises/util'
import './exercises/exercises.css'

type RegionFilter = 'all' | RegionId

function columns(units: Units, reps: Map<string, RepStats>, isDetailed: boolean, metric: StrengthMetric): Column<ExerciseSummary>[] {
  const cols: Column<ExerciseSummary>[] = [
    {
      id: 'name',
      header: 'Exercise',
      kind: 'label',
      value: (e) => e.name,
      render: (e) => (
        <span class="ex-name">
          <span class="ex-name__text">{e.name}</span>
          <BwBadge load={e.load} />
        </span>
      ),
    },
    {
      id: 'regions',
      header: 'Muscles',
      sortable: false,
      priority: 3,
      render: (e) => <RegionChips regions={e.regions} max={2} />,
    },
    { id: 'sessions', header: 'Sessions', kind: 'number', value: (e) => e.sessions, priority: 3 },
    { id: 'sets', header: 'Sets', kind: 'number', value: (e) => e.sets, priority: 2 },
    {
      id: 'best',
      header: strengthBestLabel(metric),
      kind: 'number',
      title:
        metric === 'actual'
          ? 'Heaviest weight actually lifted (with its reps); most reps in a set for bodyweight work'
          : 'Best estimated 1RM (the set behind it below); most reps in a set for bodyweight work',
      value: (e) => (e.valueUnit === 'lb' ? (e.bestStrength?.value ?? e.bestWeightLb) : null),
      render: (e) => {
        if (e.valueUnit === 'sec') {
          const best = e.bestHoldSec ?? e.bestStrength?.holdSec ?? null
          return best != null ? (
            <span class="cell-2">
              <span>{formatHold(best)}</span>
              <span class="cell-2__sub">longest hold</span>
            </span>
          ) : (
            '—'
          )
        }
        if (e.valueUnit === 'reps') {
          const r = reps.get(e.key)
          return r?.bestReps != null ? (
            <span class="cell-2">
              <span>{formatNumber(r.bestReps, { maxDecimals: 0 })} reps</span>
              <span class="cell-2__sub">best set</span>
            </span>
          ) : (
            '—'
          )
        }
        const s = e.bestStrength
        if (!s) return formatWeight(e.bestWeightLb, units)
        const ctx = strengthContext(s, metric, units)
        return (
          <span class="cell-2">
            <span>{formatStrength(s, metric, units)}</span>
            {ctx && <span class="cell-2__sub">{ctx}</span>}
          </span>
        )
      },
    },
    {
      id: 'latest',
      header: metric === 'actual' ? 'Latest' : 'Latest e1RM',
      kind: 'number',
      priority: 3,
      title:
        metric === 'actual'
          ? 'Heaviest set in the most recent session (weight × reps); total reps for bodyweight work'
          : 'Estimated 1RM in the most recent session; total reps for bodyweight work',
      value: (e) => (e.valueUnit === 'lb' ? (e.latestStrength?.value ?? null) : null),
      render: (e) => {
        if (e.valueUnit === 'sec') return formatStrength(e.latestStrength, metric, units, 'sec')
        if (e.valueUnit === 'reps') {
          const total = reps.get(e.key)?.totalReps ?? 0
          return total > 0 ? (
            <span class="cell-2">
              <span>{formatNumber(total, { maxDecimals: 0 })}</span>
              <span class="cell-2__sub">total reps</span>
            </span>
          ) : (
            '—'
          )
        }
        const s = e.latestStrength
        if (!s) return '—'
        const ctx = strengthContext(s, metric, units)
        return (
          <span class="cell-2">
            <span>{formatStrength(s, metric, units)}</span>
            {ctx && <span class="cell-2__sub">{ctx}</span>}
          </span>
        )
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
          ariaLabel={`${e.name}: ${e.valueUnit === 'sec' ? 'session longest hold' : e.valueUnit === 'lb' ? (metric === 'actual' ? 'session heaviest set' : 'session e1RM') : 'session reps'} over ${plural(e.spark.length, 'session')}`}
        />
      ),
    },
    {
      id: 'trend',
      header: 'Trend',
      kind: 'number',
      align: 'left',
      value: (e) => e.ratePerMonth,
      render: (e) => <TrendBadge status={e.status} ratePerMonth={isDetailed ? null : e.ratePerMonth} />,
    },
  ]
  if (isDetailed) {
    cols.push(
      {
        id: 'rate',
        header: '%/mo',
        kind: 'number',
        priority: 2,
        title: `Theil–Sen rate of ${metric === 'actual' ? 'heaviest-set' : 'e1RM'} change over the last 90 days`,
        value: (e) => e.ratePerMonth,
        render: (e) => (
          <span class={e.ratePerMonth == null ? 'faint' : e.ratePerMonth > 1 ? 'delta--pos' : e.ratePerMonth < -1 ? 'delta--neg' : undefined}>
            {formatRate(e.ratePerMonth)}
          </span>
        ),
      },
      {
        id: 'volume',
        header: 'Volume',
        kind: 'number',
        priority: 3,
        value: (e) => (e.volumeLb > 0 ? e.volumeLb : null),
        render: (e) => (e.volumeLb > 0 ? formatWeight(e.volumeLb, units, { compact: true }) : '—'),
      },
      {
        id: 'catalog',
        header: 'Catalog',
        align: 'center',
        priority: 3,
        title: 'Found in the bundled Motra exercise catalog (adds secondary muscles)',
        value: (e) => (e.inCatalog ? 1 : 0),
        kind: 'number',
        render: (e) =>
          e.inCatalog ? (
            <span class="catalog-yes" title="In the Motra catalog">
              <IconCheck size={14} title="In catalog" />
            </span>
          ) : (
            <span class="faint" title="Custom or renamed exercise: muscles come from the export only">
              —
            </span>
          ),
      },
    )
  }
  cols.push({
    id: 'last',
    header: 'Last',
    kind: 'number',
    priority: 3,
    value: (e) => e.lastDate?.getTime() ?? null,
    render: (e) => <span class="muted">{formatDate(e.lastDate, 'short')}</span>,
  })
  return cols
}

export default function ExercisesPage() {
  const idx = analysisIndex.value
  const win = analysisWindow.value
  const isDetailed = detailed.value
  const units = settings.value.units
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<RegionFilter>('all')

  const all = useMemo(() => (idx ? exerciseSummaries(idx, win) : []), [idx, win])
  const reps = useMemo(() => (idx ? repStatsByExercise(idx, win) : new Map<string, RepStats>()), [idx, win])

  const regionCounts = useMemo(() => {
    const counts = new Map<RegionId, number>()
    for (const e of all) for (const r of e.regions) counts.set(r, (counts.get(r) ?? 0) + 1)
    const rank = (r: RegionId) => {
      const i = REGION_ORDER.indexOf(r)
      return i < 0 ? REGION_ORDER.length : i
    }
    return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]))
  }, [all])

  // A stale filter (region absent after a range change) falls back to all.
  const activeRegion: RegionFilter = region !== 'all' && !regionCounts.some(([r]) => r === region) ? 'all' : region

  const rows = useMemo(() => {
    const q = normalizeKey(query.trim())
    return all.filter(
      (e) => (activeRegion === 'all' || e.regions.includes(activeRegion)) && (q === '' || normalizeKey(e.name).includes(q)),
    )
  }, [all, query, activeRegion])

  const metric = settings.value.strengthMetric
  const cols = useMemo(() => columns(units, reps, isDetailed, metric), [units, reps, isDetailed, metric])

  if (!idx) {
    return (
      <>
        <PageHeader title="Exercises" />
        <EmptyState icon={<IconExercises size={20} />} title="No workouts yet">
          Import a Motra export to see every exercise with its estimated 1RM and progress.
        </EmptyState>
      </>
    )
  }

  const status = { progressing: 0, plateau: 0, dip: 0 }
  for (const e of all) if (e.status !== 'insufficient') status[e.status]++
  const summary = [
    plural(all.length, 'exercise'),
    status.progressing > 0 && `${status.progressing} progressing`,
    status.plateau > 0 && `${status.plateau} on a plateau`,
    status.dip > 0 && `${status.dip} dipping`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <PageHeader
        title="Exercises"
        subtitle="Everything you logged in the selected range, with estimated 1RM and trend. Bodyweight work shows reps instead."
      />
      {all.length === 0 ? (
        <EmptyState icon={<IconExercises size={20} />} title="No exercises in this range">
          Choose a longer range in the top bar to include older workouts.
        </EmptyState>
      ) : (
        <Card
          flush
          title="All exercises"
          subtitle={summary}
          info="Estimated 1RMs assume sets close to failure, so without effort data they are a lower bound. Trends need 4+ sessions over 21+ days."
        >
          <div class="ex-toolbar">
            <label class="ex-search">
              <span class="sr-only">Search exercises</span>
              <input
                class="input"
                type="search"
                placeholder="Search exercises"
                value={query}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </label>
            {regionCounts.length > 1 && (
              <div class="filter-chips" role="group" aria-label="Filter by muscle">
                <button
                  type="button"
                  class="filter-chip"
                  aria-pressed={activeRegion === 'all'}
                  onClick={() => setRegion('all')}
                >
                  All <span class="filter-chip__n">{all.length}</span>
                </button>
                {regionCounts.map(([r, n]) => (
                  <button
                    key={r}
                    type="button"
                    class="filter-chip"
                    aria-pressed={activeRegion === r}
                    onClick={() => setRegion(activeRegion === r ? 'all' : r)}
                  >
                    {regionName(r)} <span class="filter-chip__n">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DataTable
            columns={cols}
            rows={rows}
            rowKey={(e) => e.key}
            rowHref={(e) => paths.exercise(e.key)}
            initialSort={{ id: 'sets' }}
            empty={query ? `No exercises match “${query}”.` : 'No exercises for this muscle in range.'}
            caption="Exercises"
          />
        </Card>
      )}
    </>
  )
}
