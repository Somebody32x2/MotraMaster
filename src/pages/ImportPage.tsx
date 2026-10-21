import { useState } from 'preact/hooks'
import type { ParseWarning } from '../core/types'
import { href, navigate, paths } from '../router'
import { clearData, dataset, importFiles, latestWorkoutDate, type ImportResult } from '../state'
import { Card } from '../ui/components/Card'
import { ConfirmButton } from '../ui/components/ConfirmButton'
import { Dropzone } from '../ui/components/Dropzone'
import { PageHeader } from '../ui/components/PageHeader'
import { Segmented, type SegmentedOption } from '../ui/components/Segmented'
import { formatDate, formatRelative, plural } from '../ui/format'
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconLock,
  IconMuscles,
  IconOffline,
  IconTrash,
  IconTrend,
} from '../ui/icons'

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
        <span class="steps__n">1</span>
        <div>
          <strong>Open Motra</strong> on the device where your workouts are recorded.
        </div>
      </li>
      <li>
        <span class="steps__n">2</span>
        <div>
          Find the <strong>export</strong> option for your workout history — usually in your profile or settings.
        </div>
      </li>
      <li>
        <span class="steps__n">3</span>
        <div>
          Choose <strong>Excel (.xlsx)</strong> and save or share the file to this device.
        </div>
      </li>
      <li>
        <span class="steps__n">4</span>
        <div>Drop the file above. Import again whenever you want to bring in newer sessions.</div>
      </li>
    </ol>
  )
}

function PrivacyNote() {
  return (
    <div class="callout">
      <IconLock size={16} />
      <p>
        <strong>Your data never leaves this device.</strong> Files are read in your browser and stored locally. There is
        no server, no account and no tracking — MotraMaster keeps working offline.
      </p>
    </div>
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
              — rows that were skipped or interpreted
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

const FEATURES = [
  {
    icon: IconTrend,
    title: 'Trends that matter',
    body: 'Volume, frequency and estimated 1RM over time, per exercise and per muscle group.',
  },
  {
    icon: IconMuscles,
    title: 'Muscle balance',
    body: 'A body map of where your training load actually goes — and what is being neglected.',
  },
  {
    icon: IconOffline,
    title: 'Private and offline',
    body: 'Parsed entirely on this device. Install it as an app and it works without a connection.',
  },
]

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
      <div class="stack" style={{ '--gap': 'var(--s6)' }}>
        <PageHeader
          eyebrow="MotraMaster"
          title="See what your training is really doing"
          subtitle="Bring in your Motra workout export to get volume trends, estimated one-rep maxes and muscle balance — calculated right here in your browser."
        />
        <div class="stack">
          {dropzone}
          {feedback}
          <PrivacyNote />
        </div>
        <ul role="list" class="features">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon size={18} />
              <div>
                <p class="features__title">{title}</p>
                <p class="features__body">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <Card title="How to export from Motra" subtitle="Takes about a minute.">
          <ExportSteps />
        </Card>
      </div>
    )
  }

  const first = ds.workouts.find((w) => w.start)?.start ?? null
  const last = latestWorkoutDate.value

  return (
    <div class="stack" style={{ '--gap': 'var(--s5)' }}>
      <PageHeader title="Import" subtitle="Add newer exports or start over. Files are processed on this device." />

      <Card
        title="Stored data"
        actions={
          outcome && outcome.total > 0 ? (
            <button type="button" class="btn btn--sm" onClick={() => navigate(paths.overview())}>
              View overview
            </button>
          ) : undefined
        }
      >
        <dl class="kv">
          <dt>Workouts</dt>
          <dd>{ds.workouts.length}</dd>
          <dt>Date span</dt>
          <dd>
            {first ? formatDate(first) : '—'} – {last ? formatDate(last) : '—'}
          </dd>
          <dt>Source files</dt>
          <dd>{ds.sourceFiles.length}</dd>
          <dt>Last import</dt>
          <dd title={formatDate(new Date(ds.importedAt), 'datetime')}>{formatRelative(new Date(ds.importedAt))}</dd>
        </dl>
      </Card>

      <Card title="Add files">
        <div class="stack">
          <div class="import-mode">
            <Segmented label="Import mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
            <p class="muted import-mode__desc">{MODE_DESC[mode]}</p>
          </div>
          {dropzone}
          {feedback}
          <PrivacyNote />
        </div>
      </Card>

      <Card quiet>
        <details class="disclosure">
          <summary>
            <IconChevronRight size={14} />
            How to export from Motra
          </summary>
          <div style={{ marginTop: 16 }}>
            <ExportSteps />
          </div>
        </details>
      </Card>

      <Card title="Remove data" subtitle="Deletes every stored workout from this device. Your settings are kept.">
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
