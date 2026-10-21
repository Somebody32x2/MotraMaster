import type { VolumeBand } from '../../core/analytics/types'
import { RANGE_OPTIONS, range } from '../../state'

export const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Relative change; null when there is no meaningful baseline. */
export function pctDelta(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (!isNum(cur) || !isNum(prev) || prev <= 0) return null
  return (cur - prev) / prev
}

export function sum(xs: ReadonlyArray<number | null | undefined>): number {
  let t = 0
  for (const x of xs) if (isNum(x)) t += x
  return t
}

export function mean(xs: ReadonlyArray<number | null | undefined>): number | null {
  const v = xs.filter(isNum)
  return v.length ? sum(v) / v.length : null
}

export function median(xs: ReadonlyArray<number | null | undefined>): number | null {
  const v = xs.filter(isNum).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

/** Normalizes to shares of the total (all zeros when the total is not positive). */
export function shares(xs: ReadonlyArray<number | null | undefined>): number[] {
  const t = sum(xs.map((x) => (isNum(x) && x > 0 ? x : 0)))
  return xs.map((x) => (t > 0 && isNum(x) && x > 0 ? x / t : 0))
}

/** Local calendar day key 'YYYY-MM-DD'. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Weekly hard-set band (research §2.1 / §4.2). */
export function bandOf(sets: number): VolumeBand {
  if (!(sets > 0)) return 'none'
  if (sets < 5) return 'low'
  if (sets < 10) return 'moderate'
  if (sets <= 20) return 'target'
  return 'high'
}

/** Bar fills matching the body-map band shading. */
export const BAND_COLOR: Record<VolumeBand, string> = {
  none: 'var(--border-strong)',
  low: 'color-mix(in srgb, var(--accent) 25%, var(--surface-2))',
  moderate: 'color-mix(in srgb, var(--accent) 55%, var(--surface-2))',
  target: 'var(--accent)',
  high: 'var(--warn)',
}

/** Motra heart-rate zones (research §1.6). */
export const HR_ZONES = ['Z1 Warm up', 'Z2 Endurance', 'Z3 Moderate', 'Z4 Intense', 'Z5 Performance']

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** The active range option ({ label: '3M', title: 'Last 3 months' }). */
export function activeRange(): { value: string; label: string; title: string } {
  return RANGE_OPTIONS.find((o) => o.value === range.value) ?? RANGE_OPTIONS[RANGE_OPTIONS.length - 1]
}
