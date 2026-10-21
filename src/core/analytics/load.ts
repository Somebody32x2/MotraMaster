/**
 * Bodyweight / timed exercise classification and effective-load rule.
 *
 * Logged weight on a bodyweight movement is ambiguous: Motra users log 0 (just the body),
 * the added plate (+25), or their total (bodyweight + belt). Rule: a logged weight at or
 * above half bodyweight is assumed to already include bodyweight; below that (or 0 / negative
 * assistance) bodyweight × factor is added. Assisted machines subtract the logged assistance.
 */
import type { ExerciseLoadModel, LoadBasis } from './types.ts';

export interface LoadSetInput {
  weightLb: number | null;
  reps: number | null;
  durationSec: number | null;
}

const TIMED_NAME = /\bplank|\bholds?\b|wall sit|dead ?hang|\bhang\b|l-sit|hollow (body|hold)|isometric/i;
const DIP = /\bdips?\b/i;
const PULL = /\b(pull|chin|muscle)[ -]?ups?\b/i;
const PUSH = /\bpush[ -]?ups?\b/i;
const ROW = /\binverted rows?\b|\bbody(weight)? rows?\b/i;
const MACHINE = /\b(machine|cable|smith)\b/i;
const ASSISTED = /\bassist(ed)?\b/i;
const REPS_ONLY = /\bsit[ -]?ups?\b|\bcrunch|\bleg raises?\b|\bknee raises?\b|russian twist|\bswimmer\b|bird[ -]?dog|mountain climber|\bburpees?\b|\bflutter kick|\bv[ -]?ups?\b|\bjackknife|\bsuperman\b|\bglute bridge|\bpistol squat|\bair squat|\bbodyweight squat|\blunges?\b|\bstep[ -]?ups?\b|\bjumping jack|\bscissor kick|\btoes? to bar/i;

/** Classify an exercise from its display name and all of its sets. */
export function exerciseLoadModel(name: string, sets: readonly LoadSetInput[]): ExerciseLoadModel {
  const n = name.trim();
  if (TIMED_NAME.test(n)) return { kind: 'timed', bodyweightFactor: null, assisted: false, reason: `name "${n}" is a hold` };
  const performed = sets.filter((s) => (s.reps !== null && s.reps > 0) || (s.durationSec !== null && s.durationSec > 0));
  const timedSets = performed.filter((s) => !(s.reps !== null && s.reps > 0) && s.durationSec !== null && s.durationSec > 0).length;
  if (performed.length > 0 && timedSets / performed.length >= 0.6) {
    return { kind: 'timed', bodyweightFactor: null, assisted: false, reason: 'most sets have time but no reps' };
  }

  const assisted = ASSISTED.test(n);
  const factorFor = (): [number, string] | null => {
    if (DIP.test(n) && (assisted || !MACHINE.test(n))) return [1, 'dips'];
    if (PULL.test(n)) return [1, 'pull-up'];
    if (PUSH.test(n)) return [0.64, 'push-up'];
    if (ROW.test(n)) return [0.5, 'inverted row'];
    return null;
  };
  const f = factorFor();
  if (f) {
    return { kind: 'bodyweight', bodyweightFactor: f[0], assisted, reason: `name matches "${f[1]}"${assisted ? ' (assisted)' : ''}` };
  }
  if (REPS_ONLY.test(n)) {
    // Lunges/step-ups with weight logged are ordinary weighted lifts.
    const loaded = sets.some((s) => s.weightLb !== null && s.weightLb > 0);
    if (!(loaded && /\blunges?\b|\bstep[ -]?ups?\b/i.test(n))) {
      return { kind: 'bodyweight', bodyweightFactor: null, assisted: false, reason: `name "${n}" is a bodyweight movement` };
    }
  }
  const repSets = sets.filter((s) => s.reps !== null && s.reps > 0);
  if (repSets.length > 0 && sets.every((s) => s.weightLb === null || s.weightLb <= 0)) {
    return { kind: 'bodyweight', bodyweightFactor: null, assisted: false, reason: 'no set has weight' };
  }
  return { kind: 'weighted', bodyweightFactor: null, assisted: false, reason: 'external load' };
}

/** Effective load for one set (see module doc). `bw` = settings bodyweight (lb) or null. */
export function effectiveLoad(model: ExerciseLoadModel, weightLb: number | null, bw: number | null): { loadLb: number | null; loadBasis: LoadBasis } {
  const w = weightLb !== null && Number.isFinite(weightLb) ? weightLb : null;
  const positive = w !== null && w > 0 ? w : null;
  if (model.kind === 'weighted') return { loadLb: positive, loadBasis: positive !== null ? 'external' : 'none' };
  const f = model.bodyweightFactor;
  if (model.kind === 'timed' || f === null) return { loadLb: positive, loadBasis: positive !== null ? 'external' : 'none' };
  if (bw === null || !Number.isFinite(bw) || bw <= 0) return { loadLb: positive, loadBasis: 'bodyweightUnknown' };
  const body = f * bw;
  if (model.assisted) return { loadLb: Math.max(0, body - Math.abs(w ?? 0)), loadBasis: 'assisted' };
  if (w === null || w < 0.5 * bw) return { loadLb: Math.max(0, body + (w ?? 0)), loadBasis: 'bodyweightAdded' };
  return { loadLb: w, loadBasis: 'bodyweightIncluded' };
}
