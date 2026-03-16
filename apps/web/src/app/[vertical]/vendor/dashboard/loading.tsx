import { SkeletonBox, SkeletonText } from '@/components/shared/Skeleton'
import { containers, spacing } from '@/lib/design-tokens'

export default function VendorDashboardLoading() {
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
        <SkeletonBox width={240} height={32} style={{ marginBottom: 8 }} />
        <SkeletonBox width={180} height={18} style={{ marginBottom: 24 }} />

        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: spacing.sm,
            marginBottom: 24,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--color-border, #E8E5E0)',
                borderRadius: 8,
                padding: 16,
                backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
                textAlign: 'center',
              }}
            >
              <SkeletonBox width={60} height={32} style={{ margin: '0 auto 8px' }} />
              <SkeletonBox width={80} height={14} style={{ margin: '0 auto' }} />
            </div>
          ))}
        </div>

        {/* Action cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: spacing.md,
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--color-border, #E8E5E0)',
                borderRadius: 8,
                padding: 16,
                backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
              }}
            >
              <SkeletonBox width={160} height={20} style={{ marginBottom: 12 }} />
              <SkeletonText lines={2} widths={['90%', '60%']} />
              <div style={{ marginTop: 16 }}>
                <SkeletonBox width={120} height={36} style={{ borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Recent orders section */}
        <div style={{ marginTop: 32 }}>
          <SkeletonBox width={160} height={24} style={{ marginBottom: 16 }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--color-border, #E8E5E0)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <SkeletonText lines={2} widths={['40%', '25%']} />
              <SkeletonBox width={80} height={28} style={{ borderRadius: 14 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
