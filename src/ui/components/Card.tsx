import type { ComponentChildren } from 'preact'
import { InfoTip } from './InfoTip'

export interface CardProps {
  title?: ComponentChildren
  subtitle?: ComponentChildren
  /** Explanatory tooltip next to the title. */
  info?: ComponentChildren
  /** Right-aligned header controls (segmented controls, links…). */
  actions?: ComponentChildren
  /** Remove body padding (tables, edge-to-edge charts). */
  flush?: boolean
  /** Borderless, transparent variant for grouping. */
  quiet?: boolean
  class?: string
  id?: string
  children?: ComponentChildren
}

export function Card({ title, subtitle, info, actions, flush, quiet, class: cls, id, children }: CardProps) {
  const classes = ['card', flush && 'card--flush', quiet && 'card--quiet', cls].filter(Boolean).join(' ')
  const hasHead = title != null || subtitle != null || actions != null
  return (
    <section class={classes} id={id}>
      {hasHead && (
        <header class="card__head">
          <div class="card__titles">
            {title != null && (
              <h3 class="card__title">
                {title}
                {info != null && <InfoTip text={info} />}
              </h3>
            )}
            {subtitle != null && <p class="card__sub">{subtitle}</p>}
          </div>
          {actions != null && <div class="card__actions">{actions}</div>}
        </header>
      )}
      <div class="card__body">{children}</div>
    </section>
  )
}
