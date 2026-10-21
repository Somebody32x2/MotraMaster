import type { ComponentChildren } from 'preact'

export type BadgeTone = 'neutral' | 'accent' | 'pos' | 'neg' | 'warn'

export function Badge({ tone = 'neutral', title, children }: { tone?: BadgeTone; title?: string; children: ComponentChildren }) {
  return (
    <span class={tone === 'neutral' ? 'badge' : `badge badge--${tone}`} title={title}>
      {children}
    </span>
  )
}
