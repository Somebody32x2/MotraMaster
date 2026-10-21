import { useMemo } from 'preact/hooks'
import { analysisIndex } from '../analysis'
import { workoutDetail } from '../core/analytics'
import type { RegionId } from '../core/analytics/types'
import { regionName } from '../core/regions'
import { href, navigate, paths } from '../router'
import { detailed, settings } from '../state'
import { BodyMap } from '../ui/bodymap'
import { BarChart } from '../ui/charts'
import { Card } from '../ui/components/Card'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { StatTile } from '../ui/components/StatTile'
import { formatDate, formatDuration, formatNumber, formatPercent, formatRest, formatWeight, plural, unitLabel } from '../ui/format'
import { IconWorkouts } from '../ui/icons'
import { RegionChips } from '../ui/widgets'
import { CardEmpty, ShareBar } from './overview/parts'
import { HR_ZONES, isNum, median, sum } from './overview/util'
import { ExerciseBlock } from './workouts/ExerciseBlock'

const BACK = { path: paths.workouts(), label: 'All workouts' }

export default function WorkoutDetailPage({ workoutId }: { workoutId: string }) {
  const idx = analysisIndex.value
  const units = settings.value.units
  const isDetailed = detailed.value
  const d = useMemo(() => (idx ? workoutDetail(idx, workoutId) : null), [idx, workoutId])

  if (!idx) return <PageHeader eyebrow="Workout" title="Workout" back={BACK} />
  if (!d) {
    return (
      <>
        <PageHeader eyebrow="Workout" title="Workout not found" back={BACK} />
        <EmptyState
          icon={<IconWorkouts size={20} />}
          title="This workout isn’t in your data"
          action={
            <a class="btn" href={href(paths.workouts())}>
              Back to workouts
            </a>
          }
        >
          It may have been removed by a replacing import, or the link is out of date.
        </EmptyState>
      </>
    )
  }

  const w = d.workout
  const calories = isNum(w.calories) && w.calories > 0 ? w.calories : null
  const timeRange = w.start && w.end ? `${formatDate(w.start, 'time')} – ${formatDate(w.end, 'time')}` : w.start ? formatDate(w.start, 'time') : null
  const headerMeta = [timeRange, d.durationSec != null ? formatDuration(d.durationSec) : null, calories != null ? `${formatNumber(calories, { maxDecimals: 0 })} kcal` : null]
    .filter(Boolean)
    .join(' · ')

  const regions = (Object.entries(d.regionSets) as [RegionId, number][])
    .filter(([, n]) => isNum(n) && n > 0)
    .sort((a, b) => b[1] - a[1])

  const hr = d.hrZonesSec && sum(d.hrZonesSec) > 0 ? d.hrZonesSec : null
  const hrTotal = hr ? sum(hr) : 0
  const highShare = hr && hrTotal > 0 ? sum(hr.slice(2)) / hrTotal : null
  const rests = d.restSeries.filter((r) => isNum(r.restSec) && r.restSec > 0)
  const medianRest = median(rests.map((r) => r.restSec))

  return (
    <>
      <PageHeader eyebrow={d.date ? formatDate(d.date, 'long') : 'Undated workout'} title={w.title || 'Workout'} subtitle={headerMeta || undefined} back={BACK}>
        {d.topRegions.length > 0 && (
          <div class="wo-head-chips">
            <RegionChips regions={d.topRegions} max={5} />
          </div>
        )}
      </PageHeader>

      <div class="ov-grid">
        <div class="stats-row ov-span-12">
          <StatTile label="Duration" value={formatDuration(d.durationSec)} />
          <StatTile
            label="Hard sets"
            value={formatNumber(d.hardSets, { maxDecimals: 0 })}
            sub={`of ${plural(d.sets, 'set')} logged`}
            hint="Working sets only: effort 6+ when logged, otherwise at least 60% of that exercise’s top weight in the session."
          />
          <StatTile
            label="Volume"
            value={formatWeight(d.volumeLb, units, { unit: false, compact: true })}
            unit={unitLabel(units)}
            hint="Weight × reps, using Motra’s total volume lifted (TVL) when reported."
          />
          <StatTile label="Exercises" value={formatNumber(d.exercises, { maxDecimals: 0 })} />
          <StatTile label="PRs" value={formatNumber(d.prCount, { maxDecimals: 0 })} sub={d.prCount > 0 ? 'records set' : 'none this session'} />
          {(calories != null || isDetailed) && (
            <StatTile
              label="Calories"
              value={formatNumber(calories, { maxDecimals: 0 })}
              unit={calories != null ? 'kcal' : undefined}
              sub={isDetailed && d.kcalPerMin != null ? `${formatNumber(d.kcalPerMin, { maxDecimals: 1 })} kcal/min` : calories == null ? 'Not recorded' : undefined}
            />
          )}
          {isDetailed && (
            <StatTile
              label="Density"
              value={d.density != null ? formatWeight(d.density, units, { unit: false }) : '—'}
              unit={d.density != null ? `${unitLabel(units)}/min` : undefined}
              hint="Volume divided by session minutes."
            />
          )}
          {isDetailed && isNum(w.effort) && <StatTile label="Session effort" value={formatNumber(w.effort)} unit="/ 10" hint="Motra’s perceived effort (RPE) for the whole session." />}
        </div>

        <Card title="Muscles worked" subtitle="Hard sets credited to each muscle" class="ov-span-12">
          {regions.length ? (
            <div class="wo-muscle">
              <div class="wo-muscle__map"><BodyMap values={d.regionSets} scale="relative" size="md" onSelect={(r) => navigate(paths.muscle(r))} /></div>
              <BarChart
                orientation="horizontal"
                data={regions.map(([r, n]) => ({
                  key: r,
                  label: regionName(r),
                  values: Math.round(n * 10) / 10,
                  color: 'var(--accent)',
                  href: href(paths.muscle(r)),
                }))}
                valueFormat={(n) => formatNumber(n, { maxDecimals: 1 })}
                ariaLabel="Hard sets per muscle in this workout"
              />
            </div>
          ) : (
            <CardEmpty>No hard sets were credited to a muscle in this workout.</CardEmpty>
          )}
        </Card>

        {isDetailed && (
          <>
            <Card
              title="Heart-rate zones"
              subtitle={highShare != null ? `${formatPercent(highShare)} of zone time at zone 3 or above` : undefined}
              info="Time in Motra’s heart-rate zones (percent of max heart rate). Time below zone 1 is not counted."
              class="ov-span-5"
            >
              {hr ? (
                <ShareBar
                  label="Heart-rate zones"
                  items={HR_ZONES.map((label, i) => ({ key: `z${i}`, label, value: hr[i] ?? 0, detail: formatDuration(hr[i] ?? 0) }))}
                />
              ) : (
                <CardEmpty>No heart-rate zone data for this workout.</CardEmpty>
              )}
            </Card>
            <Card
              title="Rest timeline"
              subtitle={medianRest != null ? `Median ${formatRest(medianRest)} between sets` : undefined}
              info="Rest before each set, excluding the first set of each exercise (which includes changeover time)."
              class="ov-span-7"
            >
              {rests.length ? (
                <BarChart
                  data={rests.map((r) => ({ key: String(r.index), label: `Set ${r.index + 1}`, values: r.restSec, color: 'var(--c3)' }))}
                  valueFormat={formatRest}
                  height={180}
                  ariaLabel="Rest before each set"
                />
              ) : (
                <CardEmpty>No rest times recorded between sets.</CardEmpty>
              )}
            </Card>
          </>
        )}

        <h2 class="section-title ov-span-12 ov-section">Exercises</h2>
        {d.blocks.length ? (
          d.blocks.map((b, i) => (
            <ExerciseBlock key={`${b.exerciseKey}-${i}`} block={b} units={units} detailed={isDetailed} class={isDetailed ? 'ov-span-12' : 'ov-span-6'} />
          ))
        ) : (
          <div class="ov-span-12">
            <CardEmpty>No sets recorded in this workout.</CardEmpty>
          </div>
        )}
      </div>
    </>
  )
}
