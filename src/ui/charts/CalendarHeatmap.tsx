import type { JSX } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { Tooltip, TooltipRow, TooltipTitle, isActivateKey, useWidth } from './common';
import { DAY_MS, clamp, dayKey, formatDate, formatDateLong, formatNumber, isFiniteNumber, startOfDay, startOfWeek } from './scale';

export interface HeatmapDay {
  date: Date;
  value: number;
  /** Tooltip line(s) describing the day, e.g. the workout title. */
  title?: string;
}

export interface CalendarHeatmapProps {
  days: HeatmapDay[];
  /** Number of week columns; defaults to as many as fit the width. */
  weeks?: number;
  /** Last day shown (default: today). */
  end?: Date;
  valueFormat?: (n: number) => string;
  /** Tooltip label for the value row. */
  valueLabel?: string;
  /** Tooltip text for days without data. */
  emptyDayText?: string;
  onDayClick?: (date: Date) => void;
  ariaLabel?: string;
  class?: string;
}

const GAP = 3;
const DAY_LABEL_W = 30;
const MONTH_LABEL_H = 18;
const BASE_CELL = 12;

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
/** Mon, Wed, Fri labels (2024-01-01 was a Monday). */
const DAY_LABELS = [0, 2, 4].map((row) => ({ row, label: weekdayFmt.format(new Date(2024, 0, 1 + row)) }));

interface DayEntry {
  value: number;
  titles: string[];
}

function levelOf(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return clamp(Math.ceil((value / max) * 4), 1, 4);
}

export function CalendarHeatmap(props: CalendarHeatmapProps) {
  const { days, valueFormat = formatNumber, valueLabel = 'Value', emptyDayText = 'No activity', onDayClick } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState<number | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry>();
    for (const d of days) {
      if (!(d.date instanceof Date) || Number.isNaN(d.date.getTime())) continue;
      const key = dayKey(d.date);
      const entry = map.get(key) ?? { value: 0, titles: [] };
      if (isFiniteNumber(d.value)) entry.value += d.value;
      if (d.title) entry.titles.push(d.title);
      map.set(key, entry);
    }
    return map;
  }, [days]);

  const endTime = props.end?.getTime();
  const end = startOfDay(endTime !== undefined && Number.isFinite(endTime) ? endTime : Date.now());

  let content: JSX.Element | null = null;
  if (width > 0) content = renderGrid();

  return (
    <div class={`mm-chart mm-heatmap${props.class ? ` ${props.class}` : ''}`}>
      <div class="mm-chart-canvas" ref={wrapRef}>
        {content ?? <div style={{ height: `${MONTH_LABEL_H + 7 * (BASE_CELL + GAP)}px` }} />}
      </div>
      <div class="mm-heatmap-legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} class={`mm-heat-swatch mm-heat-l${l}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );

  function renderGrid(): JSX.Element {
    const avail = Math.max(0, width - DAY_LABEL_W);
    let weekCount: number;
    let cell: number;
    if (props.weeks !== undefined && isFiniteNumber(props.weeks) && props.weeks >= 1) {
      weekCount = Math.floor(props.weeks);
      cell = clamp(Math.floor((avail + GAP) / weekCount) - GAP, 4, 18);
    } else {
      weekCount = Math.max(1, Math.floor((avail + GAP) / (BASE_CELL + GAP)));
      cell = clamp(Math.floor((avail + GAP) / weekCount) - GAP, 4, 16);
    }
    const pitch = cell + GAP;
    // Monday of the first column.
    const start = startOfWeek(end);
    start.setDate(start.getDate() - (weekCount - 1) * 7);
    const totalDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

    const cells: { date: Date; col: number; row: number; entry: DayEntry | undefined }[] = [];
    let max = 0;
    let activeDays = 0;
    let total = 0;
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const entry = byDay.get(dayKey(date));
      if (entry) {
        if (entry.value > max) max = entry.value;
        if (entry.value > 0) {
          activeDays++;
          total += entry.value;
        }
      }
      cells.push({ date, col: Math.floor(i / 7), row: i % 7, entry });
    }

    const months: { col: number; label: string }[] = [];
    let prevMonth = -1;
    for (let col = 0; col < weekCount; col++) {
      const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() + col * 7);
      const month = monday.getMonth();
      if (month !== prevMonth) {
        const label = month === 0 ? String(monday.getFullYear()) : monthFmt.format(monday);
        const last = months[months.length - 1];
        if (!last || (col - last.col) * pitch >= label.length * 7 + 6) {
          // Skip the very first label if the month starts within a column or two (it would collide).
          if (col === 0 && weekCount > 2) {
            const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 14);
            if (nextMonday.getMonth() !== month) {
              prevMonth = month;
              continue;
            }
          }
          months.push({ col, label });
        }
        prevMonth = month;
      }
    }

    const height = MONTH_LABEL_H + 7 * pitch - GAP;
    const xOf = (col: number) => DAY_LABEL_W + col * pitch;
    const yOf = (row: number) => MONTH_LABEL_H + row * pitch;
    const activeIdx = active !== null && active < cells.length ? active : null;
    const activeCell = activeIdx !== null ? cells[activeIdx] : null;

    const fromPointer = (e: PointerEvent | MouseEvent): number | null => {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left - DAY_LABEL_W + GAP / 2) / pitch);
      const row = Math.floor((e.clientY - rect.top - MONTH_LABEL_H + GAP / 2) / pitch);
      if (col < 0 || row < 0 || row > 6 || col >= weekCount) return null;
      const idx = col * 7 + row;
      return idx < cells.length ? idx : null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const last = cells.length - 1;
      const cur = activeIdx ?? last;
      let next: number | null;
      switch (e.key) {
        case 'ArrowLeft':
          next = cur - 7;
          break;
        case 'ArrowRight':
          next = cur + 7;
          break;
        case 'ArrowUp':
          next = cur - 1;
          break;
        case 'ArrowDown':
          next = cur + 1;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = last;
          break;
        case 'Escape':
          next = null;
          break;
        default:
          if (isActivateKey(e.key) && onDayClick && activeCell) {
            e.preventDefault();
            onDayClick(activeCell.date);
          }
          return;
      }
      e.preventDefault();
      setActive(next === null ? null : clamp(next, 0, last));
    };

    const summary =
      props.ariaLabel ??
      `Activity calendar from ${formatDate(start)} to ${formatDate(end)}: ${activeDays} active day${activeDays === 1 ? '' : 's'}, total ${valueFormat(total)}. Use arrow keys to inspect days.`;

    let tooltip: JSX.Element | null = null;
    if (activeCell) {
      const entry = activeCell.entry;
      tooltip = (
        <Tooltip
          x={xOf(activeCell.col) + cell / 2}
          y={yOf(activeCell.row) + cell / 2}
          width={width}
          height={height}
        >
          <TooltipTitle>{formatDateLong(activeCell.date)}</TooltipTitle>
          {entry && entry.value !== 0 ? (
            <>
              {entry.titles.map((t, i) => (
                <TooltipRow key={i} label={t} />
              ))}
              <TooltipRow label={valueLabel} value={valueFormat(entry.value)} />
            </>
          ) : (
            <TooltipRow label={emptyDayText} />
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
          class={onDayClick ? 'mm-clickable' : undefined}
          onPointerMove={(e) => setActive(fromPointer(e))}
          onPointerDown={(e) => setActive(fromPointer(e))}
          onPointerLeave={() => setActive(null)}
          onClick={(e) => {
            const idx = fromPointer(e);
            if (idx !== null && onDayClick) onDayClick(cells[idx].date);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => (a === null ? cells.length - 1 : a))}
          onBlur={() => setActive(null)}
        >
          <g class="mm-axis">
            {months.map((m) => (
              <text key={`${m.col}`} x={xOf(m.col)} y={11}>
                {m.label}
              </text>
            ))}
            {DAY_LABELS.map((d) => (
              <text key={d.row} x={0} y={yOf(d.row) + cell / 2} dominant-baseline="middle">
                {d.label}
              </text>
            ))}
          </g>
          <g>
            {cells.map((c, i) => (
              <rect
                key={i}
                class={`mm-heat-cell mm-heat-l${levelOf(c.entry?.value ?? 0, max)}${i === activeIdx ? ' is-active' : ''}`}
                x={xOf(c.col)}
                y={yOf(c.row)}
                width={cell}
                height={cell}
                rx={Math.min(2, cell / 4)}
              />
            ))}
          </g>
        </svg>
        {tooltip}
      </>
    );
  }
}
