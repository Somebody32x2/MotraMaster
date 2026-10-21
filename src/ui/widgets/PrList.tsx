import type { PrEvent, PrType } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { formatDate, formatNumber, formatWeight } from '../format'

const PR_LABEL: Record<PrType, string> = {
  weight: 'Heaviest',
  reps: 'Rep PR',
  e1rm: 'e1RM PR',
  setVolume: 'Set volume',
  sessionVolume: 'Session volume',
}

const PR_TITLE: Record<PrType, string> = {
  weight: 'Heaviest weight ever lifted on this exercise',
  reps: 'No earlier set matched this weight and rep count together',
  e1rm: 'Highest session estimated 1RM so far',
  setVolume: 'Highest weight × reps in a single set',
  sessionVolume: 'Highest total weight × reps for this exercise in one workout',
}

export function PrChip({ type }: { type: PrType }) {
  return (
    <span class={`pr-chip pr-chip--${type}`} title={PR_TITLE[type]}>
      {PR_LABEL[type]}
    </span>
  )
}

function setText(pr: PrEvent, units: Units): string | null {
  if (pr.weightLb == null || pr.reps == null) return null
  if (pr.weightLb <= 0) return `${formatNumber(pr.reps, { maxDecimals: 0 })} reps`
  return `${formatWeight(pr.weightLb, units)} × ${formatNumber(pr.reps, { maxDecimals: 0 })}`
}

function valueText(type: PrType, v: number, units: Units): string {
  if (type === 'reps') return `${formatNumber(v, { maxDecimals: 0 })} reps`
  if (type === 'setVolume' || type === 'sessionVolume') return formatWeight(v, units, { compact: true })
  return formatWeight(v, units)
}

/** Main value plus the set that produced it, phrased per PR type. */
function describe(pr: PrEvent, units: Units): { value: string; detail: string | null } {
  const set = setText(pr, units)
  if (pr.type === 'reps') {
    const at = pr.weightLb != null && pr.weightLb > 0 ? `at ${formatWeight(pr.weightLb, units)}` : 'bodyweight'
    return { value: valueText('reps', pr.value, units), detail: at }
  }
  if (pr.type === 'sessionVolume') return { value: valueText(pr.type, pr.value, units), detail: null }
  if (pr.type === 'weight') {
    const reps = pr.reps != null ? `× ${formatNumber(pr.reps, { maxDecimals: 0 })}` : null
    return { value: valueText(pr.type, pr.value, units), detail: reps }
  }
  return { value: valueText(pr.type, pr.value, units), detail: set }
}

export interface PrListProps {
  prs: PrEvent[]
  units: Units
  limit?: number
  showExercise?: boolean
  empty?: string
}

export function PrList({ prs, units, limit, showExercise = true, empty = 'No personal records in this range yet.' }: PrListProps) {
  if (prs.length === 0) return <p class="pr-list__empty">{empty}</p>
  const rows = limit != null ? prs.slice(0, limit) : prs
  return (
    <ul class="pr-list">
      {rows.map((pr, i) => {
        const { value, detail } = describe(pr, units)
        const prev = pr.previous != null && Number.isFinite(pr.previous) ? valueText(pr.type, pr.previous, units) : null
        return (
          <li key={`${pr.workoutId}:${pr.exerciseKey}:${pr.type}:${i}`} class="pr-list__row">
            <a class="pr-list__date" href={href(paths.workout(pr.workoutId))} title="Open workout">
              {formatDate(pr.date, 'short')}
            </a>
            <div class="pr-list__main">
              {showExercise && (
                <a class="pr-list__exercise" href={href(paths.exercise(pr.exerciseKey))}>
                  {pr.exerciseName}
                </a>
              )}
              <PrChip type={pr.type} />
            </div>
            <div class="pr-list__value">
              <span class="pr-list__now">
                {prev && (
                  <span class="pr-list__prev">
                    <span class="sr-only">previous best </span>
                    {prev}
                    <span aria-hidden="true"> → </span>
                    <span class="sr-only">, now </span>
                  </span>
                )}
                {value}
              </span>
              {detail && <span class="pr-list__detail">{detail}</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
