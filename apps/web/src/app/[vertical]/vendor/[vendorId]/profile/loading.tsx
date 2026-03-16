import { SkeletonBox, SkeletonText, SkeletonCard } from '@/components/shared/Skeleton'
import { containers, spacing } from '@/lib/design-tokens'

export default function VendorProfileLoading() {
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
        {/* Vendor header */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <SkeletonBox width={80} height={80} style={{ borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <SkeletonBox width="50%" height={28} style={{ marginBottom: 8 }} />
            <SkeletonBox width="30%" height={18} />
          </div>
        </div>

        {/* Description */}
        <SkeletonText lines={3} widths={['100%', '85%', '60%']} />

        {/* Listings section title */}
        <div style={{ marginTop: 32, marginBottom: 16 }}>
          <SkeletonBox width={180} height={24} />
        </div>

        {/* Listings grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: spacing.md,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} imageHeight={180} lines={2} />
          ))}
        </div>
      </div>
    </div>
  )
}
