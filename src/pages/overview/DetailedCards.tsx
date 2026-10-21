import type { BalanceRatios, OverviewStats, StrengthProfile } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { BarChart, LineChart, rampColor } from '../../ui/charts'
import { Card } from '../../ui/components/Card'
import { formatDate, formatDuration, formatNumber, formatPercent, formatRest, plural, toDisplayWeight, unitLabel } from '../../ui/format'
import { CardEmpty, Metric, ShareBar } from './parts'
import { HR_ZONES, dayKey, isNum, mean, shares, sum } from './util'

/* ---------- D10 Balance ratios ---------- */

const BALANCE_ROWS: Array<{ key: keyof BalanceRatios; a: string; b: string }> = [
  { key: 'pushPull', a: 'Push', b: 'Pull' },
  { key: 'quadHam', a: 'Quads', b: 'Hamstrings' },
  { key: 'upperLower', a: 'Upper body', b: 'Lower body' },
  { key: 'anteriorPosterior', a: 'Anterior', b: 'Posterior' },
]

export function BalanceCard({ balance, class: cls }: { balance: BalanceRatios; class?: string }) {
  return (
    <Card title="Balance" subtitle="Weekly sets, averaged over the last 8 weeks" class={cls}>
      <ul class="ov-split-list" role="list">
        {BALANCE_ROWS.map(({ key, a, b }) => {
          const [va, vb] = (balance[key] ?? [0, 0]).map((v) => (isNum(v) && v > 0 ? v : 0))
          const total = va + vb
          const fa = formatNumber(va, { maxDecimals: 1 })
          const fb = formatNumber(vb, { maxDecimals: 1 })
          return (
            <li key={key} class="ov-split">
              <span class="ov-split__name">
                {a} : {b.toLowerCase()}
              </span>
              <span class={`ov-split__ratio tnum${va > 0 && vb > 0 ? '' : ' faint'}`}>
                {va > 0 && vb > 0 ? `${formatNumber(va / vb, { decimals: 2 })} : 1` : '–'}
              </span>
              <span class="ov-split__sets num">
                {total > 0 ? (
                  <>
                    {fa} / {fb}
                  </>
                ) : (
                  'No sets'
                )}
              </span>
              {total > 0 && (
                <span class="ov-split__bar" role="img" aria-label={`${a} ${fa} versus ${b} ${fb} sets per week`}>
                  <span style={{ flexGrow: va, background: 'var(--c1)' }} />
                  <span style={{ flexGrow: vb, background: 'var(--c4)' }} />
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/* ---------- D5 Intensity zones + rep ranges ---------- */

const ZONE_LABELS = ['<60%', '60–70%', '70–80%', '80–90%', '≥90%']
const REP_LABELS = ['1–5 reps', '6–12 reps', '13–20 reps', '21+ reps']

export function IntensityCard({ stats, class: cls }: { stats: OverviewStats; class?: string }) {
  return (
    <Card
      title="Intensity and rep ranges"
      subtitle="Share of hard sets"
      info="Each hard set’s weight as a share of that exercise’s best estimated 1RM (e1RM) over the trailing 8 weeks."
      class={cls}
    >
      <div class="stack" style={{ '--gap': 'var(--s5)' }}>
        <div>
          <p class="ov-subhead">Load, % of recent best e1RM</p>
          <ShareBar
            label="Intensity zones"
            items={ZONE_LABELS.map((label, i) => ({ key: `z${i}`, label, value: stats.intensityZones[i] ?? 0 }))}
            empty="No weighted hard sets with an estimated 1RM in this range."
          />
        </div>
        <div>
          <p class="ov-subhead">Rep ranges</p>
          <ShareBar
            label="Rep ranges"
            items={REP_LABELS.map((label, i) => ({ key: `r${i}`, label, value: stats.repRanges[i] ?? 0 }))}
            empty="No hard sets with reps in this range."
          />
        </div>
      </div>
    </Card>
  )
}

/* ---------- D6 Rest ---------- */

const REST_LABELS = ['<1m', '1–2m', '2–3m', '3–5m', '>5m']

export function RestCard({ stats, class: cls }: { stats: OverviewStats; class?: string }) {
  const sh = shares(stats.restBuckets)
  const hasData = sh.some((x) => x > 0)
  return (
    <Card
      title="Rest between sets"
      subtitle={hasData ? `Median ${formatRest(stats.medianRestSec)}, excluding each exercise’s first set` : undefined}
      class={cls}
    >
      {hasData ? (
        <BarChart
          data={REST_LABELS.map((label, i) => ({
            key: `b${i}`,
            label,
            values: Math.round(sh[i] * 1000) / 10,
            color: rampColor(i, REST_LABELS.length),
          }))}
          valueFormat={(n) => `${formatNumber(n, { maxDecimals: 0 })}%`}
          height={160}
          ariaLabel="Distribution of rest times"
        />
      ) : (
        <CardEmpty>No rest times recorded between sets in this range.</CardEmpty>
      )}
    </Card>
  )
}

/* ---------- D8 Session density ---------- */

export function DensityCard({ stats, units, class: cls }: { stats: OverviewStats; units: Units; class?: string }) {
  const unit = `${unitLabel(units)}/min`
  const points = stats.density.filter((p) => isNum(p.value)).map((p) => ({ x: p.date, y: toDisplayWeight(p.value, units) }))
  const avg = mean(points.map((p) => p.y))
  return (
    <Card
      title="Session density"
      subtitle={avg != null ? `Average ${formatNumber(avg, { maxDecimals: 0 })} ${unit}` : undefined}
      info="Volume divided by session minutes, averaged per week. Higher means more work per minute."
      class={cls}
    >
      {points.length ? (
        <LineChart
          series={[{ id: 'density', label: 'Density', points, showPoints: points.length <= 16 }]}
          yFormat={(n) => `${formatNumber(n, { maxDecimals: 0 })} ${unit}`}
          height={170}
        />
      ) : (
        <CardEmpty>Needs workouts with both volume and duration.</CardEmpty>
      )}
    </Card>
  )
}

/* ---------- D12 Heart-rate zones ---------- */

const HR_COLORS = HR_ZONES.map((_, i) => rampColor(i, HR_ZONES.length))

export function HrZonesCard({ stats, class: cls }: { stats: OverviewStats; class?: string }) {
  const weeks = stats.hrWeekly.filter((w) => sum(w.zones) > 0)
  const highMin = weeks.length ? sum(weeks.map((w) => (w.zones[3] ?? 0) + (w.zones[4] ?? 0))) / 60 / weeks.length : null
  return (
    <Card
      title="Heart-rate zones"
      subtitle={highMin != null ? `${formatDuration(highMin * 60)} per week in zones 4 and 5` : 'Minutes per week'}
      class={cls}
    >
      {weeks.length ? (
        <BarChart
          data={stats.hrWeekly.map((w) => ({
            key: dayKey(w.weekStart),
            label: formatDate(w.weekStart, 'short'),
            values: HR_ZONES.map((_, i) => Math.round(((w.zones[i] ?? 0) / 60) * 10) / 10),
          }))}
          stackLabels={HR_ZONES}
          stackColors={HR_COLORS}
          valueFormat={(n) => formatDuration(n * 60)}
          height={200}
          ariaLabel="Weekly minutes per heart-rate zone"
        />
      ) : (
        <CardEmpty>No heart-rate zone data in this range.</CardEmpty>
      )}
    </Card>
  )
}

/* ---------- D14 Effort ---------- */

/** `histogram[i]` = sets rated effort i + 1 (RPE 1–10). */
export function EffortCard({ histogram, class: cls }: { histogram: number[]; class?: string }) {
  const total = sum(histogram)
  const hardShare = total > 0 ? sum(histogram.slice(7)) / total : null
  return (
    <Card
      title="Effort"
      subtitle={hardShare != null ? `Rated sets (RPE 1–10), ${formatPercent(hardShare)} at 8 or above` : 'Rated sets (RPE 1–10)'}
      class={cls}
    >
      <BarChart
        data={histogram.map((n, i) => ({ key: `e${i}`, label: String(i + 1), values: n, color: rampColor(i, histogram.length) }))}
        valueFormat={(n) => formatNumber(n, { maxDecimals: 0 })}
        height={160}
        ariaLabel="Sets per effort rating"
      />
    </Card>
  )
}

/* ---------- D15 Load ratio ---------- */

function loadWording(r: number): string {
  if (r < 0.8) return 'Lighter than your recent average.'
  if (r <= 1.3) return 'In line with your recent average.'
  if (r <= 1.5) return 'Somewhat above your recent average.'
  return 'Well above your recent average: a sudden jump in work.'
}

export function LoadRatioCard({ ratio, class: cls }: { ratio: number | null; class?: string }) {
  return (
    <Card
      title="Load ratio"
      info="Hard sets in the last 7 days divided by your weekly average over 28 days (acute : chronic). Informational only; claims that it predicts injury are disputed."
      class={cls}
    >
      {isNum(ratio) ? (
        <Metric label="Last 7 days vs 28-day average" value={formatNumber(ratio, { decimals: 2 })} note={loadWording(ratio)} />
      ) : (
        <CardEmpty>Needs at least 4 weeks of training data.</CardEmpty>
      )}
    </Card>
  )
}

/* ---------- D16 Strength scores ---------- */

export function StrengthScoreCard({ profile, class: cls }: { profile: StrengthProfile; class?: string }) {
  const { dots, ipfGl } = profile
  const basis = (b: 'total' | 'bench') => (b === 'total' ? 'Squat + bench + deadlift' : 'Bench only')
  return (
    <Card
      title="Strength score"
      info="DOTS and IPF GL normalize a powerlifting total for bodyweight so lifters of different sizes can be compared. Estimated from recent e1RMs, not meet lifts."
      class={cls}
    >
      <div class="ov-metrics">
        {dots && <Metric label="DOTS" value={formatNumber(dots.value, { decimals: 1 })} note={basis(dots.basis)} />}
        {ipfGl && <Metric label="IPF GL" value={formatNumber(ipfGl.value, { decimals: 1 })} note={basis(ipfGl.basis)} />}
      </div>
    </Card>
  )
}

/* ---------- D17 New exercises ---------- */

/** `items` arrive newest first. */
export function NewExercisesCard({ items: rows, class: cls }: { items: OverviewStats['newExercises']; class?: string }) {
  const shown = rows.slice(0, 8)
  return (
    <Card
      title="New exercises"
      subtitle={rows.length ? `${plural(rows.length, 'exercise')} first done in this range` : undefined}
      class={cls}
    >
      {shown.length ? (
        <ul class="ov-plain-list" role="list">
          {shown.map((e) => (
            <li key={e.key}>
              <a class="ov-link" href={href(paths.exercise(e.key))}>
                {e.name}
              </a>
              <span class="faint num">{formatDate(e.firstDate, 'short')}</span>
            </li>
          ))}
          {rows.length > shown.length && <li class="faint">and {rows.length - shown.length} more</li>}
        </ul>
      ) : (
        <CardEmpty>No new exercises in this range.</CardEmpty>
      )}
    </Card>
  )
}
