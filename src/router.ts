import { signal } from '@preact/signals'

export type RouteName =
  | 'overview'
  | 'muscles'
  | 'muscle'
  | 'exercises'
  | 'exercise'
  | 'workouts'
  | 'workout'
  | 'import'
  | 'settings'

export interface Route {
  name: RouteName
  params: Record<string, string>
  /** Normalized path that produced this route, e.g. '/muscles/chest'. */
  path: string
}

const PATTERNS: Array<[RouteName, string[]]> = [
  ['overview', []],
  ['muscles', ['muscles']],
  ['muscle', ['muscles', ':key']],
  ['exercises', ['exercises']],
  ['exercise', ['exercises', ':key']],
  ['workouts', ['workouts']],
  ['workout', ['workouts', ':id']],
  ['import', ['import']],
  ['settings', ['settings']],
]

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function matchRoute(rawPath: string): Route {
  const path = '/' + rawPath.replace(/^#/, '').split('?')[0].replace(/^\/+|\/+$/g, '')
  const parts = path === '/' ? [] : path.slice(1).split('/')
  for (const [name, pattern] of PATTERNS) {
    if (pattern.length !== parts.length) continue
    const params: Record<string, string> = {}
    const ok = pattern.every((seg, i) => {
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = safeDecode(parts[i])
        return true
      }
      return seg === parts[i]
    })
    if (ok) return { name, params, path }
  }
  return { name: 'overview', params: {}, path: '/' }
}

const readHash = (): Route => matchRoute(typeof location === 'undefined' ? '' : location.hash)

export const route = signal<Route>(readHash())

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    route.value = readHash()
  })
}

/** Value for an `<a href>` that routes to `path` ('/muscles/chest'). */
export function href(path: string): string {
  return '#' + (path.startsWith('/') ? path : '/' + path)
}

/** Navigates to `path`; `replace` avoids adding a history entry. */
export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const target = href(path)
  if (opts.replace) {
    history.replaceState(history.state, '', target)
    route.value = readHash()
  } else if (location.hash !== target) {
    location.hash = target
  }
}

/** Canonical paths; keys/ids are URI-encoded. */
export const paths = {
  overview: () => '/',
  muscles: () => '/muscles',
  muscle: (key: string) => `/muscles/${encodeURIComponent(key)}`,
  exercises: () => '/exercises',
  exercise: (key: string) => `/exercises/${encodeURIComponent(key)}`,
  workouts: () => '/workouts',
  workout: (id: string) => `/workouts/${encodeURIComponent(id)}`,
  import: () => '/import',
  settings: () => '/settings',
}
