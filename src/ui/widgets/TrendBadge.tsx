import type { TrendStatus } from '../../core/analytics/types'
import { formatNumber } from '../format'

const LABEL: Record<TrendStatus, string> = {
  progressing: 'Progressing',
  plateau: 'Plateau',
  dip: 'Dip',
  insufficient: 'Not enough data',
}

const GLYPH: Record<TrendStatus, string | null> = {
  progressing: '▲',
  plateau: '–',
  dip: '▼',
  insufficient: null,
}

const EXPLAIN: Record<TrendStatus, string> = {
  progressing: 'Estimated 1RM rising faster than 1% per month over the last 90 days.',
  plateau: 'No e1RM PR in the last 5+ sessions and 28+ days, with less than 1% change per month.',
  dip: 'Estimated 1RM falling faster than 1% per month over the last 90 days.',
  insufficient: 'Needs at least 4 sessions spanning 21 days in the last 90 days.',
}

/** Rate of gain as '+2.1%/mo' (rate is in percent units). */
export function formatRate(ratePerMonth: number | null): string {
  if (ratePerMonth == null || !Number.isFinite(ratePerMonth)) return '–'
  return `${formatNumber(ratePerMonth, { sign: true, maxDecimals: 1 })}%/mo`
}

/** Trend status as plain text with a glyph: '▲ +2.1%/mo', '▼ −1.4%/mo', '– Plateau', 'Not enough data'. */
export function TrendBadge({ status, ratePerMonth }: { status: TrendStatus; ratePerMonth: number | null }) {
  const hasRate = ratePerMonth != null && Number.isFinite(ratePerMonth)
  const moving = status === 'progressing' || status === 'dip'
  const glyph = GLYPH[status]
  const title = hasRate && status !== 'insufficient' ? `${EXPLAIN[status]} Currently ${formatRate(ratePerMonth)}.` : EXPLAIN[status]
  return (
    <span class={`trend-badge trend-badge--${status}`} title={title}>
      {glyph && (
        <span class="trend-badge__glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      {moving && hasRate ? (
        <>
          <span class="sr-only">{LABEL[status]}, </span>
          <span class="trend-badge__rate">{formatRate(ratePerMonth)}</span>
        </>
      ) : (
        <span>{LABEL[status]}</span>
      )}
    </span>
  )
}
