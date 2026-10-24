/**
 * Persistence: the dataset lives in IndexedDB (it can be large), settings in
 * localStorage (small, read synchronously at startup). Both degrade to
 * "nothing stored" when the APIs are unavailable (private mode, tests, SSR).
 */
import { DEFAULT_SETTINGS } from './types.ts';
import type { Dataset, Settings } from './types.ts';

const DB_NAME = 'motramaster';
const DB_VERSION = 1;
const STORE = 'kv';
const DATASET_KEY = 'dataset';
const SETTINGS_KEY = 'motramaster.settings';

function idb(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema: step aside and reopen next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  }).catch((err: unknown) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const factory = idb();
  if (!factory) throw new Error('IndexedDB is not available in this browser.');
  const db = await openDb(factory);
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function isDataset(value: unknown): value is Dataset {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<Dataset>;
  return d.version === 1 && Array.isArray(d.workouts) && typeof d.exercises === 'object' && typeof d.muscles === 'object';
}

/** Stored dataset, or null when nothing is stored, storage is unavailable, or the record is unusable. */
export async function loadDataset(): Promise<Dataset | null> {
  if (!idb()) return null;
  try {
    const value = await run<unknown>('readonly', (s) => s.get(DATASET_KEY));
    return isDataset(value) ? value : null;
  } catch {
    return null;
  }
}

/** Persist the dataset. Rejects when storage is unavailable or full so the UI can say so. */
export async function saveDataset(d: Dataset): Promise<void> {
  await run('readwrite', (s) => s.put(d, DATASET_KEY));
}

export async function clearDataset(): Promise<void> {
  if (!idb()) return;
  await run('readwrite', (s) => s.delete(DATASET_KEY));
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function positiveOrNull(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

/** Settings from localStorage merged over DEFAULT_SETTINGS; each field validated independently. */
export function loadSettings(): Settings {
  const ls = storage();
  if (!ls) return { ...DEFAULT_SETTINGS };
  let raw: unknown;
  try {
    const text = ls.getItem(SETTINGS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const year = r.birthYear;
  return {
    units: oneOf(r.units, ['lb', 'kg'], d.units),
    theme: oneOf(r.theme, ['system', 'light', 'dark'], d.theme),
    detail: oneOf(r.detail, ['normal', 'detailed'], d.detail),
    oneRmFormula: oneOf(
      r.oneRmFormula,
      ['auto', 'epley', 'brzycki', 'lombardi', 'mayhew', 'wathan', 'oconner'],
      d.oneRmFormula,
    ),
    bodyweightLb: positiveOrNull(r.bodyweightLb, 2000),
    heightCm: positiveOrNull(r.heightCm, 300),
    sex: oneOf(r.sex, ['male', 'female', 'unspecified'], d.sex),
    birthYear: typeof year === 'number' && Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : d.birthYear,
    strengthMetric: oneOf(r.strengthMetric, ['e1rm', 'actual'], d.strengthMetric),
    trimIdle: typeof r.trimIdle === 'boolean' ? r.trimIdle : d.trimIdle,
    trimGraceMin:
      typeof r.trimGraceMin === 'number' && Number.isFinite(r.trimGraceMin)
        ? Math.min(60, Math.max(0, r.trimGraceMin))
        : d.trimGraceMin,
    dropSetCredit: r.dropSetCredit === 0 || r.dropSetCredit === 0.5 || r.dropSetCredit === 1 ? r.dropSetCredit : d.dropSetCredit,
  };
}

export function saveSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Quota exceeded or storage disabled: settings simply won't persist this session.
  }
}
