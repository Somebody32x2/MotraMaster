import { useId } from 'preact/hooks'
import type { EnrichedSet, LoadBasis, PrType, WorkoutDetail } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { DataTable, type Column } from '../../ui/components/DataTable'
import { EMPTY, formatDuration, formatNumber, formatRest, formatWeight, plural } from '../../ui/format'
import { formatHold, formatSetCredit, hardSetWhy, LoadBasisTag, PrChip, RegionChips, SET_TYPE_LABEL } from '../../ui/widgets'

type Block = WorkoutDetail['blocks'][number]

const dash = <span class="faint">{EMPTY}</span>

const BW_BASES = new Set<LoadBasis>(['bodyweightAdded', 'bodyweightIncluded', 'assisted', 'bodyweightUnknown'])

interface SetRow {
  set: EnrichedSet
  n: number
}

/** Seconds per rep when plausible (research §4.4 D7: 0.3–15 s/rep). */
function secPerRep(s: EnrichedSet): number | null {
  if (s.durationSec == null || s.reps == null || s.reps <= 0) return null
  const v = s.durationSec / s.reps
  return v >= 0.3 && v <= 15 ? v : null
}

function setColumns(units: Units, isDetailed: boolean): Column<SetRow>[] {
  const cols: Column<SetRow>[] = [
    { id: 'n', header: '#', width: '2.5rem', render: (r) => <span class="faint num">{r.n}</span> },
    {
      id: 'weight',
      header: 'Weight',
      align: 'right',
      render: ({ set }) => {
        if (BW_BASES.has(set.loadBasis)) return <LoadBasisTag basis={set.loadBasis} weightLb={set.weightLb} loadLb={set.loadLb} units={units} />
        return set.weightLb == null ? dash : set.weightLb > 0 ? formatWeight(set.weightLb, units) : <span class="faint">Bodyweight</span>
      },
    },
    {
      id: 'reps',
      header: 'Reps',
      align: 'right',
      render: ({ set }) => {
        if (set.reps != null && set.reps > 0) return formatNumber(set.reps, { maxDecimals: 0 })
        if (set.holdSec != null && set.holdSec > 0) return `${formatHold(set.holdSec)} hold`
        return set.reps != null ? formatNumber(set.reps, { maxDecimals: 0 }) : set.durationSec != null ? formatDuration(set.durationSec) : dash
      },
    },
  ]
  if (isDetailed) {
    cols.push(
      {
        id: 'e1rm',
        header: 'e1RM',
        align: 'right',
        title: 'Estimated one-rep max from this set',
        render: ({ set }) =>
          set.e1rm ? (
            <span
              class={set.e1rm.confidence === 'medium' ? 'faint' : undefined}
              title={set.e1rm.confidence === 'medium' ? 'Lower confidence: high reps or no effort rating' : undefined}
            >
              {formatWeight(set.e1rm.value, units)}
            </span>
          ) : (
            dash
          ),
      },
      { id: 'effort', header: 'Effort', align: 'right', title: 'Perceived effort (RPE 1–10)', render: ({ set }) => formatNumber(set.effort) },
    )
  }
  cols.push(
    {
      id: 'rest',
      header: 'Rest',
      align: 'right',
      title: 'Rest before this set',
      render: ({ set }) =>
        set.restSec == null || set.restSec <= 0 ? (
          dash
        ) : set.firstOfBlock ? (
          <span class="faint" title="Includes changeover from the previous exercise">
            {formatRest(set.restSec)}
          </span>
        ) : (
          formatRest(set.restSec)
        ),
    },
    {
      id: 'tempo',
      header: 'Time/rep',
      align: 'right',
      title: 'Set duration ÷ reps, from the watch',
      priority: 2,
      render: ({ set }) => {
        const v = secPerRep(set)
        return v != null ? `${formatNumber(v, { maxDecimals: 1 })}s` : dash
      },
    },
  )
  if (isDetailed) {
    cols.push({ id: 'time', header: 'Set time', align: 'right', priority: 2, render: ({ set }) => formatDuration(set.durationSec) })
  }
  cols.push({
    id: 'type',
    header: 'Counts',
    align: 'right',
    title: 'Working sets count toward weekly sets; warm-ups and easy sets do not. Hover a set for the rule that decided it.',
    render: ({ set }) => (
      <span class={set.drop ? 'wo-tag wo-tag--drop' : set.hard ? 'wo-tag wo-tag--hard' : 'wo-tag'} title={hardSetWhy(set)}>
        {SET_TYPE_LABEL[set.hardReason]}
        <span class="wo-tag__credit num">{set.credit > 0 ? formatSetCredit(set.credit) : '0'}</span>
      </span>
    ),
  })
  return cols
}

export function ExerciseBlock({ block, units, detailed: isDetailed }: { block: Block; units: Units; detailed: boolean }) {
  const headingId = useId()
  const rows = block.sets.map((set, i) => ({ set, n: i + 1 }))
  const counted = block.sets.reduce((n, s) => n + s.credit, 0)
  const prTypes = [...new Set<PrType>(block.prs.map((p) => p.type))]
  const meta = [
    `${plural(block.sets.length, 'set')}${counted !== block.sets.length ? ` (${formatSetCredit(counted)} counted)` : ''}`,
    block.volumeLb > 0 ? formatWeight(block.volumeLb, units) : null,
    block.bestE1rm != null ? `best e1RM ${formatWeight(block.bestE1rm, units)}` : null,
  ].filter(Boolean)

  return (
    <section class="wo-ex" aria-labelledby={headingId}>
      <header class="wo-ex__head">
        <h3 class="wo-ex__name" id={headingId}>
          <a href={href(paths.exercise(block.exerciseKey))}>{block.name}</a>
        </h3>
        <p class="wo-ex__meta">{meta.join(' · ')}</p>
        {prTypes.length > 0 && (
          <p class="wo-prs">
            {prTypes.map((t) => (
              <PrChip key={t} type={t} />
            ))}
          </p>
        )}
        {block.regions.length > 0 && (
          <div class="wo-ex__regions">
            <RegionChips regions={block.regions} />
          </div>
        )}
      </header>
      <div class="wo-ex__sets">
        <DataTable columns={setColumns(units, isDetailed)} rows={rows} rowKey={(r) => r.set.setId} dense caption={`${block.name} sets`} empty="No sets recorded." />
      </div>
    </section>
  )
}
