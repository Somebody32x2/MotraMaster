import type { ComponentChildren, JSX } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import { clamp } from './scale';

/** Categorical palette, all theme tokens. */
export const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'] as const;

export function paletteColor(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

export const FONT_SIZE = 11;

/** Rough rendered width of `text` in the chart label font (tabular numerals). */
export function textWidth(text: string, fontSize = FONT_SIZE): number {
  return text.length * fontSize * 0.6;
}

/** Truncates `text` with an ellipsis so it fits roughly within `maxPx`. */
export function truncate(text: string, maxPx: number, fontSize = FONT_SIZE): string {
  const maxChars = Math.floor(maxPx / (fontSize * 0.6));
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return '…';
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/** Snaps a coordinate to the pixel grid so 1px strokes render crisply. */
export function crisp(v: number): number {
  return Math.round(v) + 0.5;
}

export function fmt(v: number): string {
  return Number.isFinite(v) ? (Math.round(v * 10) / 10).toString() : '0';
}

/** Tracks the content width of an element via ResizeObserver. */
export function useWidth(ref: { readonly current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = Math.floor(entry.contentRect.width);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth((prev) => (prev === next ? prev : next)));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return width;
}

/**
 * Arrow-key navigation over `count` ordered items. Returns the next active
 * index for a key, or `undefined` when the key is not a navigation key.
 * `null` means "clear selection" (Escape).
 */
export function navigateIndex(key: string, active: number | null, count: number): number | null | undefined {
  if (count <= 0) return undefined;
  const last = count - 1;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return active === null ? 0 : Math.min(last, active + 1);
    case 'ArrowLeft':
    case 'ArrowUp':
      return active === null ? last : Math.max(0, active - 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'PageUp':
      return active === null ? 0 : Math.max(0, active - 10);
    case 'PageDown':
      return active === null ? last : Math.min(last, active + 10);
    case 'Escape':
      return null;
    default:
      return undefined;
  }
}

export function isActivateKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

interface TooltipProps {
  /** Anchor position in px relative to the chart wrapper. */
  x: number;
  y: number;
  /** Wrapper size, used to keep the tooltip on-screen. */
  width: number;
  height: number;
  children: ComponentChildren;
}

/** Absolutely positioned HTML tooltip; flips sides near the right edge. */
export function Tooltip({ x, y, width, height, children }: TooltipProps) {
  const flip = x > width * 0.58;
  const top = clamp(y, 16, Math.max(16, height - 16));
  const style: JSX.CSSProperties = {
    left: `${Math.round(x)}px`,
    top: `${Math.round(top)}px`,
    transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
  };
  return (
    <div class="mm-tooltip" role="status" aria-live="polite" style={style}>
      {children}
    </div>
  );
}

export function TooltipTitle({ children }: { children: ComponentChildren }) {
  return <div class="mm-tooltip-title">{children}</div>;
}

interface TooltipRowProps {
  color?: string;
  label: ComponentChildren;
  value?: ComponentChildren;
  note?: ComponentChildren;
  shape?: 'line' | 'dot' | 'square';
  dashed?: boolean;
}

export function TooltipRow({ color, label, value, note, shape = 'square', dashed }: TooltipRowProps) {
  return (
    <div class="mm-tooltip-row">
      {color ? <Swatch color={color} shape={shape} dashed={dashed} /> : <span class="mm-swatch-spacer" />}
      <span class="mm-tooltip-label">{label}</span>
      {value !== undefined && <span class="mm-tooltip-value">{value}</span>}
      {note !== undefined && note !== null && note !== '' && <span class="mm-tooltip-note">{note}</span>}
    </div>
  );
}

export function Swatch({ color, shape = 'square', dashed }: { color: string; shape?: 'line' | 'dot' | 'square'; dashed?: boolean }) {
  const style: JSX.CSSProperties =
    shape === 'line'
      ? { borderTopColor: color, borderTopStyle: dashed ? 'dashed' : 'solid' }
      : { background: color };
  return <span class={`mm-swatch mm-swatch-${shape}`} style={style} aria-hidden="true" />;
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  shape?: 'line' | 'dot' | 'square';
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul class="mm-legend">
      {items.map((it) => (
        <li key={it.key} class="mm-legend-item">
          <Swatch color={it.color} shape={it.shape ?? 'square'} dashed={it.dashed} />
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyChart({ height, text }: { height: number; text: string }) {
  return (
    <div class="mm-chart-empty" style={{ height: `${height}px` }}>
      {text}
    </div>
  );
}

export const DEFAULT_EMPTY_TEXT = 'No data for this period';
