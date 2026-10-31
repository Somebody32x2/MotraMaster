import { computed } from '@preact/signals'
import { buildIndex } from './core/analytics'
import type { AnalysisIndex, Window } from './core/analytics/types'
import { dataset, latestWorkoutDate, range, rangeStartDate, settings } from './state'

/**
 * Analysis derived from the dataset. Rebuilt only when the dataset or a setting
 * that changes the numbers (1RM formula, bodyweight, strength metric, idle trimming,
 * drop-set credit) changes — not on theme/unit flips.
 */
const indexInputs = computed(() => ({
  ds: dataset.value,
  formula: settings.value.oneRmFormula,
  bodyweightLb: settings.value.bodyweightLb,
  strengthMetric: settings.value.strengthMetric,
  trimIdle: settings.value.trimIdle,
  trimGraceMin: settings.value.trimGraceMin,
  dropSetCredit: settings.value.dropSetCredit,
}))

export const analysisIndex = computed<AnalysisIndex | null>(() => {
  const { ds } = indexInputs.value
  if (!ds || ds.workouts.length === 0) return null
  return buildIndex(ds, settings.peek())
})

/**
 * Active analysis window: starts the selected range back from the latest workout, so stale
 * exports still show data, and ends today, so "last 7 days" figures count back from today.
 */
export const analysisWindow = computed<Window>(() => {
  const now = new Date()
  const latest = latestWorkoutDate.value ?? now
  const last = latest > now ? latest : now
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999)
  return { start: rangeStartDate(range.value, latest), end }
})
