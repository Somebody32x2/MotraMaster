import type { DayMetric, WeekdayStat } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { DataTable, type Column } from '../../ui/components/DataTable'
import { formatNumber, formatPercent } from '../../ui/format'
import { METRICS, WEEKDAY_LONG, WEEKDAY_SHORT } from './metrics'

/** Metrics kept on tablets; the rest only show on wide screens. */
const WIDE: Partial<Record<DayMetric, true>> = { volume: true, duration: true, hardSets: true }

/** Every metric averaged per weekday; the selected metric leads and stays visible on phones. */
export function WeekdayTable({ weekdays, selected, units }: { weekdays: WeekdayStat[]; selected: DayMetric; units: Units }) {
  const ordered = [...METRICS].sort((a, b) => Number(b.value === selected) - Number(a.value === selected))
  const cols: Column<WeekdayStat>[] = [
    {
      id: 'day',
      header: 'Day',
      kind: 'number',
      align: 'left',
      value: (w) => w.weekday,
      render: (w) => <span title={WEEKDAY_LONG[w.weekday]}>{WEEKDAY_SHORT[w.weekday]}</span>,
    },
    { id: 'count', header: 'Workouts', kind: 'number', value: (w) => w.workouts, render: (w) => formatNumber(w.workouts, { maxDecimals: 0 }) },
    {
      id: 'hit',
      header: 'Hit rate',
      kind: 'number',
      title: 'Share of this weekday’s calendar days with a workout',
      value: (w) => w.hitRate,
      render: (w) => formatPercent(w.hitRate, { decimals: 0 }),
      priority: 2,
    },
    ...ordered
      .filter((m) => m.value !== 'workouts')
      .map<Column<WeekdayStat>>((m) => ({
        id: m.value,
        header: m.label,
        kind: 'number',
        title: `Average per training day. ${m.info}`,
        value: (w) => (w.workouts > 0 ? w.avg[m.value] : null),
        render: (w) => (w.workouts > 0 ? m.format(w.avg[m.value], units) : '—'),
        priority: m.value === selected ? 1 : WIDE[m.value] ? 2 : 3,
      })),
  ]
  return (
    <DataTable
      columns={cols}
      rows={weekdays}
      rowKey={(w) => String(w.weekday)}
      initialSort={{ id: 'day', dir: 'asc' }}
      caption="Averages per training day by weekday"
      dense
    />
  )
}
