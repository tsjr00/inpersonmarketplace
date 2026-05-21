'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  summarizeBoothInventory,
  type BoothInventoryRow,
  type BoothInventoryInput,
} from '@/lib/markets/booth-types'
import {
  generateBoothLabelSequence,
  validateBoothLabelRange,
} from '@/lib/markets/booth-labels'

interface BoothInventoryManagerProps {
  marketId: string
}

/**
 * Manager-side CRUD for booth size tiers (market_booth_inventory rows).
 *
 * Layout:
 *   - Booth numbering section: first + last label (mig 144 auto-assignment)
 *   - Summary row: total booths, # of size tiers, max-per-week revenue
 *   - List: existing tiers with inline edit / delete
 *   - Add tier form: size_label / dimensions / count / weekly_price (in dollars,
 *     converted to cents server-side... actually kept in dollars in UI,
 *     converted to cents in the request body)
 *
 * Backend:
 *   - GET    /api/market-manager/[marketId]/booth-inventory
 *   - POST   /api/market-manager/[marketId]/booth-inventory
 *   - PATCH  /api/market-manager/[marketId]/booth-inventory/[id]
 *   - DELETE /api/market-manager/[marketId]/booth-inventory/[id]
 *   - GET/PUT /api/market-manager/[marketId]/booth-labels      (mig 144)
 */
export default function BoothInventoryManager({ marketId }: BoothInventoryManagerProps) {
  const [rows, setRows] = useState<BoothInventoryRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Booth-label state (mig 144). Loaded alongside inventory; saved via a
  // separate PUT to the booth-labels route. Both fields are optional —
  // leaving them blank lets the auto-assignment RPC fall back to defaults.
  const [labelStart, setLabelStart] = useState<string>('')
  const [labelEnd, setLabelEnd] = useState<string>('')
  const [savedLabelStart, setSavedLabelStart] = useState<string | null>(null)
  const [savedLabelEnd, setSavedLabelEnd] = useState<string | null>(null)
  const [labelsLoading, setLabelsLoading] = useState(false)
  const [labelsError, setLabelsError] = useState<string | null>(null)
  const [labelsSavedFlash, setLabelsSavedFlash] = useState(false)

  // Add-form state
  const [addForm, setAddForm] = useState({
    size_label: '',
    dimensions: '',
    count: '',
    weekly_price_dollars: '',
  })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Per-row edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    size_label: '',
    dimensions: '',
    count: '',
    weekly_price_dollars: '',
  })
  const [rowLoading, setRowLoading] = useState<string | null>(null)
  const [rowError, setRowError] = useState<Record<string, string>>({})

  // Delete-confirmation dialog state. Browser confirm() is blocked on
  // mobile, so we route through ConfirmDialog instead.
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; label: string } | null>(null)

  const loadInventory = async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-inventory`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load booth inventory')
        setRows([])
        return
      }
      setRows(data.inventory || [])
    } catch {
      setLoadError('Network error loading inventory')
      setRows([])
    }
  }

  const loadLabels = async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-labels`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Non-fatal — labels load failure doesn't block the inventory UI.
        return
      }
      const start = (data.booth_label_start as string | null) ?? null
      const end = (data.booth_label_end as string | null) ?? null
      setSavedLabelStart(start)
      setSavedLabelEnd(end)
      setLabelStart(start ?? '')
      setLabelEnd(end ?? '')
    } catch {
      // Silent — same reason as above.
    }
  }

  useEffect(() => {
    loadInventory()
    loadLabels()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId])

  const formatPriceFromCents = (cents: number) =>
    `$${(cents / 100).toFixed(2)}`

  const dollarsToCents = (val: string): number => {
    const n = Number(val)
    if (!Number.isFinite(n)) return NaN
    return Math.round(n * 100)
  }

  const handleAdd = async () => {
    setAddError(null)
    const input: BoothInventoryInput = {
      size_label: addForm.size_label.trim(),
      dimensions: addForm.dimensions.trim() || null,
      count: Number(addForm.count),
      weekly_price_cents: dollarsToCents(addForm.weekly_price_dollars),
    }
    if (!input.size_label) {
      setAddError('Size label is required')
      return
    }
    if (!Number.isInteger(input.count) || input.count < 0) {
      setAddError('Count must be a non-negative whole number')
      return
    }
    if (!Number.isFinite(input.weekly_price_cents) || input.weekly_price_cents < 0) {
      setAddError('Weekly price must be a non-negative number')
      return
    }

    setAddLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddError(data.error || 'Failed to add tier')
      } else {
        setAddForm({ size_label: '', dimensions: '', count: '', weekly_price_dollars: '' })
        await loadInventory()
      }
    } catch {
      setAddError('Network error')
    } finally {
      setAddLoading(false)
    }
  }

  const startEdit = (row: BoothInventoryRow) => {
    setEditingId(row.id)
    setEditForm({
      size_label: row.size_label,
      dimensions: row.dimensions ?? '',
      count: String(row.count),
      weekly_price_dollars: (row.weekly_price_cents / 100).toFixed(2),
    })
    setRowError((s) => ({ ...s, [row.id]: '' }))
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleSave = async (id: string) => {
    const input: BoothInventoryInput = {
      size_label: editForm.size_label.trim(),
      dimensions: editForm.dimensions.trim() || null,
      count: Number(editForm.count),
      weekly_price_cents: dollarsToCents(editForm.weekly_price_dollars),
    }
    if (!input.size_label) {
      setRowError((s) => ({ ...s, [id]: 'Size label is required' }))
      return
    }
    if (!Number.isInteger(input.count) || input.count < 0) {
      setRowError((s) => ({ ...s, [id]: 'Count must be a non-negative whole number' }))
      return
    }
    if (!Number.isFinite(input.weekly_price_cents) || input.weekly_price_cents < 0) {
      setRowError((s) => ({ ...s, [id]: 'Weekly price must be a non-negative number' }))
      return
    }

    setRowLoading(id)
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [id]: data.error || 'Save failed' }))
      } else {
        setEditingId(null)
        await loadInventory()
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
      const res = await fetch(`/api/market-manager/${marketId}/booth-inventory/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRowError((s) => ({ ...s, [id]: data.error || 'Delete failed' }))
      } else {
        await loadInventory()
      }
    } catch {
      setRowError((s) => ({ ...s, [id]: 'Network error' }))
    } finally {
      setRowLoading(null)
    }
  }

  const handleSaveLabels = async () => {
    setLabelsError(null)
    setLabelsSavedFlash(false)

    const startTrim = labelStart.trim()
    const endTrim = labelEnd.trim()
    const bothBlank = startTrim === '' && endTrim === ''

    // Client-side validation when both are set; defer mismatched-total
    // check to the server (it has authoritative inventory data).
    if (!bothBlank) {
      if (startTrim === '' || endTrim === '') {
        setLabelsError('Provide both first and last labels, or clear both to use defaults.')
        return
      }
      // Local pre-check against the inventory rows we've loaded. Server
      // re-validates with the live inventory total in case rows changed.
      const localTotal = (rows ?? []).reduce((sum, r) => sum + (r.count || 0), 0)
      if (localTotal > 0) {
        const localErr = validateBoothLabelRange(startTrim, endTrim, { totalCount: localTotal })
        if (localErr) {
          setLabelsError(localErr)
          return
        }
      }
    }

    setLabelsLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booth_label_start: bothBlank ? null : startTrim,
          booth_label_end: bothBlank ? null : endTrim,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLabelsError(data.error || 'Failed to save booth labels')
        return
      }
      const savedStart = (data.booth_label_start as string | null) ?? null
      const savedEnd = (data.booth_label_end as string | null) ?? null
      setSavedLabelStart(savedStart)
      setSavedLabelEnd(savedEnd)
      setLabelStart(savedStart ?? '')
      setLabelEnd(savedEnd ?? '')
      setLabelsSavedFlash(true)
      setTimeout(() => setLabelsSavedFlash(false), 2000)
    } catch {
      setLabelsError('Network error — please try again')
    } finally {
      setLabelsLoading(false)
    }
  }

  if (rows === null) {
    return <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading booth inventory…</div>
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

  const summary = summarizeBoothInventory(rows)

  // Booth-label section state derivation (for the preview + save-button
  // disabling). Both fields blank = "use defaults" save. Both set + valid
  // = computed sequence preview. Otherwise = no preview (validation msg).
  const labelStartTrim = labelStart.trim()
  const labelEndTrim = labelEnd.trim()
  const labelsBothBlank = labelStartTrim === '' && labelEndTrim === ''
  const labelsDirty =
    (labelStartTrim || '') !== (savedLabelStart ?? '') ||
    (labelEndTrim || '') !== (savedLabelEnd ?? '')
  const previewSequence = labelsBothBlank
    ? []
    : generateBoothLabelSequence(labelStartTrim, labelEndTrim)
  const previewSnippet =
    previewSequence.length === 0
      ? ''
      : previewSequence.length <= 4
      ? previewSequence.join(', ')
      : `${previewSequence.slice(0, 3).join(', ')}, …, ${previewSequence[previewSequence.length - 1]}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Booth numbering section (mig 144 — auto-assignment range). */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
      }}>
        <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing['3xs'] }}>
          Booth numbering
        </div>
        <p style={{
          margin: 0,
          marginBottom: spacing.xs,
          color: colors.textMuted,
          fontSize: typography.sizes.xs,
          lineHeight: 1.5,
        }}>
          Tell us the first and last booth label at your market. We&apos;ll
          assign these labels automatically as vendors book — no work for
          you on each booking. Leave both blank to use the default
          (1 to {summary.total_booths || 'N'}). Same letters/format for
          both — examples: <strong>1</strong> &amp; <strong>{summary.total_booths || 8}</strong>,
          {' '}<strong>A1</strong> &amp; <strong>A{summary.total_booths || 8}</strong>,
          {' '}<strong>Booth-1</strong> &amp; <strong>Booth-{summary.total_booths || 8}</strong>.
        </p>
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['3xs'] }}>
              First booth label
            </label>
            <input
              type="text"
              value={labelStart}
              onChange={(e) => setLabelStart(e.target.value)}
              placeholder="e.g., 1 or A1"
              disabled={labelsLoading}
              maxLength={50}
              style={{
                width: '100%',
                padding: `${spacing['3xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={{ display: 'block', fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['3xs'] }}>
              Last booth label
            </label>
            <input
              type="text"
              value={labelEnd}
              onChange={(e) => setLabelEnd(e.target.value)}
              placeholder="e.g., 8 or A8"
              disabled={labelsLoading}
              maxLength={50}
              style={{
                width: '100%',
                padding: `${spacing['3xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={handleSaveLabels}
            disabled={labelsLoading || !labelsDirty}
            style={{
              padding: `${spacing['3xs']} ${spacing.sm}`,
              backgroundColor: labelsDirty ? colors.primary : colors.surfaceBase,
              color: labelsDirty ? 'white' : colors.textMuted,
              border: labelsDirty ? 'none' : `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              cursor: labelsLoading || !labelsDirty ? 'not-allowed' : 'pointer',
              opacity: labelsLoading ? 0.6 : 1,
              minHeight: 32,
            }}
          >
            {labelsLoading ? 'Saving…' : 'Save labels'}
          </button>
          {labelsSavedFlash && (
            <span style={{ color: '#155724', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, alignSelf: 'center' }}>
              ✓ Saved
            </span>
          )}
        </div>
        {previewSnippet && (
          <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: colors.textMuted }}>
            Generated sequence: <span style={{ color: colors.textPrimary, fontFamily: 'monospace' }}>{previewSnippet}</span>
            {' '}({previewSequence.length} label{previewSequence.length === 1 ? '' : 's'})
          </div>
        )}
        {labelsError && (
          <div style={{ marginTop: spacing['2xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>
            {labelsError}
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
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Total booths</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{summary.total_booths}</div>
        </div>
        <div>
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Size tiers</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{summary.size_tier_count}</div>
        </div>
        <div>
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Max weekly revenue</div>
          <div style={{ fontWeight: typography.weights.semibold }}>
            {formatPriceFromCents(summary.max_weekly_revenue_cents)}
          </div>
        </div>
      </div>

      {/* Existing tiers */}
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
                        {row.size_label}
                        {row.dimensions && (
                          <span style={{ marginLeft: spacing['2xs'], color: colors.textMuted, fontWeight: typography.weights.normal }}>
                            · {row.dimensions}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        {row.count} {row.count === 1 ? 'booth' : 'booths'} · {formatPriceFromCents(row.weekly_price_cents)}/week each
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
                        onClick={() => requestDelete(row.id, row.size_label)}
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
                        value={editForm.size_label}
                        onChange={(e) => setEditForm((s) => ({ ...s, size_label: e.target.value }))}
                        placeholder="Size label"
                        disabled={isLoading}
                        style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
                      <input
                        type="text"
                        value={editForm.dimensions}
                        onChange={(e) => setEditForm((s) => ({ ...s, dimensions: e.target.value }))}
                        placeholder="Dimensions (optional)"
                        disabled={isLoading}
                        style={{ flex: '1 1 160px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                      <input
                        type="number"
                        min={0}
                        value={editForm.count}
                        onChange={(e) => setEditForm((s) => ({ ...s, count: e.target.value }))}
                        placeholder="Count"
                        disabled={isLoading}
                        style={{ flex: '1 1 100px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editForm.weekly_price_dollars}
                        onChange={(e) => setEditForm((s) => ({ ...s, weekly_price_dollars: e.target.value }))}
                        placeholder="Weekly price ($)"
                        disabled={isLoading}
                        style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                      />
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

      {/* Add tier form */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px dashed ${colors.border}`,
        borderRadius: radius.sm,
      }}>
        <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
          Add a booth size tier
        </div>
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={addForm.size_label}
            onChange={(e) => setAddForm((s) => ({ ...s, size_label: e.target.value }))}
            placeholder="Size label (e.g., 10x10)"
            disabled={addLoading}
            style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
          />
          <input
            type="text"
            value={addForm.dimensions}
            onChange={(e) => setAddForm((s) => ({ ...s, dimensions: e.target.value }))}
            placeholder="Dimensions (optional)"
            disabled={addLoading}
            style={{ flex: '1 1 160px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
          />
          <input
            type="number"
            min={0}
            value={addForm.count}
            onChange={(e) => setAddForm((s) => ({ ...s, count: e.target.value }))}
            placeholder="Count"
            disabled={addLoading}
            style={{ flex: '1 1 100px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={addForm.weekly_price_dollars}
            onChange={(e) => setAddForm((s) => ({ ...s, weekly_price_dollars: e.target.value }))}
            placeholder="Weekly price ($)"
            disabled={addLoading}
            style={{ flex: '1 1 140px', padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
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
            {addLoading ? 'Adding…' : 'Add tier'}
          </button>
        </div>
        {addError && (
          <div style={{ marginTop: spacing['2xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>
            {addError}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmingDelete}
        title="Remove tier?"
        message={`Remove the "${confirmingDelete?.label ?? ''}" tier? Tiers with active bookings cannot be removed — vendors with paid or pending rentals must finish or cancel first. Vendors already assigned a booth number from this size keep their booth assignment.`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={performDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  )
}
