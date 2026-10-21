import type { ComponentChildren } from 'preact'
import { useMemo } from 'preact/hooks'
import { analysisIndex, analysisWindow } from '../analysis'
import { exerciseDetail, oneRmFormulas } from '../core/analytics'
import type { DeltHead, ExerciseDetail, RegionId } from '../core/analytics/types'
import { displayLabel } from '../core/labels'
import type { OneRmFormula, Sex, Units } from '../core/types'
import { href, paths } from '../router'
import { dataset, detailed, settings } from '../state'
import { BodyMap } from '../ui/bodymap'
import type { LinePoint } from '../ui/charts'
import { Card } from '../ui/components/Card'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { StatStrip } from '../ui/components/StatStrip'
import { StatTile } from '../ui/components/StatTile'
import { formatDate, formatDuration, formatNumber, formatWeight, plural, unitLabel } from '../ui/format'
import { IconExercises, IconInfo } from '../ui/icons'
import { formatHold, formatRate, PrList, RegionChips, STRENGTH_METRIC_EXPLAINER, StrengthMetricToggle, strengthContext, strengthTitle, TrendBadge } from '../ui/widgets'
import { E1rmChart, HoldChart, SimpleLineChart } from './exercises/E1rmChart'
import { ChangeCard, DistributionCards, LoadCharts, RelativeStrengthCard, SetQualityCard } from './exercises/ExerciseInsights'
import { FormulasCard, HistoryCard, RepMaxCard } from './exercises/ExerciseTables'
import { displayWeightFormat, exerciseCaveats, weightPoints } from './exercises/util'
import './exercises/exercises.css'

const ESTIMATE_CAVEAT =
  'Estimates assume sets taken close to failure; without effort ratings they are a lower bound. They can be 10% off for an individual and tend to overshoot for novices.'

function formulaLabel(formula: OneRmFormula): string {
  if (formula === 'auto') return 'Auto: Epley/Brzycki mean ≤10 reps, Wathan 11–15'
  return oneRmFormulas.find((f) => f.key === formula)?.name ?? formula
}

/** Rep/duration facts for bodyweight and timed exercises, from session history. */
function unweightedStats(d: ExerciseDetail) {
  let bestReps: number | null = null
  let bestDuration: number | null = null
  let totalReps = 0
  const perSession: LinePoint[] = []
  const history = d.history.slice().sort((a, b) => a.date.getTime() - b.date.getTime())
  for (const row of history) {
    let reps = 0
    for (const s of row.sets) {
      if (s.reps != null && s.reps > 0) {
        reps += s.reps
        if (bestReps == null || s.reps > bestReps) bestReps = s.reps
      } else if (s.durationSec != null && s.durationSec > 0 && (bestDuration == null || s.durationSec > bestDuration)) {
        bestDuration = s.durationSec
      }
    }
    totalReps += reps
    if (reps > 0) perSession.push({ x: row.date, y: reps })
  }
  return { bestReps, bestDuration, totalReps, perSession }
}

export default function ExerciseDetailPage({ exerciseKey }: { exerciseKey: string }) {
  const idx = analysisIndex.value
  const win = analysisWindow.value
  const s = settings.value
  const isDetailed = detailed.value
  const units = s.units
  const ds = dataset.value

  const d = useMemo(() => (idx ? exerciseDetail(idx, exerciseKey, win, s) : null), [idx, exerciseKey, win, s])

  const known = ds?.exercises[exerciseKey]
  const title = known?.name ?? displayLabel(exerciseKey)
  const back = { path: paths.exercises(), label: 'All exercises' }

  if (!d) {
    return (
      <>
        <PageHeader title={title} back={back} />
        <EmptyState icon={<IconExercises size={20} />} title={known ? 'No sets in this range' : 'Unknown exercise'}>
          {known
            ? 'This exercise was not logged in the selected range. Choose a longer range above.'
            : 'This exercise is not in your imported data.'}
        </EmptyState>
      </>
    )
  }

  const primary: Partial<Record<RegionId, number>> = {}
  for (const r of d.regions) primary[r] = 1
  const secondary: Partial<Record<RegionId, number>> = {}
  for (const r of d.secondaryRegions) if (!primary[r]) secondary[r] = 0.5
  const delts: Partial<Record<DeltHead, number>> = {}
  for (const h of d.delts) delts[h] = 1

  const caveats = exerciseCaveats(d.name)
  const secondaryOnly = d.secondaryRegions.filter((r) => !d.regions.includes(r))

  return (
    <>
      <PageHeader
        title={d.name}
        back={back}
        actions={
          <div class="ex-map">
            <BodyMap
              values={primary}
              secondary={secondary}
              delts={d.delts.length ? delts : undefined}
              scale="relative"
              size="sm"
              legend={false}
            />
          </div>
        }
      >
        <div class="ex-head">
          <RegionChips regions={d.regions} />
          {secondaryOnly.length > 0 && (
            <span class="ex-head__secondary">
              <span class="faint">Also</span>
              <RegionChips regions={secondaryOnly} max={isDetailed ? undefined : 3} />
            </span>
          )}
        </div>
        <p class="ex-head__meta">{headMeta(d)}</p>
        {isDetailed && (
          <p class="ex-head__raw faint">
            <span title={d.inCatalog ? 'Secondary muscles from the bundled Motra catalog' : 'Custom or renamed exercise: muscles come from the export only'}>
              {d.inCatalog ? 'In the Motra catalog' : 'Not in the Motra catalog'}
            </span>
            {d.muscleRaw.length > 0 && (
              <>
                . Export muscles: <span class="mono">{d.muscleRaw.join(', ')}</span>
              </>
            )}
          </p>
        )}
      </PageHeader>

      {d.load.kind !== 'weighted' && <LoadNote d={d} bodyweightLb={s.bodyweightLb} units={units} />}

      {d.valueUnit === 'sec' ? (
        <TimedBody d={d} units={units} detailed={isDetailed} />
      ) : d.valueUnit === 'lb' ? (
        <WeightedBody
          d={d}
          units={units}
          detailed={isDetailed}
          formula={s.oneRmFormula}
          caveats={caveats}
          sex={s.sex}
          hasBodyweight={s.bodyweightLb != null}
        />
      ) : (
        <UnweightedBody d={d} units={units} detailed={isDetailed} />
      )}
    </>
  )
}

/** One muted line under the title: load kind, sessions and sets, date span. */
function headMeta(d: ExerciseDetail): string {
  const parts: string[] = []
  if (d.load.kind === 'bodyweight') parts.push('Bodyweight')
  else if (d.load.kind === 'timed') parts.push('Timed hold')
  parts.push(`${plural(d.sessions, 'session')}, ${plural(d.sets, 'set')}`)
  if (d.firstDate && d.lastDate) {
    const first = formatDate(d.firstDate, 'medium')
    const last = formatDate(d.lastDate, 'medium')
    parts.push(first === last ? first : `${first} to ${last}`)
  }
  return parts.join(' · ')
}

const pct = (f: number) => `${Math.round(f * 100)}%`

/** 'How load is counted' callout for bodyweight and timed exercises. */
function LoadNote({ d, bodyweightLb, units }: { d: ExerciseDetail; bodyweightLb: number | null; units: Units }) {
  const { kind, bodyweightFactor: f, assisted, reason } = d.load
  let body
  if (kind === 'timed') {
    body = 'Progress is your longest hold; added weight is tracked too.'
  } else if (f == null) {
    body = 'Tracked by reps; add weight to see load trends.'
  } else if (bodyweightLb == null || !(bodyweightLb > 0)) {
    body = (
      <>
        {d.name} counts {f < 1 ? `about ${pct(f)}` : pct(f)} of your bodyweight, but your bodyweight isn’t set. Until you{' '}
        <a class="link" href={href(paths.settings())}>add it in Settings</a>, progress is shown from logged weight and reps only.
      </>
    )
  } else {
    const share = f * bodyweightLb
    const half = 0.5 * bodyweightLb
    body = (
      <>
        {d.name} counts {f < 1 ? `about ${pct(f)}` : pct(f)} of your bodyweight ({formatWeight(bodyweightLb, units)}
        {f !== 1 ? `, so ${formatWeight(share, units)}` : ''}).{' '}
        {assisted
          ? `This is an assisted machine: the logged weight is assistance and is subtracted from that.`
          : `Logged weight under ${formatWeight(half, units)} is treated as added weight (BW + plate); ${formatWeight(half, units)} or more is assumed to already include your bodyweight. Assisted machines subtract the assistance.`}
      </>
    )
  }
  return (
    <aside class="callout ex-load-note" aria-label="How load is counted">
      <IconInfo size={16} />
      <div class="load-note">
        <p>
          <strong>How load is counted.</strong> {body}
        </p>
        {reason && <p class="load-note__reason faint">Classified because {reason}.</p>}
      </div>
    </aside>
  )
}

function Caveats({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <div class="callout ex-caveats">
      <IconInfo size={16} />
      <ul>
        {items.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  )
}

/** Trend rate figure with its status as the context line. */
function TrendTile({ d }: { d: ExerciseDetail }) {
  return (
    <StatTile
      label="Trend"
      value={d.status === 'insufficient' || d.ratePerMonth == null ? '–' : formatRate(d.ratePerMonth)}
      sub={<TrendBadge status={d.status} ratePerMonth={null} />}
    />
  )
}

function SessionsTile({ d }: { d: ExerciseDetail }) {
  return (
    <StatTile
      label="Sessions"
      value={formatNumber(d.sessions, { maxDecimals: 0 })}
      sub={`${plural(d.sets, 'set')}${d.firstDate ? ` since ${formatDate(d.firstDate, 'month')}` : ''}`}
    />
  )
}

/** 'More detail' group: every Detailed-only block under one heading. */
function MoreDetail({ children }: { children: ComponentChildren }) {
  return (
    <section class="ex-more" aria-labelledby="ex-more-title">
      <h2 class="ex-more__title" id="ex-more-title">
        More detail
      </h2>
      <div class="stack ex-stack">{children}</div>
    </section>
  )
}

function WeightedBody({
  d,
  units,
  detailed,
  formula,
  caveats,
  sex,
  hasBodyweight,
}: {
  d: ExerciseDetail
  units: Units
  detailed: boolean
  formula: OneRmFormula
  caveats: string[]
  sex: Sex
  hasBodyweight: boolean
}) {
  const last = d.sessionsE1rm[d.sessionsE1rm.length - 1] ?? null
  const current = d.latestE1rm ?? last?.e1rm ?? d.bestE1rm
  const bestTop = d.history.reduce<{ w: number; date: Date } | null>(
    (best, r) => (r.topWeightLb != null && (best == null || r.topWeightLb > best.w) ? { w: r.topWeightLb, date: r.date } : best),
    null,
  )
  const confidence = last ? `${last.confidence === 'high' ? 'High' : 'Medium'} confidence` : 'No eligible set'
  const actual = d.metric === 'actual'
  const best = d.bestStrength
  const latest = d.latestStrength
  const repsText = (s: { reps: number }) => (s.reps > 0 ? ` × ${formatNumber(s.reps, { maxDecimals: 0 })}` : '')
  const latestCtx = latest ? strengthContext(latest, 'e1rm', units) : ''
  const e1rmTile = (lead: boolean) => (
    <StatTile
      lead={lead}
      label="Estimated 1RM"
      value={current != null ? formatWeight(current, units, { unit: false }) : '–'}
      unit={current != null ? unitLabel(units) : undefined}
      sub={lead && latestCtx ? `${latestCtx}, ${confidence.toLowerCase()}` : `${confidence} · ${formulaLabel(formula)}`}
      hint={ESTIMATE_CAVEAT}
    />
  )

  return (
    <div class="stack ex-stack">
      <StatStrip>
        {actual ? (
          <StatTile
            lead
            label="Heaviest set"
            value={best ? formatWeight(best.value, units, { unit: false }) : '–'}
            unit={best ? `${unitLabel(units)}${repsText(best)}` : undefined}
            sub={
              latest
                ? `Latest ${formatWeight(latest.value, units)}${repsText(latest)}${strengthContext(latest, 'actual', units) ? `, ${strengthContext(latest, 'actual', units)}` : ''}`
                : 'No weighted sets in range'
            }
          />
        ) : (
          e1rmTile(true)
        )}
        {actual ? (
          e1rmTile(false)
        ) : (
          <StatTile
            label="Best weight"
            value={d.bestWeightLb != null ? formatWeight(d.bestWeightLb, units, { unit: false }) : '–'}
            unit={d.bestWeightLb != null ? unitLabel(units) : undefined}
            sub={bestTop ? `Top set on ${formatDate(bestTop.date, 'short')}` : 'Heaviest set in range'}
          />
        )}
        {detailed && (
          <StatTile
            label="Best e1RM in range"
            value={d.bestE1rm != null ? formatWeight(d.bestE1rm, units, { unit: false }) : '–'}
            unit={d.bestE1rm != null ? unitLabel(units) : undefined}
            delta={d.deltas.d90}
            deltaLabel="over 90 days"
            sub="Highest session estimate"
          />
        )}
        <SessionsTile d={d} />
        <TrendTile d={d} />
      </StatStrip>

      <Card
        title={strengthTitle(d.metric)}
        subtitle="Click a point to open the workout."
        info={actual ? STRENGTH_METRIC_EXPLAINER : ESTIMATE_CAVEAT}
        actions={<StrengthMetricToggle />}
      >
        <E1rmChart d={d} units={units} />
        <Caveats items={caveats} />
      </Card>

      <div class="ex-split">
        <RepMaxCard d={d} units={units} detailed={detailed} />
        <PrCard d={d} units={units} />
      </div>

      <HistoryCard d={d} units={units} detailed={detailed} />

      {detailed && (
        <MoreDetail>
          <div class="ex-split">
            <FormulasCard d={d} units={units} formula={formula} />
            <ChangeCard d={d} />
          </div>
          <div class="ex-split">
            <LoadCharts d={d} units={units} />
          </div>
          <div class="ex-split">
            <DistributionCards d={d} />
          </div>
          <div class="ex-split">
            <SetQualityCard d={d} />
            {d.relative ? <RelativeStrengthCard d={d} sex={sex} /> : !hasBodyweight && <RelativeHint />}
          </div>
        </MoreDetail>
      )}
    </div>
  )
}

function RelativeHint() {
  return (
    <Card title="Relative strength">
      <p class="muted">
        Add your bodyweight in <a class="link" href={href(paths.settings())}>Settings</a> to see e1RM ÷ bodyweight.
      </p>
    </Card>
  )
}

function PrCard({ d, units }: { d: ExerciseDetail; units: Units }) {
  const recent = d.prs.slice().sort((a, b) => b.date.getTime() - a.date.getTime())
  return (
    <Card title="Personal records" subtitle="Newest first. The first session is the baseline.">
      <PrList prs={recent} units={units} limit={8} showExercise={false} empty="No records yet. They start counting after your first session." />
    </Card>
  )
}

function UnweightedBody({ d, units, detailed }: { d: ExerciseDetail; units: Units; detailed: boolean }) {
  const stats = unweightedStats(d)
  const timed = stats.bestReps == null && stats.bestDuration != null
  return (
    <div class="stack ex-stack">
      <StatStrip>
        <StatTile
          lead
          label={timed ? 'Longest set' : 'Best set'}
          value={timed ? formatDuration(stats.bestDuration) : stats.bestReps != null ? formatNumber(stats.bestReps, { maxDecimals: 0 }) : '–'}
          unit={!timed && stats.bestReps != null ? 'reps' : undefined}
          sub="Most in a single set"
        />
        <StatTile label="Total reps" value={formatNumber(stats.totalReps, { maxDecimals: 0 })} sub="In the selected range" />
        <SessionsTile d={d} />
        <TrendTile d={d} />
      </StatStrip>

      <div class="ex-split">
        <Card title="Reps per session">
          <SimpleLineChart
            points={stats.perSession}
            label={`Reps per session for ${d.name}`}
            format={(n) => `${formatNumber(n, { maxDecimals: 0 })} reps`}
            empty={timed ? 'Timed sets only; see the session history below.' : 'No reps logged in this range.'}
            area
          />
        </Card>
        <PrCard d={d} units={units} />
      </div>

      <HistoryCard d={d} units={units} detailed={detailed} />

      {detailed && (
        <MoreDetail>
          <div class="ex-split">
            <SetQualityCard d={d} />
            <DistributionCards d={d} />
          </div>
        </MoreDetail>
      )}
    </div>
  )
}

function TimedBody({ d, units, detailed }: { d: ExerciseDetail; units: Units; detailed: boolean }) {
  const latest = d.latestStrength
  const best = d.bestHoldSec ?? d.bestStrength?.holdSec ?? d.bestStrength?.value ?? null
  const weightedHolds = d.topWeight.some((p) => p.value > 0)
  const holdChart = (
    <Card title="Longest hold" subtitle="Click a point to open the workout.">
      <HoldChart d={d} units={units} />
    </Card>
  )
  return (
    <div class="stack ex-stack">
      <StatStrip>
        <StatTile
          lead
          label="Longest hold"
          value={best != null ? formatHold(best) : '–'}
          sub={
            latest
              ? `Latest ${formatHold(latest.holdSec ?? latest.value)}${latest.weightLb > 0 ? ` +${formatWeight(latest.weightLb, units)}` : ''}`
              : 'No timed sets in range'
          }
        />
        <SessionsTile d={d} />
        <TrendTile d={d} />
      </StatStrip>

      {weightedHolds ? (
        <>
          {holdChart}
          <div class="ex-split">
            <Card title="Added weight" subtitle="Heaviest weight held in each session">
              <SimpleLineChart
                points={weightPoints(d.topWeight, units)}
                label={`Added weight for ${d.name}`}
                format={displayWeightFormat(units)}
                empty="No weighted holds in this range."
              />
            </Card>
            <PrCard d={d} units={units} />
          </div>
        </>
      ) : (
        <div class="ex-split">
          {holdChart}
          <PrCard d={d} units={units} />
        </div>
      )}

      <HistoryCard d={d} units={units} detailed={detailed} />

      {detailed && (
        <MoreDetail>
          <SetQualityCard d={d} />
        </MoreDetail>
      )}
    </div>
  )
}
