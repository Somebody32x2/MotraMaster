import { useRef, useState } from 'preact/hooks'
import { IconImport } from '../icons'

export interface DropzoneProps {
  onFiles: (files: File[]) => void
  /** While true, interaction is disabled and `busyLabel` is shown. */
  busy?: boolean
  busyLabel?: string
  title?: string
  hint?: string
}

const ACCEPT =
  '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'
const isSpreadsheet = (f: File) => /\.(xlsx|xls)$/i.test(f.name)

/** Drag-and-drop or click/keyboard file picker for Excel exports; accepts multiple files. */
export function Dropzone({
  onFiles,
  busy,
  busyLabel = 'Reading files…',
  title = 'Drop Motra exports here',
  hint = 'Excel workbooks (.xlsx, .xls) — select several at once if you like',
}: DropzoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState<string[]>([])
  const depth = useRef(0)

  const accept = (list: FileList | null | undefined) => {
    if (!list || busy) return
    const all = Array.from(list)
    const ok = all.filter(isSpreadsheet)
    setRejected(all.filter((f) => !isSpreadsheet(f)).map((f) => f.name))
    if (ok.length) onFiles(ok)
  }

  const open = () => {
    if (!busy) input.current?.click()
  }

  return (
    <div>
      <div
        class="dropzone"
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        aria-busy={busy}
        aria-label={`${title}. ${hint}. Press Enter to choose files.`}
        data-over={over}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          depth.current++
          setOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          depth.current = 0
          setOver(false)
          accept(e.dataTransfer?.files)
        }}
      >
        <span class="dropzone__icon" aria-hidden="true">
          <IconImport size={22} />
        </span>
        {busy ? (
          <span class="dropzone__title" aria-live="polite">
            {busyLabel}
          </span>
        ) : (
          <>
            <span class="dropzone__title">{title}</span>
            <span class="dropzone__hint">
              or <span class="dropzone__browse">browse files</span> · {hint}
            </span>
          </>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          accept(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
      {rejected.length > 0 && (
        <p class="field__error" role="alert" style={{ marginTop: 8 }}>
          Skipped {rejected.join(', ')} — only Excel files (.xlsx, .xls) can be imported.
        </p>
      )}
    </div>
  )
}
