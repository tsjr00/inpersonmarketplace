'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'

/**
 * Interactive list of weekly booth rental bookings. Phase C Stage 1A
 * (2026-05-17). Client child of <WeeklyBookingsCard>. Receives bookings
 * pre-fetched + stitched by the server parent.
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

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      {bookings.map((b) => {
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
                Week of {formatWeek(b.week_start_date)} · {b.size_label} · {formatPrice(b.price_cents)}
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
    </div>
  )
}
