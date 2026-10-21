import type { DetailLevel } from '../../core/types'
import { route, type RouteName } from '../../router'
import { dataset, range, RANGE_OPTIONS, settings, updateSettings } from '../../state'
import { Segmented, type SegmentedOption } from './Segmented'

/** Pages that need a dataset; without one the onboarding/import view is shown instead. */
const DATA_ROUTES: ReadonlyArray<RouteName> = [
  'overview',
  'muscles',
  'muscle',
  'exercises',
  'exercise',
  'workouts',
  'workout',
  'calendar',
]

export const isDataRoute = (name: RouteName) => DATA_ROUTES.includes(name)

const DETAIL_OPTIONS: SegmentedOption<DetailLevel>[] = [
  { value: 'normal', label: 'Normal', title: 'Essential statistics' },
  { value: 'detailed', label: 'Detailed', title: 'Every statistic and breakdown' },
]

/**
 * Range and detail-level controls for data pages. `PageHeader` renders this automatically;
 * it renders nothing off data routes or before a dataset is loaded.
 */
export function PageControls() {
  if (!dataset.value || !isDataRoute(route.value.name)) return null
  return (
    <div class="page-controls">
      <Segmented
        label="Time range"
        class="page-controls__range"
        options={RANGE_OPTIONS}
        value={range.value}
        onChange={(v) => {
          range.value = v
        }}
      />
      <Segmented
        label="Detail level"
        class="page-controls__detail"
        options={DETAIL_OPTIONS}
        value={settings.value.detail}
        onChange={(detail) => updateSettings({ detail })}
      />
    </div>
  )
}
