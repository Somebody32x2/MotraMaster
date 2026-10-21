import type { ComponentChildren } from 'preact'

export interface StatStripProps {
  /** `StatTile` cells. */
  children: ComponentChildren
  /** Enlarge the first figure as the strip's lead stat. */
  lead?: boolean
  class?: string
}

/** Row of figures separated by vertical hairlines; wraps to two columns on mobile. */
export function StatStrip({ children, lead, class: cls }: StatStripProps) {
  const classes = ['stat-strip', lead && 'stat-strip--lead', cls].filter(Boolean).join(' ')
  return <div class={classes}>{children}</div>
}
