import { useId } from 'preact/hooks'
import { IconChevronDown } from '../icons'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export interface SelectProps<T extends string> {
  value: T
  options: ReadonlyArray<SelectOption<T>>
  onChange: (value: T) => void
  label: string
  /** Keep the label for screen readers only. */
  hideLabel?: boolean
  hint?: string
  disabled?: boolean
}

/** Native select with consistent styling. */
export function Select<T extends string>({ value, options, onChange, label, hideLabel, hint, disabled }: SelectProps<T>) {
  const id = useId()
  return (
    <div class="field">
      <label class={hideLabel ? 'sr-only' : 'field__label'} for={id}>
        {label}
      </label>
      <div class="select-wrap">
        <select
          id={id}
          class="select"
          value={value}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.currentTarget.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IconChevronDown size={16} />
      </div>
      {hint && (
        <p class="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}
