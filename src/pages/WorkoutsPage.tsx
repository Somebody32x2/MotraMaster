import { useId, useMemo, useState } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { workoutSummaries } from '../core/analytics'
import { dataset, detailed, settings } from '../state'
import { Card } from '../ui/components/Card'
import { InfoTip } from '../ui/components/InfoTip'
import { PageHeader } from '../ui/components/PageHeader'
import { StatStrip } from '../ui/components/StatStrip'
import { StatTile } from '../ui/components/StatTile'
import { formatDuration, formatNumber, formatWeight, plural, unitLabel } from '../ui/format'
import { activeRange, mean } from './overview/util'
import { WorkoutTable } from './workouts/WorkoutTable'

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

  if (!idx) return <PageHeader title="Workouts" />

  const q = query.trim().toLowerCase()
  const filtered = q ? rows.filter((r) => haystacks.get(r.workout.id)?.includes(q)) : rows
  const avgDuration = mean(rows.map((r) => r.durationSec))
  const avgHard = mean(rows.map((r) => r.hardSets))
  const avgVolume = mean(rows.map((r) => r.volumeLb))
  const avgCalories = mean(rows.map((r) => r.workout.calories))
  const anyTrimmed = filtered.some((r) => r.trimmedSec > 0)

  return (
    <>
      <PageHeader title="Workouts" subtitle={rows.length ? `${activeRange().title}, ${plural(rows.length, 'workout')}` : activeRange().title} />
      <div class="stack">
        <StatStrip lead>
          <StatTile label="Workouts" value={formatNumber(rows.length, { maxDecimals: 0 })} sub="in this range" />
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
        </StatStrip>

        <Card
          title="Workout log"
          actions={
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
              {q && (
                <span class="wo-count num" aria-live="polite">
                  {formatNumber(filtered.length, { maxDecimals: 0 })} of {formatNumber(rows.length, { maxDecimals: 0 })}
                </span>
              )}
            </div>
          }
        >
          <WorkoutTable
            rows={filtered}
            units={units}
            detailed={isDetailed}
            empty={q ? `No workouts match “${query.trim()}”.` : 'No workouts in this range. Pick a longer range above.'}
          />
          {anyTrimmed && (
            <p class="wo-note">
              <span aria-hidden="true">* </span>
              Idle time after the last set was trimmed
              <InfoTip text="The workout kept running after your last set, so time beyond the logged set and rest times plus the grace period was trimmed. Long rests between sets are kept. Adjust this in Settings." />
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
