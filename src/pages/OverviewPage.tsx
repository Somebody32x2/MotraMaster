import { useMemo } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { overviewStats, strengthProfile } from '../core/analytics'
import { detailed, settings } from '../state'
import { PageHeader } from '../ui/components/PageHeader'
import { formatDate } from '../ui/format'
import {
  BalanceCard,
  DensityCard,
  EffortCard,
  HrZonesCard,
  IntensityCard,
  LoadRatioCard,
  NewExercisesCard,
  RestCard,
  StrengthScoreCard,
} from './overview/DetailedCards'
import {
  ConsistencyCard,
  FrequencyCard,
  MuscleWeekCard,
  OverviewHero,
  OverviewStrip,
  RecentPrsCard,
  RelativeStrengthCard,
  TopLiftsCard,
  VolumeTrendCard,
} from './overview/NormalCards'
import { activeRange, sum } from './overview/util'

export default function OverviewPage() {
  const idx = analysisIndex.value
  const win = analysisWindow.value
  const s = settings.value
  const isDetailed = detailed.value
  const stats = useMemo(() => (idx ? overviewStats(idx, win) : null), [idx, win])
  const profile = useMemo(() => (idx ? strengthProfile(idx, s) : null), [idx, s])

  const range = activeRange()
  const subtitle = win.start
    ? `${range.title}, ${formatDate(win.start, 'medium')} to ${formatDate(win.end, 'medium')}`
    : `All time, through ${formatDate(win.end, 'medium')}`

  if (!idx || !stats) return <PageHeader title="Overview" />

  const units = s.units
  const effort = stats.effortHistogram && sum(stats.effortHistogram) > 0 ? stats.effortHistogram : null
  const hasScores = profile != null && (profile.dots != null || profile.ipfGl != null)

  return (
    <>
      <PageHeader title="Overview" subtitle={subtitle} />
      <div class="ov-lede">
        <OverviewHero stats={stats} units={units} />
        <OverviewStrip stats={stats} units={units} detailed={isDetailed} />
      </div>
      <div class="ov-grid">
        <MuscleWeekCard muscles={stats.muscles} end={win.end} detailed={isDetailed} class="ov-span-8" />
        <ConsistencyCard stats={stats} idx={idx} units={units} class="ov-span-4" />
        <TopLiftsCard lifts={stats.topLifts} units={units} detailed={isDetailed} class="ov-span-7" />
        <RecentPrsCard prs={stats.recentPrs} units={units} class="ov-span-5" />
        <VolumeTrendCard stats={stats} units={units} class="ov-span-12" />
        <FrequencyCard muscles={stats.muscles} class="ov-span-7" />
        <RelativeStrengthCard profile={profile} settings={s} class="ov-span-5" />
      </div>

      {isDetailed && (
        <section class="ov-more" aria-labelledby="ov-more-title">
          <h2 class="ov-more__title" id="ov-more-title">
            More detail
          </h2>
          <div class="ov-flow">
            <IntensityCard stats={stats} />
            <BalanceCard balance={stats.balance} />
            <HrZonesCard stats={stats} />
            <RestCard stats={stats} />
            {effort && <EffortCard histogram={effort} />}
            <DensityCard stats={stats} units={units} />
            <LoadRatioCard ratio={stats.loadRatio} />
            {hasScores && profile && <StrengthScoreCard profile={profile} />}
            <NewExercisesCard items={stats.newExercises} />
          </div>
        </section>
      )}
    </>
  )
}
