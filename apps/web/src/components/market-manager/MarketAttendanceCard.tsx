'use client'

import { useEffect, useState } from 'react'
import ManagerCard from './ManagerCard'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'

interface AttendanceRow {
  vendorProfileId: string
  vendorName: string
  boothNumber: string | null
  checkedInAt: string
  checkedOutAt: string | null
  method: string
  distanceFromMarketM: number | null
  withinGeofence: boolean | null
}

// FT (P3c): a truck with a paid spot booking for the date that hasn't checked in.
interface NoShowRow {
  vendorProfileId: string
  vendorName: string
  spotLabel: string | null
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function duration(inAt: string, outAt: string | null): string {
  if (!outAt) return '—'
  const mins = Math.max(0, Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function locationFlag(row: AttendanceRow): { label: string; color: string } {
  if (row.withinGeofence === null) return { label: '— no location', color: colors.textMuted }
  if (row.withinGeofence) return { label: '✓ at venue', color: statusColors.successDark }
  const d = row.distanceFromMarketM != null ? ` (${row.distanceFromMarketM}m)` : ''
  return { label: `⚠ far${d}`, color: statusColors.warningDark }
}

/**
 * Phase D — manager attendance view. Read-only check-in/out for THIS market on
 * a date (default today), scoped server-side by isMarketManager. A date picker
 * supports weekly attendance monitoring.
 */
export default function MarketAttendanceCard({ marketId, vertical }: { marketId: string; vertical: string }) {
  const [date, setDate] = useState<string>('')
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [noShows, setNoShows] = useState<NoShowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvedDate, setResolvedDate] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const q = date ? `?date=${date}` : ''
        const res = await fetch(`/api/market-manager/${marketId}/attendance${q}`)
        if (!res.ok) { if (!cancelled) setRows([]); return }
        const data = await res.json()
        if (cancelled) return
        setRows(Array.isArray(data.attendance) ? data.attendance : [])
        setNoShows(Array.isArray(data.noShows) ? data.noShows : [])
        setResolvedDate(data.date || '')
        if (!date && data.date) setDate(data.date)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [marketId, date])

  return (
    <ManagerCard
      id="attendance"
      title={`${term(vertical, 'vendor')} attendance`}
      description={`Who's checked in today. Pick a date for past ${term(vertical, 'market').toLowerCase()} days. Self-attested; location is advisory.`}
      headerAccessory={
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            color: colors.textPrimary,
            backgroundColor: colors.surfaceElevated,
          }}
        />
      }
    >
      {loading ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
          No check-ins recorded for {resolvedDate || 'this date'}.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {rows.map((r) => {
            const flag = locationFlag(r)
            return (
              <div
                key={r.vendorProfileId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                    {r.vendorName}{r.boothNumber ? ` · ${term(vertical, 'booth').toLowerCase()} ${r.boothNumber}` : ''}
                  </div>
                  <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                    {fmtTime(r.checkedInAt)} – {fmtTime(r.checkedOutAt)} · {duration(r.checkedInAt, r.checkedOutAt)}
                  </div>
                </div>
                <span style={{ fontSize: typography.sizes.xs, color: flag.color, whiteSpace: 'nowrap' }}>
                  {flag.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* FT no-show roster (P3c): booked-but-not-checked-in. */}
      {!loading && noShows.length > 0 && (
        <div style={{ marginTop: spacing.sm }}>
          <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.warningDark, marginBottom: spacing['3xs'] }}>
            Booked but not checked in ({noShows.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
            {noShows.map((n) => (
              <div
                key={n.vendorProfileId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing['3xs']} ${spacing.sm}`,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm,
                }}
              >
                <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                  {n.vendorName}{n.spotLabel ? ` · ${n.spotLabel}` : ''}
                </span>
                <span style={{ fontSize: typography.sizes.xs, color: statusColors.warningDark, whiteSpace: 'nowrap' }}>
                  no-show
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ManagerCard>
  )
}
