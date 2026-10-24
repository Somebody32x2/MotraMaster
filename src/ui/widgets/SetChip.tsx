import type { EnrichedSet, HardReason } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { settings } from '../../state'
import { formatNumber, formatPercent, formatWeight } from '../format'
import { formatHold } from './StrengthMetric'

/** What a chip reads; EnrichedSet and exercise-history sets both satisfy it. */
export type ChipSet = Pick<
  EnrichedSet,
  'weightLb' | 'loadLb' | 'loadBasis' | 'reps' | 'durationSec' | 'holdSec' | 'effort' | 'hard' | 'hardReason' | 'credit' | 'drop' | 'pctOfTop'
>

/** The hard-set rule in one hint (research §4.1). */
export const HARD_SET_RULE =
  'Working sets only: effort 6+ when logged, otherwise at least 60% of that exercise’s top weight in the workout. Warm-ups don’t count; drop sets count as set in Settings.'

/** One-word set type for tables. */
export const SET_TYPE_LABEL: Record<HardReason, string> = {
  effort: 'Working',
  load: 'Working',
  bodyweight: 'Working',
  hold: 'Working',
  drop: 'Drop',
  light: 'Warm-up',
  easy: 'Easy',
  shortHold: 'Short',
  notPerformed: 'Not done',
}

/** '1', '½', '1½', '0.25': set credit as people say it. */
export function formatSetCredit(n: number): string {
  const whole = Math.floor(n)
  if (Math.abs(n - whole - 0.5) < 1e-9) return whole > 0 ? `${whole}½` : '½'
  return formatNumber(n, { maxDecimals: 2 })
}

/** Why a set did or did not count toward hard sets, in one sentence. */
export function hardSetWhy(s: ChipSet): string {
  const pct = s.pctOfTop != null ? formatPercent(s.pctOfTop, { decimals: 0 }) : null
  switch (s.hardReason) {
    case 'effort':
      return `Counted: effort ${formatNumber(s.effort)} (6 or more counts)`
    case 'load':
      return pct && s.pctOfTop! < 0.995 ? `Counted: ${pct} of the top set (60% or more counts)` : 'Counted: top set'
    case 'bodyweight':
      return 'Counted: bodyweight reps'
    case 'hold':
      return 'Counted: hold of 10 s or more'
    case 'drop':
      return s.credit > 0
        ? `Drop set: counts as ${s.credit >= 1 ? 'a full set' : `${formatSetCredit(s.credit)} a set`}`
        : 'Drop set: part of the set before it, not counted again'
    case 'light':
      return `Not counted: warm-up${pct ? ` at ${pct} of the top set` : ''} (under 60%)`
    case 'easy':
      return `Not counted: effort ${formatNumber(s.effort)} (under 6)`
    case 'shortHold':
      return 'Not counted: hold under 10 s'
    case 'notPerformed':
      return 'Not counted: no reps or time logged'
  }
}

/** Compact chip text: '185×5', 'BW+25×8', 'BW×10', 'BW−40×8', '1:30 hold', '1:00 +25 lb', '12 reps'. */
export function setChipText(set: ChipSet, units: Units): string {
  const reps = set.reps != null && set.reps > 0 ? formatNumber(set.reps, { maxDecimals: 0 }) : null
  if (set.holdSec != null && set.holdSec > 0) {
    const w = set.loadLb ?? set.weightLb
    return w != null && w > 0 ? `${formatHold(set.holdSec)} +${formatWeight(w, units)}` : `${formatHold(set.holdSec)} hold`
  }
  const w = set.weightLb != null && Number.isFinite(set.weightLb) ? set.weightLb : 0
  const num = (n: number) => formatWeight(n, units, { unit: false })
  switch (set.loadBasis) {
    case 'bodyweightAdded':
      return `BW${w > 0 ? `+${num(w)}` : w < 0 ? `−${num(-w)}` : ''}×${reps ?? '0'}`
    case 'assisted':
      return `BW−${num(Math.abs(w))}×${reps ?? '0'}`
    default:
      break
  }
  if (w > 0) return `${num(w)}×${reps ?? '0'}`
  if (reps) return `${reps} reps`
  if (set.durationSec != null && set.durationSec > 0) return formatHold(set.durationSec)
  return '–'
}

/**
 * One logged set. Solid = counted as a hard set; outlined = not counted (warm-up, easy, unperformed);
 * a 'D' marks a detected drop. The title says which rule decided it.
 */
export function SetChip({ set, units, title }: { set: ChipSet; units: Units; title?: string | null }) {
  const why = hardSetWhy(set)
  return (
    <span class={set.credit > 0 ? 'set-chip' : 'set-chip set-chip--off'} title={title ? `${title} · ${why}` : why}>
      {setChipText(set, units)}
      {set.drop && (
        <span class="set-chip__drop" aria-label="drop set">
          D
        </span>
      )}
    </span>
  )
}

/** Key for set chips; the drop entry states the drop-set credit from Settings. Hovering a chip names its rule. */
export function SetChipLegend({ drops = true }: { drops?: boolean }) {
  const dropCredit = settings.value.dropSetCredit
  return (
    <p class="set-legend">
      <span class="set-legend__item">
        <i class="set-legend__sw" aria-hidden="true" />
        Counted
      </span>
      <span class="set-legend__item">
        <i class="set-legend__sw set-legend__sw--off" aria-hidden="true" />
        Not counted (warm-up or easy)
      </span>
      {drops && (
        <span class="set-legend__item">
          <span class="set-chip__drop" aria-hidden="true">
            D
          </span>
          Drop set, {dropCredit > 0 ? `${formatSetCredit(dropCredit)} per drop` : 'counted once'}
        </span>
      )}
    </p>
  )
}
