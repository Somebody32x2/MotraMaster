import type { ExerciseLoadModel, LoadBasis } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { formatWeight } from '../format'

/** Exercises where bodyweight matters (reps-only bodyweight and bodyweight-with-factor). */
export const isBodyweightKind = (load: ExerciseLoadModel | null | undefined) => load?.kind === 'bodyweight'

/** Compact label for how a set's load was derived: 'BW + 25 lb', 'BW (incl.)', 'Assisted −40 lb', 'BW?'. */
export function loadBasisText(basis: LoadBasis, weightLb: number | null, units: Units): string {
  const w = weightLb != null && Number.isFinite(weightLb) ? weightLb : 0
  switch (basis) {
    case 'bodyweightAdded':
      if (w > 0) return `BW + ${formatWeight(w, units)}`
      if (w < 0) return `BW − ${formatWeight(-w, units)}`
      return 'BW'
    case 'bodyweightIncluded':
      return 'BW (incl.)'
    case 'assisted':
      return w !== 0 ? `Assisted −${formatWeight(Math.abs(w), units)}` : 'Assisted'
    case 'bodyweightUnknown':
      return w > 0 ? `${formatWeight(w, units)} · BW?` : 'BW?'
    case 'external':
      return w > 0 ? formatWeight(w, units) : '—'
    default:
      return w > 0 ? formatWeight(w, units) : '—'
  }
}

/** Plain-words explanation for the title attribute. */
export function loadBasisTitle(basis: LoadBasis, weightLb: number | null, loadLb: number | null, units: Units): string {
  const logged = weightLb != null && Number.isFinite(weightLb) ? formatWeight(weightLb, units) : 'nothing'
  const load = loadLb != null && Number.isFinite(loadLb) ? formatWeight(loadLb, units) : null
  switch (basis) {
    case 'bodyweightAdded':
      return `Logged ${logged}: under half your bodyweight, so it's counted as added to your bodyweight${load ? ` (${load} moved)` : ''}.`
    case 'bodyweightIncluded':
      return `Logged ${logged}: half your bodyweight or more, so it's assumed to already include your bodyweight${load ? ` (${load} moved)` : ''}.`
    case 'assisted':
      return `Logged ${logged} of assistance, subtracted from your bodyweight${load ? ` (${load} moved)` : ''}.`
    case 'bodyweightUnknown':
      return `Logged ${logged}. Set your bodyweight in Settings to count it in the load.`
    case 'external':
      return `Logged ${logged}.`
    default:
      return 'No weight logged.'
  }
}

export function LoadBasisTag({ basis, weightLb, loadLb, units }: { basis: LoadBasis; weightLb: number | null; loadLb: number | null; units: Units }) {
  return (
    <span class={`load-tag load-tag--${basis}`} title={loadBasisTitle(basis, weightLb, loadLb, units)}>
      {loadBasisText(basis, weightLb, units)}
    </span>
  )
}

/** Small 'BW' marker for bodyweight exercises in lists. */
export function BwBadge({ load }: { load: ExerciseLoadModel | null | undefined }) {
  if (!load || load.kind === 'weighted') return null
  const timed = load.kind === 'timed'
  return (
    <span class="bw-badge" title={timed ? 'Timed hold: progress is your longest hold' : 'Bodyweight exercise'}>
      {timed ? 'Hold' : 'BW'}
    </span>
  )
}
