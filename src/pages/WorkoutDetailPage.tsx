import { useMemo } from 'preact/hooks'
import { analysisIndex } from '../analysis'
import { workoutDetail } from '../core/analytics'
import type { RegionId } from '../core/analytics/types'
import { regionName } from '../core/regions'
import { href, navigate, paths } from '../router'
import { detailed, settings } from '../state'
import { BodyMap } from '../ui/bodymap'
import { BarChart, rampColor } from '../ui/charts'
import { Card } from '../ui/components/Card'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { StatStrip } from '../ui/components/StatStrip'
import { StatTile } from '../ui/components/StatTile'
import { EMPTY, formatDate, formatDuration, formatNumber, formatPercent, formatRest, formatWeight, plural, unitLabel } from '../ui/format'
import { HARD_SET_RULE } from '../ui/widgets'
import { CardEmpty } from './overview/parts'
import { HR_ZONES, isNum, median, sum } from './overview/util'
import { ExerciseBlock } from './workouts/ExerciseBlock'

const BACK = { path: paths.workouts(), label: 'All workouts' }
const ZONE_COLORS = HR_ZONES.map((_, i) => rampColor(i, HR_ZONES.length))

/** Time in each heart-rate zone as one stacked bar, zone 1 to zone 5 on the accent ramp. */
function ZoneBar({ seconds }: { seconds: number[] }) {
  const total = sum(seconds)
  const zones = HR_ZONES.map((label, i) => ({ label, sec: seconds[i] ?? 0, share: total > 0 ? (seconds[i] ?? 0) / total : 0, color: ZONE_COLORS[i] }))
  return (
    <div class="wo-zones">
      <div class="wo-zones__bar" role="img" aria-label={`Heart-rate zones: ${zones.map((z) => `${z.label} ${formatPercent(z.share)}`).join(', ')}`}>
        {zones.map((z) =>
          z.share > 0 ? <span key={z.label} style={{ width: `${z.share * 100}%`, background: z.color }} title={`${z.label}: ${formatDuration(z.sec)}`} /> : null,
        )}
      </div>
      <table class="wo-zones__legend">
        <caption class="sr-only">Time in each heart-rate zone</caption>
        <tbody>
          {zones.map((z) => (
            <tr key={z.label} class={z.share > 0 ? undefined : 'is-zero'}>
              <th scope="row">
                <span class="wo-zones__swatch" style={{ background: z.color }} aria-hidden="true" />
                {z.label}
              </th>
              <td class="num">{formatDuration(z.sec)}</td>
              <td class="num">{formatPercent(z.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function WorkoutDetailPage({ workoutId }: { workoutId: string }) {
  const idx = analysisIndex.value
  const units = settings.value.units
  const isDetailed = detailed.value
  const d = useMemo(() => (idx ? workoutDetail(idx, workoutId) : null), [idx, workoutId])

  if (!idx) return <PageHeader title="Workout" back={BACK} />
  if (!d) {
    return (
      <>
        <PageHeader title="Workout not found" back={BACK} />
        <EmptyState
          title="This workout isn’t in your data."
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
  const trimmed = d.trimmedSec > 0 && d.rawDurationSec != null
  const timeRange =
    w.start && w.end ? `${formatDate(w.start, 'time')} to ${formatDate(w.end, 'time')}` : w.start ? formatDate(w.start, 'time') : null
  const dateLine = [d.date ? formatDate(d.date, 'long') : 'Undated', timeRange, calories != null ? `${formatNumber(calories, { maxDecimals: 0 })} kcal` : null]
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
      <PageHeader title={w.title || 'Workout'} subtitle={dateLine} back={BACK} />

      <div class="stack">
        <StatStrip lead>
          <StatTile
            label="Duration"
            value={formatDuration(d.durationSec)}
            sub={trimmed ? `${formatDuration(d.trimmedSec)} idle trimmed, logged ${formatDuration(d.rawDurationSec)}` : undefined}
            hint={
              trimmed
                ? 'The workout kept running after your last set, so time beyond the logged set and rest times plus the grace period was trimmed. Long rests between sets are kept; calories and heart-rate zones are left as Motra recorded them. Adjust this in Settings.'
                : undefined
            }
          />
          <StatTile
            label="Hard sets"
            value={formatNumber(d.hardSets, { maxDecimals: 1 })}
            sub={`of ${plural(d.sets, 'set')} logged`}
            hint={HARD_SET_RULE}
          />
          <StatTile label="Volume" value={formatWeight(d.volumeLb, units, { unit: false, compact: true })} unit={unitLabel(units)} sub="weight × reps" />
          <StatTile label="Exercises" value={formatNumber(d.exercises, { maxDecimals: 0 })} />
          <StatTile label="PRs" value={formatNumber(d.prCount, { maxDecimals: 0 })} sub={d.prCount > 0 ? 'records set' : 'none this session'} />
        </StatStrip>

        <Card title="Muscles worked" subtitle="Hard sets credited to each muscle">
          {regions.length ? (
            <div class="wo-muscle">
              <div class="wo-muscle__map">
                <BodyMap values={d.regionSets} scale="relative" size="md" onSelect={(r) => navigate(paths.muscle(r))} />
              </div>
              <div class="wo-muscle__bars">
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
            </div>
          ) : (
            <CardEmpty>No hard sets were credited to a muscle in this workout.</CardEmpty>
          )}
        </Card>

        {isDetailed && (
          <Card title="Session details">
            <div class="wo-extras">
              <StatStrip class="wo-extras__stats">
                <StatTile
                  label="Calories"
                  value={formatNumber(calories, { maxDecimals: 0 })}
                  unit={calories != null ? 'kcal' : undefined}
                  sub={calories == null ? 'Not recorded' : undefined}
                />
                <StatTile label="kcal/min" value={formatNumber(d.kcalPerMin, { maxDecimals: 1 })} />
                <StatTile
                  label="Density"
                  value={d.density != null ? formatWeight(d.density, units, { unit: false }) : EMPTY}
                  unit={d.density != null ? `${unitLabel(units)}/min` : undefined}
                  hint="Volume divided by session minutes."
                />
                <StatTile label="Session effort" value={formatNumber(isNum(w.effort) ? w.effort : null)} unit={isNum(w.effort) ? '/ 10' : undefined} sub="RPE" />
              </StatStrip>

              <div class="wo-extras__grid">
                <section class="wo-extra" aria-labelledby="wo-hr-title">
                  <h4 class="wo-extra__title" id="wo-hr-title">
                    Heart-rate zones
                  </h4>
                  <p class="wo-extra__sub">{highShare != null ? `${formatPercent(highShare)} of zone time at zone 3 or above` : 'Percent of max heart rate'}</p>
                  {hr ? <ZoneBar seconds={hr} /> : <CardEmpty>No heart-rate zone data for this workout.</CardEmpty>}
                </section>
                <section class="wo-extra" aria-labelledby="wo-rest-title">
                  <h4 class="wo-extra__title" id="wo-rest-title">
                    Rest timeline
                  </h4>
                  <p class="wo-extra__sub">
                    {medianRest != null ? `Median ${formatRest(medianRest)} between sets` : 'Rest before each set'}
                  </p>
                  {rests.length ? (
                    <BarChart
                      data={rests.map((r) => ({ key: String(r.index), label: `Set ${r.index + 1}`, values: r.restSec, color: 'var(--c2)' }))}
                      valueFormat={formatRest}
                      height={180}
                      ariaLabel="Rest before each set"
                    />
                  ) : (
                    <CardEmpty>No rest times recorded between sets.</CardEmpty>
                  )}
                </section>
              </div>
            </div>
          </Card>
        )}

        <Card title="Exercises" actions={<span class="wo-ex-count">{plural(d.blocks.length, 'exercise')}</span>}>
          {d.blocks.length ? (
            <div class="wo-ex-list">
              {d.blocks.map((b, i) => (
                <ExerciseBlock key={`${b.exerciseKey}-${i}`} block={b} units={units} detailed={isDetailed} />
              ))}
            </div>
          ) : (
            <CardEmpty>No sets recorded in this workout.</CardEmpty>
          )}
        </Card>
      </div>
    </>
  )
}
