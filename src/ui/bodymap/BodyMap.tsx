import type { JSX } from 'preact'
import { useId, useRef, useState } from 'preact/hooks'
import type { DeltHead, RegionId, VolumeBand } from '../../core/analytics/types'
import { regionName } from '../../core/regions'
import { Tooltip, TooltipRow, TooltipTitle, isActivateKey } from '../charts/common'
import { formatNumber } from '../format'
import { BACK, FRONT, MIDLINE, type ViewArt } from './paths'

export type BodyMapScale = 'weeklySets' | 'relative'
export type BodyMapView = 'both' | 'front' | 'back'
export type BodyMapSize = 'sm' | 'md' | 'lg'

export interface BodyMapProps {
  values: Partial<Record<RegionId, number>>
  /** `weeklySets` colors by the §2.1 volume bands; `relative` scales 0..max. */
  scale?: BodyMapScale
  selected?: RegionId | null
  onSelect?: (r: RegionId) => void
  view?: BodyMapView
  /** Per-head shoulder values; when given, deltoid paths are shaded per head. */
  delts?: Partial<Record<DeltHead, number>>
  /** Defaults to on for md/lg, off for sm. */
  legend?: boolean
  size?: BodyMapSize
  /** Secondary tier, drawn hatched where a region has no primary value. */
  secondary?: Partial<Record<RegionId, number>>
}

/** Neutral muscle tone: the "untrained" fill. */
const MUSCLE_BASE = 'color-mix(in oklab, var(--text) 8%, var(--surface-2))'

function accentMix(pct: number): string {
  return `color-mix(in oklab, var(--accent) ${pct}%, ${MUSCLE_BASE})`
}

const BAND_COLORS: Record<VolumeBand, string> = {
  none: MUSCLE_BASE,
  low: accentMix(25),
  moderate: accentMix(50),
  target: 'var(--accent)',
  high: 'var(--warn)',
}

/** Weekly hard-set band per research §2.1: 0 | <5 | 5–9 | 10–20 | >20. */
export function bandForSets(n: number): VolumeBand {
  if (!(n > 0)) return 'none'
  if (n < 5) return 'low'
  if (n < 10) return 'moderate'
  if (n <= 20) return 'target'
  return 'high'
}

/** Fill color for a volume band (theme tokens only). */
export function bandColor(band: VolumeBand): string {
  return BAND_COLORS[band]
}

const BAND_LEGEND: { band: VolumeBand; label: string }[] = [
  { band: 'none', label: '0' },
  { band: 'low', label: '1–4' },
  { band: 'moderate', label: '5–9' },
  { band: 'target', label: '10–20 target' },
  { band: 'high', label: '20+' },
]

const BAND_NOTE: Record<VolumeBand, string> = {
  none: 'No sets in this period',
  low: 'Low volume (under 5)',
  moderate: 'Moderate volume (5–9)',
  target: 'Typical hypertrophy range (10–20)',
  high: 'High volume (over 20)',
}

/** Stepped fills for the relative scale: level 0 (none) to 4 (max). */
const RELATIVE_COLORS = [MUSCLE_BASE, accentMix(25), accentMix(50), accentMix(75), 'var(--accent)']

const DELT_HEADS: DeltHead[] = ['front', 'side', 'rear']
const DELT_NAMES: Record<DeltHead, string> = { front: 'Front delts', side: 'Side delts', rear: 'Rear delts' }

const UNDRAWN: RegionId[] = ['fullBody', 'cardio', 'other']

const HEIGHT_PX: Record<BodyMapSize, number> = { sm: 140, md: 360, lg: 480 }

/** Tight crop around the figure inside each 200 × 440 view box. */
const CROP = { x: 24, y: 3, w: 152, h: 432 }

const MIRROR = `matrix(-1 0 0 1 ${MIDLINE * 2} 0)`

interface Hover {
  region: RegionId
  x: number
  y: number
  w: number
  h: number
}

/** Positive finite values only; everything else reads as 0. */
function clean(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function regionAt(target: EventTarget | null): RegionId | null {
  const el = target instanceof Element ? target.closest('[data-region]') : null
  return el ? (el.getAttribute('data-region') as RegionId) : null
}

export function BodyMap({
  values,
  scale = 'weeklySets',
  selected = null,
  onSelect,
  view = 'both',
  delts,
  legend,
  size = 'md',
  secondary,
}: BodyMapProps) {
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  const interactive = onSelect !== undefined
  const tooltips = size !== 'sm'
  const showLegend = legend ?? size !== 'sm'
  const views: ViewArt[] = view === 'front' ? [FRONT] : view === 'back' ? [BACK] : [FRONT, BACK]
  const height = HEIGHT_PX[size]
  const width = Math.round((height * CROP.w) / CROP.h)
  const hatchId = (viewId: string) => `bm-hatch-${uid}-${viewId}`

  const primary = (r: RegionId) => clean(values[r])
  const second = (r: RegionId) => (primary(r) > 0 ? 0 : clean(secondary?.[r]))
  const deltValue = (h: DeltHead) => clean(delts?.[h])

  let max = 0
  for (const v of Object.values(values)) max = Math.max(max, clean(v))
  if (delts) for (const h of DELT_HEADS) max = Math.max(max, deltValue(h))

  const colorFor = (v: number): string => {
    if (scale === 'weeklySets') return bandColor(bandForSets(v))
    if (!(v > 0) || !(max > 0)) return RELATIVE_COLORS[0]
    return RELATIVE_COLORS[Math.min(4, Math.max(1, Math.ceil((v / max) * 4)))]
  }

  const valueText = (v: number) => (scale === 'weeklySets' ? `${formatNumber(v)} sets/wk` : formatNumber(v))
  const spokenValue = (v: number) =>
    scale === 'weeklySets' ? `${formatNumber(v)} ${v === 1 ? 'set' : 'sets'} per week` : formatNumber(v)
  const ariaLabel = (r: RegionId) => {
    const s = second(r)
    const text = s > 0 ? `secondary, ${spokenValue(s)}` : spokenValue(primary(r))
    return `${regionName(r)}: ${text}`
  }

  const hasSecondary = secondary !== undefined && Object.keys(secondary).some((r) => second(r as RegionId) > 0)
  const undrawn = UNDRAWN.filter((r) => primary(r) > 0 || second(r) > 0)

  /** The first rendered path of each region carries focus and the accessible name. */
  const focusKey = new Map<RegionId, string>()
  for (const art of views) {
    art.muscles.forEach((mu, i) => {
      if (!focusKey.has(mu.region)) focusKey.set(mu.region, `${art.id}-${i}`)
    })
  }

  const showAt = (region: RegionId, clientX: number, clientY: number) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    setHover({ region, x: clientX - box.left, y: clientY - box.top, w: box.width, h: box.height })
  }

  const onPointer = (e: PointerEvent) => {
    const r = regionAt(e.target)
    if (r) showAt(r, e.clientX, e.clientY)
    else if (hover) setHover(null)
  }

  const onFocusRegion = (region: RegionId, el: Element) => {
    const b = el.getBoundingClientRect()
    showAt(region, b.left + b.width / 2, b.top + b.height / 2)
  }

  const onKeyRegion = (region: RegionId, e: KeyboardEvent) => {
    if (isActivateKey(e.key)) {
      e.preventDefault()
      onSelect?.(region)
    } else if (e.key === 'Escape') {
      setHover(null)
    }
  }

  const renderMuscles = (art: ViewArt, mirrored: boolean) =>
    art.muscles.map((mu, i) => {
      const r = mu.region
      const v = delts && mu.delt ? deltValue(mu.delt) : primary(r)
      const s = v > 0 ? 0 : second(r)
      const hatched = s > 0
      const first = !mirrored && focusKey.get(r) === `${art.id}-${i}`
      const focusable = first && interactive
      let cls = 'bm-muscle'
      if (hatched) cls += ' is-hatched'
      if (hover?.region === r) cls += ' is-hover'
      if (selected === r) cls += ' is-selected'
      return (
        <path
          key={i}
          d={mu.d}
          class={cls}
          style={hatched ? `fill:url(#${hatchId(art.id)})` : `--bm-fill:${colorFor(v)}`}
          data-region={r}
          data-delt={mu.delt}
          tabIndex={focusable ? 0 : undefined}
          role={focusable ? 'button' : undefined}
          aria-label={focusable ? ariaLabel(r) : undefined}
          aria-pressed={focusable ? selected === r : undefined}
          onFocus={focusable ? (e) => onFocusRegion(r, e.currentTarget) : undefined}
          onBlur={focusable ? () => setHover(null) : undefined}
          onKeyDown={focusable ? (e) => onKeyRegion(r, e) : undefined}
        />
      )
    })

  const renderView = (art: ViewArt) => (
    <figure class="bm-view" key={art.id} style={`flex-basis:${width}px;max-width:${width}px`}>
      <svg
        viewBox={`${CROP.x} ${CROP.y} ${CROP.w} ${CROP.h}`}
        width={width}
        height={height}
        role={interactive ? 'group' : undefined}
        aria-label={interactive ? `${art.label} view` : undefined}
        aria-hidden={interactive ? undefined : 'true'}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const r = regionAt(e.target)
          if (r && onSelect) onSelect(r)
        }}
      >
        <defs>
          <pattern id={hatchId(art.id)} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect class="bm-hatch-bg" width="4" height="4" />
            <rect class="bm-hatch-line" width="1.6" height="4" />
          </pattern>
        </defs>
        <path class="bm-silhouette" d={art.silhouette} />
        <g>
          {art.details.map((d, i) => (
            <path key={i} class="bm-detail" d={d} />
          ))}
        </g>
        <g transform={MIRROR}>
          {art.details.map((d, i) => (
            <path key={i} class="bm-detail" d={d} />
          ))}
        </g>
        <g>{renderMuscles(art, false)}</g>
        <g transform={MIRROR}>{renderMuscles(art, true)}</g>
      </svg>
      {size !== 'sm' && <figcaption class="bm-caption">{art.label}</figcaption>}
    </figure>
  )

  let tooltip: JSX.Element | null = null
  if (hover && tooltips) {
    const r = hover.region
    const p = primary(r)
    const s = second(r)
    tooltip = (
      <Tooltip x={hover.x} y={hover.y} width={hover.w} height={hover.h}>
        <TooltipTitle>{regionName(r)}</TooltipTitle>
        {s > 0 ? (
          <TooltipRow color="var(--accent)" label="Secondary" value={valueText(s)} />
        ) : (
          <TooltipRow
            color={colorFor(p)}
            label={scale === 'weeklySets' ? 'Weekly sets' : 'Value'}
            value={valueText(p)}
            note={scale === 'weeklySets' ? BAND_NOTE[bandForSets(p)] : undefined}
          />
        )}
        {r === 'shoulders' &&
          delts &&
          DELT_HEADS.map((h) => (
            <TooltipRow key={h} color={colorFor(deltValue(h))} label={DELT_NAMES[h]} value={valueText(deltValue(h))} />
          ))}
      </Tooltip>
    )
  }

  const hatchSwatch = <span class="bm-swatch bm-swatch--hatch" />

  const summary = interactive ? null : (
    <ul class="sr-only">
      {[...focusKey.keys(), ...undrawn]
        .filter((r) => primary(r) > 0 || second(r) > 0)
        .map((r) => (
          <li key={r}>{ariaLabel(r)}</li>
        ))}
    </ul>
  )

  return (
    <div
      ref={wrap}
      class={`bm bm--${size}${interactive ? ' is-interactive' : ''}`}
      role="group"
      aria-label={scale === 'weeklySets' ? 'Muscle map, weekly sets per muscle' : 'Muscle map'}
    >
      <div class="bm-stage">
        <div class="bm-views">{views.map(renderView)}</div>
        {undrawn.length > 0 && (
          <ul class="bm-extra" aria-label="Not shown on the figure">
            {undrawn.map((r) => {
              const s = second(r)
              const content = (
                <>
                  {s > 0 ? hatchSwatch : <span class="bm-swatch" style={`background:${colorFor(primary(r))}`} />}
                  <span class="bm-chip-name">{regionName(r)}</span>
                  <span class="bm-chip-value">{valueText(s > 0 ? s : primary(r))}</span>
                </>
              )
              const cls = `bm-chip${selected === r ? ' is-selected' : ''}`
              return (
                <li key={r}>
                  {onSelect ? (
                    <button type="button" class={cls} aria-pressed={selected === r} onClick={() => onSelect(r)}>
                      {content}
                    </button>
                  ) : (
                    <span class={cls}>{content}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {showLegend && (
        <div class="bm-legend" aria-hidden="true">
          {scale === 'weeklySets' ? (
            <>
              <span class="bm-legend-title">Sets/wk</span>
              {BAND_LEGEND.map((b) => (
                <span key={b.band} class="bm-legend-item">
                  <span class="bm-swatch" style={`background:${bandColor(b.band)}`} />
                  {b.label}
                </span>
              ))}
            </>
          ) : (
            <span class="bm-legend-item bm-legend-steps">
              Less
              {RELATIVE_COLORS.map((c, i) => (
                <span key={i} class="bm-swatch" style={`background:${c}`} />
              ))}
              More
            </span>
          )}
          {hasSecondary && (
            <span class="bm-legend-item">
              {hatchSwatch}
              Secondary
            </span>
          )}
        </div>
      )}
      {summary}
      {tooltip}
    </div>
  )
}
