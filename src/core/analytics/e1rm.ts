/** Estimated one-rep max (research §3.1, §3.3). */
import type { OneRmFormula } from '../types.ts';
import type { E1rmEstimate } from './types.ts';

type FormulaKey = Exclude<OneRmFormula, 'auto'>;

/** Every formula returns `w` at r ≤ 1, literally (research §3.1). */
export const oneRmFormulas: { key: FormulaKey; name: string; fn: (w: number, r: number) => number; note: string }[] = [
  { key: 'epley', name: 'Epley', fn: (w, r) => (r <= 1 ? w : w * (1 + r / 30)), note: 'Most common; slightly above Brzycki below 10 reps, identical at 10.' },
  { key: 'brzycki', name: 'Brzycki', fn: (w, r) => (r <= 1 ? w : (w * 36) / Math.max(37 - r, 1)), note: 'Inflates quickly above ~12 reps.' },
  { key: 'lombardi', name: 'Lombardi', fn: (w, r) => (r <= 1 ? w : w * r ** 0.1), note: 'Lowest estimate at high reps.' },
  { key: 'mayhew', name: 'Mayhew', fn: (w, r) => (r <= 1 ? w : (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r))), note: 'Unbiased on bench press in LeSuer 1997.' },
  { key: 'wathan', name: 'Wathan', fn: (w, r) => (r <= 1 ? w : (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r))), note: 'Unbiased on bench and squat in LeSuer 1997.' },
  { key: 'oconner', name: "O'Conner", fn: (w, r) => (r <= 1 ? w : w * (1 + 0.025 * r)), note: 'Conservative.' },
];

const FN = new Map(oneRmFormulas.map((f) => [f.key, f.fn]));

/**
 * e1RM for one set. Effort ≥ 6 adds reps in reserve (10 − effort, clamped 0..4);
 * null for ineligible sets or effective reps above 15.
 */
export function estimateE1rm(weightLb: number, reps: number, effort: number | null, formula: OneRmFormula): E1rmEstimate | null {
  if (!Number.isFinite(weightLb) || !Number.isFinite(reps) || weightLb <= 0 || reps < 1) return null;
  const rir = effort !== null && Number.isFinite(effort) && effort >= 6 ? Math.min(4, Math.max(0, 10 - effort)) : 0;
  const rEff = reps + rir;
  if (rEff > 15) return null;
  if (rEff <= 1) return { value: weightLb, confidence: 'high', effectiveReps: rEff, formula: 'actual' };
  const confidence = rEff <= 10 ? 'high' : 'medium';
  let value: number;
  let used: E1rmEstimate['formula'];
  if (formula === 'auto' || !FN.has(formula)) {
    if (rEff <= 10) {
      value = (FN.get('epley')!(weightLb, rEff) + FN.get('brzycki')!(weightLb, rEff)) / 2;
      used = 'blend';
    } else {
      value = FN.get('wathan')!(weightLb, rEff);
      used = 'wathan';
    }
  } else {
    value = FN.get(formula)!(weightLb, rEff);
    used = formula;
  }
  return Number.isFinite(value) && value > 0 ? { value, confidence, effectiveReps: rEff, formula: used } : null;
}
