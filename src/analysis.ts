import { computed } from '@preact/signals'
import { buildIndex } from './core/analytics'
import type { AnalysisIndex, Window } from './core/analytics/types'
import { dataset, latestWorkoutDate, range, rangeStartDate, settings } from './state'

/**
 * Analysis derived from the dataset. Rebuilt only when the dataset or a setting
 * that changes the numbers (1RM formula, bodyweight, strength metric, idle trimming)
 * changes — not on theme/unit flips.
 */
const indexInputs = computed(() => ({
  ds: dataset.value,
  formula: settings.value.oneRmFormula,
  bodyweightLb: settings.value.bodyweightLb,
  strengthMetric: settings.value.strengthMetric,
  trimIdle: settings.value.trimIdle,
  trimGraceMin: settings.value.trimGraceMin,
}))

export const analysisIndex = computed<AnalysisIndex | null>(() => {
  const { ds } = indexInputs.value
  if (!ds || ds.workouts.length === 0) return null
  return buildIndex(ds, settings.peek())
})

/** Active analysis window: the selected range, anchored at the latest workout. */
export const analysisWindow = computed<Window>(() => {
  const latest = latestWorkoutDate.value ?? new Date()
  const end = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate(), 23, 59, 59, 999)
  return { start: rangeStartDate(range.value, latest), end }
})
