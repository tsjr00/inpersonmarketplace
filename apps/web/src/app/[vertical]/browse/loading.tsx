import { SkeletonBox, SkeletonText, SkeletonCard } from '@/components/shared/Skeleton'
import { containers, spacing, typography } from '@/lib/design-tokens'

export default function BrowseLoading() {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface-base, #FFFEF7)',
        color: 'var(--color-text-primary, #33691E)',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: containers.xl,
          margin: '0 auto',
          padding: `${spacing.md} ${spacing.sm}`,
        }}
      >
        {/* Title */}
        <div style={{ marginBottom: spacing.md }}>
          <SkeletonBox width={220} height={32} />
          <div style={{ marginTop: 8 }}>
            <SkeletonBox width={300} height={18} />
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap' }}>
          <SkeletonBox width={100} height={36} style={{ borderRadius: 20 }} />
          <SkeletonBox width={120} height={36} style={{ borderRadius: 20 }} />
          <SkeletonBox width={140} height={36} style={{ borderRadius: 20 }} />
        </div>

        {/* Search bar */}
        <div style={{ marginBottom: spacing.md }}>
          <SkeletonBox height={42} style={{ borderRadius: 8 }} />
        </div>

        {/* Results count */}
        <div style={{ marginBottom: spacing.sm }}>
          <SkeletonBox width={180} height={16} />
        </div>

        {/* Product grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: spacing.md,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} imageHeight={200} lines={3} />
          ))}
        </div>
      </div>
    </div>
  )
}
