import { describe, expect, it } from 'vitest';
import { normalizeKey } from './labels.ts';
import { catalogLookup, catalogSource, explainMuscle, inferDeltHeads, REGION_ORDER, REGIONS, regionName, resolveMuscle } from './regions.ts';

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

describe('explainMuscle', () => {
  it('flags Motra official ids', () => {
    expect(explainMuscle('chest')).toEqual({ regions: { chest: 1 }, via: 'motra' });
    expect(explainMuscle('lowerBack')).toEqual({ regions: { lowerBack: 1 }, via: 'motra' });
    expect(explainMuscle(normalizeKey('hipFlexors')).via).toBe('motra');
    expect(explainMuscle('tibialis anterior').via).toBe('motra');
    expect(explainMuscle('neck').via).toBe('synonym');
  });

  it('reports synonym hits, including the trailing-s retry', () => {
    expect(explainMuscle('grip')).toEqual({ regions: { forearms: 1 }, via: 'synonym' });
    expect(explainMuscle('pecs').via).toBe('synonym');
    expect(explainMuscle('clavicular pecs')).toEqual({ regions: { chest: 1 }, via: 'synonym' });
  });

  it('reports group splits', () => {
    expect(explainMuscle('back')).toEqual({ regions: { lats: 0.5, traps: 0.5 }, via: 'group' });
    expect(explainMuscle('core').via).toBe('group');
    expect(explainMuscle('lower body').via).toBe('group');
  });

  it('reports keyword fallback matches', () => {
    expect(explainMuscle('biceps femoris long head')).toEqual({ regions: { hamstrings: 1 }, via: 'keyword' });
    expect(explainMuscle('grip strength').via).toBe('keyword');
  });

  it('reports unmatched labels as other', () => {
    expect(explainMuscle('plyometric thing')).toEqual({ regions: { other: 1 }, via: 'other' });
  });

  it('shares its regions with resolveMuscle', () => {
    for (const k of ['chest', 'grip', 'back', 'upper back muscles', 'plyometric thing']) {
      expect(resolveMuscle(k)).toBe(explainMuscle(k).regions);
    }
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

  it('falls back to the MotraMaster additions library', () => {
    const names = [
      'Machine Tricep Press', 'Machine Rear Delt (Reverse) Fly', 'Machine Tricep Extension',
      'Machine Hammer-Grip Shoulder Press', 'Machine Lateral Raise', 'Machine Shoulder Press',
      'Ring Pull-Up', 'Ab Rollout', 'Machine Overhead Tricep Extension', 'Bicycle Crunch',
    ];
    for (const n of names) {
      expect(catalogLookup(n), n).not.toBeNull();
      expect(catalogSource(n), n).toBe('extra');
    }
    expect(catalogSource('Barbell Bench Press')).toBe('motra');
    expect(catalogSource('my custom thing')).toBeNull();

    const fly = catalogLookup('Machine Rear Delt (Reverse) Fly');
    expect(fly?.m.shoulders).toBeGreaterThanOrEqual(8);
    expect(fly?.m.traps).toBeGreaterThanOrEqual(8);
    expect(fly?.d).toEqual(['rear']);
    expect(catalogLookup('Machine Lateral Raise')?.d).toEqual(['side']);
    expect(catalogLookup('Machine Shoulder Press')?.d).toEqual(['front', 'side']);
    const ring = catalogLookup('Ring Pull-Up');
    expect(ring?.m.lats).toBeGreaterThanOrEqual(8);
    expect(ring?.m.biceps).toBeGreaterThanOrEqual(8);
    expect(catalogLookup('Bicycle Crunch')?.m.obliques).toBeGreaterThanOrEqual(8);
  });

  it('normalizes case, spacing, hyphens and parentheses', () => {
    const fly = catalogLookup('Machine Rear Delt (Reverse) Fly');
    expect(catalogLookup('  machine  REAR delt ( reverse )  fly ')).toEqual(fly);
    expect(catalogLookup('Machine Rear Delt Reverse Fly')).toEqual(fly);
    expect(catalogLookup('ring pull up')).toEqual(catalogLookup('Ring Pull-Up'));
    expect(catalogLookup('MachineLateralRaise')).toEqual(catalogLookup('Machine Lateral Raise'));
  });
});

describe('inferDeltHeads', () => {
  it('maps name keywords to delt heads', () => {
    expect(inferDeltHeads('Cable Rear Delt Fly')).toEqual(['rear']);
    expect(inferDeltHeads('Band Reverse Fly')).toEqual(['rear']);
    expect(inferDeltHeads('Rope Face Pull')).toEqual(['rear']);
    expect(inferDeltHeads('Band Pull-Apart')).toEqual(['rear']);
    expect(inferDeltHeads('Lean-Away Lateral Raise')).toEqual(['side']);
    expect(inferDeltHeads('Side Raise')).toEqual(['side']);
    expect(inferDeltHeads('Cable Upright Row')).toEqual(['side']);
    expect(inferDeltHeads('Plate Front Raise')).toEqual(['front']);
    expect(inferDeltHeads('Seated Shoulder Press')).toEqual(['front', 'side']);
    expect(inferDeltHeads('Landmine Overhead Press')).toEqual(['front', 'side']);
    expect(inferDeltHeads('Military Press')).toEqual(['front', 'side']);
    expect(inferDeltHeads('Dumbbell Arnold Press')).toEqual(['front', 'side']);
  });

  it('returns nothing for non-shoulder names', () => {
    expect(inferDeltHeads('Barbell Back Squat')).toEqual([]);
    expect(inferDeltHeads('Overhead Tricep Extension')).toEqual([]);
    expect(inferDeltHeads('')).toEqual([]);
  });

  it('fills missing delt heads on library entries with real shoulder work', () => {
    expect(catalogLookup('Cable Internal Shoulder Rotation')?.d).toEqual([]);
    expect(catalogLookup('Dumbbell Lateral Raise')?.d).toEqual(['side']);
  });
});
