import type { MuscleWeek, MuscleWeekExercise } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { formatDate } from '../../ui/format'
import { formatSetCredit, SetChip, SetChipLegend } from '../../ui/widgets'

/**
 * Exercise-by-exercise, set-by-set account of a muscle's count over a span: each row
 * is an exercise, what it added, and its sets per workout. Secondary contributors
 * (half credit) are listed separately and only when `secondary` is on.
 */
export function WeekBreakdown({ week, units, secondary }: { week: MuscleWeek; units: Units; secondary: boolean }) {
  const direct = week.exercises.filter((e) => e.role === 'direct')
  const indirect = secondary ? week.exercises.filter((e) => e.role === 'secondary') : []
  const shown = [...direct, ...indirect]
  if (shown.length === 0) return <p class="wk__empty muted">No sets for this muscle on these days.</p>
  const anyDrop = shown.some((e) => e.sessions.some((s) => s.sets.some((c) => c.set.drop)))
  return (
    <div class="wk">
      <ExerciseRows rows={direct} units={units} />
      {indirect.length > 0 && (
        <>
          <p class="wk__group">Secondary mover, half credit</p>
          <ExerciseRows rows={indirect} units={units} />
        </>
      )}
      <SetChipLegend drops={anyDrop} />
    </div>
  )
}

function ExerciseRows({ rows, units }: { rows: MuscleWeekExercise[]; units: Units }) {
  return (
    <ul class="wk__list" role="list">
      {rows.map((e) => (
        <li key={e.key} class="wk__ex">
          <a class="wk__name" href={href(paths.exercise(e.key))}>
            {e.name}
          </a>
          <div class="wk__body">
            <span class={e.sets > 0 ? 'wk__count num' : 'wk__count num faint'} title="Sets counted toward this muscle">
              {formatSetCredit(e.sets)}
            </span>
            <div class="wk__sessions">
              {e.sessions.map((sess) => (
                <div key={sess.workoutId} class="wk__sess">
                  <a class="wk__day" href={href(paths.workout(sess.workoutId))} title={formatDate(sess.date, 'weekday')}>
                    {formatDate(sess.date, 'dow')}
                  </a>
                  <span class="set-chips">
                    {sess.sets.map((c) => (
                      <SetChip key={c.set.setId} set={c.set} units={units} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
