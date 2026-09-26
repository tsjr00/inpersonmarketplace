'use client'

/**
 * TaxReversalsAdminPage — the sales-tax "reversal owed" queue (owner Q2,
 * 2026-09-24; built 2026-09-26). A partial refund made by hand in the Stripe
 * dashboard on a taxed order tells us the amount but not the items; the tax
 * on those items comes back to the buyer with the money, but the monthly
 * return needs to know WHICH items' tax was reversed. The admin ticks them
 * here (whole item, or the percent of the item the refund covered) and the
 * ledger rows are written from that — never a pro-rata guess.
 *
 * Platform admins only. Reads /api/admin/tax-reversals, resolves through
 * /api/admin/tax-reversals/[id]/resolve. Never touches Stripe or the buyer's
 * refund — the money already moved; this is the return's bookkeeping.
 */

import { useState, useEffect, useCallback } from 'react'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'

interface QueueItem {
  id: string
  title: string
  subtotalCents: number
  taxPaidCents: number
  taxReversedCents: number
  taxRemainingCents: number
  rateVersion: string | null
}
interface QueueRow {
  id: string
  orderId: string
  orderNumber: string | null
  vertical: string | null
  orderCreatedAt: string | null
  stripeRefundId: string
  refundAmountCents: number
  createdAt: string
  resolvedAt: string | null
  note: string | null
  items: QueueItem[]
  allocated: Array<{ orderItemId: string; taxCents: number }>
}
type Portion = 'full' | 25 | 50 | 75 | 'custom'

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

export default function TaxReversalsAdminPage() {
  const [tab, setTab] = useState<'open' | 'resolved'>('open')
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)
  // Per open row: ticked items → portion (+ custom percent), and the note.
  const [picks, setPicks] = useState<Record<string, { portion: Portion; custom: string }>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/admin/tax-reversals?status=${tab}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not load the queue'); setRows([]); return }
      setRows(data.rows || [])
    } catch { setError('Could not load the queue') } finally { setLoading(false) }
  }, [tab])
  useEffect(() => { load() }, [load])

  const startRow = (id: string) => { setOpenRow(id === openRow ? null : id); setPicks({}); setNote(''); setSaveMsg(null) }
  const toggle = (itemId: string) => setPicks((p) => {
    const next = { ...p }
    if (next[itemId]) delete next[itemId]; else next[itemId] = { portion: 'full', custom: '' }
    return next
  })

  const resolve = async (row: QueueRow) => {
    setSaving(true); setSaveMsg(null)
    try {
      const allocations = Object.entries(picks).map(([orderItemId, p]) => ({
        orderItemId,
        portion: p.portion === 'full' ? 'full' : p.portion === 'custom' ? Number(p.custom) : p.portion,
      }))
      const res = await fetch(`/api/admin/tax-reversals/${row.id}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations, note }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveMsg(data.error || data.message || 'Could not save'); return }
      setSaveMsg(`Recorded — ${money(data.taxReversedCents || 0)} of tax reversed on the return.`)
      setOpenRow(null); setPicks({}); setNote('')
      await load()
    } catch { setSaveMsg('Could not save') } finally { setSaving(false) }
  }

  const tabBtn = (t: 'open' | 'resolved', label: string) => (
    <button type="button" onClick={() => { setTab(t); setOpenRow(null) }} style={{
      padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.md, cursor: 'pointer',
      border: `1px solid ${tab === t ? colors.primary : colors.border}`,
      background: tab === t ? colors.primary : 'white', color: tab === t ? 'white' : colors.textPrimary,
      fontSize: typography.sizes.sm, fontWeight: typography.weights.medium,
    }}>{label}</button>
  )

  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <h1 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.xs }}>
        Tax Reversals — refunds made in the Stripe dashboard
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: 1.5, marginBottom: spacing.md }}>
        When a <strong>partial</strong> refund is issued by hand in Stripe on an order that carried sales tax, the buyer gets
        their money back but the monthly tax return needs to know <em>which items</em> the refund covered. Tick them below —
        whole item, or the share of it that was refunded — and the reversal is recorded against that refund. Full dashboard
        refunds and refunds made in the app are handled automatically and never appear here. Nothing here moves money.
      </p>

      <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md }}>
        {tabBtn('open', 'Owed')}{tabBtn('resolved', 'Resolved')}
      </div>

      {saveMsg && <div style={{ marginBottom: spacing.sm, fontSize: typography.sizes.sm, color: saveMsg.startsWith('Recorded') ? '#065f46' : '#991b1b' }}>{saveMsg}</div>}
      {error && <div style={{ color: '#991b1b', fontSize: typography.sizes.sm }}>{error}</div>}
      {loading && <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading…</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
          {tab === 'open' ? 'Nothing owed — every dashboard refund on a taxed order has been allocated.' : 'No resolved rows yet.'}
        </div>
      )}

      {rows.map((row) => {
        const expanded = openRow === row.id
        return (
          <div key={row.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  Order {row.orderNumber ?? row.orderId.slice(0, 8)} <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal }}>· {row.vertical === 'food_trucks' ? 'Food Trucks' : 'Farmers Market'}</span>
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>
                  Dashboard refund of <strong>{money(row.refundAmountCents)}</strong> on {when(row.createdAt)} · Stripe {row.stripeRefundId}
                  {row.resolvedAt && <> · resolved {when(row.resolvedAt)}{row.note ? ` — "${row.note}"` : ''}</>}
                </div>
              </div>
              {tab === 'open' && (
                <button type="button" onClick={() => startRow(row.id)} style={{ padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.md, border: `1px solid ${colors.border}`, background: 'white', cursor: 'pointer', fontSize: typography.sizes.sm }}>
                  {expanded ? 'Close' : 'Allocate'}
                </button>
              )}
            </div>

            {tab === 'resolved' && row.allocated.length > 0 && (
              <div style={{ marginTop: spacing.xs, fontSize: typography.sizes.xs, color: colors.textSecondary }}>
                Reversed: {row.allocated.map((a) => {
                  const it = row.items.find((i) => i.id === a.orderItemId)
                  return `${it?.title ?? a.orderItemId.slice(0, 8)} ${money(a.taxCents)}`
                }).join(' · ')}
              </div>
            )}

            {expanded && (
              <div style={{ marginTop: spacing.md }}>
                {row.items.length === 0 && <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>No live items on this order — add a note and resolve.</div>}
                {row.items.map((it) => {
                  const pick = picks[it.id]
                  const none = it.taxRemainingCents <= 0
                  return (
                    <div key={it.id} style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', padding: `${spacing.xs} 0`, borderTop: `1px solid ${colors.border}`, opacity: none ? 0.6 : 1 }}>
                      <label style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', minWidth: 220, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                        <input type="checkbox" checked={!!pick} disabled={none} onChange={() => toggle(it.id)} />
                        <span>{it.title}</span>
                      </label>
                      <span style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>
                        item {money(it.subtotalCents)} · tax paid {money(it.taxPaidCents)}{it.taxReversedCents > 0 ? ` · already reversed ${money(it.taxReversedCents)}` : ''} · <strong>{money(it.taxRemainingCents)} left</strong>
                      </span>
                      {pick && (
                        <span style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                          <select value={String(pick.portion)} onChange={(e) => setPicks((p) => ({ ...p, [it.id]: { ...p[it.id], portion: (e.target.value === 'full' || e.target.value === 'custom' ? e.target.value : Number(e.target.value)) as Portion } }))}
                            style={{ padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}>
                            <option value="full">whole item</option>
                            <option value="75">75% of it</option>
                            <option value="50">50% of it</option>
                            <option value="25">25% of it</option>
                            <option value="custom">other %</option>
                          </select>
                          {pick.portion === 'custom' && (
                            <input type="number" min={1} max={100} value={pick.custom} placeholder="%" onChange={(e) => setPicks((p) => ({ ...p, [it.id]: { ...p[it.id], custom: e.target.value } }))}
                              style={{ width: 64, padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
                          )}
                        </span>
                      )}
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm, flexWrap: 'wrap' }}>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (why these items; or why no tax is reversed)"
                    style={{ flex: 1, minWidth: 240, padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
                  <button type="button" disabled={saving || (Object.keys(picks).length === 0 && !note.trim())} onClick={() => resolve(row)} style={{
                    padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.md, border: 'none', background: colors.primary, color: 'white',
                    fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                  }}>
                    {saving ? 'Saving…' : 'Record reversal'}
                  </button>
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                  Tax is reversed at the rate frozen on the item when it sold, never today&apos;s rate; an item can never be reversed past what it paid.
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
