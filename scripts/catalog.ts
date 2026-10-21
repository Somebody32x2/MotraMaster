/**
 * Vocabulary catalog for Motra exports.
 *
 *   node scripts/catalog.ts <export.xlsx> [more.xlsx ...]
 *
 * Parses the files locally with the app's own parser and reports only the
 * *shape* of the data — sheet names, labels, headers, units, exercise and
 * muscle names, effort values, warnings — never weights, reps, notes or
 * workout titles. Writes catalog-output.json and catalog-output.md to the
 * current directory so the format can be shared safely.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { buildDataset } from '../src/core/dataset.ts';
import { displayLabel, normalizeKey, splitMuscles } from '../src/core/labels.ts';
import { parseWorkbookDetailed } from '../src/core/parse.ts';
import type { ParseVocabulary } from '../src/core/parse.ts';
import type { ParseWarning, Workout } from '../src/core/types.ts';

const HELP = `Usage: node scripts/catalog.ts <export.xlsx> [more.xlsx ...]

Builds a privacy-safe vocabulary report of Motra workout exports:
sheet names, summary labels, set-table headers, units, exercise and muscle
names, effort values, unrecognized columns and parser warnings.
No weights, reps, notes or workout titles are included.

Outputs (in the current directory):
  catalog-output.json   machine-readable report
  catalog-output.md     the same report as Markdown — paste this back

Options:
  -h, --help            show this message`;

type Counts = Record<string, number>;

function add(target: Counts, source: Counts): void {
  for (const [k, v] of Object.entries(source)) target[k] = (target[k] ?? 0) + v;
}

function bump(target: Counts, key: string, by = 1): void {
  target[key] = (target[key] ?? 0) + by;
}

function sortedCounts(c: Counts): { value: string; count: number }[] {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

/** Escape a value for a Markdown table cell. */
function md(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function table(headers: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) return '_none_\n';
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(md).join(' | ')} |`),
  ];
  return lines.join('\n') + '\n';
}

function main(argv: string[]): number {
  const args = argv.filter((a) => a !== '--');
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(HELP);
    return args.length === 0 ? 1 : 0;
  }

  const sheets: { file: string; name: string; rows: number; workouts: number }[] = [];
  const setHeaders: Counts = {};
  const summaryLabels: Counts = {};
  const unknownColumns: Counts = {};
  const unknownSummaryLabels: Counts = {};
  const units: Counts = {};
  const failures: { file: string; error: string }[] = [];
  const workouts: Workout[] = [];
  const warnings: ParseWarning[] = [];
  const files: string[] = [];

  for (const arg of args) {
    const path = resolve(arg);
    const file = basename(path);
    let vocabulary: ParseVocabulary;
    try {
      const parsed = parseWorkbookDetailed(readFileSync(path), file);
      vocabulary = parsed.vocabulary;
      workouts.push(...parsed.workouts);
      warnings.push(...parsed.warnings);
    } catch (err) {
      failures.push({ file, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    files.push(file);
    for (const s of vocabulary.sheets) sheets.push({ file, ...s });
    add(setHeaders, vocabulary.setHeaders);
    add(summaryLabels, vocabulary.summaryLabels);
    add(unknownColumns, vocabulary.unknownColumns);
    add(unknownSummaryLabels, vocabulary.unknownSummaryLabels);
    add(units, vocabulary.units);
  }

  const dataset = buildDataset({ workouts, warnings: [], sourceFiles: files });

  // Exercise set/workout counts.
  const exerciseSets: Counts = {};
  const exerciseWorkouts: Counts = {};
  const muscleCells: Counts = {};
  const muscleLabels: Counts = {};
  const effortValues: Counts = {};
  const workoutEffortValues: Counts = {};
  let setCount = 0;
  for (const w of dataset.workouts) {
    if (w.effortRaw !== null) bump(workoutEffortValues, w.effortRaw);
    const seen = new Set<string>();
    for (const s of w.sets) {
      setCount++;
      bump(exerciseSets, s.exerciseKey);
      seen.add(s.exerciseKey);
      bump(muscleCells, s.muscleRaw);
      for (const part of splitMuscles(s.muscleRaw)) bump(muscleLabels, part);
      if (s.effortRaw !== null) bump(effortValues, s.effortRaw);
    }
    for (const key of seen) bump(exerciseWorkouts, key);
  }

  const starts = dataset.workouts.map((w) => w.start).filter((s): s is string => s !== null).sort();
  const warningMessages: Counts = {};
  for (const w of warnings) bump(warningMessages, w.message);

  const report = {
    generatedAt: new Date().toISOString(),
    files: files.length,
    failures,
    workouts: dataset.workouts.length,
    sets: setCount,
    dateRange: starts.length > 0 ? { first: starts[0].slice(0, 10), last: starts[starts.length - 1].slice(0, 10) } : null,
    workoutsWithoutStart: dataset.workouts.length - starts.length,
    workoutsWithHeartRate: dataset.workouts.filter((w) => w.hrZonesSec !== null).length,
    sheets,
    summaryLabels: sortedCounts(summaryLabels),
    unknownSummaryLabels: sortedCounts(unknownSummaryLabels),
    setHeaders: sortedCounts(setHeaders),
    unknownColumns: sortedCounts(unknownColumns),
    units: sortedCounts(units),
    muscleCells: sortedCounts(muscleCells).map(({ value, count }) => ({
      raw: value,
      keys: splitMuscles(value).map(normalizeKey),
      count,
    })),
    muscles: sortedCounts(muscleLabels).map(({ value, count }) => ({
      raw: value,
      key: normalizeKey(value),
      display: displayLabel(value),
      count,
    })),
    exercises: Object.values(dataset.exercises)
      .map((e) => ({
        key: e.key,
        display: e.name,
        rawNames: e.rawNames,
        muscles: e.muscleKeys,
        sets: exerciseSets[e.key] ?? 0,
        workouts: exerciseWorkouts[e.key] ?? 0,
      }))
      .sort((a, b) => b.sets - a.sets || a.key.localeCompare(b.key)),
    setEffortValues: sortedCounts(effortValues),
    workoutEffortValues: sortedCounts(workoutEffortValues),
    warnings: sortedCounts(warningMessages),
  };

  const out: string[] = [];
  out.push('# MotraMaster export catalog', '');
  out.push('Vocabulary only — no weights, reps, notes or workout titles.', '');
  out.push(table(['Metric', 'Value'], [
    ['Files parsed', report.files],
    ['Files failed', failures.length],
    ['Workouts', report.workouts],
    ['Sets', report.sets],
    ['First workout', report.dateRange?.first ?? '—'],
    ['Last workout', report.dateRange?.last ?? '—'],
    ['Workouts without start time', report.workoutsWithoutStart],
    ['Workouts with heart-rate zones', report.workoutsWithHeartRate],
  ]));
  if (failures.length > 0) {
    out.push('## Unreadable files', '', table(['File', 'Error'], failures.map((f) => [f.file, f.error])));
  }
  out.push('## Sheets', '', table(['File', 'Sheet', 'Rows', 'Workouts'], sheets.map((s) => [s.file, s.name, s.rows, s.workouts])));
  out.push('## Summary labels', '', table(['Label', 'Count'], report.summaryLabels.map((r) => [r.value, r.count])));
  out.push('## Unrecognized summary labels', '', table(['Label', 'Count'], report.unknownSummaryLabels.map((r) => [r.value, r.count])));
  out.push('## Set-table headers', '', table(['Header', 'Tables'], report.setHeaders.map((r) => [r.value, r.count])));
  out.push('## Unrecognized set columns', '', table(['Header', 'Tables'], report.unknownColumns.map((r) => [r.value, r.count])));
  out.push('## Units seen', '', table(['Unit', 'Count'], report.units.map((r) => [r.value, r.count])));
  out.push('## Muscle labels', '', table(['Raw', 'Key', 'Display', 'Sets'], report.muscles.map((m) => [m.raw, m.key, m.display, m.count])));
  out.push('## Muscle cells', '', table(['Raw cell', 'Keys', 'Sets'], report.muscleCells.map((m) => [m.raw || '(empty)', m.keys.join(', '), m.count])));
  out.push('## Exercises', '', table(
    ['Key', 'Display', 'Raw spellings', 'Muscles', 'Sets', 'Workouts'],
    report.exercises.map((e) => [e.key, e.display, e.rawNames.join(' / '), e.muscles.join(', '), e.sets, e.workouts]),
  ));
  out.push('## Effort values (sets)', '', table(['Value', 'Count'], report.setEffortValues.map((r) => [r.value, r.count])));
  out.push('## Effort values (workouts)', '', table(['Value', 'Count'], report.workoutEffortValues.map((r) => [r.value, r.count])));
  out.push('## Parser warnings', '', table(['Message', 'Count'], report.warnings.map((r) => [r.value, r.count])));

  const jsonPath = resolve('catalog-output.json');
  const mdPath = resolve('catalog-output.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(mdPath, out.join('\n'));

  console.log(`Parsed ${files.length} file(s): ${report.workouts} workouts, ${report.sets} sets` +
    (report.dateRange ? `, ${report.dateRange.first} → ${report.dateRange.last}` : '') + '.');
  console.log(`${report.exercises.length} exercises, ${report.muscles.length} muscle labels, ` +
    `${report.unknownColumns.length} unrecognized columns, ${report.warnings.length} distinct warnings.`);
  for (const f of failures) console.log(`Could not read ${f.file}: ${f.error}`);
  console.log(`\nWrote ${jsonPath}\nWrote ${mdPath}`);
  console.log('\nReview catalog-output.md, then paste its contents back into the chat. It contains no weights, reps, notes or titles.');
  return failures.length > 0 && files.length === 0 ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
