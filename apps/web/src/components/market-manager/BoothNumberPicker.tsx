'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import type { BoothLabelStateRow } from '@/lib/markets/booth-types'

/**
 * The ONE way a manager picks a booth number (booth_numbering_design.md N-4,
 * mig 258): choose the size, then choose from that size's numbers. Taken
 * numbers stay visible but disabled with who holds them, so "why can't I use
 * #5?" answers itself. Free text is gone — a number always carries its size,
 * so the "N occupants without a size tier" box can no longer be created.
 *
 * Feed: GET /api/market-manager/[marketId]/booth-labels?inventory_id=…
 *       &week_start_date=…&vendor_profile_id=…  (label states for that week).
 *
 * Used by: the roster (hold + approval), placeholders, the weekly-bookings
 * override. `value` is the chosen label ('' = none). `allowClear` offers a
 * "— none —" option (a hold can be released; a placeholder cannot be blank).
 *
 * The current value is always offered even if the feed says it is taken —
 * it IS the row being edited (its own hold / booking shows as taken).
 */
interface BoothNumberPickerProps {
  marketId: string
  vertical: string
  tiers: Array<{ id: string; size_label: string }>
  inventoryId: string
  onInventoryChange: (inventoryId: string) => void
  value: string
  onChange: (label: string) => void
  /** The vendor the number is for — their own hold shows as available ("yours"). */
  vendorProfileId?: string
  /** Sunday of the week the number is for; default = current week. */
  weekStartDate?: string
  disabled?: boolean
  allowClear?: boolean
  /** Compact = the roster row's inline size. */
  compact?: boolean
}

const STATE_LABEL: Record<BoothLabelStateRow['state'], string> = {
  free: '',
  own: 'yours',
  placeholder: 'off-platform',
  booked: 'booked this week',
  assigned: 'paid, locked',
  pinned: 'held',
}

export default function BoothNumberPicker({
  marketId, vertical, tiers, inventoryId, onInventoryChange, value, onChange,
  vendorProfileId, weekStartDate, disabled = false, allowClear = true, compact = true,
}: BoothNumberPickerProps) {
  const [rows, setRows] = useState<BoothLabelStateRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    // Reset off the synchronous effect path (repo rule: react-hooks/set-state-in-effect → queueMicrotask).
    queueMicrotask(() => { if (alive) { setRows(null); setLoadError(null) } })
    if (!inventoryId) return () => { alive = false }
    const qs = new URLSearchParams({ inventory_id: inventoryId })
    if (weekStartDate) qs.set('week_start_date', weekStartDate)
    if (vendorProfileId) qs.set('vendor_profile_id', vendorProfileId)
    fetch(`/api/market-manager/${marketId}/booth-labels?${qs.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) { setLoadError(data.error || 'Could not load booth numbers'); setRows([]); return }
        setRows((data.labels as BoothLabelStateRow[]) ?? [])
      })
      .catch(() => { if (alive) { setLoadError('Network error loading booth numbers'); setRows([]) } })
    return () => { alive = false }
  }, [marketId, inventoryId, weekStartDate, vendorProfileId])

  const booth = term(vertical, 'booth').toLowerCase()
  const selectStyle = {
    padding: `${spacing['3xs']} ${spacing.xs}`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: compact ? typography.sizes.xs : typography.sizes.sm,
    minHeight: 32,
    backgroundColor: 'white',
  } as const

  const noNumbersYet = !!inventoryId && rows !== null && rows.length === 0 && !loadError
  const freeCount = (rows ?? []).filter((r) => r.state === 'free' || r.state === 'own').length

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing['2xs'], flexWrap: 'wrap' }}>
      <select
        value={inventoryId}
        onChange={(e) => { onInventoryChange(e.target.value); onChange('') }}
        disabled={disabled || tiers.length === 0}
        title={tiers.length === 0 ? `Set up ${booth} inventory first` : `${term(vertical, 'booth')} size`}
        style={{ ...selectStyle, maxWidth: 150 }}
      >
        <option value="">Size…</option>
        {tiers.map((t) => <option key={t.id} value={t.id}>{t.size_label}</option>)}
      </select>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || !inventoryId || rows === null || noNumbersYet}
        title={!inventoryId ? 'Pick a size first' : `${term(vertical, 'booth')} number — taken numbers show who holds them`}
        style={{ ...selectStyle, maxWidth: 220 }}
      >
        {!inventoryId ? (
          <option value="">Pick a size first</option>
        ) : rows === null && !loadError ? (
          <option value="">Loading…</option>
        ) : noNumbersYet ? (
          <option value="">No numbers set for this size</option>
        ) : (
          <>
            {allowClear && <option value="">— no {booth} # —</option>}
            {!allowClear && !value && <option value="">Pick a {booth} #…</option>}
            {(rows ?? []).map((r) => {
              const taken = r.state !== 'free' && r.state !== 'own' && r.label !== value
              const tag = r.state === 'free' ? '' : ` — ${STATE_LABEL[r.state]}${r.holder && r.state !== 'own' ? `: ${r.holder}` : ''}${r.paidThrough ? ` through ${r.paidThrough}` : ''}`
              return (
                <option key={r.label} value={r.label} disabled={taken}>
                  {r.label}{tag}
                </option>
              )
            })}
            {value && !(rows ?? []).some((r) => r.label === value) && (
              // The row's current number is outside this size's list (legacy or a size change) — keep it selectable so the manager sees it.
              <option value={value}>{value} — not in this size</option>
            )}
          </>
        )}
      </select>
      {inventoryId && rows !== null && !noNumbersYet && !loadError && (
        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{freeCount} free</span>
      )}
      {noNumbersYet && (
        <span style={{ fontSize: typography.sizes.xs, color: '#92400e' }}>Set this size&apos;s numbers in {term(vertical, 'booth')} inventory first.</span>
      )}
      {loadError && <span style={{ fontSize: typography.sizes.xs, color: '#991b1b' }}>{loadError}</span>}
    </span>
  )
}
