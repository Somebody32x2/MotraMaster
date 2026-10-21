import type { RegionId } from '../../core/analytics/types'
import { regionName } from '../../core/regions'
import { href, paths } from '../../router'

export function RegionChips({ regions, max }: { regions: RegionId[]; max?: number }) {
  if (regions.length === 0) return <span class="faint">–</span>
  const shown = max != null && regions.length > max ? regions.slice(0, max) : regions
  const hidden = regions.length - shown.length
  return (
    <span class="region-chips">
      {shown.map((r) => (
        <a key={r} class="region-chip" href={href(paths.muscle(r))}>
          {regionName(r)}
        </a>
      ))}
      {hidden > 0 && (
        <span
          class="region-chip region-chip--more"
          title={regions
            .slice(shown.length)
            .map((r) => regionName(r))
            .join(', ')}
        >
          +{hidden}
        </span>
      )}
    </span>
  )
}
