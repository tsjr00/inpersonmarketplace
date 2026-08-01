'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { useStatusBanner } from '@/hooks/useStatusBanner'

interface Beneficiary {
  id: string
  name: string
  contact_email: string | null
  stripe_account_id: string | null
  remit_method: 'connect' | 'check'
  mailing_address: string | null
  active: boolean
  notes: string | null
  outstanding_cents: number
}

interface Remittance {
  id: string
  beneficiary_id: string
  amount_cents: number
  method: 'connect' | 'check'
  status: string
  notes: string | null
  created_at: string
  paid_at: string | null
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default function CauseAdminPage() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([])
  const [remittances, setRemittances] = useState<Remittance[]>([])
  const [loading, setLoading] = useState(true)
  const { showBanner, StatusBanner } = useStatusBanner()

  // add form
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [method, setMethod] = useState<'connect' | 'check'>('check')
  const [acct, setAcct] = useState('')
  const [mailing, setMailing] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // per-row remittance amount (dollars string)
  const [remitAmt, setRemitAmt] = useState<Record<string, string>>({})

  const load = async () => {
    try {
      const [bRes, rRes] = await Promise.all([
        fetch('/api/admin/cause/beneficiaries'),
        fetch('/api/admin/cause/remittances'),
      ])
      if (bRes.ok) setBeneficiaries((await bRes.json()).beneficiaries || [])
      if (rRes.ok) setRemittances((await rRes.json()).remittances || [])
    } catch {
      showBanner('error', 'Failed to load Community Chip In data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const nameFor = (id: string) => beneficiaries.find((b) => b.id === id)?.name ?? '—'

  const addBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/cause/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, contact_email: email, remit_method: method,
          stripe_account_id: acct, mailing_address: mailing,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showBanner('error', data.error || 'Failed to add'); return }
      showBanner('success', `Added ${data.beneficiary?.name}`)
      setName(''); setEmail(''); setAcct(''); setMailing(''); setMethod('check'); setShowAdd(false)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (b: Beneficiary) => {
    const res = await fetch(`/api/admin/cause/beneficiaries/${b.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !b.active }),
    })
    if (res.ok) { showBanner('success', b.active ? 'Deactivated' : 'Reactivated'); load() }
    else showBanner('error', (await res.json()).error || 'Update failed')
  }

  const recordCheck = async (b: Beneficiary) => {
    const amt = parseFloat(remitAmt[b.id] || '')
    if (!amt || amt <= 0) { showBanner('error', 'Enter a positive amount'); return }
    const cents = Math.round(amt * 100)
    if (cents > b.outstanding_cents) { showBanner('error', 'Amount exceeds outstanding balance'); return }
    const res = await fetch('/api/admin/cause/remittances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beneficiary_id: b.id, amount_cents: cents, notes: 'Check mailed' }),
    })
    if (res.ok) {
      showBanner('success', `Recorded ${dollars(cents)} check to ${b.name}`)
      setRemitAmt((p) => ({ ...p, [b.id]: '' }))
      load()
    } else showBanner('error', (await res.json()).error || 'Failed to record')
  }

  const cardStyle = {
    background: colors.surfaceElevated, border: `1px solid ${colors.border}`,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  }
  const inputStyle = {
    padding: spacing.sm, border: `1px solid ${colors.border}`, borderRadius: radius.sm,
    fontSize: typography.sizes.sm, width: '100%',
  }
  const btn = {
    padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radius.sm, border: 'none',
    background: colors.primary, color: '#fff', fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium, cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: spacing.lg }}>
      <StatusBanner />
      <h1 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
        Community Chip In — Beneficiaries
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
        Cause organizations that receive Community Chip In contributions. 100% of each chip-in goes to the
        org — the platform keeps none and absorbs processing. Contributions are <strong>not tax-deductible
        donations</strong>. Automatic (Stripe Connect) payouts are batched; check payouts are recorded here
        after mailing.
      </p>

      <button style={btn} onClick={() => setShowAdd((s) => !s)}>
        {showAdd ? 'Cancel' : '+ Add beneficiary'}
      </button>

      {showAdd && (
        <form onSubmit={addBeneficiary} style={{ ...cardStyle, marginTop: spacing.sm }}>
          <div style={{ display: 'grid', gap: spacing.sm }}>
            <input style={inputStyle} placeholder="Org name *" value={name} onChange={(e) => setName(e.target.value)} required />
            <input style={inputStyle} placeholder="Contact email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
              Remittance method:{' '}
              <select value={method} onChange={(e) => setMethod(e.target.value as 'connect' | 'check')} style={{ padding: spacing.xs }}>
                <option value="check">Check (manual, recorded here)</option>
                <option value="connect">Automatic (Stripe Connect — batched)</option>
              </select>
            </label>
            {method === 'connect'
              ? <input style={inputStyle} placeholder="Stripe Connect account id (acct_…) *" value={acct} onChange={(e) => setAcct(e.target.value)} />
              : <input style={inputStyle} placeholder="Mailing address (for checks)" value={mailing} onChange={(e) => setMailing(e.target.value)} />}
            <button type="submit" style={btn} disabled={submitting}>{submitting ? 'Adding…' : 'Add'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: colors.textMuted, marginTop: spacing.md }}>Loading…</p>
      ) : beneficiaries.length === 0 ? (
        <p style={{ color: colors.textMuted, marginTop: spacing.md }}>No beneficiaries yet.</p>
      ) : (
        <div style={{ marginTop: spacing.md }}>
          {beneficiaries.map((b) => (
            <div key={b.id} style={{ ...cardStyle, opacity: b.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  {b.name}{!b.active && ' (inactive)'}
                </span>
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                  Outstanding: <strong>{dollars(b.outstanding_cents)}</strong>
                </span>
              </div>
              <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                {b.remit_method === 'connect' ? `Auto (Connect ${b.stripe_account_id ?? '—'})` : 'Check (manual)'}
                {b.contact_email ? ` · ${b.contact_email}` : ''}
              </div>
              <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                {b.remit_method === 'check' && b.outstanding_cents > 0 && (
                  <>
                    <input
                      style={{ ...inputStyle, width: 110 }}
                      placeholder="$ amount"
                      inputMode="decimal"
                      value={remitAmt[b.id] || ''}
                      onChange={(e) => setRemitAmt((p) => ({ ...p, [b.id]: e.target.value }))}
                    />
                    <button style={btn} onClick={() => recordCheck(b)}>Record check paid</button>
                  </>
                )}
                <button
                  style={{ ...btn, background: 'transparent', color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                  onClick={() => toggleActive(b)}
                >
                  {b.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginTop: spacing.lg }}>
        Remittance history
      </h2>
      {remittances.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>No remittances yet.</p>
      ) : (
        <div style={{ marginTop: spacing.sm }}>
          {remittances.map((r) => (
            <div key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', fontSize: typography.sizes.sm }}>
              <span style={{ color: colors.textPrimary }}>{nameFor(r.beneficiary_id)}</span>
              <span style={{ color: colors.textSecondary }}>
                {dollars(r.amount_cents)} · {r.method} · {r.status}
                {r.paid_at ? ` · ${new Date(r.paid_at).toLocaleDateString()}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
