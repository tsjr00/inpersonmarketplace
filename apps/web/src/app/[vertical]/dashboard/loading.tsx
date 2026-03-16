import { SkeletonBox, SkeletonText } from '@/components/shared/Skeleton'
import { containers, spacing } from '@/lib/design-tokens'

export default function DashboardLoading() {
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
        <SkeletonBox width={200} height={32} style={{ marginBottom: 24 }} />

        {/* Dashboard cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: spacing.md,
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
              }}
            >
              <SkeletonBox width={140} height={18} style={{ marginBottom: 12 }} />
              <SkeletonText lines={2} widths={['80%', '50%']} />
              <div style={{ marginTop: 16 }}>
                <SkeletonBox width={100} height={36} style={{ borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Notifications section */}
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
              }}
            >
              <SkeletonText lines={2} widths={['60%', '40%']} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
