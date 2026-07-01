'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  SPOT_POWER_OPTIONS,
  validateParkSpotInput,
  type ParkSpotRow,
  type ParkSpotInput,
  type SpotPower,
} from '@/lib/markets/park-spot-types'

interface ParkSpotsManagerProps {
  marketId: string
  initialParkMode: 'free' | 'paid'
}

/**
 * FT park-operator spot inventory manager — the food-truck analog of the FM
 * BoothInventoryManager. Unlike booth size tiers (count-based), each row here
 * is ONE real truck spot with attributes (length limit, power, water, price).
 *
 * Layout:
 *   - Park-mode toggle: free (attendance/compliance only) vs paid (spots sell)
 *   - Summary row: total spots, active spots
 *   - List: existing spots with inline edit / delete
 *   - Add-spot form: label / max length / power / water / price / recurring
 *
 * Backend:
 *   - GET    /api/market-manager/[marketId]/park-spots
 *   - POST   /api/market-manager/[marketId]/park-spots
 *   - PATCH  /api/market-manager/[marketId]/park-spots/[spotId]
 *   - DELETE /api/market-manager/[marketId]/park-spots/[spotId]
 *   - PUT    /api/market-manager/[marketId]/park-mode
 */
export default function ParkSpotsManager({ marketId, initialParkMode }: ParkSpotsManagerProps) {
  const [rows, setRows] = useState<ParkSpotRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Park-mode toggle state (free vs paid). Initialized from the prop, PUT to
  // the park-mode endpoint on change.
  const [parkMode, setParkMode] = useState<'free' | 'paid'>(initialParkMode)
  const [modeLoading, setModeLoading] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)

  // Add-form state. Prices held in dollars in the UI, converted to cents in
  // the request body.
  const [addForm, setAddForm] = useState({
    label: '',
    max_length_ft: '',
    power: 'none' as SpotPower,
    has_water: false,
    base_price_dollars: '',
    recurring_eligible: false,
    active: true,
  })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Per-row edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    label: '',
    max_length_ft: '',
    power: 'none' as SpotPower,
    has_water: false,
    base_price_dollars: '',
    recurring_eligible: false,
    active: true,
  })
  const [rowLoading, setRowLoading] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  // Delete-confirmation dialog state. Browser confirm() is blocked on mobile,
  // so we route through ConfirmDialog instead.
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; label: string } | null>(null)

  const loadSpots = async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/park-spots`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load spots')
        setRows([])
        return
      }
      setRows(data.spots || [])
    } catch {
      setLoadError('Network error loading spots')
      setRows([])
    }
  }

  useEffect(() => {
    loadSpots()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId])

  const formatPriceFromCents = (cents: number) =>
    `$${(cents / 100).toFixed(2)}`

  const dollarsToCents = (val: string): number => {
    const n = Number(val)
    if (!Number.isFinite(n)) return NaN
    return Math.round(n * 100)
  }

  const powerLabel = (power: SpotPower): string =>
    SPOT_POWER_OPTIONS.find((o) => o.value === power)?.label ?? power

  const buildInput = (form: typeof addForm): ParkSpotInput => {
    const lenTrim = form.max_length_ft.trim()
    return {
      label: form.label.trim(),
      max_length_ft: lenTrim === '' ? null : Number(lenTrim),
      power: form.power,
      has_water: form.has_water,
      base_price_cents: dollarsToCents(form.base_price_dollars),
      recurring_eligible: form.recurring_eligible,
      active: form.active,
    }
  }

  const handleSetMode = async (mode: 'free' | 'paid') => {
    if (mode === parkMode || modeLoading) return
    setModeError(null)
    setModeLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/park-mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_mode: mode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setModeError(data.error || 'Failed to update park mode')
      } else {
        setParkMode((data.park_mode as 'free' | 'paid') ?? mode)
      }
    } catch {
      setModeError('Network error updating park mode')
    } finally {
      setModeLoading(false)
    }
  }

  const handleAdd = async () => {
    setAddError(null)
    const input = buildInput(addForm)
    const validationError = validateParkSpotInput(input)
    if (validationError) {
      setAddError(validationError)
      return
    }

    setAddLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/park-spots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddError(data.error || 'Failed to add spot')
      } else {
        setAddForm({
          label: '',
          max_length_ft: '',
          power: 'none',
          has_water: false,
          base_price_dollars: '',
          recurring_eligible: false,
          active: true,
        })
        await loadSpots()
      }
    } catch {
      setAddError('Network error')
    } finally {
      setAddLoading(false)
    }
  }

  const startEdit = (row: ParkSpotRow) => {
    setEditingId(row.id)
    setEditForm({
      label: row.label,
      max_length_ft: row.max_length_ft === null ? '' : String(row.max_length_ft),
      power: row.power,
      has_water: row.has_water,
      base_price_dollars: (row.base_price_cents / 100).toFixed(2),
      recurring_eligible: row.recurring_eligible,
      active: row.active,
    })
    setRowError((s) => ({ ...s, [row.id]: '' }))
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleSave = async (id: string) => {
    const input = buildInput(editForm)
    const validationError = validateParkSpotInput(input)
    if (validationError) {
      setRowError((s) => ({ ...s, [id]: validationError }))
      return
    }

    setRowLoading(id)
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/park-spots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [id]: data.error || 'Save failed' }))
      } else {
        setEditingId(null)
        await loadSpots()
      }
    } catch {
      setRowError((s) => ({ ...s, [id]: 'Network error' }))
    } finally {
      setRowLoading(null)
    }
  }

  const requestDelete = (id: string, label: string) => {
    setConfirmingDelete({ id, label })
  }

  const performDelete = async () => {
    if (!confirmingDelete) return
    const { id } = confirmingDelete
    setConfirmingDelete(null)
    setRowLoading(id)
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/park-spots/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [id]: data.error || 'Delete failed' }))
      } else {
        await loadSpots()
      }
    } catch {
      setRowError((s) => ({ ...s, [id]: 'Network error' }))
    } finally {
      setRowLoading(null)
    }
  }

  if (rows === null) {
    return <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading spots…</div>
  }

  if (loadError) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fee2e2',
        color: '#991b1b',
        borderRadius: radius.sm,
        fontSize: typography.sizes.sm,
      }}>
        {loadError}
      </div>
    )
  }

  const activeCount = rows.filter((r) => r.active).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Park-mode toggle — free (attendance/compliance only) vs paid (spots sell). */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
      }}>
        <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
          Park mode
        </div>
        <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
          {(['free', 'paid'] as const).map((mode) => {
            const selected = parkMode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => handleSetMode(mode)}
                disabled={modeLoading}
                style={{
                  flex: '1 1 220px',
                  textAlign: 'left',
                  padding: spacing.xs,
                  backgroundColor: selected ? colors.primary : colors.surfaceElevated,
                  color: selected ? 'white' : colors.textPrimary,
                  border: selected ? 'none' : `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  cursor: modeLoading ? 'not-allowed' : 'pointer',
                  opacity: modeLoading ? 0.6 : 1,
                }}
              >
                <div style={{ fontWeight: typography.weights.semibold }}>
                  {mode === 'free' ? 'Free park' : 'Paid park'}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: selected ? 'rgba(255,255,255,0.85)' : colors.textMuted,
                  marginTop: spacing['3xs'],
                }}>
                  {mode === 'free'
                    ? 'Free park — attendance & compliance only (no paid spots)'
                    : 'Paid park — trucks book & pay for spots'}
                </div>
              </button>
            )
          })}
        </div>
        {modeError && (
          <div style={{ marginTop: spacing['2xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>
            {modeError}
          </div>
        )}
        {parkMode === 'free' && (
          <div style={{ marginTop: spacing['2xs'], color: colors.textMuted, fontSize: typography.sizes.xs, lineHeight: 1.5 }}>
            You can define spots now, but they only sell once the park is set to <strong>Paid</strong>.
          </div>
        )}
      </div>

      {/* Summary row */}
      <div style={{
        display: 'flex',
        gap: spacing.md,
        flexWrap: 'wrap',
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
        fontSize: typography.sizes.sm,
      }}>
        <div>
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Total spots</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{rows.length}</div>
        </div>
        <div>
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Active spots</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{activeCount}</div>
        </div>
      </div>

      {/* Existing spots */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {rows.map((row) => {
            const isEditing = editingId === row.id
            const isLoading = rowLoading === row.id

            return (
              <div
                key={row.id}
                style={{
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceElevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                }}
              >
                {!isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                        {row.label}
                        {!row.active && (
                          <span style={{ marginLeft: spacing['2xs'], color: colors.textMuted, fontWeight: typography.weights.normal }}>
                            · inactive
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        {row.max_length_ft ? `Fits trucks up to ${row.max_length_ft} ft · ` : ''}
                        {powerLabel(row.power)}
                        {row.has_water ? ' · water' : ''}
                        {' · '}{formatPriceFromCents(row.base_price_cents)}/day
                        {row.recurring_eligible ? ' · recurring OK' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: spacing['2xs'] }}>
                      <button
                        onClick={() => startEdit(row)}
                        disabled={isLoading}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.sm}`,
                          backgroundColor: colors.surfaceBase,
                          color: colors.textPrimary,
                          border: `1px solid ${colors.border}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => requestDelete(row.id, row.label)}
                        disabled={isLoading}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.sm}`,
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.6 : 1,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={(e) => setEditForm((s) => ({ ...s, label: e.target.value }))}
                        placeholder="Spot label"
                        disabled={isLoading}
                        style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
                      <input
                        type="number"
                        min={0}
                        value={editForm.max_length_ft}
                        onChange={(e) => setEditForm((s) => ({ ...s, max_length_ft: e.target.value }))}
                        placeholder="Max length (ft, optional)"
                        disabled={isLoading}
                        style={{ flex: '1 1 160px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                      <select
                        value={editForm.power}
                        onChange={(e) => setEditForm((s) => ({ ...s, power: e.target.value as SpotPower }))}
                        disabled={isLoading}
                        style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      >
                        {SPOT_POWER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editForm.base_price_dollars}
                        onChange={(e) => setEditForm((s) => ({ ...s, base_price_dollars: e.target.value }))}
                        placeholder="Price per day ($)"
                        disabled={isLoading}
                        style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: spacing['3xs'], fontSize: typography.sizes.xs, color: colors.textPrimary }}>
                        <input
                          type="checkbox"
                          checked={editForm.has_water}
                          onChange={(e) => setEditForm((s) => ({ ...s, has_water: e.target.checked }))}
                          disabled={isLoading}
                        />
                        Water hookup
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: spacing['3xs'], fontSize: typography.sizes.xs, color: colors.textPrimary }}>
                        <input
                          type="checkbox"
                          checked={editForm.recurring_eligible}
                          onChange={(e) => setEditForm((s) => ({ ...s, recurring_eligible: e.target.checked }))}
                          disabled={isLoading}
                        />
                        Allow standing/recurring reservations
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: spacing['3xs'], fontSize: typography.sizes.xs, color: colors.textPrimary }}>
                        <input
                          type="checkbox"
                          checked={editForm.active}
                          onChange={(e) => setEditForm((s) => ({ ...s, active: e.target.checked }))}
                          disabled={isLoading}
                        />
                        Active
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleSave(row.id)}
                        disabled={isLoading}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.sm}`,
                          backgroundColor: colors.primary,
                          color: 'white',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold,
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.6 : 1,
                        }}
                      >
                        {isLoading ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isLoading}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.sm}`,
                          backgroundColor: 'transparent',
                          color: colors.textMuted,
                          border: `1px solid ${colors.border}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {rowError[row.id] && (
                  <div style={{ marginTop: spacing['3xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>
                    {rowError[row.id]}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add-spot form */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px dashed ${colors.border}`,
        borderRadius: radius.sm,
      }}>
        <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
          Add a spot
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={addForm.label}
              onChange={(e) => setAddForm((s) => ({ ...s, label: e.target.value }))}
              placeholder="Spot label (e.g., A1)"
              disabled={addLoading}
              style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
            />
            <input
              type="number"
              min={0}
              value={addForm.max_length_ft}
              onChange={(e) => setAddForm((s) => ({ ...s, max_length_ft: e.target.value }))}
              placeholder="Max length (ft, optional)"
              disabled={addLoading}
              style={{ flex: '1 1 160px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
            />
          </div>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <select
              value={addForm.power}
              onChange={(e) => setAddForm((s) => ({ ...s, power: e.target.value as SpotPower }))}
              disabled={addLoading}
              style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
            >
              {SPOT_POWER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={addForm.base_price_dollars}
              onChange={(e) => setAddForm((s) => ({ ...s, base_price_dollars: e.target.value }))}
              placeholder="Price per day ($)"
              disabled={addLoading}
              style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
            />
          </div>
          <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['3xs'], fontSize: typography.sizes.xs, color: colors.textPrimary }}>
              <input
                type="checkbox"
                checked={addForm.has_water}
                onChange={(e) => setAddForm((s) => ({ ...s, has_water: e.target.checked }))}
                disabled={addLoading}
              />
              Water hookup
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['3xs'], fontSize: typography.sizes.xs, color: colors.textPrimary }}>
              <input
                type="checkbox"
                checked={addForm.recurring_eligible}
                onChange={(e) => setAddForm((s) => ({ ...s, recurring_eligible: e.target.checked }))}
                disabled={addLoading}
              />
              Allow standing/recurring reservations
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['3xs'], fontSize: typography.sizes.xs, color: colors.textPrimary }}>
              <input
                type="checkbox"
                checked={addForm.active}
                onChange={(e) => setAddForm((s) => ({ ...s, active: e.target.checked }))}
                disabled={addLoading}
              />
              Active
            </label>
            <button
              onClick={handleAdd}
              disabled={addLoading}
              style={{
                marginLeft: 'auto',
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                cursor: addLoading ? 'not-allowed' : 'pointer',
                opacity: addLoading ? 0.6 : 1,
              }}
            >
              {addLoading ? 'Adding…' : 'Add spot'}
            </button>
          </div>
        </div>
        {addError && (
          <div style={{ marginTop: spacing['2xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>
            {addError}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmingDelete}
        title="Remove spot?"
        message={`Remove the "${confirmingDelete?.label ?? ''}" spot? Spots with active or upcoming bookings cannot be removed — the truck must finish or cancel its reservation first.`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={performDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  )
}
