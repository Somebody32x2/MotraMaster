import { oneRmFormulas } from '../../core/analytics'
import type { ExerciseDetail, ExerciseSessionRow, RepMaxRow } from '../../core/analytics/types'
import type { OneRmFormula, Units } from '../../core/types'
import { paths } from '../../router'
import { Card } from '../../ui/components/Card'
import { DataTable, type Column } from '../../ui/components/DataTable'
import { formatDate, formatNumber, formatPercent, formatWeight, plural, unitLabel } from '../../ui/format'
import { formatHold, loadBasisTitle, PrChip } from '../../ui/widgets'
import { describeLoadedSet, setChipText } from './util'

/** Predicted loads within 2% of (or below) the actual best are not worth flagging. */
const OPPORTUNITY_MARGIN = 1.02

export function RepMaxCard({ d, units, detailed }: { d: ExerciseDetail; units: Units; detailed: boolean }) {
  const maxReps = detailed ? 15 : 12
  const rows = d.repMax.filter((r) => r.reps >= 1 && r.reps <= maxReps).sort((a, b) => a.reps - b.reps)
  const oneRm = rows.find((r) => r.reps === 1)?.predictedLb ?? null
  const cols: Column<RepMaxRow>[] = [
    {
      id: 'reps',
      header: 'Reps',
      sortable: false,
      render: (r) => <span class="num">{plural(r.reps, 'rep')}</span>,
    },
    {
      id: 'actual',
      header: 'Best lifted',
      kind: 'number',
      sortable: false,
      render: (r) =>
        r.actualLb != null ? (
          <span class="cell-2 cell-2--right">
            <span>{formatWeight(r.actualLb, units)}</span>
            {r.actualDate && <span class="cell-2__sub">{formatDate(r.actualDate, 'short')}</span>}
          </span>
        ) : (
          <span class="faint">—</span>
        ),
    },
    {
      id: 'predicted',
      header: 'Predicted',
      kind: 'number',
      sortable: false,
      title: 'From your current estimated 1RM via inverse Epley: e1RM ÷ (1 + reps/30)',
      render: (r) => {
        if (r.predictedLb == null) return <span class="faint">—</span>
        const chance = r.actualLb == null || r.predictedLb > r.actualLb * OPPORTUNITY_MARGIN
        return (
          <span
            class={chance ? 'rm-predicted is-chance' : 'rm-predicted'}
            title={chance ? 'Predicted above your best for this rep count: a likely rep PR' : undefined}
          >
            {formatWeight(r.predictedLb, units)}
          </span>
        )
      },
    },
  ]
  if (detailed && oneRm != null && oneRm > 0) {
    cols.push({
      id: 'pct',
      header: '% 1RM',
      kind: 'number',
      sortable: false,
      render: (r) => (r.predictedLb != null ? formatPercent(r.predictedLb / oneRm, { decimals: 0 }) : '—'),
    })
  }
  return (
    <Card
      flush
      title="Rep maxes"
      subtitle="What you have lifted for each rep count, and what your current e1RM predicts you could"
      info="Highlighted predictions exceed your best for that rep count. Predictions get less reliable above 10 reps (Reynolds 2006)."
    >
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => String(r.reps)}
        dense
        empty="No weighted sets to build a rep-max table from."
        caption="Rep-max table"
      />
    </Card>
  )
}

type SessionSet = ExerciseSessionRow['sets'][number]

/** Most sets shown per row before collapsing into '+N'. */
const MAX_CHIPS = 8

function setTitle(s: SessionSet, units: Units): string | null {
  if (s.holdSec != null && s.holdSec > 0) return null
  if (s.loadBasis === 'bodyweightAdded' || s.loadBasis === 'bodyweightIncluded' || s.loadBasis === 'assisted' || s.loadBasis === 'bodyweightUnknown') {
    return `${describeLoadedSet(s, units)} · ${loadBasisTitle(s.loadBasis, s.weightLb, s.loadLb, units)}`
  }
  return null
}

function SetChips({ sets, units }: { sets: SessionSet[]; units: Units }) {
  const shown = sets.slice(0, MAX_CHIPS)
  return (
    <span class="set-chips">
      {shown.map((s, i) => (
        <span
          key={i}
          class={s.hard ? 'set-chip' : 'set-chip set-chip--warmup'}
          title={[setTitle(s, units), s.hard ? null : 'Warm-up: not counted as a hard set'].filter(Boolean).join(' · ') || undefined}
        >
          {setChipText(s, units)}
        </span>
      ))}
      {sets.length > shown.length && <span class="set-chip set-chip--more">+{sets.length - shown.length}</span>}
    </span>
  )
}

export function HistoryCard({ d, units, detailed }: { d: ExerciseDetail; units: Units; detailed: boolean }) {
  const cols: Column<ExerciseSessionRow>[] = [
    {
      id: 'date',
      header: 'Date',
      kind: 'number',
      value: (r) => r.date.getTime(),
      render: (r) => formatDate(r.date, 'medium'),
    },
    {
      id: 'sets',
      header: d.valueUnit === 'lb' ? `Sets (${unitLabel(units)} × reps)` : 'Sets',
      sortable: false,
      render: (r) => <SetChips sets={r.sets} units={units} />,
    },
  ]
  if (d.valueUnit === 'lb') {
    cols.push(
      {
        id: 'volume',
        header: 'Volume',
        kind: 'number',
        priority: 2,
        value: (r) => r.volumeLb,
        render: (r) => formatWeight(r.volumeLb, units, { compact: true }),
      },
      {
        id: 'e1rm',
        header: 'Best e1RM',
        kind: 'number',
        value: (r) => r.bestE1rm,
        render: (r) => formatWeight(r.bestE1rm, units),
      },
    )
    if (detailed) {
      cols.splice(2, 0, {
        id: 'top',
        header: 'Top set',
        kind: 'number',
        priority: 3,
        value: (r) => r.topWeightLb,
        render: (r) => formatWeight(r.topWeightLb, units),
      })
    }
  } else if (d.valueUnit === 'sec') {
    cols.push({
      id: 'hold',
      header: 'Longest hold',
      kind: 'number',
      value: (r) => r.sets.reduce<number | null>((m, s) => (s.holdSec != null && (m == null || s.holdSec > m) ? s.holdSec : m), null),
      render: (r) => {
        const m = r.sets.reduce<number | null>((x, s) => (s.holdSec != null && (x == null || s.holdSec > x) ? s.holdSec : x), null)
        return formatHold(m)
      },
    })
  } else {
    cols.push({
      id: 'reps',
      header: 'Reps',
      kind: 'number',
      value: (r) => r.sets.reduce((n, s) => n + (s.reps ?? 0), 0),
    })
  }
  cols.push({
    id: 'prs',
    header: 'PRs',
    sortable: false,
    priority: 2,
    render: (r) =>
      r.prTypes.length ? (
        <span class="pr-chips">
          {r.prTypes.map((t) => (
            <PrChip key={t} type={t} />
          ))}
        </span>
      ) : null,
  })
  return (
    <Card flush title="Session history" subtitle={`${plural(d.history.length, 'session')} in range · faded sets are warm-ups`}>
      <DataTable
        columns={cols}
        rows={d.history}
        rowKey={(r) => r.workoutId}
        rowHref={(r) => paths.workout(r.workoutId)}
        initialSort={{ id: 'date', dir: 'desc' }}
        limit={10}
        empty="No sessions in this range."
        caption="Session history"
      />
    </Card>
  )
}

export function FormulasCard({ d, units, formula }: { d: ExerciseDetail; units: Units; formula: OneRmFormula }) {
  const rows = d.formulas ?? []
  const basis = d.formulasBasis
  const mean = rows.length ? rows.reduce((n, r) => n + r.value, 0) / rows.length : null
  type Row = (typeof rows)[number]
  const cols: Column<Row>[] = [
    {
      id: 'name',
      header: 'Formula',
      sortable: false,
      render: (r) => (
        <span class="cell-2">
          <span class={r.key === formula ? 'formula-name is-active' : 'formula-name'}>
            {r.name}
            {r.key === formula && <span class="formula-name__tag">in use</span>}
          </span>
          <span class="cell-2__sub">{oneRmFormulas.find((f) => f.key === r.key)?.note ?? ''}</span>
        </span>
      ),
    },
    { id: 'value', header: 'e1RM', kind: 'number', value: (r) => r.value, render: (r) => formatWeight(r.value, units) },
    {
      id: 'diff',
      header: 'vs mean',
      kind: 'number',
      sortable: false,
      render: (r) => (mean ? formatPercent(r.value / mean - 1, { sign: true, decimals: 1 }) : '—'),
    },
  ]
  return (
    <Card
      flush
      title="Every formula"
      subtitle={
        basis
          ? `Applied to ${formatWeight(basis.weightLb, units)} × ${formatNumber(basis.reps, { maxDecimals: 0 })} on ${formatDate(basis.date, 'medium')}`
          : 'Needs a weighted set of 15 reps or fewer'
      }
      info="All equations agree closely at low reps and diverge as reps rise; Wathan and Mayhew were the least biased in LeSuer 1997. Each can be 10% off for an individual."
    >
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.key} dense initialSort={{ id: 'value' }} empty="No eligible set in this range." caption="1RM formulas compared" />
    </Card>
  )
}
