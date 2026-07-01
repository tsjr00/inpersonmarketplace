'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { term } from '@/lib/vertical/terminology'
import type { BoothPlaceholderRow, BoothPlaceholderInput } from '@/lib/markets/placeholder-types'
import type { BoothInventoryRow } from '@/lib/markets/booth-types'

interface BoothPlaceholderManagerProps {
  marketId: string
  vertical: string
}

/**
 * Manager-side CRUD for off-platform booth placeholders
 * (market_booth_placeholders rows).
 *
 * A placeholder records "booth N is occupied by a vendor not on the
 * platform" — no vendor identity captured, just occupancy. Optional link
 * to a market_booth_inventory size tier so the system can compute "how
 * many size-X booths remain" correctly.
 *
 * Layout:
 *   - Summary row: placeholder count + by-size breakdown
 *   - List: existing placeholders with inline edit / delete
 *   - Add placeholder form: booth_number / size dropdown / notes
 *
 * Backend:
 *   - GET    /api/market-manager/[marketId]/booth-placeholders
 *   - POST   /api/market-manager/[marketId]/booth-placeholders
 *   - PATCH  /api/market-manager/[marketId]/booth-placeholders/[id]
 *   - DELETE /api/market-manager/[marketId]/booth-placeholders/[id]
 *
 * Loads booth-inventory in parallel so the size dropdown reflects the
 * tiers configured for this market. The dropdown is optional —
 * managers can leave it unset if they don't track size on a particular
 * placeholder.
 */
export default function BoothPlaceholderManager({ marketId, vertical }: BoothPlaceholderManagerProps) {
  const [rows, setRows] = useState<BoothPlaceholderRow[] | null>(null)
  const [tiers, setTiers] = useState<BoothInventoryRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // Add-form state
  const [addForm, setAddForm] = useState({
    booth_number: '',
    inventory_id: '',
    notes: '',
  })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Per-row edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    booth_number: '',
    inventory_id: '',
    notes: '',
  })
  const [rowLoading, setRowLoading] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  // Delete-confirmation dialog state. Browser confirm() is blocked on
  // mobile, so we route through ConfirmDialog instead.
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; boothNumber: string } | null>(null)

  const loadAll = async () => {
    try {
      const [placeholdersRes, inventoryRes] = await Promise.all([
        fetch(`/api/market-manager/${marketId}/booth-placeholders`),
        fetch(`/api/market-manager/${marketId}/booth-inventory`),
      ])
      const placeholdersData = await placeholdersRes.json().catch(() => ({}))
      const inventoryData = await inventoryRes.json().catch(() => ({}))

      if (!placeholdersRes.ok) {
        setLoadError(placeholdersData.error || 'Failed to load placeholders')
        setRows([])
        return
      }
      setRows(placeholdersData.placeholders || [])
      // Inventory load failures are non-fatal — placeholders still work
      // without the size dropdown
      if (inventoryRes.ok) {
        setTiers(inventoryData.inventory || [])
      }
    } catch {
      setLoadError('Network error loading placeholders')
      setRows([])
    }
  }

  useEffect(() => {
    loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId])

  const tierLabelFor = (inventoryId: string | null): string => {
    if (!inventoryId) return ''
    const t = tiers.find((tier) => tier.id === inventoryId)
    return t ? t.size_label : ''
  }

  const handleAdd = async () => {
    setAddError(null)
    const input: BoothPlaceholderInput = {
      booth_number: addForm.booth_number.trim(),
      inventory_id: addForm.inventory_id || null,
      notes: addForm.notes.trim() || null,
    }
    if (!input.booth_number) {
      setAddError(`${term(vertical, 'booth')} number is required`)
      return
    }
    // Mig 145 / feedback #4: tier selection is required.
    if (!input.inventory_id) {
      setAddError(`Pick the ${term(vertical, 'booth').toLowerCase()} size tier this ${term(vertical, 'booth').toLowerCase()} belongs to.`)
      return
    }

    setAddLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-placeholders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddError(data.error || 'Failed to add placeholder')
      } else {
        setAddForm({ booth_number: '', inventory_id: '', notes: '' })
        await loadAll()
      }
    } catch {
      setAddError('Network error')
    } finally {
      setAddLoading(false)
    }
  }

  const startEdit = (row: BoothPlaceholderRow) => {
    setEditingId(row.id)
    setEditForm({
      booth_number: row.booth_number,
      inventory_id: row.inventory_id ?? '',
      notes: row.notes ?? '',
    })
    setRowError((s) => ({ ...s, [row.id]: '' }))
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleSave = async (id: string) => {
    const input: BoothPlaceholderInput = {
      booth_number: editForm.booth_number.trim(),
      inventory_id: editForm.inventory_id || null,
      notes: editForm.notes.trim() || null,
    }
    if (!input.booth_number) {
      setRowError((s) => ({ ...s, [id]: `${term(vertical, 'booth')} number is required` }))
      return
    }
    // Mig 145 / feedback #4: tier selection is required.
    if (!input.inventory_id) {
      setRowError((s) => ({ ...s, [id]: `Pick the ${term(vertical, 'booth').toLowerCase()} size tier this ${term(vertical, 'booth').toLowerCase()} belongs to.` }))
      return
    }

    setRowLoading(id)
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-placeholders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [id]: data.error || 'Save failed' }))
      } else {
        setEditingId(null)
        await loadAll()
      }
    } catch {
      setRowError((s) => ({ ...s, [id]: 'Network error' }))
    } finally {
      setRowLoading(null)
    }
  }

  const requestDelete = (id: string, boothNumber: string) => {
    setConfirmingDelete({ id, boothNumber })
  }

  const performDelete = async () => {
    if (!confirmingDelete) return
    const { id } = confirmingDelete
    setConfirmingDelete(null)
    setRowLoading(id)
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-placeholders/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [id]: data.error || 'Delete failed' }))
      } else {
        await loadAll()
      }
    } catch {
      setRowError((s) => ({ ...s, [id]: 'Network error' }))
    } finally {
      setRowLoading(null)
    }
  }

  if (rows === null) {
    return <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading placeholders…</div>
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

  // Summary: total placeholders + per-tier counts
  const tierCounts = new Map<string, number>()
  let untieredCount = 0
  for (const row of rows) {
    if (row.inventory_id) {
      tierCounts.set(row.inventory_id, (tierCounts.get(row.inventory_id) ?? 0) + 1)
    } else {
      untieredCount++
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Summary */}
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
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Off-platform placeholders</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{rows.length}</div>
        </div>
        {tiers.map((tier) => {
          const count = tierCounts.get(tier.id) ?? 0
          if (count === 0) return null
          return (
            <div key={tier.id}>
              <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>{tier.size_label}</div>
              <div style={{ fontWeight: typography.weights.semibold }}>{count}</div>
            </div>
          )
        })}
        {untieredCount > 0 && (
          <div>
            <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>No size set</div>
            <div style={{ fontWeight: typography.weights.semibold }}>{untieredCount}</div>
          </div>
        )}
      </div>

      {/* Existing placeholders */}
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
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                        {term(vertical, 'booth')} {row.booth_number}
                        {row.inventory_id && (
                          <span style={{ marginLeft: spacing['2xs'], color: colors.textMuted, fontWeight: typography.weights.normal }}>
                            · {tierLabelFor(row.inventory_id) || '(unknown size)'}
                          </span>
                        )}
                      </div>
                      {row.notes && (
                        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                          {row.notes}
                        </div>
                      )}
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
                        onClick={() => requestDelete(row.id, row.booth_number)}
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
                        value={editForm.booth_number}
                        onChange={(e) => setEditForm((s) => ({ ...s, booth_number: e.target.value }))}
                        placeholder={`${term(vertical, 'booth')} number`}
                        disabled={isLoading}
                        maxLength={50}
                        style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
                      <select
                        value={editForm.inventory_id}
                        onChange={(e) => setEditForm((s) => ({ ...s, inventory_id: e.target.value }))}
                        disabled={isLoading}
                        style={{ flex: '1 1 160px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, backgroundColor: 'white' }}
                      >
                        <option value="">— Select size tier —</option>
                        {tiers.map((tier) => (
                          <option key={tier.id} value={tier.id}>
                            {tier.size_label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={editForm.notes}
                      onChange={(e) => setEditForm((s) => ({ ...s, notes: e.target.value }))}
                      placeholder="Notes (optional)"
                      disabled={isLoading}
                      maxLength={500}
                      style={{ padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                    />
                    <div style={{ display: 'flex', gap: spacing['2xs'] }}>
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

      {/* Add placeholder form */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px dashed ${colors.border}`,
        borderRadius: radius.sm,
      }}>
        <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
          Add an off-platform {term(vertical, 'booth').toLowerCase()} placeholder
        </div>
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.xs }}>
          <input
            type="text"
            value={addForm.booth_number}
            onChange={(e) => setAddForm((s) => ({ ...s, booth_number: e.target.value }))}
            placeholder={`${term(vertical, 'booth')} number (e.g., 12, A3)`}
            disabled={addLoading}
            maxLength={50}
            style={{ flex: '1 1 160px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
          />
          <select
            value={addForm.inventory_id}
            onChange={(e) => setAddForm((s) => ({ ...s, inventory_id: e.target.value }))}
            disabled={addLoading || tiers.length === 0}
            style={{ flex: '1 1 160px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, backgroundColor: 'white' }}
          >
            <option value="">{tiers.length === 0 ? `(set up ${term(vertical, 'booth').toLowerCase()} inventory first)` : '— Select size tier —'}</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.size_label}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={addForm.notes}
          onChange={(e) => setAddForm((s) => ({ ...s, notes: e.target.value }))}
          placeholder={`Notes (optional, e.g., ${term(vertical, 'vendor').toLowerCase()} name for your records)`}
          disabled={addLoading}
          maxLength={500}
          style={{ width: '100%', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, marginBottom: spacing.xs, boxSizing: 'border-box' }}
        />
        <button
          onClick={handleAdd}
          disabled={addLoading}
          style={{
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
          {addLoading ? 'Adding…' : 'Add placeholder'}
        </button>
        {addError && (
          <div style={{ marginTop: spacing['2xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>
            {addError}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmingDelete}
        title="Remove placeholder?"
        message={`Remove the placeholder for ${term(vertical, 'booth').toLowerCase()} "${confirmingDelete?.boothNumber ?? ''}"?`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={performDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  )
}
