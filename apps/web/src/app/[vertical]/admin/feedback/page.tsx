'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

type ShopperCategory = 'suggest_market' | 'technical_problem' | 'feature_request' | 'vendor_concern' | 'general_feedback'
type VendorCategory = 'suggest_market' | 'technical_problem' | 'feature_request' | 'payment_issue' | 'order_management' | 'listing_help' | 'general_feedback'
type FeedbackCategory = ShopperCategory | VendorCategory
type FeedbackStatus = 'new' | 'in_review' | 'resolved' | 'closed'
type FeedbackSource = 'shopper' | 'vendor'

interface Feedback {
  id: string
  user_id: string
  user_email: string
  vendor_name?: string  // For vendor feedback
  vendor_profile_id?: string  // For vendor feedback
  vertical_id: string
  category: FeedbackCategory
  message: string
  market_name?: string
  market_location?: string
  market_schedule?: string
  status: FeedbackStatus
  admin_notes?: string
  created_at: string
  resolved_at?: string
}

interface Counts {
  new: number
  in_review: number
  resolved: number
  closed: number
  total: number
}

const SHOPPER_CATEGORY_CONFIG: Record<ShopperCategory, { label: string; icon: string; color: string; bgColor: string }> = {
  suggest_market: { label: 'Market Suggestion', icon: '🏪', color: '#166534', bgColor: '#dcfce7' },
  technical_problem: { label: 'Technical Problem', icon: '🔧', color: '#991b1b', bgColor: '#fee2e2' },
  feature_request: { label: 'Feature Request', icon: '💡', color: '#1e40af', bgColor: '#dbeafe' },
  vendor_concern: { label: 'Vendor Concern', icon: '⚠️', color: '#92400e', bgColor: '#fef3c7' },
  general_feedback: { label: 'General Feedback', icon: '💬', color: '#6b7280', bgColor: '#f3f4f6' }
}

const VENDOR_CATEGORY_CONFIG: Record<VendorCategory, { label: string; icon: string; color: string; bgColor: string }> = {
  suggest_market: { label: 'Market Suggestion', icon: '🏪', color: '#166534', bgColor: '#dcfce7' },
  technical_problem: { label: 'Technical Problem', icon: '🔧', color: '#991b1b', bgColor: '#fee2e2' },
  listing_help: { label: 'Listing Help', icon: '📦', color: '#7c3aed', bgColor: '#f5f3ff' },
  order_management: { label: 'Order Management', icon: '📋', color: '#0891b2', bgColor: '#cffafe' },
  payment_issue: { label: 'Payment Issue', icon: '💳', color: '#dc2626', bgColor: '#fef2f2' },
  feature_request: { label: 'Feature Request', icon: '💡', color: '#1e40af', bgColor: '#dbeafe' },
  general_feedback: { label: 'General Feedback', icon: '💬', color: '#6b7280', bgColor: '#f3f4f6' }
}

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; color: string; bgColor: string }> = {
  new: { label: 'New', color: '#1e40af', bgColor: '#dbeafe' },
  in_review: { label: 'In Review', color: '#92400e', bgColor: '#fef3c7' },
  resolved: { label: 'Resolved', color: '#166534', bgColor: '#dcfce7' },
  closed: { label: 'Closed', color: '#6b7280', bgColor: '#f3f4f6' }
}

export default function AdminFeedbackPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [feedbackSource, setFeedbackSource] = useState<FeedbackSource>('shopper')
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [counts, setCounts] = useState<Counts>({ new: 0, in_review: 0, resolved: 0, closed: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [updating, setUpdating] = useState(false)

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Get the right category config based on source
  const CATEGORY_CONFIG = feedbackSource === 'vendor' ? VENDOR_CATEGORY_CONFIG : SHOPPER_CATEGORY_CONFIG

  useEffect(() => {
    fetchFeedback()
  }, [vertical, feedbackSource])

  const fetchFeedback = async () => {
    setLoading(true)
    console.log('[Admin Feedback] Fetching feedback for:', { vertical, feedbackSource })
    try {
      const url = `/api/admin/feedback?vertical=${vertical}&source=${feedbackSource}`
      console.log('[Admin Feedback] Calling:', url)
      const res = await fetch(url)
      console.log('[Admin Feedback] Response status:', res.status)
      const data = await res.json()
      console.log('[Admin Feedback] Response data:', data)
      if (res.ok) {
        setFeedback(data.feedback || [])
        setCounts(data.counts || { new: 0, in_review: 0, resolved: 0, closed: 0, total: 0 })
      } else {
        console.error('[Admin Feedback] API error:', data.error)
      }
    } catch (error) {
      console.error('[Admin Feedback] Fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredFeedback = useMemo(() => {
    return feedback.filter(f => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const matchMessage = f.message.toLowerCase().includes(search)
        const matchEmail = f.user_email.toLowerCase().includes(search)
        const matchMarket = f.market_name?.toLowerCase().includes(search)
        if (!matchMessage && !matchEmail && !matchMarket) return false
      }
      return true
    })
  }, [feedback, categoryFilter, statusFilter, searchTerm])

  const handleUpdateStatus = async (id: string, newStatus: FeedbackStatus) => {
    setUpdating(true)
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, source: feedbackSource })
      })

      if (res.ok) {
        await fetchFeedback()
        if (selectedFeedback?.id === id) {
          setSelectedFeedback({ ...selectedFeedback, status: newStatus })
        }
      }
    } catch (error) {
      console.error('Error updating feedback:', error)
    } finally {
      setUpdating(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedFeedback) return

    setUpdating(true)
    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedFeedback.id, admin_notes: adminNotes, source: feedbackSource })
      })

      if (res.ok) {
        await fetchFeedback()
        setSelectedFeedback({ ...selectedFeedback, admin_notes: adminNotes })
      }
    } catch (error) {
      console.error('Error saving notes:', error)
    } finally {
      setUpdating(false)
    }
  }

  const openDetails = (f: Feedback) => {
    setSelectedFeedback(f)
    setAdminNotes(f.admin_notes || '')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase }}>
        <AdminNav type="vertical" vertical={vertical} />
        <div style={{ padding: spacing.xl, textAlign: 'center' }}>
          <p style={{ color: colors.textSecondary }}>Loading feedback...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase }}>
      <AdminNav type="vertical" vertical={vertical} />

      <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: spacing.xl }}>
        {/* Header */}
        <div style={{ marginBottom: spacing.lg }}>
          <h1 style={{ margin: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold }}>
            Feedback Management
          </h1>
          <p style={{ margin: `${spacing.xs} 0 0 0`, color: colors.textSecondary }}>
            View and manage feedback from shoppers and vendors
          </p>
        </div>

        {/* Source Tabs */}
        <div style={{
          display: 'flex',
          gap: spacing.xs,
          marginBottom: spacing.lg,
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: spacing.xs
        }}>
          <button
            onClick={() => {
              setFeedbackSource('shopper')
              setCategoryFilter('all')
              setSelectedFeedback(null)
            }}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: feedbackSource === 'shopper' ? colors.primary : 'transparent',
              color: feedbackSource === 'shopper' ? 'white' : colors.textSecondary,
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs
            }}
          >
            <span>🛒</span> Shopper Feedback
          </button>
          <button
            onClick={() => {
              setFeedbackSource('vendor')
              setCategoryFilter('all')
              setSelectedFeedback(null)
            }}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: feedbackSource === 'vendor' ? colors.accent : 'transparent',
              color: feedbackSource === 'vendor' ? 'white' : colors.textSecondary,
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs
            }}
          >
            <span>🏪</span> Vendor Feedback
          </button>
        </div>

        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: spacing.md,
          marginBottom: spacing.lg
        }}>
          {[
            { label: 'New', count: counts.new, color: '#1e40af', bgColor: '#dbeafe' },
            { label: 'In Review', count: counts.in_review, color: '#92400e', bgColor: '#fef3c7' },
            { label: 'Resolved', count: counts.resolved, color: '#166534', bgColor: '#dcfce7' },
            { label: 'Closed', count: counts.closed, color: '#6b7280', bgColor: '#f3f4f6' }
          ].map(stat => (
            <div
              key={stat.label}
              style={{
                padding: spacing.md,
                backgroundColor: stat.bgColor,
                borderRadius: radius.lg,
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: stat.color }}>
                {stat.count}
              </div>
              <div style={{ fontSize: typography.sizes.sm, color: stat.color, fontWeight: typography.weights.medium }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex',
          gap: spacing.md,
          marginBottom: spacing.lg,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <input
            type="text"
            placeholder="Search feedback..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: spacing.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              minWidth: 200,
              flex: 1
            }}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: spacing.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              backgroundColor: 'white'
            }}
          >
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>{config.icon} {config.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: spacing.sm,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              backgroundColor: 'white'
            }}
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>
        </div>

        {/* Feedback List */}
        {filteredFeedback.length === 0 ? (
          <div style={{
            padding: spacing['3xl'],
            textAlign: 'center',
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.lg,
            border: `1px solid ${colors.border}`
          }}>
            <div style={{ fontSize: '3rem', marginBottom: spacing.md }}>📭</div>
            <h3 style={{ margin: 0, color: colors.textSecondary }}>No feedback found</h3>
            <p style={{ margin: `${spacing.sm} 0 0 0`, color: colors.textMuted }}>
              {searchTerm || categoryFilter !== 'all' || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : `No ${feedbackSource} feedback has been submitted yet`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {filteredFeedback.map(f => {
              const categoryConfig = CATEGORY_CONFIG[f.category as keyof typeof CATEGORY_CONFIG] || { label: f.category, icon: '📝', color: '#6b7280', bgColor: '#f3f4f6' }
              const statusConfig = STATUS_CONFIG[f.status]

              return (
                <div
                  key={f.id}
                  onClick={() => openDetails(f)}
                  style={{
                    padding: spacing.md,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.lg,
                    border: `1px solid ${colors.border}`,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s ease',
                    boxShadow: selectedFeedback?.id === f.id ? shadows.md : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: categoryConfig.bgColor,
                          color: categoryConfig.color,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold
                        }}>
                          {categoryConfig.icon} {categoryConfig.label}
                        </span>
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: statusConfig.bgColor,
                          color: statusConfig.color,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold
                        }}>
                          {statusConfig.label}
                        </span>
                      </div>
                      <p style={{
                        margin: 0,
                        fontSize: typography.sizes.base,
                        color: colors.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {f.message}
                      </p>
                      {f.market_name && (
                        <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.sm, color: colors.primary, fontWeight: typography.weights.medium }}>
                          Market: {f.market_name}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {feedbackSource === 'vendor' && f.vendor_name && (
                        <div style={{
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          color: colors.accent,
                          marginBottom: spacing['3xs']
                        }}>
                          {f.vendor_name}
                        </div>
                      )}
                      <div style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {f.user_email}
                      </div>
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        {new Date(f.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedFeedback && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.md,
            zIndex: 1000
          }}
          onClick={() => setSelectedFeedback(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: radius.lg,
              maxWidth: 600,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: shadows.xl
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: spacing.lg,
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                {(() => {
                  const catConfig = CATEGORY_CONFIG[selectedFeedback.category as keyof typeof CATEGORY_CONFIG] || { label: selectedFeedback.category, icon: '📝', color: '#6b7280', bgColor: '#f3f4f6' }
                  return (
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: catConfig.bgColor,
                      color: catConfig.color,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold
                    }}>
                      {catConfig.icon} {catConfig.label}
                    </span>
                  )
                })()}
              </div>
              <button
                onClick={() => setSelectedFeedback(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: colors.textMuted,
                  padding: spacing.xs,
                  minHeight: 44,
                  minWidth: 44
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: spacing.lg }}>
              {/* From */}
              <div style={{ marginBottom: spacing.md }}>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing['3xs'] }}>
                  From {feedbackSource === 'vendor' ? '(Vendor)' : '(Shopper)'}
                </div>
                {feedbackSource === 'vendor' && selectedFeedback.vendor_name && (
                  <div style={{
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.semibold,
                    color: colors.accent,
                    marginBottom: spacing['3xs']
                  }}>
                    {selectedFeedback.vendor_name}
                  </div>
                )}
                <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.medium }}>
                  {selectedFeedback.user_email}
                </div>
                <div style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                  {new Date(selectedFeedback.created_at).toLocaleString()}
                </div>
              </div>

              {/* Market Info (if applicable) */}
              {selectedFeedback.category === 'suggest_market' && selectedFeedback.market_name && (
                <div style={{
                  padding: spacing.md,
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: radius.md,
                  marginBottom: spacing.md
                }}>
                  <div style={{ fontSize: typography.sizes.xs, color: '#166534', textTransform: 'uppercase', marginBottom: spacing.xs, fontWeight: typography.weights.semibold }}>
                    Suggested Market
                  </div>
                  <div style={{ fontWeight: typography.weights.semibold, marginBottom: spacing['3xs'] }}>
                    {selectedFeedback.market_name}
                  </div>
                  {selectedFeedback.market_location && (
                    <div style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                      📍 {selectedFeedback.market_location}
                    </div>
                  )}
                  {selectedFeedback.market_schedule && (
                    <div style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                      🕐 {selectedFeedback.market_schedule}
                    </div>
                  )}
                </div>
              )}

              {/* Message */}
              <div style={{ marginBottom: spacing.lg }}>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs }}>
                  Message
                </div>
                <div style={{
                  padding: spacing.md,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md,
                  fontSize: typography.sizes.base,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap'
                }}>
                  {selectedFeedback.message}
                </div>
              </div>

              {/* Status Update */}
              <div style={{ marginBottom: spacing.lg }}>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs }}>
                  Status
                </div>
                <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                  {(Object.entries(STATUS_CONFIG) as [FeedbackStatus, typeof STATUS_CONFIG[FeedbackStatus]][]).map(([status, config]) => (
                    <button
                      key={status}
                      onClick={() => handleUpdateStatus(selectedFeedback.id, status)}
                      disabled={updating}
                      style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: selectedFeedback.status === status ? config.bgColor : 'white',
                        color: selectedFeedback.status === status ? config.color : colors.textSecondary,
                        border: `2px solid ${selectedFeedback.status === status ? config.color : colors.border}`,
                        borderRadius: radius.md,
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.medium,
                        cursor: updating ? 'not-allowed' : 'pointer',
                        opacity: updating ? 0.5 : 1
                      }}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin Notes */}
              <div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs }}>
                  Admin Notes (internal)
                </div>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes about this feedback..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: spacing.sm,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    fontSize: typography.sizes.base,
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={updating || adminNotes === (selectedFeedback.admin_notes || '')}
                  style={{
                    marginTop: spacing.sm,
                    padding: `${spacing.xs} ${spacing.md}`,
                    backgroundColor: updating || adminNotes === (selectedFeedback.admin_notes || '') ? colors.textMuted : colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.md,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.medium,
                    cursor: updating || adminNotes === (selectedFeedback.admin_notes || '') ? 'not-allowed' : 'pointer'
                  }}
                >
                  {updating ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
