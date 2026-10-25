import { useId, useState } from 'preact/hooks'
import { IMPORT_EMAIL } from '../../core/sync'
import { ConfirmButton } from '../../ui/components/ConfirmButton'
import { formatDate, formatRelative, plural } from '../../ui/format'
import { IconAlert, IconTrash } from '../../ui/icons'
import {
  completeSignIn,
  deleteSyncAccount,
  requestSignInCode,
  signOutSync,
  syncAccount,
  syncNow,
  syncStatus,
} from '../../sync'
import { Section, Setting } from './layout'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Email, then the six-digit code mailed to it. Signed in, the sync starts on its own. */
export function SignInForm() {
  const id = useId()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const sendCode = () =>
    run(async () => {
      const address = email.trim().toLowerCase()
      await requestSignInCode(address)
      setSentTo(address)
      setCode('')
    })

  const err = error && (
    <p class="field__error" id={`${id}-err`} role="alert">
      {error}
    </p>
  )

  if (sentTo == null) {
    return (
      <form
        class="sync-form"
        onSubmit={(e) => {
          e.preventDefault()
          void sendCode()
        }}
      >
        <label class="sr-only" for={`${id}-email`}>
          Email
        </label>
        <div class="sync-form__row">
          <input
            id={`${id}-email`}
            class="input"
            type="email"
            autocomplete="email"
            required
            placeholder="you@example.com"
            value={email}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
          <button type="submit" class="btn btn--primary" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        </div>
        {err}
      </form>
    )
  }

  return (
    <form
      class="sync-form"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() => completeSignIn(sentTo, code.trim()))
      }}
    >
      <p class="muted">
        Enter the 6-digit code sent to <strong>{sentTo}</strong>. It expires in 10 minutes.
      </p>
      <label class="sr-only" for={`${id}-code`}>
        Code
      </label>
      <div class="sync-form__row">
        <input
          id={`${id}-code`}
          class="input sync-form__code"
          inputMode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          placeholder="123456"
          value={code}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
        />
        <button type="submit" class="btn btn--primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      {err}
      <div class="row sync-form__links">
        <button type="button" class="btn btn--ghost btn--sm" disabled={busy} onClick={() => void sendCode()}>
          Send again
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={() => {
            setSentTo(null)
            setError(null)
          }}
        >
          Use a different email
        </button>
      </div>
    </form>
  )
}

/** 'at 7:46 PM' today, else 'yesterday', '3 days ago', … */
function syncedWhen(at: Date): string {
  const relative = formatRelative(at)
  return relative === 'today' ? `at ${formatDate(at, 'time')}` : relative
}

function SyncState() {
  const status = syncStatus.value
  const syncedAt = syncAccount.value?.syncedAt
  if (status.state === 'syncing') return <p class="muted">Syncing…</p>
  if (status.state === 'error') {
    return (
      <p class="sync-state sync-state--error" role="alert">
        <IconAlert size={14} />
        {status.message}
      </p>
    )
  }
  return (
    <>
      <p class="muted">
        {syncedAt ? (
          <span title={formatDate(new Date(syncedAt), 'datetime')}>Synced {syncedWhen(new Date(syncedAt))}</span>
        ) : (
          'Not synced yet'
        )}
        {status.state === 'synced' && status.added > 0 && ` · ${plural(status.added, 'workout')} added`}
      </p>
      {status.state === 'synced' && status.unreadable.length > 0 && (
        <p class="sync-state sync-state--error">
          <IconAlert size={14} />
          Couldn’t import {status.unreadable.join(', ')} from your inbox.
        </p>
      )}
    </>
  )
}

export function SyncSection() {
  const account = syncAccount.value
  const syncing = syncStatus.value.state === 'syncing'

  return (
    <Section
      id="sync"
      title="Sync"
      desc="Optional. Keeps your workouts on every device you sign in on, stored on samuelshuster.com. Signed out, nothing leaves this browser."
    >
      {account ? (
        <>
          <Setting label="Signed in" desc="Syncs when the app opens, after each import and when you come back to it.">
            <div class="stack" style={{ '--gap': 'var(--s2)' }}>
              <p>
                <strong>{account.email}</strong>
              </p>
              <SyncState />
              <div class="row" style={{ flexWrap: 'wrap' }}>
                <button type="button" class="btn" disabled={syncing} onClick={() => void syncNow()}>
                  Sync now
                </button>
                <button type="button" class="btn btn--ghost" onClick={() => void signOutSync()}>
                  Sign out
                </button>
              </div>
            </div>
          </Setting>
          <Setting
            label="Import by email"
            desc={`Forward Motra’s “Your Data Export is Ready” email from ${account.email}. The export it links is downloaded and imported on the next sync.`}
          >
            <a class="sync-email" href={`mailto:${IMPORT_EMAIL}`}>
              {IMPORT_EMAIL}
            </a>
          </Setting>
          <Setting label="Delete account" desc="Deletes the synced copy for every device and signs them out. Workouts on this device stay.">
            <ConfirmButton
              label="Delete account"
              icon={<IconTrash size={16} />}
              prompt="Delete the synced copy?"
              confirmLabel="Delete account"
              onConfirm={async () => {
                try {
                  await deleteSyncAccount()
                } catch (err) {
                  syncStatus.value = { state: 'error', message: errorText(err) }
                }
              }}
            />
          </Setting>
        </>
      ) : (
        <Setting label="Sign in" desc="With your email. No password: a 6-digit code is emailed to you each time.">
          <div class="stack" style={{ '--gap': 'var(--s2)' }}>
            {syncStatus.value.state === 'error' && <SyncState />}
            <SignInForm />
          </div>
        </Setting>
      )}
    </Section>
  )
}
