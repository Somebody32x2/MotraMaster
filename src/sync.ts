/**
 * Optional sync: which account this browser is signed in to, what it has not pushed yet,
 * and the sync pass. Signed out (the default) nothing leaves the browser and none of this runs.
 */
import { signal } from '@preact/signals'
import { buildDataset } from './core/dataset'
import { parseWorkbook } from './core/parse'
import { saveDataset } from './core/storage'
import * as api from './core/sync'
import type { Dataset } from './core/types'
import { clearData, dataset } from './state'

const STORAGE_KEY = 'motramaster.sync'
const PENDING: readonly api.Pending[] = ['none', 'merge', 'replace']
/** A conflict means another device pushed mid-pass; this many fresh passes before giving up. */
const MAX_PASSES = 3
/** Coming back to the app re-syncs at most this often. */
const RESYNC_ON_FOCUS_MS = 60_000

export interface SyncAccount {
  email: string
  /** Account revision this device last matched. */
  rev: number
  pending: api.Pending
  /** ISO time of the last completed sync. */
  syncedAt: string | null
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'syncing' }
  /** `added`: workouts that arrived from other devices or the inbox; `unreadable`: inbox files that could not be imported. */
  | { state: 'synced'; added: number; unreadable: string[] }
  | { state: 'error'; message: string }

function loadAccount(): SyncAccount | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const a = raw as Partial<SyncAccount>
    if (typeof a.email !== 'string' || typeof a.rev !== 'number' || !PENDING.includes(a.pending as api.Pending)) return null
    return {
      email: a.email,
      rev: a.rev,
      pending: a.pending as api.Pending,
      syncedAt: typeof a.syncedAt === 'string' ? a.syncedAt : null,
    }
  } catch {
    return null
  }
}

export const syncAccount = signal<SyncAccount | null>(loadAccount())
export const syncStatus = signal<SyncStatus>({ state: 'idle' })

function setAccount(a: SyncAccount | null): void {
  syncAccount.value = a
  try {
    if (a) localStorage.setItem(STORAGE_KEY, JSON.stringify(a))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: signed in for this session only */
  }
}

function patchAccount(patch: Partial<SyncAccount>): void {
  const a = syncAccount.value
  if (a) setAccount({ ...a, ...patch })
}

async function commitLocal(next: Dataset): Promise<void> {
  await saveDataset(next)
  dataset.value = next
}

/**
 * One pass: read the account, fold its copy and inbox into the local data, push the result.
 * Resolves false when the local data changed underneath (an import landed), so the caller runs again.
 */
async function pass(): Promise<{ done: boolean; added: number; unreadable: string[] }> {
  const account = await api.fetchAccount()
  const me = syncAccount.value
  if (!me) return { done: true, added: 0, unreadable: [] }
  const local = dataset.value
  let next = local
  let rev = me.rev
  if (account.rev !== me.rev) {
    const pulled = await api.pullData()
    next = api.reconcile(local, pulled.payload, me.pending)
    rev = pulled.rev
  }

  const imported: string[] = []
  const unreadable: string[] = []
  for (const file of account.inbox) {
    try {
      const parsed = parseWorkbook(await api.fetchInboxFile(file.id), file.name)
      if (parsed.workouts.length === 0) throw new Error('no workouts')
      next = buildDataset({ workouts: parsed.workouts, warnings: parsed.warnings, sourceFiles: [file.name] }, next)
      imported.push(file.id)
    } catch (err) {
      if (err instanceof api.SyncError) throw err
      unreadable.push(file.name)
    }
  }

  if (dataset.value !== local) return { done: false, added: 0, unreadable }
  const known = new Set(local?.workouts.map((w) => w.id))
  const added = next ? next.workouts.reduce((n, w) => (known.has(w.id) ? n : n + 1), 0) : 0
  if (next && next !== local) await commitLocal(next)
  patchAccount({ rev })

  if (next && (me.pending !== 'none' || imported.length > 0)) {
    rev = await api.pushData(rev, api.toPayload(next))
    patchAccount({ rev })
  }
  for (const id of imported) await api.removeInboxFile(id)

  // An import that landed during the push is still pending; the caller runs again for it.
  const settled = dataset.value === next
  if (settled) patchAccount({ pending: 'none', syncedAt: new Date().toISOString() })
  return { done: settled, added, unreadable }
}

let running: Promise<void> | null = null
let rerun = false
let lastStarted = 0

/** Sync now, or once more after the sync in flight. Never rejects; failures land in syncStatus. */
export function syncNow(): Promise<void> {
  if (!syncAccount.value) return Promise.resolve()
  if (running) {
    rerun = true
    return running
  }
  lastStarted = Date.now()
  syncStatus.value = { state: 'syncing' }
  running = (async () => {
    let added = 0
    let unreadable: string[] = []
    try {
      for (let passes = 0; ; ) {
        rerun = false
        try {
          const r = await pass()
          added += r.added
          unreadable = r.unreadable
          if (r.done && !rerun) break
        } catch (err) {
          if (!(err instanceof api.SyncError && err.code === 'conflict')) throw err
        }
        if (++passes >= MAX_PASSES) throw new Error('Sync didn’t settle because the data kept changing. Try again.')
      }
      syncStatus.value = { state: 'synced', added, unreadable }
    } catch (err) {
      if (err instanceof api.SyncError && err.code === 'signed-out') setAccount(null)
      syncStatus.value = { state: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      running = null
    }
  })()
  return running
}

/** Sync on start and when the app comes back to the foreground. */
export function startSync(): void {
  void syncNow()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastStarted > RESYNC_ON_FOCUS_MS) void syncNow()
  })
}

export async function requestSignInCode(email: string): Promise<void> {
  await api.requestCode(email)
}

/** Signs in and syncs. Data already on this device is merged into the account's. */
export async function completeSignIn(email: string, code: string): Promise<void> {
  const confirmed = await api.verifyCode(email, code)
  setAccount({ email: confirmed, rev: 0, pending: dataset.value ? 'merge' : 'none', syncedAt: null })
  await syncNow()
}

/** Records a local import so the next sync merges it in (or, for Replace, overwrites the account's copy), then syncs. */
export function noteImport(mode: 'merge' | 'replace'): void {
  const a = syncAccount.value
  if (!a) return
  patchAccount({ pending: mode === 'replace' || a.pending === 'replace' ? 'replace' : 'merge' })
  void syncNow()
}

/** Forgets the account on this device. The data here and in the account stays. */
export async function signOutSync(): Promise<void> {
  try {
    await api.signOut()
  } catch {
    /* offline: the server session lapses on its own; this device forgets it now */
  }
  setAccount(null)
  syncStatus.value = { state: 'idle' }
}

/** Deletes the account and its synced copy for every device. This device keeps its data. */
export async function deleteSyncAccount(): Promise<void> {
  await api.deleteAccount()
  setAccount(null)
  syncStatus.value = { state: 'idle' }
}

/** Removes the data from this device. Signed in, it also signs out, or the next sync would bring it all back. */
export async function clearDevice(): Promise<void> {
  if (syncAccount.value) await signOutSync()
  await clearData()
}
