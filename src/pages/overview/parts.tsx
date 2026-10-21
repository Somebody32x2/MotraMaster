import type { ComponentChildren } from 'preact'
import { paletteColor } from '../../ui/charts'
import { formatPercent } from '../../ui/format'
import { shares } from './util'

/** Compact labelled figure used inside cards. */
export function Metric({ label, value, note }: { label: ComponentChildren; value: ComponentChildren; note?: ComponentChildren }) {
  return (
    <div class="ov-metric">
      <span class="ov-metric__label">{label}</span>
      <span class="ov-metric__value num">{value}</span>
      {note != null && <span class="ov-metric__note">{note}</span>}
    </div>
  )
}

/** Short muted line for cards without enough data. */
export function CardEmpty({ children }: { children: ComponentChildren }) {
  return <p class="ov-empty">{children}</p>
}

export interface ShareItem {
  key: string
  label: string
  value: number
  color?: string
  /** Extra text after the percentage (e.g. '12m'). */
  detail?: string
}

/** 100% stacked bar with a legend of shares. */
export function ShareBar({ items, label, empty = 'No data for this range.' }: { items: ShareItem[]; label: string; empty?: string }) {
  const sh = shares(items.map((i) => i.value))
  if (!sh.some((x) => x > 0)) return <CardEmpty>{empty}</CardEmpty>
  const rows = items.map((it, i) => ({ ...it, color: it.color ?? paletteColor(i), share: sh[i] }))
  const summary = `${label}: ${rows.map((r) => `${r.label} ${formatPercent(r.share)}`).join(', ')}`
  return (
    <div class="ov-share">
      <div class="ov-share__bar" role="img" aria-label={summary}>
        {rows.map((r) =>
          r.share > 0 ? (
            <span key={r.key} style={{ width: `${r.share * 100}%`, background: r.color }} title={`${r.label}: ${formatPercent(r.share)}`} />
          ) : null,
        )}
      </div>
      <ul class="ov-share__legend" role="list">
        {rows.map((r) => (
          <li key={r.key} class={r.share > 0 ? undefined : 'is-zero'}>
            <span class="ov-swatch" style={{ background: r.color }} aria-hidden="true" />
            <span class="ov-share__label">{r.label}</span>
            <span class="num">{formatPercent(r.share)}</span>
            {r.detail && <span class="faint num">{r.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
