'use client'

/**
 * ErrorReportsAdminPage — the ONE implementation behind /admin/errors and
 * /[vertical]/admin/errors (admin UI rebuild phase 3, merge 5/11, owner
 * 2026-08-31). Both copies already shared GET /api/admin/errors +
 * GET/PATCH /api/admin/errors/[id] (vertical scoping via the verticalId
 * param + RLS; the platform-restricted sub-actions are enforced in the [id]
 * route) — so this is a client-only merge. Superset kept from each:
 *   from the platform copy — escalation Level filter (all-scope only,
 *   default "Escalated to Platform"), vertical chip on rows, escalated-at
 *   line, Copy Context for Developer, breadcrumbs panel, similar-reports
 *   count, Record Fix Attempt form (NOTE: that form was and remains a UI
 *   stub — it posts nothing; carried over unchanged pending owner call);
 *   from the vertical copy — the fuller action set (acknowledge / escalate /
 *   mark duplicate / cannot reproduce, which the API always supported),
 *   message + user-description previews on the cards, reporter email and
 *   page URL lines.
 * One layout: the card list was already single-column at every width; the
 * detail is the inline sticky split panel (admin-detail-split), replacing
 * the vertical copy's fixed right drawer. Back links dropped (AdminShell).
 *
 * `vertical === undefined` = platform view (all reports incl. escalated;
 * the API forces vertical admins to their own vertical + vertical_admin
 * level regardless of what the client sends).
 */

import { useEffect, useState, useCallback } from 'react'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { useStatusBanner } from '@/hooks/useStatusBanner'

interface ErrorReport {
  id: string
  error_code: string | null
  trace_id: string | null
  page_url: string | null
  user_description: string | null
  reporter_email: string | null
  status: string
  escalation_level: string
  vertical_admin_notes: string | null
  platform_admin_notes: string | null
  escalated_at: string | null
  created_at: string
  verticals: { id: string; name: string; slug: string } | null
  error_logs: { message: string; context: Record<string, unknown>; breadcrumbs?: unknown[] } | null
}

interface ResolutionSummary {
  errorCode: string
  totalAttempts: number
  verifiedCount: number
  failedCount: number
  pendingCount?: number
  latestVerified?: {
    description: string
    migrationFile?: string
    verifiedAt: string
  }
  failedApproaches: string[]
}

const statusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  acknowledged: { bg: '#dbeafe', text: '#1e40af' },
  escalated: { bg: '#fce7f3', text: '#9d174d' },
  in_progress: { bg: '#e0e7ff', text: '#3730a3' },
  resolved: { bg: '#dcfce7', text: '#166534' },
  duplicate: { bg: '#f3f4f6', text: '#6b7280' },
  cannot_reproduce: { bg: '#f3f4f6', text: '#6b7280' },
}

export default function ErrorReportsAdminPage({ vertical }: { vertical?: string }) {
  const isPlatform = !vertical
  const [reports, setReports] = useState<ErrorReport[]>([])
  const [errorCounts, setErrorCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  // Platform default mirrors the old dashboard: escalated-to-platform first.
  const [escalationFilter, setEscalationFilter] = useState(isPlatform ? 'platform_admin' : '')
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null)
  const [resolutionSummary, setResolutionSummary] = useState<ResolutionSummary | null>(null)
  const [similarReports, setSimilarReports] = useState<unknown[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [showResolutionForm, setShowResolutionForm] = useState(false)
  const [resolutionForm, setResolutionForm] = useState({ attemptedFix: '', migrationFile: '' })
  const { showBanner, StatusBanner } = useStatusBanner()

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const queryParams = new URLSearchParams()
      if (vertical) queryParams.set('verticalId', vertical) // vertical slug = vertical_id
      if (statusFilter) queryParams.set('status', statusFilter)
      if (isPlatform && escalationFilter) queryParams.set('escalationLevel', escalationFilter)
      const response = await fetch(`/api/admin/errors?${queryParams.toString()}`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch error reports')
      }
      const data = await response.json()
      setReports(data.reports || [])
      setErrorCounts(data.errorCounts || {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [vertical, statusFilter, escalationFilter, isPlatform])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  async function fetchReportDetails(reportId: string) {
    try {
      const response = await fetch(`/api/admin/errors/${reportId}`)
      if (!response.ok) throw new Error('Failed to fetch report details')
      const data = await response.json()
      setSelectedReport(data.report)
      setResolutionSummary(data.resolutionSummary)
      setSimilarReports(data.similarReports || [])
    } catch (err) {
      console.error('Error fetching report details:', err)
    }
  }

  async function handleAction(reportId: string, action: string) {
    try {
      setActionLoading(true)
      const response = await fetch(`/api/admin/errors/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: notes || undefined }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Action failed')
      }
      setNotes('')
      fetchReportDetails(reportId)
      fetchReports()
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  // Carried over from the old platform page UNCHANGED: this form has never
  // posted anywhere — it only shows the banner. Flagged to the owner at merge
  // time; do not quietly wire or remove it without their call.
  function handleRecordResolution() {
    if (!selectedReport?.error_code) {
      showBanner('warning', 'No error code to record resolution for')
      return
    }
    showBanner('success', 'Resolution recorded! Run the migration and verify the fix, then mark verified or failed.')
    setShowResolutionForm(false)
    setResolutionForm({ attemptedFix: '', migrationFile: '' })
  }

  function generateDeveloperContext(): string {
    if (!selectedReport) return ''
    const lines = [
      '## Error Report Context',
      '',
      `**Error Code:** ${selectedReport.error_code || 'Unknown'}`,
      `**Trace ID:** ${selectedReport.trace_id || 'N/A'}`,
      `**Status:** ${selectedReport.status}`,
      `**Vertical:** ${selectedReport.verticals?.name || 'Unknown'}`,
      `**Page URL:** ${selectedReport.page_url || 'N/A'}`,
      `**Reported:** ${new Date(selectedReport.created_at).toLocaleString()}`,
      '',
    ]
    if (selectedReport.user_description) {
      lines.push(`**User Description:** "${selectedReport.user_description}"`, '')
    }
    if (selectedReport.vertical_admin_notes) {
      lines.push(`**Vertical Admin Notes:** ${selectedReport.vertical_admin_notes}`, '')
    }
    if (selectedReport.error_logs?.message) {
      lines.push(`**Error Message:** ${selectedReport.error_logs.message}`, '')
    }
    if (selectedReport.error_logs?.breadcrumbs) {
      lines.push('**Breadcrumbs:**')
      const crumbs = selectedReport.error_logs.breadcrumbs as Array<{ message: string; category: string }>
      crumbs.forEach(c => lines.push(`- [${c.category}] ${c.message}`))
      lines.push('')
    }
    if (resolutionSummary) {
      lines.push('## Resolution History', '')
      lines.push(`- Total attempts: ${resolutionSummary.totalAttempts}`)
      lines.push(`- Verified: ${resolutionSummary.verifiedCount}`)
      lines.push(`- Failed: ${resolutionSummary.failedCount}`, '')
      if (resolutionSummary.latestVerified) {
        lines.push('**Verified Solution:**', resolutionSummary.latestVerified.description)
        if (resolutionSummary.latestVerified.migrationFile) {
          lines.push(`Migration: ${resolutionSummary.latestVerified.migrationFile}`)
        }
        lines.push('')
      }
      if (resolutionSummary.failedApproaches.length > 0) {
        lines.push('**Failed Approaches (do not retry):**')
        resolutionSummary.failedApproaches.forEach(a => lines.push(`- ${a}`))
      }
    }
    return lines.join('\n')
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(generateDeveloperContext())
    showBanner('info', 'Copied to clipboard!')
  }

  const selectStyle = {
    padding: `${spacing['2xs']} ${spacing.xs}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    backgroundColor: colors.surfaceElevated,
  }

  return (
    <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: spacing.md }}>
      <h1 style={{ margin: `0 0 ${spacing['3xs']}`, color: colors.textPrimary, fontSize: typography.sizes['2xl'] }}>
        Error Reports
      </h1>
      <p style={{ color: colors.textMuted, margin: `0 0 ${spacing.md}`, fontSize: typography.sizes.base }}>
        {isPlatform
          ? 'Manage escalated errors across all verticals • Track resolutions • Coordinate fixes'
          : 'Review and manage user-reported errors for this vertical'}
      </p>

      {/* Error frequency summary */}
      {Object.keys(errorCounts).length > 0 && (
        <div style={{ marginBottom: spacing.md }}>
          <h3 style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Error frequency
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: spacing.sm }}>
            {Object.entries(errorCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([code, count]) => (
                <div key={code} style={{ padding: spacing.sm, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontFamily: 'monospace', fontSize: typography.sizes.xs, color: colors.primary, marginBottom: spacing['3xs'] }}>{code}</div>
                  <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>{count}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="admin-filter-bar" style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.md }}>
        {isPlatform && (
          <select value={escalationFilter} onChange={(e) => setEscalationFilter(e.target.value)} style={selectStyle}>
            <option value="">All Levels</option>
            <option value="platform_admin">Escalated to Platform</option>
            <option value="vertical_admin">At Vertical Level</option>
          </select>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="escalated">Escalated</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <button
          onClick={() => fetchReports()}
          style={{ padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: colors.primary, color: colors.textInverse, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: spacing.md, padding: spacing.sm, backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: radius.md, color: '#991b1b', fontSize: typography.sizes.sm }}>
          {error}
        </div>
      )}

      <div className={`admin-detail-split${selectedReport ? ' has-detail' : ''}`} style={{ gap: spacing.md }}>
        {/* Report cards */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: spacing['3xl'], color: colors.textMuted }}>Loading error reports...</div>
          ) : reports.length === 0 ? (
            <div style={{ padding: spacing['3xl'], textAlign: 'center', backgroundColor: colors.surfaceElevated, borderRadius: radius.md, border: `1px dashed ${colors.border}` }}>
              <div style={{ fontSize: 48, marginBottom: spacing.md, opacity: 0.3 }}>✓</div>
              <p style={{ color: colors.textMuted, margin: 0 }}>No error reports matching this filter</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {reports.map(report => {
                const statusStyle = statusColors[report.status] || statusColors.pending
                const isSelected = selectedReport?.id === report.id
                return (
                  <div
                    key={report.id}
                    onClick={() => fetchReportDetails(report.id)}
                    style={{
                      padding: spacing.md,
                      backgroundColor: colors.surfaceElevated,
                      borderRadius: radius.md,
                      border: isSelected ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs, gap: spacing.xs, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                          {report.error_code || 'Unknown Error'}
                        </span>
                        {isPlatform && report.verticals && (
                          <span style={{ padding: `2px ${spacing['2xs']}`, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, fontSize: typography.sizes.xs, color: colors.textSecondary }}>
                            {report.verticals.name}
                          </span>
                        )}
                        {report.trace_id && (
                          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, fontFamily: 'monospace' }}>
                            Ref: {report.trace_id}
                          </span>
                        )}
                      </div>
                      <span style={{ padding: `${spacing['3xs']} ${spacing.xs}`, backgroundColor: statusStyle.bg, color: statusStyle.text, borderRadius: radius.full, fontSize: typography.sizes.xs, fontWeight: typography.weights.medium }}>
                        {report.status}
                      </span>
                    </div>

                    {report.error_logs?.message && (
                      <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {report.error_logs.message}
                      </p>
                    )}
                    {report.user_description && (
                      <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
                        &quot;{report.user_description}&quot;
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: spacing.md, fontSize: typography.sizes.xs, color: colors.textMuted, flexWrap: 'wrap' }}>
                      <span>{new Date(report.created_at).toLocaleString()}</span>
                      {report.escalated_at && (
                        <span style={{ color: '#9d174d' }}>Escalated {new Date(report.escalated_at).toLocaleDateString()}</span>
                      )}
                      {report.reporter_email && <span>{report.reporter_email}</span>}
                      {report.page_url && (
                        <span style={{ fontFamily: 'monospace' }}>{report.page_url.replace(/^https?:\/\/[^/]+/, '')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail panel (inline sticky split — replaces the old fixed drawer) */}
        {selectedReport && (
          <div style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, border: `1px solid ${colors.border}`, boxShadow: shadows.sm, padding: spacing.md, height: 'fit-content', position: 'sticky', top: spacing.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <h3 style={{ margin: 0, fontSize: typography.sizes.base }}>{selectedReport.error_code || 'Error Details'}</h3>
              <button onClick={() => setSelectedReport(null)} style={{ background: 'none', border: 'none', fontSize: typography.sizes.lg, cursor: 'pointer', color: colors.textMuted }}>×</button>
            </div>

            <div style={{ padding: spacing.xs, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, marginBottom: spacing.sm, fontSize: typography.sizes.xs, fontFamily: 'monospace' }}>
              <div>Ref: {selectedReport.trace_id || 'N/A'}</div>
              <div>Status: {selectedReport.status} · Level: {selectedReport.escalation_level}</div>
              <div>Vertical: {selectedReport.verticals?.name || 'Unknown'}</div>
              <div>Reported: {new Date(selectedReport.created_at).toLocaleString()}</div>
            </div>

            <button
              onClick={copyToClipboard}
              style={{ width: '100%', padding: spacing.xs, backgroundColor: colors.primary, color: colors.textInverse, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, marginBottom: spacing.sm }}
            >
              Copy Context for Developer
            </button>

            {resolutionSummary && (
              <div style={{ padding: spacing.xs, backgroundColor: resolutionSummary.verifiedCount > 0 ? colors.primaryLight : '#fef3c7', borderRadius: radius.sm, marginBottom: spacing.sm, fontSize: typography.sizes.xs }}>
                <strong>Resolution history for {resolutionSummary.errorCode}:</strong>
                <div>Attempts: {resolutionSummary.totalAttempts} · Verified: {resolutionSummary.verifiedCount} · Failed: {resolutionSummary.failedCount}</div>
                {resolutionSummary.latestVerified && (
                  <div style={{ marginTop: spacing['2xs'], padding: spacing['2xs'], backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: radius.sm }}>
                    <strong>Verified fix:</strong> {resolutionSummary.latestVerified.description}
                    {resolutionSummary.latestVerified.migrationFile && (
                      <div style={{ fontFamily: 'monospace', marginTop: spacing['3xs'] }}>{resolutionSummary.latestVerified.migrationFile}</div>
                    )}
                  </div>
                )}
                {resolutionSummary.failedApproaches.length > 0 && (
                  <div style={{ marginTop: spacing['2xs'] }}>
                    <strong>Failed approaches (do not retry):</strong>
                    <ul style={{ margin: `${spacing['3xs']} 0 0`, paddingLeft: spacing.md }}>
                      {resolutionSummary.failedApproaches.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {selectedReport.error_logs?.breadcrumbs && (
              <div style={{ marginBottom: spacing.sm }}>
                <strong style={{ fontSize: typography.sizes.xs }}>Breadcrumbs:</strong>
                <div style={{ marginTop: spacing['2xs'], padding: spacing.xs, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, fontSize: typography.sizes.xs, fontFamily: 'monospace', maxHeight: 150, overflow: 'auto' }}>
                  {(selectedReport.error_logs.breadcrumbs as Array<{ category: string; message: string }>).map((c, i) => (
                    <div key={i}>[{c.category}] {c.message}</div>
                  ))}
                </div>
              </div>
            )}

            {selectedReport.user_description && (
              <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: colors.textSecondary, fontStyle: 'italic' }}>
                &quot;{selectedReport.user_description}&quot;
              </p>
            )}

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isPlatform ? 'Add platform admin notes...' : 'Add notes about this error...'}
              rows={2}
              style={{ width: '100%', padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, resize: 'vertical', marginBottom: spacing.sm }}
            />

            {/* Actions — the union both copies' API always supported. The [id]
                route enforces the platform-only rules (e.g. resolving an
                escalated report). */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
              {selectedReport.status === 'pending' && (
                <button onClick={() => handleAction(selectedReport.id, 'acknowledge')} disabled={actionLoading}
                  style={{ padding: spacing.xs, backgroundColor: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                  Acknowledge
                </button>
              )}
              {['pending', 'acknowledged'].includes(selectedReport.status) && selectedReport.escalation_level !== 'platform_admin' && (
                <button onClick={() => handleAction(selectedReport.id, 'escalate')} disabled={actionLoading}
                  style={{ padding: spacing.xs, backgroundColor: '#fce7f3', color: '#9d174d', border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                  Escalate to Platform Admin
                </button>
              )}
              {!['resolved', 'duplicate', 'cannot_reproduce'].includes(selectedReport.status) && (
                <>
                  <button onClick={() => handleAction(selectedReport.id, 'resolve')} disabled={actionLoading}
                    style={{ padding: spacing.xs, backgroundColor: colors.primaryLight, color: colors.primaryDark, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                    Mark as Resolved
                  </button>
                  <button onClick={() => handleAction(selectedReport.id, 'mark_duplicate')} disabled={actionLoading}
                    style={{ padding: spacing.xs, backgroundColor: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm }}>
                    Mark as Duplicate
                  </button>
                  <button onClick={() => handleAction(selectedReport.id, 'cannot_reproduce')} disabled={actionLoading}
                    style={{ padding: spacing.xs, backgroundColor: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm }}>
                    Cannot Reproduce
                  </button>
                  <button onClick={() => setShowResolutionForm(!showResolutionForm)}
                    style={{ padding: spacing.xs, backgroundColor: colors.surfaceMuted, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm }}>
                    {showResolutionForm ? 'Cancel' : 'Record Fix Attempt'}
                  </button>
                </>
              )}
            </div>

            {showResolutionForm && (
              <div style={{ marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm }}>
                <h4 style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.sm }}>Record Fix Attempt</h4>
                <input
                  type="text"
                  placeholder="Migration file (optional)"
                  value={resolutionForm.migrationFile}
                  onChange={(e) => setResolutionForm(f => ({ ...f, migrationFile: e.target.value }))}
                  style={{ width: '100%', padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}
                />
                <textarea
                  placeholder="Describe the fix attempt..."
                  value={resolutionForm.attemptedFix}
                  onChange={(e) => setResolutionForm(f => ({ ...f, attemptedFix: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}
                />
                <button
                  onClick={handleRecordResolution}
                  disabled={!resolutionForm.attemptedFix}
                  style={{ width: '100%', padding: spacing.xs, backgroundColor: colors.primary, color: colors.textInverse, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm }}
                >
                  Record Attempt
                </button>
              </div>
            )}

            {similarReports.length > 0 && (
              <div style={{ marginTop: spacing.sm, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                <strong>Similar reports ({similarReports.length}):</strong> same error code reported at other times/verticals.
              </div>
            )}
          </div>
        )}
      </div>
      <StatusBanner />
    </div>
  )
}
