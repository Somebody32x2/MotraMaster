# MotraMaster — Research Spec

Compiled 2026-10-21. Tags: **[CONFIRMED]** = seen in a Motra source or primary paper; **[INFERRED]** = my reasoning, not verified against a real multi-workout export.

Companion artifact: **`local://motra-exercises.json`** (~525 KB). I crawled all 1,640 public Motra exercise pages (`https://www.motra.com/exercises/<slug>`). For each exercise it holds `{name, primary[], secondary[], weights{muscleId: 1..10}, sub[]}`. `name` is the Motra display name, the same string that shows up in the export (e.g. `"Machine Fly (Pec Dec)"`, `"Machine Seated Chest Press"`, `"Barbell Bench Press"`). Uses are in §1.3 and §4.2. If it gets bundled, reduce it to `name → {muscle: weight}` first (≈60 KB gzipped [INFERRED]).

---

## 1. Motra: the app, the export, and its vocabulary

### 1.1 What Motra is
- Motra (formerly *Train Fitness*, Train Fitness Inc., Toronto) is an iPhone + Apple Watch strength-training tracker. It detects exercises and counts reps from wrist motion, and also offers AI-generated workouts, muscle recovery tracking, and progressive-overload suggestions. [CONFIRMED] https://www.motra.com/ , https://apps.apple.com/us/app/motra-ai-workout-fitness-coach/id1548577496
- Export path: You → Settings → "Export Workout Data". The file arrives by email. The help article says ".csv", but the user has an `.xlsx`, and LiftShift's importer also takes a Motra "Excel (.xlsx) export". [CONFIRMED] https://help.motra.com/en/articles/10057923-data-import-and-export , https://liftshift.app/how-it-works
- **Block layout [CONFIRMED by third-party parser].** LiftShift's open-source Motra parser (`frontend/utils/csv/motraParser.ts` in https://github.com/aree6/LiftShift) parses the export as **many workout blocks stacked in one sheet**:
  - The title is the row immediately before `Workout Start`.
  - `Workout Start` begins a new block. `Workout End` is read separately.
  - `All Sets` is followed by a header row. Set rows run until the first row whose first cell is empty.
  - The parser reads the weight unit from the header text (`Weight (lbs)` vs `(kg)`) and the distance unit from `Distance (ft|m|mi|km)`.
  - It skips repeated `Exercise` header rows.
  - So: split on `Workout Start`, take the title from the previous non-blank row, and stop the sets table at a blank or whitespace-only first cell.
- **Units are user-selectable in Motra** (help articles "Change Weight Units" and "Change Distance Units"). Exports from kg users will probably say `Weight (kg)`, `Total TVL (kg)`, `Distance (m)`. [INFERRED from https://help.motra.com/en/collections/10026070-workouts-and-features ] → The parser must read the unit from the header and convert to lb/ft, since our types store lb/ft.
- Dates appear as local wall-clock time `YYYY-MM-DD HH:mm:ss` with no zone. [CONFIRMED by sample]

### 1.2 Muscle-group vocabulary [CONFIRMED: crawl of the official exercise library]
Every exercise page embeds a "Muscle Breakdown" JSON: `{"muscle":"lats","weight":9,"subMuscles":["teresMajor"]}`. Example: https://www.motra.com/exercises/machineRow . Across 1,640 exercises there are **exactly 18 top-level muscle ids**, all camelCase. Counts below are how many exercises involve each id:

| Motra id | Display | # exercises | Sub-muscle ids (Detailed body map) |
|---|---|---|---|
| `abs` | Abs | 1235 | rectusAbdominis, transverseAbdominis |
| `shoulders` | Shoulders | 959 | anteriorDelts, medialDelts, rearDelts |
| `glutes` | Glutes | 892 | gluteMax, gluteMedius |
| `lowerBack` | Lower Back | 730 | erectorSpinae |
| `hamstrings` | Hamstrings | 679 | bicepsFemoris, semitendinosus, semimembranosus |
| `obliques` | Obliques | 654 | externalObliques, internalObliques |
| `quads` | Quads | 619 | rectusFemoris, vastusLateralis, vastusMedialis |
| `traps` | Traps | 508 | upperTraps, midTraps, lowerTraps |
| `forearms` | Forearms | 472 | flexors, extensors |
| `calves` | Calves | 414 | gastrocnemius, soleus |
| `triceps` | Triceps | 407 | longHead, lateralHead, medialHead |
| `lats` | Lats | 343 | teresMajor |
| `chest` | Chest | 311 | upperChest, midChest, lowerChest |
| `biceps` | Biceps | 307 | longHead, shortHead, brachialis |
| `hipFlexors` | Hip Flexors | 276 | iliopsoas |
| `adductors` | Adductors | 221 | adductorMagnus, adductorLongus |
| `abductors` | Abductors | 52 | TFL, gluteMedius |
| `tibialisAnterior` | Tibialis Anterior | 11 | tibialisAnterior |

- Not in Motra's vocabulary: **neck**, **rhomboids**, **rear delts** as a top-level group (it is a sub-muscle of `shoulders`), **upper back**, **cardio**, **full body**. [CONFIRMED absent from all 1,640 pages] Cardio exercises such as Treadmill Run or Jump Rope are tagged with real muscles (quads/hamstrings/calves). Neck, cardio and full body can still show up from custom exercises or future versions, so the mapping (§2) handles them.
- **How primary vs secondary is decided [CONFIRMED statistically].** On the web pages, "Primary Muscle Groups" lists exactly the muscles with weight 8–10. "Secondary Muscles" lists weights 3–5. Weights 6–7 appear in the breakdown but in neither list.
  - Barbell Bench Press: primary `Chest`. Breakdown: chest 10, triceps 7, shoulders 6, lats 4, traps 4, forearms 3, abs 3.
  - **This matches the sample export cell `chest` exactly**, as do the other two sample exercises (both chest-only primaries).
- **Multiple primaries are common [CONFIRMED].** Of 1,640 exercises, 649 have 1 primary, 773 have 2, 178 have 3, and 40 have 4–6. Barbell Deadlift has `Glutes, Hamstrings, Lower Back`. So export cells **will** often contain several muscles.
  - Exact separator and casing in the export: [INFERRED] probably comma-separated lowercase or camelCase ids, e.g. `glutes, hamstrings, lowerBack`.
  - → `normalizeKey` must split camelCase (`lowerBack` → `lower back`, `hipFlexors` → `hip flexors`, `tibialisAnterior` → `tibialis anterior`) as well as `_`/`-`. The parser should split on `,` `;` `/` `&` `|` `+` and " and ". (Parser agent has been told.)

### 1.3 Using the exercise catalog
- Look up an export exercise by `normalizeKey(name)` in `local://motra-exercises.json`. Display names match the export (sample: all 3 found). 5 names are duplicated across slugs (e.g. "Smith Machine Hip Thrust"); in those cases take either entry.
- Custom exercises won't match. Fall back to the export's primary cell only.
- What the catalog enables: secondary-muscle **fractional sets** (§4.2), better body-map coloring, and push/pull classification. If the catalog is not shipped, every analysis below still works from the export's primary cell alone.

### 1.4 Effort (RPE) [CONFIRMED]
- Motra "Perceived Effort" is labeled RPE and uses a 1–10 slider, at both workout level and set level. https://help.motra.com/en/articles/9672055-perceived-effort , https://help.motra.com/en/articles/11831615-adding-rpe-effort-to-a-set
- Set-level anchors:

  | Effort | Label | Description |
  |---|---|---|
  | 1–3 | Easy | |
  | 4–6 | Moderate | |
  | 7–8 | Hard | "Maybe could have done 1 more rep" |
  | 9–10 | All Out | "Could not do any more reps" |

- This is **coarser than the RIR-based RPE scale** (Zourdos 2016: RPE 10 = 0 RIR, 9 = 1, 8 = 2, 7 = 3; https://pubmed.ncbi.nlm.nih.gov/26049792 , https://pmc.ncbi.nlm.nih.gov/articles/PMC4961270 ).
- Motra's MCP docs show half-point values such as "RPE 8.5" (https://help.motra.com/en/articles/14140325-connect-motra-to-your-favorite-ai-assistant ), so numeric effort can be fractional.
- Export: `'N/A'` or `''` when not logged (sample). Treat effort as optional everywhere.

### 1.5 TVL [CONFIRMED]
- "Total Volume Lifted" is defined as: `Volume = Weight × TVL Factor × Reps × Rep Factor`. https://help.motra.com/en/articles/9698172-total-volume-lifted-tvl
  - **TVL Factor = 2** for "x2" exercises: dumbbells and other unilateral implements, where the logged weight is *per hand*.
  - **Rep Factor = 2** for alternating exercises where one rep covers both sides (e.g. Barbell Front Rack Lunge).
  - **Bodyweight exercises contribute 0 TVL.**
- Consequence: Σ(weight × reps) over the export's set rows will **not** equal `Total TVL` for workouts with dumbbell or lunge work, and the export has no column for either factor.
  - → Use Motra's `Total TVL` for workout-level totals.
  - → Use weight × reps for per-exercise trends. That is consistent within an exercise, and per-hand weights are the normal way to compare dumbbell lifts.
  - Optionally infer ×2 from names containing `Dumbbell`/`Kettlebell`/`Single-Arm`/`Alternating` when you need cross-exercise muscle volume. [INFERRED heuristic]

### 1.6 Heart-rate zones [CONFIRMED]
- Zones are % of max HR (https://help.motra.com/en/articles/9671427-heart-rate-zones-hrz ):

  | Zone | Name | % of max HR |
  |---|---|---|
  | 1 | Warm Up | 50–59% |
  | 2 | Endurance | 60–69% |
  | 3 | Moderate | 70–79% |
  | 4 | Intense | 80–89% |
  | 5 | Performance | 90–100% |

- Motra uses "your maximum heart rate data" and links Mayo Clinic's 220 − age guidance.
- Export cells are duration strings: `18m 51s`, `1m 16s`, `0s`. Parse `(\d+)h`, `(\d+)m`, `(\d+)s`.
- The zone sum can be less than the workout duration: sample 2,435 s vs 2,603 s, because time below 50% HRmax is not in any zone.

### 1.7 Other fields
- **Calories:** read from Apple Health (biometrics + HR). https://help.motra.com/en/articles/9698202-calories
- **Rest Time (seconds):** the sample has 0 on the first set and 211/448 on later sets. Per `types.ts` this is rest *before* the set. [INFERRED: the first set of each new exercise includes changeover/setup time, so exclude it from rest analysis or cap it]
- **Time (seconds):** set duration from the watch, e.g. 29.9 s for 10 reps ≈ 3.0 s/rep.
- **Reps:** Motra counts one rep of a unilateral exercise as both sides. https://help.motra.com/en/articles/9696458-counting-reps
- **Warm-up / cool-down sets:** these exist in the app (https://help.motra.com/en/articles/9672186-warm-up-wu-and-cool-down-cd-sets ) but there is **no set-type column** in the sample export → use the heuristic in §4.1.
- **Drop sets** are supported in the app; they are not marked in the export. [INFERRED]
- **Motra's own e1RM ("Predicted" in PR Breakdown):** uses the last 90 days of data and updates daily. Formula unpublished. https://help.motra.com/en/articles/9703315-personal-record-pr-breakdown

---

## 2. Body-map regions and label mapping

### 2.1 Canonical region set
Use Motra's 18 ids as region ids so Motra data maps 1:1. Add `neck` (drawn) plus three non-anatomical buckets that are not drawn: `fullBody`, `cardio`, `other`.

| Region id | Label | Front view | Back view | Notes |
|---|---|---|---|---|
| `neck` | Neck | ✓ (SCM) | ✓ (upper neck) | Not in Motra; custom exercises only |
| `traps` | Traps | ✓ (upper trap slope) | ✓ (upper/mid/lower diamond) | Absorbs rhomboids / upper back |
| `shoulders` | Shoulders | ✓ (front + side delts) | ✓ (rear delts) | Detailed: split into `frontDelts`/`sideDelts`/`rearDelts` paths |
| `chest` | Chest | ✓ | – | Detailed: upper/mid/lower |
| `biceps` | Biceps | ✓ | – | |
| `triceps` | Triceps | – (thin lateral sliver optional) | ✓ | |
| `forearms` | Forearms | ✓ | ✓ | |
| `lats` | Lats | ✓ (small lateral wing under the arm) | ✓ | |
| `abs` | Abs | ✓ | – | |
| `obliques` | Obliques | ✓ | – (optional side sliver) | Includes serratus |
| `lowerBack` | Lower Back | – | ✓ | Erectors |
| `hipFlexors` | Hip Flexors | ✓ (small strip at groin/ASIS) | – | |
| `glutes` | Glutes | – | ✓ | |
| `abductors` | Abductors | ✓ (TFL, upper-outer hip) | ✓ (glute med, above-lateral glute max) | |
| `adductors` | Adductors | ✓ (inner thigh) | ✓ (adductor magnus, inner back thigh) | |
| `quads` | Quads | ✓ | – | |
| `hamstrings` | Hamstrings | – | ✓ | |
| `calves` | Calves | ✓ (medial gastroc edge) | ✓ | |
| `tibialisAnterior` | Tibialis Anterior | ✓ (shin) | – | |
| `fullBody` / `cardio` / `other` | – | not drawn | not drawn | Listed beside the map |

SVG guidance (for Charts/UI):
- Left and right halves share one region id, e.g. `<path data-region="quads" …>` drawn twice.
- Draw a muted silhouette underneath (`--surface-2` fill, `--border` stroke) and paint region fills on top.
- Suggested fill scale for weekly fractional sets:

  | Weekly sets | Fill |
  |---|---|
  | 0 | none (silhouette only) |
  | < 5 | `--accent` at 25% |
  | 5–9 | `--accent` at 50% |
  | 10–20 | `--accent` 100% (target band) |
  | > 20 | `--warn` |

  The bands come from the evidence in §4.2. Always show a legend.

### 2.2 Synonym → region table
Apply this **after** `normalizeKey` (lowercase, camelCase/`_`/`-` split, single spaces). Also try the key with a trailing `s` removed if there's no hit.

| Raw label(s) (normalized) | Region(s) |
|---|---|
| chest, pec, pecs, pectoral, pectorals, pectoralis, pectoralis major, pectoralis minor, upper chest, mid chest, middle chest, lower chest, inner chest, clavicular pec, sternal pec | chest |
| shoulder, shoulders, delt, delts, deltoid, deltoids, front delt(s), anterior delt(s), anterior deltoid, side delt(s), lateral delt(s), medial delt(s), middle delt(s), rear delt(s), posterior delt(s), posterior deltoid, rotator cuff, infraspinatus, supraspinatus, teres minor, subscapularis | shoulders (sub-region by front/side/rear keyword) |
| bicep, biceps, biceps brachii, brachialis, short head, arm flexors | biceps |
| tricep, triceps, triceps brachii, long head, lateral head, medial head | triceps |
| forearm, forearms, wrist flexors, wrist extensors, flexors, extensors, brachioradialis, grip, wrists | forearms |
| ab, abs, abdominal, abdominals, rectus abdominis, transverse abdominis, transversus abdominis, tva, six pack, upper abs, lower abs | abs |
| oblique, obliques, external obliques, internal obliques, serratus, serratus anterior, sides, love handles | obliques |
| lat, lats, latissimus, latissimus dorsi, teres major, wings | lats |
| trap, traps, trapezius, upper traps, mid traps, middle traps, lower traps, rhomboid, rhomboids, upper back, mid back, middle back, levator scapulae | traps |
| lower back, low back, lowerback, lumbar, erector, erectors, erector spinae, spinal erectors, back extensors, multifidus, quadratus lumborum, ql | lowerBack |
| glute, glutes, gluteus, gluteus maximus, glute max, gluteals, buttocks, butt, hips | glutes |
| abductor, abductors, hip abductors, outer thigh, outer thighs, gluteus medius, glute medius, glute med, gluteus minimus, tfl, tensor fasciae latae, it band | abductors |
| adductor, adductors, hip adductors, inner thigh, inner thighs, groin, adductor magnus, adductor longus, adductor brevis, gracilis, pectineus | adductors |
| hip flexor, hip flexors, iliopsoas, psoas, iliacus | hipFlexors |
| quad, quads, quadricep, quadriceps, quadriceps femoris, thigh, thighs, front thigh, vastus lateralis, vastus medialis, vastus intermedius, vmo, rectus femoris | quads |
| hamstring, hamstrings, ham, hams, hammies, biceps femoris, semitendinosus, semimembranosus, back of thigh, rear thigh | hamstrings |
| calf, calves, gastrocnemius, gastroc, soleus, lower leg, lower legs | calves |
| tibialis, tibialis anterior, tib, tibs, shin, shins | tibialisAnterior |
| neck, sternocleidomastoid, scm, neck flexors, neck extensors, splenius | neck |
| **Group labels, expanded with equal split** | |
| back | lats, traps (½ each) |
| core | abs, obliques (½ each) |
| arms | biceps, triceps, forearms (⅓ each) |
| legs, lower body, upper legs | quads, hamstrings, glutes, calves (¼ each) |
| upper body | chest, shoulders, lats, traps, biceps, triceps (⅙ each) |
| posterior chain | glutes, hamstrings, lowerBack (⅓ each) |
| push | chest, shoulders, triceps (⅓ each) |
| pull | lats, traps, biceps (⅓ each) |
| full body, fullbody, total body, whole body, compound | fullBody |
| cardio, conditioning, aerobic, endurance, hiit | cardio |
| '' , n/a, na, none, other, unknown, `-` | other |

Group labels split one set fractionally so totals are preserved. Alternatively count the full set toward each member, but say so in the UI.

### 2.3 Fallback for unknown labels (ordered keyword rules)
Run these on the normalized key **in order**; the first match wins. Order matters: `biceps femoris` must hit hamstrings before biceps, and `rectus femoris` must hit quads before abs.

```
1  /lower back|low back|lumbar|erector|spinal|quadratus/                 → lowerBack
2  /hip flex|psoas|iliacus/                                              → hipFlexors
3  /abduct|glute(us)? med|glute(us)? min|tfl|tensor|outer thigh|it band/ → abductors
4  /adduct|inner thigh|groin|gracilis|pectineus/                         → adductors
5  /hamstring|\bhams?\b|biceps femoris|semitend|semimemb|back of thigh/  → hamstrings
6  /quad|vastus|rectus femoris|\bvmo\b|front thigh/                      → quads
7  /glute|butt|\bhips?\b/                                                → glutes
8  /tibialis|\bshins?\b|\btibs?\b/                                       → tibialisAnterior
9  /calf|calves|gastroc|soleus/                                          → calves
10 /oblique|serratus|\bsides?\b/                                         → obliques
11 /\babs?\b|abdom|six pack|transvers|\bcore\b/                          → abs
12 /\blats?\b|latissimus|teres major/                                    → lats
13 /trap|rhomboid|upper back|mid(dle)? back|levator/                     → traps
14 /delt|shoulder|rotator|infraspinatus|supraspinatus/                   → shoulders
15 /pec|chest/                                                           → chest
16 /tricep/                                                              → triceps
17 /bicep|brachialis/                                                    → biceps
18 /forearm|wrist|grip|brachioradialis|flexor|extensor/                  → forearms
19 /neck|sternocleido|\bscm\b/                                           → neck
20 /\bback\b/                                                            → lats+traps (group)
21 /\blegs?\b|lower body/                                                → legs group
22 /\barms?\b/                                                           → arms group
23 /full ?body|total body|whole body/                                    → fullBody
24 /cardio|conditioning|aerobic|hiit|run|cycl|row(ing)? machine/         → cardio
25 (no match)                                                            → other
```

- Keep the **raw label** on `MuscleInfo` and show unmapped labels in an "Other" list with their set counts. The body map must never silently drop data.
- Optional: when the exercise is in the catalog and its muscle cell is empty or unmapped, take the catalog's primaries.

---

## 3. Estimated 1RM

### 3.1 Formulas
`w` = weight, `r` = reps. All formulas return `w` when `r = 1`; use that literally. Sources: https://en.wikipedia.org/wiki/One-repetition_maximum (raw wikitext formulas), LeSuer 1997 https://paulogentil.com/pdf/The%20Accuracy%20of%20Prediction%20Equations%20for%20Estimating%201-RM%20Performance%20in%20the%20Bench%20Press%2C%20Squat%2C%20and%20Deadlift.pdf

| Name | e1RM | Valid / notes |
|---|---|---|
| Epley (1985) | `w * (1 + r/30)` | Most common. Slightly higher than Brzycki below 10 reps; identical at r = 10 |
| Brzycki (1993) | `w * 36 / (37 - r)` | Breaks down as r → 37; inflates quickly above ~12 |
| Lombardi | `w * r^0.10` | Lowest at high reps |
| Mayhew et al. (1992) | `100*w / (52.2 + 41.9*exp(-0.055*r))` | Best on bench in LeSuer 1997 |
| Wathan (1994) | `100*w / (48.8 + 53.8*exp(-0.075*r))` | Best on bench **and** squat in LeSuer 1997 |
| O'Conner et al. | `w * (1 + 0.025*r)` | Conservative |
| Lander (1985) | `100*w / (101.3 - 2.67123*r)` | ≈ Brzycki |

Example: 100 lb × 6 → Epley 120.0, Brzycki 116.1, Wathan 120.3, Mayhew 121.5, Lombardi 119.6, O'Conner 115.0, Lander 117.3.

### 3.2 Accuracy evidence
- **LeSuer et al. 1997** (67 untrained college students; bench, squat, deadlift): every equation correlated r > 0.95 with the true 1RM. Even so, only Mayhew and Wathan had no significant mean bias on bench, and only Wathan on squat. **All equations significantly underestimated the deadlift.** (Abstract: https://journals.lww.com/nsca-jscr/abstract/1997/11000/the_accuracy_of_prediction_equations_for.1.aspx ; summary: https://pmc.ncbi.nlm.nih.gov/articles/PMC3761544/ )
- **Reynolds et al. 2006** (bench and leg press; 1/5/10/20 RM): the load drop-off is non-linear. **5RM data predicted best** (R² 0.993 for bench). "No more than 10 repetitions should be used" in linear equations. https://pubmed.ncbi.nlm.nih.gov/16937972/
- General: estimates may be ≥10% off for individuals; exercise-specific equations help; anthropometrics do not. (Wikipedia above)

### 3.3 Recommended `auto` mode
1. **Eligibility.**
   - `weight > 0` and `reps ≥ 1`.
   - Skip bodyweight exercises (weight 0) and sets with `distanceFt > 0` and `reps == 0` (cardio).
2. **Effective reps from effort (optional).** If `effort` is numeric:
   - `rir = clamp(10 - effort, 0, 4)`. Only apply when `effort ≥ 6`; below that, self-reports are unreliable and the set is far from failure.
   - `rEff = reps + rir`. This puts the set on a "reps to failure" footing, which is what every formula assumes.
   - Without effort, `rEff = reps` and the estimate is a **lower bound** (sets usually stop short of failure).
3. **Formula by `rEff`:**

   | `rEff` | e1RM | Confidence |
   |---|---|---|
   | 1 | `w` | high |
   | 2–10 | mean(Epley, Brzycki) | high |
   | 11–15 | Wathan | medium |
   | > 15 | null (don't estimate) | – |

   For 2–10, Epley and Brzycki bracket each other and coincide at 10; their mean ≈ Wathan/Mayhew. For 11–15, Wathan stays well-behaved where Brzycki blows up and Epley overestimates [INFERRED from formula shapes]. Sets above 15 still count for volume.
4. When the user picks a specific formula, use it for `rEff ≤ 15`; null beyond that.

### 3.4 Session best, trend, rate of gain
- **Session e1RM** = max e1RM over that exercise's eligible sets in the workout. Prefer high-confidence sets; use medium only when no high one exists, and mark the point hollow.
- **Trend line:**
  - Plot session points.
  - Overlay an EWMA: `s_t = s_{t-1} + α(x_t - s_{t-1})` with `α = 1 - 0.5^(Δdays/21)` (21-day half-life, robust to irregular spacing).
  - Overlay a running all-time max (PR envelope) as a step line.
- **Rate of gain (%/month):**
  - Theil–Sen slope (median of pairwise slopes, robust to bad days) of session e1RM vs days over the last 90 days.
  - Need ≥ 4 sessions spanning ≥ 21 days.
  - `%/month = slope * 30.44 / median(e1RM) * 100`.
  - Normal mode shows `+2.3%/mo`. Detailed mode also shows the 30-, 90- and 365-day deltas.
- **Plateau / dip labels:**
  - Plateau: no e1RM PR in the last ≥ 5 sessions **and** ≥ 28 days **and** |rate| < 1%/mo.
  - Dip: rate < −1%/mo.
  - Progressing: rate > +1%/mo.
  - Show "insufficient data" below the minimums.
  - LiftShift uses comparable bands: >+1% stronger, −3%…+1% plateau, <−3% dip (https://liftshift.app/how-it-works ).

### 3.5 Caveats to show in the UI
- **Machines:** weights are stack/plate numbers, and leverage differs by brand. e1RM is only comparable within the same exercise (same machine). Never compare machine numbers to free-weight standards or across gyms.
- **Dumbbells / x2:** the logged weight is per hand (§1.5). e1RM is per hand too, which is consistent within the exercise.
- **Bodyweight and assisted exercises:** no e1RM. Detailed mode could use `bodyweight + added weight` if bodyweight is set, but the export has no "added weight" semantics for assisted machines, so skip.
- **Deadlift-type pulls** are systematically under-predicted (LeSuer 1997).
- **Novices:** estimates overshoot true 1RM.
- **Rep counts:** auto-detected reps can be miscounted (Motra requires ≥ 3 reps for auto-detection: https://help.motra.com/en/articles/9696458-counting-reps ). Flag sets with absurd values: e1RM jump > 25% versus the previous 30-day best → mark as an outlier and exclude from PRs until confirmed by a second session. [INFERRED]

### 3.6 PR definitions (per exercise; ignore an exercise's first session as "baseline")
| PR type | Definition |
|---|---|
| Weight PR | Set weight > every previous set weight (reps ≥ 1) |
| Rep PR (Pareto) | Set (w, r) where no earlier set has `w' ≥ w` and `r' ≥ r`. Generalizes "more reps at this weight" and makes a natural rep-max table like Motra's PR Breakdown |
| e1RM PR | Session e1RM (high/medium confidence) > previous max |
| Set volume PR | `w × r` > previous single-set max |
| Session volume PR | Σ(w × r) for the exercise in one workout > previous max |
| Workout PRs | Highest workout TVL, longest workout, most sets — fun, low value |

---

## 4. Dashboard statistics

### 4.1 Shared definitions
- **Working (hard) set** [INFERRED heuristic, since the export has no set type]. A set counts when `reps ≥ 1` (or `durationSec > 0` for timed/bodyweight work) and:
  - if `effort` is numeric: `effort ≥ 6`;
  - else if `weight > 0`: `weight ≥ 0.6 × (heaviest weight for that exercise in the same workout)`;
  - otherwise (bodyweight): yes.

  This removes ramp-up warm-ups. Robinson 2024 shows hypertrophy improves as sets approach failure (https://pubmed.ncbi.nlm.nih.gov/38970765/ ), so counting light warm-ups would overstate stimulus.
- **Week:** ISO week (Mon–Sun) for bars. Rolling 7 days for "this week" cards.
- **Volume load (VL)** = Σ `weightLb × reps` over sets. Workout totals use Motra's `tvlLb` when present.
- **Muscle attribution:**
  - Each **primary** muscle in the cell gets 1.0 set (if a cell lists 3 primaries, each gets 1.0, which matches how Motra and the literature count direct work).
  - Detailed mode with the catalog adds **secondary fractions**: catalog weight 6–7 → 0.5; ≤ 5 → 0.
  - This follows Pelland et al.: counting indirect sets as 0.5 ("fractional") fit hypertrophy and strength outcomes best. https://pubmed.ncbi.nlm.nih.gov/41343037/

### 4.2 Evidence anchors
- **Weekly sets per muscle:**
  - Graded dose-response; 10+ sets per muscle per week trended best (Schoenfeld 2017, https://pubmed.ncbi.nlm.nih.gov/27433992/ ).
  - More volume → more growth with diminishing returns, and much flatter returns for strength (Pelland 2026, link above).
  - UI band: **< 5 low · 5–9 moderate · 10–20 typical hypertrophy range · > 20 high** (informational, not a prescription).
- **Frequency:** with volume equated, frequency has a negligible effect on hypertrophy but a positive (diminishing) effect on strength (Pelland 2026).
- **Load:** similar hypertrophy across low and high loads when taken near failure; heavier loads give more strength (Schoenfeld 2017, https://pubmed.ncbi.nlm.nih.gov/28834797/ ).
- **Rest:** a small hypertrophy benefit for rest > 60 s; no appreciable extra benefit beyond ~90 s (Singer 2024, https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full ).
- **Tempo:** hypertrophy is similar for rep durations of 0.5–8 s; very slow (~10 s/rep) is inferior (Schoenfeld 2015, https://pubmed.ncbi.nlm.nih.gov/25601394/ ).

### 4.3 NORMAL mode (default; few, clear) — in priority order
| # | Stat | Definition / formula | Fields | Why |
|---|---|---|---|---|
| N1 | **Consistency** | Workouts this week / last 4-week average. Current and longest **week streak** (consecutive ISO weeks with ≥ 1 workout). Calendar heatmap (cell = TVL that day) | `start` | Adherence is the #1 driver; instantly motivating |
| N2 | **Weekly sets per muscle + body map** | Σ hard sets per region, rolling 7 days (and 4-week average). Body-map fill by the §2.1 bands. Ranked list with a 10–20 band marker | `muscleKeys`, sets, `start` | Answers "what am I training / neglecting?" |
| N3 | **Volume trend** | Weekly TVL (bar) with an 8-week moving average. Delta vs previous 4 weeks (%) | `tvlLb` (fallback Σ w·r) | Overall workload direction |
| N4 | **Top-lift strength** | For the 3–6 most-frequent weighted exercises: latest e1RM, sparkline, `%/month` (§3.4), status (progressing / plateau / dip) | sets (`weightLb`, `reps`, `effort`) | The core "am I getting stronger?" answer |
| N5 | **Recent PRs** | Feed of the last 30 days: weight, rep (Pareto), e1RM PRs (§3.6). PRs per week | sets | High-signal motivation |
| N6 | **Session summary** | Per workout: duration, hard sets, TVL, calories, top muscles, PR count. Averages over the last 30 days | Workout fields | Familiar recap |
| N7 | **Muscle frequency** | Days/week each region got ≥ 1 hard set (4-week average) | `muscleKeys`, `start` | Simple complement to volume (strength benefits from frequency) |
| N8 | **Relative strength** (only if bodyweight is set) | Best recent e1RM ÷ bodyweight for bench, squat, deadlift and OHP if present. Level badge (§5) if sex is set | e1RM, settings | Puts numbers in context |

### 4.4 DETAILED mode (power user) — in addition to Normal
| # | Stat | Definition / formula | Fields | Why |
|---|---|---|---|---|
| D1 | **Fractional sets per muscle** | Primary 1.0 + catalog secondaries 0.5 (§4.1). Toggle direct-only vs fractional | `exerciseRaw` + catalog | Best-supported volume quantification (Pelland) |
| D2 | **Volume load per muscle** | Σ w·r attributed to primary muscles (split equally among multiple primaries), weekly | sets | Tonnage view; complements set counts |
| D3 | **e1RM detail** | All formulas side by side; per-session points with confidence; EWMA; PR envelope; 30/90/365-day deltas; Theil–Sen rate | sets | Transparency for nerds |
| D4 | **Rep-max table** | Best weight for each rep count 1–15 (actual) plus predicted from current e1RM via the inverse formula (Epley: `w = e1RM / (1 + r/30)`) | sets | Mirrors Motra's PR Breakdown; useful for planning |
| D5 | **Intensity distribution** | Each hard set's `%e1RM = w / (best e1RM of that exercise in the trailing 8 weeks)`. Zones < 60, 60–70, 70–80, 80–90, ≥ 90%. Plus rep-range mix: 1–5 / 6–12 / 13–20 / 21+ | sets | Shows strength vs hypertrophy emphasis (Schoenfeld 2017 load meta) |
| D6 | **Rest-time analysis** | Median `restSec` per exercise and overall, excluding the first set of each exercise block, rest = 0, and rest > 600 s. Distribution < 60 / 60–120 / 120–180 / 180–300 / > 300 s. Flag compound lifts with median < 60 s | `restSec` | > 60 s gives a small hypertrophy edge (Singer 2024); exposes rushed or overly long sessions |
| D7 | **Rep tempo / TUT** | `secPerRep = durationSec / reps` (only when reps > 0 and 0.3 ≤ secPerRep ≤ 15, otherwise outlier). Weekly TUT per muscle = Σ durationSec | `durationSec`, `reps` | Watch-measured tempo is rare data; flag < 1 s/rep ("bouncing") or > 8 s/rep (Schoenfeld 2015) |
| D8 | **Session density** | `TVL / (durationSec/60)` lb/min, and hard sets/hour. Trend over time | `tvlLb`, `durationSec` | Higher means more work per minute (LiftShift uses the same definition) |
| D9 | **Within-session fatigue** | For exercises with ≥ 3 working sets at the same weight: `dropoff = 1 - reps_last / reps_first`. Average per exercise. Alternatively compare e1RM of the last set to the first | sets in order | Reveals rest adequacy and fatigue; rising drop-off can precede a plateau |
| D10 | **Balance ratios** | Weekly fractional sets (or VL), 8-week window. **Push:pull** = (chest + front/side shoulders + triceps) : (lats + traps + biceps + rear delts; use `shoulders` → push unless the catalog sub says rearDelts). **Quad:ham**. **Anterior:posterior** = (chest, front shoulders, biceps, abs, obliques, quads, hipFlexors, tibialisAnterior) : (traps, lats, rear delts, triceps, lowerBack, glutes, hamstrings, calves). **Upper:lower** | `muscleKeys` (+ catalog) | Imbalance awareness. Present as informational: there is no validated "ideal" set ratio; ~1:1 push:pull is a common coaching heuristic [INFERRED] |
| D11 | **Plateau detector** | Per exercise, §3.4 labels with a confidence tier by session count: high ≥ 10, medium ≥ 6, low < 6 (LiftShift scheme) | e1RM series | Actionable "change something" signal |
| D12 | **HR zones** | Per workout: stacked bar of zone seconds. Weekly minutes in Z4–5. Share of session ≥ Z3 | `hrZonesSec` | Cardio load of lifting sessions; flags circuit-style work |
| D13 | **Calories** | Per workout, kcal/min = `calories / (durationSec/60)`, weekly total. Sample: 254 kcal / 43.4 min = 5.9 kcal/min | `calories`, `durationSec` | Energy-expenditure context (Apple Health estimate, ±) |
| D14 | **Effort distribution** (only if logged) | Histogram of set effort; share of sets at ≥ 8 per muscle | `effort` | Proximity to failure matters for growth (Robinson 2024) |
| D15 | **Load spike** | `acute (7-day sets or TVL) / chronic (28-day weekly average)`. Show when > 1.5 | sets/TVL | Highlights sudden jumps after breaks. Keep it neutral: the injury-prediction claims are disputed [INFERRED] |
| D16 | **Strength scores** (profile needed) | DOTS / IPF GL / Wilks from e1RM total (§5) | e1RM, settings | Cross-person comparable number |
| D17 | **Exercise variety** | Distinct exercises per muscle per 4 weeks; new exercises introduced | `exerciseKey` | Shows staleness or novelty |

Data hygiene for all stats: exclude sets with `reps == null`. Treat `weight == 0` as bodyweight. Exclude cardio rows (distance > 0) from strength stats but count them in session time.

---

## 5. Bodyweight / height / sex / age

`Settings` has a single current bodyweight, not a time series. All relative metrics use the **current** BW, so label them "at current bodyweight". Convert lb → kg with `× 0.45359237`.

### 5.1 Relative strength
`ratio = e1RM / bodyweight` (unit-free). Show it for exercises in the standards table below; for anything else, show only the ratio.

### 5.2 Strength standards (Strength Level, 1RM ÷ BW)
- Levels are percentiles among Strength Level users: Beginner > 5%, Novice > 20%, Intermediate > 50%, Advanced > 80%, Elite > 95%. https://strengthlevel.com/strength-standards/bench-press
- The ratios below are Strength Level's summary multiples, retrieved 2026-10-21 from https://strengthlevel.com/strength-standards/{bench-press,squat,deadlift,shoulder-press,barbell-row,dumbbell-bench-press,dumbbell-curl,leg-press}.
- Real thresholds vary with bodyweight: lighter lifters have higher ratios, and Strength Level publishes per-BW tables. So label these "approximate".

| Lift (Motra name) | Sex | Beginner | Novice | Intermediate | Advanced | Elite |
|---|---|---|---|---|---|---|
| Bench — Barbell Bench Press | M | 0.50 | 1.00 | 1.25 | 1.50 | 2.00 |
| | F | 0.30 | 0.50 | 0.75 | 1.10 | 1.45 |
| Squat — Barbell Back Squat | M | 0.75 | 1.25 | 1.75 | 2.25 | 2.75 |
| | F | 0.50 | 0.75 | 1.25 | 1.75 | 2.25 |
| Deadlift — Barbell Deadlift | M | 1.00 | 1.50 | 2.00 | 2.50 | 3.25 |
| | F | 0.75 | 1.00 | 1.50 | 2.00 | 2.50 |
| OHP — Barbell Overhead Press (/ Military Press) | M | 0.35 | 0.55 | 0.80 | 1.05 | 1.35 |
| | F | 0.20 | 0.35 | 0.50 | 0.70 | 0.95 |
| Row — Barbell Bent Over Row | M | 0.50 | 0.75 | 1.00 | 1.50 | 1.75 |
| | F | 0.30 | 0.45 | 0.70 | 0.95 | 1.25 |
| DB Bench (per dumbbell [INFERRED]) | M | 0.20 | 0.35 | 0.50 | 0.70 | 0.90 |
| | F | 0.10 | 0.20 | 0.30 | 0.45 | 0.60 |
| DB Curl (per dumbbell [INFERRED]) | M | 0.10 | 0.15 | 0.30 | 0.40 | 0.55 |
| | F | 0.05 | 0.10 | 0.20 | 0.30 | 0.40 |
| Leg Press (machine; very brand-dependent) | M | 1.25 | 2.00 | 2.75 | 4.00 | 5.25 |
| | F | 0.75 | 1.50 | 2.25 | 3.25 | 4.50 |

- Display: the highest level reached, plus a progress bar to the next level: `(ratio - lvl_i)/(lvl_{i+1} - lvl_i)`.
- Only match exact Motra exercise names (case-insensitive after normalizeKey), not variants. A close-grip or incline bench is not a bench.
- If `sex = unspecified`, show the ratio only.

### 5.3 Powerlifting scores (use kg; `total` = sum of e1RMs of squat + bench + deadlift)
Only compute when all three lifts have a high-confidence e1RM in the last 12 weeks. Label it "estimated". Coefficients are verbatim from OpenPowerlifting's source.

**DOTS** (https://gitlab.com/openpowerlifting/opl-data/-/raw/main/crates/coefficients/src/dots.rs )

```
DOTS = total * 500 / (A*bw^4 + B*bw^3 + C*bw^2 + D*bw + E)
Men   (bw clamped to 40..210): A=-0.0000010930  B=0.0007391293  C=-0.1918759221  D=24.0900756  E=-307.75076
Women (bw clamped to 40..150): A=-0.0000010706  B=0.0005158568  C=-0.1126655495  D=13.6175032  E=-57.96288
```

DOTS works for a single lift too (bench-only DOTS is used in bench meets), so a bench-only DOTS is reasonable when the full total is missing. Reference: USAPL uses DOTS minima of 75 F / 95 M for pro qualification (https://www.usapowerlifting.com/pro ).

**IPF GL (Goodlift) points** (https://gitlab.com/openpowerlifting/opl-data/-/raw/main/crates/coefficients/src/goodlift.rs )

```
GL = total * 100 / (A - B * exp(-C * bw))      ; 0 if bw < 35
Raw (classic) SBD  Men:   A=1199.72839 B=1025.18162 C=0.009210
Raw (classic) SBD  Women: A=610.32796  B=1045.59282 C=0.03048
Raw bench-only     Men:   A=320.98041  B=281.40258  C=0.01008
Raw bench-only     Women: A=142.40398  B=442.52671  C=0.04724
```

(Equipped coefficients exist but aren't relevant.)

**Wilks (original)** (https://gitlab.com/openpowerlifting/opl-data/-/raw/main/crates/coefficients/src/wilks.rs )

```
Wilks = total * 500 / (a + b*bw + c*bw^2 + d*bw^3 + e*bw^4 + f*bw^5)
Men   (bw 40..201.9):   a=-216.0475144 b=16.2606339 c=-0.002388645 d=-0.00113732 e=7.01863e-06 f=-1.291e-08
Women (bw 26.51..154.53): a=594.31747775582 b=-27.23842536447 c=0.82112226871 d=-0.00930733913 e=0.00004731582 f=-0.00000009054
```

Check values: men at 100 kg → 0.6085890719; women at 100 kg → 0.8325833167.

Recommendation: **DOTS** as the single headline score (Detailed). GL as an optional second value. Skip Wilks; it is outdated, but users recognize it, so keeping it is cheap.

### 5.4 BMI, FFMI, age, height
- **BMI** = `kg / m²`. WHO adult bands: < 18.5 underweight, 18.5–24.9 normal, 25–29.9 overweight, ≥ 30 obese. It misclassifies muscular lifters as overweight. Show it only on the Settings/profile page with that caveat; **not** on the dashboard.
- **FFMI** = `lean kg / m²` needs body-fat %, which we don't collect → **not possible**. Don't fake it.
- **Age:**
  - Optional HRmax estimate `220 − age` to convert zone % to bpm (Motra links Mayo Clinic for this).
  - Age-adjusted strength standards exist, but the published per-age tables aren't reproducible as simple coefficients → skip.
- **Height:** only used for BMI.
- **Sex:** selects the standards row and the DOTS/GL coefficients. It could also pick a male/female body-map silhouette (LiftShift offers both); optional.

### 5.5 What to include
| Feature | Needs | Mode |
|---|---|---|
| e1RM ÷ BW ratio | BW | Normal (N8) |
| Strength Level badge (bench/squat/deadlift/OHP/row) | BW + sex | Normal (N8) |
| DOTS (estimated, SBD or bench-only) | BW + sex | Detailed |
| IPF GL | BW + sex | Detailed (optional) |
| Wilks | BW + sex | Skip (or Detailed toggle) |
| BMI | BW + height | Settings page only, with caveat |
| FFMI | body fat | Not possible |
| HRmax / bpm zones | age | Detailed HR card (optional) |
