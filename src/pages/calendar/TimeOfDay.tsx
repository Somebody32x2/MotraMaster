import { useMemo, useState } from 'preact/hooks'
import { BarChart, type BarDatum } from '../../ui/charts'
import { formatNumber, plural } from '../../ui/format'
import { WEEKDAY_LONG, WEEKDAY_SHORT, hourLabel, hourRange } from './metrics'

/** Workouts by local start hour, 24 vertical bars. */
export function HourBars({ hours }: { hours: number[] }) {
  const data = useMemo<BarDatum[]>(
    () =>
      Array.from({ length: 24 }, (_, h) => ({
        key: String(h),
        label: hourRange(h),
        values: hours[h] ?? 0,
        color: 'var(--accent)',
      })),
    [hours],
  )
  const total = hours.reduce((a, b) => a + (b > 0 ? b : 0), 0)
  return (
    <BarChart
      data={total === 0 ? [] : data}
      height={180}
      stackLabels={['Workouts']}
      xFormat={(k) => hourLabel(Number(k))}
      valueFormat={(n) => formatNumber(n, { maxDecimals: 0 })}
      emptyText="No start times recorded in this range"
      ariaLabel={`Workout start times by hour, ${plural(total, 'workout')}`}
    />
  )
}

const HOUR_TICKS = [0, 6, 12, 18]

/** 7 × 24 grid of workout starts: rows Monday–Sunday, columns by hour. */
export function WeekdayHourGrid({ grid }: { grid: number[][] }) {
  const [active, setActive] = useState<{ wd: number; h: number } | null>(null)
  const { max, peak, total } = useMemo(() => {
    let max = 0
    let total = 0
    let peak: { wd: number; h: number } | null = null
    for (let wd = 0; wd < 7; wd++) {
      for (let h = 0; h < 24; h++) {
        const c = grid[wd]?.[h] ?? 0
        total += c
        if (c > max) {
          max = c
          peak = { wd, h }
        }
      }
    }
    return { max, peak, total }
  }, [grid])

  const levelOf = (c: number) => (c > 0 && max > 0 ? Math.min(5, Math.max(1, Math.ceil((c / max) * 5))) : 0)
  const countAt = (wd: number, h: number) => grid[wd]?.[h] ?? 0

  const readout = (slot: { wd: number; h: number } | null, prefix: string) =>
    slot ? `${prefix}${WEEKDAY_LONG[slot.wd]}, ${hourRange(slot.h)}: ${plural(countAt(slot.wd, slot.h), 'workout')}` : ''

  const onKeyDown = (e: KeyboardEvent) => {
    const cur = active ?? peak ?? { wd: 0, h: 0 }
    let { wd, h } = cur
    switch (e.key) {
      case 'ArrowLeft':
        h = Math.max(0, h - 1)
        break
      case 'ArrowRight':
        h = Math.min(23, h + 1)
        break
      case 'ArrowUp':
        wd = Math.max(0, wd - 1)
        break
      case 'ArrowDown':
        wd = Math.min(6, wd + 1)
        break
      case 'Escape':
        setActive(null)
        return
      default:
        return
    }
    e.preventDefault()
    setActive({ wd, h })
  }

  if (total === 0) return <p class="faint wdh-empty">No start times recorded in this range.</p>

  return (
    <div class="wdh">
      <div
        class="wdh-grid"
        tabIndex={0}
        role="img"
        aria-label={`Workout starts by weekday and hour. ${readout(peak, 'Busiest slot: ')}. Use arrow keys to inspect.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? peak)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <span class="wdh-corner" aria-hidden="true" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={`h${h}`} class="wdh-hour" aria-hidden="true">
            {HOUR_TICKS.includes(h) ? hourLabel(h) : ''}
          </span>
        ))}
        {WEEKDAY_SHORT.map((label, wd) => [
          <span key={`l${wd}`} class="wdh-wd" aria-hidden="true">
            {label}
          </span>,
          ...Array.from({ length: 24 }, (_, h) => {
            const c = countAt(wd, h)
            const isActive = active?.wd === wd && active.h === h
            return (
              <span
                key={`${wd}-${h}`}
                class={`wdh-cell cal-day--l${levelOf(c)}${c === 0 ? ' is-zero' : ''}${isActive ? ' is-active' : ''}`}
                aria-hidden="true"
                onPointerEnter={() => setActive({ wd, h })}
              />
            )
          }),
        ])}
      </div>
      <p class="wdh-readout faint num" aria-live="polite">
        {active ? readout(active, '') : readout(peak, 'Busiest: ')}
      </p>
    </div>
  )
}
