import type { ComponentChildren } from 'preact'

export interface EmptyStateProps {
  title: ComponentChildren
  children?: ComponentChildren
  /** Not rendered: empty states carry no illustration. */
  icon?: ComponentChildren
  action?: ComponentChildren
  /** Tighter spacing for use inside a block. */
  plain?: boolean
}

/** One sentence and at most one action, left-aligned, unboxed. */
export function EmptyState({ title, children, action, plain }: EmptyStateProps) {
  return (
    <div class={plain ? 'empty empty--plain' : 'empty'}>
      <p class="empty__title">{title}</p>
      {children != null && <div class="empty__body">{children}</div>}
      {action != null && <div class="empty__action">{action}</div>}
    </div>
  )
}
