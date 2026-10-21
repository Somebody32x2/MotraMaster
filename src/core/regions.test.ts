import { describe, expect, it } from 'vitest';
import { normalizeKey } from './labels.ts';
import { catalogLookup, REGION_ORDER, REGIONS, regionName, resolveMuscle } from './regions.ts';

describe('resolveMuscle', () => {
  it('maps synonyms from the §2.2 table', () => {
    expect(resolveMuscle('pecs')).toEqual({ chest: 1 });
    expect(resolveMuscle('rear delts')).toEqual({ shoulders: 1 });
    expect(resolveMuscle('rhomboids')).toEqual({ traps: 1 });
    expect(resolveMuscle('erector spinae')).toEqual({ lowerBack: 1 });
    expect(resolveMuscle('tfl')).toEqual({ abductors: 1 });
  });

  it('handles Motra camelCase ids after normalizeKey', () => {
    expect(resolveMuscle(normalizeKey('lowerBack'))).toEqual({ lowerBack: 1 });
    expect(resolveMuscle(normalizeKey('hipFlexors'))).toEqual({ hipFlexors: 1 });
    expect(resolveMuscle(normalizeKey('tibialisAnterior'))).toEqual({ tibialisAnterior: 1 });
    expect(resolveMuscle('lowerBack')).toEqual({ lowerBack: 1 });
    expect(resolveMuscle('lower-back')).toEqual({ lowerBack: 1 });
  });

  it('retries without a trailing s', () => {
    expect(resolveMuscle('clavicular pecs')).toEqual({ chest: 1 });
  });

  it('splits group labels equally', () => {
    expect(resolveMuscle('back')).toEqual({ lats: 0.5, traps: 0.5 });
    const arms = resolveMuscle('arms');
    expect(Object.keys(arms).sort()).toEqual(['biceps', 'forearms', 'triceps']);
    expect(arms.biceps).toBeCloseTo(1 / 3);
    const legs = resolveMuscle('legs');
    expect(Object.values(legs).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1);
  });

  it('applies the ordered keyword fallback', () => {
    expect(resolveMuscle('biceps femoris long head')).toEqual({ hamstrings: 1 });
    expect(resolveMuscle('rectus femoris')).toEqual({ quads: 1 });
    expect(resolveMuscle('left rectus femoris')).toEqual({ quads: 1 });
    expect(resolveMuscle('upper back muscles')).toEqual({ traps: 1 });
    expect(resolveMuscle('outer glute medius')).toEqual({ abductors: 1 });
  });

  it('sends unknown and empty labels to other', () => {
    expect(resolveMuscle('plyometric thing')).toEqual({ other: 1 });
    expect(resolveMuscle('')).toEqual({ other: 1 });
    expect(resolveMuscle(normalizeKey('N/A'))).toEqual({ other: 1 });
  });

  it('maps full body and cardio buckets', () => {
    expect(resolveMuscle(normalizeKey('fullBody'))).toEqual({ fullBody: 1 });
    expect(resolveMuscle('conditioning')).toEqual({ cardio: 1 });
  });
});

describe('regions meta', () => {
  it('orders every region exactly once', () => {
    expect([...REGION_ORDER].sort()).toEqual(Object.keys(REGIONS).sort());
    expect(regionName('lowerBack')).toBe('Lower Back');
    expect(REGIONS.other.drawn).toBe(false);
  });
});

describe('catalogLookup', () => {
  it('finds Motra exercises case/space-insensitively', () => {
    const bench = catalogLookup('Barbell Bench Press');
    expect(bench?.m.chest).toBe(10);
    expect(bench?.d).toEqual(['front']);
    expect(catalogLookup('  barbell   BENCH press ')).toEqual(bench);
    expect(catalogLookup('my custom thing')).toBeNull();
  });
});
