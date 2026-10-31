import { batch, signal } from '@preact/signals'

export type RouteName =
  | 'overview'
  | 'muscles'
  | 'muscle'
  | 'exercises'
  | 'exercise'
  | 'workouts'
  | 'workout'
  | 'calendar'
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
  ['calendar', ['calendar']],
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

/* ------------------------------------------------------------------ */
/* Navigation tracker                                                  */
/* ------------------------------------------------------------------ */

/** Written into `history.state` so a traversal can be matched to its tracked entry. */
export interface NavStamp {
  navIdx: number
  navKey: string
}

export interface NavEntry {
  key: string
  /** Route path, as in `Route.path`. */
  path: string
  /** Window scroll offset when the entry was last left. */
  scrollY: number
}

/**
 * This tab's in-app history. `entries[i]` is the entry at history position `i`, counted from
 * the first entry of the current tracking run; null where the entry is unknown.
 */
export interface NavStack {
  entries: (NavEntry | null)[]
  index: number
}

/**
 * Pure transition to the entry the browser now shows. `stamp` is that entry's stamp (null for
 * a new entry); `scrollY` is the offset of the entry being left; `key` names a new entry;
 * `fresh` marks a document load, where an unstamped entry has no known predecessor.
 * The returned stack's current entry gives the stamp to write back.
 */
export function trackNav(
  stack: NavStack,
  stamp: NavStamp | null,
  path: string,
  opts: { scrollY: number; key: string; fresh?: boolean },
): NavStack {
  const leave = (entries: (NavEntry | null)[]) => {
    const cur = entries[stack.index]
    if (cur) entries[stack.index] = { ...cur, scrollY: opts.scrollY }
  }
  if (stamp) {
    const known = stack.entries[stamp.navIdx]
    if (known?.key === stamp.navKey) {
      // Back/forward, reload, or a replace of the current entry. A document load leaves no scroll to save.
      const entries = stack.entries.slice()
      if (stamp.navIdx !== stack.index && !opts.fresh) leave(entries)
      entries[stamp.navIdx] = { ...known, path }
      return { entries, index: stamp.navIdx }
    }
    // Stamped by a run whose record is gone: its neighbours are unknown.
    const entries: (NavEntry | null)[] = new Array<null>(stamp.navIdx).fill(null)
    entries.push({ key: stamp.navKey, path, scrollY: 0 })
    return { entries, index: stamp.navIdx }
  }
  if (opts.fresh) return { entries: [{ key: opts.key, path, scrollY: 0 }], index: 0 }
  // New entry: the browser drops everything forward of the current one.
  const entries = stack.entries.slice(0, stack.index + 1)
  leave(entries)
  entries.push({ key: opts.key, path, scrollY: 0 })
  return { entries, index: entries.length - 1 }
}

const NAV_STORE = 'motramaster.nav'

export const nav = signal<NavStack>({ entries: [], index: -1 })

/** Entry the browser currently shows. */
export function currentEntry(): NavEntry | null {
  const { entries, index } = nav.value
  return entries[index] ?? null
}

/** Entry one step back, or null when going back would leave the app or land somewhere unknown. */
export function previousEntry(): NavEntry | null {
  const { entries, index } = nav.value
  return index > 0 ? (entries[index - 1] ?? null) : null
}

function readStamp(state: unknown): NavStamp | null {
  if (typeof state !== 'object' || state === null) return null
  const { navIdx, navKey } = state as Partial<NavStamp>
  return Number.isInteger(navIdx) && navIdx! >= 0 && typeof navKey === 'string' ? { navIdx: navIdx!, navKey } : null
}

function loadNav(): NavStack {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(NAV_STORE) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return nav.peek()
    const { entries, index } = raw as Partial<NavStack>
    const valid =
      Array.isArray(entries) &&
      Number.isInteger(index) &&
      entries.every(
        (e) => e === null || (typeof e?.key === 'string' && typeof e.path === 'string' && typeof e.scrollY === 'number'),
      )
    return valid ? { entries, index: index! } : nav.peek()
  } catch {
    return nav.peek()
  }
}

/** Records the entry the browser now shows, stamps it, and publishes route + nav together. */
function syncNav(fresh = false): void {
  const r = readHash()
  const stamp = readStamp(history.state)
  const key = Math.random().toString(36).slice(2, 10)
  const next = trackNav(nav.peek(), stamp, r.path, { scrollY: window.scrollY, key, fresh })
  const cur = next.entries[next.index]!
  if (stamp?.navIdx !== next.index || stamp.navKey !== cur.key) {
    const state = typeof history.state === 'object' && history.state !== null ? history.state : {}
    history.replaceState({ ...state, navIdx: next.index, navKey: cur.key } satisfies NavStamp, '')
  }
  try {
    sessionStorage.setItem(NAV_STORE, JSON.stringify(next))
  } catch {
    // Storage full or blocked: tracking still works for this page load.
  }
  batch(() => {
    nav.value = next
    if (r.path !== route.peek().path) route.value = r
  })
}

if (typeof window !== 'undefined') {
  // Scroll is restored per entry by the app shell.
  history.scrollRestoration = 'manual'
  nav.value = loadNav()
  syncNav(true)
  // Fragment navigations fire both events; syncNav is idempotent for the same entry.
  window.addEventListener('popstate', () => syncNav())
  window.addEventListener('hashchange', () => syncNav())
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
    syncNav()
  } else if (location.hash !== target) {
    location.hash = target
  }
}

/** Returns to the previous in-app entry when there is one, else opens `fallback`. */
export function goBack(fallback: string): void {
  if (previousEntry()) history.back()
  else navigate(fallback)
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
  calendar: () => '/calendar',
  import: () => '/import',
  settings: () => '/settings',
}
