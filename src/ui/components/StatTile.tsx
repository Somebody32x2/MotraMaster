import type { ComponentChildren } from 'preact'
import { formatNumber, formatPercent } from '../format'
import { InfoTip } from './InfoTip'

export interface StatTileProps {
  label: ComponentChildren
  value: ComponentChildren
  unit?: ComponentChildren
  /** Change versus a comparison period; sign drives coloring. */
  delta?: number | null
  /** How to render `delta`: ratio → '+12%', number → '+3', or a custom formatter. */
  deltaFormat?: 'percent' | 'number' | ((n: number) => string)
  /** Context for the delta, e.g. 'vs previous 3M'. */
  deltaLabel?: ComponentChildren
  /** When true, a decrease is good (e.g. rest time). */
  invert?: boolean
  /** Tooltip explaining the metric. */
  hint?: ComponentChildren
  /** Secondary line shown when there is no delta. */
  sub?: ComponentChildren
  /** Makes the whole tile a link. */
  href?: string
}

function deltaText(d: number, fmt: StatTileProps['deltaFormat']): string {
  if (typeof fmt === 'function') return fmt(d)
  if (fmt === 'number') return formatNumber(d, { sign: true })
  return formatPercent(d, { sign: true })
}

export function StatTile(props: StatTileProps) {
  const { label, value, unit, delta, deltaFormat = 'percent', deltaLabel, invert, hint, sub, href } = props
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const good = hasDelta && (invert ? delta < 0 : delta > 0)
  const bad = hasDelta && (invert ? delta > 0 : delta < 0)
  const tone = good ? 'pos' : bad ? 'neg' : 'flat'

  const body = (
    <>
      <div class="stat__label">
        <span>{label}</span>
        {hint != null && <InfoTip text={hint} />}
      </div>
      <div class="stat__value">
        <span>{value}</span>
        {unit != null && <span class="stat__unit">{unit}</span>}
      </div>
      <div class="stat__foot">
        {hasDelta ? (
          <>
            <span class={`delta delta--${tone}`}>{deltaText(delta, deltaFormat)}</span>
            {deltaLabel != null && <span>{deltaLabel}</span>}
          </>
        ) : (
          sub
        )}
      </div>
    </>
  )

  return href ? (
    <a class="stat" href={href}>
      {body}
    </a>
  ) : (
    <div class="stat">{body}</div>
  )
}
