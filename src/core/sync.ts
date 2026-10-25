/**
 * Optional account sync with samuelshuster.com's /api/motra (that repo's app/motra_sync.js),
 * served on the same origin as the app. An account is an email address proved by a mailed
 * code; the session is an HttpOnly cookie scoped to the API, so no credential lives in JS.
 *
 * The server stores one gzipped SyncPayload per account under a revision number and never
 * reads it. It also keeps an inbox of raw exports sent to the account by other means (e.g.
 * by email), which the app parses and merges on its next sync.
 */
import { buildDataset } from './dataset.ts';
import type { Dataset, Workout } from './types.ts';

const API = '/api/motra';

/** Mail an export here from the account's address and it lands in that account's inbox. */
export const IMPORT_EMAIL = 'motramaster@samuelshuster.com';

/** What the server stores per account. Derived indexes are rebuilt on arrival. */
export interface SyncPayload {
  version: 1;
  importedAt: string;
  workouts: Workout[];
  sourceFiles: string[];
}

export interface InboxFile {
  id: string;
  name: string;
  size: number;
  receivedAt: string;
}

export interface RemoteAccount {
  email: string;
  rev: number;
  updatedAt: string | null;
  inbox: InboxFile[];
}

/**
 * Local changes not yet on the account: none; imports to merge over the account's copy;
 * or a Replace that should overwrite it.
 */
export type Pending = 'none' | 'merge' | 'replace';

export class SyncError extends Error {
  /** The server's error code ('conflict', 'signed-out', …), 'offline', 'bad-payload' or 'http'. */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Motra': '1', ...init.headers },
    });
  } catch {
    throw new SyncError('Can’t reach the sync server. Check your connection.', 'offline');
  }
  if (res.ok) return res;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON: a proxy error page */
  }
  const fallback = res.status >= 500 ? 'The sync server is unavailable right now. Try again later.' : `The sync server answered ${res.status}.`;
  const message = stringField(body, 'message') ?? fallback;
  throw new SyncError(message, stringField(body, 'error') ?? 'http');
}

function stringField(body: unknown, key: string): string | undefined {
  const v: unknown = body && typeof body === 'object' ? Reflect.get(body, key) : undefined;
  return typeof v === 'string' ? v : undefined;
}

function numberField(body: unknown, key: string): number | undefined {
  const v: unknown = body && typeof body === 'object' ? Reflect.get(body, key) : undefined;
  return typeof v === 'number' ? v : undefined;
}

function unexpected(): SyncError {
  return new SyncError('The sync server sent an unexpected answer.', 'http');
}

function postJson(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function requestCode(email: string): Promise<void> {
  await call('/code', postJson({ email }));
}

/** Signs this browser in; resolves to the normalized address. */
export async function verifyCode(email: string, code: string): Promise<string> {
  const res = await call('/verify', postJson({ email, code }));
  const signedIn = stringField(await res.json(), 'email');
  if (signedIn === undefined) throw unexpected();
  return signedIn;
}

function isAccount(v: unknown): v is RemoteAccount {
  return stringField(v, 'email') !== undefined && numberField(v, 'rev') !== undefined && Array.isArray(Reflect.get(Object(v), 'inbox'));
}

export async function fetchAccount(): Promise<RemoteAccount> {
  const res = await call('/account');
  const body: unknown = await res.json();
  if (!isAccount(body)) throw unexpected();
  return body;
}

export async function signOut(): Promise<void> {
  await call('/signout', { method: 'POST' });
}

/** Deletes the account, its synced copy and inbox, and signs every device out. */
export async function deleteAccount(): Promise<void> {
  await call('/account', { method: 'DELETE' });
}

function isPayload(v: unknown): v is SyncPayload {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<SyncPayload>;
  return p.version === 1 && typeof p.importedAt === 'string' && Array.isArray(p.workouts) && Array.isArray(p.sourceFiles);
}

/** The account's copy and its revision; payload null while nothing has been pushed. */
export async function pullData(): Promise<{ rev: number; payload: SyncPayload | null }> {
  const res = await call('/data');
  const rev = Number(res.headers.get('X-Motra-Rev'));
  if (res.status === 204 || !res.body) return { rev, payload: null };
  const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
  const payload: unknown = JSON.parse(text);
  if (!isPayload(payload)) throw new SyncError('The synced copy is in a format this version can’t read.', 'bad-payload');
  return { rev, payload };
}

/** Replaces the account's copy if it is still at `baseRev`; resolves to the new revision. */
export async function pushData(baseRev: number, payload: SyncPayload): Promise<number> {
  const body = await new Response(
    new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip')),
  ).blob();
  const res = await call('/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/gzip', 'X-Motra-Rev': String(baseRev) },
    body,
  });
  const rev = numberField(await res.json(), 'rev');
  if (rev === undefined) throw unexpected();
  return rev;
}

export async function fetchInboxFile(id: string): Promise<ArrayBuffer> {
  return (await call(`/inbox/${id}`)).arrayBuffer();
}

export async function removeInboxFile(id: string): Promise<void> {
  await call(`/inbox/${id}`, { method: 'DELETE' });
}

export function toPayload(d: Dataset): SyncPayload {
  return { version: 1, importedAt: d.importedAt, workouts: d.workouts, sourceFiles: d.sourceFiles };
}

function fromPayload(p: SyncPayload): Dataset {
  return { ...buildDataset({ workouts: p.workouts, warnings: [], sourceFiles: p.sourceFiles }), importedAt: p.importedAt };
}

/**
 * What this device should hold after reading the account's copy.
 * - Nothing pending: the account's copy wins outright, so a Replace on another device lands here too.
 * - Unsynced imports: they are merged over the account's copy; a workout in both keeps the local version.
 * - A Replace since the last sync: the local data wins outright.
 * An empty account never empties the device.
 */
export function reconcile(local: Dataset | null, remote: SyncPayload | null, pending: Pending): Dataset | null {
  if (!remote || pending === 'replace') return local;
  const theirs = fromPayload(remote);
  if (pending === 'none' || !local) return theirs;
  const merged = buildDataset({ workouts: local.workouts, warnings: local.warnings, sourceFiles: local.sourceFiles }, theirs);
  return { ...merged, importedAt: local.importedAt > remote.importedAt ? local.importedAt : remote.importedAt };
}
