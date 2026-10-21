import type { MuscleSummary } from '../../core/analytics/types'
import { Card } from '../../ui/components/Card'
import { formatNumber, plural } from '../../ui/format'

/** Detailed: raw muscle labels that matched no body region, so new Motra vocabulary is visible. */
export function UnmappedLabels({ other }: { other: MuscleSummary | null }) {
  const labels = other?.rawLabels ?? []
  return (
    <Card class="unmapped" title="Unmapped labels" subtitle="Export labels that matched no body region, often new Motra vocabulary">
      {labels.length === 0 ? (
        <p class="muted">Every muscle label in this range mapped to a body region.</p>
      ) : (
        <details class="unmapped__details" open={labels.length <= 8}>
          <summary>
            {plural(labels.length, 'label')} counted under Other, {formatNumber(other?.windowSets ?? 0, { maxDecimals: 1 })} hard sets
          </summary>
          <ul class="label-list">
            {labels.map((l) => (
              <li key={l} class="label-list__item num">
                {l}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
