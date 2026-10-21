import type { StrengthLift } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { formatNumber, formatPercent, formatWeight } from '../../ui/format'
import { capitalize, isNum } from './util'

/** e1RM ÷ bodyweight per lift, with the approximate strength level and progress to the next one. */
export function StrengthLiftList({ lifts, units }: { lifts: StrengthLift[]; units: Units }) {
  return (
    <ul class="ov-rel" role="list">
      {lifts.map((l) => {
        const progress = isNum(l.progress) ? Math.min(1, Math.max(0, l.progress)) : null
        return (
          <li key={l.exerciseKey}>
            <div class="ov-rel__head">
              <a class="ov-link ov-rel__name" href={href(paths.exercise(l.exerciseKey))}>
                {l.name}
              </a>
              <span class="ov-rel__ratio tnum">
                {formatNumber(l.ratio, { decimals: 2 })}
                <span class="ov-rel__unit">× BW</span>
              </span>
            </div>
            <div class="ov-rel__meta">
              <span class="num">{formatWeight(l.e1rmLb, units)} e1RM</span>
              {l.level ? (
                <span class="ov-rel__level">{capitalize(l.level)}</span>
              ) : l.nextLevel ? (
                <span>Below beginner</span>
              ) : null}
            </div>
            {l.nextLevel && progress != null && (
              <div class="ov-rel__progress">
                <div
                  class="ov-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  aria-label={`Progress to ${capitalize(l.nextLevel)}`}
                >
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
                <span>
                  {formatPercent(progress, { decimals: 0 })} to {capitalize(l.nextLevel)}
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
