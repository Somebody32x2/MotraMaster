import { afterEach, describe, expect, it, vi } from 'vitest'
import { spanStart } from './core/analytics/util'

describe('analysis window', () => {
  afterEach(() => vi.useRealTimers())

  it('ends at 11:59 pm today and its last 7 days start six days back, so last week\'s same weekday is out', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 31, 10, 0)) // Saturday morning
    const { analysisWindow } = await import('./analysis')
    const { end } = analysisWindow.value
    expect(end).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999))
    const week = spanStart(end, 7)
    expect(week).toEqual(new Date(2026, 9, 25)) // Sunday 00:00
    expect(new Date(2026, 9, 24, 18, 0) >= week).toBe(false) // last Saturday's workout
    expect(new Date(2026, 9, 25, 7, 0) >= week).toBe(true)
  })
})
