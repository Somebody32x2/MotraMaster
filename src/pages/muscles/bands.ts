import type { VolumeBand } from '../../core/analytics/types'

/** Research §2.1 / §4.2 weekly-set bands: 0 | <5 | 5–9 | 10–20 | >20. */
export function bandOf(weeklySets: number): VolumeBand {
  if (!(weeklySets > 0)) return 'none'
  if (weeklySets < 5) return 'low'
  if (weeklySets < 10) return 'moderate'
  if (weeklySets <= 20) return 'target'
  return 'high'
}

export const TARGET_LO = 10
export const TARGET_HI = 20

export const WEEKLY_SETS_INFO =
  'Hard sets in the 7 days ending at the latest workout in range; open a muscle to see each set that counted. 10–20 weekly sets is the typical hypertrophy range (Schoenfeld 2017); it is a guide, not a prescription.'

export const FREQUENCY_INFO =
  'Days per week with at least one hard set, averaged over 4 weeks. Frequency matters little for size once volume is equal, but helps strength (Pelland 2026).'

export const FRACTIONAL_INFO =
  'Fractional sets add 0.5 for each set where this muscle is a strong secondary mover in the Motra catalog. This counting best fit growth and strength outcomes (Pelland 2026).'
