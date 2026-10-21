import type { VolumeBand } from '../../core/analytics/types'

const BAND_LABEL: Record<VolumeBand, string> = {
  none: 'None',
  low: 'Low',
  moderate: 'Moderate',
  target: 'In range',
  high: 'High',
}

const BAND_TITLE: Record<VolumeBand, string> = {
  none: 'No hard sets in the last 7 days',
  low: 'Fewer than 5 hard sets in the last 7 days',
  moderate: '5–9 hard sets in the last 7 days',
  target: '10–20 hard sets in the last 7 days: the typical hypertrophy range',
  high: 'More than 20 hard sets in the last 7 days',
}

export function VolumeBandBadge({ band }: { band: VolumeBand }) {
  return (
    <span class={`band-badge band-badge--${band}`} title={BAND_TITLE[band]}>
      {BAND_LABEL[band]}
    </span>
  )
}
