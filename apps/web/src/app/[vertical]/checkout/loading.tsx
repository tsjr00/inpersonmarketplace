import { SkeletonBox, SkeletonText } from '@/components/shared/Skeleton'
import { containers, spacing } from '@/lib/design-tokens'

export default function CheckoutLoading() {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-surface-base, #FFFEF7)',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: `${spacing.md} ${spacing.sm}`,
        }}
      >
        {/* Title */}
        <SkeletonBox width={160} height={32} style={{ marginBottom: 24 }} />

        {/* Order summary card */}
        <div
          style={{
            border: '1px solid var(--color-border, #E8E5E0)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
          }}
        >
          <SkeletonBox width={140} height={20} style={{ marginBottom: 16 }} />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <SkeletonBox width="60%" height={16} />
              <SkeletonBox width={60} height={16} />
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--color-border, #E8E5E0)', paddingTop: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <SkeletonBox width={60} height={18} />
              <SkeletonBox width={80} height={18} />
            </div>
          </div>
        </div>

        {/* Pickup selection card */}
        <div
          style={{
            border: '1px solid var(--color-border, #E8E5E0)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            backgroundColor: 'var(--color-surface-elevated, #FFFFFF)',
          }}
        >
          <SkeletonBox width={160} height={20} style={{ marginBottom: 16 }} />
          <SkeletonText lines={3} gap={12} />
        </div>

        {/* Payment button */}
        <SkeletonBox height={48} style={{ borderRadius: 8 }} />
      </div>
    </div>
  )
}
