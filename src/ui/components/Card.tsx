import type { ComponentChildren } from 'preact'
import { InfoTip } from './InfoTip'

export interface CardProps {
  title?: ComponentChildren
  /** One muted line under the title; only when the title is not self-explanatory. */
  subtitle?: ComponentChildren
  /** Definition tooltip next to the title; reserve for genuinely technical terms. */
  info?: ComponentChildren
  /** Right-aligned header controls (segmented controls, links…). */
  actions?: ComponentChildren
  /** Content runs edge to edge (tables, charts). */
  flush?: boolean
  /** No top hairline: plain grouping. */
  quiet?: boolean
  /** Rare boxed container (surface, border, 10px radius) for notes and callouts. */
  boxed?: boolean
  class?: string
  id?: string
  children?: ComponentChildren
}

/** A content block: top hairline, heading row (title left, actions right), then content. */
export function Card({ title, subtitle, info, actions, flush, quiet, boxed, class: cls, id, children }: CardProps) {
  const classes = ['card', flush && 'card--flush', quiet && 'card--quiet', boxed && 'card--boxed', cls]
    .filter(Boolean)
    .join(' ')
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
