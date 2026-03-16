import { SkeletonBox, SkeletonText } from '@/components/shared/Skeleton'
import { containers, spacing } from '@/lib/design-tokens'

export default function OrdersLoading() {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface-base, #FFFEF7)',
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
        <SkeletonBox width={180} height={32} style={{ marginBottom: 24 }} />

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <SkeletonBox width={60} height={32} style={{ borderRadius: 16 }} />
          <SkeletonBox width={80} height={32} style={{ borderRadius: 16 }} />
          <SkeletonBox width={90} height={32} style={{ borderRadius: 16 }} />
        </div>

        {/* Order cards */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--color-border, #E8E5E0)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
              backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <SkeletonBox width={140} height={20} />
              <SkeletonBox width={80} height={24} style={{ borderRadius: 12 }} />
            </div>
            <SkeletonText lines={2} widths={['60%', '40%']} />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <SkeletonBox width={80} height={16} />
              <SkeletonBox width={60} height={16} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
