/** Relative strength, standards and powerlifting scores (research §5). */
import { normalizeKey } from '../labels.ts';
import type { Settings } from '../types.ts';
import { getCtx, type Ctx, type ExerciseCtx } from './context.ts';
import type { AnalysisIndex, StrengthLevel, StrengthLift, StrengthProfile } from './types.ts';
import { addDays, finiteOrNull, num } from './util.ts';

export const LB_TO_KG = 0.45359237;
const LEVELS: StrengthLevel[] = ['beginner', 'novice', 'intermediate', 'advanced', 'elite'];
type LiftId = 'bench' | 'squat' | 'deadlift' | 'ohp' | 'row' | 'dbBench' | 'dbCurl' | 'legPress';

/** Strength Level summary multiples (1RM ÷ BW), research §5.2; exact Motra names only. */
const STANDARDS: { id: LiftId; names: string[]; male: number[]; female: number[] }[] = [
  { id: 'bench', names: ['barbell bench press'], male: [0.5, 1, 1.25, 1.5, 2], female: [0.3, 0.5, 0.75, 1.1, 1.45] },
  { id: 'squat', names: ['barbell back squat', 'barbell squat'], male: [0.75, 1.25, 1.75, 2.25, 2.75], female: [0.5, 0.75, 1.25, 1.75, 2.25] },
  { id: 'deadlift', names: ['barbell deadlift'], male: [1, 1.5, 2, 2.5, 3.25], female: [0.75, 1, 1.5, 2, 2.5] },
  { id: 'ohp', names: ['barbell overhead press', 'barbell military press', 'barbell overhead press / military press'], male: [0.35, 0.55, 0.8, 1.05, 1.35], female: [0.2, 0.35, 0.5, 0.7, 0.95] },
  { id: 'row', names: ['barbell bent over row', 'barbell bent-over row'], male: [0.5, 0.75, 1, 1.5, 1.75], female: [0.3, 0.45, 0.7, 0.95, 1.25] },
  { id: 'dbBench', names: ['dumbbell bench press'], male: [0.2, 0.35, 0.5, 0.7, 0.9], female: [0.1, 0.2, 0.3, 0.45, 0.6] },
  { id: 'dbCurl', names: ['dumbbell curl', 'dumbbell bicep curl'], male: [0.1, 0.15, 0.3, 0.4, 0.55], female: [0.05, 0.1, 0.2, 0.3, 0.4] },
  { id: 'legPress', names: ['machine leg press', 'leg press'], male: [1.25, 2, 2.75, 4, 5.25], female: [0.75, 1.5, 2.25, 3.25, 4.5] },
];

const LIFT_BY_KEY = new Map<string, (typeof STANDARDS)[number]>();
for (const s of STANDARDS) for (const n of s.names) LIFT_BY_KEY.set(normalizeKey(n), s);

/** Best e1RM (any confidence, and high-only) over the 12 weeks ending at the latest data. */
function recentBest(ex: ExerciseCtx, latest: Date | null): { any: number; high: number } {
  const out = { any: 0, high: 0 };
  if (!latest) return out;
  const from = addDays(latest, -84).getTime();
  for (let i = ex.sessions.length - 1; i >= 0; i--) {
    const s = ex.sessions[i];
    if (s.date.getTime() < from) break;
    if (!s.e1rm) continue;
    out.any = Math.max(out.any, s.e1rm.e1rm);
    if (s.e1rm.confidence === 'high') out.high = Math.max(out.high, s.e1rm.e1rm);
  }
  return out;
}

function levelFor(ratio: number, thresholds: number[] | null): Pick<StrengthLift, 'level' | 'nextLevel' | 'progress'> {
  if (!thresholds) return { level: null, nextLevel: null, progress: null };
  let i = -1;
  while (i + 1 < thresholds.length && ratio >= thresholds[i + 1]) i++;
  if (i === thresholds.length - 1) return { level: LEVELS[i], nextLevel: null, progress: null };
  const lo = i < 0 ? 0 : thresholds[i];
  const hi = thresholds[i + 1];
  const progress = Math.min(1, Math.max(0, (ratio - lo) / (hi - lo)));
  return { level: i < 0 ? null : LEVELS[i], nextLevel: LEVELS[i + 1], progress: finiteOrNull(progress) };
}

/** StrengthLift for one exercise at the given bodyweight; level only for standards lifts with sex set. */
export function liftFor(ctx: Ctx, ex: ExerciseCtx, settings: Settings): StrengthLift | null {
  const bw = num(settings.bodyweightLb);
  if (bw === null || bw <= 0) return null;
  const latest = ctx.dated.length ? ctx.dated[ctx.dated.length - 1].date : null;
  const best = recentBest(ex, latest).any;
  if (best <= 0) return null;
  const ratio = best / bw;
  const std = LIFT_BY_KEY.get(ex.key);
  const thresholds = std && settings.sex !== 'unspecified' ? std[settings.sex] : null;
  return { exerciseKey: ex.key, name: ex.name, e1rmLb: best, ratio, ...levelFor(ratio, thresholds) };
}

type Sex = 'male' | 'female';

export function dotsCoefficient(bwKg: number, sex: Sex): number {
  const [a, b, c, d, e, lo, hi] = sex === 'male'
    ? [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076, 40, 210]
    : [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288, 40, 150];
  const x = Math.min(hi, Math.max(lo, bwKg));
  return 500 / (a * x ** 4 + b * x ** 3 + c * x ** 2 + d * x + e);
}

export function goodliftCoefficient(bwKg: number, sex: Sex, basis: 'total' | 'bench'): number {
  if (bwKg < 35) return 0;
  const [a, b, c] = basis === 'total'
    ? sex === 'male' ? [1199.72839, 1025.18162, 0.00921] : [610.32796, 1045.59282, 0.03048]
    : sex === 'male' ? [320.98041, 281.40258, 0.01008] : [142.40398, 442.52671, 0.04724];
  return 100 / (a - b * Math.exp(-c * bwKg));
}

export function wilksCoefficient(bwKg: number, sex: Sex): number {
  const [a, b, c, d, e, f, lo, hi] = sex === 'male'
    ? [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8, 40, 201.9]
    : [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 0.00004731582, -0.00000009054, 26.51, 154.53];
  const x = Math.min(hi, Math.max(lo, bwKg));
  return 500 / (a + b * x + c * x ** 2 + d * x ** 3 + e * x ** 4 + f * x ** 5);
}

export function strengthProfile(idx: AnalysisIndex, settings: Settings): StrengthProfile {
  const ctx = getCtx(idx);
  const bw = num(settings.bodyweightLb);
  const heightCm = num(settings.heightCm);
  const bmi = bw !== null && bw > 0 && heightCm !== null && heightCm > 0
    ? finiteOrNull((bw * LB_TO_KG) / (heightCm / 100) ** 2)
    : null;
  const empty: StrengthProfile = { bodyweightLb: bw, lifts: [], dots: null, ipfGl: null, wilks: null, bmi };
  if (bw === null || bw <= 0) return empty;

  const lifts: StrengthLift[] = [];
  const bestHigh = new Map<LiftId, number>();
  const seen = new Map<LiftId, StrengthLift>();
  for (const std of STANDARDS) {
    for (const name of std.names) {
      const ex = ctx.exercises.get(normalizeKey(name));
      if (!ex) continue;
      const lift = liftFor(ctx, ex, settings);
      if (lift && (seen.get(std.id)?.e1rmLb ?? 0) < lift.e1rmLb) seen.set(std.id, lift);
      const high = recentBest(ex, idx.latestDate).high;
      if (high > (bestHigh.get(std.id) ?? 0)) bestHigh.set(std.id, high);
    }
    const lift = seen.get(std.id);
    if (lift) lifts.push(lift);
  }

  if (settings.sex === 'unspecified') return { ...empty, lifts };
  const sex = settings.sex;
  const bwKg = bw * LB_TO_KG;
  const s = bestHigh.get('squat') ?? 0;
  const b = bestHigh.get('bench') ?? 0;
  const d = bestHigh.get('deadlift') ?? 0;
  const basis: 'total' | 'bench' | null = s > 0 && b > 0 && d > 0 ? 'total' : b > 0 ? 'bench' : null;
  if (!basis) return { ...empty, lifts };
  const kg = (basis === 'total' ? s + b + d : b) * LB_TO_KG;
  const dots = finiteOrNull(kg * dotsCoefficient(bwKg, sex));
  const gl = finiteOrNull(kg * goodliftCoefficient(bwKg, sex, basis));
  const wilks = basis === 'total' ? finiteOrNull(kg * wilksCoefficient(bwKg, sex)) : null;
  return {
    ...empty,
    lifts,
    dots: dots === null ? null : { value: dots, basis },
    ipfGl: gl === null ? null : { value: gl, basis },
    wilks,
  };
}
