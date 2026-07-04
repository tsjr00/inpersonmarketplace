'use client'

import { useState } from 'react'
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
export default function ParkWeekCard({ schedule }: { schedule: ParkWeekSchedule }) {
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
}: {
  day: WeekDay
  spotsTotal: number
  expanded: boolean
  onToggle: () => void
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
            day.trucks.map((t, i) => <TruckRow key={`${t.spotLabel}-${t.vendorProfileId}-${i}`} truck={t} />)
          )}
        </div>
      )}
    </div>
  )
}

function TruckRow({ truck }: { truck: WeekTruck }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], flexWrap: 'wrap' }}>
      <span style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
        🅿 {truck.spotLabel}
      </span>
      <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>{truck.vendorName}</span>
      {truck.recurring && (
        <span title="Recurring weekly" style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
          ♻
        </span>
      )}
      <StatusChip status={truck.status} />
    </div>
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
