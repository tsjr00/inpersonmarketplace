'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
  error_logs: { message: string; context: Record<string, unknown>; breadcrumbs: unknown[] } | null
}

interface ResolutionSummary {
  errorCode: string
  totalAttempts: number
  verifiedCount: number
  failedCount: number
  pendingCount: number
  latestVerified?: {
    description: string
    migrationFile?: string
    verifiedAt: string
  }
  failedApproaches: string[]
}

export default function PlatformAdminErrorsPage() {
  const [reports, setReports] = useState<ErrorReport[]>([])
  const [errorCounts, setErrorCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [escalationFilter, setEscalationFilter] = useState<string>('platform_admin')
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null)
  const [resolutionSummary, setResolutionSummary] = useState<ResolutionSummary | null>(null)
  const [similarReports, setSimilarReports] = useState<unknown[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [showResolutionForm, setShowResolutionForm] = useState(false)
  const [resolutionForm, setResolutionForm] = useState({
    attemptedFix: '',
    migrationFile: '',
    codeChanges: '',
  })

  useEffect(() => {
    fetchReports()
  }, [statusFilter, escalationFilter])

  async function fetchReports() {
    try {
      setLoading(true)
      setError(null)

      const queryParams = new URLSearchParams()
      if (statusFilter) queryParams.set('status', statusFilter)
      if (escalationFilter) queryParams.set('escalationLevel', escalationFilter)

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
  }

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
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRecordResolution() {
    if (!selectedReport?.error_code) {
      alert('No error code to record resolution for')
      return
    }

    try {
      setActionLoading(true)
      // This would call a new API endpoint to record the resolution
      // For now, we'll just show the data that would be sent
      console.log('Recording resolution:', {
        errorCode: selectedReport.error_code,
        traceId: selectedReport.trace_id,
        ...resolutionForm,
      })

      alert('Resolution recorded! Run the migration and verify the fix, then mark verified or failed.')
      setShowResolutionForm(false)
      setResolutionForm({ attemptedFix: '', migrationFile: '', codeChanges: '' })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to record resolution')
    } finally {
      setActionLoading(false)
    }
  }

  // Generate developer-ready context for copying
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
      lines.push(`**User Description:** "${selectedReport.user_description}"`)
      lines.push('')
    }

    if (selectedReport.vertical_admin_notes) {
      lines.push(`**Vertical Admin Notes:** ${selectedReport.vertical_admin_notes}`)
      lines.push('')
    }

    if (selectedReport.error_logs?.message) {
      lines.push(`**Error Message:** ${selectedReport.error_logs.message}`)
      lines.push('')
    }

    if (selectedReport.error_logs?.breadcrumbs) {
      lines.push('**Breadcrumbs:**')
      const crumbs = selectedReport.error_logs.breadcrumbs as Array<{ message: string; category: string }>
      crumbs.forEach(c => {
        lines.push(`- [${c.category}] ${c.message}`)
      })
      lines.push('')
    }

    if (resolutionSummary) {
      lines.push('## Resolution History')
      lines.push('')
      lines.push(`- Total attempts: ${resolutionSummary.totalAttempts}`)
      lines.push(`- Verified: ${resolutionSummary.verifiedCount}`)
      lines.push(`- Failed: ${resolutionSummary.failedCount}`)
      lines.push('')

      if (resolutionSummary.latestVerified) {
        lines.push('**Verified Solution:**')
        lines.push(resolutionSummary.latestVerified.description)
        if (resolutionSummary.latestVerified.migrationFile) {
          lines.push(`Migration: ${resolutionSummary.latestVerified.migrationFile}`)
        }
        lines.push('')
      }

      if (resolutionSummary.failedApproaches.length > 0) {
        lines.push('**Failed Approaches (do not retry):**')
        resolutionSummary.failedApproaches.forEach(a => {
          lines.push(`- ${a}`)
        })
      }
    }

    return lines.join('\n')
  }

  function copyToClipboard() {
    const text = generateDeveloperContext()
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
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

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: spacing.xl,
    }}>
      {/* Header */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        marginBottom: spacing.lg,
      }}>
        <Link
          href="/admin"
          style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
        >
          ← Back to Platform Admin
        </Link>
        <h1 style={{
          marginTop: spacing.sm,
          marginBottom: spacing['3xs'],
          color: colors.textPrimary,
          fontSize: typography.sizes['2xl'],
        }}>
          Platform Error Dashboard
        </h1>
        <p style={{ color: colors.textMuted, margin: 0, fontSize: typography.sizes.base }}>
          Manage escalated errors across all verticals • Track resolutions • Coordinate fixes
        </p>
      </div>

      {/* Error Summary Cards */}
      {Object.keys(errorCounts).length > 0 && (
        <div style={{
          maxWidth: containers.xl,
          margin: '0 auto',
          marginBottom: spacing.lg,
        }}>
          <h3 style={{
            margin: `0 0 ${spacing.sm}`,
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            Error Frequency Across All Verticals
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: spacing.sm,
          }}>
            {Object.entries(errorCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([code, count]) => (
                <div
                  key={code}
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.md,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: typography.sizes.xs,
                    color: colors.primary,
                    marginBottom: spacing['3xs'],
                  }}>
                    {code}
                  </div>
                  <div style={{
                    fontSize: typography.sizes.xl,
                    fontWeight: typography.weights.bold,
                    color: colors.textPrimary,
                  }}>
                    {count}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        marginBottom: spacing.md,
        display: 'flex',
        gap: spacing.md,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
          <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
            Level:
          </label>
          <select
            value={escalationFilter}
            onChange={(e) => setEscalationFilter(e.target.value)}
            style={{
              padding: `${spacing['2xs']} ${spacing.xs}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <option value="">All Levels</option>
            <option value="platform_admin">Escalated to Platform</option>
            <option value="vertical_admin">At Vertical Level</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
          <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
            Status:
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: `${spacing['2xs']} ${spacing.xs}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="escalated">Escalated</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <button
          onClick={() => fetchReports()}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: colors.primary,
            color: colors.textInverse,
            border: 'none',
            borderRadius: radius.sm,
            cursor: 'pointer',
            fontSize: typography.sizes.sm,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          maxWidth: containers.xl,
          margin: `0 auto ${spacing.md}`,
          padding: spacing.sm,
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: radius.md,
          color: '#991b1b',
          fontSize: typography.sizes.sm,
        }}>
          {error}
        </div>
      )}

      {/* Main content area */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: selectedReport ? '1fr 450px' : '1fr',
        gap: spacing.lg,
      }}>
        {/* Reports List */}
        <div>
          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: spacing['3xl'],
              color: colors.textMuted,
            }}>
              Loading error reports...
            </div>
          ) : reports.length === 0 ? (
            <div style={{
              padding: spacing['3xl'],
              textAlign: 'center',
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px dashed ${colors.border}`,
            }}>
              <div style={{ fontSize: 48, marginBottom: spacing.md, opacity: 0.3 }}>✓</div>
              <p style={{ color: colors.textMuted, margin: 0 }}>
                No error reports matching this filter
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {reports.map(report => {
                const statusStyle = statusColors[report.status] || statusColors.pending
                return (
                  <div
                    key={report.id}
                    onClick={() => fetchReportDetails(report.id)}
                    style={{
                      padding: spacing.sm,
                      backgroundColor: selectedReport?.id === report.id
                        ? colors.primaryLight
                        : colors.surfaceElevated,
                      borderRadius: radius.md,
                      border: selectedReport?.id === report.id
                        ? `2px solid ${colors.primary}`
                        : `1px solid ${colors.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: spacing['2xs'],
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.bold,
                          color: colors.textPrimary,
                        }}>
                          {report.error_code || 'Unknown'}
                        </span>
                        {report.verticals && (
                          <span style={{
                            padding: `2px ${spacing['2xs']}`,
                            backgroundColor: colors.surfaceMuted,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            color: colors.textSecondary,
                          }}>
                            {report.verticals.name}
                          </span>
                        )}
                      </div>
                      <span style={{
                        padding: `2px ${spacing.xs}`,
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text,
                        borderRadius: radius.full,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.medium,
                      }}>
                        {report.status}
                      </span>
                    </div>

                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      display: 'flex',
                      gap: spacing.sm,
                    }}>
                      <span>{new Date(report.created_at).toLocaleDateString()}</span>
                      {report.escalated_at && (
                        <span style={{ color: '#9d174d' }}>
                          Escalated {new Date(report.escalated_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedReport && (
          <div style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            padding: spacing.md,
            height: 'fit-content',
            position: 'sticky',
            top: spacing.lg,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.md,
            }}>
              <h3 style={{ margin: 0, fontSize: typography.sizes.base }}>
                {selectedReport.error_code || 'Error Details'}
              </h3>
              <button
                onClick={() => setSelectedReport(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: typography.sizes.lg,
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                ×
              </button>
            </div>

            {/* Quick Info */}
            <div style={{
              padding: spacing.xs,
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.sm,
              marginBottom: spacing.sm,
              fontSize: typography.sizes.xs,
              fontFamily: 'monospace',
            }}>
              <div>Ref: {selectedReport.trace_id || 'N/A'}</div>
              <div>Vertical: {selectedReport.verticals?.name || 'Unknown'}</div>
              <div>Reported: {new Date(selectedReport.created_at).toLocaleString()}</div>
            </div>

            {/* Copy Context Button */}
            <button
              onClick={copyToClipboard}
              style={{
                width: '100%',
                padding: spacing.xs,
                backgroundColor: colors.primary,
                color: colors.textInverse,
                border: 'none',
                borderRadius: radius.sm,
                cursor: 'pointer',
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                marginBottom: spacing.sm,
              }}
            >
              Copy Context for Developer
            </button>

            {/* Resolution Summary */}
            {resolutionSummary && (
              <div style={{
                padding: spacing.xs,
                backgroundColor: resolutionSummary.verifiedCount > 0 ? '#dcfce7' : '#fef3c7',
                borderRadius: radius.sm,
                marginBottom: spacing.sm,
                fontSize: typography.sizes.xs,
              }}>
                <strong>Resolution History:</strong>
                <div>Verified: {resolutionSummary.verifiedCount} | Failed: {resolutionSummary.failedCount}</div>
                {resolutionSummary.latestVerified && (
                  <div style={{ marginTop: spacing['2xs'] }}>
                    <strong>Fix:</strong> {resolutionSummary.latestVerified.description}
                  </div>
                )}
              </div>
            )}

            {/* Breadcrumbs */}
            {selectedReport.error_logs?.breadcrumbs && (
              <div style={{ marginBottom: spacing.sm }}>
                <strong style={{ fontSize: typography.sizes.xs }}>Breadcrumbs:</strong>
                <div style={{
                  marginTop: spacing['2xs'],
                  padding: spacing.xs,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  fontFamily: 'monospace',
                  maxHeight: '150px',
                  overflow: 'auto',
                }}>
                  {(selectedReport.error_logs.breadcrumbs as Array<{ category: string; message: string }>).map((c, i) => (
                    <div key={i}>[{c.category}] {c.message}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: spacing.sm }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add platform admin notes..."
                rows={2}
                style={{
                  width: '100%',
                  padding: spacing.xs,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
              {!['resolved', 'duplicate'].includes(selectedReport.status) && (
                <>
                  <button
                    onClick={() => handleAction(selectedReport.id, 'resolve')}
                    disabled={actionLoading}
                    style={{
                      padding: spacing.xs,
                      backgroundColor: '#dcfce7',
                      color: '#166534',
                      border: 'none',
                      borderRadius: radius.sm,
                      cursor: 'pointer',
                      fontSize: typography.sizes.sm,
                    }}
                  >
                    Mark Resolved
                  </button>
                  <button
                    onClick={() => setShowResolutionForm(!showResolutionForm)}
                    style={{
                      padding: spacing.xs,
                      backgroundColor: colors.surfaceMuted,
                      color: colors.textPrimary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      cursor: 'pointer',
                      fontSize: typography.sizes.sm,
                    }}
                  >
                    {showResolutionForm ? 'Cancel' : 'Record Fix Attempt'}
                  </button>
                </>
              )}
            </div>

            {/* Resolution Form */}
            {showResolutionForm && (
              <div style={{
                marginTop: spacing.sm,
                padding: spacing.sm,
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.sm,
              }}>
                <h4 style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.sm }}>
                  Record Fix Attempt
                </h4>
                <input
                  type="text"
                  placeholder="Migration file (e.g., 20260126_013_fix.sql)"
                  value={resolutionForm.migrationFile}
                  onChange={(e) => setResolutionForm(f => ({ ...f, migrationFile: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: spacing.xs,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing.xs,
                  }}
                />
                <textarea
                  placeholder="Describe the fix attempt..."
                  value={resolutionForm.attemptedFix}
                  onChange={(e) => setResolutionForm(f => ({ ...f, attemptedFix: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: spacing.xs,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.sm,
                    marginBottom: spacing.xs,
                  }}
                />
                <button
                  onClick={handleRecordResolution}
                  disabled={!resolutionForm.attemptedFix}
                  style={{
                    width: '100%',
                    padding: spacing.xs,
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    border: 'none',
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm,
                  }}
                >
                  Record Attempt
                </button>
              </div>
            )}

            {/* Similar Reports */}
            {similarReports.length > 0 && (
              <div style={{ marginTop: spacing.sm }}>
                <strong style={{ fontSize: typography.sizes.xs }}>
                  Similar Reports ({similarReports.length}):
                </strong>
                <div style={{
                  marginTop: spacing['2xs'],
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                }}>
                  Same error code reported across other verticals/times
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
