import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

export interface ConfirmButtonProps {
  label: ComponentChildren
  /** Text shown while awaiting confirmation. */
  prompt?: ComponentChildren
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  icon?: ComponentChildren
}

/** Destructive action with an inline two-step confirmation (no modal). */
export function ConfirmButton({
  label,
  prompt = 'This cannot be undone.',
  confirmLabel = 'Delete',
  onConfirm,
  icon,
}: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (asking) cancelRef.current?.focus()
  }, [asking])

  if (!asking) {
    return (
      <button type="button" class="btn btn--danger" onClick={() => setAsking(true)}>
        {icon}
        {label}
      </button>
    )
  }

  return (
    <div
      class="confirm"
      role="group"
      aria-label="Confirm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setAsking(false)
      }}
    >
      <span class="confirm__prompt">{prompt}</span>
      <button type="button" class="btn" ref={cancelRef} disabled={busy} onClick={() => setAsking(false)}>
        Cancel
      </button>
      <button
        type="button"
        class="btn btn--danger-solid"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onConfirm()
          } finally {
            setBusy(false)
            setAsking(false)
          }
        }}
      >
        {confirmLabel}
      </button>
    </div>
  )
}
