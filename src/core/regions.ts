/**
 * Body regions and muscle-label → region mapping (research §2).
 *
 * Input labels are `normalizeKey()` output, but every function re-normalizes
 * defensively so raw strings ('lowerBack', 'Rear-Delts') work too.
 */
import catalogJson from '../data/motra-exercises.json' with { type: 'json' };
import { normalizeKey } from './labels.ts';
import type { DeltHead, RegionId } from './analytics/types.ts';

export interface RegionMeta {
  name: string;
  drawn: boolean;
  group: 'upper' | 'core' | 'lower' | 'other';
  pushPull: 'push' | 'pull' | 'legs' | 'core' | null;
  side: 'anterior' | 'posterior' | 'both' | null;
}

export const REGIONS: Record<RegionId, RegionMeta> = {
  chest: { name: 'Chest', drawn: true, group: 'upper', pushPull: 'push', side: 'anterior' },
  shoulders: { name: 'Shoulders', drawn: true, group: 'upper', pushPull: 'push', side: 'both' },
  biceps: { name: 'Biceps', drawn: true, group: 'upper', pushPull: 'pull', side: 'anterior' },
  triceps: { name: 'Triceps', drawn: true, group: 'upper', pushPull: 'push', side: 'posterior' },
  forearms: { name: 'Forearms', drawn: true, group: 'upper', pushPull: null, side: 'both' },
  abs: { name: 'Abs', drawn: true, group: 'core', pushPull: 'core', side: 'anterior' },
  obliques: { name: 'Obliques', drawn: true, group: 'core', pushPull: 'core', side: 'anterior' },
  lats: { name: 'Lats', drawn: true, group: 'upper', pushPull: 'pull', side: 'posterior' },
  traps: { name: 'Traps', drawn: true, group: 'upper', pushPull: 'pull', side: 'posterior' },
  lowerBack: { name: 'Lower Back', drawn: true, group: 'core', pushPull: 'core', side: 'posterior' },
  glutes: { name: 'Glutes', drawn: true, group: 'lower', pushPull: 'legs', side: 'posterior' },
  hipFlexors: { name: 'Hip Flexors', drawn: true, group: 'lower', pushPull: 'legs', side: 'anterior' },
  quads: { name: 'Quads', drawn: true, group: 'lower', pushPull: 'legs', side: 'anterior' },
  hamstrings: { name: 'Hamstrings', drawn: true, group: 'lower', pushPull: 'legs', side: 'posterior' },
  adductors: { name: 'Adductors', drawn: true, group: 'lower', pushPull: 'legs', side: 'both' },
  abductors: { name: 'Abductors', drawn: true, group: 'lower', pushPull: 'legs', side: 'both' },
  calves: { name: 'Calves', drawn: true, group: 'lower', pushPull: 'legs', side: 'posterior' },
  tibialisAnterior: { name: 'Tibialis Anterior', drawn: true, group: 'lower', pushPull: 'legs', side: 'anterior' },
  neck: { name: 'Neck', drawn: true, group: 'upper', pushPull: null, side: 'both' },
  fullBody: { name: 'Full Body', drawn: false, group: 'other', pushPull: null, side: null },
  cardio: { name: 'Cardio', drawn: false, group: 'other', pushPull: null, side: null },
  other: { name: 'Other', drawn: false, group: 'other', pushPull: null, side: null },
};

/** Anatomical top → bottom display order; undrawn buckets last. */
export const REGION_ORDER: RegionId[] = [
  'neck', 'traps', 'shoulders', 'chest', 'biceps', 'triceps', 'forearms', 'lats',
  'abs', 'obliques', 'lowerBack', 'hipFlexors', 'glutes', 'abductors', 'adductors',
  'quads', 'hamstrings', 'calves', 'tibialisAnterior', 'fullBody', 'cardio', 'other',
];

export function regionName(id: RegionId): string {
  return REGIONS[id]?.name ?? 'Other';
}

export function isRegionId(s: string): s is RegionId {
  return Object.prototype.hasOwnProperty.call(REGIONS, s);
}

type Credit = Partial<Record<RegionId, number>>;

function split(...ids: RegionId[]): Credit {
  const out: Credit = {};
  for (const id of ids) out[id] = 1 / ids.length;
  return out;
}

/** Research §2.2. Keys are cleaned (see `clean`). */
const SYNONYMS: [RegionId, string[]][] = [
  ['chest', ['chest', 'pec', 'pecs', 'pectoral', 'pectorals', 'pectoralis', 'pectoralis major', 'pectoralis minor', 'upper chest', 'mid chest', 'middle chest', 'lower chest', 'inner chest', 'clavicular pec', 'sternal pec']],
  ['shoulders', ['shoulder', 'shoulders', 'delt', 'delts', 'deltoid', 'deltoids', 'front delt', 'front delts', 'anterior delt', 'anterior delts', 'anterior deltoid', 'side delt', 'side delts', 'lateral delt', 'lateral delts', 'medial delt', 'medial delts', 'middle delt', 'middle delts', 'rear delt', 'rear delts', 'posterior delt', 'posterior delts', 'posterior deltoid', 'rotator cuff', 'infraspinatus', 'supraspinatus', 'teres minor', 'subscapularis']],
  ['biceps', ['bicep', 'biceps', 'biceps brachii', 'brachialis', 'short head', 'arm flexors']],
  ['triceps', ['tricep', 'triceps', 'triceps brachii', 'long head', 'lateral head', 'medial head']],
  ['forearms', ['forearm', 'forearms', 'wrist flexors', 'wrist extensors', 'flexors', 'extensors', 'brachioradialis', 'grip', 'wrists']],
  ['abs', ['ab', 'abs', 'abdominal', 'abdominals', 'rectus abdominis', 'transverse abdominis', 'transversus abdominis', 'tva', 'six pack', 'upper abs', 'lower abs']],
  ['obliques', ['oblique', 'obliques', 'external obliques', 'internal obliques', 'serratus', 'serratus anterior', 'sides', 'love handles']],
  ['lats', ['lat', 'lats', 'latissimus', 'latissimus dorsi', 'teres major', 'wings']],
  ['traps', ['trap', 'traps', 'trapezius', 'upper traps', 'mid traps', 'middle traps', 'lower traps', 'rhomboid', 'rhomboids', 'upper back', 'mid back', 'middle back', 'levator scapulae']],
  ['lowerBack', ['lower back', 'low back', 'lowerback', 'lumbar', 'erector', 'erectors', 'erector spinae', 'spinal erectors', 'back extensors', 'multifidus', 'quadratus lumborum', 'ql']],
  ['glutes', ['glute', 'glutes', 'gluteus', 'gluteus maximus', 'glute max', 'gluteals', 'buttocks', 'butt', 'hips']],
  ['abductors', ['abductor', 'abductors', 'hip abductors', 'outer thigh', 'outer thighs', 'gluteus medius', 'glute medius', 'glute med', 'gluteus minimus', 'tfl', 'tensor fasciae latae', 'it band']],
  ['adductors', ['adductor', 'adductors', 'hip adductors', 'inner thigh', 'inner thighs', 'groin', 'adductor magnus', 'adductor longus', 'adductor brevis', 'gracilis', 'pectineus']],
  ['hipFlexors', ['hip flexor', 'hip flexors', 'iliopsoas', 'psoas', 'iliacus']],
  ['quads', ['quad', 'quads', 'quadricep', 'quadriceps', 'quadriceps femoris', 'thigh', 'thighs', 'front thigh', 'vastus lateralis', 'vastus medialis', 'vastus intermedius', 'vmo', 'rectus femoris']],
  ['hamstrings', ['hamstring', 'hamstrings', 'ham', 'hams', 'hammies', 'biceps femoris', 'semitendinosus', 'semimembranosus', 'back of thigh', 'rear thigh']],
  ['calves', ['calf', 'calves', 'gastrocnemius', 'gastroc', 'soleus', 'lower leg', 'lower legs']],
  ['tibialisAnterior', ['tibialis', 'tibialis anterior', 'tib', 'tibs', 'shin', 'shins']],
  ['neck', ['neck', 'sternocleidomastoid', 'scm', 'neck flexors', 'neck extensors', 'splenius']],
  ['fullBody', ['full body', 'fullbody', 'total body', 'whole body', 'compound']],
  ['cardio', ['cardio', 'conditioning', 'aerobic', 'endurance', 'hiit']],
  ['other', ['', 'n a', 'na', 'none', 'other', 'unknown']],
];

const LEGS = split('quads', 'hamstrings', 'glutes', 'calves');
const BACK = split('lats', 'traps');
const ARMS = split('biceps', 'triceps', 'forearms');

const GROUPS: [string[], Credit][] = [
  [['back'], BACK],
  [['core'], split('abs', 'obliques')],
  [['arms'], ARMS],
  [['legs', 'lower body', 'upper legs'], LEGS],
  [['upper body'], split('chest', 'shoulders', 'lats', 'traps', 'biceps', 'triceps')],
  [['posterior chain'], split('glutes', 'hamstrings', 'lowerBack')],
  [['push'], split('chest', 'shoulders', 'triceps')],
  [['pull'], split('lats', 'traps', 'biceps')],
];

const TABLE = new Map<string, Credit>();
for (const [id, labels] of SYNONYMS) for (const l of labels) TABLE.set(l, { [id]: 1 });
for (const [labels, credit] of GROUPS) for (const l of labels) TABLE.set(l, credit);

/** Research §2.3 ordered keyword fallback; first match wins. */
const FALLBACK: [RegExp, Credit][] = [
  [/lower back|low back|lumbar|erector|spinal|quadratus/, { lowerBack: 1 }],
  [/hip flex|psoas|iliacus/, { hipFlexors: 1 }],
  [/abduct|glute(us)? med|glute(us)? min|tfl|tensor|outer thigh|it band/, { abductors: 1 }],
  [/adduct|inner thigh|groin|gracilis|pectineus/, { adductors: 1 }],
  [/hamstring|\bhams?\b|biceps femoris|semitend|semimemb|back of thigh/, { hamstrings: 1 }],
  [/quad|vastus|rectus femoris|\bvmo\b|front thigh/, { quads: 1 }],
  [/glute|butt|\bhips?\b/, { glutes: 1 }],
  [/tibialis|\bshins?\b|\btibs?\b/, { tibialisAnterior: 1 }],
  [/calf|calves|gastroc|soleus/, { calves: 1 }],
  [/oblique|serratus|\bsides?\b/, { obliques: 1 }],
  [/\babs?\b|abdom|six pack|transvers|\bcore\b/, { abs: 1 }],
  [/\blats?\b|latissimus|teres major/, { lats: 1 }],
  [/trap|rhomboid|upper back|mid(dle)? back|levator/, { traps: 1 }],
  [/delt|shoulder|rotator|infraspinatus|supraspinatus/, { shoulders: 1 }],
  [/pec|chest/, { chest: 1 }],
  [/tricep/, { triceps: 1 }],
  [/bicep|brachialis/, { biceps: 1 }],
  [/forearm|wrist|grip|brachioradialis|flexor|extensor/, { forearms: 1 }],
  [/neck|sternocleido|\bscm\b/, { neck: 1 }],
  [/\bback\b/, BACK],
  [/\blegs?\b|lower body/, LEGS],
  [/\barms?\b/, ARMS],
  [/full ?body|total body|whole body/, { fullBody: 1 }],
  [/cardio|conditioning|aerobic|hiit|run|cycl|row(ing)? machine/, { cardio: 1 }],
];

/** normalizeKey, then hyphens/parentheses → spaces so 'lower-back' and 'lower back' agree. */
function clean(key: string): string {
  return normalizeKey(key).replace(/[-()]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const resolved = new Map<string, Credit>();

/**
 * Normalized muscle key → region credits summing to 1 (research §2.2/§2.3).
 * Group labels split equally; unknown labels → { other: 1 }. Result is shared: do not mutate.
 */
export function resolveMuscle(key: string): Credit {
  const hit = resolved.get(key);
  if (hit) return hit;
  const k = clean(key);
  let out = TABLE.get(k) ?? (k.endsWith('s') ? TABLE.get(k.slice(0, -1)) : undefined);
  if (!out) {
    for (const [re, credit] of FALLBACK) {
      if (re.test(k)) {
        out = credit;
        break;
      }
    }
  }
  out ??= { other: 1 };
  resolved.set(key, out);
  return out;
}

/** Delt head named by a muscle label ('rear delts' → 'rear'), else null. */
export function deltHeadOf(key: string): DeltHead | null {
  const k = clean(key);
  if (!/delt|shoulder/.test(k)) return null;
  if (/rear|posterior/.test(k)) return 'rear';
  if (/side|lateral|medial|middle/.test(k)) return 'side';
  if (/front|anterior/.test(k)) return 'front';
  return null;
}

export interface CatalogEntry {
  m: Partial<Record<RegionId, number>>;
  d: DeltHead[];
}

type RawCatalog = Record<string, { m: Record<string, number>; d?: string[] }>;

let catalog: Map<string, CatalogEntry> | null = null;

function loadCatalog(): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const [name, entry] of Object.entries(catalogJson as unknown as RawCatalog)) {
    const key = clean(name);
    if (map.has(key)) continue;
    const m: Partial<Record<RegionId, number>> = {};
    for (const [id, w] of Object.entries(entry.m ?? {})) {
      if (isRegionId(id) && typeof w === 'number' && Number.isFinite(w)) m[id] = w;
    }
    const d = (entry.d ?? []).filter((h): h is DeltHead => h === 'front' || h === 'side' || h === 'rear');
    map.set(key, { m, d });
  }
  return map;
}

/** Bundled Motra catalog entry for an exercise name (case/space/punctuation-insensitive). */
export function catalogLookup(exerciseName: string): CatalogEntry | null {
  catalog ??= loadCatalog();
  return catalog.get(clean(exerciseName)) ?? null;
}
