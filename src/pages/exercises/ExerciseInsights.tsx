import { Fragment } from 'preact'
import type { ExerciseDetail, StrengthLevel } from '../../core/analytics/types'
import type { Sex, Units } from '../../core/types'
import { href, paths } from '../../router'
import { BarChart, rampColor, type BarDatum } from '../../ui/charts'
import { Card } from '../../ui/components/Card'
import { formatNumber, formatPercent, formatRest } from '../../ui/format'
import { formatRate } from '../../ui/widgets'
import { SimpleLineChart } from './E1rmChart'
import { displayWeightFormat, weightPoints } from './util'

function signedPct(ratio: number | null): { text: string; tone: string } {
  if (ratio == null || !Number.isFinite(ratio)) return { text: '–', tone: 'faint' }
  return { text: formatPercent(ratio, { sign: true }), tone: ratio > 0 ? 'delta--pos' : ratio < 0 ? 'delta--neg' : 'delta--flat' }
}

/** D3: e1RM change over fixed look-backs plus the robust rate. */
export function ChangeCard({ d }: { d: ExerciseDetail }) {
  const rows: Array<[string, number | null]> = [
    ['30 days', d.deltas.d30],
    ['90 days', d.deltas.d90],
    ['365 days', d.deltas.d365],
  ]
  return (
    <Card title="e1RM change">
      <dl class="kv">
        {rows.map(([label, v]) => {
          const { text, tone } = signedPct(v)
          return (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>
                <span class={`delta ${tone}`}>{text}</span>
              </dd>
            </Fragment>
          )
        })}
        <dt>Rate</dt>
        <dd>{formatRate(d.ratePerMonth)}</dd>
      </dl>
    </Card>
  )
}

export function LoadCharts({ d, units }: { d: ExerciseDetail; units: Units }) {
  return (
    <>
      <Card title="Top set weight" subtitle="Heaviest set in each session">
        <SimpleLineChart
          points={weightPoints(d.topWeight, units)}
          label={`Top set weight for ${d.name}`}
          format={displayWeightFormat(units)}
          empty="No weighted sets in this range."
        />
      </Card>
      <Card title="Session volume" subtitle="Weight × reps per session; dumbbells per hand">
        <SimpleLineChart
          points={weightPoints(d.sessionVolume, units)}
          label={`Session volume for ${d.name}`}
          format={displayWeightFormat(units, { compact: true })}
          empty="No weighted sets in this range."
          area
          color="var(--c3)"
        />
      </Card>
    </>
  )
}

const ZONE_LABELS = ['<60%', '60–70%', '70–80%', '80–90%', '≥90%']
const REP_LABELS = ['1–5', '6–12', '13–20', '21+']

function shareBars(labels: string[], shares: number[]): BarDatum[] | null {
  const total = shares.reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0)
  if (!(total > 0)) return null
  return labels.map((label, i) => ({
    key: label,
    label,
    values: Number.isFinite(shares[i]) ? shares[i] : 0,
    color: rampColor(i, labels.length),
  }))
}

/** D5: %e1RM zones and rep-range mix of hard sets. */
export function DistributionCards({ d }: { d: ExerciseDetail }) {
  const zones = d.valueUnit === 'lb' ? shareBars(ZONE_LABELS, d.intensityZones) : null
  const ranges = shareBars(REP_LABELS, d.repRanges)
  const pct = (n: number) => formatPercent(n, { decimals: 0 })
  return (
    <>
      {d.valueUnit === 'lb' && (
        <Card title="Intensity zones" subtitle="Hard sets by % of your best e1RM in the last 8 weeks">
          {zones ? (
            <BarChart data={zones} orientation="horizontal" valueFormat={pct} ariaLabel="Intensity zone distribution" />
          ) : (
            <p class="muted">No hard weighted sets in this range.</p>
          )}
        </Card>
      )}
      <Card title="Rep ranges" subtitle="Hard sets by rep count">
        {ranges ? (
          <BarChart data={ranges} orientation="horizontal" valueFormat={pct} ariaLabel="Rep range distribution" />
        ) : (
          <p class="muted">No hard sets with reps in this range.</p>
        )}
      </Card>
    </>
  )
}

function tempoNote(secPerRep: number): { tone: 'warn' | 'ok'; text: string } {
  if (secPerRep < 1) return { tone: 'warn', text: 'Under 1 s per rep: likely bouncing, or reps miscounted by the watch.' }
  if (secPerRep > 8) return { tone: 'warn', text: 'Over 8 s per rep: growth is similar from 0.5–8 s but worse near 10 s (Schoenfeld 2015).' }
  return { tone: 'ok', text: 'Within 0.5–8 s per rep, where growth is similar (Schoenfeld 2015).' }
}

/** D6/D7/D9: rest, tempo and within-session fatigue. */
export function SetQualityCard({ d }: { d: ExerciseDetail }) {
  const tempo = d.medianSecPerRep != null && Number.isFinite(d.medianSecPerRep) ? tempoNote(d.medianSecPerRep) : null
  const rest = d.medianRestSec
  const shortRest = rest != null && rest < 60
  return (
    <Card title="Set quality" subtitle="From watch timing and rep counts">
      <dl class="quality">
        <div class="quality__item">
          <dt>Median rest</dt>
          <dd class="quality__value">{formatRest(rest)}</dd>
          <dd class="quality__note">
            {rest == null ? 'No rest times logged.' : shortRest ? 'Under 60 s: on the short side for growth.' : 'Enough for most of the rest benefit.'}
          </dd>
        </div>
        <div class="quality__item">
          <dt>Tempo</dt>
          <dd class="quality__value">
            {d.medianSecPerRep != null ? `${formatNumber(d.medianSecPerRep, { maxDecimals: 1 })} s/rep` : <span class="faint">–</span>}
          </dd>
          <dd class={tempo?.tone === 'warn' ? 'quality__note is-warn' : 'quality__note'}>
            {tempo ? tempo.text : 'No set durations logged.'}
          </dd>
        </div>
        <div class="quality__item">
          <dt>Fatigue drop-off</dt>
          <dd class="quality__value">{d.fatigueDropoff != null ? formatPercent(d.fatigueDropoff, { decimals: 0 }) : <span class="faint">–</span>}</dd>
          <dd class="quality__note">
            {d.fatigueDropoff == null ? 'Needs 3+ sets at one weight in a session.' : 'Reps lost from first to last set at one weight.'}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

const LEVEL_NAME: Record<StrengthLevel, string> = {
  beginner: 'Beginner',
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
}

/** §5.1/5.2: e1RM ÷ bodyweight with Strength Level band progress. */
export function RelativeStrengthCard({ d, sex }: { d: ExerciseDetail; sex: Sex }) {
  const rel = d.relative
  if (!rel) return null
  const progress = rel.progress != null && Number.isFinite(rel.progress) ? Math.max(0, Math.min(1, rel.progress)) : null
  return (
    <Card
      title="Relative strength"
      subtitle="Best recent e1RM ÷ current bodyweight"
      info="Levels are approximate Strength Level percentiles (beginner >5%, novice >20%, intermediate >50%, advanced >80%, elite >95%). Machine and dumbbell numbers are not comparable to barbell standards."
    >
      <div class="rel">
        <p class="rel__ratio">
          {formatNumber(rel.ratio, { decimals: 2 })}
          <span class="rel__unit">× bodyweight</span>
        </p>
        {rel.level ? (
          <>
            <div class="rel__levels">
              <span class="rel__level">{LEVEL_NAME[rel.level]}</span>
              {rel.nextLevel && <span class="faint">{LEVEL_NAME[rel.nextLevel]}</span>}
            </div>
            {progress != null && rel.nextLevel && (
              <div
                class="level-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                aria-label={`${formatPercent(progress, { decimals: 0 })} of the way from ${LEVEL_NAME[rel.level]} to ${LEVEL_NAME[rel.nextLevel]}`}
              >
                <span style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </>
        ) : sex === 'unspecified' ? (
          <p class="muted">
            Set your sex in <a class="link" href={href(paths.settings())}>Settings</a> to compare against strength standards.
          </p>
        ) : (
          <p class="muted">Below the beginner standard for this lift, or no standard exists for it.</p>
        )}
        <p class="faint rel__foot">At current bodyweight.</p>
      </div>
    </Card>
  )
}
