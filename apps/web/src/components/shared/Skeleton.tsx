'use client'

/**
 * Skeleton loading primitives for loading.tsx files.
 * Uses CSS var theming so skeletons match the active vertical's color scheme.
 */

const shimmerKeyframes = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`

const baseStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--color-surface-muted, #F5F5F0) 25%, var(--color-border-muted, #F0EDE8) 50%, var(--color-surface-muted, #F5F5F0) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
  borderRadius: 6,
}

export function SkeletonBox({
  width,
  height,
  style,
}: {
  width?: string | number
  height?: string | number
  style?: React.CSSProperties
}) {
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div style={{ ...baseStyle, width: width ?? '100%', height: height ?? 20, ...style }} />
    </>
  )
}

export function SkeletonText({
  lines = 1,
  widths,
  height = 16,
  gap = 8,
}: {
  lines?: number
  widths?: (string | number)[]
  height?: number
  gap?: number
}) {
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            style={{
              ...baseStyle,
              width: widths?.[i] ?? (i === lines - 1 && lines > 1 ? '60%' : '100%'),
              height,
            }}
          />
        ))}
      </div>
    </>
  )
}

export function SkeletonCard({
  imageHeight = 180,
  lines = 3,
  style,
}: {
  imageHeight?: number
  lines?: number
  style?: React.CSSProperties
}) {
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div
        style={{
          borderRadius: 8,
          border: '1px solid var(--color-border, #E8E5E0)',
          backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
          overflow: 'hidden',
          ...style,
        }}
      >
        <div style={{ ...baseStyle, height: imageHeight, borderRadius: 0 }} />
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonText lines={lines} widths={['70%', '50%', '40%']} />
        </div>
      </div>
    </>
  )
}
