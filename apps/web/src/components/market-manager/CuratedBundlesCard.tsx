'use client'

import { useState, useEffect, useCallback } from 'react'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import DashboardCard from '@/components/dashboard/DashboardCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { formatPrice } from '@/lib/pricing'
import { bundleDisplayPriceCents, BUNDLE_LIMITS } from '@/lib/bundles/core'

/**
 * Curated Bundles — manager create/edit + run sheet (mig 244,
 * market_bundles_build_plan.md).
 *
 * The manager assembles items from several vendors into one purchase at a
 * fixed margin. Lifecycle on this card: compose → submit (pending approval)
 * → admin approves → active (sellable on the market page) → per sold order:
 * collect components (each vendor marks their own handoff via fulfill) →
 * "Ready — notify buyer" → buyer collects → "Mark handed off" (this is the
 * moment the margin pays out — the ONE money button here).
 *
 * Price math comes from lib/bundles/core.ts — the same function checkout
 * charges with, so the preview here can never disagree with Stripe.
 */

interface CuratedBundlesCardProps {
  marketId: string
}

interface ComponentRow { listing_id: string; quantity: number }
interface BundleRow {
  id: string
  name: string
  description: string | null
  margin_cents: number
  quantity_limit: number
  quantity_sold: number
  status: string
  justification: string | null
  pickup_market_date: string | null
  pickup_notes: string | null
  cause_beneficiary_id: string | null
  cause_pct: number | null
  market_bundle_components: ComponentRow[]
}
interface AvailableListing {
  id: string
  title: string
  price_cents: number
  vendor_profile_id: string
  vendor_name: string
}
interface OrderItemRow { listing_id: string; quantity: number; status: string }
interface BundleOrderRow {
  id: string
  order_number: string
  status: string
  created_at: string
  bundle_id: string
  bundle_margin_cents: number
  bundle_handed_off_at: string | null
  bundle_margin_transfer_id: string | null
  order_items: OrderItemRow[]
}
interface Beneficiary { id: string; name: string }

const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  pending_approval: { label: 'Awaiting approval', bg: '#fef3c7', fg: '#92400e' },
  active: { label: 'Active', bg: '#dcfce7', fg: '#166534' },
  rejected: { label: 'Not approved', bg: '#fee2e2', fg: '#991b1b' },
  archived: { label: 'Archived', bg: '#e5e7eb', fg: '#4b5563' },
  draft: { label: 'Draft', bg: '#e5e7eb', fg: '#4b5563' },
}

interface FormState {
  name: string
  description: string
  marginDollars: string
  quantityLimit: string
  pickupMarketDate: string
  pickupNotes: string
  justification: string
  causeBeneficiaryId: string
  causePct: string
  components: Map<string, number> // listingId → quantity
}

const emptyForm = (): FormState => ({
  name: '', description: '', marginDollars: '', quantityLimit: '5',
  pickupMarketDate: '', pickupNotes: '', justification: '',
  causeBeneficiaryId: '', causePct: '',
  components: new Map(),
})

export default function CuratedBundlesCard({ marketId }: CuratedBundlesCardProps) {
  const [bundles, setBundles] = useState<BundleRow[] | null>(null)
  const [orders, setOrders] = useState<BundleOrderRow[]>([])
  const [available, setAvailable] = useState<AvailableListing[]>([])
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([])
  const [listingTitles, setListingTitles] = useState<Map<string, { title: string; price_cents: number }>>(new Map())

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<BundleRow | null>(null)
  const [orderBusy, setOrderBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/bundles`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setBundles((data.bundles as BundleRow[]) || [])
        setOrders((data.orders as BundleOrderRow[]) || [])
        setAvailable((data.availableListings as AvailableListing[]) || [])
        setBeneficiaries((data.beneficiaries as Beneficiary[]) || [])
        const titles = new Map<string, { title: string; price_cents: number }>()
        for (const l of ((data.listings as Array<{ id: string; title: string; price_cents: number }>) || [])) {
          titles.set(l.id, { title: l.title, price_cents: l.price_cents })
        }
        for (const l of ((data.availableListings as AvailableListing[]) || [])) {
          titles.set(l.id, { title: l.title, price_cents: l.price_cents })
        }
        setListingTitles(titles)
      } else {
        setBundles([])
      }
    } catch {
      setBundles([])
    }
  }, [marketId])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
    setResult(null)
  }

  const openEdit = (b: BundleRow) => {
    setEditingId(b.id)
    setForm({
      name: b.name,
      description: b.description || '',
      marginDollars: (b.margin_cents / 100).toFixed(2),
      quantityLimit: String(b.quantity_limit),
      pickupMarketDate: b.pickup_market_date || '',
      pickupNotes: b.pickup_notes || '',
      justification: b.justification || '',
      causeBeneficiaryId: b.cause_beneficiary_id || '',
      causePct: b.cause_pct != null ? String(b.cause_pct) : '',
      components: new Map(b.market_bundle_components.map(c => [c.listing_id, c.quantity])),
    })
    setFormOpen(true)
    setResult(null)
  }

  const toggleComponent = (listingId: string) => {
    setForm(f => {
      const next = new Map(f.components)
      if (next.has(listingId)) next.delete(listingId)
      else next.set(listingId, 1)
      return { ...f, components: next }
    })
  }

  const setComponentQty = (listingId: string, qty: number) => {
    setForm(f => {
      const next = new Map(f.components)
      next.set(listingId, Math.max(1, Math.min(25, qty)))
      return { ...f, components: next }
    })
  }

  const componentSumCents = [...form.components.entries()].reduce((sum, [id, qty]) => {
    const l = listingTitles.get(id)
    return sum + (l ? l.price_cents * qty : 0)
  }, 0)
  const marginCents = Math.round(parseFloat(form.marginDollars || '0') * 100) || 0
  const previewPriceCents = bundleDisplayPriceCents(componentSumCents, marginCents)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        marginCents,
        quantityLimit: parseInt(form.quantityLimit, 10),
        pickupMarketDate: form.pickupMarketDate,
        pickupNotes: form.pickupNotes || undefined,
        justification: form.justification,
        components: [...form.components.entries()].map(([listingId, quantity]) => ({ listingId, quantity })),
        causeBeneficiaryId: form.causeBeneficiaryId || null,
        causePct: form.causeBeneficiaryId ? (parseInt(form.causePct, 10) || null) : null,
      }
      const res = await fetch(
        editingId
          ? `/api/market-manager/${marketId}/bundles/${editingId}`
          : `/api/market-manager/${marketId}/bundles`,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult({
          type: 'success',
          text: data.status === 'active'
            ? 'Saved.'
            : 'Submitted for approval — you\'ll see it go Active once an admin reviews it.',
        })
        setFormOpen(false)
        load()
      } else {
        setResult({ type: 'error', text: data.error || 'Could not save the bundle.' })
      }
    } catch {
      setResult({ type: 'error', text: 'Something went wrong saving the bundle.' })
    } finally {
      setBusy(false)
    }
  }

  const archive = async (bundleId: string) => {
    await fetch(`/api/market-manager/${marketId}/bundles/${bundleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive' }),
    })
    setArchiveTarget(null)
    load()
  }

  const notifyReady = async (orderId: string) => {
    setOrderBusy(orderId)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/bundles/orders/${orderId}/notify-ready`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      setResult(res.ok
        ? { type: 'success', text: data.sent ? 'Buyer notified.' : 'Buyer was already notified.' }
        : { type: 'error', text: data.error || 'Could not notify the buyer.' })
    } finally {
      setOrderBusy(null)
    }
  }

  const markHandedOff = async (orderId: string) => {
    setOrderBusy(orderId)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/bundles/orders/${orderId}/handoff`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const margin = data.margin as { status: string } | undefined
        setResult({
          type: 'success',
          text: margin?.status === 'paid'
            ? 'Handed off — your margin is on its way to your payout account.'
            : margin?.status === 'pending'
              ? 'Handed off. The margin payout needs attention — the platform has been notified.'
              : 'Handed off.',
        })
        load()
      } else {
        setResult({ type: 'error', text: data.error || 'Could not record the handoff.' })
      }
    } finally {
      setOrderBusy(null)
    }
  }

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: spacing.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
  }
  const labelStyle = {
    display: 'block',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing['3xs'],
    marginTop: spacing.sm,
  }

  return (
    <DashboardCard
      title="Curated bundles"
      description={`Assemble items from several of your market's vendors into one purchase — you set a margin for the curation and assembly work, vendors sell at their full listed price, and your margin pays out when you hand the bundle to the buyer. Each bundle needs a quick platform approval before it goes on sale.`}
    >
      {result && (
        <div style={{
          marginBottom: spacing.sm,
          padding: `${spacing.xs} ${spacing.sm}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          backgroundColor: result.type === 'success' ? statusColors.successLight : statusColors.dangerLight,
          color: result.type === 'success' ? statusColors.successDark : statusColors.dangerDark,
          border: `1px solid ${result.type === 'success' ? statusColors.successBorder : statusColors.dangerBorder}`,
        }}>
          {result.text}
        </div>
      )}

      {bundles === null ? (
        <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading…</div>
      ) : (
        <>
          {/* Bundle list */}
          {bundles.length === 0 && !formOpen && (
            <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.sm }}>
              No bundles yet. A good first bundle: one ready-to-use collection (&ldquo;Farm Dinner Box&rdquo;, &ldquo;Saturday Brunch Kit&rdquo;) from 3–5 vendors.
            </div>
          )}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {bundles.map(b => {
              const chip = STATUS_LABELS[b.status] || STATUS_LABELS.draft
              const bundleOrders = orders.filter(o => o.bundle_id === b.id)
              const sumCents = b.market_bundle_components.reduce((s, c) => {
                const l = listingTitles.get(c.listing_id)
                return s + (l ? l.price_cents * c.quantity : 0)
              }, 0)
              return (
                <li key={b.id} style={{ padding: spacing.sm, backgroundColor: colors.surfaceBase, border: `1px solid ${colors.border}`, borderRadius: radius.sm }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                      🧺 {b.name}
                    </span>
                    <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: chip.fg, backgroundColor: chip.bg, padding: `${spacing['3xs']} ${spacing.xs}`, borderRadius: radius.sm }}>
                      {chip.label}
                    </span>
                  </div>
                  <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                    {b.market_bundle_components.length} items · buyer pays {formatPrice(bundleDisplayPriceCents(sumCents, b.margin_cents))} · your margin {formatPrice(b.margin_cents)}
                    {b.cause_pct ? ` (${b.cause_pct}% to your cause)` : ''}
                    {b.pickup_market_date ? ` · pickup ${b.pickup_market_date}` : ''}
                    {b.status === 'active' ? ` · sold ${b.quantity_sold} of ${b.quantity_limit}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                    {b.status !== 'archived' && (
                      <button onClick={() => openEdit(b)} style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: 'white', color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, cursor: 'pointer' }}>
                        Edit
                      </button>
                    )}
                    {(b.status === 'active' || b.status === 'pending_approval') && (
                      <button onClick={() => setArchiveTarget(b)} style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: 'white', color: statusColors.danger, border: `1px solid ${statusColors.dangerBorder}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, cursor: 'pointer' }}>
                        Stop selling
                      </button>
                    )}
                  </div>

                  {/* Run sheet — sold orders for this bundle */}
                  {bundleOrders.length > 0 && (
                    <div style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTop: `1px dashed ${colors.border}` }}>
                      <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
                        Run sheet — {bundleOrders.length} sold
                      </div>
                      {bundleOrders.map(o => {
                        const openItems = o.order_items.filter(i => i.status !== 'fulfilled' && i.status !== 'cancelled')
                        const paidOut = !!o.bundle_margin_transfer_id && o.bundle_margin_transfer_id !== 'pending'
                        return (
                          <div key={o.id} style={{ padding: spacing.xs, marginBottom: spacing.xs, backgroundColor: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.sm }}>
                            <div style={{ fontSize: typography.sizes.xs, color: colors.textPrimary, fontWeight: typography.weights.semibold }}>
                              #{o.order_number}
                              {o.bundle_handed_off_at
                                ? paidOut ? ' · ✅ handed off — margin paid' : ' · handed off — margin payout in progress'
                                : openItems.length > 0
                                  ? ` · ${openItems.length} item(s) still to collect from vendors`
                                  : ' · all components collected — assemble & hand off'}
                            </div>
                            <ul style={{ margin: `${spacing['3xs']} 0 0`, paddingLeft: spacing.md, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                              {o.order_items.map((i, idx) => (
                                <li key={idx}>
                                  {i.quantity}× {listingTitles.get(i.listing_id)?.title || 'Item'} — {i.status === 'fulfilled' ? '✓ collected' : i.status}
                                </li>
                              ))}
                            </ul>
                            {!o.bundle_handed_off_at && (
                              <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => notifyReady(o.id)}
                                  disabled={orderBusy === o.id}
                                  style={{ padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: 'white', color: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, cursor: 'pointer' }}
                                >
                                  Ready — notify buyer
                                </button>
                                <button
                                  onClick={() => markHandedOff(o.id)}
                                  disabled={orderBusy === o.id || openItems.length > 0}
                                  title={openItems.length > 0 ? 'Every vendor marks their handoff to you first' : undefined}
                                  style={{
                                    padding: `${spacing['3xs']} ${spacing.sm}`,
                                    backgroundColor: openItems.length > 0 ? colors.border : colors.primary,
                                    color: 'white', border: 'none', borderRadius: radius.sm,
                                    fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
                                    cursor: openItems.length > 0 ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  {orderBusy === o.id ? 'Working…' : 'Mark handed off'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Create / edit form */}
          {formOpen ? (
            <div style={{ marginTop: spacing.md, padding: spacing.sm, border: `1px solid ${colors.border}`, borderRadius: radius.sm, backgroundColor: colors.surfaceBase }}>
              <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginBottom: spacing.xs }}>
                {editingId ? 'Edit bundle' : 'New bundle'}
              </div>

              <label style={labelStyle}>Bundle name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value.slice(0, 120) }))} placeholder={`e.g. "Farm Dinner Box"`} style={inputStyle} />

              <label style={labelStyle}>Description shown to buyers (optional)</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value.slice(0, 600) }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

              <label style={labelStyle}>Items in the bundle (pick at least 2)</label>
              {available.length === 0 ? (
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, fontStyle: 'italic' }}>
                  No published listings from opted-in vendors at this market yet.
                </div>
              ) : (
                <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: radius.sm, backgroundColor: 'white' }}>
                  {available.map(l => {
                    const selected = form.components.has(l.id)
                    return (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing['3xs']} ${spacing.sm}`, borderBottom: `1px solid ${colors.surfaceBase}` }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleComponent(l.id)} id={`bundle-item-${l.id}`} />
                        <label htmlFor={`bundle-item-${l.id}`} style={{ flex: 1, fontSize: typography.sizes.xs, color: colors.textPrimary, cursor: 'pointer' }}>
                          {l.title} <span style={{ color: colors.textMuted }}>· {l.vendor_name} · {formatPrice(l.price_cents)}</span>
                        </label>
                        {selected && (
                          <input
                            type="number" min={1} max={25}
                            value={form.components.get(l.id) ?? 1}
                            onChange={e => setComponentQty(l.id, parseInt(e.target.value, 10) || 1)}
                            style={{ width: 52, padding: spacing['3xs'], border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.xs }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={labelStyle}>Your margin ($)</label>
                  <input type="number" min={0} step="0.01" value={form.marginDollars} onChange={e => setForm(f => ({ ...f, marginDollars: e.target.value }))} placeholder="15.00" style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={labelStyle}>How many to sell (max {BUNDLE_LIMITS.maxQuantityPerBundle})</label>
                  <input type="number" min={1} max={BUNDLE_LIMITS.maxQuantityPerBundle} value={form.quantityLimit} onChange={e => setForm(f => ({ ...f, quantityLimit: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Pickup market day</label>
                  <input type="date" value={form.pickupMarketDate} onChange={e => setForm(f => ({ ...f, pickupMarketDate: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              <label style={labelStyle}>Where at the market buyers collect it (optional)</label>
              <input type="text" value={form.pickupNotes} onChange={e => setForm(f => ({ ...f, pickupNotes: e.target.value.slice(0, 200) }))} placeholder="e.g. the info booth at the main entrance" style={inputStyle} />

              <label style={labelStyle}>What value do you add? (the approval reviewer reads this)</label>
              <textarea value={form.justification} onChange={e => setForm(f => ({ ...f, justification: e.target.value.slice(0, 1000) }))} rows={2} placeholder="e.g. I select the best of each vendor's harvest that morning and assemble a complete dinner for four." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

              {beneficiaries.length > 0 && (
                <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: 160 }}>
                    <label style={labelStyle}>Support a cause with this bundle (optional)</label>
                    <select value={form.causeBeneficiaryId} onChange={e => setForm(f => ({ ...f, causeBeneficiaryId: e.target.value }))} style={inputStyle}>
                      <option value="">No cause</option>
                      {beneficiaries.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  {form.causeBeneficiaryId && (
                    <div style={{ flex: 1, minWidth: 110 }}>
                      <label style={labelStyle}>% of your margin</label>
                      <input type="number" min={1} max={100} value={form.causePct} onChange={e => setForm(f => ({ ...f, causePct: e.target.value }))} placeholder="25" style={inputStyle} />
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: spacing.sm, padding: spacing.xs, backgroundColor: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, color: colors.textPrimary }}>
                Items total {formatPrice(componentSumCents)} + your margin {formatPrice(marginCents)} → <strong>buyer pays {formatPrice(previewPriceCents)}</strong> (+ the standard per-order service fee). The item prices always follow the vendors&apos; live prices.
              </div>

              <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.sm, justifyContent: 'flex-end' }}>
                <button onClick={() => setFormOpen(false)} disabled={busy} style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: 'white', color: colors.textPrimary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={busy || form.components.size < 2 || !form.name.trim() || !form.pickupMarketDate}
                  style={{
                    padding: `${spacing.xs} ${spacing.md}`,
                    backgroundColor: busy || form.components.size < 2 || !form.name.trim() || !form.pickupMarketDate ? colors.border : colors.primary,
                    color: 'white', border: 'none', borderRadius: radius.sm,
                    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {busy ? 'Saving…' : editingId ? 'Save changes' : 'Submit for approval'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openCreate} style={{ marginTop: spacing.sm, padding: `${spacing.xs} ${spacing.md}`, backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, cursor: 'pointer' }}>
              + New bundle
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        title="Stop selling this bundle?"
        message={`"${archiveTarget?.name}" comes off the market page immediately. Orders already sold stay on your run sheet — collect, assemble, and hand them off as normal.`}
        confirmLabel="Stop selling"
        variant="danger"
        onConfirm={() => archiveTarget && archive(archiveTarget.id)}
        onCancel={() => setArchiveTarget(null)}
      />
    </DashboardCard>
  )
}
