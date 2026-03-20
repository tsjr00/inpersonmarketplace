'use client'

import { useState, useEffect, useCallback } from 'react'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'

interface OrderIssue {
  id: string
  order_id: string
  order_number: string
  listing_title: string
  vertical_id: string
  market_name: string
  quantity: number
  subtotal_cents: number
  order_item_status: string
  issue_reported_at: string
  issue_reported_by: string
  issue_description: string
  issue_status: string
  issue_admin_notes: string | null
  issue_resolved_at: string | null
  buyer_email: string
  buyer_name: string
  vendor_name: string
  order_created_at: string
}

interface Counts {
  new: number
  in_review: number
  resolved: number
  closed: number
  total: number
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  in_review: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  resolved: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  closed: { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
}

export default function AdminOrderIssuesPage() {
  const [issues, setIssues] = useState<OrderIssue[]>([])
  const [counts, setCounts] = useState<Counts>({ new: 0, in_review: 0, resolved: 0, closed: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('new')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const fetchIssues = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/order-issues?${params}`)
      if (res.ok) {
        const data = await res.json()
        setIssues(data.issues || [])
        setCounts(data.counts || { new: 0, in_review: 0, resolved: 0, closed: 0, total: 0 })
      }
    } catch (err) {
      console.error('Failed to fetch issues:', err)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchIssues() }, [fetchIssues])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const handleSave = async (issueId: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/order-issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: issueId,
          issue_status: editStatus || undefined,
          issue_admin_notes: editNotes || undefined,
        })
      })
      if (res.ok) {
        setToast({ message: 'Issue updated', type: 'success' })
        setEditingId(null)
        fetchIssues()
      } else {
        const data = await res.json()
        setToast({ message: data.error || 'Failed to update', type: 'error' })
      }
    } catch {
      setToast({ message: 'Error updating issue', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const filterTabs = [
    { key: 'new', label: 'New', count: counts.new },
    { key: 'in_review', label: 'In Review', count: counts.in_review },
    { key: 'resolved', label: 'Resolved', count: counts.resolved },
    { key: 'all', label: 'All', count: counts.total },
  ]

  return (
    <div style={{ maxWidth: containers.wide, margin: '0 auto' }}>
      <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.md }}>
        Order Issues
      </h1>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: spacing.xs,
          marginBottom: spacing.sm,
          backgroundColor: toast.type === 'success' ? '#d1fae5' : '#fee2e2',
          border: `1px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
          borderRadius: radius.sm,
          color: toast.type === 'success' ? '#065f46' : '#991b1b',
          fontSize: typography.sizes.sm
        }}>
          {toast.message}
        </div>
      )}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: spacing['2xs'], marginBottom: spacing.md, flexWrap: 'wrap' }}>
        {filterTabs.map(tab => {
          const active = statusFilter === tab.key
          const sc = STATUS_COLORS[tab.key] || STATUS_COLORS.closed
          return (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setLoading(true) }}
              style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: active ? sc.bg : 'white',
                color: active ? sc.text : colors.textMuted,
                border: `1px solid ${active ? sc.border : colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: active ? typography.weights.semibold : typography.weights.normal,
                cursor: 'pointer',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.textMuted }}>Loading...</div>
      ) : issues.length === 0 ? (
        <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.textMuted }}>
          No {statusFilter === 'all' ? '' : statusFilter.replace('_', ' ')} issues found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {issues.map(issue => {
            const sc = STATUS_COLORS[issue.issue_status] || STATUS_COLORS.new
            const isEditing = editingId === issue.id

            return (
              <div key={issue.id} style={{
                border: `1px solid ${colors.border}`,
                borderLeft: `4px solid ${sc.border}`,
                borderRadius: radius.md,
                padding: spacing.sm,
                backgroundColor: 'white',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing['2xs'] }}>
                  <div>
                    <span style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                      {issue.order_number}
                    </span>
                    <span style={{
                      marginLeft: spacing['2xs'],
                      padding: `2px ${spacing['2xs']}`,
                      backgroundColor: sc.bg,
                      color: sc.text,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                    }}>
                      {issue.issue_status.replace('_', ' ')}
                    </span>
                    <span style={{
                      marginLeft: spacing['2xs'],
                      padding: `2px ${spacing['2xs']}`,
                      backgroundColor: '#f3f4f6',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                    }}>
                      {issue.vertical_id === 'food_trucks' ? 'FT' : 'FM'}
                    </span>
                  </div>
                  <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                    {formatDate(issue.issue_reported_at)}
                  </span>
                </div>

                {/* Item & parties */}
                <div style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing['2xs'] }}>
                  <strong>{issue.listing_title}</strong> (x{issue.quantity}) — {formatPrice(issue.subtotal_cents)}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['2xs'] }}>
                  Buyer: {issue.buyer_name} ({issue.buyer_email}) | Vendor: {issue.vendor_name} | {issue.market_name}
                </div>

                {/* Issue description */}
                <div style={{
                  padding: spacing['2xs'],
                  backgroundColor: '#fef3c7',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  color: '#92400e',
                  marginBottom: spacing['2xs'],
                  fontStyle: 'italic',
                }}>
                  &ldquo;{issue.issue_description}&rdquo;
                </div>

                {/* Admin notes */}
                {issue.issue_admin_notes && !isEditing && (
                  <div style={{
                    padding: spacing['2xs'],
                    backgroundColor: '#eff6ff',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    color: '#1e40af',
                    marginBottom: spacing['2xs'],
                  }}>
                    Admin notes: {issue.issue_admin_notes}
                  </div>
                )}

                {/* Edit form */}
                {isEditing ? (
                  <div style={{ marginTop: spacing['2xs'], display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      style={{
                        padding: spacing['2xs'],
                        border: `1px solid ${colors.border}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.sm,
                      }}
                    >
                      <option value="new">New</option>
                      <option value="in_review">In Review</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <textarea
                      value={editNotes}
                      onChange={e => setEditNotes(e.target.value)}
                      placeholder="Admin notes..."
                      rows={2}
                      style={{
                        padding: spacing['2xs'],
                        border: `1px solid ${colors.border}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.sm,
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'flex', gap: spacing['2xs'] }}>
                      <button
                        onClick={() => handleSave(issue.id)}
                        disabled={saving}
                        style={{
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          cursor: saving ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          backgroundColor: 'white',
                          color: colors.textMuted,
                          border: `1px solid ${colors.border}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(issue.id)
                      setEditStatus(issue.issue_status)
                      setEditNotes(issue.issue_admin_notes || '')
                    }}
                    style={{
                      marginTop: spacing['3xs'],
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: 'white',
                      color: '#3b82f6',
                      border: `1px solid #3b82f6`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: 'pointer',
                    }}
                  >
                    Review / Update
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
