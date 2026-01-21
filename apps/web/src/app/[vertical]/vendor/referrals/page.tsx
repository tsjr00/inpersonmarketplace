'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
  referrals: Array<{
    id: string
    vendorName: string
    status: string
    creditAmountCents: number
    createdAt: string
    earnedAt: string | null
    appliedAt: string | null
    expiresAt: string | null
  }>
}

export default function VendorReferralsPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params)
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
      earned: { bg: '#dcfce7', color: '#166534', label: 'Earned' },
      applied: { bg: '#dbeafe', color: '#1e40af', label: 'Applied' },
      expired: { bg: '#f3f4f6', color: '#6b7280', label: 'Expired' },
      voided: { bg: '#fef2f2', color: '#991b1b', label: 'Voided' },
    }
    const style = styles[status] || styles.pending
    return (
      <span style={{
        padding: `${spacing['3xs']} ${spacing.xs}`,
        backgroundColor: style.bg,
        color: style.color,
        borderRadius: radius.full,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
      }}>
        {style.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase, padding: spacing.lg }}>
        <div style={{ maxWidth: containers.lg, margin: '0 auto' }}>
          <p style={{ color: colors.textMuted }}>Loading referral data...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase, padding: spacing.lg }}>
        <div style={{ maxWidth: containers.lg, margin: '0 auto' }}>
          <p style={{ color: colors.textMuted }}>Failed to load referral data.</p>
          <Link href={`/${vertical}/vendor/dashboard`} style={{ color: colors.primary }}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const referralLink = `${window.location.origin}/${vertical}/vendor-signup?ref=${data.referralCode}`

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase, padding: spacing.lg }}>
      <div style={{ maxWidth: containers.lg, margin: '0 auto' }}>
        {/* Back Link */}
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.xs,
            color: colors.textMuted,
            textDecoration: 'none',
            fontSize: typography.sizes.sm,
            marginBottom: spacing.md,
          }}
        >
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div style={{ marginBottom: spacing.lg }}>
          <h1 style={{
            margin: 0,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
          }}>
            Vendor Referrals
          </h1>
          <p style={{ margin: `${spacing.xs} 0 0`, color: colors.textSecondary }}>
            Earn $10 credit for each vendor you refer who makes their first sale.
          </p>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: spacing.md,
          marginBottom: spacing.lg,
        }}>
          {/* Available Balance */}
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.sm,
          }}>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase' }}>
              Available Balance
            </p>
            <p style={{
              margin: `${spacing.xs} 0 0`,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: colors.primary,
            }}>
              ${(data.summary.availableBalanceCents / 100).toFixed(2)}
            </p>
          </div>

          {/* Pending */}
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.sm,
          }}>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase' }}>
              Pending
            </p>
            <p style={{
              margin: `${spacing.xs} 0 0`,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: '#92400e',
            }}>
              ${(data.summary.pendingBalanceCents / 100).toFixed(2)}
            </p>
            <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
              {data.summary.pendingCount} vendor{data.summary.pendingCount !== 1 ? 's' : ''} awaiting first sale
            </p>
          </div>

          {/* Year Progress */}
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            boxShadow: shadows.sm,
          }}>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase' }}>
              Earned This Year
            </p>
            <p style={{
              margin: `${spacing.xs} 0 0`,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: colors.textPrimary,
            }}>
              ${(data.summary.yearEarnedCents / 100).toFixed(0)} / $100
            </p>
            <div style={{
              marginTop: spacing.xs,
              height: 6,
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.full,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(100, (data.summary.yearEarnedCents / data.summary.annualCapCents) * 100)}%`,
                height: '100%',
                backgroundColor: colors.primary,
                borderRadius: radius.full,
              }} />
            </div>
          </div>
        </div>

        {/* Referral Link Card */}
        <div style={{
          padding: spacing.md,
          background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
          borderRadius: radius.md,
          border: `2px solid ${colors.primary}`,
          marginBottom: spacing.lg,
        }}>
          <h2 style={{
            margin: `0 0 ${spacing.sm}`,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: '#166534',
          }}>
            Your Referral Link
          </h2>
          <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: '#166534' }}>
            Share this link with vendors you know. When they sign up and make their first sale, you earn $10 credit.
          </p>
          <div style={{ display: 'flex', gap: spacing.xs }}>
            <input
              type="text"
              readOnly
              value={referralLink}
              style={{
                flex: 1,
                padding: spacing.sm,
                border: `1px solid ${colors.primary}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                backgroundColor: 'white',
                color: colors.textSecondary,
              }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              style={{
                padding: `${spacing.sm} ${spacing.md}`,
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
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
          </div>
        </div>

        {/* Referral History */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: spacing.md,
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <h2 style={{
              margin: 0,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
            }}>
              Referral History
            </h2>
          </div>

          {data.referrals.length === 0 ? (
            <div style={{ padding: spacing.lg, textAlign: 'center' }}>
              <p style={{ color: colors.textMuted, margin: 0 }}>
                No referrals yet. Share your link to get started!
              </p>
            </div>
          ) : (
            <div>
              {data.referrals.map((referral) => (
                <div
                  key={referral.id}
                  style={{
                    padding: spacing.md,
                    borderBottom: `1px solid ${colors.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: spacing.md,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <p style={{
                      margin: 0,
                      fontWeight: typography.weights.medium,
                      color: colors.textPrimary,
                    }}>
                      {referral.vendorName}
                    </p>
                    <p style={{
                      margin: `${spacing['3xs']} 0 0`,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                    }}>
                      Joined {new Date(referral.createdAt).toLocaleDateString()}
                      {referral.earnedAt && ` • Earned ${new Date(referral.earnedAt).toLocaleDateString()}`}
                      {referral.expiresAt && referral.status === 'earned' && (
                        <> • Expires {new Date(referral.expiresAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                    <span style={{
                      fontWeight: typography.weights.semibold,
                      color: referral.status === 'earned' || referral.status === 'applied'
                        ? colors.primary
                        : colors.textMuted,
                    }}>
                      ${(referral.creditAmountCents / 100).toFixed(2)}
                    </span>
                    {getStatusBadge(referral.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div style={{
          marginTop: spacing.lg,
          padding: spacing.md,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
        }}>
          <h3 style={{
            margin: `0 0 ${spacing.sm}`,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
          }}>
            How It Works
          </h3>
          <ul style={{
            margin: 0,
            paddingLeft: spacing.md,
            color: colors.textSecondary,
            fontSize: typography.sizes.sm,
            lineHeight: typography.leading.relaxed,
          }}>
            <li>Share your unique referral link with vendors you know</li>
            <li>When they sign up using your link, the referral is tracked</li>
            <li>You earn $10 credit when they make their first completed sale</li>
            <li>Credits can be applied to your platform fees or subscription</li>
            <li>Maximum $100 in referral credits per year (10 referrals)</li>
            <li>Earned credits expire 12 months after being earned</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
