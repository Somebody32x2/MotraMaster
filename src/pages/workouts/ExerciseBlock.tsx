import type { EnrichedSet, LoadBasis, PrType, WorkoutDetail } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { Card } from '../../ui/components/Card'
import { DataTable, type Column } from '../../ui/components/DataTable'
import { formatDuration, formatNumber, formatRest, formatWeight, plural } from '../../ui/format'
import { formatHold, LoadBasisTag, PrChip, RegionChips } from '../../ui/widgets'

type Block = WorkoutDetail['blocks'][number]

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
        return set.weightLb == null ? '—' : set.weightLb > 0 ? formatWeight(set.weightLb, units) : <span class="faint">Bodyweight</span>
      },
    },
    {
      id: 'reps',
      header: 'Reps',
      align: 'right',
      render: ({ set }) => {
        if (set.reps != null && set.reps > 0) return formatNumber(set.reps, { maxDecimals: 0 })
        if (set.holdSec != null && set.holdSec > 0) return `${formatHold(set.holdSec)} hold`
        return set.reps != null ? formatNumber(set.reps, { maxDecimals: 0 }) : set.durationSec != null ? formatDuration(set.durationSec) : '—'
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
            '—'
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
          '—'
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
        return v != null ? `${formatNumber(v, { maxDecimals: 1 })}s` : '—'
      },
    },
  )
  if (isDetailed) {
    cols.push({ id: 'time', header: 'Set time', align: 'right', priority: 2, render: ({ set }) => formatDuration(set.durationSec) })
  }
  cols.push({
    id: 'type',
    header: 'Type',
    align: 'right',
    title: 'Working sets count toward weekly volume; light warm-ups do not',
    render: ({ set }) => <span class={set.hard ? 'wo-tag wo-tag--hard' : 'wo-tag'}>{set.hard ? 'Working' : 'Warm-up'}</span>,
  })
  return cols
}

export function ExerciseBlock({ block, units, detailed: isDetailed, class: cls }: { block: Block; units: Units; detailed: boolean; class?: string }) {
  const rows = block.sets.map((set, i) => ({ set, n: i + 1 }))
  const hard = block.sets.filter((s) => s.hard).length
  const prTypes = [...new Set<PrType>(block.prs.map((p) => p.type))]
  const meta = [
    `${plural(block.sets.length, 'set')}${hard !== block.sets.length ? ` (${formatNumber(hard, { maxDecimals: 0 })} working)` : ''}`,
    block.volumeLb > 0 ? formatWeight(block.volumeLb, units) : null,
    block.bestE1rm != null ? `best e1RM ${formatWeight(block.bestE1rm, units)}` : null,
  ].filter(Boolean)

  return (
    <Card
      title={
        <a class="link" href={href(paths.exercise(block.exerciseKey))}>
          {block.name}
        </a>
      }
      subtitle={meta.join(' · ')}
      actions={
        prTypes.length ? (
          <span class="wo-prs">
            {prTypes.map((t) => (
              <PrChip key={t} type={t} />
            ))}
          </span>
        ) : undefined
      }
      flush
      class={cls}
    >
      <DataTable columns={setColumns(units, isDetailed)} rows={rows} rowKey={(r) => r.set.setId} dense empty="No sets recorded." />
      {block.regions.length > 0 && (
        <div class="wo-block__foot">
          <RegionChips regions={block.regions} />
        </div>
      )}
    </Card>
  )
}
