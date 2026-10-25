import type { ComponentChildren } from 'preact'

/** One section of the settings document: label column on the left (sticky on desktop), controls on the right. */
export function Section({ id, title, desc, children }: { id: string; title: string; desc?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="settings-section" aria-labelledby={`${id}-title`}>
      <header class="settings-section__head">
        <h2 id={`${id}-title`} class="settings-section__title">
          {title}
        </h2>
        {desc != null && <p class="settings-section__desc">{desc}</p>}
      </header>
      <div class="settings-section__body">{children}</div>
    </section>
  )
}

export function Setting({
  label,
  desc,
  wide,
  children,
}: {
  label: ComponentChildren
  desc?: ComponentChildren
  /** Control spans the full width under the label (lists, readouts). */
  wide?: boolean
  children: ComponentChildren
}) {
  return (
    <div class={wide ? 'setting setting--wide' : 'setting'}>
      <div>
        <p class="setting__label">{label}</p>
        {desc != null && <p class="setting__desc">{desc}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}
