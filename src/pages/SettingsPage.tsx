import type { ComponentChildren } from 'preact'
import { useMemo } from 'preact/hooks'
import { analysisIndex } from '../analysis'
import { strengthProfile } from '../core/analytics'
import type { OneRmFormula, Sex, ThemePref, Units } from '../core/types'
import { href, paths } from '../router'
import { clearData, dataset, settings, updateSettings } from '../state'
import { ConfirmButton } from '../ui/components/ConfirmButton'
import { NumberField } from '../ui/components/NumberField'
import { PageHeader } from '../ui/components/PageHeader'
import { Segmented, type SegmentedOption } from '../ui/components/Segmented'
import { Select, type SelectOption } from '../ui/components/Select'
import { Toggle } from '../ui/components/Toggle'
import {
  cmToFtIn,
  formatDate,
  formatNumber,
  formatRelative,
  fromDisplayWeight,
  ftInToCm,
  plural,
  toDisplayWeight,
  unitLabel,
} from '../ui/format'
import { IconFile, IconMoon, IconSun, IconSystem, IconTrash } from '../ui/icons'
import { STRENGTH_METRIC_EXPLAINER, STRENGTH_METRIC_OPTIONS } from '../ui/widgets'
import { StrengthLiftList } from './overview/RelativeStrength'

const UNIT_OPTIONS: SegmentedOption<Units>[] = [
  { value: 'lb', label: 'Pounds (lb)' },
  { value: 'kg', label: 'Kilograms (kg)' },
]

const THEME_OPTIONS: SegmentedOption<ThemePref>[] = [
  {
    value: 'system',
    label: (
      <>
        <IconSystem size={15} /> System
      </>
    ),
    title: 'Match system theme',
  },
  {
    value: 'light',
    label: (
      <>
        <IconSun size={15} /> Light
      </>
    ),
    title: 'Light theme',
  },
  {
    value: 'dark',
    label: (
      <>
        <IconMoon size={15} /> Dark
      </>
    ),
    title: 'Dark theme',
  },
]

const SEX_OPTIONS: SelectOption<Sex>[] = [
  { value: 'unspecified', label: 'Prefer not to say' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const FORMULAS: Array<{ value: OneRmFormula; label: string; formula?: string; desc: string }> = [
  {
    value: 'auto',
    label: 'Automatic',
    desc: 'Picks the best-suited formula for each set’s rep count. Recommended.',
  },
  {
    value: 'epley',
    label: 'Epley',
    formula: 'w × (1 + r/30)',
    desc: 'The most widely used estimate; accurate for moderate reps, optimistic at high reps.',
  },
  {
    value: 'brzycki',
    label: 'Brzycki',
    formula: 'w × 36 / (37 − r)',
    desc: 'Conservative and very accurate for low-rep sets (up to about 10).',
  },
  {
    value: 'lombardi',
    label: 'Lombardi',
    formula: 'w × r^0.10',
    desc: 'Gentle curve that changes little with rep count; tends to read low on high-rep sets.',
  },
  {
    value: 'mayhew',
    label: 'Mayhew',
    formula: '100w / (52.2 + 41.9e^(−0.055r))',
    desc: 'Derived from bench-press testing; holds up well for higher-rep sets.',
  },
  {
    value: 'wathan',
    label: 'Wathan',
    formula: '100w / (48.8 + 53.8e^(−0.075r))',
    desc: 'Exponential model that stays sensible across a wide rep range.',
  },
  {
    value: 'oconner',
    label: 'O’Conner',
    formula: 'w × (1 + r/40)',
    desc: 'The most conservative of the set; useful if other estimates feel inflated.',
  },
]

const THIS_YEAR = new Date().getFullYear()

/** One section of the settings document: label column on the left (sticky on desktop), controls on the right. */
function Section({ id, title, desc, children }: { id: string; title: string; desc?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="settings-section" aria-labelledby={`${id}-title`}>
      <header class="settings-section__head">
        <h2 id={`${id}-title`} class="settings-section__title">
          {title}
        </h2>
        {desc != null && <p class="settings-section__desc">{desc}</p>}
      </header>
      <div class="settings-section__body">{children}</div>
    </section>
  )
}

function Setting({
  label,
  desc,
  wide,
  children,
}: {
  label: ComponentChildren
  desc?: ComponentChildren
  /** Control spans the full width under the label (lists, readouts). */
  wide?: boolean
  children: ComponentChildren
}) {
  return (
    <div class={wide ? 'setting setting--wide' : 'setting'}>
      <div>
        <p class="setting__label">{label}</p>
        {desc != null && <p class="setting__desc">{desc}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function HeightFields({ heightCm, units }: { heightCm: number | null; units: Units }) {
  if (units === 'kg') {
    return (
      <NumberField
        label="Height"
        hideLabel
        unit="cm"
        value={heightCm}
        decimals={0}
        min={100}
        max={250}
        placeholder="e.g. 178"
        onChange={(v) => updateSettings({ heightCm: v })}
      />
    )
  }
  const parts = heightCm != null ? cmToFtIn(heightCm) : null
  return (
    <div class="settings-height" role="group" aria-label="Height">
      <NumberField
        label="Height, feet"
        hideLabel
        unit="ft"
        value={parts?.ft ?? null}
        decimals={0}
        min={3}
        max={8}
        placeholder="5"
        onChange={(ft) =>
          updateSettings({ heightCm: ft == null ? null : ftInToCm(ft, parts?.inches ?? 0) })
        }
      />
      <NumberField
        label="Height, inches"
        hideLabel
        unit="in"
        value={parts?.inches ?? null}
        decimals={1}
        min={0}
        max={11.5}
        placeholder="10"
        onChange={(inches) => {
          if (parts == null && inches == null) return
          updateSettings({ heightCm: ftInToCm(parts?.ft ?? 5, inches ?? 0) })
        }}
      />
    </div>
  )
}

function FormulaList() {
  const current = settings.value.oneRmFormula
  return (
    <div class="formula-list" role="radiogroup" aria-label="1RM formula">
      {FORMULAS.map((f) => (
        <label key={f.value} class="formula-list__row" data-checked={current === f.value}>
          <input
            type="radio"
            name="one-rm-formula"
            value={f.value}
            checked={current === f.value}
            onChange={() => updateSettings({ oneRmFormula: f.value })}
          />
          <span class="formula-list__name">{f.label}</span>
          <span class="formula-list__formula">{f.formula ?? <span class="faint">by rep count</span>}</span>
          <span class="formula-list__desc">{f.desc}</span>
        </label>
      ))}
    </div>
  )
}

function Unlocks() {
  const s = settings.value
  const bw = s.bodyweightLb != null
  const items = [
    { on: bw, label: 'Relative strength', need: 'bodyweight', desc: 'lifts as multiples of bodyweight' },
    {
      on: bw && s.sex !== 'unspecified',
      label: 'Strength standards',
      need: 'bodyweight and sex',
      desc: 'how your estimated 1RMs compare with typical lifters',
    },
    { on: bw && s.sex !== 'unspecified', label: 'DOTS score', need: 'bodyweight and sex', desc: 'a bodyweight-adjusted powerlifting score' },
    { on: bw && s.heightCm != null, label: 'BMI', need: 'bodyweight and height', desc: 'shown with your profile' },
    { on: s.birthYear != null, label: 'Age context', need: 'birth year', desc: 'age-adjusted comparisons where available' },
  ]
  return (
    <ul role="list" class="unlocks">
      {items.map((it) => (
        <li key={it.label} data-on={it.on}>
          <span class="unlocks__text">
            <span class="unlocks__name">{it.label}</span>
            <span class="unlocks__desc">{it.desc}</span>
          </span>
          <span class="unlocks__state">{it.on ? 'On' : `Needs ${it.need}`}</span>
        </li>
      ))}
    </ul>
  )
}

/** WHO adult BMI bands (research §5.4). */
function bmiBand(bmi: number): string {
  if (bmi < 18.5) return 'Underweight'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Overweight'
  return 'Obese'
}

function ProfileReadout() {
  const s = settings.value
  const idx = analysisIndex.value
  const profile = useMemo(() => (idx ? strengthProfile(idx, s) : null), [idx, s])
  const heightM = s.heightCm != null ? s.heightCm / 100 : null
  const bmi =
    profile?.bmi ?? (s.bodyweightLb != null && heightM != null && heightM > 0 ? (s.bodyweightLb * 0.45359237) / (heightM * heightM) : null)
  const hasBmi = bmi != null && Number.isFinite(bmi)
  const lifts = profile?.lifts ?? []
  const dots = profile?.dots ?? null
  const gl = profile?.ipfGl ?? null
  const basis = (b: 'total' | 'bench') => (b === 'total' ? 'squat + bench + deadlift' : 'bench only')
  const dotsNeeds =
    s.bodyweightLb == null || s.sex === 'unspecified'
      ? 'Needs bodyweight and sex.'
      : idx
        ? 'Needs a recent, reliable estimated 1RM for bench press (or squat, bench and deadlift).'
        : 'Import workouts to see this.'

  return (
    <Section id="profile" title="Your profile" desc="From your body metrics and estimated 1RMs, at your current bodyweight.">
      <Setting
        label="BMI"
        desc="Weight ÷ height², with WHO adult bands. It can’t tell muscle from fat, so treat it as a rough guide."
      >
        {hasBmi ? (
          <p class="settings-figure">
            <span class="settings-figure__value tnum">{formatNumber(bmi, { decimals: 1 })}</span>
            <span class="settings-figure__note">{bmiBand(bmi)}</span>
          </p>
        ) : (
          <p class="faint">Needs bodyweight and height.</p>
        )}
      </Setting>
      <Setting
        label="Relative strength"
        desc="Best recent estimated 1RM ÷ bodyweight. Levels are approximate Strength Level standards and appear once sex is set."
      >
        {s.bodyweightLb == null ? (
          <p class="faint">Needs bodyweight.</p>
        ) : lifts.length ? (
          <StrengthLiftList lifts={lifts} units={s.units} />
        ) : (
          <p class="faint">
            {idx ? 'No bench press, squat, deadlift or overhead press with an estimated 1RM yet.' : 'Import workouts to see this.'}
          </p>
        )}
      </Setting>
      <Setting label="DOTS" desc="A bodyweight-adjusted powerlifting score, estimated from your e1RMs rather than meet lifts.">
        {dots ? (
          <div class="stack" style={{ '--gap': 'var(--s1)' }}>
            <p class="settings-figure">
              <span class="settings-figure__value tnum">{formatNumber(dots.value, { decimals: 1 })}</span>
              <span class="settings-figure__note">{basis(dots.basis)}</span>
            </p>
            {gl && (
              <p class="muted">
                IPF GL <span class="tnum">{formatNumber(gl.value, { decimals: 1 })}</span> ({basis(gl.basis)})
              </p>
            )}
          </div>
        ) : (
          <p class="faint">{dotsNeeds}</p>
        )}
      </Setting>
    </Section>
  )
}

export default function SettingsPage() {
  const s = settings.value
  const ds = dataset.value
  const u = s.units
  const bwDisplay = s.bodyweightLb != null ? toDisplayWeight(s.bodyweightLb, u) : null

  return (
    <div class="settings-doc">
      <PageHeader title="Settings" subtitle="Saved on this device and applied immediately." />

      <Section id="display" title="Display">
        <Setting label="Units" desc="Motra exports pounds; values are converted for display only.">
          <Segmented label="Units" block options={UNIT_OPTIONS} value={u} onChange={(units) => updateSettings({ units })} />
        </Setting>
        <Setting label="Theme" desc="System follows your device’s light or dark setting.">
          <Segmented label="Theme" block options={THEME_OPTIONS} value={s.theme} onChange={(theme) => updateSettings({ theme })} />
        </Setting>
        <Setting
          label="Detailed statistics"
          desc="Show every metric and breakdown: set-level tables, rest and tempo analysis, secondary charts. Also switchable in each page header."
        >
          <Toggle
            label={s.detail === 'detailed' ? 'Detailed' : 'Normal'}
            description={s.detail === 'detailed' ? 'All statistics are shown.' : 'Only the essentials are shown.'}
            checked={s.detail === 'detailed'}
            onChange={(on) => updateSettings({ detail: on ? 'detailed' : 'normal' })}
          />
        </Setting>
      </Section>

      <Section id="strength" title="Strength" desc="Applies to sparklines, trends, top lifts and exercise charts.">
        <Setting label="Track progress by" desc={STRENGTH_METRIC_EXPLAINER}>
          <Segmented
            label="Track progress by"
            block
            options={STRENGTH_METRIC_OPTIONS}
            value={s.strengthMetric}
            onChange={(strengthMetric) => updateSettings({ strengthMetric })}
          />
        </Setting>
        <Setting
          wide
          label="1RM formula"
          desc="How a set’s weight (w) and reps (r) become an estimated 1RM. Sets above 12 reps are less reliable with any formula."
        >
          <FormulaList />
        </Setting>
      </Section>

      <Section id="body" title="Body" desc="Optional. Used only for calculations on this device.">
        <Setting
          label="Bodyweight"
          desc="Update it occasionally to keep relative numbers honest. Also counts bodyweight in dips, pull-ups and push-ups."
        >
          <NumberField
            label="Bodyweight"
            hideLabel
            unit={unitLabel(u)}
            value={bwDisplay}
            decimals={1}
            min={u === 'kg' ? 25 : 55}
            max={u === 'kg' ? 300 : 660}
            placeholder={u === 'kg' ? 'e.g. 80' : 'e.g. 175'}
            onChange={(v) => updateSettings({ bodyweightLb: fromDisplayWeight(v, u) })}
          />
        </Setting>
        <Setting label="Height" desc={u === 'kg' ? 'In centimetres.' : 'In feet and inches.'}>
          <HeightFields heightCm={s.heightCm} units={u} />
        </Setting>
        <Setting label="Sex" desc="Strength standards and DOTS use different coefficients for men and women.">
          <Select label="Sex" hideLabel options={SEX_OPTIONS} value={s.sex} onChange={(sex) => updateSettings({ sex })} />
        </Setting>
        <Setting label="Birth year" desc="Only the year is needed.">
          <NumberField
            label="Birth year"
            hideLabel
            value={s.birthYear}
            decimals={0}
            min={THIS_YEAR - 110}
            max={THIS_YEAR - 8}
            placeholder="e.g. 1992"
            onChange={(v) => updateSettings({ birthYear: v == null ? null : Math.round(v) })}
          />
        </Setting>
        <Setting wide label="What this unlocks">
          <Unlocks />
        </Setting>
      </Section>

      <Section id="duration" title="Workout duration" desc="For workouts left running after the last set.">
        <Setting
          label="Idle time"
          desc="Only time after the last set, beyond the grace period, is removed. Rests between sets are kept; calories and heart-rate zones stay as Motra recorded them."
        >
          <Toggle label="Trim idle time after the last set" checked={s.trimIdle} onChange={(trimIdle) => updateSettings({ trimIdle })} />
        </Setting>
        <Setting label="Grace period" desc="Minutes kept after the last set for cool-down (0 to 60).">
          <NumberField
            label="Grace period"
            hideLabel
            unit="min"
            value={s.trimGraceMin}
            decimals={0}
            min={0}
            max={60}
            disabled={!s.trimIdle}
            onChange={(v) => updateSettings({ trimGraceMin: v == null ? 5 : Math.min(60, Math.max(0, Math.round(v))) })}
          />
        </Setting>
      </Section>

      <ProfileReadout />

      <Section id="data" title="Data" desc="Stored in this browser only. Clearing site data also removes it.">
        {ds ? (
          <>
            <Setting label="Stored">
              <p>
                {plural(ds.workouts.length, 'workout')}, {plural(Object.keys(ds.exercises).length, 'exercise')},{' '}
                {plural(Object.keys(ds.muscles).length, 'muscle group')}
              </p>
            </Setting>
            <Setting label="Last import">
              <p title={formatDate(new Date(ds.importedAt), 'datetime')}>
                {formatRelative(new Date(ds.importedAt))}{' '}
                <span class="muted">({formatDate(new Date(ds.importedAt), 'medium')})</span>
              </p>
            </Setting>
            <Setting label="Source files">
              {ds.sourceFiles.length ? (
                <ul role="list" class="source-list">
                  {ds.sourceFiles.map((f) => (
                    <li key={f} title={f}>
                      <IconFile size={14} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="faint">None recorded</p>
              )}
            </Setting>
            <Setting label="Manage" desc="Import newer exports or remove everything from this device.">
              <div class="row" style={{ flexWrap: 'wrap' }}>
                <a class="btn" href={href(paths.import())}>
                  Import files
                </a>
                <ConfirmButton
                  label="Clear all data"
                  icon={<IconTrash size={16} />}
                  prompt="Delete all workouts?"
                  confirmLabel="Delete everything"
                  onConfirm={clearData}
                />
              </div>
            </Setting>
          </>
        ) : (
          <Setting label="No data stored" desc="Import a Motra export to get started.">
            <a class="btn btn--primary" href={href(paths.import())}>
              Import files
            </a>
          </Setting>
        )}
      </Section>

      <p class="settings-doc__foot">MotraMaster is an independent tool and is not affiliated with Motra.</p>
    </div>
  )
}
