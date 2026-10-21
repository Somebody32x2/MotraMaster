import type { StrengthLift } from '../../core/analytics/types'
import type { Units } from '../../core/types'
import { href, paths } from '../../router'
import { Badge } from '../../ui/components/Badge'
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
              <a class="link ov-rel__name" href={href(paths.exercise(l.exerciseKey))}>
                {l.name}
              </a>
              <span class="ov-rel__ratio num">{formatNumber(l.ratio, { decimals: 2 })}× BW</span>
            </div>
            <div class="ov-rel__meta">
              <span class="faint num">{formatWeight(l.e1rmLb, units)} est. 1RM</span>
              {l.level ? (
                <Badge tone="accent">{capitalize(l.level)}</Badge>
              ) : l.nextLevel ? (
                <span class="faint">Below beginner</span>
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
                <span class="faint">
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
