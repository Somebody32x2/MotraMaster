/**
 * Body-map artwork. Every shape is authored once for the right half of the
 * figure (x ≥ MIDLINE) as a list of anchor points and converted to smooth
 * cubic Béziers (Catmull-Rom); the renderer mirrors muscles about the midline.
 * The silhouette is authored as a half contour and mirrored into one path so
 * it has no seam.
 *
 * Coordinates live in a 200 × 440 box per view.
 */
import type { DeltHead, RegionId } from '../../core/analytics/types'

export const VIEW_W = 200
export const VIEW_H = 440
export const MIDLINE = VIEW_W / 2

/** Anchor point; a third element `1` makes it a sharp corner (tendon tip, armpit). */
type Pt = readonly [number, number] | readonly [number, number, 1]

export interface MuscleArt {
  region: RegionId
  /** Deltoid head for detailed shoulder shading. */
  delt?: DeltHead
  d: string
}

export interface ViewArt {
  id: 'front' | 'back'
  label: string
  silhouette: string
  /** Non-interactive anatomical hints (kneecaps, navel), stroked only. */
  details: string[]
  /** Right-half muscles; rendered once as-is and once mirrored. */
  muscles: MuscleArt[]
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString()

/** Closed Catmull-Rom spline through `pts` as cubic Bézier path data. */
function smooth(pts: readonly Pt[]): string {
  const n = pts.length
  const tangent = (i: number): [number, number] => {
    const p = pts[i]
    if (p[2] === 1) return [0, 0]
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    return [(next[0] - prev[0]) / 6, (next[1] - prev[1]) / 6]
  }
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const ta = tangent(i)
    const tb = tangent((i + 1) % n)
    d += `C${r1(a[0] + ta[0])} ${r1(a[1] + ta[1])} ${r1(b[0] - tb[0])} ${r1(b[1] - tb[1])} ${r1(b[0])} ${r1(b[1])}`
  }
  return d + 'Z'
}

/**
 * Joins a right-half contour (top centre → down the right side → back to the
 * centre) with its mirror image into one closed outline.
 */
function mirroredOutline(half: readonly Pt[]): string {
  const mirrored = half
    .slice(1, -1)
    .reverse()
    .map((p): Pt => (p[2] === 1 ? [VIEW_W - p[0], p[1], 1] : [VIEW_W - p[0], p[1]]))
  return smooth([...half, ...mirrored])
}

const m = (region: RegionId, pts: readonly Pt[], delt?: DeltHead): MuscleArt =>
  delt ? { region, delt, d: smooth(pts) } : { region, d: smooth(pts) }

/* ------------------------------------------------------------------ */
/* Silhouette (shared by both views)                                   */
/* ------------------------------------------------------------------ */

const BODY_HALF: readonly Pt[] = [
  [100, 7],
  [111, 9],
  [118, 18],
  [120, 29],
  [121.5, 33],
  [121, 41],
  [118, 45],
  [115, 52],
  [112, 58],
  [112, 64],
  [114, 70],
  [124, 75],
  [136, 79],
  [146, 82],
  [155, 88],
  [160, 98],
  [162, 112],
  [164, 135],
  [165, 158],
  [166, 178],
  [170, 196],
  [170, 216],
  [167.5, 240],
  [170, 250],
  [170.5, 261],
  [168, 272],
  [163, 277],
  [159, 273],
  [157, 263],
  [156.5, 251],
  [157, 243],
  [154, 222],
  [151, 200],
  [148, 184],
  [146, 166],
  [143, 146],
  [139, 124],
  [137, 116, 1],
  [137, 134],
  [135, 156],
  [131, 176],
  [129, 192],
  [131, 206],
  [137, 220],
  [141, 236],
  [143, 258],
  [142, 286],
  [138, 314],
  [134, 332],
  [136, 346],
  [139, 364],
  [137, 384],
  [130, 404],
  [132, 416],
  [132, 426],
  [127, 431],
  [117, 431],
  [112, 427],
  [112.5, 416],
  [113, 404],
  [107, 386],
  [104, 364],
  [106, 344],
  [107, 332],
  [105, 310],
  [103, 284],
  [101.5, 262],
  [100, 254, 1],
]

const SILHOUETTE = mirroredOutline(BODY_HALF)

/* ------------------------------------------------------------------ */
/* Front                                                               */
/* ------------------------------------------------------------------ */

const FRONT_MUSCLES: MuscleArt[] = [
  // Sternocleidomastoid: mastoid → sternal notch.
  m('neck', [[113, 48], [116, 53], [110, 68], [104, 79, 1], [102, 76], [106, 63], [110, 51]]),
  // Upper trapezius slope.
  m('traps', [[114, 60, 1], [119, 68], [129, 74], [140, 79, 1], [126, 79], [116, 76], [114, 69]]),
  // Deltoid: anterior and lateral heads.
  m('shoulders', [[131, 84], [139, 82], [146, 86], [149, 98], [149, 112], [150, 127, 1], [143, 116], [137, 105], [132, 95]], 'front'),
  m('shoulders', [[143, 81], [152, 85], [158, 94], [160, 108], [156, 120], [152, 128, 1], [152, 112], [151, 98], [148, 88]], 'side'),
  // Pectoralis major.
  m('chest', [[102, 90], [112, 87], [122, 87], [127, 90], [132, 101], [139, 113, 1], [131, 121], [121, 127], [110, 128], [102, 124]]),
  // Biceps.
  m('biceps', [[143, 128], [149, 123], [155, 129], [157.5, 145], [156, 161], [151, 175, 1], [146, 163], [143, 147]]),
  // Lateral triceps sliver.
  m('triceps', [[159.5, 122, 1], [162.5, 134], [163.5, 150], [162, 166, 1], [159.5, 150], [158.8, 134]]),
  // Forearm: brachioradialis/extensors (outer) and flexors (inner).
  m('forearms', [[157, 180], [163, 178], [168, 188], [169, 204], [167, 222], [165, 236, 1], [162, 220], [160, 200], [157, 190]]),
  m('forearms', [[150, 186], [155, 186], [158, 198], [160, 216], [162, 236, 1], [157, 226], [153, 210], [151, 197]]),
  // Lats: wing visible under the arm.
  m('lats', [[132.5, 122], [136, 120, 1], [136.5, 132], [134.5, 150, 1], [132, 136]]),
  // Serratus anterior fingers + external oblique.
  m('obliques', [[123, 128], [130, 125], [131.5, 129], [124, 134, 1]]),
  m('obliques', [[122, 137], [130, 134], [131.5, 138], [123, 143, 1]]),
  m('obliques', [[121, 146], [130, 143], [131.5, 147], [122, 152, 1]]),
  m('obliques', [[120, 156], [129, 152], [132, 158], [130, 178], [130, 196], [133, 210], [127, 218], [119, 226, 1], [117, 210], [118, 190], [119, 170]]),
  // Rectus abdominis: three tendinous rows above the navel, long lower belly.
  m('abs', [[102, 131], [109, 130], [116, 132], [117, 140], [116, 148], [109, 148.5], [102, 148.5], [101.8, 140]]),
  m('abs', [[102, 151], [109, 151], [115.5, 151.5], [116, 160], [115.5, 168], [109, 168.5], [102, 168.5], [101.8, 160]]),
  m('abs', [[102, 171], [109, 171], [115, 171.5], [115.5, 180], [115, 188], [109, 188.5], [102, 188.5], [101.8, 180]]),
  m('abs', [[102, 191], [109, 191], [114.5, 192], [114.5, 208], [111, 226], [105, 238], [102, 238, 1], [101.8, 214]]),
  // Iliopsoas / pectineus strip along the inguinal line.
  m('hipFlexors', [[130, 220], [133, 224], [124, 236], [114, 248, 1], [111, 245], [120, 232]]),
  // Tensor fasciae latae.
  m('abductors', [[133, 226], [138, 229], [140, 242], [139, 262, 1], [135, 250], [132, 236]]),
  // Quadriceps: vastus lateralis, rectus femoris, vastus medialis.
  m('quads', [[135, 250], [140, 258], [141.5, 278], [139, 300], [134, 318], [131, 324, 1], [130.5, 304], [131.5, 280], [133, 262]]),
  m('quads', [[123, 240], [129, 248], [129.5, 272], [127, 298], [122, 316, 1], [118, 298], [117, 272], [119, 252]]),
  m('quads', [[111, 286], [117, 294], [121, 310], [120, 323], [113, 327], [108, 320], [107, 304]]),
  // Adductors: inner thigh.
  m('adductors', [[102.5, 258], [108, 252], [115, 256], [116, 272], [112, 291, 1], [106.5, 287], [103.5, 275]]),
  // Tibialis anterior.
  m('tibialisAnterior', [[122, 343], [129, 346], [131, 362], [128, 384], [124, 400, 1], [121.5, 380], [120.5, 360]]),
  // Calves: medial gastrocnemius edge and lateral calf.
  m('calves', [[107.5, 341], [114, 342], [117, 356], [114.5, 380, 1], [108, 370], [105.5, 356]]),
  m('calves', [[133, 342], [137, 350], [138, 366], [134.5, 384, 1], [132.5, 366], [132.5, 352]]),
]

const FRONT_DETAILS: string[] = [
  smooth([[117.5, 325], [122, 323], [126.5, 325], [127, 331.5], [122, 335.5], [117, 331.5]]),
  smooth([[100, 189], [101.5, 191.5], [100, 194], [98.5, 191.5]]),
]

/* ------------------------------------------------------------------ */
/* Back                                                                */
/* ------------------------------------------------------------------ */

const BACK_MUSCLES: MuscleArt[] = [
  // Upper neck (splenius / semispinalis) above the trapezius.
  m('neck', [[102, 57], [108, 56], [111, 61], [110, 66, 1], [102, 64]]),
  // Trapezius: upper, middle and lower fibres in one diamond half.
  m('traps', [[102, 66, 1], [109, 69], [118, 75], [130, 79], [140, 82, 1], [128, 90], [120, 104], [112, 130], [102, 168, 1]]),
  // Deltoid: posterior and lateral heads.
  m('shoulders', [[128, 93], [137, 88], [144, 91], [148, 102], [149, 121, 1], [141, 108], [133, 99]], 'rear'),
  m('shoulders', [[143, 81], [152, 85], [158, 94], [160, 108], [156, 120], [152, 128, 1], [152, 112], [151, 98], [148, 88]], 'side'),
  // Infraspinatus / teres minor (rotator cuff) under the scapular spine.
  m('shoulders', [[114, 108], [124, 99], [133, 103], [137, 111], [133, 119], [121, 123], [114, 119]], 'rear'),
  // Latissimus dorsi + teres major.
  m('lats', [[114, 130], [126, 125], [138, 118], [140, 128], [138, 146], [134, 166], [127, 184], [119, 196, 1], [117, 180], [113, 160], [111, 145]]),
  // Triceps: long head (medial) and lateral head.
  m('triceps', [[144, 126], [150, 124], [153, 138], [154, 158], [152, 170, 1], [147, 160], [144, 145]]),
  m('triceps', [[155.5, 124], [160, 124], [162.5, 136], [163, 154], [158, 166, 1], [156, 152], [155.5, 138]]),
  // Forearm extensors and flexors.
  m('forearms', [[152, 184], [158, 181], [164, 185], [168.5, 198], [168, 218], [165, 236, 1], [159, 220], [155, 204], [152, 193]]),
  m('forearms', [[149, 190], [152, 198], [156, 216], [159, 236, 1], [154, 226], [150, 208]]),
  // Erector spinae.
  m('lowerBack', [[103, 172], [108, 167], [112.5, 172], [115, 190], [115, 206], [110, 220], [103, 224]]),
  // Oblique flank sliver.
  m('obliques', [[121, 198], [129, 188], [132.5, 196], [133, 210], [124, 211]]),
  // Gluteus medius (abductors).
  m('abductors', [[118, 216], [128, 212], [136, 216], [140, 228], [137, 240, 1], [126, 228]]),
  // Gluteus maximus.
  m('glutes', [[102, 226], [112, 224], [124, 229], [135, 240], [140, 256], [136, 270], [122, 276], [108, 274], [102, 268]]),
  // Adductor magnus, inner back thigh.
  m('adductors', [[105, 279], [109, 278], [111, 290], [109, 306, 1], [106, 298], [105, 288]]),
  // Hamstrings: semitendinosus/membranosus (medial) and biceps femoris (lateral).
  m('hamstrings', [[113, 280], [121, 280], [124, 296], [123, 312], [116, 328, 1], [113, 310], [112.5, 295]]),
  m('hamstrings', [[126, 280], [134, 278], [139, 290], [137, 310], [130, 326, 1], [126, 310], [125.5, 295]]),
  // Gastrocnemius heads and soleus.
  m('calves', [[108, 340], [116, 336], [120, 346], [120, 370], [115, 384, 1], [109, 374], [106, 356]]),
  m('calves', [[124, 338], [131, 338], [136, 350], [135, 368], [127, 380, 1], [123, 364], [122.5, 348]]),
  m('calves', [[113, 387], [126, 383], [133, 376], [130, 393], [121, 399], [114.5, 396]]),
]

const BACK_DETAILS: string[] = []

export const FRONT: ViewArt = {
  id: 'front',
  label: 'Front',
  silhouette: SILHOUETTE,
  details: FRONT_DETAILS,
  muscles: FRONT_MUSCLES,
}

export const BACK: ViewArt = {
  id: 'back',
  label: 'Back',
  silhouette: SILHOUETTE,
  details: BACK_DETAILS,
  muscles: BACK_MUSCLES,
}
