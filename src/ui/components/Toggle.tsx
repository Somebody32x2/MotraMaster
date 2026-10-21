import type { ComponentChildren } from 'preact'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ComponentChildren
  description?: ComponentChildren
  disabled?: boolean
}

/** On/off switch (role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      class="toggle"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span class="toggle__track" aria-hidden="true">
        <span class="toggle__thumb" />
      </span>
      <span class="toggle__text">
        <span class="toggle__label">{label}</span>
        {description != null && <span class="toggle__desc">{description}</span>}
      </span>
    </button>
  )
}
