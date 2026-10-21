# MotraMaster

A private, offline dashboard for [Motra](https://www.motra.com/) workout exports.
Drop in the `.xlsx` that Motra emails you and see how your training is trending:
estimated one-rep maxes, weekly sets per muscle on a body map, PRs, consistency,
and per-exercise and per-muscle breakdowns.

**Live:** <https://samuelshuster.com/MotraMaster/>

Your data never leaves your device. The workbook is parsed in the browser and
stored in IndexedDB; there is no server, account or analytics. The app installs
as a PWA and works offline.

## Using it

1. In Motra: **You → Settings → Export Workout Data**. Motra emails you an Excel file.
2. Open MotraMaster and drop the file on the Import page. Later exports can be
   merged in; workouts are matched by start time and title, so re-importing is safe.
3. Pick a range (4W / 3M / 6M / 1Y / All) and switch between **Normal** and
   **Detailed** in the top bar.

Optional body metrics in Settings (bodyweight, height, sex, birth year) unlock
relative strength (lift ÷ bodyweight), approximate strength-standard levels,
estimated DOTS / IPF GL scores and BMI. They are only stored locally.

## What it shows

| Page | Normal | Detailed adds |
|---|---|---|
| Overview | KPIs vs previous period, consistency streaks and calendar, weekly volume, weekly sets per muscle on a body map, top lifts with e1RM trend, recent PRs, muscle frequency, relative strength | Balance ratios (push:pull, quad:ham, upper:lower, anterior:posterior), intensity zones and rep ranges, rest distribution, session density, heart-rate zones, effort, acute:chronic load, new exercises, DOTS/GL |
| Muscles | Body map and ranking by weekly hard sets against the 10–20 set range | Fractional sets (secondary muscles at half credit), 4-week averages, unmapped labels |
| Exercise | Estimated 1RM with trend and PR envelope, rep-max predictor, PRs, session history | All 1RM formulas side by side, 30/90/365-day change, rest, tempo, fatigue drop-off, intensity, strength level |
| Workout | Per-exercise set tables, muscles worked | Per-set e1RM, heart-rate zones, rest timeline |

The definitions, formulas and sources behind every number are in
[`docs/research.md`](docs/research.md). In short:

- **e1RM (auto):** 1 rep is the weight itself; 2–10 reps average Epley and
  Brzycki; 11–15 reps use Wathan at lower confidence; above 15 nothing is
  estimated. When effort (RPE) is logged at 6 or above, reps in reserve are
  added first. Trends use a 21-day EWMA and a Theil–Sen slope in %/month.
- **Hard sets:** the export has no warm-up flag, so a set counts when its
  effort is ≥ 6, or (without effort) its weight is at least 60% of that
  exercise's top set in the session.
- **Muscles:** each primary muscle in a set gets full credit. In Detailed mode,
  muscles that Motra's exercise library rates 6–7 out of 10 get half credit.

## Robust to new labels

Motra's muscle ids (`chest`, `lowerBack`, `hipFlexors`, …) and exercise names are
normalized (case, spacing, camelCase, snake_case) and title-cased for display.
Unknown muscle labels are mapped by synonym and keyword rules to the 18 Motra
regions plus neck; anything that still doesn't match lands in **Other** and is
listed by its raw label on the Muscles page in Detailed mode. Unknown columns and
summary rows are kept rather than dropped, and malformed rows produce warnings
instead of errors.

### Checking your own export's vocabulary

To see which labels your full export contains, without sharing any of the data:

```sh
npm install
node scripts/catalog.ts path/to/Motra_Workouts_Export.xlsx
```

This writes `catalog-output.md` and `catalog-output.json`. The report opens with
a **Needs attention** section listing only the surprises: muscle labels outside
Motra's 18 ids (and which region each was mapped to, and how), exercises missing
from Motra's library, exercises whose muscle cell disagrees with the library,
unrecognized columns and summary rows, unexpected units or effort values, and
parser warnings. A full vocabulary follows. It contains no weights, reps, notes
or workout titles.

## Development

Requires Node 22.6+ (scripts use type stripping).

```sh
npm install
npm run dev          # http://localhost:5173/MotraMaster/
npm test             # vitest
npm run build        # typecheck + production build into dist/
node scripts/make-sample.ts sample.xlsx 26   # synthetic 26-week export for testing
```

`BASE_PATH` sets the sub-path the build is served from (default `/MotraMaster/`;
use `BASE_PATH=/` for root hosting). Routing is hash-based.

| Path | |
|---|---|
| `src/core/parse.ts` | Workbook → workouts. Scans every sheet for Motra's stacked blocks |
| `src/core/labels.ts` | Label normalization and display casing |
| `src/core/regions.ts` | Muscle label → body region mapping, Motra exercise library lookup |
| `src/core/analytics/` | e1RM, PRs, trends, per-muscle / per-exercise / per-workout stats |
| `src/data/motra-exercises.json` | Muscle ratings for 1,635 Motra exercises (from motra.com) |
| `src/ui/charts/` | Dependency-free SVG charts |
| `src/ui/bodymap/` | Front/back anatomical muscle map |
| `src/pages/` | Pages |

## Deployment

Pushes to `main` deploy automatically. Coolify builds the `Dockerfile` (Node
build stage, nginx serving `dist/`) and serves it at `samuelshuster.com/MotraMaster`;
the proxy strips the prefix before requests reach nginx.

```sh
docker build -t motramaster . && docker run -p 8080:80 motramaster
# the build expects the /MotraMaster/ prefix; for local root serving:
docker build --build-arg BASE_PATH=/ -t motramaster .
```

MotraMaster is an independent project and is not affiliated with Motra.
