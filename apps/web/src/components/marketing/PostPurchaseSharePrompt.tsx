'use client'

import ShareButton from './ShareButton'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface Vendor {
  id: string
  name: string
}

interface PostPurchaseSharePromptProps {
  vendors: Vendor[]
  vertical: string
  onClose: () => void
}

export default function PostPurchaseSharePrompt({
  vendors,
  vertical,
  onClose,
}: PostPurchaseSharePromptProps) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const locale = getClientLocale()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: radius.lg,
          maxWidth: 400,
          width: '100%',
          boxShadow: shadows.xl,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: spacing.lg,
            textAlign: 'center',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: spacing.xs }}>
            🛒
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: typography.sizes.xl,
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
            }}
          >
            {t('ppsp.title', locale)}
          </h2>
          <p
            style={{
              margin: `${spacing.xs} 0 0`,
              fontSize: typography.sizes.sm,
              color: colors.textSecondary,
            }}
          >
            {vendors.length === 1
              ? t('ppsp.help_single', locale, { vendor: vendors[0].name })
              : t('ppsp.help_multiple', locale)}
          </p>
        </div>

        {/* Vendor share buttons */}
        <div style={{ padding: spacing.md }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.sm,
            }}
          >
            {vendors.map((vendor) => (
              <div
                key={vendor.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md,
                }}
              >
                <span
                  style={{
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.medium,
                    color: colors.textPrimary,
                  }}
                >
                  {vendor.name}
                </span>
                <ShareButton
                  url={`${baseUrl}/${vertical}/vendor/${vendor.id}/profile`}
                  title={vendor.name}
                  text={t('ppsp.share_text', locale, { vendor: vendor.name })}
                  variant="compact"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dismiss */}
        <div
          style={{
            padding: spacing.md,
            borderTop: `1px solid ${colors.border}`,
            textAlign: 'center',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: `${spacing.xs} ${spacing.lg}`,
              backgroundColor: 'transparent',
              color: colors.textMuted,
              border: 'none',
              fontSize: typography.sizes.sm,
              cursor: 'pointer',
            }}
          >
            {t('ppsp.not_now', locale)}
          </button>
        </div>
      </div>
    </div>
  )
}
