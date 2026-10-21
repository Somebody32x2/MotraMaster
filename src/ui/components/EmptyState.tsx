import type { ComponentChildren } from 'preact'

export interface EmptyStateProps {
  title: ComponentChildren
  children?: ComponentChildren
  icon?: ComponentChildren
  action?: ComponentChildren
  /** No dashed frame (for use inside cards). */
  plain?: boolean
}

export function EmptyState({ title, children, icon, action, plain }: EmptyStateProps) {
  return (
    <div class={plain ? 'empty empty--plain' : 'empty'}>
      {icon != null && (
        <div class="empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p class="empty__title">{title}</p>
      {children != null && <div class="empty__body">{children}</div>}
      {action != null && <div class="empty__action">{action}</div>}
    </div>
  )
}
