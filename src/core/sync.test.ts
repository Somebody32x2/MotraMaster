import { describe, expect, it } from 'vitest';
import { buildDataset } from './dataset.ts';
import { reconcile, toPayload, type SyncPayload } from './sync.ts';
import type { Dataset, Workout } from './types.ts';

function workout(id: string, start: string, title = id): Workout {
  return {
    id,
    title,
    start,
    end: null,
    durationSec: null,
    totalSets: 0,
    calories: null,
    tvlLb: null,
    effort: null,
    effortRaw: null,
    hrZonesSec: null,
    summaryExtra: {},
    sets: [],
    sourceFile: 'a.xlsx',
  };
}

function dataset(workouts: Workout[], importedAt: string): Dataset {
  return { ...buildDataset({ workouts, warnings: [], sourceFiles: ['a.xlsx'] }), importedAt };
}

function payload(workouts: Workout[], importedAt: string): SyncPayload {
  return toPayload(dataset(workouts, importedAt));
}

const ids = (d: Dataset | null) => d?.workouts.map((w) => w.id);

describe('reconcile', () => {
  const local = dataset([workout('a', '2026-01-01T10:00'), workout('b', '2026-01-02T10:00', 'local B')], '2026-02-01T00:00:00.000Z');
  const remote = payload([workout('b', '2026-01-02T10:00', 'remote B'), workout('c', '2026-01-03T10:00')], '2026-03-01T00:00:00.000Z');

  it('takes the account copy outright when nothing is pending, so a Replace elsewhere lands here', () => {
    const next = reconcile(local, remote, 'none');
    expect(ids(next)).toEqual(['b', 'c']);
    expect(next?.workouts[0].title).toBe('remote B');
    expect(next?.importedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('merges unsynced imports over the account copy, keeping the local version of a shared workout', () => {
    const next = reconcile(local, remote, 'merge');
    expect(ids(next)).toEqual(['a', 'b', 'c']);
    expect(next?.workouts.find((w) => w.id === 'b')?.title).toBe('local B');
    expect(next?.importedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('keeps local data after a Replace, ignoring the account copy', () => {
    expect(reconcile(local, remote, 'replace')).toBe(local);
  });

  it('never empties the device when the account has no copy yet', () => {
    expect(reconcile(local, null, 'none')).toBe(local);
    expect(reconcile(local, null, 'merge')).toBe(local);
  });

  it('adopts the account copy on an empty device', () => {
    expect(ids(reconcile(null, remote, 'merge'))).toEqual(['b', 'c']);
  });
});
