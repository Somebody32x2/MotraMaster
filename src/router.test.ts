import { describe, expect, it } from 'vitest'
import { trackNav, type NavStack, type NavStamp } from './router'

const EMPTY: NavStack = { entries: [], index: -1 }

/** Stamp the browser would hold for the stack's current entry. */
const stampOf = (s: NavStack): NavStamp => ({ navIdx: s.index, navKey: s.entries[s.index]!.key })

/** Follows links from a fresh document load through `paths`, scrolled to `scrollY` on each page. */
function visit(paths: string[], scrollY = 0): { stack: NavStack; stamps: NavStamp[] } {
  let stack = trackNav(EMPTY, null, paths[0], { scrollY: 0, key: 'k0', fresh: true })
  const stamps = [stampOf(stack)]
  paths.slice(1).forEach((p, i) => {
    stack = trackNav(stack, null, p, { scrollY, key: `k${i + 1}` })
    stamps.push(stampOf(stack))
  })
  return { stack, stamps }
}

const pathsOf = (s: NavStack) => s.entries.map((e) => e?.path ?? null)

describe('trackNav', () => {
  it('records link navigation as a sequence', () => {
    const { stack } = visit(['/', '/workouts', '/workouts/a'])
    expect(pathsOf(stack)).toEqual(['/', '/workouts', '/workouts/a'])
    expect(stack.index).toBe(2)
  })

  it('moves to the stamped entry on back/forward and keeps forward entries', () => {
    const { stack, stamps } = visit(['/', '/exercises/bench', '/workouts/a'])
    const back = trackNav(stack, stamps[1], '/exercises/bench', { scrollY: 0, key: 'x' })
    expect(back.index).toBe(1)
    expect(back.entries[back.index - 1]?.path).toBe('/')
    const forward = trackNav(back, stamps[2], '/workouts/a', { scrollY: 0, key: 'x' })
    expect(forward.index).toBe(2)
    expect(forward.entries[1]?.path).toBe('/exercises/bench')
  })

  it('drops forward entries when a link is followed after going back', () => {
    const { stack, stamps } = visit(['/', '/muscles', '/muscles/chest'])
    const back = trackNav(stack, stamps[1], '/muscles', { scrollY: 0, key: 'x' })
    const next = trackNav(back, null, '/muscles/lats', { scrollY: 0, key: 'new' })
    expect(pathsOf(next)).toEqual(['/', '/muscles', '/muscles/lats'])
    expect(next.index).toBe(2)
    expect(next.entries[2]?.key).toBe('new')
  })

  it('saves scroll for the entry being left and returns it on back', () => {
    let { stack, stamps } = visit(['/', '/workouts'])
    stack = trackNav(stack, null, '/workouts/a', { scrollY: 840, key: 'detail' })
    const back = trackNav(stack, stamps[1], '/workouts', { scrollY: 120, key: 'x' })
    expect(back.entries[1]?.scrollY).toBe(840)
    expect(back.entries[2]?.scrollY).toBe(120)
  })

  it('treats a repeat event for the current entry as a no-op for scroll', () => {
    const { stack, stamps } = visit(['/', '/workouts'], 500)
    const again = trackNav(stack, stamps[1], '/workouts', { scrollY: 999, key: 'x' })
    expect(again.entries.map((e) => e?.scrollY)).toEqual([500, 0])
    expect(again.index).toBe(1)
  })

  it('updates the path in place on replace', () => {
    const { stack, stamps } = visit(['/', '/workouts'])
    const replaced = trackNav(stack, stamps[1], '/import', { scrollY: 0, key: 'x' })
    expect(pathsOf(replaced)).toEqual(['/', '/import'])
    expect(replaced.index).toBe(1)
  })

  it('keeps the sequence across a reload of a tracked entry', () => {
    const { stack, stamps } = visit(['/', '/calendar', '/workouts/a'])
    const reloaded = trackNav(stack, stamps[2], '/workouts/a', { scrollY: 0, key: 'x', fresh: true })
    expect(reloaded.index).toBe(2)
    expect(reloaded.entries[1]?.path).toBe('/calendar')
  })

  it('forgets neighbours of an entry whose record is gone', () => {
    const lost = trackNav(EMPTY, { navIdx: 3, navKey: 'old' }, '/workouts/a', { scrollY: 0, key: 'x', fresh: true })
    expect(lost.index).toBe(3)
    expect(lost.entries.slice(0, 3)).toEqual([null, null, null])
    const { stack } = visit(['/', '/workouts'])
    const mismatch = trackNav(stack, { navIdx: 1, navKey: 'other' }, '/muscles', { scrollY: 0, key: 'x' })
    expect(mismatch.entries[0]).toBeNull()
  })

  it('starts over on a document load of an unstamped entry', () => {
    const { stack } = visit(['/', '/workouts'])
    const fresh = trackNav(stack, null, '/muscles', { scrollY: 0, key: 'f', fresh: true })
    expect(pathsOf(fresh)).toEqual(['/muscles'])
    expect(fresh.index).toBe(0)
  })
})
