'use client'

import { useMemo, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'

/**
 * Interactive list of weekly booth rental bookings. Phase C Stage 1A
 * (2026-05-17). Client child of <WeeklyBookingsCard>. Receives bookings
 * pre-fetched + stitched by the server parent.
 *
 * WEEK-SCOPED (2026-08-03, from staging feedback). This list used to render
 * every booking at the market in one flat column. A vendor with a 12-week
 * recurring rental produced twelve near-identical cards, and a market with a
 * handful of such vendors became unscrollable.
 *
 * The fix is NOT grouping — it is SCOPE. What the manager needs day to day is
 * "who is here THIS week, in which booth", which is one week's worth of rows.
 * So the editable list shows exactly one week at a time with a week picker, and
 * the forward book is answered separately by a roster that names each vendor
 * ONCE with a date range. Same information, bounded height.
 *
 * Per-row UX:
 *   - Vendor name + week + size + price + status badge (read-only)
 *   - Inline booth-number input + Save button. Save calls
 *     PATCH /api/market-manager/[marketId]/weekly-rental/[rentalId].
 *   - Save button disables when value matches current booth_number
 *     (no-op prevention) or while saving.
 *   - "✓ Saved" flash on success; per-row error display.
 *
 * Patterns mirrored from VendorBoothList.tsx — same local-state shape,
 * same save flow, same flash + error treatment. Keeps the manager
 * dashboard interaction consistent.
 */
export interface WeeklyBookingRow {
  id: string
  /** Needed to roll a vendor's many weeks into ONE roster line (see below). */
  vendor_profile_id: string
  vendor_name: string
  week_start_date: string
  size_label: string
  booth_number: string | null
  price_cents: number
  status: 'pending_payment' | 'paid' | 'cancelled' | 'completed' | string
}

interface WeeklyBookingsListProps {
  marketId: string
  vertical: string
  bookings: WeeklyBookingRow[]
}

function statusBadge(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'paid':
      return { bg: '#d4edda', fg: '#155724', label: 'Paid' }
    case 'pending_payment':
      return { bg: '#fff3cd', fg: '#856404', label: 'Pending payment' }
    case 'cancelled':
      return { bg: '#f8d7da', fg: '#721c24', label: 'Cancelled' }
    case 'completed':
      return { bg: '#cce5ff', fg: '#004085', label: 'Completed' }
    default:
      return { bg: '#e9ecef', fg: '#495057', label: status }
  }
}

function formatWeek(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Compact form for roster lines — "Aug 3" without the weekday/year noise. */
function formatWeekShort(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Today in the browser's local calendar as YYYY-MM-DD, for picking the default
 *  week. Deliberately local rather than UTC: a manager in Chicago opening this
 *  at 8pm should land on the week they are actually in, not tomorrow's. */
function todayLocalISO(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function formatPrice(cents: number): string {
  // Always show cents on a transaction amount — otherwise $159.90 renders as
  // "$159.9" and $160.00 as "$160" (tester finding 2026-07-23).
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function WeeklyBookingsList({ marketId, vertical, bookings: initialBookings }: WeeklyBookingsListProps) {
  const [bookings, setBookings] = useState<WeeklyBookingRow[]>(initialBookings)
  const [edits, setEdits] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const b of initialBookings) initial[b.id] = b.booth_number ?? ''
    return initial
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [rowSuccess, setRowSuccess] = useState<Record<string, boolean>>({})

  // Every week that has at least one booking, oldest first.
  const weeks = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.week_start_date))).sort(),
    [bookings]
  )

  // Open on the current week if it has bookings, otherwise the next upcoming
  // one, otherwise the most recent past one. A manager arriving mid-season
  // should see this week's line-up without clicking anything.
  const [weekIndex, setWeekIndex] = useState(() => {
    const today = todayLocalISO()
    const upcoming = weeks.findIndex((w) => w >= today)
    return upcoming === -1 ? Math.max(0, weeks.length - 1) : upcoming
  })
  const selectedWeek = weeks[Math.min(weekIndex, weeks.length - 1)] ?? null
  const weekBookings = useMemo(
    () => bookings.filter((b) => b.week_start_date === selectedWeek),
    [bookings, selectedWeek]
  )

  // Forward book, one line per vendor. Cancelled weeks are excluded — a roster
  // that counts cancelled bookings overstates the commitment.
  const roster = useMemo(() => {
    const byVendor = new Map<string, { name: string; weeks: string[]; booths: Set<string> }>()
    for (const b of bookings) {
      if (b.status === 'cancelled') continue
      const entry = byVendor.get(b.vendor_profile_id) ?? { name: b.vendor_name, weeks: [], booths: new Set<string>() }
      entry.weeks.push(b.week_start_date)
      if (b.booth_number) entry.booths.add(b.booth_number)
      byVendor.set(b.vendor_profile_id, entry)
    }
    return [...byVendor.values()]
      .map((e) => ({ ...e, weeks: e.weeks.sort() }))
      .sort((a, b) => b.weeks.length - a.weeks.length || a.name.localeCompare(b.name))
  }, [bookings])

  // Only vendors with a RUN of weeks belong in the roster — a single booking is
  // already fully visible in its own week and repeating it here is noise.
  const recurring = roster.filter((r) => r.weeks.length > 1)

  const handleSave = async (rentalId: string) => {
    setSavingId(rentalId)
    setRowError((s) => ({ ...s, [rentalId]: '' }))
    setRowSuccess((s) => ({ ...s, [rentalId]: false }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/weekly-rental/${rentalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booth_number: edits[rentalId] ?? '' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [rentalId]: data.error || 'Save failed' }))
      } else {
        setRowSuccess((s) => ({ ...s, [rentalId]: true }))
        setBookings((bs) =>
          bs.map((b) =>
            b.id === rentalId ? { ...b, booth_number: data.booth_number ?? null } : b
          )
        )
        setTimeout(() => {
          setRowSuccess((s) => ({ ...s, [rentalId]: false }))
        }, 1500)
      }
    } catch {
      setRowError((s) => ({ ...s, [rentalId]: 'Network error' }))
    } finally {
      setSavingId(null)
    }
  }

  const navButton = {
    padding: `${spacing['3xs']} ${spacing.sm}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    background: 'white',
    fontSize: typography.sizes.sm,
    minHeight: 36,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {/* Week picker — the whole point of the 2026-08-03 restructure. Without it
          this list rendered every week at once and a recurring vendor buried the
          rest of the market under its own repeated rows. */}
      {selectedWeek && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap',
          paddingBottom: spacing.xs, borderBottom: `1px solid ${colors.border}`,
        }}>
          <button
            type="button"
            onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
            disabled={weekIndex <= 0}
            style={{ ...navButton, cursor: weekIndex <= 0 ? 'not-allowed' : 'pointer', opacity: weekIndex <= 0 ? 0.4 : 1 }}
            aria-label="Previous week"
          >
            ←
          </button>
          <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.base }}>
            Week of {formatWeek(selectedWeek)}
          </div>
          <button
            type="button"
            onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
            disabled={weekIndex >= weeks.length - 1}
            style={{ ...navButton, cursor: weekIndex >= weeks.length - 1 ? 'not-allowed' : 'pointer', opacity: weekIndex >= weeks.length - 1 ? 0.4 : 1 }}
            aria-label="Next week"
          >
            →
          </button>
          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
            {weekBookings.length} booking{weekBookings.length === 1 ? '' : 's'} this week
            {weeks.length > 1 && ` · week ${weekIndex + 1} of ${weeks.length}`}
          </span>
        </div>
      )}

      {weekBookings.length === 0 && (
        <p style={{ margin: 0, padding: spacing.xs, color: colors.textMuted, fontSize: typography.sizes.sm }}>
          No bookings for this week.
        </p>
      )}

      {weekBookings.map((b) => {
        const isSaving = savingId === b.id
        const editedValue = edits[b.id] ?? ''
        const dirty = editedValue !== (b.booth_number ?? '')
        const badge = statusBadge(b.status)
        const editable = b.status !== 'cancelled'

        return (
          <div
            key={b.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing.xs,
              backgroundColor: colors.surfaceBase,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
                color: colors.textPrimary,
              }}>
                {b.vendor_name}
              </div>
              <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                {/* The week is in the header above — repeating it on every row was
                    most of what made this list feel like noise. */}
                {b.size_label} · {formatPrice(b.price_cents)}
              </div>
            </div>

            {editable ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <input
                  type="text"
                  value={editedValue}
                  onChange={(e) => setEdits((s) => ({ ...s, [b.id]: e.target.value }))}
                  placeholder={`${term(vertical, 'booth')} #`}
                  disabled={isSaving}
                  maxLength={50}
                  style={{
                    width: 110,
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.sm,
                  }}
                />
                <button
                  onClick={() => handleSave(b.id)}
                  disabled={isSaving || !dirty}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.sm}`,
                    backgroundColor: dirty ? colors.primary : colors.surfaceMuted,
                    color: dirty ? 'white' : colors.textMuted,
                    border: 'none',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold,
                    cursor: isSaving || !dirty ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                {rowSuccess[b.id] && (
                  <span style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold }}>
                    ✓ Saved
                  </span>
                )}
              </div>
            ) : (
              // Cancelled bookings: show the booth_number (if any) but no
              // editor. Cancelled-row corrections aren't expected.
              <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, fontStyle: 'italic' }}>
                {b.booth_number ? `${term(vertical, 'booth')} #${b.booth_number}` : `No ${term(vertical, 'booth').toLowerCase()} assigned`}
              </div>
            )}

            <span style={{
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: badge.bg,
              color: badge.fg,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              whiteSpace: 'nowrap',
            }}>
              {badge.label}
            </span>

            {rowError[b.id] && (
              <div style={{
                width: '100%',
                fontSize: typography.sizes.xs,
                color: '#991b1b',
                marginTop: spacing['3xs'],
              }}>
                {rowError[b.id]}
              </div>
            )}
          </div>
        )
      })}

      {/* Recurring roster — the other half of the fix. The week view answers
          "who is here now"; this answers "who is committed, and through when",
          naming each vendor ONCE instead of once per booked week. Booth numbers
          are edited in the week view, not here — this is a summary, not a
          second place to change the same data. */}
      {recurring.length > 0 && (
        <div style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `1px solid ${colors.border}` }}>
          <div style={{
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            marginBottom: spacing['2xs'],
          }}>
            Recurring {term(vertical, 'vendors').toLowerCase()}
          </div>
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>
            {term(vertical, 'vendors')} booked for more than one week. Use the week view above to assign
            or change a {term(vertical, 'booth').toLowerCase()} number.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            {recurring.map((r) => (
              <div key={r.name + r.weeks[0]} style={{
                display: 'flex', gap: spacing.xs, alignItems: 'baseline', flexWrap: 'wrap',
                fontSize: typography.sizes.sm,
              }}>
                <span style={{ fontWeight: typography.weights.medium }}>{r.name}</span>
                <span style={{ color: colors.textSecondary }}>
                  {r.weeks.length} weeks · {formatWeekShort(r.weeks[0])} – {formatWeekShort(r.weeks[r.weeks.length - 1])}
                </span>
                {r.booths.size > 0 && (
                  <span style={{ color: colors.textMuted }}>
                    · {term(vertical, 'booth')} {[...r.booths].sort().join(', ')}
                  </span>
                )}
                {r.booths.size === 0 && (
                  <span style={{ color: '#a16207' }}>· no {term(vertical, 'booth').toLowerCase()} assigned</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
