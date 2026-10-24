/** buildIndex: enrich every set once per dataset + settings (research §3.3, §4.1). */
import { displayLabel } from '../labels.ts';
import { catalogLookup, deltHeadOf, REGION_ORDER, resolveMuscle, type CatalogEntry } from '../regions.ts';
import type { Dataset, SetRecord, Settings, Workout } from '../types.ts';
import { attachCtx, type Ctx, type ExerciseCtx, type Session, type WorkoutAgg } from './context.ts';
import { estimateE1rm } from './e1rm.ts';
import { effectiveLoad, exerciseLoadModel, type LoadSetInput } from './load.ts';
import { detectPrs } from './prs.ts';
import type { AnalysisIndex, EnrichedSet, ExerciseLoadModel, HardReason, PrEvent, RegionId, SessionE1rm, SessionStrength, StrengthMetric } from './types.ts';
import { DAY_MS, num, parseLocalIso } from './util.ts';

type Credit = Partial<Record<RegionId, number>>;

const UNDATED = new Date(0);
const PRIMARY_MIN = 8;
const SECONDARY_MIN = 6;
/** Drop-set detection (research §4.1): at most this much rest before a lighter set of the same exercise… */
const DROP_REST_MAX_SEC = 30;
/** …which sheds at least this share of the previous set's load. */
const DROP_MIN_CUT = 0.05;
const COUNTS: Record<HardReason, boolean> = {
  effort: true, load: true, bodyweight: true, hold: true, drop: true,
  easy: false, light: false, shortHold: false, notPerformed: false,
};

/** A drop set marked by hand: "drop set" in the note, or a set-type column reading D / Drop / Drop set. */
function markedDrop(s: SetRecord): boolean {
  if (s.note && /\bdrop[ -]?set\b/i.test(s.note)) return true;
  for (const [header, v] of Object.entries(s.extra ?? {})) {
    if (/type/i.test(header) && typeof v === 'string' && /^\s*(d|drop([ -]?set)?)\s*$/i.test(v)) return true;
  }
  return false;
}

/** Each listed muscle gets full credit (capped at 1 per region); group labels split. */
function primaryCredit(muscleKeys: string[], cat: CatalogEntry | null): Credit {
  const out: Credit = {};
  let mapped = false;
  for (const k of muscleKeys) {
    for (const [id, c] of Object.entries(resolveMuscle(k)) as [RegionId, number][]) {
      out[id] = Math.min(1, (out[id] ?? 0) + c);
      if (id !== 'other') mapped = true;
    }
  }
  if (!mapped && cat) {
    const fromCatalog: Credit = {};
    let any = false;
    for (const [id, w] of Object.entries(cat.m) as [RegionId, number][]) {
      if (w >= PRIMARY_MIN) {
        fromCatalog[id] = 1;
        any = true;
      }
    }
    if (any) return fromCatalog;
  }
  if (Object.keys(out).length === 0) out.other = 1;
  return out;
}

function secondaryCredit(cat: CatalogEntry | null, primary: Credit): Credit {
  const out: Credit = {};
  if (!cat) return out;
  for (const [id, w] of Object.entries(cat.m) as [RegionId, number][]) {
    if (w >= SECONDARY_MIN && w < PRIMARY_MIN && !primary[id]) out[id] = 0.5;
  }
  return out;
}

function sessionE1rm(sets: EnrichedSet[], workoutId: string, date: Date): SessionE1rm | null {
  let best: EnrichedSet | null = null;
  for (const s of sets) {
    if (!s.e1rm) continue;
    if (!best) {
      best = s;
      continue;
    }
    const bHigh = best.e1rm!.confidence === 'high';
    const sHigh = s.e1rm.confidence === 'high';
    if ((sHigh && !bHigh) || (sHigh === bHigh && s.e1rm.value > best.e1rm!.value)) best = s;
  }
  if (!best?.e1rm) return null;
  return { workoutId, date, e1rm: best.e1rm.value, confidence: best.e1rm.confidence, weightLb: best.loadLb ?? 0, reps: best.reps ?? 0 };
}

/** The session's heaviest set by effective load (> 0, not a 0-rep entry); ties → most reps. */
function sessionActual(sets: EnrichedSet[], workoutId: string, date: Date): SessionStrength | null {
  let best: EnrichedSet | null = null;
  for (const s of sets) {
    if (s.loadLb === null || s.loadLb <= 0 || (s.reps !== null && s.reps < 1)) continue;
    if (!best || s.loadLb > best.loadLb! || (s.loadLb === best.loadLb && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
  }
  if (!best) return null;
  return { workoutId, date, value: best.loadLb!, weightLb: best.loadLb!, reps: best.reps ?? 0, e1rm: best.e1rm?.value ?? null, confidence: null, holdSec: null, loadBasis: best.loadBasis };
}

/** Timed exercises: the session's longest hold (ties → heavier load). */
function sessionHold(sets: EnrichedSet[], workoutId: string, date: Date): SessionStrength | null {
  let best: EnrichedSet | null = null;
  for (const s of sets) {
    if (s.holdSec === null || s.holdSec <= 0) continue;
    if (!best || s.holdSec > best.holdSec! || (s.holdSec === best.holdSec && (s.loadLb ?? 0) > (best.loadLb ?? 0))) best = s;
  }
  if (!best) return null;
  return { workoutId, date, value: best.holdSec!, weightLb: best.loadLb ?? 0, reps: best.reps ?? 0, e1rm: null, confidence: null, holdSec: best.holdSec, loadBasis: best.loadBasis };
}

export interface TrimResult {
  rawDurationSec: number | null;
  effectiveSec: number | null;
  trimmedSec: number;
}

/**
 * Idle-tail trimming. Active time = Σ set duration + Σ non-negative rest (rest between
 * sets counts, so long mid-workout gaps survive). When raw > active + grace, the
 * duration is capped at active + grace; otherwise it is left untouched.
 */
export function trimWorkout(w: Workout, sets: readonly { durationSec: number | null; restSec: number | null }[], trim: { enabled: boolean; graceSec: number }): TrimResult {
  let raw = num(w.durationSec);
  if (raw === null) {
    const a = parseLocalIso(w.start);
    const b = parseLocalIso(w.end);
    if (a && b && b.getTime() >= a.getTime()) raw = (b.getTime() - a.getTime()) / 1000;
  }
  if (raw !== null && raw < 0) raw = null;
  let active = 0;
  for (const s of sets) {
    const d = num(s.durationSec);
    const r = num(s.restSec);
    if (d !== null && d > 0) active += d;
    if (r !== null && r > 0) active += r;
  }
  if (trim.enabled && raw !== null && active > 0 && raw > active + trim.graceSec) {
    const effective = active + trim.graceSec;
    return { rawDurationSec: raw, effectiveSec: effective, trimmedSec: raw - effective };
  }
  return { rawDurationSec: raw, effectiveSec: raw, trimmedSec: 0 };
}

export function buildIndex(ds: Dataset, settings: Settings): AnalysisIndex {
  const formula = settings.oneRmFormula ?? 'auto';
  const metric: StrengthMetric = settings.strengthMetric === 'actual' ? 'actual' : 'e1rm';
  const grace = num(settings.trimGraceMin);
  const trim = { enabled: settings.trimIdle !== false, graceSec: Math.max(0, grace ?? 5) * 60 };
  const catCache = new Map<string, CatalogEntry | null>();
  const bw = num(settings.bodyweightLb);
  const dropCredit = settings.dropSetCredit === 0 || settings.dropSetCredit === 1 ? settings.dropSetCredit : 0.5;
  // Classify each exercise once from its name and all of its sets.
  const loadInputs = new Map<string, LoadSetInput[]>();
  for (const w of ds.workouts) {
    for (const s of w.sets) {
      let arr = loadInputs.get(s.exerciseKey);
      if (!arr) loadInputs.set(s.exerciseKey, (arr = []));
      arr.push({ weightLb: num(s.weightLb), reps: num(s.reps), durationSec: num(s.durationSec) });
    }
  }
  const loadModels = new Map<string, ExerciseLoadModel>();
  for (const [key, inputs] of loadInputs) loadModels.set(key, exerciseLoadModel(ds.exercises[key]?.name ?? displayLabel(key), inputs));
  const workoutDates = new Map<string, Date | null>();
  const workouts = new Map<string, WorkoutAgg>();
  const sets: EnrichedSet[] = [];

  for (const w of ds.workouts) {
    const date = parseLocalIso(w.start);
    workoutDates.set(w.id, date);
    const ordered = [...w.sets].sort((a, b) => a.index - b.index);
    const loads = ordered.map((s) => effectiveLoad(loadModels.get(s.exerciseKey)!, num(s.weightLb), bw));
    const maxLoad = new Map<string, number>();
    ordered.forEach((s, i) => {
      const l = loads[i].loadLb;
      if (l !== null && l > 0) maxLoad.set(s.exerciseKey, Math.max(maxLoad.get(s.exerciseKey) ?? 0, l));
    });
    const list: EnrichedSet[] = [];
    let prevKey: string | null = null;
    let prev: EnrichedSet | null = null;
    // Workouts logged without timing report 0 rest everywhere; rest says nothing about drops then.
    const restKnown = ordered.some((s) => (num(s.restSec) ?? 0) > 0);
    for (const [i, s] of ordered.entries()) {
      let cat = catCache.get(s.exerciseKey);
      if (cat === undefined) {
        cat = catalogLookup(s.exerciseKey) ?? catalogLookup(s.exerciseRaw);
        catCache.set(s.exerciseKey, cat);
      }
      const model = loadModels.get(s.exerciseKey)!;
      const { loadLb, loadBasis } = loads[i];
      const weightLb = num(s.weightLb);
      const reps = num(s.reps);
      const durationSec = num(s.durationSec);
      const restSec = num(s.restSec);
      const effort = num(s.effort);
      const cardio = (num(s.distanceFt) ?? 0) > 0 && !(reps !== null && reps > 0);
      const performed = !cardio && ((reps !== null && reps >= 1) || (durationSec !== null && durationSec > 0));
      const holdSec = model.kind === 'timed' && !cardio && durationSec !== null && durationSec > 0 ? durationSec : null;
      const top = maxLoad.get(s.exerciseKey) ?? null;

      let drop = false;
      if (performed && model.kind !== 'timed' && prev && s.exerciseKey === prevKey && prev.hardReason !== 'notPerformed') {
        const before = prev.loadLb ?? prev.weightLb;
        const now = loadLb ?? weightLb;
        const lighter = before !== null && now !== null && before > 0 && now <= before * (1 - DROP_MIN_CUT);
        drop = markedDrop(s) || (lighter && restKnown && restSec !== null && restSec <= DROP_REST_MAX_SEC);
      }
      let hardReason: HardReason;
      if (!performed) hardReason = 'notPerformed';
      else if (effort !== null && effort < 6) hardReason = 'easy';
      else if (drop) hardReason = 'drop';
      else if (effort !== null) hardReason = 'effort';
      else if (model.kind === 'timed') hardReason = holdSec !== null && holdSec >= 10 ? 'hold' : 'shortHold';
      else if (loadLb !== null && loadLb > 0) hardReason = loadLb >= 0.6 * (top ?? loadLb) ? 'load' : 'light';
      else hardReason = 'bodyweight';
      const hard = COUNTS[hardReason];

      const primary = primaryCredit(s.muscleKeys ?? [], cat);
      const es: EnrichedSet = {
        setId: s.id,
        workoutId: w.id,
        date: date ?? UNDATED,
        exerciseKey: s.exerciseKey,
        weightLb,
        reps,
        durationSec,
        restSec,
        effort,
        primary,
        secondary: secondaryCredit(cat, primary),
        hard,
        hardReason,
        credit: !hard ? 0 : drop ? dropCredit : 1,
        drop,
        pctOfTop: loadLb !== null && loadLb > 0 && top !== null && top > 0 ? loadLb / top : null,
        firstOfBlock: s.exerciseKey !== prevKey,
        volumeLb: loadLb !== null && reps !== null && loadLb > 0 && reps > 0 ? loadLb * reps : 0,
        e1rm: cardio || model.kind === 'timed' || loadLb === null || reps === null ? null : estimateE1rm(loadLb, reps, effort, formula),
        loadLb,
        loadBasis,
        holdSec,
      };
      prevKey = s.exerciseKey;
      prev = es;
      list.push(es);
      if (date) sets.push(es);
    }
    const regionHard: Partial<Record<RegionId, number>> = {};
    let hardSets = 0;
    let volume = 0;
    for (const s of list) {
      volume += s.volumeLb;
      if (s.credit <= 0) continue;
      hardSets += s.credit;
      for (const [id, c] of Object.entries(s.primary) as [RegionId, number][]) regionHard[id] = (regionHard[id] ?? 0) + c * s.credit;
    }
    const tvl = num(w.tvlLb);
    workouts.set(w.id, {
      workout: w,
      date,
      sets: list,
      hardSets,
      volumeLb: tvl !== null && tvl > 0 ? tvl : volume,
      exercises: new Set(list.map((s) => s.exerciseKey)).size,
      regionHard,
      prs: [],
      ...trimWorkout(w, list, trim),
    });
  }

  sets.sort((a, b) => a.date.getTime() - b.date.getTime());
  const times = sets.map((s) => s.date.getTime());

  // Per-exercise sets and sessions.
  const exercises = new Map<string, ExerciseCtx>();
  const sessionByKey = new Map<string, Session>();
  for (const s of sets) {
    let ex = exercises.get(s.exerciseKey);
    if (!ex) {
      const cat = catCache.get(s.exerciseKey) ?? null;
      ex = {
        key: s.exerciseKey,
        name: ds.exercises[s.exerciseKey]?.name ?? displayLabel(s.exerciseKey),
        sets: [],
        times: [],
        sessions: [],
        sessionTimes: [],
        regionCredit: {},
        regions: [],
        weighted: false,
        load: loadModels.get(s.exerciseKey)!,
        catalog: cat,
        rearShare: 0,
        prs: [],
        firstDate: s.date,
      };
      exercises.set(s.exerciseKey, ex);
    }
    ex.sets.push(s);
    ex.times.push(s.date.getTime());
    if (s.loadLb !== null && s.loadLb > 0) ex.weighted = true;
    for (const [id, c] of Object.entries(s.primary) as [RegionId, number][]) ex.regionCredit[id] = (ex.regionCredit[id] ?? 0) + c;
    const sk = `${s.exerciseKey}\u0000${s.workoutId}`;
    let sess = sessionByKey.get(sk);
    if (!sess) {
      sess = { exerciseKey: s.exerciseKey, workoutId: s.workoutId, date: s.date, sets: [], e1rm: null, volumeLb: 0, reps: 0, topWeightLb: null, prTypes: [], trail8Best: null, byMetric: { e1rm: null, actual: null }, strength: null };
      sessionByKey.set(sk, sess);
      ex.sessions.push(sess);
      ex.sessionTimes.push(s.date.getTime());
    }
    sess.sets.push(s);
    sess.volumeLb += s.volumeLb;
    sess.reps += s.reps !== null && s.reps > 0 ? s.reps : 0;
    if (s.loadLb !== null && s.loadLb > 0) sess.topWeightLb = Math.max(sess.topWeightLb ?? 0, s.loadLb);
  }

  const setPct = new Map<string, number>();
  const prs: PrEvent[] = [];
  for (const ex of exercises.values()) {
    ex.regions = (Object.entries(ex.regionCredit) as [RegionId, number][])
      .sort((a, b) => b[1] - a[1] || REGION_ORDER.indexOf(a[0]) - REGION_ORDER.indexOf(b[0]))
      .map(([id]) => id);
    const d = ex.catalog?.d ?? [];
    if (d.length > 0) ex.rearShare = d.filter((h) => h === 'rear').length / d.length;
    else if ((ds.exercises[ex.key]?.muscleKeys ?? []).some((k) => deltHeadOf(k) === 'rear')) ex.rearShare = 1;

    for (let i = 0; i < ex.sessions.length; i++) {
      const sess = ex.sessions[i];
      sess.e1rm = sessionE1rm(sess.sets, sess.workoutId, sess.date);
      const e = sess.e1rm;
      const eBasis = e ? (sess.sets.find((s) => s.e1rm?.value === e.e1rm)?.loadBasis ?? 'external') : 'external';
      if (ex.load.kind === 'timed') {
        const hold = sessionHold(sess.sets, sess.workoutId, sess.date);
        sess.byMetric = { e1rm: hold, actual: hold };
      } else {
        sess.byMetric = {
          e1rm: e ? { workoutId: e.workoutId, date: e.date, value: e.e1rm, weightLb: e.weightLb, reps: e.reps, e1rm: e.e1rm, confidence: e.confidence, holdSec: null, loadBasis: eBasis } : null,
          actual: sessionActual(sess.sets, sess.workoutId, sess.date),
        };
      }
      sess.strength = sess.byMetric[metric];
      let best = 0;
      const from = sess.date.getTime() - 56 * DAY_MS;
      for (let j = i; j >= 0 && ex.sessions[j].date.getTime() >= from; j--) {
        const v = ex.sessions[j].e1rm?.e1rm ?? 0;
        if (v > best) best = v;
      }
      sess.trail8Best = best > 0 ? best : null;
      if (best > 0) {
        for (const s of sess.sets) if (s.loadLb !== null && s.loadLb > 0) setPct.set(s.setId, s.loadLb / best);
      }
    }
    ex.prs = detectPrs(ex);
    for (const p of ex.prs) {
      prs.push(p);
      workouts.get(p.workoutId)?.prs.push(p);
    }
  }
  prs.sort((a, b) => a.date.getTime() - b.date.getTime());

  const regionTimes = new Map<RegionId, number[]>();
  for (const s of sets) {
    if (s.credit <= 0) continue;
    for (const id of Object.keys(s.primary) as RegionId[]) {
      let arr = regionTimes.get(id);
      if (!arr) regionTimes.set(id, (arr = []));
      arr.push(s.date.getTime());
    }
  }

  const regionLabels = new Map<RegionId, string[]>();
  for (const info of Object.values(ds.muscles ?? {})) {
    for (const id of Object.keys(resolveMuscle(info.key)) as RegionId[]) {
      let arr = regionLabels.get(id);
      if (!arr) regionLabels.set(id, (arr = []));
      for (const raw of info.rawNames.length ? info.rawNames : [info.name]) if (!arr.includes(raw)) arr.push(raw);
    }
  }

  const dated = [...workouts.values()].filter((w) => w.date !== null).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  const idx: AnalysisIndex = {
    sets,
    workouts: ds.workouts,
    workoutDates,
    prs,
    latestDate: dated.length ? dated[dated.length - 1].date : null,
    formula,
    bodyweightLb: num(settings.bodyweightLb),
    strengthMetric: metric,
    trim,
    dropSetCredit: dropCredit,
  };
  const ctx: Ctx = {
    ds,
    metric,
    settings,
    sets,
    times,
    exercises,
    workouts,
    dated,
    datedTimes: dated.map((w) => w.date!.getTime()),
    setPct,
    regionTimes,
    regionLabels,
    firstDate: dated.length ? dated[0].date : null,
    cache: new Map(),
  };
  attachCtx(idx, ctx);
  return idx;
}
