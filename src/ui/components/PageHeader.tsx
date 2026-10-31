import type { ComponentChildren } from 'preact'
import { goBack, href, matchRoute, previousEntry } from '../../router'
import { backLabel } from '../../titles'
import { IconArrowLeft } from '../icons'
import { PageControls } from './PageControls'

export interface PageHeaderProps {
  title: ComponentChildren
  /** Small muted line above the title (category, date range). */
  eyebrow?: ComponentChildren
  /** One muted line of context under the title. */
  subtitle?: ComponentChildren
  actions?: ComponentChildren
  /**
   * Shows a back link, e.g. '/muscles'. It returns to the previous in-app page; this path is
   * the destination only when there is none (a page opened directly).
   */
  back?: string
  /** Extra content under the subtitle (chips, meta). */
  children?: ComponentChildren
}

/** Page title block. On data routes the range and detail controls sit on the right (below on mobile). */
export function PageHeader({ title, eyebrow, subtitle, actions, back, children }: PageHeaderProps) {
  const previous = back != null ? previousEntry() : null
  return (
    <header class="page-head">
      <div class="page-head__text">
        {back != null && (
          <a
            class="page-head__back"
            href={href(previous?.path ?? back)}
            onClick={(e: MouseEvent) => {
              // Modified clicks keep the link's default (new tab/window).
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
              e.preventDefault()
              goBack(back)
            }}
          >
            <IconArrowLeft size={14} />
            <span class="page-head__back-label">{backLabel(matchRoute(previous?.path ?? back))}</span>
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
