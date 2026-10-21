import { computed, effect, signal } from '@preact/signals'
import { buildDataset } from './core/dataset'
import { parseWorkbook } from './core/parse'
import { clearDataset, loadDataset, loadSettings, saveDataset, saveSettings } from './core/storage'
import type { Dataset, ParseWarning, Settings, Workout } from './core/types'
import { parseLocalIso } from './ui/format'

export type RangeKey = '4w' | '3m' | '6m' | '1y' | 'all'

export const RANGE_OPTIONS: Array<{ value: RangeKey; label: string; title: string }> = [
  { value: '4w', label: '4W', title: 'Last 4 weeks' },
  { value: '3m', label: '3M', title: 'Last 3 months' },
  { value: '6m', label: '6M', title: 'Last 6 months' },
  { value: '1y', label: '1Y', title: 'Last 12 months' },
  { value: 'all', label: 'All', title: 'All time' },
]

const RANGE_STORAGE_KEY = 'motramaster.range'

function loadRange(): RangeKey {
  try {
    const v = localStorage.getItem(RANGE_STORAGE_KEY)
    if (RANGE_OPTIONS.some((o) => o.value === v)) return v as RangeKey
  } catch {
    /* storage unavailable */
  }
  return '3m'
}

export const dataset = signal<Dataset | null>(null)
export const settings = signal<Settings>(loadSettings())
export const loading = signal<boolean>(true)
export const range = signal<RangeKey>(loadRange())

export const detailed = computed(() => settings.value.detail === 'detailed')

const darkQuery = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)')
const systemDark = signal<boolean>(darkQuery?.matches ?? false)
darkQuery?.addEventListener('change', (e) => {
  systemDark.value = e.matches
})

/** Theme actually in effect after resolving 'system'. */
export const resolvedTheme = computed<'light' | 'dark'>(() => {
  const pref = settings.value.theme
  if (pref === 'system') return systemDark.value ? 'dark' : 'light'
  return pref
})

/** Start of the most recent dated workout; null when no workout has a start time. */
export const latestWorkoutDate = computed<Date | null>(() => {
  const ws = dataset.value?.workouts
  if (!ws?.length) return null
  for (let i = ws.length - 1; i >= 0; i--) {
    const start = ws[i].start
    if (start) return parseLocalIso(start)
  }
  return null
})

/**
 * First instant included by `range`, anchored at the latest workout (not "now") so stale
 * exports still show data. `null` means unbounded.
 */
export function rangeStartDate(r: RangeKey, latest: Date): Date | null {
  const d = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate())
  switch (r) {
    case '4w':
      d.setDate(d.getDate() - 27)
      return d
    case '3m':
      d.setMonth(d.getMonth() - 3)
      d.setDate(d.getDate() + 1)
      return d
    case '6m':
      d.setMonth(d.getMonth() - 6)
      d.setDate(d.getDate() + 1)
      return d
    case '1y':
      d.setFullYear(d.getFullYear() - 1)
      d.setDate(d.getDate() + 1)
      return d
    case 'all':
      return null
  }
}

/** Workouts inside the active range (all undated workouts are excluded unless range is 'all'). */
export const rangedWorkouts = computed<Workout[]>(() => {
  const ws = dataset.value?.workouts ?? []
  const latest = latestWorkoutDate.value
  const start = latest ? rangeStartDate(range.value, latest) : null
  if (!start) return ws
  const t = start.getTime()
  return ws.filter((w) => w.start != null && parseLocalIso(w.start).getTime() >= t)
})

// Persistence and document side effects.
effect(() => {
  saveSettings(settings.value)
})

effect(() => {
  const r = range.value
  try {
    localStorage.setItem(RANGE_STORAGE_KEY, r)
  } catch {
    /* storage unavailable */
  }
})

effect(() => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const pref = settings.value.theme
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
  const meta = document.querySelector('meta[name="theme-color"]')
  // Matches --bg in tokens.css.
  meta?.setAttribute('content', resolvedTheme.value === 'dark' ? '#121210' : '#f6f5f2')
})

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch }
}

export async function boot(): Promise<void> {
  loading.value = true
  try {
    dataset.value = await loadDataset()
  } catch (err) {
    console.error('Failed to load stored data', err)
    dataset.value = null
  } finally {
    loading.value = false
  }
}

export interface ImportResult {
  /** Workouts not previously stored. */
  added: number
  /** Workouts stored after the import. */
  total: number
  /** Workouts read from the files (including ones already stored). */
  parsed: number
  warnings: ParseWarning[]
}

export async function importFiles(files: File[], mode: 'merge' | 'replace'): Promise<ImportResult> {
  const workouts: Workout[] = []
  const warnings: ParseWarning[] = []
  const sourceFiles: string[] = []

  for (const file of files) {
    try {
      const parsed = parseWorkbook(await file.arrayBuffer(), file.name)
      workouts.push(...parsed.workouts)
      warnings.push(...parsed.warnings)
      if (parsed.workouts.length > 0) sourceFiles.push(file.name)
      else warnings.push({ file: file.name, message: 'No workouts were found in this file.' })
    } catch (err) {
      warnings.push({
        file: file.name,
        message: `Could not read this file${err instanceof Error && err.message ? `: ${err.message}` : '.'}`,
      })
    }
  }

  const previous = dataset.value
  if (workouts.length === 0) {
    // Nothing usable — never wipe existing data on a failed import.
    return { added: 0, total: previous?.workouts.length ?? 0, parsed: 0, warnings }
  }

  const base = mode === 'merge' ? previous : null
  const next = buildDataset({ workouts, warnings, sourceFiles }, base)
  const known = new Set(base?.workouts.map((w) => w.id) ?? [])
  const added = next.workouts.reduce((n, w) => (known.has(w.id) ? n : n + 1), 0)

  await saveDataset(next)
  dataset.value = next
  return { added, total: next.workouts.length, parsed: workouts.length, warnings }
}

export async function clearData(): Promise<void> {
  await clearDataset()
  dataset.value = null
}
