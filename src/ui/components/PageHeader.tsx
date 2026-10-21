import type { ComponentChildren } from 'preact'
import { href } from '../../router'
import { IconArrowLeft } from '../icons'
import { PageControls } from './PageControls'

export interface PageHeaderProps {
  title: ComponentChildren
  /** Small muted line above the title (category, date range). */
  eyebrow?: ComponentChildren
  /** One muted line of context under the title. */
  subtitle?: ComponentChildren
  actions?: ComponentChildren
  /** Back link, e.g. { path: '/muscles', label: 'All muscles' }. */
  back?: { path: string; label: string }
  /** Extra content under the subtitle (chips, meta). */
  children?: ComponentChildren
}

/** Page title block. On data routes the range and detail controls sit on the right (below on mobile). */
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
        {eyebrow != null && <p class="page-head__eyebrow eyebrow">{eyebrow}</p>}
        <h1 class="page-head__title">{title}</h1>
        {subtitle != null && <p class="page-head__sub">{subtitle}</p>}
        {children}
      </div>
      <div class="page-head__side">
        {actions != null && <div class="page-head__actions">{actions}</div>}
        <PageControls />
      </div>
    </header>
  )
}
