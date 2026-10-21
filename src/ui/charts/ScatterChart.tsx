import type { JSX } from 'preact';
import { useId, useMemo, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_EMPTY_TEXT,
  EmptyChart,
  Tooltip,
  TooltipRow,
  TooltipTitle,
  crisp,
  fmt,
  isActivateKey,
  navigateIndex,
  textWidth,
  useWidth,
} from './common';
import { formatNumber, isFiniteNumber, linearScale, makeTickFormat, niceTicks } from './scale';

export interface ScatterPoint {
  x: number;
  y: number;
  /** Radius in px (default 3.5, clamped to 1.5–12). */
  r?: number;
  color?: string;
  label?: string;
}

export interface ScatterChartProps {
  points: ScatterPoint[];
  /** Fitted curve drawn over the points (sorted by x internally). */
  curve?: { x: number; y: number }[];
  curveLabel?: string;
  height?: number;
  xFormat?: (n: number) => string;
  yFormat?: (n: number) => string;
  /** Axis titles. */
  xLabel?: string;
  yLabel?: string;
  /** Include 0 on the value axis. */
  zeroBased?: boolean;
  onPointClick?: (point: ScatterPoint, index: number) => void;
  emptyText?: string;
  ariaLabel?: string;
  class?: string;
}

interface Item {
  p: ScatterPoint;
  /** Index into `props.points`. */
  index: number;
}

const HIT_RADIUS = 28;

export function ScatterChart(props: ScatterChartProps) {
  const { points, curve, height = 260, onPointClick, emptyText = DEFAULT_EMPTY_TEXT } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState<number | null>(null);
  const clipId = `mm-scatter-clip-${useId()}`;

  /** Valid points sorted by x (keyboard order). */
  const items = useMemo<Item[]>(
    () =>
      points
        .map((p, index) => ({ p, index }))
        .filter(({ p }) => isFiniteNumber(p.x) && isFiniteNumber(p.y))
        .sort((a, b) => a.p.x - b.p.x || a.p.y - b.p.y),
    [points],
  );
  const curvePts = useMemo(
    () => (curve ?? []).filter((c) => isFiniteNumber(c.x) && isFiniteNumber(c.y)).sort((a, b) => a.x - b.x),
    [curve],
  );

  let body: JSX.Element;
  if (items.length === 0) body = <EmptyChart height={height} text={emptyText} />;
  else if (width > 0) body = renderChart();
  else body = <div style={{ height: `${height}px` }} />;

  return (
    <div class={`mm-chart mm-scatter-chart${props.class ? ` ${props.class}` : ''}`}>
      <div class="mm-chart-canvas" ref={wrapRef}>
        {body}
      </div>
    </div>
  );

  function renderChart(): JSX.Element {
    const xFormat = props.xFormat ?? formatNumber;
    const yFormat = props.yFormat ?? formatNumber;

    let xLo = Infinity;
    let xHi = -Infinity;
    let yLo = Infinity;
    let yHi = -Infinity;
    for (const { x, y } of [...items.map((i) => i.p), ...curvePts]) {
      if (x < xLo) xLo = x;
      if (x > xHi) xHi = x;
      if (y < yLo) yLo = y;
      if (y > yHi) yHi = y;
    }
    if (props.zeroBased) {
      yLo = Math.min(yLo, 0);
      yHi = Math.max(yHi, 0);
    }

    const plotT = props.yLabel ? 24 : 10;
    const plotB = Math.max(plotT + 20, height - 24 - (props.xLabel ? 16 : 0));
    const yTicks = niceTicks(yLo, yHi, Math.max(2, Math.floor((plotB - plotT) / 42)));
    const yTickFormat = props.yFormat ?? makeTickFormat(yTicks);
    const yTickLabels = yTicks.map(yTickFormat);
    const plotL = Math.max(28, Math.ceil(Math.max(...yTickLabels.map((l) => textWidth(l)))) + 12);
    const plotR = Math.max(plotL + 20, width - 14);
    const xTicks = niceTicks(xLo, xHi, Math.max(2, Math.floor((plotR - plotL) / 80)));
    const xTickFormat = props.xFormat ?? makeTickFormat(xTicks);

    const xs = linearScale([xTicks[0], xTicks[xTicks.length - 1]], [plotL, plotR]);
    const ys = linearScale([yTicks[0], yTicks[yTicks.length - 1]], [plotB, plotT]);
    const pos = items.map(({ p }) => ({
      cx: xs(p.x),
      cy: ys(p.y),
      r: Math.min(12, Math.max(1.5, isFiniteNumber(p.r) ? p.r : 3.5)),
    }));

    const activeIdx = active !== null && active < items.length ? active : null;
    const activeItem = activeIdx !== null ? items[activeIdx] : null;

    const fromPointer = (e: PointerEvent | MouseEvent): number | null => {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best: number | null = null;
      let bestD = HIT_RADIUS * HIT_RADIUS;
      pos.forEach(({ cx, cy }, i) => {
        const d = (cx - mx) ** 2 + (cy - my) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isActivateKey(e.key)) {
        if (activeItem && onPointClick) {
          e.preventDefault();
          onPointClick(activeItem.p, activeItem.index);
        }
        return;
      }
      const next = navigateIndex(e.key, activeIdx, items.length);
      if (next === undefined) return;
      e.preventDefault();
      setActive(next);
    };

    const curvePath =
      curvePts.length > 1 ? `M${curvePts.map((c) => `${fmt(xs(c.x))},${fmt(ys(c.y))}`).join('L')}` : '';

    const summary =
      props.ariaLabel ??
      `Scatter chart of ${items.length} point${items.length === 1 ? '' : 's'}${props.xLabel ? `, ${props.xLabel}` : ''} from ${xFormat(xLo)} to ${xFormat(xHi)}${props.yLabel ? `, ${props.yLabel}` : ''} from ${yFormat(yLo)} to ${yFormat(yHi)}${curvePath ? `, with ${props.curveLabel ?? 'fitted curve'}` : ''}. Use arrow keys to inspect points.`;

    let tooltip: JSX.Element | null = null;
    if (activeItem && activeIdx !== null) {
      const { p } = activeItem;
      tooltip = (
        <Tooltip x={pos[activeIdx].cx} y={pos[activeIdx].cy} width={width} height={height}>
          {p.label && <TooltipTitle>{p.label}</TooltipTitle>}
          <TooltipRow label={props.xLabel ?? 'x'} value={xFormat(p.x)} />
          <TooltipRow label={props.yLabel ?? 'y'} value={yFormat(p.y)} />
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
          class={onPointClick ? 'mm-clickable' : undefined}
          onPointerMove={(e) => setActive(fromPointer(e))}
          onPointerDown={(e) => setActive(fromPointer(e))}
          onPointerLeave={() => setActive(null)}
          onClick={(e) => {
            const idx = fromPointer(e);
            if (idx !== null && onPointClick) onPointClick(items[idx].p, items[idx].index);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => (a === null ? 0 : a))}
          onBlur={() => setActive(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={plotL - 12} y={plotT - 12} width={plotR - plotL + 24} height={plotB - plotT + 24} />
            </clipPath>
          </defs>
          <g class="mm-grid" shape-rendering="crispEdges">
            {yTicks.map((t) => (
              <line key={t} x1={plotL} x2={plotR} y1={crisp(ys(t))} y2={crisp(ys(t))} />
            ))}
          </g>
          <g class="mm-axis mm-axis-y">
            {yTicks.map((t, i) => (
              <text key={t} x={plotL - 8} y={ys(t)} text-anchor="end" dominant-baseline="middle">
                {yTickLabels[i]}
              </text>
            ))}
            {props.yLabel && (
              <text class="mm-axis-title" x={0} y={10}>
                {props.yLabel}
              </text>
            )}
          </g>
          <g class="mm-axis mm-axis-x">
            {xTicks.map((t) => (
              <text key={t} x={xs(t)} y={plotB + 16} text-anchor="middle">
                {xTickFormat(t)}
              </text>
            ))}
            {props.xLabel && (
              <text class="mm-axis-title" x={plotR} y={height - 4} text-anchor="end">
                {props.xLabel}
              </text>
            )}
          </g>
          <g clip-path={`url(#${clipId})`}>
            {items.map(({ p, index }, i) => (
              <circle
                key={index}
                class={`mm-scatter-dot${i === activeIdx ? ' is-active' : ''}`}
                cx={pos[i].cx}
                cy={pos[i].cy}
                r={pos[i].r}
                fill={p.color ?? 'var(--c1)'}
                stroke={p.color ?? 'var(--c1)'}
              />
            ))}
            {curvePath && <path class="mm-curve" d={curvePath} />}
          </g>
          {activeIdx !== null && (
            <circle
              class="mm-marker-ring"
              cx={pos[activeIdx].cx}
              cy={pos[activeIdx].cy}
              r={pos[activeIdx].r + 3}
              pointer-events="none"
            />
          )}
        </svg>
        {tooltip}
      </>
    );
  }
}
