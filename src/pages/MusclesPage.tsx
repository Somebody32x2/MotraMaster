import { useMemo, useState } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { muscleSummaries } from '../core/analytics'
import type { MuscleSummary, RegionId } from '../core/analytics/types'
import { REGION_ORDER } from '../core/regions'
import { navigate, paths } from '../router'
import { detailed, settings } from '../state'
import { BodyMap } from '../ui/bodymap'
import { Card } from '../ui/components/Card'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { Segmented, type SegmentedOption } from '../ui/components/Segmented'
import { plural } from '../ui/format'
import { IconMuscles } from '../ui/icons'
import { bandOf, FRACTIONAL_INFO } from './muscles/bands'
import { MuscleList } from './muscles/MuscleList'
import { UnmappedLabels } from './muscles/UnmappedLabels'
import './muscles/muscles.css'

type SortKey = 'sets' | 'anatomy' | 'recent'
type Measure = 'direct' | 'fractional'

const SORT_OPTIONS: SegmentedOption<SortKey>[] = [
  { value: 'sets', label: 'Weekly sets', title: 'Most weekly sets first' },
  { value: 'anatomy', label: 'Head to toe', title: 'Anatomical order, top to bottom' },
  { value: 'recent', label: 'Last trained', title: 'Most recently trained first' },
]

const MEASURE_OPTIONS: SegmentedOption<Measure>[] = [
  { value: 'direct', label: 'Direct', title: 'Only sets where the muscle is a primary mover' },
  { value: 'fractional', label: 'Fractional', title: 'Direct sets plus 0.5 per strong secondary involvement' },
]

const anatomyRank = (r: RegionId) => {
  const i = REGION_ORDER.indexOf(r)
  return i < 0 ? REGION_ORDER.length : i
}

export default function MusclesPage() {
  const idx = analysisIndex.value
  const win = analysisWindow.value
  const isDetailed = detailed.value
  const units = settings.value.units
  const [sort, setSort] = useState<SortKey>('sets')
  const [measure, setMeasure] = useState<Measure>('direct')
  const [hot, setHot] = useState<RegionId | null>(null)

  const summaries = useMemo(() => (idx ? muscleSummaries(idx, win) : []), [idx, win])
  const fractional = isDetailed && measure === 'fractional'
  const setsOf = (m: MuscleSummary) => {
    const v = fractional ? m.weeklyFractional : m.weeklySets
    return Number.isFinite(v) ? v : 0
  }

  const rows = useMemo(() => {
    const list = summaries.slice()
    const byName = (a: MuscleSummary, b: MuscleSummary) => a.name.localeCompare(b.name)
    if (sort === 'anatomy') list.sort((a, b) => anatomyRank(a.region) - anatomyRank(b.region))
    else if (sort === 'recent')
      list.sort((a, b) => (b.lastTrained?.getTime() ?? -Infinity) - (a.lastTrained?.getTime() ?? -Infinity) || byName(a, b))
    else list.sort((a, b) => setsOf(b) - setsOf(a) || byName(a, b))
    return list
  }, [summaries, sort, fractional])

  if (!idx) {
    return (
      <>
        <PageHeader title="Muscles" />
        <EmptyState icon={<IconMuscles size={20} />} title="No workouts yet">
          Import a Motra export to see weekly sets per muscle.
        </EmptyState>
      </>
    )
  }

  const values: Partial<Record<RegionId, number>> = {}
  for (const m of summaries) values[m.region] = setsOf(m)

  const counts = { target: 0, below: 0, none: 0, high: 0 }
  for (const m of summaries) {
    if (m.region === 'other' || m.region === 'cardio' || m.region === 'fullBody') continue
    const b = bandOf(setsOf(m))
    if (b === 'target') counts.target++
    else if (b === 'high') counts.high++
    else if (b === 'none') counts.none++
    else counts.below++
  }
  const summaryLine = [
    `${counts.target} in the 10–20 range`,
    counts.below > 0 && `${counts.below} below`,
    counts.high > 0 && `${counts.high} above 20`,
    counts.none > 0 && `${counts.none} not trained`,
  ]
    .filter(Boolean)
    .join(' · ')

  const other = summaries.find((m) => m.region === 'other')
  const trained = summaries.some((m) => setsOf(m) > 0 || m.windowSets > 0)

  return (
    <>
      <PageHeader
        title="Muscles"
        subtitle="Hard sets per muscle in the 7 days ending at your latest workout in range, against the 10–20 weekly-set range."
        actions={
          isDetailed ? (
            <Segmented options={MEASURE_OPTIONS} value={measure} onChange={setMeasure} label="Set counting" size="sm" />
          ) : undefined
        }
      />

      <div class="muscles-layout">
        <Card
          class="muscles-layout__map"
          title={fractional ? 'Fractional sets, last 7 days' : 'Sets, last 7 days'}
          info={fractional ? FRACTIONAL_INFO : 'Each region is shaded by its weekly hard sets: under 5, 5–9, the 10–20 typical range, and above 20.'}
        >
          <BodyMap
            values={values}
            scale="weeklySets"
            size="lg"
            selected={hot}
            onSelect={(r) => navigate(paths.muscle(r))}
            legend
          />
        </Card>

        <Card
          flush
          class="muscles-layout__list"
          title="Ranking"
          subtitle={trained ? summaryLine : plural(0, 'hard set') + ' in this range'}
          actions={<Segmented options={SORT_OPTIONS} value={sort} onChange={setSort} label="Sort muscles" size="sm" />}
        >
          {rows.length === 0 ? (
            <EmptyState plain title="Nothing logged in this range">
              Pick a longer range in the top bar to include older workouts.
            </EmptyState>
          ) : (
            <MuscleList
              rows={rows}
              setsOf={setsOf}
              fractional={fractional}
              detailed={isDetailed}
              units={units}
              highlighted={hot}
              onHighlight={setHot}
            />
          )}
        </Card>
      </div>

      {isDetailed && <UnmappedLabels other={other ?? null} />}
    </>
  )
}
