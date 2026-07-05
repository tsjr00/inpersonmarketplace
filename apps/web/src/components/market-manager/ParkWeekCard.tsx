'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { ParkWeekSchedule, WeekDay, WeekTruck } from '@/lib/markets/park-week-schedule'

/**
 * FT park-manager — day-scoped "This week at your park" card.
 *
 * Renders one expandable row per operating day (today-forward, 7-day window).
 * Collapsed row = day + glance stats; expand = the trucks that day with spot,
 * recurrence, and payment state. Today is auto-expanded. Read-only — approvals
 * live on the separate roster card; recurrence is managed on the standing-
 * reservations card. Data comes from getParkWeekSchedule (server).
 */
export default function ParkWeekCard({ schedule, marketId }: { schedule: ParkWeekSchedule; marketId: string }) {
  const initialOpen = () => {
    const today = schedule.days.find((d) => d.isToday)
    if (today) return new Set([today.date])
    return schedule.days.length > 0 ? new Set([schedule.days[0].date]) : new Set<string>()
  }
  const [open, setOpen] = useState<Set<string>>(initialOpen)

  const toggle = (date: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  if (schedule.days.length === 0) {
    return (
      <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        No operating days in the next 7 days. Set your park&apos;s open days in the schedule card to see who&apos;s booked.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
      {schedule.days.map((day) => (
        <DayRow
          key={day.date}
          day={day}
          spotsTotal={schedule.spotsTotal}
          expanded={open.has(day.date)}
          onToggle={() => toggle(day.date)}
          marketId={marketId}
        />
      ))}
    </div>
  )
}

function DayRow({
  day,
  spotsTotal,
  expanded,
  onToggle,
  marketId,
}: {
  day: WeekDay
  spotsTotal: number
  expanded: boolean
  onToggle: () => void
  marketId: string
}) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.sm, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          padding: spacing.xs,
          background: day.isToday ? colors.surfaceMuted : colors.surfaceBase,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, width: 12, flexShrink: 0 }}>
          {expanded ? '▾' : '▸'}
        </span>
        <span style={{
          fontWeight: typography.weights.semibold,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          flex: '1 1 auto',
          minWidth: 0,
        }}>
          {dayLabel(day)}
        </span>
        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, textAlign: 'right' }}>
          {glanceStats(day, spotsTotal)}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: spacing.xs, display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {day.trucks.length === 0 ? (
            <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
              No trucks booked for this day yet.
            </span>
          ) : (
            day.trucks.map((t, i) => <TruckRow key={`${t.spotLabel}-${t.vendorProfileId}-${i}`} truck={t} showCheckin={day.isToday} marketId={marketId} />)
          )}
        </div>
      )}
    </div>
  )
}

function TruckRow({ truck, showCheckin, marketId }: { truck: WeekTruck; showCheckin: boolean; marketId: string }) {
  const router = useRouter()
  const [barOpen, setBarOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // B3 — a manager can bar a specific PAID booking (no refund; the paid row
  // stays so the slot is NOT resold).
  const canBar = !!truck.bookingId && truck.status === 'paid' && !truck.barred

  const confirmBar = async () => {
    if (!truck.bookingId || !reason.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/park-bookings/${truck.bookingId}/bar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not cancel the booking')
        setSubmitting(false)
        return
      }
      setBarOpen(false)
      router.refresh()
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], flexWrap: 'wrap' }}>
        <span style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, color: truck.barred ? colors.textMuted : colors.textPrimary, textDecoration: truck.barred ? 'line-through' : 'none' }}>
          🅿 {truck.spotLabel}
        </span>
        <span style={{ fontSize: typography.sizes.sm, color: truck.barred ? colors.textMuted : colors.textPrimary }}>{truck.vendorName}</span>
        {truck.recurring && (
          <span title="Recurring weekly" style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>♻</span>
        )}
        {truck.barred ? (
          <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#991b1b', backgroundColor: '#fde2e2', padding: `${spacing['3xs']} ${spacing.xs}`, borderRadius: radius.sm }}>
            Cancelled · no refund
          </span>
        ) : (
          <>
            <StatusChip status={truck.status} />
            {/* Check-in only for Today (no pre-check-in); scheduled holds skipped. */}
            {showCheckin && truck.status !== 'scheduled' && <CheckinChip present={!!truck.checkedIn} />}
          </>
        )}
        {canBar && !barOpen && (
          <button
            type="button"
            onClick={() => setBarOpen(true)}
            title="Cancel this booking (no refund; the spot is not resold)"
            style={{ marginLeft: 'auto', fontSize: typography.sizes.xs, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Cancel
          </button>
        )}
      </div>
      {barOpen && (
        <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap', alignItems: 'center', padding: spacing['2xs'], backgroundColor: '#fff5f5', border: '1px solid #f5c6cb', borderRadius: radius.sm }}>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required) — the truck is notified"
            maxLength={500}
            disabled={submitting}
            style={{ flex: '1 1 180px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
          />
          <button
            type="button"
            onClick={confirmBar}
            disabled={submitting || !reason.trim()}
            style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: '#991b1b', color: 'white', border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, cursor: (submitting || !reason.trim()) ? 'not-allowed' : 'pointer', opacity: (submitting || !reason.trim()) ? 0.6 : 1 }}
          >
            {submitting ? 'Cancelling…' : 'Confirm cancel · no refund'}
          </button>
          <button
            type="button"
            onClick={() => { setBarOpen(false); setError(null) }}
            disabled={submitting}
            style={{ padding: `${spacing['3xs']} ${spacing.xs}`, background: 'none', border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, cursor: 'pointer', color: colors.textMuted }}
          >
            Keep
          </button>
          {error && <span style={{ width: '100%', fontSize: typography.sizes.xs, color: '#991b1b' }}>{error}</span>}
        </div>
      )}
    </div>
  )
}

function CheckinChip({ present }: { present: boolean }) {
  return (
    <span style={{
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: present ? '#166534' : colors.textMuted,
      backgroundColor: present ? '#dcfce7' : colors.surfaceMuted,
      padding: `${spacing['3xs']} ${spacing.xs}`,
      borderRadius: radius.sm,
    }}>
      {present ? '✓ Here' : 'Not checked in'}
    </span>
  )
}

function StatusChip({ status }: { status: WeekTruck['status'] }) {
  const map = {
    paid: { label: 'Paid', bg: '#dcfce7', fg: '#166534' },
    unpaid: { label: 'Unpaid', bg: '#fef3c7', fg: '#92400e' },
    scheduled: { label: 'Scheduled', bg: colors.surfaceMuted, fg: colors.textMuted },
  } as const
  const s = map[status]
  return (
    <span style={{
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      color: s.fg,
      backgroundColor: s.bg,
      padding: `${spacing['3xs']} ${spacing.xs}`,
      borderRadius: radius.sm,
    }}>
      {s.label}
    </span>
  )
}

/** "Today · Sat, Jul 5" / "Tomorrow · Sun, Jul 6" / "Sat, Jul 12". */
function dayLabel(day: WeekDay): string {
  const dated = formatDated(day.date)
  if (day.isToday) return `Today · ${dated}`
  if (day.isTomorrow) return `Tomorrow · ${dated}`
  return dated
}

function formatDated(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function glanceStats(day: WeekDay, spotsTotal: number): string {
  const parts = [
    `${day.trucksCount} truck${day.trucksCount === 1 ? '' : 's'}`,
    `${day.spotsFilled}/${spotsTotal} spots`,
  ]
  if (day.unpaidCount > 0) parts.push(`${day.unpaidCount} unpaid`)
  return parts.join(' · ')
}
