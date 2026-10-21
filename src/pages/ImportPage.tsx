import { useState } from 'preact/hooks'
import type { ParseWarning } from '../core/types'
import { href, navigate, paths } from '../router'
import { clearData, dataset, importFiles, latestWorkoutDate, type ImportResult } from '../state'
import { Card } from '../ui/components/Card'
import { ConfirmButton } from '../ui/components/ConfirmButton'
import { Dropzone } from '../ui/components/Dropzone'
import { PageHeader } from '../ui/components/PageHeader'
import { Segmented, type SegmentedOption } from '../ui/components/Segmented'
import { StatStrip } from '../ui/components/StatStrip'
import { StatTile } from '../ui/components/StatTile'
import { formatDate, formatNumber, formatRelative, plural } from '../ui/format'
import { IconAlert, IconCheck, IconChevronRight, IconLock, IconTrash } from '../ui/icons'

type Mode = 'merge' | 'replace'

const MODE_OPTIONS: SegmentedOption<Mode>[] = [
  { value: 'merge', label: 'Merge', title: 'Add new workouts to what is stored' },
  { value: 'replace', label: 'Replace', title: 'Discard stored workouts first' },
]

const MODE_DESC: Record<Mode, string> = {
  merge:
    'New workouts are added. Workouts already stored are matched by start time and title, and updated from the newer file.',
  replace: 'Everything currently stored is discarded and replaced with the contents of these files.',
}

const MAX_WARNINGS_SHOWN = 200

interface Outcome extends ImportResult {
  files: string[]
  mode: Mode
}

function warningWhere(w: ParseWarning): string {
  return [w.file, w.sheet && `sheet “${w.sheet}”`, w.row != null && `row ${w.row}`].filter(Boolean).join(' · ')
}

function ExportSteps() {
  return (
    <ol class="steps" role="list">
      <li>
        <span>
          <strong>Open Motra</strong> on the device where your workouts are recorded.
        </span>
      </li>
      <li>
        <span>
          Find the <strong>export</strong> option for your workout history, usually under profile or settings.
        </span>
      </li>
      <li>
        <span>
          Choose <strong>Excel (.xlsx)</strong> and save the file to this device.
        </span>
      </li>
      <li>
        <span>Drop the file on this page. Import again any time to bring in newer sessions.</span>
      </li>
    </ol>
  )
}

function ResultSummary({ outcome, onboarding }: { outcome: Outcome; onboarding: boolean }) {
  const { added, total, parsed, warnings, files, mode } = outcome
  const nothing = parsed === 0
  const shown = warnings.slice(0, MAX_WARNINGS_SHOWN)

  let headline: string
  let detail: string
  if (nothing) {
    headline = 'No workouts imported'
    detail = `No workouts were found in ${plural(files.length, 'file')}. Stored data was left untouched.`
  } else if (added === 0) {
    headline = 'Already up to date'
    detail = `Every workout in ${plural(files.length, 'file')} was already stored and has been refreshed. ${plural(total, 'workout')} in total.`
  } else {
    headline = `${plural(added, 'workout')} ${mode === 'replace' ? 'imported' : 'added'}`
    detail = `From ${plural(files.length, 'file')}. ${plural(total, 'workout')} stored in total.`
  }

  return (
    <div class="import-result" role="status">
      <div class={nothing ? 'callout callout--warn' : 'callout callout--pos'}>
        {nothing ? <IconAlert size={16} /> : <IconCheck size={16} />}
        <div class="stack" style={{ '--gap': '4px' }}>
          <p>
            <strong>{headline}.</strong> {detail}
          </p>
          {!nothing && onboarding && (
            <p>
              <a class="link" href={href(paths.overview())}>
                Open your overview →
              </a>
            </p>
          )}
        </div>
      </div>
      {warnings.length > 0 && (
        <details class="disclosure import-result__warnings">
          <summary>
            <IconChevronRight size={14} />
            {plural(warnings.length, 'note')} from the parser
            <span class="faint" style={{ fontWeight: 400 }}>
              rows that were skipped or interpreted
            </span>
          </summary>
          <ul role="list" class="warnings">
            {shown.map((w, i) => (
              <li key={i}>
                <span class="warnings__where mono">{warningWhere(w)}</span>
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
          {warnings.length > shown.length && (
            <p class="faint" style={{ marginTop: 8 }}>
              {warnings.length - shown.length} more not shown.
            </p>
          )}
        </details>
      )}
    </div>
  )
}

export default function ImportPage() {
  const ds = dataset.value
  const hasData = ds != null && ds.workouts.length > 0
  const [mode, setMode] = useState<Mode>('merge')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onboarding] = useState(!hasData)

  const onFiles = async (files: File[]) => {
    const effective: Mode = hasData ? mode : 'replace'
    setBusy(true)
    setError(null)
    try {
      const res = await importFiles(files, effective)
      setOutcome({ ...res, files: files.map((f) => f.name), mode: effective })
    } catch (err) {
      setOutcome(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const dropzone = (
    <Dropzone
      onFiles={onFiles}
      busy={busy}
      busyLabel="Reading your workouts…"
      title={hasData ? 'Drop newer Motra exports here' : 'Drop your Motra export here'}
    />
  )

  const feedback = (
    <>
      {error && (
        <div class="callout callout--warn" role="alert">
          <IconAlert size={16} />
          <p>
            <strong>Import failed.</strong> {error}
          </p>
        </div>
      )}
      {outcome && <ResultSummary outcome={outcome} onboarding={onboarding} />}
    </>
  )

  if (!hasData) {
    return (
      <div class="import-first">
        <PageHeader
          title="Import your Motra workouts"
          subtitle="One export gives you volume trends, estimated one-rep maxes and muscle balance across every session you have logged."
        />
        <div class="stack">
          {dropzone}
          {feedback}
        </div>
        <section class="import-first__howto" aria-labelledby="howto-title">
          <h2 id="howto-title" class="import-first__title">
            How to export from Motra
          </h2>
          <ExportSteps />
        </section>
        <p class="import-privacy">
          <IconLock size={14} />
          Files are read in your browser and stored on this device. No account, no server, and it works offline.
        </p>
      </div>
    )
  }

  const first = ds.workouts.find((w) => w.start)?.start ?? null
  const last = latestWorkoutDate.value
  const imported = new Date(ds.importedAt)

  return (
    <div class="stack">
      <PageHeader title="Import" subtitle="Add newer exports or start over. Files never leave this device." />

      <Card
        quiet
        title="Stored data"
        actions={
          outcome && outcome.total > 0 ? (
            <button type="button" class="btn btn--sm" onClick={() => navigate(paths.overview())}>
              View overview
            </button>
          ) : undefined
        }
      >
        <StatStrip lead>
          <StatTile lead label="Workouts" value={formatNumber(ds.workouts.length, { maxDecimals: 0 })} sub={first ? `since ${formatDate(first)}` : undefined} />
          <StatTile label="Latest workout" value={formatDate(last)} sub={last ? formatRelative(last) : undefined} />
          <StatTile label="Source files" value={formatNumber(ds.sourceFiles.length, { maxDecimals: 0 })} />
          <StatTile
            label="Last import"
            value={<span title={formatDate(imported, 'datetime')}>{formatRelative(imported)}</span>}
            sub={formatDate(imported, 'medium')}
          />
        </StatStrip>
      </Card>

      <Card title="Add files">
        <div class="import-add">
          <div class="stack">
            <div class="import-mode">
              <Segmented label="Import mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
              <p class="muted import-mode__desc">{MODE_DESC[mode]}</p>
            </div>
            {dropzone}
            {feedback}
          </div>
          <aside class="import-add__howto" aria-labelledby="howto-title">
            <h4 id="howto-title" class="import-add__title">
              How to export from Motra
            </h4>
            <ExportSteps />
          </aside>
        </div>
      </Card>

      <Card title="Remove data" subtitle="Deletes every stored workout from this device. Settings are kept.">
        <ConfirmButton
          label="Clear all data"
          icon={<IconTrash size={16} />}
          prompt={`Delete ${plural(ds.workouts.length, 'workout')} from this device?`}
          confirmLabel="Delete everything"
          onConfirm={async () => {
            await clearData()
            setOutcome(null)
          }}
        />
      </Card>
    </div>
  )
}
