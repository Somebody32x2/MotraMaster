import type { ComponentChildren } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { compareLabels } from '../../core/labels'
import { navigate, href as toHref } from '../../router'
import { IconSortAsc, IconSortDesc } from '../icons'

export type SortValue = number | string | null | undefined
export type SortDir = 'asc' | 'desc'

export interface Column<T> {
  id: string
  header: ComponentChildren
  /** Value used for sorting (and for display when `render` is absent). */
  value?: (row: T) => SortValue
  render?: (row: T) => ComponentChildren
  /**
   * number: right-aligned, numeric sort, descending first.
   * label: muscle/exercise names via compareLabels.
   * text: locale string compare.
   */
  kind?: 'number' | 'label' | 'text'
  align?: 'left' | 'right' | 'center'
  /** Defaults to true when `value` is provided. */
  sortable?: boolean
  /** Header tooltip. */
  title?: string
  width?: string
  /**
   * Responsive visibility: 1 (default) always shown, 2 hidden below 640px, 3 hidden below 860px.
   * Columns that remain still scroll horizontally inside the table wrapper.
   */
  priority?: 1 | 2 | 3
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<Column<T>>
  rows: ReadonlyArray<T>
  rowKey: (row: T) => string
  initialSort?: { id: string; dir?: SortDir }
  /** Makes each row a link; the first column renders as the anchor. */
  rowHref?: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: ComponentChildren
  caption?: string
  /** Constrain height; the header sticks within the scroll area. Without it the header sticks below the top bar. */
  maxHeight?: number | string
  dense?: boolean
  /** Show only the first N rows with a "Show all" button. */
  limit?: number
  /** Pin the first column while the table scrolls sideways on narrow screens. Defaults to true. */
  stickyFirst?: boolean
}

function compareValues(a: SortValue, b: SortValue, kind: Column<unknown>['kind']): number {
  if (kind === 'number') return (a as number) - (b as number)
  if (kind === 'label') return compareLabels(String(a), String(b))
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

const isMissing = (v: SortValue) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  rowHref,
  onRowClick,
  empty = 'Nothing to show for this range.',
  caption,
  maxHeight,
  dense,
  limit,
  stickyFirst = true,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; dir: SortDir } | null>(() => {
    if (!initialSort) return null
    const col = columns.find((c) => c.id === initialSort.id)
    return { id: initialSort.id, dir: initialSort.dir ?? (col?.kind === 'number' ? 'desc' : 'asc') }
  })
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.id === sort.id)
    if (!sort || !col?.value) return rows
    const get = col.value
    const sign = sort.dir === 'asc' ? 1 : -1
    return rows
      .map((row, i) => ({ row, i, v: get(row) }))
      .sort((x, y) => {
        const mx = isMissing(x.v)
        const my = isMissing(y.v)
        if (mx || my) return mx === my ? x.i - y.i : mx ? 1 : -1 // missing values always last
        return sign * compareValues(x.v, y.v, col.kind) || x.i - y.i
      })
      .map((x) => x.row)
  }, [rows, columns, sort])

  const visible = limit && !expanded ? sorted.slice(0, limit) : sorted

  const toggleSort = (col: Column<T>) => {
    setSort((s) =>
      s?.id === col.id
        ? { id: col.id, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { id: col.id, dir: col.kind === 'number' ? 'desc' : 'asc' },
    )
  }

  const alignOf = (c: Column<T>) => c.align ?? (c.kind === 'number' ? 'right' : 'left')
  const cellClass = (c: Column<T>) =>
    [alignOf(c) === 'right' && 'is-right', alignOf(c) === 'center' && 'is-center', c.priority && c.priority > 1 && `prio-${c.priority}`]
      .filter(Boolean)
      .join(' ') || undefined

  const scroll = maxHeight != null
  const style = scroll ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } : undefined
  const clickable = rowHref != null || onRowClick != null
  const tableClass = ['dt', dense && 'dt--dense', stickyFirst && 'dt--sticky-first'].filter(Boolean).join(' ')

  return (
    <div>
      <div class={scroll ? 'dt-wrap dt-wrap--scroll' : 'dt-wrap'} style={style}>
        <table class={tableClass}>
          {caption && <caption class="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable ?? c.value != null
                const dir = sort?.id === c.id ? sort.dir : null
                const ariaSort = dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
                return (
                  <th
                    key={c.id}
                    scope="col"
                    class={cellClass(c)}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={ariaSort}
                    title={c.title}
                  >
                    {sortable ? (
                      <button type="button" class="dt__th-inner" onClick={() => toggleSort(c)}>
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
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td class="dt__empty" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const link = rowHref?.(row)
                return (
                  <tr
                    key={rowKey(row)}
                    class={clickable ? 'is-link' : undefined}
                    onClick={
                      link != null
                        ? // The row-wide link overlay is clipped to the first cell when it is sticky; route clicks elsewhere in the row.
                          (e: MouseEvent) => {
                            if (!(e.target as Element).closest('a, button, input, label')) navigate(link)
                          }
                        : onRowClick
                          ? () => onRowClick(row)
                          : undefined
                    }
                  >
                    {columns.map((c, ci) => {
                      const content = c.render ? c.render(row) : (c.value?.(row) ?? '—')
                      return (
                        <td key={c.id} class={cellClass(c)}>
                          {ci === 0 && link != null ? (
                            <a class="dt__rowlink" href={toHref(link)}>
                              {content}
                            </a>
                          ) : (
                            content
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {limit != null && sorted.length > limit && (
        <div class="dt__more">
          <button type="button" class="btn btn--ghost btn--sm" onClick={() => setExpanded((x) => !x)}>
            {expanded ? 'Show fewer' : `Show all ${sorted.length}`}
          </button>
        </div>
      )}
    </div>
  )
}
