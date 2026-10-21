export interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: number | string
  /** Render N stacked text lines instead of a single block (last one shorter). */
  lines?: number
}

const px = (v: number | string) => (typeof v === 'number' ? `${v}px` : v)

/** Loading placeholder. Decorative; pair with an aria-busy container. */
export function Skeleton({ width = '100%', height = 14, radius, lines }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <span class="skeleton-lines" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            class="skeleton"
            style={{ width: i === lines - 1 ? '60%' : px(width), height: px(height), borderRadius: radius != null ? px(radius) : undefined }}
          />
        ))}
      </span>
    )
  }
  return (
    <span
      class="skeleton"
      aria-hidden="true"
      style={{ width: px(width), height: px(height), borderRadius: radius != null ? px(radius) : undefined }}
    />
  )
}
