'use client'

import { useState, useEffect, useCallback } from 'react'
import COIUpload from './COIUpload'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface Props {
  vertical: string
}

export default function COISection({ vertical }: Props) {
  const [coiStatus, setCoiStatus] = useState<string>('not_submitted')
  const [coiDocuments, setCoiDocuments] = useState<Array<{ url: string; filename: string; uploaded_at: string }>>([])
  const [coiVerifiedAt, setCoiVerifiedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/vendor/onboarding/status?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setCoiStatus(data.gate3?.coiStatus || 'not_submitted')
        setCoiDocuments(data.gate3?.coiDocuments || [])
        setCoiVerifiedAt(data.gate3?.coiVerifiedAt || null)
      }
    } catch {
      // Silently fail — section just shows "not submitted"
    } finally {
      setLoading(false)
    }
  }, [vertical])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  if (loading) {
    return (
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.md,
        padding: spacing.md,
        border: `1px solid ${colors.border}`,
      }}>
        <h2 style={{
          margin: 0,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Certificate of Insurance
        </h2>
        <p style={{
          margin: `${spacing.xs} 0 0 0`,
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
        }}>
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      border: `1px solid ${colors.border}`,
    }}>
      <h2 style={{
        margin: `0 0 ${spacing['2xs']} 0`,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Certificate of Insurance
      </h2>
      <p style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.sm,
        color: colors.textSecondary,
      }}>
        A COI is required before you can be approved for private events. Upload your general liability insurance certificate below.
      </p>

      <COIUpload
        coiStatus={coiStatus}
        coiDocuments={coiDocuments}
        coiVerifiedAt={coiVerifiedAt}
        onUploaded={fetchStatus}
        vertical={vertical}
      />
    </div>
  )
}
