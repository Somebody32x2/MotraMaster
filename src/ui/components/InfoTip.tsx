import type { ComponentChildren } from 'preact'
import { useEffect, useId, useRef, useState } from 'preact/hooks'
import { IconInfo } from '../icons'

export interface InfoTipProps {
  /** Tooltip content; keep it to a sentence or two. */
  text: ComponentChildren
  /** Accessible name of the trigger button. */
  label?: string
}

/** Small "i" button revealing an explanatory tooltip on hover, focus or tap. Escape closes. */
export function InfoTip({ text, label = 'More information' }: InfoTipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [align, setAlign] = useState<'center' | 'start' | 'end'>('center')
  const root = useRef<HTMLSpanElement>(null)

  const show = () => {
    const el = root.current
    if (el) {
      const { left, right } = el.getBoundingClientRect()
      const vw = window.innerWidth
      setAlign(left < 150 ? 'start' : vw - right < 150 ? 'end' : 'center')
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <span class="infotip" ref={root} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        class="infotip__btn"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        <IconInfo size={14} />
      </button>
      <span role="tooltip" id={id} class="infotip__bubble" data-open={open} data-align={align}>
        {text}
      </span>
    </span>
  )
}
