'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface Props {
  eventId: string
}

interface BeneficiaryOption { id: string; name: string }

/**
 * Community Chip In config for one event, for admins (platform + vertical).
 * Self-contained: fetches /api/admin/events/[id]/chipin (vertical-scoped) and
 * writes markets.chipin_enabled / chipin_beneficiary_id. Chip-in is only
 * configurable once the event is approved (it needs the event market row).
 */
export default function EventChipInControl({ eventId }: Props) {
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [beneficiaryId, setBeneficiaryId] = useState<string>('')
  const [options, setOptions] = useState<BeneficiaryOption[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/events/${eventId}/chipin`)
        if (!res.ok) { if (!cancelled) setMsg({ text: 'Could not load Chip In config', ok: false }); return }
        const data = await res.json()
        if (cancelled) return
        setAvailable(!!data.available)
        setEnabled(!!data.enabled)
        setBeneficiaryId(data.beneficiaryId || '')
        setOptions(data.beneficiaries || [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [eventId])

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/chipin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, beneficiaryId: enabled ? beneficiaryId : null }),
      })
      const data = await res.json()
      setMsg(res.ok ? { text: 'Saved', ok: true } : { text: data.error || 'Save failed', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const box = {
    border: `1px solid ${colors.border}`, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.md,
  }
  const label = { fontSize: typography.sizes.sm, color: colors.textSecondary }

  if (loading) {
    return <div style={box}><span style={label}>Loading Community Chip In…</span></div>
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary, fontSize: typography.sizes.base }}>
        Community Chip In
      </div>
      {!available ? (
        <p style={{ ...label, marginTop: spacing.xs }}>
          Approve the event first — Chip In turns on once the event is live and taking orders.
        </p>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span style={{ color: colors.textPrimary, fontSize: typography.sizes.sm }}>
              Let shoppers chip in for a cause at checkout
            </span>
          </label>

          {enabled && (
            <div style={{ marginTop: spacing.sm }}>
              <span style={label}>Beneficiary:</span>{' '}
              <select
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
                style={{ padding: spacing.xs, borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: typography.sizes.sm }}
              >
                <option value="">— pick an organization —</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {options.length === 0 && (
                <p style={{ ...label, marginTop: spacing.xs }}>
                  No active beneficiaries yet — a platform admin adds them under Admin → Community Chip In.
                </p>
              )}
            </div>
          )}

          <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
            100% of each chip-in goes to the organization. Contributions are not tax-deductible donations.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
            <button
              onClick={save}
              disabled={saving || (enabled && !beneficiaryId)}
              style={{
                padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.sm, border: 'none',
                background: colors.primary, color: '#fff', fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: saving || (enabled && !beneficiaryId) ? 'not-allowed' : 'pointer',
                opacity: saving || (enabled && !beneficiaryId) ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {msg && (
              <span style={{ fontSize: typography.sizes.sm, color: msg.ok ? '#065f46' : '#991b1b' }}>{msg.text}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
