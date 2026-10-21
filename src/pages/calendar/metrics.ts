import type { DayMetric } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { EMPTY, formatDuration, formatNumber, formatRest, formatWeight, plural, toDisplayWeight, unitLabel } from '../../ui/format'

export interface MetricDef {
  value: DayMetric
  label: string
  /** Lower-case name for prose: "Avg volume", "colored by start time". */
  noun: string
  /** Sentence explaining how the per-day value is built. */
  info: string
  /** Full value for tooltips and tables. */
  format: (v: number | null, units: Units) => string
  /** Compact value printed inside a day cell (≤ ~6 characters). */
  short: (v: number, units: Units) => string
}

const isNum = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** Fractional hour (6.5) → Date on an arbitrary day, for clock formatting. */
function hourDate(h: number): Date {
  const mins = Math.round(((h % 24) + 24) % 24 * 60) % (24 * 60)
  return new Date(2024, 0, 1, Math.floor(mins / 60), mins % 60)
}

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** '6:30 AM' (locale clock). */
export function formatClock(h: number | null | undefined): string {
  return isNum(h) ? clockFmt.format(hourDate(h)) : EMPTY
}

/** '6:30a' / '18:05' — compact clock for small cells. */
function shortClock(h: number): string {
  const d = hourDate(h)
  const hh = d.getHours()
  const mm = String(d.getMinutes()).padStart(2, '0')
  const twelve = clockFmt.resolvedOptions().hour12 ?? /AM|PM/i.test(clockFmt.format(d))
  if (!twelve) return `${hh}:${mm}`
  return `${hh % 12 || 12}:${mm}${hh < 12 ? 'a' : 'p'}`
}

/** Hour bucket label for axes: '12a', '6a', '12p', '6p' (or '0', '6', '12' on 24-hour locales). */
export function hourLabel(h: number): string {
  const twelve = clockFmt.resolvedOptions().hour12 ?? true
  if (!twelve) return String(h)
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`
}

/** Full hour range for tooltips: '6–7 AM'. */
export function hourRange(h: number): string {
  return `${formatClock(h)}–${formatClock((h + 1) % 24)}`
}

function density(v: number | null, units: Units, unit: boolean): string {
  if (!isNum(v)) return EMPTY
  const text = formatWeight(v, units, { unit: false, maxDecimals: 0 })
  return unit ? `${text} ${unitLabel(units)}/min` : text
}

export const METRICS: readonly MetricDef[] = [
  {
    value: 'workouts',
    label: 'Workouts',
    noun: 'workouts',
    info: 'Number of workouts logged that day.',
    format: (v) => (isNum(v) ? plural(v, 'workout') : EMPTY),
    short: (v) => formatNumber(v, { maxDecimals: 0 }),
  },
  {
    value: 'volume',
    label: 'Volume',
    noun: 'volume',
    info: 'Total weight × reps lifted that day.',
    format: (v, u) => formatWeight(v, u, { compact: true }),
    short: (v, u) => {
      const d = toDisplayWeight(v, u)
      return d >= 1000 ? `${formatNumber(d / 1000, { maxDecimals: d >= 100_000 ? 0 : 1 })}k` : formatNumber(d, { maxDecimals: 0 })
    },
  },
  {
    value: 'duration',
    label: 'Duration',
    noun: 'duration',
    info: 'Session time that day, after idle trimming when it is enabled.',
    format: (v) => formatDuration(v),
    short: (v) => `${formatNumber(Math.round(v / 60), { maxDecimals: 0 })}m`,
  },
  {
    value: 'density',
    label: 'Density',
    noun: 'density',
    info: 'Volume per minute of session time.',
    format: (v, u) => density(v, u, true),
    short: (v, u) => density(v, u, false),
  },
  {
    value: 'hardSets',
    label: 'Hard sets',
    noun: 'hard sets',
    info: 'Working sets that day, excluding warm-ups.',
    format: (v) => (isNum(v) ? plural(Math.round(v * 10) / 10, 'hard set') : EMPTY),
    short: (v) => formatNumber(v, { maxDecimals: 0 }),
  },
  {
    value: 'calories',
    label: 'Calories',
    noun: 'calories',
    info: 'Calories Motra recorded that day.',
    format: (v) => (isNum(v) ? `${formatNumber(v, { maxDecimals: 0 })} kcal` : EMPTY),
    short: (v) => formatNumber(v, { maxDecimals: 0, compact: true }),
  },
  {
    value: 'kcalPerMin',
    label: 'kcal/min',
    noun: 'kcal/min',
    info: 'Calories divided by the recorded session time.',
    format: (v) => (isNum(v) ? `${formatNumber(v, { maxDecimals: 1 })} kcal/min` : EMPTY),
    short: (v) => formatNumber(v, { maxDecimals: 1 }),
  },
  {
    value: 'avgRest',
    label: 'Avg rest',
    noun: 'rest',
    info: 'Typical (median) rest between sets that day.',
    format: (v) => formatRest(v),
    short: (v) => formatRest(v),
  },
  {
    value: 'exercises',
    label: 'Exercises',
    noun: 'exercises',
    info: 'Distinct exercises performed that day.',
    format: (v) => (isNum(v) ? plural(Math.round(v * 10) / 10, 'exercise') : EMPTY),
    short: (v) => formatNumber(v, { maxDecimals: 0 }),
  },
  {
    value: 'startHour',
    label: 'Start time',
    noun: 'start time',
    info: 'Local time the first workout of the day started.',
    format: (v) => formatClock(v),
    short: (v) => shortClock(v),
  },
]

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.value, m])) as Record<DayMetric, MetricDef>

const STORAGE_KEY = 'motramaster.calendarMetric'

export function loadMetric(): DayMetric {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (METRICS.some((m) => m.value === v)) return v as DayMetric
  } catch {
    /* storage unavailable */
  }
  return 'volume'
}

export function saveMetric(m: DayMetric): void {
  try {
    localStorage.setItem(STORAGE_KEY, m)
  } catch {
    /* storage unavailable */
  }
}

/** Number of color steps for days with a value (level 0 is reserved for "no value"). */
export const LEVELS = 5

export interface MetricScale {
  /** 1..LEVELS for a finite value; 0 otherwise. */
  level: (v: number | null | undefined) => number
  min: number | null
  max: number | null
}

/**
 * Quantile scale over the given values: each value's mid-rank percentile picks one of five steps,
 * so ties (e.g. "1 workout" on most days) land mid-scale instead of at the pale end.
 */
export function quantileScale(values: ReadonlyArray<number | null | undefined>): MetricScale {
  const sorted = values.filter(isNum).sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return { level: () => 0, min: null, max: null }
  const lowerBound = (v: number) => {
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < v) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const upperBound = (v: number) => {
    let lo = 0
    let hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] <= v) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  return {
    min: sorted[0],
    max: sorted[n - 1],
    level: (v) => {
      if (!isNum(v)) return 0
      const mid = (lowerBound(v) + upperBound(v)) / 2 / n
      return Math.min(LEVELS, Math.max(1, 1 + Math.floor(mid * LEVELS)))
    },
  }
}

/** Monday-first weekday index (0 = Monday … 6 = Sunday). */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

const weekdayShortFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const weekdayLongFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
/** 2024-01-01 was a Monday. */
export const WEEKDAY_SHORT = Array.from({ length: 7 }, (_, i) => weekdayShortFmt.format(new Date(2024, 0, 1 + i)))
export const WEEKDAY_LONG = Array.from({ length: 7 }, (_, i) => weekdayLongFmt.format(new Date(2024, 0, 1 + i)))
