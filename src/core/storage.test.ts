import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from './storage.ts';
import { DEFAULT_SETTINGS } from './types.ts';

function stubStorage(value: unknown): void {
  const text = JSON.stringify(value);
  vi.stubGlobal('localStorage', { getItem: () => text, setItem: () => undefined });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSettings', () => {
  it('defaults when storage is unavailable', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid strength/trim settings and clamps the grace', () => {
    stubStorage({ strengthMetric: 'actual', trimIdle: false, trimGraceMin: -3 });
    expect(loadSettings()).toMatchObject({ strengthMetric: 'actual', trimIdle: false, trimGraceMin: 0 });
    stubStorage({ trimGraceMin: 999 });
    expect(loadSettings().trimGraceMin).toBe(60);
    stubStorage({ trimGraceMin: 7.5 });
    expect(loadSettings().trimGraceMin).toBe(7.5);
  });

  it('falls back to defaults for invalid strength/trim values', () => {
    stubStorage({ strengthMetric: 'bogus', trimIdle: 'yes', trimGraceMin: '10' });
    const s = loadSettings();
    expect(s.strengthMetric).toBe(DEFAULT_SETTINGS.strengthMetric);
    expect(s.trimIdle).toBe(DEFAULT_SETTINGS.trimIdle);
    expect(s.trimGraceMin).toBe(DEFAULT_SETTINGS.trimGraceMin);
  });
});
