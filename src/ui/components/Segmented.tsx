import type { ComponentChildren } from 'preact'
import { useRef } from 'preact/hooks'

export interface SegmentedOption<T extends string> {
  value: T
  label: ComponentChildren
  /** Tooltip and accessible name (required when `label` is an icon). */
  title?: string
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Accessible group label. */
  label: string
  size?: 'sm' | 'md'
  /** Square icon-only buttons. */
  icons?: boolean
  /** Stretch to fill the container. */
  block?: boolean
  class?: string
}

/** Exclusive button group (aria-pressed). Arrow keys move and select. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  icons,
  block,
  class: cls,
}: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const next = (i + dir + options.length) % options.length
    onChange(options[next].value)
    ref.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }

  const classes = ['seg', size === 'sm' && 'seg--sm', icons && 'seg--icons', block && 'seg--block', cls]
    .filter(Boolean)
    .join(' ')

  return (
    <div class={classes} role="group" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            class="seg__btn"
            aria-pressed={active}
            aria-label={icons ? o.title : undefined}
            title={o.title}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
