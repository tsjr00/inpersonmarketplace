'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

type TabType = 'activity' | 'referrals'

interface ReferralStats {
  totalReferrals: number
  pendingCount: number
  earnedCount: number
  appliedCount: number
  expiredCount: number
  voidedCount: number
  totalPendingCents: number
  totalEarnedCents: number
  totalAppliedCents: number
}

interface TopReferrer {
  vendorId: string
  verticalId: string
  businessName: string
  email: string | null
  totalReferrals: number
  earnedReferrals: number
  pendingReferrals: number
  totalEarnedCents: number
  totalPendingCents: number
}

interface RecentReferral {
  id: string
  status: string
  creditAmountCents: number
  createdAt: string
  earnedAt: string | null
  appliedAt: string | null
  referrerName: string
  referredName: string
}

interface FlaggedVendor {
  id: string
  vendorProfileId: string
  verticalId: string
  reason: string
  status: string
  details: Record<string, unknown>
  createdAt: string
  resolvedAt: string | null
  resolutionNotes: string | null
  actionTaken: string | null
  vendor: {
    id: string
    status: string
    businessName: string
    email: string | null
    phone: string | null
    lastActiveAt: string | null
    lastLoginAt: string | null
    firstListingAt: string | null
    createdAt: string
    approvedAt: string | null
  } | null
}

interface VendorActivityClientProps {
  vertical: string
  initialStatus: string
  initialReason: string
  initialTab?: TabType
}

const REASON_LABELS: Record<string, { label: string; description: string; color: string }> = {
  no_recent_login: {
    label: 'No Recent Login',
    description: 'Vendor has not logged in recently',
    color: '#f59e0b'
  },
  no_recent_orders: {
    label: 'No Recent Orders',
    description: 'Vendor has not received orders recently',
    color: '#8b5cf6'
  },
  no_recent_listing_activity: {
    label: 'No Listing Activity',
    description: 'Vendor has not updated listings recently',
    color: '#3b82f6'
  },
  no_published_listings: {
    label: 'No Published Listings',
    description: 'Approved vendor with no published listings',
    color: '#ef4444'
  },
  incomplete_onboarding: {
    label: 'Incomplete Onboarding',
    description: 'Vendor approved but never created a listing',
    color: '#f97316'
  }
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending Review', color: '#92400e', bg: '#fef3c7' },
  dismissed: { label: 'Dismissed', color: '#6b7280', bg: '#f3f4f6' },
  actioned: { label: 'Actioned', color: '#166534', bg: '#dcfce7' },
  resolved: { label: 'Auto-Resolved', color: '#1e40af', bg: '#dbeafe' }
}

export default function VendorActivityClient({
  vertical,
  initialStatus,
  initialReason,
  initialTab = 'activity'
}: VendorActivityClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)

  // Activity Flags state
  const [flags, setFlags] = useState<FlaggedVendor[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [reasonFilter, setReasonFilter] = useState(initialReason)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0, hasMore: false })
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [showNotesModal, setShowNotesModal] = useState<{ flagId: string; action: string } | null>(null)

  // Referrals state
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null)
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([])
  const [recentReferrals, setRecentReferrals] = useState<RecentReferral[]>([])
  const [referralsLoading, setReferralsLoading] = useState(false)

  useEffect(() => {
    if (activeTab === 'activity') {
      fetchFlags()
    } else if (activeTab === 'referrals') {
      fetchReferrals()
    }
  }, [activeTab, statusFilter, reasonFilter])

  const fetchFlags = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('vertical', vertical)
      if (statusFilter) params.set('status', statusFilter)
      if (reasonFilter) params.set('reason', reasonFilter)

      const res = await fetch(`/api/admin/vendor-activity/flags?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setFlags(data.flags || [])
        setSummary(data.summary || {})
        setPagination(data.pagination || { total: 0, limit: 50, offset: 0, hasMore: false })
      }
    } catch (err) {
      console.error('Failed to fetch flags:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchReferrals = async () => {
    setReferralsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('vertical', vertical)

      const res = await fetch(`/api/admin/vendor-activity/referrals?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setReferralStats(data.stats || null)
        setTopReferrers(data.topReferrers || [])
        setRecentReferrals(data.recentReferrals || [])
      }
    } catch (err) {
      console.error('Failed to fetch referrals:', err)
    } finally {
      setReferralsLoading(false)
    }
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const handleAction = async (flagId: string, action: string, notes?: string) => {
    setProcessingId(flagId)
    try {
      const res = await fetch(`/api/admin/vendor-activity/flags/${flagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes })
      })

      if (res.ok) {
        // Remove from list or refresh
        await fetchFlags()
        setShowNotesModal(null)
        setActionNotes('')
      } else {
        const data = await res.json()
        alert(`Failed: ${data.error}`)
      }
    } catch (err) {
      console.error('Failed to process action:', err)
      alert('Failed to process action')
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatDaysAgo = (dateStr: string | null | undefined) => {
    if (!dateStr) return null
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return '1 day ago'
    return `${days} days ago`
  }

  const getReasonBadge = (reason: string) => {
    const info = REASON_LABELS[reason] || { label: reason, color: '#6b7280' }
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: `${spacing['3xs']} ${spacing.xs}`,
        backgroundColor: `${info.color}20`,
        color: info.color,
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.medium,
      }}>
        {info.label}
      </span>
    )
  }

  const getStatusBadge = (status: string) => {
    const info = STATUS_LABELS[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
    return (
      <span style={{
        padding: `${spacing['3xs']} ${spacing.xs}`,
        backgroundColor: info.bg,
        color: info.color,
        borderRadius: radius.full,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
      }}>
        {info.label}
      </span>
    )
  }

  const REFERRAL_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    pending: { color: '#92400e', bg: '#fef3c7' },
    earned: { color: '#166534', bg: '#dcfce7' },
    applied: { color: '#1e40af', bg: '#dbeafe' },
    expired: { color: '#6b7280', bg: '#f3f4f6' },
    voided: { color: '#991b1b', bg: '#fef2f2' },
  }

  return (
    <div style={{
      display: 'flex',
      gap: spacing.lg,
    }}>
      {/* Side Navigation */}
      <div style={{
        width: 180,
        flexShrink: 0,
      }}>
        <nav style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          overflow: 'hidden',
          position: 'sticky',
          top: spacing.md,
        }}>
          <button
            onClick={() => setActiveTab('activity')}
            style={{
              width: '100%',
              padding: `${spacing.sm} ${spacing.md}`,
              backgroundColor: activeTab === 'activity' ? colors.primary : 'transparent',
              color: activeTab === 'activity' ? colors.textInverse : colors.textPrimary,
              border: 'none',
              borderBottom: `1px solid ${colors.border}`,
              fontSize: typography.sizes.sm,
              fontWeight: activeTab === 'activity' ? typography.weights.semibold : typography.weights.medium,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              transition: 'all 0.2s',
            }}
          >
            <span>🚩</span> Activity Flags
          </button>
          <button
            onClick={() => setActiveTab('referrals')}
            style={{
              width: '100%',
              padding: `${spacing.sm} ${spacing.md}`,
              backgroundColor: activeTab === 'referrals' ? colors.primary : 'transparent',
              color: activeTab === 'referrals' ? colors.textInverse : colors.textPrimary,
              border: 'none',
              fontSize: typography.sizes.sm,
              fontWeight: activeTab === 'referrals' ? typography.weights.semibold : typography.weights.medium,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              transition: 'all 0.2s',
            }}
          >
            <span>🎁</span> Referrals
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Activity Flags Tab */}
        {activeTab === 'activity' && (
        <>
          {/* Summary Cards */}
          <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: spacing.md,
        marginBottom: spacing.lg,
      }}>
        {Object.entries(STATUS_LABELS).map(([key, info]) => (
          <div
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{
              padding: spacing.md,
              backgroundColor: statusFilter === key ? info.bg : colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${statusFilter === key ? info.color : colors.border}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase' }}>
              {info.label}
            </p>
            <p style={{
              margin: `${spacing.xs} 0 0`,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              color: statusFilter === key ? info.color : colors.textPrimary,
            }}>
              {summary[key] || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: spacing.md,
        marginBottom: spacing.lg,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div>
          <label style={{ display: 'block', fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['3xs'] }}>
            Reason
          </label>
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              backgroundColor: colors.surfaceElevated,
              fontSize: typography.sizes.sm,
              color: colors.textPrimary,
              minWidth: 180,
            }}
          >
            <option value="">All Reasons</option>
            {Object.entries(REASON_LABELS).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: typography.sizes.sm, color: colors.textMuted }}>
          Showing {flags.length} of {pagination.total} flags
        </div>
      </div>

      {/* Flags List */}
      {loading ? (
        <div style={{
          padding: spacing.xl,
          textAlign: 'center',
          color: colors.textMuted,
        }}>
          Loading flagged vendors...
        </div>
      ) : flags.length === 0 ? (
        <div style={{
          padding: spacing.xl,
          textAlign: 'center',
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
        }}>
          <p style={{ fontSize: typography.sizes.lg, color: colors.textPrimary, margin: 0 }}>
            No flagged vendors found
          </p>
          <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `${spacing.xs} 0 0` }}>
            {statusFilter === 'pending'
              ? 'All vendors are active. Great!'
              : 'Try changing the filters above.'}
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm,
          overflow: 'hidden',
        }}>
          {flags.map((flag, index) => (
            <div
              key={flag.id}
              style={{
                padding: spacing.md,
                borderBottom: index < flags.length - 1 ? `1px solid ${colors.border}` : undefined,
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: spacing.md,
                flexWrap: 'wrap',
              }}>
                {/* Vendor Info */}
                <div style={{ flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                    <Link
                      href={`/${vertical}/admin/vendors?search=${encodeURIComponent(flag.vendor?.businessName || '')}`}
                      style={{
                        fontSize: typography.sizes.base,
                        fontWeight: typography.weights.semibold,
                        color: colors.textPrimary,
                        textDecoration: 'none',
                      }}
                    >
                      {flag.vendor?.businessName || 'Unknown Vendor'}
                    </Link>
                    {getStatusBadge(flag.status)}
                  </div>

                  <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.sm }}>
                    {getReasonBadge(flag.reason)}
                    <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                      Flagged {formatDate(flag.createdAt)}
                    </span>
                  </div>

                  {/* Details */}
                  <div style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textSecondary,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: spacing.xs,
                  }}>
                    <div>
                      <strong>Last Login:</strong> {formatDate(flag.vendor?.lastLoginAt)}
                      {flag.vendor?.lastLoginAt && (
                        <span style={{ color: colors.textMuted }}> ({formatDaysAgo(flag.vendor.lastLoginAt)})</span>
                      )}
                    </div>
                    <div>
                      <strong>Last Active:</strong> {formatDate(flag.vendor?.lastActiveAt)}
                    </div>
                    <div>
                      <strong>Approved:</strong> {formatDate(flag.vendor?.approvedAt)}
                    </div>
                    <div>
                      <strong>Contact:</strong> {flag.vendor?.email || flag.vendor?.phone || 'N/A'}
                    </div>
                  </div>

                  {/* Flag Details */}
                  {flag.details && Object.keys(flag.details).length > 0 && (
                    <div style={{
                      marginTop: spacing.xs,
                      padding: spacing.xs,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                    }}>
                      {Object.entries(flag.details).map(([key, value]) => (
                        <span key={key} style={{ marginRight: spacing.sm }}>
                          {key.replace(/_/g, ' ')}: <strong>{String(value)}</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Resolution Notes */}
                  {flag.resolutionNotes && (
                    <div style={{
                      marginTop: spacing.xs,
                      padding: spacing.xs,
                      backgroundColor: colors.primaryLight,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      color: colors.primaryDark,
                    }}>
                      <strong>Notes:</strong> {flag.resolutionNotes}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {flag.status === 'pending' && (
                  <div style={{
                    display: 'flex',
                    gap: spacing.xs,
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                  }}>
                    <button
                      onClick={() => handleAction(flag.id, 'dismiss')}
                      disabled={processingId === flag.id}
                      style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: colors.surfaceMuted,
                        color: colors.textSecondary,
                        border: `1px solid ${colors.border}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.medium,
                        cursor: 'pointer',
                        opacity: processingId === flag.id ? 0.5 : 1,
                      }}
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => setShowNotesModal({ flagId: flag.id, action: 'contact' })}
                      disabled={processingId === flag.id}
                      style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        border: `1px solid #93c5fd`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.medium,
                        cursor: 'pointer',
                        opacity: processingId === flag.id ? 0.5 : 1,
                      }}
                    >
                      Contacted
                    </button>
                    <button
                      onClick={() => setShowNotesModal({ flagId: flag.id, action: 'revert_to_applied' })}
                      disabled={processingId === flag.id}
                      style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        border: `1px solid #fcd34d`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.medium,
                        cursor: 'pointer',
                        opacity: processingId === flag.id ? 0.5 : 1,
                      }}
                    >
                      Revert to Applied
                    </button>
                    <button
                      onClick={() => setShowNotesModal({ flagId: flag.id, action: 'suspend' })}
                      disabled={processingId === flag.id}
                      style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: '#fef2f2',
                        color: '#991b1b',
                        border: `1px solid #fca5a5`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.medium,
                        cursor: 'pointer',
                        opacity: processingId === flag.id ? 0.5 : 1,
                      }}
                    >
                      Suspend
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {/* Referrals Tab */}
      {activeTab === 'referrals' && (
        <>
          {referralsLoading ? (
            <div style={{
              padding: spacing.xl,
              textAlign: 'center',
              color: colors.textMuted,
            }}>
              Loading referral data...
            </div>
          ) : (
            <>
              {/* Referral Stats Summary */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: spacing.md,
                marginBottom: spacing.lg,
              }}>
                <div style={{
                  padding: spacing.md,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`,
                }}>
                  <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase' }}>
                    Total Referrals
                  </p>
                  <p style={{
                    margin: `${spacing.xs} 0 0`,
                    fontSize: typography.sizes['2xl'],
                    fontWeight: typography.weights.bold,
                    color: colors.textPrimary,
                  }}>
                    {referralStats?.totalReferrals || 0}
                  </p>
                </div>
                <div style={{
                  padding: spacing.md,
                  backgroundColor: colors.primaryLight,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.primary}`,
                }}>
                  <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.primaryDark, textTransform: 'uppercase' }}>
                    Earned
                  </p>
                  <p style={{
                    margin: `${spacing.xs} 0 0`,
                    fontSize: typography.sizes['2xl'],
                    fontWeight: typography.weights.bold,
                    color: colors.primaryDark,
                  }}>
                    {referralStats?.earnedCount || 0}
                  </p>
                  <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, color: colors.primaryDark }}>
                    {formatCurrency(referralStats?.totalEarnedCents || 0)}
                  </p>
                </div>
                <div style={{
                  padding: spacing.md,
                  backgroundColor: '#fef3c7',
                  borderRadius: radius.md,
                  border: `1px solid #fcd34d`,
                }}>
                  <p style={{ margin: 0, fontSize: typography.sizes.xs, color: '#92400e', textTransform: 'uppercase' }}>
                    Pending
                  </p>
                  <p style={{
                    margin: `${spacing.xs} 0 0`,
                    fontSize: typography.sizes['2xl'],
                    fontWeight: typography.weights.bold,
                    color: '#92400e',
                  }}>
                    {referralStats?.pendingCount || 0}
                  </p>
                  <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, color: '#92400e' }}>
                    {formatCurrency(referralStats?.totalPendingCents || 0)}
                  </p>
                </div>
                <div style={{
                  padding: spacing.md,
                  backgroundColor: '#dbeafe',
                  borderRadius: radius.md,
                  border: `1px solid #93c5fd`,
                }}>
                  <p style={{ margin: 0, fontSize: typography.sizes.xs, color: '#1e40af', textTransform: 'uppercase' }}>
                    Applied
                  </p>
                  <p style={{
                    margin: `${spacing.xs} 0 0`,
                    fontSize: typography.sizes['2xl'],
                    fontWeight: typography.weights.bold,
                    color: '#1e40af',
                  }}>
                    {referralStats?.appliedCount || 0}
                  </p>
                  <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, color: '#1e40af' }}>
                    {formatCurrency(referralStats?.totalAppliedCents || 0)}
                  </p>
                </div>
              </div>

              {/* Top Referrers Leaderboard */}
              <div style={{
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                marginBottom: spacing.lg,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: spacing.md,
                  borderBottom: `1px solid ${colors.border}`,
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                  }}>
                    🏆 Top Referrers
                  </h3>
                </div>
                {topReferrers.length === 0 ? (
                  <div style={{
                    padding: spacing.lg,
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}>
                    No referrers yet
                  </div>
                ) : (
                  <div>
                    {topReferrers.map((referrer, index) => (
                      <div
                        key={referrer.vendorId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.md,
                          padding: spacing.md,
                          borderBottom: index < topReferrers.length - 1 ? `1px solid ${colors.border}` : undefined,
                        }}
                      >
                        {/* Rank */}
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: radius.full,
                          backgroundColor: index === 0 ? '#fef3c7' : index === 1 ? '#f3f4f6' : index === 2 ? '#fef2f2' : colors.surfaceMuted,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.bold,
                          color: index === 0 ? '#92400e' : index === 1 ? '#6b7280' : index === 2 ? '#b45309' : colors.textMuted,
                        }}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                        </div>

                        {/* Vendor Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Link
                            href={`/${vertical}/admin/vendors?search=${encodeURIComponent(referrer.businessName)}`}
                            style={{
                              fontSize: typography.sizes.sm,
                              fontWeight: typography.weights.medium,
                              color: colors.textPrimary,
                              textDecoration: 'none',
                              display: 'block',
                            }}
                          >
                            {referrer.businessName}
                          </Link>
                          {referrer.email && (
                            <a
                              href={`mailto:${referrer.email}`}
                              style={{
                                fontSize: typography.sizes.xs,
                                color: colors.textMuted,
                                textDecoration: 'none',
                              }}
                            >
                              {referrer.email}
                            </a>
                          )}
                        </div>

                        {/* Stats */}
                        <div style={{
                          display: 'flex',
                          gap: spacing.md,
                          alignItems: 'center',
                        }}>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                              Earned
                            </p>
                            <p style={{
                              margin: 0,
                              fontSize: typography.sizes.sm,
                              fontWeight: typography.weights.semibold,
                              color: colors.primaryDark,
                            }}>
                              {referrer.earnedReferrals} ({formatCurrency(referrer.totalEarnedCents)})
                            </p>
                          </div>
                          {referrer.pendingReferrals > 0 && (
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                                Pending
                              </p>
                              <p style={{
                                margin: 0,
                                fontSize: typography.sizes.sm,
                                fontWeight: typography.weights.medium,
                                color: '#92400e',
                              }}>
                                {referrer.pendingReferrals}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Referrals Activity */}
              <div style={{
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: spacing.md,
                  borderBottom: `1px solid ${colors.border}`,
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary,
                  }}>
                    Recent Referral Activity
                  </h3>
                </div>
                {recentReferrals.length === 0 ? (
                  <div style={{
                    padding: spacing.lg,
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}>
                    No recent referrals
                  </div>
                ) : (
                  <div>
                    {recentReferrals.map((ref, index) => {
                      const statusColor = REFERRAL_STATUS_COLORS[ref.status] || { color: '#6b7280', bg: '#f3f4f6' }
                      return (
                        <div
                          key={ref.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: spacing.md,
                            padding: spacing.sm,
                            borderBottom: index < recentReferrals.length - 1 ? `1px solid ${colors.border}` : undefined,
                            fontSize: typography.sizes.sm,
                          }}
                        >
                          <span style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: statusColor.bg,
                            color: statusColor.color,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.medium,
                            textTransform: 'capitalize',
                          }}>
                            {ref.status}
                          </span>
                          <span style={{ flex: 1, color: colors.textSecondary }}>
                            <strong>{ref.referrerName}</strong> referred <strong>{ref.referredName}</strong>
                          </span>
                          <span style={{ color: colors.primaryDark, fontWeight: typography.weights.medium }}>
                            {formatCurrency(ref.creditAmountCents)}
                          </span>
                          <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                            {formatDate(ref.createdAt)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
      </div>

      {/* Notes Modal */}
      {showNotesModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.lg,
            padding: spacing.lg,
            maxWidth: 400,
            width: '90%',
            boxShadow: shadows.lg,
          }}>
            <h3 style={{
              margin: `0 0 ${spacing.sm}`,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
            }}>
              {showNotesModal.action === 'contact' && 'Mark as Contacted'}
              {showNotesModal.action === 'revert_to_applied' && 'Revert to Applied Status'}
              {showNotesModal.action === 'suspend' && 'Suspend Vendor'}
            </h3>
            <p style={{
              margin: `0 0 ${spacing.md}`,
              fontSize: typography.sizes.sm,
              color: colors.textSecondary,
            }}>
              {showNotesModal.action === 'contact' && 'Record that you have reached out to this vendor.'}
              {showNotesModal.action === 'revert_to_applied' && 'This will change the vendor status back to "applied" requiring re-approval.'}
              {showNotesModal.action === 'suspend' && 'This will suspend the vendor account. They will not be able to sell until reactivated.'}
            </p>
            <textarea
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="Add notes (optional)..."
              style={{
                width: '100%',
                padding: spacing.sm,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                minHeight: 80,
                resize: 'vertical',
                marginBottom: spacing.md,
              }}
            />
            <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowNotesModal(null)
                  setActionNotes('')
                }}
                style={{
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: colors.surfaceMuted,
                  color: colors.textSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(showNotesModal.flagId, showNotesModal.action, actionNotes)}
                disabled={processingId === showNotesModal.flagId}
                style={{
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: showNotesModal.action === 'suspend' ? '#ef4444' : colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: 'pointer',
                  opacity: processingId === showNotesModal.flagId ? 0.5 : 1,
                }}
              >
                {processingId === showNotesModal.flagId ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
