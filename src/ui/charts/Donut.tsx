import { useState } from 'preact/hooks';
import { DEFAULT_EMPTY_TEXT, Swatch, fmt, isActivateKey, navigateIndex, paletteColor } from './common';
import { formatNumber, isFiniteNumber } from './scale';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface DonutProps {
  /** Slices with non-positive or non-finite values are skipped. */
  slices: DonutSlice[];
  /** Diameter in px (default 168); shrinks to fit narrow containers. */
  size?: number;
  /** Ring thickness in px (default 18% of size). */
  thickness?: number;
  /** Center text when nothing is hovered (defaults: "Total" / formatted sum). */
  centerLabel?: string;
  centerValue?: string;
  valueFormat?: (n: number) => string;
  /** Show the side legend with values and shares (default true). */
  legend?: boolean;
  onSliceClick?: (key: string) => void;
  emptyText?: string;
  ariaLabel?: string;
  class?: string;
}

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, a: number): string {
  return `${fmt(cx + r * Math.cos(a))},${fmt(cy + r * Math.sin(a))}`;
}

function ringPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  if (a1 - a0 >= TAU - 1e-6) {
    // Full ring: two concentric circles, filled with evenodd.
    return (
      `M${fmt(cx + r1)},${fmt(cy)}A${fmt(r1)},${fmt(r1)} 0 1 1 ${fmt(cx - r1)},${fmt(cy)}A${fmt(r1)},${fmt(r1)} 0 1 1 ${fmt(cx + r1)},${fmt(cy)}Z` +
      `M${fmt(cx + r0)},${fmt(cy)}A${fmt(r0)},${fmt(r0)} 0 1 0 ${fmt(cx - r0)},${fmt(cy)}A${fmt(r0)},${fmt(r0)} 0 1 0 ${fmt(cx + r0)},${fmt(cy)}Z`
    );
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return (
    `M${polar(cx, cy, r1, a0)}A${fmt(r1)},${fmt(r1)} 0 ${large} 1 ${polar(cx, cy, r1, a1)}` +
    `L${polar(cx, cy, r0, a1)}A${fmt(r0)},${fmt(r0)} 0 ${large} 0 ${polar(cx, cy, r0, a0)}Z`
  );
}

const pctFmt = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

export function Donut(props: DonutProps) {
  const { slices, size = 168, valueFormat = formatNumber, legend = true, onSliceClick, emptyText = DEFAULT_EMPTY_TEXT } = props;
  const [active, setActive] = useState<number | null>(null);

  const items = slices
    .map((s, i) => ({ s, color: s.color ?? paletteColor(i) }))
    .filter(({ s }) => isFiniteNumber(s.value) && s.value > 0);
  const total = items.reduce((sum, it) => sum + it.s.value, 0);

  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const thickness = Math.min(outer - 4, Math.max(4, props.thickness ?? size * 0.18));
  const inner = outer - thickness;

  let angle = -Math.PI / 2;
  const arcs = items.map((it) => {
    const sweep = (it.s.value / total) * TAU;
    const a0 = angle;
    angle += sweep;
    return { ...it, a0, a1: angle, share: it.s.value / total };
  });

  const activeIdx = active !== null && active < arcs.length ? active : null;
  const activeArc = activeIdx !== null ? arcs[activeIdx] : null;
  const centerLabel = activeArc ? activeArc.s.label : (props.centerLabel ?? 'Total');
  const centerValue = activeArc ? valueFormat(activeArc.s.value) : (props.centerValue ?? valueFormat(total));
  const centerNote = activeArc ? pctFmt.format(activeArc.share) : null;

  const summary =
    props.ariaLabel ??
    (arcs.length === 0
      ? emptyText
      : `Donut chart, total ${valueFormat(total)}. ${arcs
          .map((a) => `${a.s.label}: ${valueFormat(a.s.value)} (${pctFmt.format(a.share)})`)
          .join('; ')}. Use arrow keys to inspect slices.`);

  const onKeyDown = (e: KeyboardEvent) => {
    if (isActivateKey(e.key)) {
      if (activeArc && onSliceClick) {
        e.preventDefault();
        onSliceClick(activeArc.s.key);
      }
      return;
    }
    const next = navigateIndex(e.key, activeIdx, arcs.length);
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
  };

  return (
    <div class={`mm-chart mm-donut${props.class ? ` ${props.class}` : ''}`}>
      <svg
        class={onSliceClick ? 'mm-clickable' : undefined}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={summary}
        tabIndex={arcs.length ? 0 : undefined}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => (a === null && arcs.length ? 0 : a))}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {arcs.length === 0 ? (
          <path class="mm-donut-empty" d={ringPath(cx, cy, inner, outer, 0, TAU)} fill-rule="evenodd" />
        ) : (
          <g class={`mm-donut-slices${activeIdx !== null ? ' has-active' : ''}`}>
            {arcs.map((a, i) => (
              <path
                key={a.s.key}
                class={`mm-donut-slice${i === activeIdx ? ' is-active' : ''}`}
                d={ringPath(cx, cy, inner, i === activeIdx ? outer + 3 : outer, a.a0, a.a1)}
                fill={a.color}
                fill-rule="evenodd"
                stroke={arcs.length > 1 ? 'var(--surface)' : 'none'}
                stroke-width={1.5}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onClick={() => onSliceClick?.(a.s.key)}
              />
            ))}
          </g>
        )}
        <text class="mm-donut-label" x={cx} y={cy - size * 0.07} text-anchor="middle" dominant-baseline="middle">
          {arcs.length === 0 ? emptyText : centerLabel.length > 18 ? `${centerLabel.slice(0, 17)}…` : centerLabel}
        </text>
        {arcs.length > 0 && (
          <text
            class="mm-donut-value"
            x={cx}
            y={cy + size * 0.06}
            text-anchor="middle"
            dominant-baseline="middle"
            style={{ fontSize: `${Math.round(size * 0.13)}px` }}
          >
            {centerValue}
          </text>
        )}
        {centerNote && (
          <text class="mm-donut-note" x={cx} y={cy + size * 0.18} text-anchor="middle" dominant-baseline="middle">
            {centerNote}
          </text>
        )}
      </svg>
      <div class="mm-sr-only" role="status" aria-live="polite">
        {activeArc ? `${activeArc.s.label}: ${valueFormat(activeArc.s.value)}, ${pctFmt.format(activeArc.share)}` : ''}
      </div>
      {legend && arcs.length > 0 && (
        <ul class="mm-donut-legend">
          {arcs.map((a, i) => (
            <li
              key={a.s.key}
              class={`mm-donut-legend-item${i === activeIdx ? ' is-active' : ''}${onSliceClick ? ' mm-clickable' : ''}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onClick={() => onSliceClick?.(a.s.key)}
            >
              <Swatch color={a.color} />
              <span class="mm-donut-legend-label" title={a.s.label}>
                {a.s.label}
              </span>
              <span class="mm-donut-legend-value">{valueFormat(a.s.value)}</span>
              <span class="mm-donut-legend-share">{pctFmt.format(a.share)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
