import type { ComponentChildren } from 'preact'
import { href } from '../../router'
import { IconArrowLeft } from '../icons'

export interface PageHeaderProps {
  title: ComponentChildren
  /** Small uppercase line above the title (category, date…). */
  eyebrow?: ComponentChildren
  subtitle?: ComponentChildren
  actions?: ComponentChildren
  /** Back link, e.g. { path: '/muscles', label: 'All muscles' }. */
  back?: { path: string; label: string }
  /** Extra content under the subtitle (badges, meta). */
  children?: ComponentChildren
}

export function PageHeader({ title, eyebrow, subtitle, actions, back, children }: PageHeaderProps) {
  return (
    <header class="page-head">
      <div class="page-head__text">
        {back && (
          <a class="page-head__back" href={href(back.path)}>
            <IconArrowLeft size={14} />
            {back.label}
          </a>
        )}
        {eyebrow != null && <p class="page-head__eyebrow section-title">{eyebrow}</p>}
        <h1 class="page-head__title">{title}</h1>
        {subtitle != null && <p class="page-head__sub">{subtitle}</p>}
        {children}
      </div>
      {actions != null && <div class="page-head__actions">{actions}</div>}
    </header>
  )
}
