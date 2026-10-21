import type { Units } from '../core/types'

/** Placeholder for missing values in every formatter. */
export const EMPTY = '—'
/** True minus sign (U+2212) for signed numbers; aligns with '+' in tabular figures. */
export const MINUS = '−'

export const LB_PER_KG = 2.2046226218
const KG_PER_LB = 0.45359237
const CM_PER_IN = 2.54

const nfCache = new Map<string, Intl.NumberFormat>()
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options)
  let f = nfCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(undefined, options)
    nfCache.set(key, f)
  }
  return f
}

function isNum(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function signed(text: string, n: number, sign: boolean): string {
  if (n < 0) return MINUS + text.replace(/^[-−]/, '')
  if (sign && n > 0) return '+' + text
  return text
}

export interface NumberOpts {
  /** Fixed number of decimals (default: 0 for |n| ≥ 100, else up to 1). */
  decimals?: number
  /** Max decimals when `decimals` is not given. */
  maxDecimals?: number
  /** Compact notation (12.3k). */
  compact?: boolean
  /** Prefix '+' for positive values. */
  sign?: boolean
}

export function formatNumber(n: number | null | undefined, opts: NumberOpts = {}): string {
  if (!isNum(n)) return EMPTY
  const { decimals, compact, sign = false } = opts
  const maxDecimals = opts.maxDecimals ?? (Math.abs(n) >= 100 ? 0 : 1)
  const text = nf({
    notation: compact && Math.abs(n) >= 10_000 ? 'compact' : 'standard',
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? maxDecimals,
  }).format(Math.abs(n))
  return signed(text, n, sign)
}

/** Formats a ratio (0.125 → '12.5%'). */
export function formatPercent(
  ratio: number | null | undefined,
  opts: { decimals?: number; sign?: boolean } = {},
): string {
  if (!isNum(ratio)) return EMPTY
  const pct = ratio * 100
  const decimals = opts.decimals ?? (Math.abs(pct) < 10 && pct !== 0 ? 1 : 0)
  const text = nf({ minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(pct))
  return signed(text, pct, opts.sign ?? false) + '%'
}

export function unitLabel(units: Units): string {
  return units === 'kg' ? 'kg' : 'lb'
}

/** Converts stored pounds to the display unit. */
export function toDisplayWeight(lb: number, units: Units): number
export function toDisplayWeight(lb: number | null, units: Units): number | null
export function toDisplayWeight(lb: number | null, units: Units): number | null {
  if (!isNum(lb)) return null
  return units === 'kg' ? lb * KG_PER_LB : lb
}

/** Converts a value entered in display units back to pounds. */
export function fromDisplayWeight(v: number, units: Units): number
export function fromDisplayWeight(v: number | null, units: Units): number | null
export function fromDisplayWeight(v: number | null, units: Units): number | null {
  if (!isNum(v)) return null
  return units === 'kg' ? v * LB_PER_KG : v
}

export interface WeightOpts extends NumberOpts {
  /** Append the unit (default true). */
  unit?: boolean
}

/** '135 lb', '61.2 kg', '1.2M lb' (compact). */
export function formatWeight(lb: number | null | undefined, units: Units, opts: WeightOpts = {}): string {
  if (!isNum(lb)) return EMPTY
  const v = toDisplayWeight(lb, units)
  const { unit = true, ...rest } = opts
  const maxDecimals = rest.maxDecimals ?? (units === 'kg' && Math.abs(v) < 1000 ? 1 : 0)
  const text = formatNumber(v, { ...rest, maxDecimals })
  return unit ? `${text} ${unitLabel(units)}` : text
}

/** '45s', '43m', '1h 05m'. */
export function formatDuration(sec: number | null | undefined): string {
  if (!isNum(sec) || sec < 0) return EMPTY
  const s = Math.round(sec)
  if (s < 60) return `${s}s`
  const totalMin = Math.round(s / 60)
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Clock-style rest: '0:45', '3:19', '1:02:05'. */
export function formatRest(sec: number | null | undefined): string {
  if (!isNum(sec) || sec < 0) return EMPTY
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const ss = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * Parses a zone-less local timestamp ('YYYY-MM-DDTHH:mm:ss', 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DD')
 * as local wall-clock time. Falls back to Date parsing for anything else.
 */
export function parseLocalIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(iso.trim())
  if (!m) return new Date(iso)
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0)
}

export type DateStyle = 'short' | 'medium' | 'long' | 'weekday' | 'month' | 'time' | 'datetime' | 'day'

const DATE_OPTS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  /** Oct 21 */
  short: { month: 'short', day: 'numeric' },
  /** Oct 21, 2026 */
  medium: { month: 'short', day: 'numeric', year: 'numeric' },
  /** Wednesday, October 21, 2026 */
  long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  /** Wed, Oct 21 */
  weekday: { weekday: 'short', month: 'short', day: 'numeric' },
  /** Oct 2026 */
  month: { month: 'short', year: 'numeric' },
  /** 1:04 PM */
  time: { hour: 'numeric', minute: '2-digit' },
  /** Oct 21, 2026, 1:04 PM */
  datetime: { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  /** 21 */
  day: { day: 'numeric' },
}

const dfCache = new Map<DateStyle, Intl.DateTimeFormat>()

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : parseLocalIso(value)
}

/** Formats a LocalIso (or Date). Unparseable/null input yields '—'. */
export function formatDate(iso: string | Date | null | undefined, style: DateStyle = 'medium'): string {
  if (iso == null || iso === '') return EMPTY
  const d = toDate(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  let f = dfCache.get(style)
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, DATE_OPTS[style])
    dfCache.set(style, f)
  }
  return f.format(d)
}

let rtf: Intl.RelativeTimeFormat | undefined

/** 'today', 'yesterday', '3 days ago', '2 weeks ago', '5 months ago' — by calendar day. */
export function formatRelative(iso: string | Date | null | undefined, now: Date = new Date()): string {
  if (iso == null || iso === '') return EMPTY
  const d = toDate(iso)
  if (Number.isNaN(d.getTime())) return EMPTY
  rtf ??= new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(d) - startOf(now)) / 86_400_000)
  const abs = Math.abs(days)
  if (abs < 7) return rtf.format(days, 'day')
  if (abs < 30) return rtf.format(Math.trunc(days / 7), 'week')
  if (abs < 365) return rtf.format(Math.trunc(days / 30), 'month')
  return rtf.format(Math.trunc(days / 365), 'year')
}

/** cm → { ft, in } with inches rounded to 0.5. */
export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = Math.round((cm / CM_PER_IN) * 2) / 2
  let ft = Math.floor(totalIn / 12)
  let inches = Math.round((totalIn - ft * 12) * 2) / 2
  if (inches >= 12) {
    ft += 1
    inches -= 12
  }
  return { ft, inches }
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_IN
}

/** '5′ 11″' or '180 cm' depending on units. */
export function formatHeight(cm: number | null | undefined, units: Units): string {
  if (!isNum(cm)) return EMPTY
  if (units === 'kg') return `${Math.round(cm)} cm`
  const { ft, inches } = cmToFtIn(cm)
  return `${ft}′ ${formatNumber(inches, { maxDecimals: 1 })}″`
}

/** Simple English pluralization: plural(3, 'set') → '3 sets'. */
export function plural(n: number, one: string, many: string = one + 's'): string {
  return `${formatNumber(n, { maxDecimals: 0 })} ${n === 1 ? one : many}`
}
