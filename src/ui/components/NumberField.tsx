import { useEffect, useId, useRef, useState } from 'preact/hooks'

export interface NumberFieldProps {
  label: string
  value: number | null
  /** Called with a valid in-range number, or null when cleared. */
  onChange: (value: number | null) => void
  unit?: string
  min?: number
  max?: number
  /** Decimals shown when not editing (default 1). */
  decimals?: number
  placeholder?: string
  hint?: string
  hideLabel?: boolean
  disabled?: boolean
}

function show(v: number | null, decimals: number): string {
  if (v == null || !Number.isFinite(v)) return ''
  const f = 10 ** decimals
  return String(Math.round(v * f) / f)
}

/**
 * Free-typing numeric input. Accepts ',' as decimal separator; commits only valid values,
 * flags out-of-range input, and reformats on blur.
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  decimals = 1,
  placeholder,
  hint,
  hideLabel,
  disabled,
}: NumberFieldProps) {
  const id = useId()
  const [text, setText] = useState(() => show(value, decimals))
  const [invalid, setInvalid] = useState(false)
  const editing = useRef(false)

  useEffect(() => {
    if (!editing.current) setText(show(value, decimals))
  }, [value, decimals])

  const onInput = (raw: string) => {
    setText(raw)
    const t = raw.trim().replace(',', '.')
    if (t === '') {
      setInvalid(false)
      onChange(null)
      return
    }
    const n = Number(t)
    const ok = Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)
    setInvalid(!ok)
    if (ok) onChange(n)
  }

  const describedBy = [hint && !invalid && `${id}-hint`, invalid && `${id}-err`].filter(Boolean).join(' ') || undefined
  const rangeText =
    min != null && max != null
      ? `Enter a number between ${min} and ${max}.`
      : min != null
        ? `Enter a number of at least ${min}.`
        : max != null
          ? `Enter a number up to ${max}.`
          : 'Enter a number.'

  return (
    <div class="field">
      <label class={hideLabel ? 'sr-only' : 'field__label'} for={id}>
        {label}
      </label>
      <div class={unit ? 'input-wrap input-wrap--unit' : 'input-wrap'}>
        <input
          id={id}
          class="input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onFocus={() => {
            editing.current = true
          }}
          onBlur={() => {
            editing.current = false
            setInvalid(false)
            setText(show(value, decimals))
          }}
          onInput={(e) => onInput(e.currentTarget.value)}
        />
        {unit && (
          <span class="input-wrap__unit" aria-hidden="true">
            {unit}
          </span>
        )}
      </div>
      {invalid && (
        <p class="field__error" id={`${id}-err`}>
          {rangeText}
        </p>
      )}
      {hint && !invalid && (
        <p class="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}
