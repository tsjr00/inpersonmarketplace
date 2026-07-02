'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius, containers, statusColors } from '@/lib/design-tokens'

interface LogRow {
  date: string
  parkName: string | null
  address: string | null
  checkedInAt: string | null
  checkedOutAt: string | null
  boothNumber: string | null
  locationCaptured: boolean
  withinGeofence: boolean | null
  attestationVersion: string | null
}

const COMPLIANCE_BLURB =
  "A record of where and when you operated, from your check-ins. Food trucks can use this to meet state location-logging requirements. Enable location at check-in so each entry includes GPS coordinates. This is a convenience record, not legal advice."

function fmtDate(date: string): string {
  // Parse as LOCAL midnight to avoid an off-by-one from UTC parsing of YYYY-MM-DD.
  const parts = date.split('-')
  if (parts.length !== 3) return date
  const [y, m, d] = parts.map((p) => parseInt(p, 10))
  if (!y || !m || !d) return date
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsv(rows: LogRow[]): string {
  const headers = [
    'Date',
    'Park',
    'Address',
    'Checked In',
    'Checked Out',
    'Spot',
    'Location Captured',
    'Within Geofence',
    'Attestation Version',
  ]
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([
      fmtDate(r.date),
      r.parkName ?? '',
      r.address ?? '',
      fmtTime(r.checkedInAt),
      fmtTime(r.checkedOutAt),
      r.boothNumber ?? '',
      r.locationCaptured ? 'yes' : 'no',
      r.withinGeofence === null ? '' : r.withinGeofence ? 'yes' : 'no',
      r.attestationVersion ?? '',
    ].map(csvCell).join(','))
  }
  return lines.join('\r\n')
}

const cellStyle: React.CSSProperties = {
  padding: `${spacing['2xs']} ${spacing.xs}`,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary,
  borderBottom: `1px solid ${colors.borderMuted}`,
  textAlign: 'left',
  verticalAlign: 'top',
}

const headStyle: React.CSSProperties = {
  padding: `${spacing['2xs']} ${spacing.xs}`,
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.semibold,
  color: colors.textSecondary,
  borderBottom: `2px solid ${colors.border}`,
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

/**
 * FT food-truck "location log" — a compliance-oriented view of the vendor's own
 * check-in history with a client-side CSV export. FT-only plain language
 * ("park", "spot", "food truck") — no term() system.
 */
export default function LocationLogView({ vertical }: { vertical: string }) {
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/vendor/checkins/log?vertical=${vertical}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setRows(Array.isArray(data.log) ? data.log : [])
      } catch {
        // non-blocking — table just stays empty
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [vertical])

  function downloadCsv() {
    if (rows.length === 0) return
    const csv = buildCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'location-log.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <a
        href={`/${vertical}/vendor/dashboard`}
        style={{
          display: 'inline-block',
          marginBottom: spacing.sm,
          fontSize: typography.sizes.sm,
          color: colors.primary,
          textDecoration: 'none',
        }}
      >
        ← Back to dashboard
      </a>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
          flexWrap: 'wrap',
          marginBottom: spacing.xs,
        }}
      >
        <h1 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary, margin: 0 }}>
          My location log
        </h1>
        <button
          onClick={downloadCsv}
          disabled={rows.length === 0}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: rows.length === 0 ? colors.surfaceMuted : colors.primary,
            color: rows.length === 0 ? colors.textMuted : colors.surfaceElevated,
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Download CSV
        </button>
      </div>

      <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, lineHeight: typography.leading.normal, marginTop: 0, marginBottom: spacing.md }}>
        {COMPLIANCE_BLURB}
      </p>

      {loading ? (
        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
          No check-ins recorded yet. Check in from your dashboard when you&apos;re at a park.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headStyle}>Date</th>
                <th style={headStyle}>Park</th>
                <th style={headStyle}>Address</th>
                <th style={headStyle}>Checked in</th>
                <th style={headStyle}>Checked out</th>
                <th style={headStyle}>Location</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                  <td style={cellStyle}>
                    {r.parkName ?? '—'}
                    {r.boothNumber ? (
                      <span style={{ color: colors.textMuted }}> (spot {r.boothNumber})</span>
                    ) : null}
                  </td>
                  <td style={cellStyle}>{r.address ?? '—'}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{fmtTime(r.checkedInAt)}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{fmtTime(r.checkedOutAt)}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                    {r.locationCaptured ? (
                      <span style={{ color: statusColors.success, fontWeight: typography.weights.medium }}>
                        ✓ GPS
                        {r.withinGeofence === true ? (
                          <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal }}> (at venue)</span>
                        ) : r.withinGeofence === false ? (
                          <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal }}> (off-site)</span>
                        ) : null}
                      </span>
                    ) : (
                      <span style={{ color: statusColors.warning, fontWeight: typography.weights.medium }}>⚠ none</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
