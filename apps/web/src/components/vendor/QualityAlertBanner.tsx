'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

interface QualityAlertBannerProps {
  vertical: string
}

export default function QualityAlertBanner({ vertical }: QualityAlertBannerProps) {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFindings() {
      try {
        const res = await fetch(`/api/vendor/quality-findings?vertical=${vertical}`)
        if (res.ok) {
          const data = await res.json()
          setCount((data.findings || []).length)
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false)
      }
    }
    fetchFindings()
  }, [vertical])

  if (loading || count === 0) return null

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: statusColors.warningLight,
      border: `2px solid ${statusColors.warningBorder}`,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{
            margin: `0 0 ${spacing['2xs']} 0`,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.bold,
            color: statusColors.warningDark,
          }}>
            Quality Check: {count} item{count !== 1 ? 's' : ''} need your attention
          </h3>
          <p style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            color: statusColors.warningDark,
          }}>
            Our nightly scan found potential issues with your listings or schedule.
          </p>
        </div>

        <Link
          href={`/${vertical}/vendor/quality`}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: statusColors.warning,
            color: 'white',
            border: 'none',
            borderRadius: radius.md,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            whiteSpace: 'nowrap',
          }}
        >
          View Details
        </Link>
      </div>
    </div>
  )
}
