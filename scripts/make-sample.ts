/**
 * Writes a synthetic Motra-style export for development: several months of
 * fabricated push/pull/legs sessions in Motra's stacked-block layout, with a
 * few deliberately awkward labels (camelCase ids, multi-muscle cells, an
 * unknown muscle) to exercise the parser and the "Other" bucket.
 *
 *   node scripts/make-sample.ts [out.xlsx] [weeks]
 *
 * Fake data only; output is gitignored like every .xlsx.
 */
import * as XLSX from 'xlsx'
import { writeFileSync } from 'node:fs'

const out = process.argv[2] ?? 'sample-synthetic.xlsx'
const weeks = Number(process.argv[3] ?? 26)

// Deterministic PRNG so runs are reproducible.
let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]

interface Lift { name: string; muscles: string; start: number; step: number; reps: [number, number]; gain: number }

const DAYS: Record<string, { title: string; lifts: Lift[] }> = {
  push: {
    title: 'Chest Shoulders and Triceps',
    lifts: [
      { name: 'Barbell Bench Press', muscles: 'chest', start: 135, step: 5, reps: [5, 10], gain: 0.006 },
      { name: 'Machine Seated Chest Press', muscles: 'chest', start: 180, step: 10, reps: [6, 12], gain: 0.007 },
      { name: 'Dumbbell Shoulder Press', muscles: 'shoulders', start: 40, step: 5, reps: [8, 12], gain: 0.005 },
      { name: 'Machine Fly (Pec Dec)', muscles: 'chest', start: 100, step: 5, reps: [10, 14], gain: 0.004 },
      { name: 'Cable Tricep Pushdown', muscles: 'triceps', start: 50, step: 5, reps: [10, 15], gain: 0.004 },
      { name: 'Dumbbell Lateral Raise', muscles: 'shoulders', start: 15, step: 2.5, reps: [12, 15], gain: 0.003 },
    ],
  },
  pull: {
    title: 'Back and Biceps',
    lifts: [
      { name: 'Cable Lat Pulldown', muscles: 'lats', start: 120, step: 5, reps: [8, 12], gain: 0.006 },
      { name: 'Barbell Bent Over Row', muscles: 'lats, traps', start: 115, step: 5, reps: [6, 10], gain: 0.005 },
      { name: 'Machine Row', muscles: 'lats', start: 130, step: 10, reps: [8, 12], gain: 0.005 },
      { name: 'Dumbbell Bicep Curl', muscles: 'biceps', start: 25, step: 2.5, reps: [8, 12], gain: 0.004 },
      { name: 'Cable Face Pull', muscles: 'shoulders; traps', start: 40, step: 5, reps: [12, 15], gain: 0.003 },
      { name: 'Wrist Roller', muscles: 'grip', start: 10, step: 2.5, reps: [3, 5], gain: 0.002 },
    ],
  },
  legs: {
    title: 'Legs',
    lifts: [
      { name: 'Barbell Back Squat', muscles: 'quads, glutes', start: 155, step: 10, reps: [5, 8], gain: 0.007 },
      { name: 'Barbell Romanian Deadlift', muscles: 'hamstrings, glutes, lowerBack', start: 135, step: 10, reps: [6, 10], gain: 0.006 },
      { name: 'Machine Leg Press', muscles: 'quads', start: 270, step: 20, reps: [8, 12], gain: 0.008 },
      { name: 'Machine Seated Leg Curl', muscles: 'hamstrings', start: 90, step: 5, reps: [10, 12], gain: 0.004 },
      { name: 'Machine Standing Calf Raise', muscles: 'calves', start: 120, step: 10, reps: [10, 15], gain: 0.004 },
      { name: 'Machine Hip Adduction', muscles: 'adductors', start: 110, step: 10, reps: [10, 15], gain: 0.003 },
    ],
  },
}

const ROTATION = ['push', 'pull', 'legs']
const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const zone = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)
const roundTo = (x: number, step: number) => Math.round(x / step) * step

const rows: unknown[][] = []
const end = new Date()
end.setHours(0, 0, 0, 0)
const first = new Date(end)
first.setDate(first.getDate() - weeks * 7)

let session = 0
for (const d = new Date(first); d <= end; d.setDate(d.getDate() + 1)) {
  const dow = d.getDay()
  // Mon/Wed/Fri/Sat-ish schedule with ~15% skipped days and a 10-day break mid-way.
  if (![1, 3, 5, 6].includes(dow) || rand() < 0.15) continue
  const daysIn = (d.getTime() - first.getTime()) / 86400000
  if (daysIn > weeks * 3.5 && daysIn < weeks * 3.5 + 10) continue

  const kind = ROTATION[session++ % 3]
  const plan = DAYS[kind]
  const start = new Date(d)
  start.setHours(6 + Math.floor(rand() * 12), Math.floor(rand() * 60), Math.floor(rand() * 60))

  const setRows: unknown[][] = []
  let elapsed = 0
  let tvl = 0
  const lifts = plan.lifts.filter(() => rand() > 0.15)
  for (const lift of lifts) {
    const progress = 1 + lift.gain * daysIn * (0.8 + rand() * 0.4)
    const work = roundTo(lift.start * progress, lift.step)
    const nSets = 3 + Math.floor(rand() * 2)
    for (let s = 0; s < nSets; s++) {
      const ramp = s === 0 && rand() < 0.5 ? 0.7 : 1
      const weight = roundTo(work * ramp, lift.step)
      const reps = Math.max(1, lift.reps[0] + Math.floor(rand() * (lift.reps[1] - lift.reps[0] + 1)) - s)
      const time = reps * (2.2 + rand() * 1.6)
      const rest = s === 0 ? (setRows.length === 0 ? 0 : 150 + Math.floor(rand() * 200)) : 90 + Math.floor(rand() * 150)
      const effort = rand() < 0.3 ? pick([6, 7, 7.5, 8, 8.5, 9, 10]) : ''
      setRows.push([lift.name, weight, reps, time, 0, rest, effort, lift.muscles, ''])
      elapsed += time + rest
      tvl += weight * reps
    }
  }
  const duration = Math.round(elapsed + 120)
  const endTime = new Date(start.getTime() + duration * 1000)
  const z = [0.35, 0.45, 0.15, 0.04, 0.01].map((f) => Math.round(duration * f * (0.8 + rand() * 0.3)))
  const dayName = start.toLocaleDateString('en-US', { weekday: 'long' })
  const part = start.getHours() < 12 ? 'Morning' : start.getHours() < 17 ? 'Afternoon' : 'Evening'

  rows.push(
    [`${dayName} ${part} ${plan.title} Session`],
    ['Workout Start', stamp(start)],
    ['Workout End', stamp(endTime)],
    ['Total Duration (seconds)', duration],
    ['Total Sets', setRows.length],
    ['Burned Calories', Math.round(duration / 60 * (5 + rand() * 2))],
    ['Total TVL (lbs)', Math.round(tvl)],
    ['Effort', rand() < 0.4 ? pick([6, 7, 8, 9]) : 'N/A'],
    ['   '],
    ['Heart Rate Zones'],
    ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'],
    z.map(zone),
    ['   '],
    ['All Sets'],
    ['Exercise', 'Weight (lbs)', 'Reps', 'Time (seconds)', 'Distance (ft)', 'Rest Time (seconds)', 'Effort', 'Primary Muscle Groups', 'Note'],
    ...setRows,
    [''],
  )
}

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Workouts')
writeFileSync(out, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
console.log(`Wrote ${out}: ${session} synthetic workouts over ${weeks} weeks.`)
