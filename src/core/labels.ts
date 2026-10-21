/**
 * Label normalization and display helpers.
 *
 * Keys are the identity of an exercise / muscle across spellings
 * ("Lower_Back", "lower back", "lowerBack" → "lower back"). Display labels
 * are the human-facing, title-cased form. Nothing here assumes a closed
 * vocabulary: any string in, sensible string out.
 */

/** Short tokens that should always render in capitals. */
const ACRONYMS: Record<string, true> = {
  rdl: true, sldl: true, ez: true, db: true, bb: true, kb: true, ohp: true, ghr: true,
  trx: true, hiit: true, emom: true, amrap: true, rpe: true, rir: true, tvl: true,
  hr: true, bpm: true, sl: true, jm: true, atg: true, ssb: true,
};

/** Words kept lowercase when not leading a phrase or parenthetical. */
const MINOR_WORDS: Record<string, true> = {
  a: true, an: true, and: true, as: true, at: true, but: true, by: true, for: true,
  from: true, in: true, into: true, nor: true, of: true, on: true, onto: true, or: true,
  over: true, per: true, the: true, to: true, vs: true, via: true, with: true,
};

/** Split camelCase / PascalCase boundaries and underscores into spaces; collapse whitespace. */
function spaceOut(raw: string): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/_+/g, ' ')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalized identifier: NFKC, lowercase, `_`/camelCase/whitespace runs → single
 * space, apostrophes dropped, punctuation other than parentheses and hyphens
 * replaced by spaces, leading/trailing punctuation stripped.
 */
export function normalizeKey(raw: string): string {
  return spaceOut(raw)
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}()\- ]+/gu, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-]+|[\s\-]+$/g, '')
    .replace(/^\(\)|\(\)$/g, '')
    .trim();
}

function capitalize(word: string): string {
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Human-readable label: title case, known/short acronyms kept in capitals,
 * minor words lowercase mid-phrase, parenthetical content title-cased.
 * `machine fly (pec dec)` → `Machine Fly (Pec Dec)`, `lower_back` → `Lower Back`,
 * `romanian deadlift rdl` → `Romanian Deadlift RDL`, `t-bar row` → `T-Bar Row`.
 */
export function displayLabel(raw: string): string {
  const text = spaceOut(raw);
  if (!text) return '';
  // An all-caps input carries no case information, so only known acronyms survive.
  const shouting = !/\p{Ll}/u.test(text);
  let phraseStart = true;
  let out = '';
  let last = 0;
  const wordRe = /[\p{L}\p{N}'’]+/gu;
  for (let m = wordRe.exec(text); m; m = wordRe.exec(text)) {
    const between = text.slice(last, m.index);
    if (between.includes('(') || between.includes(':') || between.includes('/')) phraseStart = true;
    out += between;
    const word = m[0];
    const lower = word.toLowerCase();
    let rendered: string;
    if (Object.hasOwn(ACRONYMS, lower)) {
      rendered = word.toUpperCase();
    } else if (!shouting && word.length >= 2 && word.length <= 4 && /^\p{Lu}+$/u.test(word)) {
      rendered = word;
    } else if (!phraseStart && Object.hasOwn(MINOR_WORDS, lower) && !between.endsWith('-')) {
      rendered = lower;
    } else if (/^\p{N}/u.test(word)) {
      rendered = lower;
    } else {
      rendered = capitalize(word);
    }
    out += rendered;
    phraseStart = false;
    last = m.index + word.length;
  }
  out += text.slice(last);
  return out;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Locale-aware, numeric-aware, case-insensitive comparison for sorting labels. */
export function compareLabels(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Split a muscle cell such as `Lats, Biceps` or `chest & triceps` into individual labels. */
export function splitMuscles(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,;/|&\n\r]+|\s+and\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && /[\p{L}\p{N}]/u.test(part));
}
