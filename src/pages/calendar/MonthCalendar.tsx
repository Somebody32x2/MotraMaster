import type { JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { CalendarDay, WorkoutSummary } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, navigate, paths } from '../../router'
import { formatDate, formatDuration, plural } from '../../ui/format'
import { dayKey } from '../overview/util'
import { LEVELS, WEEKDAY_SHORT, weekdayIndex, type MetricDef, type MetricScale } from './metrics'

const INITIAL_MONTHS = 3
const MORE_STEP = 6
const TIP_W = 260

export interface MonthCalendarProps {
  days: CalendarDay[]
  metric: MetricDef
  scale: MetricScale
  units: Units
  summaries: Map<string, WorkoutSummary>
  latestDate: Date | null
}

interface Month {
  key: string
  year: number
  month: number
}

/** Anchor geometry relative to the calendar root. */
interface Anchor {
  key: string
  cx: number
  top: number
  bottom: number
  above: boolean
  rootW: number
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

function monthsOf(days: CalendarDay[]): Month[] {
  if (days.length === 0) return []
  const first = days[0].date
  const last = days[days.length - 1].date
  const out: Month[] = []
  let y = last.getFullYear()
  let m = last.getMonth()
  while (y > first.getFullYear() || (y === first.getFullYear() && m >= first.getMonth())) {
    out.push({ key: `${y}-${m}`, year: y, month: m })
    m -= 1
    if (m < 0) {
      m = 11
      y -= 1
    }
  }
  return out
}

function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function workoutLine(s: WorkoutSummary): string {
  const parts: string[] = []
  if (s.date) parts.push(formatDate(s.date, 'time'))
  if (s.durationSec != null) parts.push(formatDuration(s.durationSec))
  if (s.trimmedSec > 0) parts.push(`trimmed ${formatDuration(s.trimmedSec)}`)
  return parts.join(' · ')
}

export function MonthCalendar({ days, metric, scale, units, summaries, latestDate }: MonthCalendarProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(INITIAL_MONTHS)
  const [tip, setTip] = useState<Anchor | null>(null)
  const [pop, setPop] = useState<Anchor | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)

  const byKey = useMemo(() => {
    const m = new Map<string, CalendarDay>()
    for (const d of days) m.set(dayKey(d.date), d)
    return m
  }, [days])
  const months = useMemo(() => monthsOf(days), [days])
  const shown = months.slice(0, visible)
  const hidden = months.length - shown.length

  const todayKey = dayKey(new Date())
  const latestKey = latestDate ? dayKey(latestDate) : null
  const defaultKey = useMemo(() => {
    for (let i = days.length - 1; i >= 0; i--) if (days[i].workoutIds.length > 0) return dayKey(days[i].date)
    return days.length ? dayKey(days[days.length - 1].date) : null
  }, [days])
  const shownFrom = shown.length ? new Date(shown[shown.length - 1].year, shown[shown.length - 1].month, 1) : null
  const isRendered = (k: string | null): k is string => k != null && byKey.has(k) && shownFrom != null && parseKey(k) >= shownFrom
  const tabKey = isRendered(focusKey) ? focusKey : defaultKey

  // Close the popover on outside press.
  useEffect(() => {
    if (!pop) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t)) return
      if ((t as HTMLElement).closest?.(`[data-day="${pop.key}"]`)) return
      setPop(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pop])

  useEffect(() => {
    if (pop) popRef.current?.querySelector<HTMLElement>('a')?.focus()
  }, [pop?.key])

  if (months.length === 0) return null

  const anchorOf = (el: HTMLElement, key: string): Anchor | null => {
    const root = rootRef.current
    if (!root) return null
    const r = el.getBoundingClientRect()
    const rr = root.getBoundingClientRect()
    return {
      key,
      cx: r.left + r.width / 2 - rr.left,
      top: r.top - rr.top,
      bottom: r.bottom - rr.top,
      above: r.top > 220,
      rootW: rr.width,
    }
  }

  const focusDay = (k: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-day="${k}"]`)
    if (!el) return false
    el.focus()
    return true
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement
    const k = el.dataset?.day
    if (!k) return
    const d = parseKey(k)
    let next: Date | null = null
    switch (e.key) {
      case 'ArrowLeft':
        next = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
        break
      case 'ArrowRight':
        next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
        break
      case 'ArrowUp':
        next = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7)
        break
      case 'ArrowDown':
        next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
        break
      case 'PageUp':
        next = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
        break
      case 'PageDown':
        next = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
        break
      case 'Home':
        next = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayIndex(d))
        break
      case 'End':
        next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6 - weekdayIndex(d))
        break
      case 'Escape':
        if (pop) {
          setPop(null)
          e.preventDefault()
        } else setTip(null)
        return
      default:
        return
    }
    e.preventDefault()
    focusDay(dayKey(next))
  }

  const activate = (el: HTMLElement, key: string) => {
    const ids = byKey.get(key)?.workoutIds ?? []
    if (ids.length === 1) {
      navigate(paths.workout(ids[0]))
    } else if (ids.length > 1) {
      setTip(null)
      setPop((p) => (p?.key === key ? null : anchorOf(el, key)))
    }
  }

  const placement = (a: Anchor): JSX.CSSProperties => {
    const w = Math.min(TIP_W, a.rootW)
    const left = Math.max(0, Math.min(a.rootW - w, a.cx - w / 2))
    return a.above
      ? { width: `${w}px`, left: `${left}px`, top: `${a.top - 8}px`, transform: 'translateY(-100%)' }
      : { width: `${w}px`, left: `${left}px`, top: `${a.bottom + 8}px` }
  }

  const describe = (cd: CalendarDay): string => {
    const n = cd.workoutIds.length
    const date = formatDate(cd.date, 'long')
    if (n === 0) return `${date}: rest day`
    return `${date}: ${plural(n, 'workout')}, ${metric.label} ${metric.format(cd.metrics[metric.value], units)}`
  }

  const renderTip = (a: Anchor) => {
    const cd = byKey.get(a.key)
    if (!cd) return null
    const list = cd.workoutIds.map((id) => summaries.get(id)).filter((s): s is WorkoutSummary => s != null)
    return (
      <div class="mm-tooltip cal-tip" style={placement(a)} aria-hidden="true">
        <div class="mm-tooltip-title">{formatDate(cd.date, 'long')}</div>
        {cd.workoutIds.length === 0 ? (
          <div class="cal-tip__rest">Rest day</div>
        ) : (
          <>
            <ul class="cal-tip__list">
              {list.map((s) => (
                <li key={s.workout.id}>
                  <span class="cal-tip__name">{s.workout.title || 'Workout'}</span>
                  <span class="cal-tip__meta">{workoutLine(s)}</span>
                </li>
              ))}
            </ul>
            <div class="cal-tip__metric">
              <span>{metric.label}</span>
              <strong>{metric.format(cd.metrics[metric.value], units)}</strong>
            </div>
          </>
        )}
      </div>
    )
  }

  const renderPop = (a: Anchor) => {
    const cd = byKey.get(a.key)
    if (!cd) return null
    const list = cd.workoutIds.map((id) => summaries.get(id)).filter((s): s is WorkoutSummary => s != null)
    return (
      <div
        ref={popRef}
        class="cal-pop"
        role="dialog"
        aria-label={`Workouts on ${formatDate(cd.date, 'long')}`}
        style={placement(a)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setPop(null)
            focusDay(a.key)
          }
        }}
      >
        <p class="cal-pop__title">{formatDate(cd.date, 'long')}</p>
        <ul class="cal-pop__list">
          {list.map((s) => (
            <li key={s.workout.id}>
              <a href={href(paths.workout(s.workout.id))} onClick={() => setPop(null)}>
                <span class="cal-tip__name">{s.workout.title || 'Workout'}</span>
                <span class="cal-tip__meta">{workoutLine(s)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const renderMonth = (m: Month) => {
    const first = new Date(m.year, m.month, 1)
    const count = new Date(m.year, m.month + 1, 0).getDate()
    const lead = weekdayIndex(first)
    const total = Math.ceil((lead + count) / 7) * 7
    let workouts = 0
    let trainingDays = 0
    const cells: JSX.Element[] = []
    for (let i = 0; i < total; i++) {
      const dom = i - lead + 1
      if (dom < 1 || dom > count) {
        cells.push(<span key={`pad-${i}`} class="cal-day cal-day--pad" aria-hidden="true" />)
        continue
      }
      const date = new Date(m.year, m.month, dom)
      const k = dayKey(date)
      const cd = byKey.get(k)
      const marks = `${k === todayKey ? ' is-today' : ''}${k === latestKey ? ' is-latest' : ''}`
      if (!cd) {
        cells.push(
          <span key={k} class={`cal-day cal-day--out${marks}`} aria-hidden="true">
            <span class="cal-day__num">{dom}</span>
          </span>,
        )
        continue
      }
      const n = cd.workoutIds.length
      const value = cd.metrics[metric.value]
      let tone = 'cal-day--rest'
      if (n > 0) {
        workouts += n
        trainingDays += 1
        const level = scale.level(value)
        tone = level > 0 ? `cal-day--l${level}` : 'cal-day--na'
      }
      cells.push(
        <button
          key={k}
          type="button"
          class={`cal-day ${tone}${marks}${pop?.key === k ? ' is-open' : ''}`}
          data-day={k}
          tabIndex={k === tabKey ? 0 : -1}
          aria-label={describe(cd)}
          aria-haspopup={n > 1 ? 'dialog' : undefined}
          aria-expanded={n > 1 ? pop?.key === k : undefined}
          onPointerEnter={(e) => {
            if (!pop) setTip(anchorOf(e.currentTarget, k))
          }}
          onPointerLeave={() => setTip((t) => (t?.key === k ? null : t))}
          onFocus={(e) => {
            setFocusKey(k)
            if (!pop) setTip(anchorOf(e.currentTarget, k))
          }}
          onBlur={() => setTip((t) => (t?.key === k ? null : t))}
          onClick={(e) => activate(e.currentTarget, k)}
        >
          <span class="cal-day__num">{dom}</span>
          {n > 1 && <span class="cal-day__multi" aria-hidden="true">×{n}</span>}
          {n > 0 && value != null && <span class="cal-day__val">{metric.short(value, units)}</span>}
        </button>,
      )
    }
    return (
      <section key={m.key} class="cal-month" aria-label={monthFmt.format(first)}>
        <header class="cal-month__head">
          <h4 class="cal-month__title">{monthFmt.format(first)}</h4>
          <span class="cal-month__meta faint num">
            {workouts > 0
              ? `${plural(workouts, 'workout')}${trainingDays !== workouts ? ` · ${plural(trainingDays, 'day')}` : ''}`
              : 'No workouts'}
          </span>
        </header>
        <div class="cal-grid" role="group">
          {WEEKDAY_SHORT.map((w) => (
            <span key={w} class="cal-grid__wd" aria-hidden="true">
              {w}
            </span>
          ))}
          {cells}
        </div>
      </section>
    )
  }

  const low = metric.value === 'startHour' ? 'Earlier' : 'Lower'
  const high = metric.value === 'startHour' ? 'Later' : 'Higher'
  const hasNa = days.some((d) => d.workoutIds.length > 0 && d.metrics[metric.value] == null)

  return (
    <div class="cal">
      <div class="cal-months" ref={rootRef} onKeyDown={onKeyDown}>
        {shown.map(renderMonth)}
        {tip && !pop && renderTip(tip)}
        {pop && renderPop(pop)}
      </div>
      <div class="cal-foot">
        <div class="cal-legend" aria-hidden="true">
          <span class="cal-legend__item">
            <span class="cal-swatch cal-day--rest" />
            Rest
          </span>
          {hasNa && (
            <span class="cal-legend__item">
              <span class="cal-swatch cal-day--na" />
              Not recorded
            </span>
          )}
          <span class="cal-legend__item">
            <span>{low}</span>
            {Array.from({ length: LEVELS }, (_, i) => (
              <span key={i} class={`cal-swatch cal-day--l${i + 1}`} />
            ))}
            <span>{high}</span>
          </span>
          {scale.min != null && scale.max != null && (
            <span class="cal-legend__range num">
              {scale.min === scale.max
                ? metric.format(scale.min, units)
                : `${metric.format(scale.min, units)} – ${metric.format(scale.max, units)}`}
            </span>
          )}
        </div>
        {(hidden > 0 || visible > INITIAL_MONTHS) && (
          <div class="cal-more">
            {hidden > 0 && (
              <button type="button" class="btn btn--sm" onClick={() => setVisible((v) => v + MORE_STEP)}>
                Show earlier months
                <span class="faint num"> ({hidden} more)</span>
              </button>
            )}
            {visible > INITIAL_MONTHS && (
              <button
                type="button"
                class="btn btn--sm btn--ghost"
                onClick={() => {
                  setVisible(INITIAL_MONTHS)
                  setPop(null)
                }}
              >
                Show fewer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
