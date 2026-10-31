import { displayLabel } from './core/labels'
import { isRegionId, regionName } from './core/regions'
import type { Route, RouteName } from './router'
import { dataset } from './state'

const SECTION_LABEL: Record<RouteName, string> = {
  overview: 'Overview',
  muscles: 'Muscles',
  muscle: 'Muscles',
  exercises: 'Exercises',
  exercise: 'Exercises',
  workouts: 'Workouts',
  workout: 'Workouts',
  calendar: 'Calendar',
  import: 'Import',
  settings: 'Settings',
}

const LIST_LABEL: Partial<Record<RouteName, string>> = {
  muscles: 'All muscles',
  exercises: 'All exercises',
  workouts: 'All workouts',
}

/** Title of a route: the entity a detail route shows, else its section. */
export function routeTitle({ name, params }: Route): string {
  const ds = dataset.value
  if (name === 'muscle') return isRegionId(params.key) ? regionName(params.key) : displayLabel(params.key)
  if (name === 'exercise') return ds?.exercises[params.key]?.name ?? displayLabel(params.key)
  if (name === 'workout') return ds?.workouts.find((w) => w.id === params.id)?.title || 'Workout'
  return SECTION_LABEL[name]
}

/** Text of a back link that returns to `r`. */
export function backLabel(r: Route): string {
  return LIST_LABEL[r.name] ?? routeTitle(r)
}
