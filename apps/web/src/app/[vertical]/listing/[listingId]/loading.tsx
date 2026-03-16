import { SkeletonBox, SkeletonText } from '@/components/shared/Skeleton'
import { containers, spacing } from '@/lib/design-tokens'

export default function ListingDetailLoading() {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface-base, #FFFEF7)',
        minHeight: '100vh',
      }}
    >
      {/* Back link bar */}
      <div
        style={{
          padding: `${spacing['2xs']} ${spacing.sm}`,
          borderBottom: '1px solid var(--color-border, #E8E5E0)',
          backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
        }}
      >
        <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
          <SkeletonBox width={120} height={18} />
        </div>
      </div>

      <div
        style={{
          maxWidth: containers.xl,
          margin: '0 auto',
          padding: `${spacing.md} ${spacing.sm}`,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: spacing.lg,
          }}
          className="listing-detail-skeleton"
        >
          {/* Image gallery area */}
          <SkeletonBox height={320} style={{ borderRadius: 12 }} />

          {/* Title + price */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonBox width="70%" height={28} />
            <SkeletonBox width={100} height={24} />
            <SkeletonText lines={3} widths={['100%', '90%', '60%']} />
          </div>

          {/* Pickup locations card */}
          <div
            style={{
              border: '1px solid var(--color-border, #E8E5E0)',
              borderRadius: 8,
              padding: 16,
              backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
            }}
          >
            <SkeletonBox width={160} height={20} style={{ marginBottom: 12 }} />
            <SkeletonText lines={3} gap={10} />
          </div>

          {/* Add to cart button area */}
          <SkeletonBox height={48} style={{ borderRadius: 8 }} />
        </div>
      </div>
    </div>
  )
}
