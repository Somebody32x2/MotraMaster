import { describe, expect, it } from 'vitest';
import { compareLabels, displayLabel, normalizeKey, splitMuscles } from './labels.ts';

describe('normalizeKey', () => {
  it.each([
    ['  Lower_Back  ', 'lower back'],
    ['lowerBack', 'lower back'],
    ['hipFlexors', 'hip flexors'],
    ['Machine Fly (Pec Dec)', 'machine fly (pec dec)'],
    ['Machine Fly ( Pec Dec )', 'machine fly (pec dec)'],
    ['T-Bar Row', 't-bar row'],
    ['T - Bar Row', 't-bar row'],
    ['Chest.', 'chest'],
    ['lats,', 'lats'],
    ['- chest -', 'chest'],
    ["Farmer's Walk", 'farmers walk'],
    ['  multiple   spaces\there ', 'multiple spaces here'],
    ['Ｃｈｅｓｔ', 'chest'],
    ['', ''],
  ])('%j → %j', (raw, key) => {
    expect(normalizeKey(raw)).toBe(key);
  });

  it('maps different spellings to one key', () => {
    const keys = new Set(['lower_back', 'Lower Back', 'lowerBack', ' LOWER  BACK '].map(normalizeKey));
    expect([...keys]).toEqual(['lower back']);
  });
});

describe('displayLabel', () => {
  it.each([
    ['machine fly (pec dec)', 'Machine Fly (Pec Dec)'],
    ['lower_back', 'Lower Back'],
    ['lowerBack', 'Lower Back'],
    ['romanian deadlift rdl', 'Romanian Deadlift RDL'],
    ['t-bar row', 'T-Bar Row'],
    ['ez bar curl', 'EZ Bar Curl'],
    ['single arm db row', 'Single Arm DB Row'],
    ['ohp', 'OHP'],
    ['Chest Shoulders and Triceps', 'Chest Shoulders and Triceps'],
    ['push up on bench with band', 'Push Up on Bench with Band'],
    ['of mice and men', 'Of Mice and Men'],
    ['curl (with the band)', 'Curl (With the Band)'],
    ['BARBELL BENCH PRESS', 'Barbell Bench Press'],
    ['DB ROW', 'DB Row'],
    ["farmer's walk", "Farmer's Walk"],
    ['Barbell Bench Press', 'Barbell Bench Press'],
    ['', ''],
  ])('%j → %j', (raw, label) => {
    expect(displayLabel(raw)).toBe(label);
  });

  it('keeps short acronyms from mixed-case input', () => {
    expect(displayLabel('Cable Fly (SA)')).toBe('Cable Fly (SA)');
  });
});

describe('compareLabels', () => {
  it('sorts case-insensitively and numerically', () => {
    expect(['Set 10', 'set 2', 'apple', 'Banana'].sort(compareLabels)).toEqual(['apple', 'Banana', 'set 2', 'Set 10']);
    expect(compareLabels('abc', 'ABC')).toBe(0);
  });
});

describe('splitMuscles', () => {
  it.each([
    ['chest', ['chest']],
    ['Lats, Biceps', ['Lats', 'Biceps']],
    ['chest & triceps', ['chest', 'triceps']],
    ['glutes and hamstrings', ['glutes', 'hamstrings']],
    ['a/b|c;d\ne', ['a', 'b', 'c', 'd', 'e']],
    ['Hands', ['Hands']],
    [', ,', []],
    ['', []],
  ])('%j', (raw, parts) => {
    expect(splitMuscles(raw)).toEqual(parts);
  });
});
