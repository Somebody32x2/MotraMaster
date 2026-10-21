import { useId, useMemo, useState } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { workoutSummaries } from '../core/analytics'
import type { WorkoutSummary } from '../core/analytics/types'
import type { Units } from '../core/types'
import { paths } from '../router'
import { dataset, detailed, settings } from '../state'
import { Badge } from '../ui/components/Badge'
import { Card } from '../ui/components/Card'
import { DataTable, type Column } from '../ui/components/DataTable'
import { PageHeader } from '../ui/components/PageHeader'
import { StatTile } from '../ui/components/StatTile'
import { formatDate, formatDuration, formatNumber, formatWeight, plural, unitLabel } from '../ui/format'
import { RegionChips } from '../ui/widgets'
import { activeRange, mean } from './overview/util'

function columns(units: Units, isDetailed: boolean): Column<WorkoutSummary>[] {
  const cols: Column<WorkoutSummary>[] = [
    {
      id: 'date',
      header: 'Date',
      kind: 'number',
      align: 'left',
      value: (r) => r.date?.getTime() ?? null,
      render: (r) => (
        <span class="wo-date">
          <span>{r.date ? formatDate(r.date, 'weekday') : 'Undated'}</span>
          <span class="faint">{r.date ? `${formatDate(r.date, 'time')} · ${r.date.getFullYear()}` : ''}</span>
        </span>
      ),
    },
    {
      id: 'title',
      header: 'Workout',
      kind: 'text',
      value: (r) => r.workout.title,
      render: (r) => (
        <span class="wo-title">
          <span>{r.workout.title || 'Workout'}</span>
          {r.prCount > 0 && <Badge tone="accent">{plural(r.prCount, 'PR')}</Badge>}
        </span>
      ),
    },
    { id: 'duration', header: 'Duration', kind: 'number', value: (r) => r.durationSec, render: (r) => formatDuration(r.durationSec), hideBelow: 'sm' },
    {
      id: 'hard',
      header: 'Hard sets',
      kind: 'number',
      title: 'Working sets, excluding warm-ups',
      value: (r) => r.hardSets,
      render: (r) => (
        <span title={`${plural(r.sets, 'set')} logged`}>
          {formatNumber(r.hardSets, { maxDecimals: 0 })}
          <span class="faint"> / {formatNumber(r.sets, { maxDecimals: 0 })}</span>
        </span>
      ),
    },
    { id: 'volume', header: 'Volume', kind: 'number', value: (r) => r.volumeLb, render: (r) => formatWeight(r.volumeLb, units, { compact: true }) },
    { id: 'exercises', header: 'Exercises', kind: 'number', value: (r) => r.exercises, hideBelow: 'md' },
    {
      id: 'regions',
      header: 'Muscles',
      sortable: false,
      render: (r) => (r.topRegions.length ? <RegionChips regions={r.topRegions} max={3} /> : <span class="faint">—</span>),
      hideBelow: 'md',
    },
  ]
  if (isDetailed) {
    cols.push(
      {
        id: 'density',
        header: 'Density',
        kind: 'number',
        title: 'Volume per minute of session time',
        value: (r) => r.density,
        render: (r) => (r.density != null ? `${formatWeight(r.density, units, { unit: false })} ${unitLabel(units)}/min` : '—'),
        hideBelow: 'md',
      },
      {
        id: 'kcalmin',
        header: 'kcal/min',
        kind: 'number',
        value: (r) => r.kcalPerMin,
        render: (r) => formatNumber(r.kcalPerMin, { maxDecimals: 1 }),
        hideBelow: 'md',
      },
      {
        id: 'calories',
        header: 'Calories',
        kind: 'number',
        value: (r) => r.workout.calories,
        render: (r) => formatNumber(r.workout.calories, { maxDecimals: 0 }),
        hideBelow: 'md',
      },
    )
  }
  return cols
}

export default function WorkoutsPage() {
  const idx = analysisIndex.value
  const win = analysisWindow.value
  const units = settings.value.units
  const isDetailed = detailed.value
  const ds = dataset.value
  const [query, setQuery] = useState('')
  const filterId = useId()

  const rows = useMemo(() => (idx ? workoutSummaries(idx, win) : []), [idx, win])
  const haystacks = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) {
      const names = new Set<string>([r.workout.title])
      for (const set of r.workout.sets) {
        names.add(set.exerciseRaw)
        const info = ds?.exercises[set.exerciseKey]
        if (info) names.add(info.name)
      }
      m.set(r.workout.id, [...names].join('\n').toLowerCase())
    }
    return m
  }, [rows, ds])
  const cols = useMemo(() => columns(units, isDetailed), [units, isDetailed])

  if (!idx) return <PageHeader title="Workouts" />

  const q = query.trim().toLowerCase()
  const filtered = q ? rows.filter((r) => haystacks.get(r.workout.id)?.includes(q)) : rows
  const avgDuration = mean(rows.map((r) => r.durationSec))
  const avgHard = mean(rows.map((r) => r.hardSets))
  const avgVolume = mean(rows.map((r) => r.volumeLb))
  const avgCalories = mean(rows.map((r) => r.workout.calories))

  return (
    <>
      <PageHeader title="Workouts" eyebrow={activeRange().title} subtitle={rows.length ? `${plural(rows.length, 'workout')} in this range` : undefined} />
      <div class="stack" style={{ '--gap': 'var(--s4)' }}>
        <div class="stats-row">
          <StatTile label="Workouts" value={formatNumber(rows.length, { maxDecimals: 0 })} />
          <StatTile label="Avg duration" value={formatDuration(avgDuration)} sub="per session" />
          <StatTile
            label="Avg hard sets"
            value={formatNumber(avgHard, { maxDecimals: 1 })}
            sub="per session"
            hint="Working sets only: effort 6+ when logged, otherwise at least 60% of that exercise’s top weight in the session."
          />
          <StatTile label="Avg volume" value={formatWeight(avgVolume, units, { unit: false, compact: true })} unit={unitLabel(units)} sub="per session" />
          {isDetailed && (
            <StatTile
              label="Avg calories"
              value={formatNumber(avgCalories, { maxDecimals: 0 })}
              unit={avgCalories != null ? 'kcal' : undefined}
              sub={avgCalories != null ? 'per session' : 'Not recorded'}
            />
          )}
        </div>

        <Card flush>
          <div class="wo-toolbar">
            <label class="sr-only" for={filterId}>
              Filter workouts
            </label>
            <input
              id={filterId}
              class="input wo-filter"
              type="search"
              placeholder="Filter by title or exercise"
              value={query}
              autoComplete="off"
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <span class="faint num wo-count" aria-live="polite">
              {q ? `${formatNumber(filtered.length, { maxDecimals: 0 })} of ${plural(rows.length, 'workout')}` : plural(rows.length, 'workout')}
            </span>
          </div>
          <DataTable
            columns={cols}
            rows={filtered}
            rowKey={(r) => r.workout.id}
            rowHref={(r) => paths.workout(r.workout.id)}
            initialSort={{ id: 'date', dir: 'desc' }}
            caption="Workouts"
            empty={q ? `No workouts match “${query.trim()}”.` : 'No workouts in this range. Try a longer range in the top bar.'}
          />
        </Card>
      </div>
    </>
  )
}
