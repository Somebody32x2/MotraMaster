import type { SessionStrength } from '../../core/analytics/types'
import type { StrengthMetric, Units } from '../../core/types'
import { settings, updateSettings } from '../../state'
import { Segmented, type SegmentedOption } from '../components/Segmented'
import { formatNumber, formatRest, formatWeight } from '../format'

export const STRENGTH_METRIC_OPTIONS: SegmentedOption<StrengthMetric>[] = [
  { value: 'e1rm', label: 'Estimated 1RM', title: 'Estimated one-rep max from each session’s best set' },
  { value: 'actual', label: 'Heaviest set', title: 'The heaviest weight you actually lifted each session' },
]

export const STRENGTH_METRIC_EXPLAINER =
  'e1RM assumes sets close to failure, and Motra hasn’t recorded effort for these sets, so it’s a lower-bound estimate. Heaviest set shows what you actually lifted.'

/** Segmented toggle bound to `settings.strengthMetric`. */
export function StrengthMetricToggle({ size = 'sm', block }: { size?: 'sm' | 'md'; block?: boolean }) {
  return (
    <Segmented
      label="Track progress by"
      size={size}
      block={block}
      options={STRENGTH_METRIC_OPTIONS}
      value={settings.value.strengthMetric}
      onChange={(strengthMetric) => updateSettings({ strengthMetric })}
    />
  )
}

export const strengthTitle = (m: StrengthMetric) => (m === 'actual' ? 'Heaviest set' : 'Estimated 1RM')

/** Column header for best/latest strength values. */
export const strengthBestLabel = (m: StrengthMetric) => (m === 'actual' ? 'Heaviest' : 'Best e1RM')
export const strengthLatestLabel = (m: StrengthMetric) => (m === 'actual' ? 'Latest top set' : 'Latest e1RM')

const reps = (n: number) => formatNumber(n, { maxDecimals: 0 })

export type ValueUnit = 'lb' | 'sec' | 'reps'

/** Hold time: '45s' under a minute, else clock style '1:45'. */
export function formatHold(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  const s = Math.round(sec)
  return s < 60 ? `${s}s` : formatRest(s)
}

/** Value for a series in `unit` (axis/tooltip helper). */
export function formatUnitValue(v: number, unit: ValueUnit, units: Units): string {
  if (!Number.isFinite(v)) return '—'
  if (unit === 'sec') return formatHold(v)
  if (unit === 'reps') return `${reps(v)} reps`
  return formatWeight(v, units)
}

/** Compact value: actual → "175 lb × 5", e1rm → "201 lb", sec → "1:45 +25 lb", reps → "12 reps". */
export function formatStrength(s: SessionStrength | null | undefined, metric: StrengthMetric, units: Units, unit: ValueUnit = 'lb'): string {
  if (!s || !Number.isFinite(s.value)) return '—'
  if (unit === 'sec') {
    const hold = formatHold(s.holdSec ?? s.value)
    return s.weightLb > 0 ? `${hold} +${formatWeight(s.weightLb, units)}` : hold
  }
  if (unit === 'reps') return `${reps(s.value)} reps`
  if (metric === 'actual') return s.reps > 0 ? `${formatWeight(s.value, units)} × ${reps(s.reps)}` : formatWeight(s.value, units)
  return formatWeight(s.value, units)
}

/** Secondary context: actual → "e1RM 201 lb", e1rm → "from 175 lb × 5"; bodyweight loads note "incl. BW". */
export function strengthContext(s: SessionStrength | null | undefined, metric: StrengthMetric, units: Units, unit: ValueUnit = 'lb'): string {
  if (!s || unit !== 'lb') return ''
  const bw = s.loadBasis === 'bodyweightAdded' || s.loadBasis === 'bodyweightIncluded' || s.loadBasis === 'assisted' ? ' incl. BW' : ''
  if (metric === 'actual') return s.e1rm != null && Number.isFinite(s.e1rm) ? `e1RM ${formatWeight(s.e1rm, units)}${bw}` : bw.trim()
  return s.weightLb > 0 && s.reps > 0 ? `from ${formatWeight(s.weightLb, units)} × ${reps(s.reps)}${bw}` : ''
}
