'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
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
  created_at: string
  verticals: { id: string; name: string; slug: string } | null
  error_logs: { message: string; context: Record<string, unknown> } | null
}

interface ResolutionSummary {
  errorCode: string
  totalAttempts: number
  verifiedCount: number
  failedCount: number
  latestVerified?: {
    description: string
    migrationFile?: string
    verifiedAt: string
  }
  failedApproaches: string[]
}

export default function VerticalAdminErrorsPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [reports, setReports] = useState<ErrorReport[]>([])
  const [errorCounts, setErrorCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedReport, setSelectedReport] = useState<ErrorReport | null>(null)
  const [resolutionSummary, setResolutionSummary] = useState<ResolutionSummary | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetchReports()
  }, [statusFilter, vertical])

  async function fetchReports() {
    try {
      setLoading(true)
      setError(null)

      // Pass vertical slug as verticalId (they're the same in our schema)
      const queryParams = new URLSearchParams()
      queryParams.set('verticalId', vertical) // vertical slug = vertical_id
      if (statusFilter) queryParams.set('status', statusFilter)

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
      setSelectedReport(null)
      fetchReports()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
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
          href={`/${vertical}/admin`}
          style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
        >
          ← Back to Admin Dashboard
        </Link>
        <h1 style={{
          marginTop: spacing.sm,
          marginBottom: spacing['3xs'],
          color: colors.textPrimary,
          fontSize: typography.sizes['2xl'],
        }}>
          Error Reports
        </h1>
        <p style={{ color: colors.textMuted, margin: 0, fontSize: typography.sizes.base }}>
          Review and manage user-reported errors for this vertical
        </p>
      </div>

      {/* Error Summary Cards */}
      {Object.keys(errorCounts).length > 0 && (
        <div style={{
          maxWidth: containers.xl,
          margin: '0 auto',
          marginBottom: spacing.lg,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: spacing.md,
        }}>
          {Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([code, count]) => (
              <div
                key={code}
                style={{
                  padding: spacing.md,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: typography.sizes.sm,
                  color: colors.textSecondary,
                  marginBottom: spacing['2xs'],
                }}>
                  {code}
                </div>
                <div style={{
                  fontSize: typography.sizes['2xl'],
                  fontWeight: typography.weights.bold,
                  color: colors.textPrimary,
                }}>
                  {count}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                }}>
                  reports
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Filters */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        marginBottom: spacing.md,
        display: 'flex',
        gap: spacing.sm,
        alignItems: 'center',
      }}>
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
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="escalated">Escalated</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
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

      {/* Loading state */}
      {loading && (
        <div style={{
          maxWidth: containers.xl,
          margin: '0 auto',
          textAlign: 'center',
          padding: spacing['3xl'],
          color: colors.textMuted,
        }}>
          Loading error reports...
        </div>
      )}

      {/* Reports List */}
      {!loading && (
        <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
          {reports.length === 0 ? (
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {reports.map(report => {
                const statusStyle = statusColors[report.status] || statusColors.pending
                return (
                  <div
                    key={report.id}
                    onClick={() => fetchReportDetails(report.id)}
                    style={{
                      padding: spacing.md,
                      backgroundColor: colors.surfaceElevated,
                      borderRadius: radius.md,
                      border: selectedReport?.id === report.id
                        ? `2px solid ${colors.primary}`
                        : `1px solid ${colors.border}`,
                      cursor: 'pointer',
                      transition: 'box-shadow 0.2s',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: spacing.xs,
                    }}>
                      <div>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.bold,
                          color: colors.textPrimary,
                        }}>
                          {report.error_code || 'Unknown Error'}
                        </span>
                        {report.trace_id && (
                          <span style={{
                            marginLeft: spacing.xs,
                            fontSize: typography.sizes.xs,
                            color: colors.textMuted,
                            fontFamily: 'monospace',
                          }}>
                            Ref: {report.trace_id}
                          </span>
                        )}
                      </div>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text,
                        borderRadius: radius.full,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.medium,
                      }}>
                        {report.status}
                      </span>
                    </div>

                    {report.error_logs?.message && (
                      <p style={{
                        margin: `0 0 ${spacing.xs}`,
                        fontSize: typography.sizes.sm,
                        color: colors.textSecondary,
                      }}>
                        {report.error_logs.message}
                      </p>
                    )}

                    {report.user_description && (
                      <p style={{
                        margin: `0 0 ${spacing.xs}`,
                        fontSize: typography.sizes.sm,
                        color: colors.textMuted,
                        fontStyle: 'italic',
                      }}>
                        &quot;{report.user_description}&quot;
                      </p>
                    )}

                    <div style={{
                      display: 'flex',
                      gap: spacing.md,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                    }}>
                      <span>
                        {new Date(report.created_at).toLocaleString()}
                      </span>
                      {report.reporter_email && (
                        <span>{report.reporter_email}</span>
                      )}
                      {report.page_url && (
                        <span style={{ fontFamily: 'monospace' }}>
                          {report.page_url.replace(/^https?:\/\/[^/]+/, '')}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected Report Detail Panel */}
      {selectedReport && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '500px',
          height: '100vh',
          backgroundColor: colors.surfaceElevated,
          borderLeft: `1px solid ${colors.border}`,
          boxShadow: shadows.lg,
          overflow: 'auto',
          padding: spacing.lg,
          zIndex: 100,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing.md,
          }}>
            <h2 style={{
              margin: 0,
              fontSize: typography.sizes.lg,
              color: colors.textPrimary,
            }}>
              Report Details
            </h2>
            <button
              onClick={() => setSelectedReport(null)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: typography.sizes.xl,
                cursor: 'pointer',
                color: colors.textMuted,
              }}
            >
              ×
            </button>
          </div>

          {/* Error Info */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.sm,
            marginBottom: spacing.md,
            fontFamily: 'monospace',
            fontSize: typography.sizes.sm,
          }}>
            <div><strong>Code:</strong> {selectedReport.error_code || 'Unknown'}</div>
            <div><strong>Ref:</strong> {selectedReport.trace_id || 'N/A'}</div>
            <div><strong>Status:</strong> {selectedReport.status}</div>
            <div><strong>Level:</strong> {selectedReport.escalation_level}</div>
          </div>

          {/* Resolution Summary */}
          {resolutionSummary && (
            <div style={{
              padding: spacing.sm,
              backgroundColor: resolutionSummary.verifiedCount > 0 ? '#dcfce7' : '#fef3c7',
              borderRadius: radius.sm,
              marginBottom: spacing.md,
            }}>
              <h4 style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.sm }}>
                Resolution History for {resolutionSummary.errorCode}
              </h4>
              <div style={{ fontSize: typography.sizes.xs }}>
                <div>Total attempts: {resolutionSummary.totalAttempts}</div>
                <div>Verified fixes: {resolutionSummary.verifiedCount}</div>
                <div>Failed attempts: {resolutionSummary.failedCount}</div>
              </div>
              {resolutionSummary.latestVerified && (
                <div style={{
                  marginTop: spacing.xs,
                  padding: spacing.xs,
                  backgroundColor: 'rgba(255,255,255,0.5)',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                }}>
                  <strong>Verified Fix:</strong><br />
                  {resolutionSummary.latestVerified.description}
                  {resolutionSummary.latestVerified.migrationFile && (
                    <div style={{ fontFamily: 'monospace', marginTop: spacing['3xs'] }}>
                      {resolutionSummary.latestVerified.migrationFile}
                    </div>
                  )}
                </div>
              )}
              {resolutionSummary.failedApproaches.length > 0 && (
                <div style={{ marginTop: spacing.xs, fontSize: typography.sizes.xs }}>
                  <strong>Failed approaches (do not retry):</strong>
                  <ul style={{ margin: `${spacing['2xs']} 0 0`, paddingLeft: spacing.md }}>
                    {resolutionSummary.failedApproaches.map((approach, i) => (
                      <li key={i}>{approach}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* User Description */}
          {selectedReport.user_description && (
            <div style={{ marginBottom: spacing.md }}>
              <h4 style={{ margin: `0 0 ${spacing['2xs']}`, fontSize: typography.sizes.sm }}>
                User Description
              </h4>
              <p style={{
                margin: 0,
                fontSize: typography.sizes.sm,
                color: colors.textSecondary,
                fontStyle: 'italic',
              }}>
                &quot;{selectedReport.user_description}&quot;
              </p>
            </div>
          )}

          {/* Admin Notes */}
          <div style={{ marginBottom: spacing.md }}>
            <h4 style={{ margin: `0 0 ${spacing['2xs']}`, fontSize: typography.sizes.sm }}>
              Add Notes
            </h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this error..."
              rows={3}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            {selectedReport.status === 'pending' && (
              <button
                onClick={() => handleAction(selectedReport.id, 'acknowledge')}
                disabled={actionLoading}
                style={{
                  padding: spacing.xs,
                  backgroundColor: '#dbeafe',
                  color: '#1e40af',
                  border: 'none',
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                }}
              >
                Acknowledge
              </button>
            )}

            {['pending', 'acknowledged'].includes(selectedReport.status) && (
              <button
                onClick={() => handleAction(selectedReport.id, 'escalate')}
                disabled={actionLoading}
                style={{
                  padding: spacing.xs,
                  backgroundColor: '#fce7f3',
                  color: '#9d174d',
                  border: 'none',
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                }}
              >
                Escalate to Platform Admin
              </button>
            )}

            {!['resolved', 'duplicate', 'cannot_reproduce'].includes(selectedReport.status) && (
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
                    fontWeight: typography.weights.medium,
                  }}
                >
                  Mark as Resolved
                </button>

                <button
                  onClick={() => handleAction(selectedReport.id, 'mark_duplicate')}
                  disabled={actionLoading}
                  style={{
                    padding: spacing.xs,
                    backgroundColor: colors.surfaceMuted,
                    color: colors.textSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm,
                  }}
                >
                  Mark as Duplicate
                </button>

                <button
                  onClick={() => handleAction(selectedReport.id, 'cannot_reproduce')}
                  disabled={actionLoading}
                  style={{
                    padding: spacing.xs,
                    backgroundColor: colors.surfaceMuted,
                    color: colors.textSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm,
                  }}
                >
                  Cannot Reproduce
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
