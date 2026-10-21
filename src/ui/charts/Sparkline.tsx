import { fmt } from './common';
import { formatNumber, isFiniteNumber, linearScale } from './scale';

export interface SparklineProps {
  /** Non-finite values are skipped. */
  values: number[];
  width?: number;
  height?: number;
  /** Line color (ignored when `trendColor` is set). Default `var(--accent)`. */
  color?: string;
  /** Color by overall direction: up `--pos`, down `--neg`, flat `--text-muted`. */
  trendColor?: boolean;
  /** Use `--neg` for upward trends (e.g. rest time, body fat). */
  invertTrend?: boolean;
  /** Dot on the last value. */
  dot?: boolean;
  area?: boolean;
  valueFormat?: (n: number) => string;
  ariaLabel?: string;
  class?: string;
}

export function Sparkline(props: SparklineProps) {
  const { width = 96, height = 28, dot = true, area = false, trendColor = false, invertTrend = false } = props;
  const values = props.values.filter(isFiniteNumber);
  const format = props.valueFormat ?? formatNumber;
  const pad = dot ? 3 : 1.5;

  let color = props.color ?? 'var(--accent)';
  if (trendColor && values.length > 1) {
    const delta = values[values.length - 1] - values[0];
    const up = invertTrend ? delta < 0 : delta > 0;
    const down = invertTrend ? delta > 0 : delta < 0;
    color = up ? 'var(--pos)' : down ? 'var(--neg)' : 'var(--text-muted)';
  }

  const label =
    props.ariaLabel ??
    (values.length === 0
      ? 'No data'
      : `Trend of ${values.length} value${values.length === 1 ? '' : 's'} from ${format(values[0])} to ${format(values[values.length - 1])}`);

  if (values.length === 0) {
    return (
      <svg class={`mm-sparkline${props.class ? ` ${props.class}` : ''}`} width={width} height={height} role="img" aria-label={label}>
        <line x1={pad} x2={width - pad} y1={height / 2} y2={height / 2} class="mm-sparkline-empty" />
      </svg>
    );
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const xs = linearScale([0, Math.max(1, values.length - 1)], [pad, width - pad]);
  const ys = linearScale([lo, hi], [height - pad, pad]);
  const pts = values.map((v, i) => [values.length === 1 ? width / 2 : xs(i), ys(v)] as const);
  const line = `M${pts.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join('L')}`;
  const lastPt = pts[pts.length - 1];
  const areaPath =
    area && pts.length > 1
      ? `${line}L${fmt(lastPt[0])},${fmt(height)}L${fmt(pts[0][0])},${fmt(height)}Z`
      : '';

  return (
    <svg
      class={`mm-sparkline${props.class ? ` ${props.class}` : ''}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      {areaPath && <path d={areaPath} fill={color} fill-opacity={0.1} stroke="none" />}
      {pts.length > 1 && <path d={line} class="mm-sparkline-line" stroke={color} />}
      {(dot || pts.length === 1) && <circle cx={lastPt[0]} cy={lastPt[1]} r={2.25} fill={color} />}
    </svg>
  );
}
