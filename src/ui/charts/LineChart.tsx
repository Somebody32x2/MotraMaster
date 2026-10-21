import type { JSX } from 'preact';
import { useId, useMemo, useRef, useState } from 'preact/hooks';
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
  useWidth,
} from './common';
import {
  DAY_MS,
  clamp,
  formatDate,
  formatNumber,
  isFiniteNumber,
  linearScale,
  formatTicks,
  niceTicks,
  timeTicks,
  toNumber,
} from './scale';

export interface LinePoint {
  x: Date | number;
  /** `null` (or a non-finite number) breaks the line. */
  y: number | null;
  /** Extra context shown under the value in the tooltip (e.g. "135 lb × 10"). */
  label?: string;
}

export interface LineSeries {
  id: string;
  label: string;
  /** CSS color; defaults to the categorical palette (`var(--cN)`). */
  color?: string;
  points: LinePoint[];
  dashed?: boolean;
  /** Subtle fill under the line. */
  area?: boolean;
  /** Draw a dot on every point (isolated points are always drawn). */
  showPoints?: boolean;
}

export interface LineMarker {
  x: Date | number;
  label: string;
}

export interface LineBand {
  x: Date | number;
  lo: number;
  hi: number;
}

export interface LinePointEvent {
  seriesId: string;
  /** Index of the point within `series.points`. */
  index: number;
  x: Date | number;
  y: number;
  label?: string;
}

export interface LineChartProps {
  series: LineSeries[];
  height?: number;
  /** Tooltip value format (axis ticks use a precision-matched format unless given). */
  yFormat?: (n: number) => string;
  /** Tooltip x format; also axis ticks for numeric x. Time axes use short calendar labels. */
  xFormat?: (x: Date | number) => string;
  /** Fixed lower bound of the value axis. */
  yMin?: number;
  /** Include 0 in the value axis. */
  zeroBased?: boolean;
  /** Vertical markers (e.g. PRs); matching series points are ringed. */
  markers?: LineMarker[];
  /** Shaded lo–hi range across x. */
  band?: LineBand[];
  onPointClick?: (point: LinePointEvent) => void;
  emptyText?: string;
  /** Overrides the generated accessible summary. */
  ariaLabel?: string;
  class?: string;
}

interface NormPoint {
  x: number;
  y: number | null;
  index: number;
  src: LinePoint;
}

interface NormSeries {
  id: string;
  label: string;
  color: string;
  dashed: boolean;
  area: boolean;
  showPoints: boolean;
  points: NormPoint[];
  byX: Map<number, NormPoint>;
}

interface Model {
  isTime: boolean;
  series: NormSeries[];
  /** Sorted unique x values that carry at least one finite y. */
  slots: number[];
  yLo: number;
  yHi: number;
  xLo: number;
  xHi: number;
  band: { x: number; lo: number; hi: number }[];
  bandByX: Map<number, { lo: number; hi: number }>;
  markers: { x: number; label: string }[];
}

function buildModel(series: LineSeries[], band: LineBand[] | undefined, markers: LineMarker[] | undefined): Model | null {
  let isTime = false;
  const slotSet = new Set<number>();
  let yLo = Infinity;
  let yHi = -Infinity;
  const norm: NormSeries[] = series.map((s, si) => {
    const points: NormPoint[] = [];
    s.points.forEach((p, index) => {
      if (p.x instanceof Date) isTime = true;
      const x = toNumber(p.x);
      if (!isFiniteNumber(x)) return;
      const y = isFiniteNumber(p.y) ? p.y : null;
      points.push({ x, y, index, src: p });
      if (y !== null) {
        slotSet.add(x);
        if (y < yLo) yLo = y;
        if (y > yHi) yHi = y;
      }
    });
    points.sort((a, b) => a.x - b.x);
    const byX = new Map<number, NormPoint>();
    for (const p of points) if (p.y !== null) byX.set(p.x, p);
    return {
      id: s.id,
      label: s.label,
      color: s.color ?? paletteColor(si),
      dashed: !!s.dashed,
      area: !!s.area,
      showPoints: !!s.showPoints,
      points,
      byX,
    };
  });
  if (slotSet.size === 0) return null;
  const slots = [...slotSet].sort((a, b) => a - b);
  let xLo = slots[0];
  let xHi = slots[slots.length - 1];

  const normBand: Model['band'] = [];
  const bandByX = new Map<number, { lo: number; hi: number }>();
  for (const b of band ?? []) {
    if (b.x instanceof Date) isTime = true;
    const x = toNumber(b.x);
    if (!isFiniteNumber(x) || !isFiniteNumber(b.lo) || !isFiniteNumber(b.hi)) continue;
    const lo = Math.min(b.lo, b.hi);
    const hi = Math.max(b.lo, b.hi);
    normBand.push({ x, lo, hi });
    bandByX.set(x, { lo, hi });
    if (lo < yLo) yLo = lo;
    if (hi > yHi) yHi = hi;
    if (x < xLo) xLo = x;
    if (x > xHi) xHi = x;
  }
  normBand.sort((a, b) => a.x - b.x);

  const normMarkers: Model['markers'] = [];
  for (const m of markers ?? []) {
    if (m.x instanceof Date) isTime = true;
    const x = toNumber(m.x);
    if (isFiniteNumber(x)) normMarkers.push({ x, label: m.label });
  }

  if (xLo === xHi) {
    const pad = isTime ? 3 * DAY_MS : Math.abs(xLo) * 0.1 || 1;
    xLo -= pad;
    xHi += pad;
  }
  return { isTime, series: norm, slots, yLo, yHi, xLo, xHi, band: normBand, bandByX, markers: normMarkers };
}

function nearestIndex(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1] - value) <= Math.abs(sorted[lo] - value)) return lo - 1;
  return lo;
}

const MARGIN_TOP = 10;
const MARGIN_RIGHT = 14;
const MARGIN_BOTTOM = 24;

export function LineChart(props: LineChartProps) {
  const { series, height = 240, yMin, zeroBased, markers, band, onPointClick, emptyText = DEFAULT_EMPTY_TEXT } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState<number | null>(null);
  const clipId = `mm-line-clip-${useId()}`;

  const model = useMemo(() => buildModel(series, band, markers), [series, band, markers]);
  const legend =
    series.length > 1 ? (
      <Legend
        items={series.map((s, i) => ({
          key: s.id,
          label: s.label,
          color: s.color ?? paletteColor(i),
          dashed: s.dashed,
          shape: 'line' as const,
        }))}
      />
    ) : null;

  let body: JSX.Element | null = null;
  if (!model) {
    body = <EmptyChart height={height} text={emptyText} />;
  } else if (width > 0) {
    body = renderChart();
  } else {
    body = <div style={{ height: `${height}px` }} />;
  }

  return (
    <div class={`mm-chart mm-line-chart${props.class ? ` ${props.class}` : ''}`}>
      {legend}
      <div class="mm-chart-canvas" ref={wrapRef}>
        {body}
      </div>
    </div>
  );

  function renderChart(): JSX.Element {
    const m = model as Model;
    const yFormat = props.yFormat ?? formatNumber;
    const xLabel = (x: number): string =>
      props.xFormat ? props.xFormat(m.isTime ? new Date(x) : x) : m.isTime ? formatDate(x) : formatNumber(x);

    // Value axis.
    let lo = m.yLo;
    let hi = m.yHi;
    const hasYMin = isFiniteNumber(yMin);
    if (hasYMin) {
      lo = yMin;
      if (hi <= lo) hi = lo + 1;
    }
    if (zeroBased) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    const plotH0 = Math.max(40, height - MARGIN_TOP - MARGIN_BOTTOM);
    let yTicks = niceTicks(lo, hi, Math.max(2, Math.floor(plotH0 / 42)));
    if (hasYMin) yTicks = yTicks.filter((t) => t >= (yMin as number));
    const dLo = hasYMin ? (yMin as number) : yTicks[0];
    const dHi = yTicks.length ? Math.max(yTicks[yTicks.length - 1], dLo + 1e-9) : dLo + 1;
    const yTickLabels = formatTicks(yTicks, props.yFormat);
    const marginLeft = Math.max(28, Math.ceil(Math.max(0, ...yTickLabels.map((l) => textWidth(l)))) + 12);

    const plotL = marginLeft;
    const plotR = Math.max(plotL + 10, width - MARGIN_RIGHT);
    const plotT = MARGIN_TOP;
    const plotB = Math.max(plotT + 10, height - MARGIN_BOTTOM);
    const xs = linearScale([m.xLo, m.xHi], [plotL, plotR]);
    const ys = linearScale([dLo, dHi], [plotB, plotT]);
    const baseline = ys(clamp(0, dLo, dHi));

    // Time / numeric x ticks.
    const xTickCount = Math.max(2, Math.floor((plotR - plotL) / 84));
    const xTicks: { px: number; label: string }[] = m.isTime
      ? timeTicks(m.xLo, m.xHi, xTickCount).map((t) => ({ px: xs(t.value.getTime()), label: t.label }))
      : niceTicks(m.xLo, m.xHi, xTickCount)
          .filter((t) => t >= m.xLo && t <= m.xHi)
          .map((t) => ({ px: xs(t), label: props.xFormat ? props.xFormat(t) : formatNumber(t) }));

    const slotPx = m.slots.map((x) => xs(x));
    const activeIdx = active !== null && active < m.slots.length ? active : null;
    const activeX = activeIdx !== null ? m.slots[activeIdx] : null;

    // Paths.
    const seriesPaths = m.series.map((s) => {
      const segments: { px: number; py: number; p: NormPoint }[][] = [];
      let cur: { px: number; py: number; p: NormPoint }[] = [];
      for (const p of s.points) {
        if (p.y === null) {
          if (cur.length) segments.push(cur);
          cur = [];
          continue;
        }
        cur.push({ px: xs(p.x), py: ys(p.y), p });
      }
      if (cur.length) segments.push(cur);
      const line = segments
        .filter((seg) => seg.length > 1)
        .map((seg) => `M${seg.map((q) => `${fmt(q.px)},${fmt(q.py)}`).join('L')}`)
        .join('');
      const area = s.area
        ? segments
            .filter((seg) => seg.length > 1)
            .map(
              (seg) =>
                `M${fmt(seg[0].px)},${fmt(baseline)}L${seg.map((q) => `${fmt(q.px)},${fmt(q.py)}`).join('L')}L${fmt(seg[seg.length - 1].px)},${fmt(baseline)}Z`,
            )
            .join('')
        : '';
      const dots = s.showPoints ? segments.flat() : segments.filter((seg) => seg.length === 1).flat();
      return { s, line, area, dots };
    });

    let bandPath = '';
    if (m.band.length > 1) {
      const top = m.band.map((b) => `${fmt(xs(b.x))},${fmt(ys(b.hi))}`);
      const bottom = [...m.band].reverse().map((b) => `${fmt(xs(b.x))},${fmt(ys(b.lo))}`);
      bandPath = `M${top.join('L')}L${bottom.join('L')}Z`;
    }
    const bandColor = m.series[0]?.color ?? 'var(--accent)';

    const markersInView = m.markers.filter((mk) => mk.x >= m.xLo && mk.x <= m.xHi);
    const markerXs = new Set(markersInView.map((mk) => mk.x));

    // Interaction.
    const pickSlot = (e: PointerEvent | MouseEvent) => {
      const svg = e.currentTarget as SVGSVGElement;
      const rect = svg.getBoundingClientRect();
      return nearestIndex(slotPx, e.clientX - rect.left);
    };
    const firstPointAt = (idx: number, preferPy?: number): { s: NormSeries; p: NormPoint } | null => {
      const x = m.slots[idx];
      let best: { s: NormSeries; p: NormPoint } | null = null;
      let bestDist = Infinity;
      for (const s of m.series) {
        const p = s.byX.get(x);
        if (!p || p.y === null) continue;
        const dist = preferPy === undefined ? 0 : Math.abs(ys(p.y) - preferPy);
        if (dist < bestDist) {
          best = { s, p };
          bestDist = dist;
          if (preferPy === undefined) break;
        }
      }
      return best;
    };
    const emit = (hit: { s: NormSeries; p: NormPoint } | null) => {
      if (!hit || !onPointClick || hit.p.y === null) return;
      onPointClick({ seriesId: hit.s.id, index: hit.p.index, x: hit.p.src.x, y: hit.p.y, label: hit.p.src.label });
    };
    const onPointerMove = (e: PointerEvent) => setActive(pickSlot(e));
    const onClick = (e: MouseEvent) => {
      if (!onPointClick) return;
      const idx = pickSlot(e);
      setActive(idx);
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      emit(firstPointAt(idx, e.clientY - rect.top));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isActivateKey(e.key)) {
        if (activeIdx !== null && onPointClick) {
          e.preventDefault();
          emit(firstPointAt(activeIdx));
        }
        return;
      }
      const next = navigateIndex(e.key, activeIdx, m.slots.length);
      if (next === undefined) return;
      e.preventDefault();
      setActive(next);
    };

    // Accessible summary.
    const summary =
      props.ariaLabel ??
      `Line chart. ${m.series
        .map((s) => {
          const vals = s.points.filter((p) => p.y !== null);
          if (!vals.length) return `${s.label}: no data`;
          const ysOnly = vals.map((p) => p.y as number);
          const first = vals[0];
          const last = vals[vals.length - 1];
          return `${s.label}: ${vals.length} point${vals.length === 1 ? '' : 's'} from ${xLabel(first.x)} to ${xLabel(last.x)}, latest ${yFormat(last.y as number)}, range ${yFormat(Math.min(...ysOnly))} to ${yFormat(Math.max(...ysOnly))}`;
        })
        .join('. ')}. Use arrow keys to inspect values.`;

    // Tooltip.
    let tooltip: JSX.Element | null = null;
    if (activeIdx !== null && activeX !== null) {
      const hits = m.series
        .map((s) => ({ s, p: s.byX.get(activeX) }))
        .filter((h): h is { s: NormSeries; p: NormPoint } => !!h.p && h.p.y !== null);
      const anchorY = hits.length ? Math.min(...hits.map((h) => ys(h.p.y as number))) : (plotT + plotB) / 2;
      const bandHere = m.bandByX.get(activeX);
      const markersHere = markersInView.filter((mk) => mk.x === activeX);
      tooltip = (
        <Tooltip x={slotPx[activeIdx]} y={anchorY} width={width} height={height}>
          <TooltipTitle>{xLabel(activeX)}</TooltipTitle>
          {hits.map((h) => (
            <TooltipRow
              key={h.s.id}
              color={h.s.color}
              shape="line"
              dashed={h.s.dashed}
              label={h.s.label}
              value={yFormat(h.p.y as number)}
              note={h.p.src.label}
            />
          ))}
          {bandHere && (
            <TooltipRow
              color={bandColor}
              label="Range"
              value={`${yFormat(bandHere.lo)} – ${yFormat(bandHere.hi)}`}
            />
          )}
          {markersHere.map((mk, i) => (
            <TooltipRow key={`mk${i}`} color="var(--accent)" shape="dot" label={mk.label} />
          ))}
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
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => (a === null ? m.slots.length - 1 : a))}
          onBlur={() => setActive(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={plotL - 6} y={plotT - 6} width={plotR - plotL + 12} height={plotB - plotT + 12} />
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
          </g>
          <g class="mm-axis mm-axis-x">
            {xTicks.map((t, i) => {
              const half = textWidth(t.label) / 2;
              const anchor = t.px + half > width ? 'end' : t.px - half < 0 ? 'start' : 'middle';
              return (
                <text key={i} x={t.px} y={plotB + 16} text-anchor={anchor}>
                  {t.label}
                </text>
              );
            })}
          </g>

          <g clip-path={`url(#${clipId})`}>
            {bandPath && <path d={bandPath} fill={bandColor} fill-opacity={0.1} stroke="none" />}
            {seriesPaths.map(({ s, area }) =>
              area ? <path key={`a-${s.id}`} d={area} fill={s.color} fill-opacity={0.1} stroke="none" /> : null,
            )}
            {markersInView.map((mk, i) => (
              <line
                key={`m${i}`}
                class="mm-marker-line"
                x1={crisp(xs(mk.x))}
                x2={crisp(xs(mk.x))}
                y1={plotT}
                y2={plotB}
              />
            ))}
            {seriesPaths.map(({ s, line }) =>
              line ? (
                <path
                  key={`l-${s.id}`}
                  class="mm-line"
                  d={line}
                  stroke={s.color}
                  stroke-dasharray={s.dashed ? '5 4' : undefined}
                />
              ) : null,
            )}
            {seriesPaths.map(({ s, dots }) =>
              dots.map((d) => (
                <circle key={`d-${s.id}-${d.p.index}`} class="mm-dot" cx={d.px} cy={d.py} r={2.75} stroke={s.color} />
              )),
            )}
            {m.series.map((s) =>
              [...markerXs].map((x) => {
                const p = s.byX.get(x);
                if (!p || p.y === null) return null;
                return <circle key={`r-${s.id}-${x}`} class="mm-marker-ring" cx={xs(x)} cy={ys(p.y)} r={4.5} />;
              }),
            )}
          </g>
          {markersInView.map((mk, i) => (
            <circle key={`mt${i}`} class="mm-marker-head" cx={xs(mk.x)} cy={plotT} r={3}>
              <title>{mk.label}</title>
            </circle>
          ))}

          {activeIdx !== null && activeX !== null && (
            <g class="mm-hover" pointer-events="none">
              <line
                class="mm-crosshair"
                x1={crisp(slotPx[activeIdx])}
                x2={crisp(slotPx[activeIdx])}
                y1={plotT}
                y2={plotB}
                shape-rendering="crispEdges"
              />
              {m.series.map((s) => {
                const p = s.byX.get(activeX);
                if (!p || p.y === null) return null;
                return <circle key={s.id} class="mm-dot-active" cx={slotPx[activeIdx]} cy={ys(p.y)} r={4} fill={s.color} />;
              })}
            </g>
          )}
        </svg>
        {tooltip}
      </>
    );
  }
}
