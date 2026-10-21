import type { MuscleSummary } from '../../core/analytics/types'
import { Card } from '../../ui/components/Card'
import { formatNumber, plural } from '../../ui/format'

/** Detailed: raw muscle labels that matched no body region, so new Motra vocabulary is visible. */
export function UnmappedLabels({ other }: { other: MuscleSummary | null }) {
  const labels = other?.rawLabels ?? []
  if (labels.length === 0) {
    return (
      <Card quiet class="unmapped">
        <p class="muted">Every muscle label in this range mapped to a body region.</p>
      </Card>
    )
  }
  return (
    <Card
      class="unmapped"
      title="Unmapped labels"
      subtitle={`${plural(labels.length, 'label')} counted under Other · ${formatNumber(other?.windowSets ?? 0, { maxDecimals: 1 })} hard sets in range`}
      info="Muscle labels from the export that matched no known region. A label that keeps appearing is probably new Motra vocabulary."
    >
      <details class="unmapped__details" open={labels.length <= 8}>
        <summary>Show raw labels</summary>
        <ul class="label-list">
          {labels.map((l) => (
            <li key={l} class="label-list__item mono">
              {l}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}
