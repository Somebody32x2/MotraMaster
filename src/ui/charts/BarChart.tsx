import type { JSX } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_EMPTY_TEXT,
  EmptyChart,
  Legend,
  Tooltip,
  TooltipRow,
  TooltipTitle,
  crisp,
  fmt,
  isActivateKey,
  navigateIndex,
  paletteColor,
  textWidth,
  truncate,
  useWidth,
} from './common';
import { clamp, formatNumber, isFiniteNumber, linearScale, makeTickFormat, niceTicks } from './scale';

export interface BarDatum {
  key: string;
  label: string;
  /** One value, or one value per stack segment (see `stackLabels`). */
  values: number[] | number;
  /** Bar color for single-value bars; stacked segments use the palette. */
  color?: string;
  /** Navigates here on click / Enter (ignored when `onBarClick` is given). */
  href?: string;
}

export interface BarTargetBand {
  lo: number;
  hi: number;
  label?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  orientation?: 'vertical' | 'horizontal';
  /** Names of the stack segments; shown in legend and tooltip. */
  stackLabels?: string[];
  /** Shaded guideline range on the value axis (e.g. 10–20 weekly sets). */
  targetBand?: BarTargetBand;
  valueFormat?: (n: number) => string;
  /** Category axis label from the bar key (e.g. ISO week → "Oct 19"). Defaults to `label`. */
  xFormat?: (key: string) => string;
  /** Vertical mode only; horizontal mode sizes itself by row count. */
  height?: number;
  /** Print the total at the end of each bar. Defaults to true for horizontal bars. */
  showValues?: boolean;
  onBarClick?: (key: string) => void;
  emptyText?: string;
  ariaLabel?: string;
  class?: string;
}

interface Segment {
  stack: number;
  value: number;
  from: number;
  to: number;
  color: string;
  /** Outermost segment in its direction gets the rounded end. */
  cap: boolean;
}

interface Row {
  datum: BarDatum;
  values: number[];
  total: number;
  segments: Segment[];
}

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Rectangle path with the two corners on `side` rounded. */
function roundedBar(x0: number, y0: number, x1: number, y1: number, radius: number, side: Side | null): string {
  const w = x1 - x0;
  const h = y1 - y0;
  if (!(w > 0) || !(h > 0)) return '';
  if (!side || radius <= 0) return `M${fmt(x0)},${fmt(y0)}H${fmt(x1)}V${fmt(y1)}H${fmt(x0)}Z`;
  const vertical = side === 'top' || side === 'bottom';
  const r = Math.min(radius, vertical ? w / 2 : h / 2, vertical ? h : w);
  const [a, b, c, d, R] = [fmt(x0), fmt(y0), fmt(x1), fmt(y1), fmt(r)];
  switch (side) {
    case 'top':
      return `M${a},${d}V${fmt(y0 + r)}A${R},${R} 0 0 1 ${fmt(x0 + r)},${b}H${fmt(x1 - r)}A${R},${R} 0 0 1 ${c},${fmt(y0 + r)}V${d}Z`;
    case 'bottom':
      return `M${a},${b}H${c}V${fmt(y1 - r)}A${R},${R} 0 0 1 ${fmt(x1 - r)},${d}H${fmt(x0 + r)}A${R},${R} 0 0 1 ${a},${fmt(y1 - r)}Z`;
    case 'right':
      return `M${a},${b}H${fmt(x1 - r)}A${R},${R} 0 0 1 ${c},${fmt(y0 + r)}V${fmt(y1 - r)}A${R},${R} 0 0 1 ${fmt(x1 - r)},${d}H${a}Z`;
    case 'left':
      return `M${c},${b}V${d}H${fmt(x0 + r)}A${R},${R} 0 0 1 ${a},${fmt(y1 - r)}V${fmt(y0 + r)}A${R},${R} 0 0 1 ${fmt(x0 + r)},${b}Z`;
  }
}

function buildRows(data: BarDatum[]): Row[] {
  return data.map((datum) => {
    const raw = Array.isArray(datum.values) ? datum.values : [datum.values];
    const values = raw.map((v) => (isFiniteNumber(v) ? v : 0));
    const stacked = values.length > 1;
    const segments: Segment[] = [];
    let pos = 0;
    let neg = 0;
    values.forEach((value, stack) => {
      if (value === 0) return;
      const color = stacked ? paletteColor(stack) : (datum.color ?? paletteColor(0));
      if (value > 0) {
        segments.push({ stack, value, from: pos, to: pos + value, color, cap: false });
        pos += value;
      } else {
        segments.push({ stack, value, from: neg, to: neg + value, color, cap: false });
        neg += value;
      }
    });
    const lastPos = segments.findLast((s) => s.value > 0);
    const lastNeg = segments.findLast((s) => s.value < 0);
    if (lastPos) lastPos.cap = true;
    if (lastNeg) lastNeg.cap = true;
    return { datum, values, total: pos + neg, segments };
  });
}

const ROW_H = 28;
const BAR_RADIUS = 3;

export function BarChart(props: BarChartProps) {
  const {
    data,
    orientation = 'vertical',
    stackLabels,
    targetBand,
    onBarClick,
    emptyText = DEFAULT_EMPTY_TEXT,
  } = props;
  const horizontal = orientation === 'horizontal';
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState<number | null>(null);
  const rows = useMemo(() => buildRows(data), [data]);

  const band =
    targetBand && isFiniteNumber(targetBand.lo) && isFiniteNumber(targetBand.hi)
      ? { lo: Math.min(targetBand.lo, targetBand.hi), hi: Math.max(targetBand.lo, targetBand.hi), label: targetBand.label }
      : null;
  const stackCount = rows.reduce((n, r) => Math.max(n, r.values.length), 0);
  const height = horizontal ? 10 + (band?.label ? 16 : 0) + Math.max(1, rows.length) * ROW_H + 6 : (props.height ?? 220);
  const legend =
    stackLabels && stackLabels.length > 1 ? (
      <Legend items={stackLabels.map((label, i) => ({ key: `s${i}`, label, color: paletteColor(i) }))} />
    ) : null;

  let body: JSX.Element;
  if (rows.length === 0) body = <EmptyChart height={props.height ?? 220} text={emptyText} />;
  else if (width > 0) body = renderChart();
  else body = <div style={{ height: `${height}px` }} />;

  return (
    <div class={`mm-chart mm-bar-chart${props.class ? ` ${props.class}` : ''}`}>
      {legend}
      <div class="mm-chart-canvas" ref={wrapRef}>
        {body}
      </div>
    </div>
  );

  function renderChart(): JSX.Element {
    const valueFormat = props.valueFormat ?? formatNumber;
    const showValues = props.showValues ?? horizontal;
    let lo = 0;
    let hi = 0;
    for (const r of rows) {
      for (const s of r.segments) {
        lo = Math.min(lo, s.to);
        hi = Math.max(hi, s.to);
      }
    }
    if (band) {
      lo = Math.min(lo, band.lo);
      hi = Math.max(hi, band.hi);
    }

    const n = rows.length;
    const activeIdx = active !== null && active < n ? active : null;
    const activeRow = activeIdx !== null ? rows[activeIdx] : null;

    const activate = (idx: number) => {
      const datum = rows[idx]?.datum;
      if (!datum) return;
      if (onBarClick) onBarClick(datum.key);
      else if (datum.href) window.location.assign(datum.href);
    };
    const clickable = !!onBarClick || rows.some((r) => !!r.datum.href);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isActivateKey(e.key)) {
        if (activeIdx !== null && clickable) {
          e.preventDefault();
          activate(activeIdx);
        }
        return;
      }
      const next = navigateIndex(e.key, activeIdx, n);
      if (next === undefined) return;
      e.preventDefault();
      setActive(next);
    };

    const totals = rows.map((r) => r.total);
    const summary =
      props.ariaLabel ??
      `Bar chart, ${n} bar${n === 1 ? '' : 's'}. ${rows
        .slice(0, 24)
        .map((r) => `${r.datum.label}: ${valueFormat(r.total)}`)
        .join('; ')}${n > 24 ? `; and ${n - 24} more` : ''}. Use arrow keys to inspect values.`;

    let svgBody: JSX.Element;
    let anchor = { x: 0, y: 0 };
    let locate: (mx: number, my: number) => number | null;

    if (horizontal) {
      const maxLabel = Math.max(...rows.map((r) => textWidth(r.datum.label)));
      const labelW = Math.min(Math.ceil(maxLabel) + 10, Math.max(60, width * 0.38), 200);
      const valueLabels = totals.map((t) => valueFormat(t));
      const valueW = showValues ? Math.max(...valueLabels.map((l) => textWidth(l))) + 10 : 6;
      const plotT = 10 + (band?.label ? 16 : 0);
      const plotL = labelW;
      const plotR = Math.max(plotL + 20, width - valueW);
      const xs = linearScale([lo, hi === lo ? lo + 1 : hi], [plotL, plotR]);
      const zero = xs(0);
      const thickness = Math.min(16, ROW_H * 0.6);
      const plotB = plotT + n * ROW_H;

      locate = (_mx, my) => {
        const i = Math.floor((my - plotT) / ROW_H);
        return i >= 0 && i < n ? i : null;
      };
      if (activeIdx !== null) {
        anchor = { x: Math.max(zero, xs(Math.max(0, activeRow!.total))), y: plotT + activeIdx * ROW_H + ROW_H / 2 };
      }

      svgBody = (
        <>
          {band && (
            <g class="mm-target-band">
              <rect x={xs(band.lo)} y={plotT} width={Math.max(1, xs(band.hi) - xs(band.lo))} height={plotB - plotT} />
              <line class="mm-target-edge" x1={crisp(xs(band.lo))} x2={crisp(xs(band.lo))} y1={plotT} y2={plotB} />
              <line class="mm-target-edge" x1={crisp(xs(band.hi))} x2={crisp(xs(band.hi))} y1={plotT} y2={plotB} />
              {band.label && (
                <text x={(xs(band.lo) + xs(band.hi)) / 2} y={plotT - 6} text-anchor="middle" class="mm-target-label">
                  {band.label}
                </text>
              )}
            </g>
          )}
          {activeIdx !== null && (
            <rect class="mm-bar-hover-bg" x={0} y={plotT + activeIdx * ROW_H} width={width} height={ROW_H} rx={4} />
          )}
          <g class={`mm-bars${activeIdx !== null ? ' has-active' : ''}`}>
            {rows.map((r, i) => {
              const cy = plotT + i * ROW_H + ROW_H / 2;
              const y0 = cy - thickness / 2;
              const y1 = cy + thickness / 2;
              const label = truncate(r.datum.label, labelW - 10);
              const valueX = r.total < 0 ? xs(r.total) - 6 : xs(Math.max(0, ...r.segments.map((s) => s.to))) + 6;
              const bars = (
                <g class={`mm-bar${i === activeIdx ? ' is-active' : ''}`}>
                  {r.segments.map((s) => {
                    const a = xs(Math.min(s.from, s.to));
                    const b = xs(Math.max(s.from, s.to));
                    return (
                      <path
                        key={s.stack}
                        d={roundedBar(a, y0, b, y1, BAR_RADIUS, s.cap ? (s.value > 0 ? 'right' : 'left') : null)}
                        fill={s.color}
                      />
                    );
                  })}
                </g>
              );
              return (
                <g key={r.datum.key}>
                  <text x={0} y={cy} dominant-baseline="middle" class="mm-bar-label">
                    {label !== r.datum.label && <title>{r.datum.label}</title>}
                    {label}
                  </text>
                  {bars}
                  {showValues && (
                    <text
                      x={valueX}
                      y={cy}
                      dominant-baseline="middle"
                      text-anchor={r.total < 0 ? 'end' : 'start'}
                      class="mm-bar-value"
                    >
                      {valueLabels[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <line class="mm-baseline" x1={crisp(zero)} x2={crisp(zero)} y1={plotT} y2={plotB} shape-rendering="crispEdges" />
        </>
      );
    } else {
      const plotT = 10 + (band?.label ? 4 : 0);
      const plotB = Math.max(plotT + 20, height - 24);
      const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi, Math.max(2, Math.floor((plotB - plotT) / 42)));
      const dLo = ticks[0];
      const dHi = ticks[ticks.length - 1];
      const tickFormat = props.valueFormat ?? makeTickFormat(ticks);
      const tickLabels = ticks.map(tickFormat);
      const plotL = Math.max(28, Math.ceil(Math.max(...tickLabels.map((l) => textWidth(l)))) + 12);
      const plotR = Math.max(plotL + 20, width - 8);
      const ys = linearScale([dLo, dHi], [plotB, plotT]);
      const zero = ys(clamp(0, dLo, dHi));
      const slot = (plotR - plotL) / n;
      const barW = Math.max(1, Math.min(48, slot * 0.68));
      const catLabels = rows.map((r) => (props.xFormat ? props.xFormat(r.datum.key) : r.datum.label));
      const widest = Math.max(...catLabels.map((l) => textWidth(l)));
      const every = Math.max(1, Math.ceil((Math.min(widest, 120) + 8) / slot));
      const labelRoom = slot * every - 6;

      locate = (mx) => {
        const i = Math.floor((mx - plotL) / slot);
        return i >= 0 && i < n ? i : null;
      };
      if (activeIdx !== null) {
        const top = Math.max(0, ...activeRow!.segments.map((s) => s.to));
        anchor = { x: plotL + (activeIdx + 0.5) * slot, y: ys(top) };
      }

      svgBody = (
        <>
          <g class="mm-grid" shape-rendering="crispEdges">
            {ticks.map((t) => (
              <line key={t} x1={plotL} x2={plotR} y1={crisp(ys(t))} y2={crisp(ys(t))} />
            ))}
          </g>
          <g class="mm-axis mm-axis-y">
            {ticks.map((t, i) => (
              <text key={t} x={plotL - 8} y={ys(t)} text-anchor="end" dominant-baseline="middle">
                {tickLabels[i]}
              </text>
            ))}
          </g>
          {band && (
            <g class="mm-target-band">
              <rect x={plotL} y={ys(band.hi)} width={plotR - plotL} height={Math.max(1, ys(band.lo) - ys(band.hi))} />
              <line class="mm-target-edge" x1={plotL} x2={plotR} y1={crisp(ys(band.lo))} y2={crisp(ys(band.lo))} />
              <line class="mm-target-edge" x1={plotL} x2={plotR} y1={crisp(ys(band.hi))} y2={crisp(ys(band.hi))} />
              {band.label && (
                <text x={plotR - 4} y={ys(band.hi) - 5} text-anchor="end" class="mm-target-label">
                  {band.label}
                </text>
              )}
            </g>
          )}
          {activeIdx !== null && (
            <rect
              class="mm-bar-hover-bg"
              x={plotL + activeIdx * slot + 1}
              y={plotT}
              width={Math.max(1, slot - 2)}
              height={plotB - plotT}
              rx={4}
            />
          )}
          <g class={`mm-bars${activeIdx !== null ? ' has-active' : ''}`}>
            {rows.map((r, i) => {
              const cx = plotL + (i + 0.5) * slot;
              const x0 = cx - barW / 2;
              const x1 = cx + barW / 2;
              const bars = (
                <g class={`mm-bar${i === activeIdx ? ' is-active' : ''}`}>
                  {r.segments.map((s) => {
                    const top = ys(Math.max(s.from, s.to));
                    const bottom = ys(Math.min(s.from, s.to));
                    return (
                      <path
                        key={s.stack}
                        d={roundedBar(x0, top, x1, bottom, BAR_RADIUS, s.cap ? (s.value > 0 ? 'top' : 'bottom') : null)}
                        fill={s.color}
                      />
                    );
                  })}
                </g>
              );
              return (
                <g key={r.datum.key}>
                  {bars}
                  {showValues && r.total !== 0 && (
                    <text
                      x={cx}
                      y={r.total < 0 ? ys(r.total) + 12 : ys(Math.max(0, ...r.segments.map((s) => s.to))) - 5}
                      text-anchor="middle"
                      class="mm-bar-value"
                    >
                      {valueFormat(r.total)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <line class="mm-baseline" x1={plotL} x2={plotR} y1={crisp(zero)} y2={crisp(zero)} shape-rendering="crispEdges" />
          <g class="mm-axis mm-axis-x">
            {rows.map((r, i) => {
              if (i % every !== 0) return null;
              const full = catLabels[i];
              const label = truncate(full, labelRoom);
              return (
                <text key={r.datum.key} x={plotL + (i + 0.5) * slot} y={plotB + 16} text-anchor="middle">
                  {label !== full && <title>{full}</title>}
                  {label}
                </text>
              );
            })}
          </g>
        </>
      );
    }

    const fromPointer = (e: PointerEvent | MouseEvent): number | null => {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      return locate(e.clientX - rect.left, e.clientY - rect.top);
    };

    let tooltip: JSX.Element | null = null;
    if (activeRow) {
      const multi = stackCount > 1;
      tooltip = (
        <Tooltip x={anchor.x} y={anchor.y} width={width} height={height}>
          <TooltipTitle>{activeRow.datum.label}</TooltipTitle>
          {multi ? (
            <>
              {activeRow.values.map((v, i) => (
                <TooltipRow
                  key={i}
                  color={paletteColor(i)}
                  label={stackLabels?.[i] ?? `Series ${i + 1}`}
                  value={valueFormat(v)}
                />
              ))}
              <TooltipRow label="Total" value={valueFormat(activeRow.total)} />
            </>
          ) : (
            <TooltipRow
              color={activeRow.datum.color ?? paletteColor(0)}
              label={stackLabels?.[0] ?? 'Value'}
              value={valueFormat(activeRow.total)}
            />
          )}
          {band && (
            <TooltipRow
              label={band.label ?? 'Target'}
              value={`${valueFormat(band.lo)} – ${valueFormat(band.hi)}`}
            />
          )}
        </Tooltip>
      );
    }

    return (
      <>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={summary}
          tabIndex={0}
          class={clickable ? 'mm-clickable' : undefined}
          onPointerMove={(e) => setActive(fromPointer(e))}
          onPointerDown={(e) => setActive(fromPointer(e))}
          onPointerLeave={() => setActive(null)}
          onClick={(e) => {
            const idx = fromPointer(e);
            if (idx !== null) activate(idx);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => (a === null ? 0 : a))}
          onBlur={() => setActive(null)}
        >
          {svgBody}
        </svg>
        {tooltip}
      </>
    );
  }
}
