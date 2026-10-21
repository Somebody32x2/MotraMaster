/** buildIndex: enrich every set once per dataset + settings (research §3.3, §4.1). */
import { displayLabel } from '../labels.ts';
import { catalogLookup, deltHeadOf, REGION_ORDER, resolveMuscle, type CatalogEntry } from '../regions.ts';
import type { Dataset, Settings } from '../types.ts';
import { attachCtx, type Ctx, type ExerciseCtx, type Session, type WorkoutAgg } from './context.ts';
import { estimateE1rm } from './e1rm.ts';
import { detectPrs } from './prs.ts';
import type { AnalysisIndex, EnrichedSet, PrEvent, RegionId, SessionE1rm } from './types.ts';
import { DAY_MS, num, parseLocalIso } from './util.ts';

type Credit = Partial<Record<RegionId, number>>;

const UNDATED = new Date(0);
const PRIMARY_MIN = 8;
const SECONDARY_MIN = 6;

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
  return { workoutId, date, e1rm: best.e1rm.value, confidence: best.e1rm.confidence, weightLb: best.weightLb ?? 0, reps: best.reps ?? 0 };
}

export function buildIndex(ds: Dataset, settings: Settings): AnalysisIndex {
  const formula = settings.oneRmFormula ?? 'auto';
  const catCache = new Map<string, CatalogEntry | null>();
  const workoutDates = new Map<string, Date | null>();
  const workouts = new Map<string, WorkoutAgg>();
  const sets: EnrichedSet[] = [];

  for (const w of ds.workouts) {
    const date = parseLocalIso(w.start);
    workoutDates.set(w.id, date);
    const ordered = [...w.sets].sort((a, b) => a.index - b.index);
    const maxWeight = new Map<string, number>();
    for (const s of ordered) {
      const wt = num(s.weightLb);
      if (wt !== null && wt > 0) maxWeight.set(s.exerciseKey, Math.max(maxWeight.get(s.exerciseKey) ?? 0, wt));
    }
    const list: EnrichedSet[] = [];
    let prevKey: string | null = null;
    for (const s of ordered) {
      let cat = catCache.get(s.exerciseKey);
      if (cat === undefined) {
        cat = catalogLookup(s.exerciseKey) ?? catalogLookup(s.exerciseRaw);
        catCache.set(s.exerciseKey, cat);
      }
      const weightLb = num(s.weightLb);
      const reps = num(s.reps);
      const durationSec = num(s.durationSec);
      const effort = num(s.effort);
      const cardio = (num(s.distanceFt) ?? 0) > 0 && !(reps !== null && reps > 0);
      const performed = !cardio && ((reps !== null && reps >= 1) || (durationSec !== null && durationSec > 0));
      let hard = false;
      if (performed) {
        if (effort !== null) hard = effort >= 6;
        else if (weightLb !== null && weightLb > 0) hard = weightLb >= 0.6 * (maxWeight.get(s.exerciseKey) ?? weightLb);
        else hard = true;
      }
      const primary = primaryCredit(s.muscleKeys ?? [], cat);
      const es: EnrichedSet = {
        setId: s.id,
        workoutId: w.id,
        date: date ?? UNDATED,
        exerciseKey: s.exerciseKey,
        weightLb,
        reps,
        durationSec,
        restSec: num(s.restSec),
        effort,
        primary,
        secondary: secondaryCredit(cat, primary),
        hard,
        firstOfBlock: s.exerciseKey !== prevKey,
        volumeLb: weightLb !== null && reps !== null && weightLb > 0 && reps > 0 ? weightLb * reps : 0,
        e1rm: cardio || weightLb === null || reps === null ? null : estimateE1rm(weightLb, reps, effort, formula),
      };
      prevKey = s.exerciseKey;
      list.push(es);
      if (date) sets.push(es);
    }
    const regionHard: Partial<Record<RegionId, number>> = {};
    let hardSets = 0;
    let volume = 0;
    for (const s of list) {
      volume += s.volumeLb;
      if (!s.hard) continue;
      hardSets++;
      for (const [id, c] of Object.entries(s.primary) as [RegionId, number][]) regionHard[id] = (regionHard[id] ?? 0) + c;
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
        catalog: cat,
        rearShare: 0,
        prs: [],
        firstDate: s.date,
      };
      exercises.set(s.exerciseKey, ex);
    }
    ex.sets.push(s);
    ex.times.push(s.date.getTime());
    if (s.weightLb !== null && s.weightLb > 0) ex.weighted = true;
    for (const [id, c] of Object.entries(s.primary) as [RegionId, number][]) ex.regionCredit[id] = (ex.regionCredit[id] ?? 0) + c;
    const sk = `${s.exerciseKey}\u0000${s.workoutId}`;
    let sess = sessionByKey.get(sk);
    if (!sess) {
      sess = { exerciseKey: s.exerciseKey, workoutId: s.workoutId, date: s.date, sets: [], e1rm: null, volumeLb: 0, reps: 0, topWeightLb: null, prTypes: [], trail8Best: null };
      sessionByKey.set(sk, sess);
      ex.sessions.push(sess);
      ex.sessionTimes.push(s.date.getTime());
    }
    sess.sets.push(s);
    sess.volumeLb += s.volumeLb;
    sess.reps += s.reps !== null && s.reps > 0 ? s.reps : 0;
    if (s.weightLb !== null && s.weightLb > 0) sess.topWeightLb = Math.max(sess.topWeightLb ?? 0, s.weightLb);
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
      let best = 0;
      const from = sess.date.getTime() - 56 * DAY_MS;
      for (let j = i; j >= 0 && ex.sessions[j].date.getTime() >= from; j--) {
        const v = ex.sessions[j].e1rm?.e1rm ?? 0;
        if (v > best) best = v;
      }
      sess.trail8Best = best > 0 ? best : null;
      if (best > 0) {
        for (const s of sess.sets) if (s.weightLb !== null && s.weightLb > 0) setPct.set(s.setId, s.weightLb / best);
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
    if (!s.hard) continue;
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
  };
  const ctx: Ctx = {
    ds,
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
