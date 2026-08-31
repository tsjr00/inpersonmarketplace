'use client'

/**
 * ErrorLogsAdminPage — the ONE implementation behind /admin/error-logs and
 * /[vertical]/admin/error-logs (admin UI rebuild phase 3, merge 4/11, owner
 * 2026-08-31). A true scope-parameterized pair: BOTH copies already called
 * the same GET /api/admin/error-logs (verifyAdminScope resolves platform vs
 * vertical; the vertical query param scopes the rows), so the merge is
 * client-side only. Superset kept from each:
 *   from the platform copy — the 90-day window option and the detail panel's
 *   "Active window" line;
 *   from the vertical copy — the row-list layout (the platform copy was
 *   table-only) and the Error Reports cross-link in the detail panel.
 * One row-list at ALL widths (owner standard); rows click-to-select the
 * sticky detail panel. Back link dropped (AdminShell nav).
 *
 * `vertical === undefined` = platform view (all verticals; untagged errors
 * appear here only).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AdminMobileRow from '@/components/admin/AdminMobileRow'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { useStatusBanner } from '@/hooks/useStatusBanner'

interface ErrorGroup {
  error_code: string
  route: string
  severity: string
  count: number
  first_seen: string
  last_seen: string
}

interface ErrorLogResponse {
  groups: ErrorGroup[]
  total_entries: number
  unique_groups: number
  by_severity: Record<string, number>
  window_days: number
}

const severityColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#fce7f3', text: '#9d174d' },
  high: { bg: '#fee2e2', text: '#991b1b' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  low: { bg: '#dbeafe', text: '#1e40af' },
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const mins = Math.floor((now - then) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function SeverityChip({ severity }: { severity: string }) {
  const c = severityColors[severity] || severityColors.low
  return (
    <span style={{
      display: 'inline-block',
      padding: `2px ${spacing['2xs']}`,
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      fontWeight: 600,
      backgroundColor: c.bg,
      color: c.text,
    }}>
      {severity}
    </span>
  )
}

export default function ErrorLogsAdminPage({ vertical }: { vertical?: string }) {
  const [data, setData] = useState<ErrorLogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [severityFilter, setSeverityFilter] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<ErrorGroup | null>(null)
  const { showBanner, StatusBanner } = useStatusBanner()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ days: String(days) })
        if (vertical) params.set('vertical', vertical)
        if (severityFilter) params.set('severity', severityFilter)
        const res = await fetch(`/api/admin/error-logs?${params}`)
        if (!cancelled && res.ok) {
          const json: ErrorLogResponse = await res.json()
          if (!cancelled) setData(json)
        } else if (!cancelled) {
          showBanner('error', 'Failed to load error logs')
        }
      } catch {
        if (!cancelled) showBanner('error', 'Network error loading error logs')
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [days, severityFilter, vertical]) // eslint-disable-line react-hooks/exhaustive-deps

  const cardStyle = {
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    boxShadow: shadows.sm,
    textAlign: 'center' as const,
  }

  const errorReportsHref = vertical ? `/${vertical}/admin/errors` : '/admin/errors'
  const selectStyle = {
    padding: `${spacing['2xs']} ${spacing.xs}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    backgroundColor: colors.inputBg,
  }

  return (
    <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: spacing.md }}>
      <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: `0 0 ${spacing.xs}` }}>
        Error Logs
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.md}` }}>
        {vertical
          ? 'Errors from this vertical’s API routes. Errors without a vertical tag appear in the platform admin dashboard only.'
          : 'Automated error tracking from API routes (Protocol 8), all verticals plus untagged errors.'}
      </p>

      <StatusBanner />

      {/* Filters */}
      <div className="admin-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={selectStyle}>
          <option value={1}>Last 24 hours</option>
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={selectStyle}>
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: spacing.xl, color: colors.textMuted }}>Loading error logs…</p>
      ) : !data || data.groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: spacing.xl, backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, boxShadow: shadows.sm }}>
          <p style={{ fontSize: '2rem', margin: `0 0 ${spacing.xs}` }}>✅</p>
          <p style={{ fontSize: typography.sizes.base, color: colors.textSecondary, margin: 0 }}>
            No errors in the last {days} day{days > 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="admin-grid-4" style={{ display: 'grid', gap: spacing.sm, marginBottom: spacing.md }}>
            <div style={cardStyle}>
              <p style={{ fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>{data.total_entries}</p>
              <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: 0 }}>Total entries</p>
            </div>
            <div style={cardStyle}>
              <p style={{ fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: 0 }}>{data.unique_groups}</p>
              <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: 0 }}>Unique error groups</p>
            </div>
            <div style={cardStyle}>
              <p style={{ fontSize: typography.sizes['2xl'], fontWeight: 700, color: '#991b1b', margin: 0 }}>
                {(data.by_severity.critical || 0) + (data.by_severity.high || 0)}
              </p>
              <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: 0 }}>Critical + High</p>
            </div>
            <div style={cardStyle}>
              <p style={{ fontSize: typography.sizes['2xl'], fontWeight: 700, color: '#92400e', margin: 0 }}>
                {(data.by_severity.medium || 0) + (data.by_severity.low || 0)}
              </p>
              <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: 0 }}>Medium + Low</p>
            </div>
          </div>

          {/* Row list + detail panel */}
          <div className={`admin-detail-split ${selectedGroup ? 'has-detail' : ''}`}>
            <div style={{ backgroundColor: 'white', borderRadius: radius.md, boxShadow: shadows.sm }}>
              {data.groups.map((g, i) => {
                const isSelected = selectedGroup === g
                return (
                  <AdminMobileRow
                    key={i}
                    onClick={() => setSelectedGroup(isSelected ? null : g)}
                    selected={isSelected}
                    title={g.error_code || '(no code)'}
                    statusBadge={<SeverityChip severity={g.severity} />}
                    secondary={
                      <>
                        <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{g.route || '—'}</span>
                        {' · '}
                        <span style={{ fontWeight: 700 }}>{g.count}</span> occurrence{g.count !== 1 ? 's' : ''}
                        {' · '}
                        last seen {timeAgo(g.last_seen)}
                      </>
                    }
                  />
                )
              })}
            </div>

            {selectedGroup && (
              <div style={{ padding: spacing.md, backgroundColor: colors.surfaceElevated, borderRadius: radius.md, boxShadow: shadows.sm, position: 'sticky' as const, top: spacing.md, alignSelf: 'start' }}>
                <h3 style={{ fontSize: typography.sizes.lg, fontWeight: 700, margin: `0 0 ${spacing.sm}`, color: colors.textPrimary }}>
                  {selectedGroup.error_code || '(no code)'}
                </h3>
                <div style={{ display: 'grid', gap: spacing.xs, fontSize: typography.sizes.sm }}>
                  <div><span style={{ color: colors.textMuted }}>Route: </span><span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedGroup.route || '—'}</span></div>
                  <div><span style={{ color: colors.textMuted }}>Severity: </span><SeverityChip severity={selectedGroup.severity} /></div>
                  <div><span style={{ color: colors.textMuted }}>Occurrences: </span><span style={{ fontWeight: 700 }}>{selectedGroup.count}</span></div>
                  <div><span style={{ color: colors.textMuted }}>First seen: </span><span>{new Date(selectedGroup.first_seen).toLocaleString()}</span></div>
                  <div><span style={{ color: colors.textMuted }}>Last seen: </span><span>{new Date(selectedGroup.last_seen).toLocaleString()}</span></div>
                  <div>
                    <span style={{ color: colors.textMuted }}>Active window: </span>
                    <span>{Math.ceil((new Date(selectedGroup.last_seen).getTime() - new Date(selectedGroup.first_seen).getTime()) / 86400000)} day(s)</span>
                  </div>
                </div>
                <div style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTop: `1px solid ${colors.border}` }}>
                  <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: 0 }}>
                    Check the <Link href={errorReportsHref} style={{ color: colors.primary }}>Error Reports</Link> page
                    for user-submitted reports with this code, or query <code>error_logs</code> directly for full
                    stack traces and breadcrumbs.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
