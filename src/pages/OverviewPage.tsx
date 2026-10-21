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
  KpiRow,
  MuscleWeekCard,
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
  const subtitle = win.start ? `${formatDate(win.start, 'medium')} – ${formatDate(win.end, 'medium')}` : `All time, through ${formatDate(win.end, 'medium')}`

  if (!idx || !stats) return <PageHeader title="Overview" />

  const units = s.units
  const effort = stats.effortHistogram && sum(stats.effortHistogram) > 0 ? stats.effortHistogram : null
  const hasScores = profile != null && (profile.dots != null || profile.ipfGl != null)

  return (
    <>
      <PageHeader eyebrow={range.title} title="Overview" subtitle={subtitle} />
      <div class="ov-grid">
        <KpiRow stats={stats} units={units} detailed={isDetailed} />
        <ConsistencyCard stats={stats} idx={idx} units={units} class="ov-span-7" />
        <TopLiftsCard lifts={stats.topLifts} units={units} detailed={isDetailed} class="ov-span-5" />
        <MuscleWeekCard muscles={stats.muscles} end={win.end} detailed={isDetailed} class="ov-span-12" />
        <VolumeTrendCard stats={stats} units={units} class="ov-span-7" />
        <RecentPrsCard prs={stats.recentPrs} units={units} class="ov-span-5" />
        <FrequencyCard muscles={stats.muscles} class="ov-span-6" />
        <RelativeStrengthCard profile={profile} settings={s} class="ov-span-6" />

        {isDetailed && (
          <>
            <h2 class="section-title ov-span-12 ov-section">Detailed analysis</h2>
            <BalanceCard balance={stats.balance} class="ov-span-6" />
            <IntensityCard stats={stats} class="ov-span-6" />
            <RestCard stats={stats} class="ov-span-4" />
            <DensityCard stats={stats} units={units} class="ov-span-4" />
            <LoadRatioCard ratio={stats.loadRatio} class="ov-span-4" />
            <HrZonesCard stats={stats} class={effort ? 'ov-span-8' : 'ov-span-12'} />
            {effort && <EffortCard histogram={effort} class="ov-span-4" />}
            <NewExercisesCard items={stats.newExercises} class={hasScores ? 'ov-span-8' : 'ov-span-12'} />
            {hasScores && profile && <StrengthScoreCard profile={profile} class="ov-span-4" />}
          </>
        )}
      </div>
    </>
  )
}
