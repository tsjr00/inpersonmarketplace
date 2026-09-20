'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { term } from '@/lib/vertical/terminology'
import {
  summarizeBoothInventory,
  tierLabels,
  describeTierLabels,
  validateTierLabelsInput,
  parseLabelList,
  type BoothInventoryRow,
  type BoothInventoryInput,
  type BoothNumberingScheme,
  type TierLabelsInput,
} from '@/lib/markets/booth-types'
import BoothNumberingHelp from './BoothNumberingHelp'

interface BoothInventoryManagerProps {
  marketId: string
  vertical: string
}

/**
 * Manager-side CRUD for booth size tiers (market_booth_inventory rows).
 *
 * ⚠️ One bundled weekly price per tier — no line-item amenity charges (tables,
 * chairs, power). A separately-stated amenity charge is taxable in Texas even
 * though the booth fee itself is not. See the tax design constraint in
 * `lib/markets/booth-types.ts` before adding any priced option here.
 *
 * Mig 258 (booth numbering Option U, owner 2026-09-20 — booth_numbering_design.md):
 *   - The scheme question comes first: "new market" → every size is a lettered
 *     range (A1…, B1…; letter required, pre-filled); "existing numbers" → a
 *     range with any/no prefix OR an explicit list of the labels already on the
 *     ground. Stored once on markets.booth_numbering_scheme; changeable here.
 *   - Each tier OWNS its booth numbers. `count` is derived from them (shown,
 *     not typed) — a tier with no numbers yet is flagged and is not bookable.
 *   - The market-wide first/last label section (mig 144) is gone; the map of
 *     what was saved + the ONE helper paragraph (BoothNumberingHelp) replace it.
 *
 * Backend:
 *   - GET    /api/market-manager/[marketId]/booth-inventory   (+ booth_numbering_scheme)
 *   - POST   /api/market-manager/[marketId]/booth-inventory   (body incl. `labels`)
 *   - PATCH  /api/market-manager/[marketId]/booth-inventory/[id]
 *   - DELETE /api/market-manager/[marketId]/booth-inventory/[id]
 *   - PUT    /api/market-manager/[marketId]/booth-labels       { booth_numbering_scheme }
 */

type LabelShape = 'range' | 'list'

interface TierForm {
  size_label: string
  dimensions: string
  weekly_price_dollars: string
  shape: LabelShape
  prefix: string
  start: string
  end: string
  listText: string
}

const emptyForm = (prefix = ''): TierForm => ({
  size_label: '', dimensions: '', weekly_price_dollars: '',
  shape: 'range', prefix, start: '1', end: '', listText: '',
})

function formToLabels(f: TierForm): TierLabelsInput {
  if (f.shape === 'list') {
    const labels = parseLabelList(f.listText)
    return labels.length > 0 ? { shape: 'list', labels } : null
  }
  if (f.start.trim() === '' && f.end.trim() === '') return null
  return { shape: 'range', prefix: f.prefix.trim(), start: Number(f.start), end: Number(f.end) }
}

/** Next letter no other tier uses as its prefix — the lettered default (N-10). */
function nextFreeLetter(rows: BoothInventoryRow[], excludeId?: string): string {
  const used = new Set(rows.filter((r) => r.id !== excludeId).map((r) => (r.label_prefix ?? '').toUpperCase()))
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i)
    if (!used.has(letter)) return letter
  }
  return ''
}

const inputStyle = {
  padding: `${spacing['3xs']} ${spacing.xs}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
} as const

export default function BoothInventoryManager({ marketId, vertical }: BoothInventoryManagerProps) {
  const booth = term(vertical, 'booth').toLowerCase()
  const booths = term(vertical, 'booths').toLowerCase()

  const [rows, setRows] = useState<BoothInventoryRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scheme, setScheme] = useState<BoothNumberingScheme | null>(null)
  const [schemeSaving, setSchemeSaving] = useState(false)
  const [schemeError, setSchemeError] = useState<string | null>(null)
  const [changingScheme, setChangingScheme] = useState(false)

  const [addForm, setAddForm] = useState<TierForm>(emptyForm('A'))
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TierForm>(emptyForm())
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
        setLoadError(data.error || `Failed to load ${booth} inventory`)
        setRows([])
        return
      }
      const loaded = (data.inventory || []) as BoothInventoryRow[]
      setRows(loaded)
      setScheme((data.booth_numbering_scheme as BoothNumberingScheme | null) ?? null)
      setAddForm((f) => ({ ...f, prefix: nextFreeLetter(loaded) }))
    } catch {
      setLoadError('Network error loading inventory')
      setRows([])
    }
  }

  useEffect(() => {
    loadInventory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId])

  const formatPriceFromCents = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const dollarsToCents = (val: string): number => {
    const n = Number(val)
    if (!Number.isFinite(n)) return NaN
    return Math.round(n * 100)
  }

  const saveScheme = async (next: BoothNumberingScheme) => {
    setSchemeSaving(true)
    setSchemeError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booth_numbering_scheme: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSchemeError(data.error || 'Could not save')
        return
      }
      setScheme(next)
      setChangingScheme(false)
      setAddForm((f) => ({ ...f, shape: 'range', prefix: next === 'lettered' ? nextFreeLetter(rows ?? []) : f.prefix }))
    } catch {
      setSchemeError('Network error')
    } finally {
      setSchemeSaving(false)
    }
  }

  /** Shared validation for add + edit. Returns the request body or an error. */
  const buildInput = (f: TierForm): { input: BoothInventoryInput } | { error: string } => {
    const labels = formToLabels(f)
    const input: BoothInventoryInput = {
      size_label: f.size_label.trim(),
      dimensions: f.dimensions.trim() || null,
      count: 0,
      weekly_price_cents: dollarsToCents(f.weekly_price_dollars),
      labels,
    }
    if (!input.size_label) return { error: 'Size label is required' }
    if (!Number.isFinite(input.weekly_price_cents) || input.weekly_price_cents < 0) return { error: 'Weekly price must be a non-negative number' }
    if (!labels) return { error: `Give this size its ${booth} numbers — a size without numbers can't be booked.` }
    const labelsError = validateTierLabelsInput(labels, scheme)
    if (labelsError) return { error: labelsError }
    return { input }
  }

  const handleAdd = async () => {
    setAddError(null)
    const built = buildInput(addForm)
    if ('error' in built) { setAddError(built.error); return }
    setAddLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddError(data.error || 'Failed to add tier')
      } else {
        setAddForm(emptyForm(nextFreeLetter([...(rows ?? []), data.row as BoothInventoryRow])))
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
    const isList = Array.isArray(row.labels) && row.labels.length > 0
    setEditForm({
      size_label: row.size_label,
      dimensions: row.dimensions ?? '',
      weekly_price_dollars: (row.weekly_price_cents / 100).toFixed(2),
      shape: isList ? 'list' : 'range',
      prefix: row.label_prefix ?? (scheme === 'lettered' ? nextFreeLetter(rows ?? [], row.id) : ''),
      start: typeof row.label_start === 'number' ? String(row.label_start) : '1',
      end: typeof row.label_end === 'number' ? String(row.label_end) : (row.count > 0 ? String(row.count) : ''),
      listText: isList ? (row.labels as string[]).join(', ') : '',
    })
    setRowError((s) => ({ ...s, [row.id]: '' }))
  }

  const cancelEdit = () => setEditingId(null)

  const handleSave = async (id: string) => {
    const built = buildInput(editForm)
    if ('error' in built) { setRowError((s) => ({ ...s, [id]: built.error })); return }
    setRowLoading(id)
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.input),
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

  const requestDelete = (id: string, label: string) => setConfirmingDelete({ id, label })

  const performDelete = async () => {
    if (!confirmingDelete) return
    const { id } = confirmingDelete
    setConfirmingDelete(null)
    setRowLoading(id)
    setRowError((s) => ({ ...s, [id]: '' }))
    try {
      const res = await fetch(`/api/market-manager/${marketId}/booth-inventory/${id}`, { method: 'DELETE' })
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

  if (rows === null) {
    return <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading {booth} inventory…</div>
  }

  if (loadError) {
    return (
      <div style={{ padding: spacing.sm, backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: radius.sm, fontSize: typography.sizes.sm }}>
        {loadError}
      </div>
    )
  }

  const summary = summarizeBoothInventory(rows)
  const mapTiers = rows.map((r) => ({ size_label: r.size_label, description: describeTierLabels(r) }))
  const numberingLocked = scheme === null

  /** The booth-numbers fields, shared by the add form and the row editor. */
  const renderLabelFields = (f: TierForm, set: (next: TierForm) => void, disabled: boolean) => {
    const preview = tierLabels(f.shape === 'list'
      ? { labels: parseLabelList(f.listText) }
      : { label_prefix: f.prefix.trim(), label_start: Number(f.start), label_end: Number(f.end) })
    const previewText = preview.length === 0 ? ''
      : preview.length <= 5 ? preview.join(', ')
      : `${preview.slice(0, 4).join(', ')}, …, ${preview[preview.length - 1]}`
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
          {term(vertical, 'booth')} numbers for this size
          {scheme === 'existing' && (
            <span style={{ marginLeft: spacing.xs }}>
              <label style={{ marginRight: spacing.xs, cursor: 'pointer' }}>
                <input type="radio" name={`shape-${f === addForm ? 'add' : 'edit'}`} checked={f.shape === 'range'} onChange={() => set({ ...f, shape: 'range' })} disabled={disabled} /> a range
              </label>
              <label style={{ cursor: 'pointer' }}>
                <input type="radio" name={`shape-${f === addForm ? 'add' : 'edit'}`} checked={f.shape === 'list'} onChange={() => set({ ...f, shape: 'list' })} disabled={disabled} /> a list
              </label>
            </span>
          )}
        </div>
        {f.shape === 'range' ? (
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              value={f.prefix}
              onChange={(e) => set({ ...f, prefix: e.target.value })}
              placeholder={scheme === 'lettered' ? 'Letter' : 'Prefix (optional)'}
              disabled={disabled}
              maxLength={20}
              title={scheme === 'lettered' ? 'The letter for this size — A gives A1, A2, A3…' : 'Text before the number, or leave blank for plain numbers'}
              style={{ ...inputStyle, width: 110 }}
            />
            <input type="number" min={0} value={f.start} onChange={(e) => set({ ...f, start: e.target.value })} placeholder="First #" disabled={disabled} style={{ ...inputStyle, width: 90 }} />
            <span style={{ color: colors.textMuted }}>to</span>
            <input type="number" min={0} value={f.end} onChange={(e) => set({ ...f, end: e.target.value })} placeholder="Last #" disabled={disabled} style={{ ...inputStyle, width: 90 }} />
          </div>
        ) : (
          <input
            type="text"
            value={f.listText}
            onChange={(e) => set({ ...f, listText: e.target.value })}
            placeholder="The labels as painted, comma-separated — e.g. 3, 5, 7 or Pavilion, Corner"
            disabled={disabled}
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          />
        )}
        {previewText && (
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
            = <span style={{ color: colors.textPrimary, fontFamily: 'monospace' }}>{previewText}</span> ({preview.length} {preview.length === 1 ? booth : booths})
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* ① The scheme question (N-10) — asked once, first. */}
      {(numberingLocked || changingScheme) ? (
        <div style={{ padding: spacing.sm, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: radius.sm }}>
          <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing['3xs'] }}>
            Is this a new {term(vertical, 'market').toLowerCase()}, or does it already have {booth} numbers?
          </div>
          <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: 1.5 }}>
            This decides how you&apos;ll number your {booths}. You can change it later from this card.
          </p>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => saveScheme('lettered')}
              disabled={schemeSaving}
              style={{ padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, cursor: 'pointer', textAlign: 'left' }}
            >
              New {term(vertical, 'market').toLowerCase()} — number {booths} by size
              <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.normal, opacity: 0.9 }}>Each size gets a letter: A1, A2, A3… / B1, B2…</div>
            </button>
            <button
              type="button"
              onClick={() => saveScheme('existing')}
              disabled={schemeSaving}
              style={{ padding: `${spacing['2xs']} ${spacing.sm}`, backgroundColor: 'white', color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, cursor: 'pointer', textAlign: 'left' }}
            >
              Existing {term(vertical, 'market').toLowerCase()} — keep the numbers we already use
              <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.normal, color: colors.textMuted }}>Enter your numbers as they are painted; ranges or lists</div>
            </button>
            {changingScheme && (
              <button type="button" onClick={() => setChangingScheme(false)} style={{ background: 'transparent', border: 'none', color: colors.textMuted, fontSize: typography.sizes.xs, cursor: 'pointer' }}>Cancel</button>
            )}
          </div>
          {schemeError && <div style={{ marginTop: spacing['2xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>{schemeError}</div>}
        </div>
      ) : (
        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
          Numbering: <strong style={{ color: colors.textPrimary }}>{scheme === 'lettered' ? 'by size, lettered (A1, B1…)' : 'existing numbers, as painted'}</strong>
          {' · '}
          <button type="button" onClick={() => setChangingScheme(true)} style={{ background: 'transparent', border: 'none', color: colors.primary, fontSize: typography.sizes.xs, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>change</button>
        </div>
      )}

      {/* ② The map + the one helper paragraph (replaces the mig-144 market-wide range). */}
      <BoothNumberingHelp vertical={vertical} tiers={mapTiers} />

      {/* Summary row */}
      <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap', padding: spacing.sm, backgroundColor: colors.surfaceBase, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}>
        <div>
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Total {booths}</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{summary.total_booths}</div>
        </div>
        <div>
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Size tiers</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{summary.size_tier_count}</div>
        </div>
        <div>
          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>Max weekly revenue</div>
          <div style={{ fontWeight: typography.weights.semibold }}>{formatPriceFromCents(summary.max_weekly_revenue_cents)}</div>
        </div>
      </div>

      {/* Existing tiers */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {rows.map((row) => {
            const isEditing = editingId === row.id
            const isLoading = rowLoading === row.id
            const desc = describeTierLabels(row)

            return (
              <div key={row.id} style={{ padding: spacing.sm, backgroundColor: colors.surfaceElevated, border: `1px solid ${desc ? colors.border : '#fcd34d'}`, borderRadius: radius.sm }}>
                {!isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>
                        {row.size_label}
                        {row.dimensions && (
                          <span style={{ marginLeft: spacing['2xs'], color: colors.textMuted, fontWeight: typography.weights.normal }}>· {row.dimensions}</span>
                        )}
                      </div>
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        {desc ? (
                          <>
                            <span style={{ color: colors.textPrimary, fontFamily: 'monospace' }}>{desc}</span>
                            {' · '}{row.count} {row.count === 1 ? booth : booths}
                          </>
                        ) : (
                          <span style={{ color: '#92400e', fontWeight: typography.weights.semibold }}>⚠ No {booth} numbers yet — not bookable. Edit to set them.</span>
                        )}
                        {' · '}{formatPriceFromCents(row.weekly_price_cents)}/week each
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: spacing['2xs'] }}>
                      <button onClick={() => startEdit(row)} disabled={isLoading || numberingLocked} style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: colors.surfaceBase, color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button onClick={() => requestDelete(row.id, row.size_label)} disabled={isLoading} style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: radius.sm, fontSize: typography.sizes.xs, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1 }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                      <input type="text" value={editForm.size_label} onChange={(e) => setEditForm((s) => ({ ...s, size_label: e.target.value }))} placeholder="Size label" disabled={isLoading} style={{ ...inputStyle, flex: '1 1 140px' }} />
                      <input type="text" value={editForm.dimensions} onChange={(e) => setEditForm((s) => ({ ...s, dimensions: e.target.value }))} placeholder="Dimensions (optional)" disabled={isLoading} style={{ ...inputStyle, flex: '1 1 160px' }} />
                      <input type="number" min={0} step="0.01" value={editForm.weekly_price_dollars} onChange={(e) => setEditForm((s) => ({ ...s, weekly_price_dollars: e.target.value }))} placeholder="Weekly price ($)" disabled={isLoading} style={{ ...inputStyle, flex: '1 1 140px' }} />
                    </div>
                    {renderLabelFields(editForm, setEditForm, isLoading)}
                    <div style={{ display: 'flex', gap: spacing.xs }}>
                      <button onClick={() => handleSave(row.id)} disabled={isLoading} style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.6 : 1 }}>
                        {isLoading ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={cancelEdit} disabled={isLoading} style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: 'transparent', color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {rowError[row.id] && (
                  <div style={{ marginTop: spacing['3xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>{rowError[row.id]}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add tier form */}
      <div style={{ padding: spacing.sm, backgroundColor: colors.surfaceBase, border: `1px dashed ${colors.border}`, borderRadius: radius.sm, opacity: numberingLocked ? 0.6 : 1 }}>
        <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm, marginBottom: spacing.xs }}>
          Add a {booth} size tier
        </div>
        {/* Tax design constraint — see lib/markets/booth-types.ts. A separately
            stated amenity charge is taxable in Texas even though the booth fee
            is not, so amenities must be priced INTO the weekly price. */}
        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs, lineHeight: 1.4 }}>
          <strong>Set one all-in weekly price per tier.</strong> Include any amenities you provide — tables, chairs,
          canopies, power — in that price. Don’t plan to bill vendors separately for add-ons; the platform
          intentionally doesn’t support separate amenity charges.
        </div>
        {numberingLocked && (
          <div style={{ fontSize: typography.sizes.xs, color: '#92400e', marginBottom: spacing.xs }}>Answer the numbering question above first.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <input type="text" value={addForm.size_label} onChange={(e) => setAddForm((s) => ({ ...s, size_label: e.target.value }))} placeholder="Size label (e.g., 10x10)" disabled={addLoading || numberingLocked} style={{ ...inputStyle, flex: '1 1 140px' }} />
            <input type="text" value={addForm.dimensions} onChange={(e) => setAddForm((s) => ({ ...s, dimensions: e.target.value }))} placeholder="Dimensions (optional)" disabled={addLoading || numberingLocked} style={{ ...inputStyle, flex: '1 1 160px' }} />
            <input type="number" min={0} step="0.01" value={addForm.weekly_price_dollars} onChange={(e) => setAddForm((s) => ({ ...s, weekly_price_dollars: e.target.value }))} placeholder="Weekly price ($)" disabled={addLoading || numberingLocked} style={{ ...inputStyle, flex: '1 1 140px' }} />
          </div>
          {renderLabelFields(addForm, setAddForm, addLoading || numberingLocked)}
          <div>
            <button onClick={handleAdd} disabled={addLoading || numberingLocked} style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, cursor: addLoading || numberingLocked ? 'not-allowed' : 'pointer', opacity: addLoading ? 0.6 : 1 }}>
              {addLoading ? 'Adding…' : 'Add tier'}
            </button>
          </div>
        </div>
        {addError && (
          <div style={{ marginTop: spacing['2xs'], color: '#991b1b', fontSize: typography.sizes.xs }}>{addError}</div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmingDelete}
        title="Remove tier?"
        message={`Remove the "${confirmingDelete?.label ?? ''}" tier? Tiers with active bookings cannot be removed — ${term(vertical, 'vendors').toLowerCase()} with paid or pending rentals must finish or cancel first. Its ${booth} numbers stop existing at this ${term(vertical, 'market').toLowerCase()}.`}
        variant="danger"
        confirmLabel="Remove"
        onConfirm={performDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  )
}
