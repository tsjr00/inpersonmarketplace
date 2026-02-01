'use client'

import { useState, useEffect } from 'react'
import ShareButton from '@/components/marketing/ShareButton'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface PromoteCardProps {
  vendorId: string
  vendorName: string
  vertical: string
}

export default function PromoteCard({ vendorId, vendorName, vertical }: PromoteCardProps) {
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    // Get base URL from window location
    setBaseUrl(`${window.location.protocol}//${window.location.host}`)
  }, [])

  const profileUrl = `${baseUrl}/${vertical}/vendor/${vendorId}/profile`
  const scheduleUrl = `${baseUrl}/${vertical}/vendor/${vendorId}/schedule`

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      boxShadow: shadows.sm
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing.xs
      }}>
        <span style={{ fontSize: typography.sizes.xl }}>📣</span>
        <h3 style={{
          color: colors.primary,
          margin: 0,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold
        }}>
          Promote Your Business
        </h3>
      </div>

      <p style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.sm,
        color: colors.textSecondary
      }}>
        Share on social media to reach more customers
      </p>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing.xs
      }}>
        {baseUrl && (
          <>
            <ShareButton
              url={profileUrl}
              title={`${vendorName} - Shop our products!`}
              text={`Check out ${vendorName} for fresh, local products!`}
              variant="button"
            />

            <ShareButton
              url={scheduleUrl}
              title={`${vendorName} - This Week's Schedule`}
              text={`Find out where to get fresh products from ${vendorName} this week!`}
              variant="button"
            />
          </>
        )}
      </div>

      <p style={{
        margin: `${spacing.xs} 0 0 0`,
        fontSize: typography.sizes.xs,
        color: colors.textMuted
      }}>
        Or share individual listings from your <a href={`/${vertical}/vendor/listings`} style={{ color: colors.primary }}>Listings page</a>
      </p>
    </div>
  )
}
