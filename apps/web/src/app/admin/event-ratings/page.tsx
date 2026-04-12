'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { useStatusBanner } from '@/hooks/useStatusBanner'

interface EventRating {
  id: string
  rating: number
  comment: string | null
  status: string
  created_at: string
  moderated_at: string | null
  event_name: string
  event_token: string | null
  event_date: string | null
  event_city: string | null
  event_state: string | null
  event_vertical: string | null
  event_status: string | null
  reviewer_name: string
  reviewer_email: string | null
}

interface RatingsResponse {
  ratings: EventRating[]
  counts: Record<string, number>
}

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  approved: { bg: '#dcfce7', text: '#166534' },
  hidden: { bg: '#f3f4f6', text: '#6b7280' },
}

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

export default function EventRatingsModerationPage() {
  const [data, setData] = useState<RatingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedRating, setSelectedRating] = useState<EventRating | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const { showBanner, StatusBanner } = useStatusBanner()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (statusFilter) params.set('status', statusFilter)
        const res = await fetch(`/api/admin/event-ratings?${params}`)
        if (!cancelled && res.ok) {
          const json: RatingsResponse = await res.json()
          if (!cancelled) setData(json)
        } else if (!cancelled) {
          showBanner('error', 'Failed to load event ratings')
        }
      } catch {
        if (!cancelled) showBanner('error', 'Network error loading event ratings')
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(id: string, newStatus: string) {
    setActionLoading(true)
    try {
      const res = await fetch('/api/admin/event-ratings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (res.ok) {
        showBanner('success', `Rating ${newStatus === 'approved' ? 'approved' : newStatus === 'hidden' ? 'hidden' : 'updated'}`)
        if (data) {
          setData({
            ...data,
            ratings: data.ratings.map(r =>
              r.id === id ? { ...r, status: newStatus, moderated_at: new Date().toISOString() } : r
            ),
            counts: {
              ...data.counts,
              [selectedRating?.status || 'pending']: Math.max(0, (data.counts[selectedRating?.status || 'pending'] || 1) - 1),
              [newStatus]: (data.counts[newStatus] || 0) + 1,
            },
          })
          setSelectedRating(prev => prev?.id === id ? { ...prev, status: newStatus, moderated_at: new Date().toISOString() } : prev)
        }
      } else {
        const err = await res.json().catch(() => ({}))
        showBanner('error', err.error || 'Failed to update rating')
      }
    } catch {
      showBanner('error', 'Network error')
    }
    setActionLoading(false)
  }

  const tabStyle = (active: boolean) => ({
    padding: `${spacing['2xs']} ${spacing.sm}`,
    backgroundColor: active ? colors.primary : 'transparent',
    color: active ? colors.textInverse : colors.textSecondary,
    border: active ? 'none' : `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer' as const,
  })

  return (
    <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: spacing.md }}>
      <Link href="/admin" style={{ fontSize: typography.sizes.sm, color: colors.textMuted, textDecoration: 'none' }}>
        ← Back to Dashboard
      </Link>

      <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: `${spacing.sm} 0` }}>
        Event Ratings
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.md}` }}>
        Moderate attendee feedback about event experiences. Approved ratings become visible to the event organizer.
      </p>

      <StatusBanner />

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap' }}>
        {['pending', 'approved', 'hidden', ''].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            style={tabStyle(statusFilter === s)}
          >
            {s || 'All'}{data ? ` (${s ? data.counts[s] || 0 : data.counts.total || 0})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: spacing.xl, color: colors.textMuted }}>Loading event ratings…</p>
      ) : !data || data.ratings.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: spacing.xl,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          boxShadow: shadows.sm,
        }}>
          <p style={{ fontSize: '2rem', margin: `0 0 ${spacing.xs}` }}>
            {statusFilter === 'pending' ? '📭' : '📋'}
          </p>
          <p style={{ fontSize: typography.sizes.base, color: colors.textSecondary, margin: 0 }}>
            {statusFilter === 'pending' ? 'No ratings waiting for moderation' : `No ${statusFilter || ''} ratings`}
          </p>
        </div>
      ) : (
        <div className={`admin-detail-split ${selectedRating ? 'has-detail' : ''}`}>
          {/* List */}
          <div>
            {data.ratings.map(r => {
              const sc = statusColors[r.status] || statusColors.pending
              const isSelected = selectedRating?.id === r.id
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRating(isSelected ? null : r)}
                  style={{
                    padding: spacing.sm,
                    marginBottom: spacing.xs,
                    backgroundColor: isSelected ? '#f0f9ff' : colors.surfaceElevated,
                    borderRadius: radius.md,
                    boxShadow: shadows.sm,
                    cursor: 'pointer',
                    border: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing['3xs'] }}>
                    <span style={{ fontSize: typography.sizes.base, color: '#f59e0b', letterSpacing: 2 }}>
                      {stars(r.rating)}
                    </span>
                    <span style={{
                      padding: `2px ${spacing['2xs']}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: 600,
                      backgroundColor: sc.bg,
                      color: sc.text,
                    }}>
                      {r.status}
                    </span>
                  </div>
                  <p style={{ fontSize: typography.sizes.sm, fontWeight: 600, color: colors.textPrimary, margin: `0 0 2px` }}>
                    {r.event_name}
                  </p>
                  <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: 0 }}>
                    by {r.reviewer_name} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  {r.comment && (
                    <p style={{
                      fontSize: typography.sizes.sm,
                      color: colors.textSecondary,
                      margin: `${spacing['3xs']} 0 0`,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      &ldquo;{r.comment}&rdquo;
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Detail panel */}
          {selectedRating && (
            <div style={{
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              boxShadow: shadows.sm,
              position: 'sticky' as const,
              top: spacing.md,
            }}>
              <h3 style={{ fontSize: typography.sizes.lg, fontWeight: 700, margin: `0 0 ${spacing.sm}`, color: colors.textPrimary }}>
                Review Detail
              </h3>

              <div style={{ fontSize: typography.sizes.base, color: '#f59e0b', letterSpacing: 3, marginBottom: spacing.xs }}>
                {stars(selectedRating.rating)}
                <span style={{ color: colors.textPrimary, fontWeight: 700, marginLeft: spacing.xs, letterSpacing: 0 }}>
                  {selectedRating.rating}/5
                </span>
              </div>

              {selectedRating.comment && (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: '#f9fafb',
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  borderLeft: '3px solid #d1d5db',
                }}>
                  <p style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {selectedRating.comment}
                  </p>
                </div>
              )}

              <div style={{ display: 'grid', gap: spacing['2xs'], fontSize: typography.sizes.sm, marginBottom: spacing.md }}>
                <div>
                  <span style={{ color: colors.textMuted }}>Event: </span>
                  <span style={{ fontWeight: 600 }}>{selectedRating.event_name}</span>
                  {selectedRating.event_token && (
                    <Link
                      href={`/${selectedRating.event_vertical || 'farmers_market'}/events/${selectedRating.event_token}`}
                      style={{ color: colors.primary, marginLeft: spacing['2xs'], fontSize: typography.sizes.xs }}
                      target="_blank"
                    >
                      View →
                    </Link>
                  )}
                </div>
                {selectedRating.event_date && (
                  <div>
                    <span style={{ color: colors.textMuted }}>Event date: </span>
                    <span>{new Date(selectedRating.event_date).toLocaleDateString()}</span>
                  </div>
                )}
                {selectedRating.event_city && (
                  <div>
                    <span style={{ color: colors.textMuted }}>Location: </span>
                    <span>{selectedRating.event_city}, {selectedRating.event_state}</span>
                  </div>
                )}
                <div>
                  <span style={{ color: colors.textMuted }}>Reviewer: </span>
                  <span>{selectedRating.reviewer_name}</span>
                  {selectedRating.reviewer_email && (
                    <span style={{ color: colors.textMuted }}> ({selectedRating.reviewer_email})</span>
                  )}
                </div>
                <div>
                  <span style={{ color: colors.textMuted }}>Submitted: </span>
                  <span>{new Date(selectedRating.created_at).toLocaleString()}</span>
                </div>
                {selectedRating.moderated_at && (
                  <div>
                    <span style={{ color: colors.textMuted }}>Moderated: </span>
                    <span>{new Date(selectedRating.moderated_at).toLocaleString()}</span>
                  </div>
                )}
                <div>
                  <span style={{ color: colors.textMuted }}>Status: </span>
                  <span style={{
                    padding: `2px ${spacing['2xs']}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: 600,
                    backgroundColor: (statusColors[selectedRating.status] || statusColors.pending).bg,
                    color: (statusColors[selectedRating.status] || statusColors.pending).text,
                  }}>
                    {selectedRating.status}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                {selectedRating.status !== 'approved' && (
                  <button
                    onClick={() => updateStatus(selectedRating.id, 'approved')}
                    disabled={actionLoading}
                    style={{
                      padding: `${spacing['2xs']} ${spacing.sm}`,
                      backgroundColor: actionLoading ? '#d1d5db' : '#166534',
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? '…' : '✓ Approve'}
                  </button>
                )}
                {selectedRating.status !== 'hidden' && (
                  <button
                    onClick={() => updateStatus(selectedRating.id, 'hidden')}
                    disabled={actionLoading}
                    style={{
                      padding: `${spacing['2xs']} ${spacing.sm}`,
                      backgroundColor: actionLoading ? '#d1d5db' : '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: 600,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {actionLoading ? '…' : '✕ Hide'}
                  </button>
                )}
                {selectedRating.status !== 'pending' && (
                  <button
                    onClick={() => updateStatus(selectedRating.id, 'pending')}
                    disabled={actionLoading}
                    style={{
                      padding: `${spacing['2xs']} ${spacing.sm}`,
                      backgroundColor: 'transparent',
                      color: colors.textSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Reset to Pending
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
