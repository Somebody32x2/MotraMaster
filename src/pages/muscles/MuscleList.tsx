import { Fragment, type ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import type { MuscleSummary, RegionId } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { InfoTip } from '../../ui/components/InfoTip'
import { formatNumber, formatRelative, formatWeight } from '../../ui/format'
import { IconChevronRight } from '../../ui/icons'
import { VolumeBandBadge } from '../../ui/widgets'
import { bandOf, FRACTIONAL_INFO, FREQUENCY_INFO, TARGET_HI, TARGET_LO, WEEKLY_SETS_INFO } from './bands'

export interface MuscleListProps {
  rows: MuscleSummary[]
  /** Weekly sets shown (direct or fractional). */
  setsOf: (m: MuscleSummary) => number
  fractional: boolean
  detailed: boolean
  units: Units
  highlighted: RegionId | null
  onHighlight: (r: RegionId | null) => void
  /** What made up a row's weekly sets, shown when the row is expanded. */
  breakdown: (m: MuscleSummary) => ComponentChildren
}

/** Thin bar of weekly sets; the 10–20 band is marked by two faint ticks, with no track behind. */
export function SetsBar({ value, max }: { value: number; max: number }) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`
  const band = bandOf(value)
  return (
    <span class="sets-bar" aria-hidden="true">
      <span class="sets-bar__tick" style={{ left: pct(TARGET_LO) }} />
      <span class="sets-bar__tick" style={{ left: pct(TARGET_HI) }} />
      {value > 0 && <span class={`sets-bar__fill sets-bar__fill--${band}`} style={{ width: pct(value) }} />}
    </span>
  )
}

export function MuscleList({ rows, setsOf, fractional, detailed, units, highlighted, onHighlight, breakdown }: MuscleListProps) {
  const [open, setOpen] = useState<ReadonlySet<RegionId>>(new Set())
  const toggle = (r: RegionId) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(r)) next.add(r)
      return next
    })
  const max = Math.max(24, ...rows.map((r) => Math.ceil(setsOf(r))))
  return (
    <div class={detailed ? 'mlist mlist--detailed' : 'mlist'} role="table" aria-label="Muscles by weekly sets">
      <div class="mlist__head" role="row">
        <span role="columnheader">Muscle</span>
        <span role="columnheader" class="mlist__sets-h">
          {fractional ? 'Fractional sets' : 'Sets, 7 days'}
          <InfoTip text={fractional ? FRACTIONAL_INFO : WEEKLY_SETS_INFO} />
        </span>
        <span role="columnheader">Band</span>
        {detailed && (
          <span role="columnheader" class="mlist__num mlist__opt" title="Average weekly sets over the last 4 weeks">
            4-wk avg
          </span>
        )}
        <span role="columnheader" class="mlist__num mlist__opt" title={FREQUENCY_INFO}>
          Days/wk
        </span>
        {detailed && (
          <span role="columnheader" class="mlist__num mlist__opt">
            Volume
          </span>
        )}
        <span role="columnheader" class="mlist__last">
          Last trained
        </span>
        {detailed && (
          <span role="columnheader" class="mlist__top">
            Top exercise
          </span>
        )}
      </div>
      {rows.map((m) => {
        const sets = setsOf(m)
        const top = m.topExercises[0]
        const expanded = open.has(m.region)
        const panelId = `mlist-week-${m.region}`
        return (
          <Fragment key={m.region}>
          <div
            role="row"
            class={['mlist__row', highlighted === m.region && 'is-hot', expanded && 'is-open'].filter(Boolean).join(' ')}
            onMouseEnter={() => onHighlight(m.region)}
            onMouseLeave={() => onHighlight(null)}
            onFocusCapture={() => onHighlight(m.region)}
            onBlurCapture={() => onHighlight(null)}
          >
            <span role="cell" class="mlist__name">
              <button
                type="button"
                class="mlist__caret"
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={`What counted for ${m.name}`}
                title="What counted in the last 7 days"
                onClick={() => toggle(m.region)}
              >
                <IconChevronRight size={12} />
              </button>
              <a class="mlist__link" href={href(paths.muscle(m.region))}>
                {m.name}
              </a>
            </span>
            <span role="cell" class="mlist__sets" onClick={() => toggle(m.region)}>
              <span class={sets > 0 ? 'mlist__sets-n num' : 'mlist__sets-n num faint'}>
                {formatNumber(sets, { maxDecimals: 1 })}
              </span>
              <SetsBar value={sets} max={max} />
            </span>
            <span role="cell" class="mlist__band">
              <VolumeBandBadge band={fractional ? bandOf(sets) : m.band} />
            </span>
            {detailed && (
              <span role="cell" class="mlist__num mlist__opt num">
                {formatNumber(m.avgWeeklySets4w, { maxDecimals: 1 })}
              </span>
            )}
            <span role="cell" class="mlist__num mlist__opt num">
              {formatNumber(m.frequencyPerWeek, { maxDecimals: 1 })}
            </span>
            {detailed && (
              <span role="cell" class="mlist__num mlist__opt num">
                {m.volumeLb > 0 ? formatWeight(m.volumeLb, units, { compact: true }) : <span class="faint">–</span>}
              </span>
            )}
            <span role="cell" class="mlist__last">
              {m.lastTrained ? formatRelative(m.lastTrained) : <span class="faint">Never</span>}
            </span>
            {detailed && (
              <span role="cell" class="mlist__top">
                {top ? (
                  <a class="mlist__toplink" href={href(paths.exercise(top.key))} title={top.name}>
                    {top.name}
                  </a>
                ) : (
                  <span class="faint">–</span>
                )}
              </span>
            )}
          </div>
          {expanded && (
            <div role="row" class="mlist__week" id={panelId}>
              <div role="cell">{breakdown(m)}</div>
            </div>
          )}
          </Fragment>
        )
      })}
    </div>
  )
}
