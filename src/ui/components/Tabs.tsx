import type { ComponentChildren } from 'preact'
import { useRef } from 'preact/hooks'

export interface TabItem<T extends string> {
  id: T
  label: ComponentChildren
  count?: number
}

export interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabItem<T>>
  value: T
  onChange: (id: T) => void
  label: string
  /** When set, tabs reference panels `${idBase}-panel-${id}` and tabs get id `${idBase}-tab-${id}`. */
  idBase?: string
}

/** Underlined tab list with roving focus; render the active panel yourself (see `tabPanelProps`). */
export function Tabs<T extends string>({ tabs, value, onChange, label, idBase }: TabsProps<T>) {
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].id)
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div class="tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const selected = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            class="tabs__tab"
            id={idBase ? `${idBase}-tab-${t.id}` : undefined}
            aria-controls={idBase ? `${idBase}-panel-${t.id}` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.count != null && <span class="tabs__count">{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Props for the panel matching a `Tabs` with the same `idBase`. */
export function tabPanelProps(idBase: string, id: string) {
  return {
    role: 'tabpanel',
    id: `${idBase}-panel-${id}`,
    'aria-labelledby': `${idBase}-tab-${id}`,
    tabIndex: 0,
  } as const
}
