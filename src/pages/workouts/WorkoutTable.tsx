import type { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { WorkoutSummary } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, navigate, paths } from '../../router'
import { EMPTY, formatDate, formatDuration, formatNumber, formatWeight, plural, unitLabel } from '../../ui/format'
import { IconSortAsc, IconSortDesc } from '../../ui/icons'
import { RegionChips } from '../../ui/widgets'

type SortDir = 'asc' | 'desc'

interface Col {
  id: string
  header: string
  title?: string
  /** Sort key; columns without one are not sortable. */
  value?: (r: WorkoutSummary) => number | string | null | undefined
  render: (r: WorkoutSummary) => ComponentChildren
  numeric?: boolean
  /** 2: hidden below 640px, 3: hidden below 860px. */
  priority?: 2 | 3
}

const faint = <span class="faint">{EMPTY}</span>
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

function columns(units: Units, isDetailed: boolean): Col[] {
  const cols: Col[] = [
    {
      id: 'title',
      header: 'Workout',
      value: (r) => r.workout.title || 'Workout',
      render: (r) => (
        <span class="wo-title">
          <span class="wo-title__name">
            {r.workout.title || 'Workout'}
            {r.prCount > 0 && <span class="wo-pr">{plural(r.prCount, 'PR')}</span>}
          </span>
          <span class="wo-title__sub num">{r.date ? `${formatDate(r.date, 'weekday')}, ${formatDate(r.date, 'time')}` : 'Undated'}</span>
        </span>
      ),
    },
    {
      id: 'date',
      header: 'Date',
      value: (r) => r.date?.getTime() ?? null,
      render: (r) =>
        r.date ? (
          <span class="wo-date num">
            {formatDate(r.date, 'weekday')}
            <span class="faint"> {formatDate(r.date, 'time')}</span>
          </span>
        ) : (
          <span class="faint">Undated</span>
        ),
      priority: 2,
    },
    {
      id: 'duration',
      header: 'Duration',
      numeric: true,
      value: (r) => r.durationSec,
      render: (r) =>
        r.trimmedSec > 0 ? (
          <span title={`Trimmed ${formatDuration(r.trimmedSec)} idle after the last set (logged ${formatDuration(r.rawDurationSec)})`}>
            {formatDuration(r.durationSec)}
            <span class="wo-trim" aria-hidden="true">*</span>
            <span class="sr-only"> (trimmed)</span>
          </span>
        ) : (
          formatDuration(r.durationSec)
        ),
      priority: 2,
    },
    {
      id: 'hard',
      header: 'Hard sets',
      numeric: true,
      title: 'Working sets, excluding warm-ups; drops count as set in Settings',
      value: (r) => r.hardSets,
      render: (r) => (
        <span title={`${plural(r.sets, 'set')} logged`}>
          {formatNumber(r.hardSets, { maxDecimals: 1 })}
          <span class="faint"> / {formatNumber(r.sets, { maxDecimals: 0 })}</span>
        </span>
      ),
      priority: 2,
    },
    { id: 'volume', header: 'Volume', numeric: true, value: (r) => r.volumeLb, render: (r) => formatWeight(r.volumeLb, units, { compact: true }) },
    {
      id: 'exercises',
      header: 'Exercises',
      numeric: true,
      value: (r) => r.exercises,
      render: (r) => formatNumber(r.exercises, { maxDecimals: 0 }),
      priority: 3,
    },
    {
      id: 'regions',
      header: 'Muscles',
      render: (r) => (r.topRegions.length ? <RegionChips regions={r.topRegions} max={3} /> : faint),
      priority: 3,
    },
  ]
  if (isDetailed) {
    cols.push(
      {
        id: 'density',
        header: 'Density',
        numeric: true,
        title: 'Volume per minute of session time',
        value: (r) => r.density,
        render: (r) => (r.density != null ? `${formatWeight(r.density, units, { unit: false })} ${unitLabel(units)}/min` : faint),
        priority: 3,
      },
      {
        id: 'kcalmin',
        header: 'kcal/min',
        numeric: true,
        value: (r) => r.kcalPerMin,
        render: (r) => formatNumber(r.kcalPerMin, { maxDecimals: 1 }),
        priority: 3,
      },
      {
        id: 'calories',
        header: 'Calories',
        numeric: true,
        value: (r) => r.workout.calories,
        render: (r) => formatNumber(r.workout.calories, { maxDecimals: 0 }),
        priority: 3,
      },
    )
  }
  return cols
}

const missing = (v: unknown) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))

interface Group {
  key: string
  label: string | null
  rows: WorkoutSummary[]
}

export interface WorkoutTableProps {
  rows: WorkoutSummary[]
  units: Units
  detailed: boolean
  empty: ComponentChildren
}

/**
 * Workouts table. Sorted by date it is grouped under month subheadings;
 * sorted by any other column it is one flat list.
 */
export function WorkoutTable({ rows, units, detailed: isDetailed, empty }: WorkoutTableProps) {
  const cols = useMemo(() => columns(units, isDetailed), [units, isDetailed])
  const [sort, setSort] = useState<{ id: string; dir: SortDir }>({ id: 'date', dir: 'desc' })

  const groups = useMemo<Group[]>(() => {
    const col = cols.find((c) => c.id === sort.id) ?? cols[1]
    const get = col.value!
    const sign = sort.dir === 'asc' ? 1 : -1
    const sorted = rows
      .map((row, i) => ({ row, i, v: get(row) }))
      .sort((x, y) => {
        const mx = missing(x.v)
        const my = missing(y.v)
        if (mx || my) return mx === my ? x.i - y.i : mx ? 1 : -1
        const c =
          typeof x.v === 'number' && typeof y.v === 'number'
            ? x.v - y.v
            : String(x.v).localeCompare(String(y.v), undefined, { numeric: true, sensitivity: 'base' })
        return sign * c || x.i - y.i
      })
      .map((x) => x.row)
    if (sort.id !== 'date') return [{ key: 'all', label: null, rows: sorted }]
    const out: Group[] = []
    for (const r of sorted) {
      const key = r.date ? `${r.date.getFullYear()}-${r.date.getMonth()}` : 'undated'
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: r.date ? monthFmt.format(r.date) : 'Undated', rows: [] }
        out.push(g)
      }
      g.rows.push(r)
    }
    return out
  }, [rows, cols, sort])

  const toggle = (c: Col) =>
    setSort((s) => (s.id === c.id ? { id: c.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id: c.id, dir: c.numeric || c.id === 'date' ? 'desc' : 'asc' }))

  const cellClass = (c: Col) => [c.numeric && 'is-right', c.priority && `prio-${c.priority}`].filter(Boolean).join(' ') || undefined
  const totalCols = cols.length

  return (
    <div class="dt-wrap">
      <table class="dt dt--sticky-first wo-table">
        <caption class="sr-only">Workouts{sort.id === 'date' ? ', grouped by month' : ''}</caption>
        <thead>
          <tr>
            {cols.map((c) => {
              const dir = sort.id === c.id ? sort.dir : null
              return (
                <th
                  key={c.id}
                  scope="col"
                  class={cellClass(c)}
                  title={c.title}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                >
                  {c.value ? (
                    <button type="button" class="dt__th-inner" onClick={() => toggle(c)}>
                      {c.header}
                      {dir === 'asc' ? (
                        <IconSortAsc size={14} />
                      ) : dir === 'desc' ? (
                        <IconSortDesc size={14} />
                      ) : (
                        <span style={{ display: 'inline-block', width: 14 }} aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    <span class="dt__th-inner">{c.header}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        {rows.length === 0 ? (
          <tbody>
            <tr>
              <td class="dt__empty" colSpan={totalCols}>
                {empty}
              </td>
            </tr>
          </tbody>
        ) : (
          groups.map((g) => (
            <tbody key={g.key}>
              {g.label != null && (
                <tr class="wo-month">
                  <th scope="rowgroup" colSpan={totalCols}>
                    <span class="wo-month__name">{g.label}</span>
                    <span class="wo-month__count"> · {plural(g.rows.length, 'workout')}</span>
                  </th>
                </tr>
              )}
              {g.rows.map((r) => {
                const link = paths.workout(r.workout.id)
                return (
                  <tr
                    key={r.workout.id}
                    class="is-link"
                    onClick={(e: MouseEvent) => {
                      if (!(e.target as Element).closest('a, button, input, label')) navigate(link)
                    }}
                  >
                    {cols.map((c, ci) => (
                      <td key={c.id} class={cellClass(c)}>
                        {ci === 0 ? (
                          <a class="dt__rowlink" href={href(link)}>
                            {c.render(r)}
                          </a>
                        ) : (
                          c.render(r)
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          ))
        )}
      </table>
    </div>
  )
}
