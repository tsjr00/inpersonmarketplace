'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface ReferralCardProps {
  vertical: string
}

interface ReferralData {
  referralCode: string
  summary: {
    pendingCount: number
    earnedCount: number
    appliedCount: number
    availableBalanceCents: number
    pendingBalanceCents: number
    yearEarnedCents: number
    annualCapCents: number
    remainingCapCents: number
  }
}

export default function ReferralCard({ vertical }: ReferralCardProps) {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function fetchReferralData() {
      try {
        const res = await fetch('/api/vendor/referrals')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Failed to fetch referral data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchReferralData()
  }, [])

  const handleCopy = async () => {
    if (!data?.referralCode) return

    const link = `${window.location.origin}/${vertical}/vendor-signup?ref=${data.referralCode}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (loading) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        boxShadow: shadows.sm,
      }}>
        <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
          Loading referral info...
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/${vertical}/vendor-signup?ref=${data.referralCode}`
  const hasCredits = data.summary.availableBalanceCents > 0 || data.summary.pendingCount > 0

  return (
    <div style={{
      padding: spacing.sm,
      background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
      border: `2px solid ${colors.primary}`,
      borderRadius: radius.md,
      boxShadow: shadows.sm,
    }}>
      {/* Title + Description on same row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.xs,
        flexWrap: 'wrap',
        gap: spacing.xs,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <span style={{ fontSize: typography.sizes.lg }}>🎁</span>
          <h3 style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            color: '#166534',
          }}>
            Invite a Vendor, Earn $10
          </h3>
          <span style={{ fontSize: typography.sizes.xs, color: '#166534' }}>
            — Share your link. Earn $10 when they make their first sale.
          </span>
        </div>
        {hasCredits && (
          <Link
            href={`/${vertical}/vendor/referrals`}
            style={{
              fontSize: typography.sizes.xs,
              color: '#166534',
              textDecoration: 'underline',
            }}
          >
            View Details
          </Link>
        )}
      </div>

      {/* Referral Link + Stats on same row */}
      <div style={{
        display: 'flex',
        gap: spacing.sm,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: spacing.xs, flex: 1, minWidth: 200 }}>
          <input
            type="text"
            readOnly
            value={referralLink}
            style={{
              flex: 1,
              padding: `${spacing['2xs']} ${spacing.xs}`,
              border: `1px solid ${colors.primary}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              backgroundColor: 'white',
              color: colors.textSecondary,
              minWidth: 0,
            }}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={handleCopy}
            style={{
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>

        {/* Stats Summary - inline */}
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          fontSize: typography.sizes.xs,
          color: '#166534',
        }}>
          {data.summary.pendingCount > 0 && (
            <span>⏳ {data.summary.pendingCount} pending</span>
          )}
          {data.summary.availableBalanceCents > 0 && (
            <span>💰 ${(data.summary.availableBalanceCents / 100).toFixed(2)}</span>
          )}
          <span>
            ${(data.summary.yearEarnedCents / 100).toFixed(0)}/$100 this year
          </span>
        </div>
      </div>
    </div>
  )
}
