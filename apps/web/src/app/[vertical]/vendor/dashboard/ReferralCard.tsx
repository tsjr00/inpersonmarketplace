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
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.sm,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <span style={{ fontSize: typography.sizes.xl }}>🎁</span>
          <h3 style={{
            margin: 0,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            color: '#166534',
          }}>
            Invite a Vendor, Earn $10
          </h3>
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

      <p style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.sm,
        color: '#166534',
        lineHeight: typography.leading.relaxed,
      }}>
        Share your link with fellow vendors. You earn $10 credit when they make their first sale.
      </p>

      {/* Referral Link */}
      <div style={{
        display: 'flex',
        gap: spacing.xs,
        marginBottom: spacing.sm,
      }}>
        <input
          type="text"
          readOnly
          value={referralLink}
          style={{
            flex: 1,
            padding: spacing.xs,
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
            padding: `${spacing.xs} ${spacing.sm}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>

      {/* Stats Summary */}
      <div style={{
        display: 'flex',
        gap: spacing.md,
        flexWrap: 'wrap',
        fontSize: typography.sizes.xs,
        color: '#166534',
      }}>
        {data.summary.pendingCount > 0 && (
          <span>⏳ {data.summary.pendingCount} pending</span>
        )}
        {data.summary.availableBalanceCents > 0 && (
          <span>💰 ${(data.summary.availableBalanceCents / 100).toFixed(2)} available</span>
        )}
        <span>
          📊 ${(data.summary.yearEarnedCents / 100).toFixed(0)} / $100 earned this year
        </span>
      </div>
    </div>
  )
}
