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

interface Campaign {
  id: string
  beneficiary_id: string
  beneficiary_name: string
  name: string
  starts_at: string
  ends_at: string
  vertical_id: string | null
  round_up_enabled: boolean
  active: boolean
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
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [mailing, setMailing] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // per-row remittance amount (dollars string)
  const [remitAmt, setRemitAmt] = useState<Record<string, string>>({})

  // round-up campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [showCampaign, setShowCampaign] = useState(false)
  const [campName, setCampName] = useState('')
  const [campBeneficiary, setCampBeneficiary] = useState('')
  const [campStart, setCampStart] = useState('')
  const [campEnd, setCampEnd] = useState('')

  const load = async () => {
    try {
      const [bRes, rRes, cRes] = await Promise.all([
        fetch('/api/admin/cause/beneficiaries'),
        fetch('/api/admin/cause/remittances'),
        fetch('/api/admin/cause/campaigns'),
      ])
      if (bRes.ok) setBeneficiaries((await bRes.json()).beneficiaries || [])
      if (rRes.ok) setRemittances((await rRes.json()).remittances || [])
      if (cRes.ok) setCampaigns((await cRes.json()).campaigns || [])
    } catch {
      showBanner('error', 'Failed to load Community Chip In data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const nameFor = (id: string) => beneficiaries.find((b) => b.id === id)?.name ?? '—'

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/admin/cause/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beneficiary_id: campBeneficiary,
        name: campName,
        starts_at: campStart ? new Date(campStart).toISOString() : '',
        ends_at: campEnd ? new Date(campEnd + 'T23:59:59').toISOString() : '',
      }),
    })
    const data = await res.json()
    if (!res.ok) { showBanner('error', data.error || 'Failed to create campaign'); return }
    showBanner('success', 'Campaign created')
    setCampName(''); setCampBeneficiary(''); setCampStart(''); setCampEnd(''); setShowCampaign(false)
    load()
  }

  const toggleCampaign = async (c: Campaign) => {
    const res = await fetch(`/api/admin/cause/campaigns/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !c.active }),
    })
    if (res.ok) { showBanner('success', c.active ? 'Paused' : 'Resumed'); load() }
    else showBanner('error', (await res.json()).error || 'Update failed')
  }

  const addBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/cause/beneficiaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // stripe_account_id is deliberately NOT sent — it is set by the Connect
          // onboarding flow, never typed in. See the note on the form field.
          name, contact_email: email, remit_method: method,
          mailing_address: mailing,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showBanner('error', data.error || 'Failed to add'); return }
      showBanner('success', `Added ${data.beneficiary?.name}`)
      setName(''); setEmail(''); setMailing(''); setMethod('check'); setShowAdd(false)
      load()
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Create (or reuse) the org's Express account and open Stripe's onboarding.
   * The link is single-use and short-lived, so this is expected to be clicked
   * again if the org doesn't finish in one sitting — the idempotency key on the
   * account means no second account is ever created.
   */
  const startConnect = async (b: Beneficiary) => {
    setConnectingId(b.id)
    try {
      const res = await fetch(`/api/admin/cause/beneficiaries/${b.id}/connect`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { showBanner('error', data.error || 'Could not start onboarding'); return }
      // Opened in a new tab so the admin keeps this page. On iOS Safari this may
      // reuse the tab; the admin can come back with the back button.
      window.open(data.url as string, '_blank', 'noopener,noreferrer')
      showBanner('success', 'Stripe onboarding opened — the org completes it themselves.')
    } finally {
      setConnectingId(null)
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
      {/* Retitled 2026-08-04. The page was headed "Community Chip In —
          Beneficiaries", which made Round-Up read as a feature OF Chip In. They
          are two independent programs drawing on ONE shared pool of orgs, and
          the same org is not required for both. The org pool is therefore the
          top-level thing, with the two programs as siblings under it. */}
      <h1 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
        Community Giving
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
        Two independent programs share the organizations below: <strong>Community Chip In</strong> (turned on per
        event, from that event&apos;s settings) and <strong>Round-Up Campaigns</strong> (always-on, at checkout).
        An org can be used by either, both, or neither — they don&apos;t have to match.
        100% of every contribution goes to the org: the platform keeps none and absorbs processing.
        Contributions are <strong>not tax-deductible donations</strong>. Automatic payouts are batched;
        check payouts are recorded here after mailing.
      </p>

      <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
        Beneficiary organizations
      </h2>

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
            {/* No account-number field. An org's own Stripe account cannot receive
                our transfers — Stripe only pays connected accounts — so typing an
                acct_… here produced an id that looked right and failed at remit
                time. The org is onboarded through us instead, via a link sent
                after the beneficiary is created. (2026-08-04) */}
            {method === 'connect'
              ? (
                <p style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, margin: 0 }}>
                  Add a contact email above. After saving, use <strong>Send Stripe onboarding link</strong> on the
                  org&apos;s card — they complete Stripe&apos;s form themselves and we record the account
                  automatically. Nothing for them to look up, and their existing Stripe account isn&apos;t used.
                </p>
              )
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
                {b.remit_method === 'connect'
                  ? (b.stripe_account_id ? `Auto (Stripe ${b.stripe_account_id})` : 'Auto — not connected yet')
                  : 'Check (manual)'}
                {b.contact_email ? ` · ${b.contact_email}` : ''}
              </div>
              {/* An account id alone does NOT mean they can be paid — the org may
                  have abandoned onboarding halfway. The remit sweep would then
                  fail on them. Say so here rather than let it surface as a cron
                  error nobody reads. */}
              {b.remit_method === 'connect' && !b.stripe_account_id && (
                <div style={{ fontSize: typography.sizes.xs, color: '#92400e', marginTop: spacing.xs }}>
                  ⚠ This org can&apos;t be paid automatically until they finish Stripe onboarding.
                  {!b.contact_email && ' Add a contact email first — Stripe sends the invitation there.'}
                </div>
              )}
              <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                {b.remit_method === 'connect' && (
                  <button
                    style={btn}
                    disabled={connectingId === b.id || !b.contact_email}
                    onClick={() => startConnect(b)}
                    title={!b.contact_email ? 'Add a contact email first' : undefined}
                  >
                    {connectingId === b.id
                      ? 'Opening…'
                      : b.stripe_account_id ? 'Resend Stripe onboarding link' : 'Send Stripe onboarding link'}
                  </button>
                )}
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

      {/* Round-Up sits directly under the org pool as a SIBLING of Chip In —
          not nested beneath it. Remittance history moved to the bottom: it is
          reference, not something an admin comes here to do. */}
      <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginTop: spacing.lg }}>
        Round-Up Campaigns
      </h2>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
        Always-on windows where checkout offers &ldquo;round up to the next dollar&rdquo; for a partner org across the scoped vertical (or all). Separate from event Community Chip In.
      </p>
      <button style={btn} onClick={() => setShowCampaign((s) => !s)}>
        {showCampaign ? 'Cancel' : '+ New campaign'}
      </button>
      {showCampaign && (
        <form onSubmit={createCampaign} style={{ ...cardStyle, marginTop: spacing.sm }}>
          <div style={{ display: 'grid', gap: spacing.sm }}>
            <input style={inputStyle} placeholder="Campaign name *" value={campName} onChange={(e) => setCampName(e.target.value)} required />
            <select value={campBeneficiary} onChange={(e) => setCampBeneficiary(e.target.value)} style={{ padding: spacing.sm }} required>
              <option value="">— beneficiary —</option>
              {beneficiaries.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <label style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>Start <input type="date" value={campStart} onChange={(e) => setCampStart(e.target.value)} required style={{ marginLeft: spacing.xs }} /></label>
            <label style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>End <input type="date" value={campEnd} onChange={(e) => setCampEnd(e.target.value)} required style={{ marginLeft: spacing.xs }} /></label>
            <button type="submit" style={btn}>Create</button>
          </div>
        </form>
      )}
      {campaigns.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, marginTop: spacing.sm }}>No campaigns yet.</p>
      ) : (
        <div style={{ marginTop: spacing.sm }}>
          {campaigns.map((c) => (
            <div key={c.id} style={{ ...cardStyle, opacity: c.active ? 1 : 0.55 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>{c.name}{!c.active && ' (paused)'}</span>
                <button style={{ ...btn, background: 'transparent', color: colors.textSecondary, border: `1px solid ${colors.border}` }} onClick={() => toggleCampaign(c)}>
                  {c.active ? 'Pause' : 'Resume'}
                </button>
              </div>
              <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                {c.beneficiary_name} · {c.vertical_id || 'all verticals'} · {new Date(c.starts_at).toLocaleDateString()}–{new Date(c.ends_at).toLocaleDateString()}
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
