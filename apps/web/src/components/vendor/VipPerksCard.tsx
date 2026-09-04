'use client'

import { useEffect, useState } from 'react'
import { colors, spacing, typography, radius, shadows, statusColors } from '@/lib/design-tokens'

/**
 * VIP Perks — the vendor's perk menu (D8: lives WITH the Your Customers card
 * on Insights; owner: "we need to pick some benefits and they turn them off
 * or on"). Two perks in v1, both vendor-funded, both VIP-only:
 *   · Punch card: N qualifying visits → % off (min-purchase, waived at 100%)
 *     or $ off the next order, auto-applied (D6).
 *   · Spend-threshold: % off VIP orders over $X ("10% off if you spend more
 *     than $30" — the owner's example).
 * Bounds come from the API (lib/loyalty/offers.ts constants) — the server
 * refuses out-of-range saves; the inputs here just mirror the ranges.
 */

interface OfferRow {
  id: string
  kind: 'punch_card' | 'spend_threshold'
  enabled: boolean
  config: Record<string, unknown>
}

interface Bounds {
  punch: { minVisits: number; maxVisits: number; minRewardPct: number; maxRewardPct: number; minPurchaseMinCents: number; maxPurchaseMinCents: number; minAmountOffCents: number; maxAmountOffCents: number }
  threshold: { minPct: number; maxPct: number; minThresholdCents: number; maxThresholdCents: number }
}

const cardStyle: React.CSSProperties = {
  padding: spacing.sm,
  backgroundColor: colors.surfaceElevated,
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  boxShadow: shadows.sm,
  marginBottom: spacing.md,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  flexWrap: 'wrap',
  fontSize: typography.sizes.sm,
}

const numInput: React.CSSProperties = {
  width: 72,
  padding: `${spacing['3xs']} ${spacing['2xs']}`,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
}

export default function VipPerksCard({ vendorId, vertical }: { vendorId: string; vertical: string }) {
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Threshold perk state
  const [thresholdEnabled, setThresholdEnabled] = useState(false)
  const [thresholdPct, setThresholdPct] = useState(10)
  const [thresholdDollars, setThresholdDollars] = useState(30)

  // Punch perk state
  const [punchEnabled, setPunchEnabled] = useState(false)
  const [punchVisits, setPunchVisits] = useState(5)
  const [punchRewardType, setPunchRewardType] = useState<'percent' | 'amount'>('percent')
  const [punchPct, setPunchPct] = useState(15)
  const [punchMinDollars, setPunchMinDollars] = useState(15)
  const [punchAmountDollars, setPunchAmountDollars] = useState(5)

  useEffect(() => {
    let alive = true
    fetch(`/api/vendor/offers?vendor_id=${vendorId}&vertical=${vertical}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!alive || !data) return
        setBounds(data.bounds ?? null)
        for (const offer of (data.offers ?? []) as OfferRow[]) {
          if (offer.kind === 'spend_threshold') {
            setThresholdEnabled(offer.enabled)
            if (typeof offer.config.pct === 'number') setThresholdPct(offer.config.pct)
            if (typeof offer.config.threshold_cents === 'number') setThresholdDollars(Math.round(offer.config.threshold_cents / 100))
          }
          if (offer.kind === 'punch_card') {
            setPunchEnabled(offer.enabled)
            if (typeof offer.config.visits === 'number') setPunchVisits(offer.config.visits)
            if (offer.config.reward_type === 'amount') {
              setPunchRewardType('amount')
              if (typeof offer.config.reward_amount_cents === 'number') setPunchAmountDollars(Math.round(offer.config.reward_amount_cents / 100))
            } else {
              setPunchRewardType('percent')
              if (typeof offer.config.reward_pct === 'number') setPunchPct(offer.config.reward_pct)
              if (typeof offer.config.min_purchase_cents === 'number') setPunchMinDollars(Math.round(offer.config.min_purchase_cents / 100))
            }
          }
        }
      })
      .catch(() => { /* card renders with defaults */ })
    return () => { alive = false }
  }, [vendorId, vertical])

  async function save(kind: 'punch_card' | 'spend_threshold', enabled: boolean) {
    if (saving) return
    setSaving(kind)
    setMessage(null)
    const config = kind === 'spend_threshold'
      ? { pct: thresholdPct, threshold_cents: thresholdDollars * 100 }
      : punchRewardType === 'amount'
        ? { visits: punchVisits, reward_type: 'amount', reward_amount_cents: punchAmountDollars * 100 }
        : {
            visits: punchVisits,
            reward_type: 'percent',
            reward_pct: punchPct,
            ...(punchPct === 100 ? {} : { min_purchase_cents: punchMinDollars * 100 }),
          }
    try {
      const res = await fetch('/api/vendor/offers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId, vertical, kind, enabled, config }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (kind === 'spend_threshold') setThresholdEnabled(enabled)
        else setPunchEnabled(enabled)
        setMessage('Saved.')
      } else {
        setMessage(data.error || 'Could not save.')
      }
    } catch {
      setMessage('Could not save.')
    } finally {
      setSaving(null)
    }
  }

  const b = bounds

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: `0 0 ${spacing['2xs']} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
        VIP Perks
      </h2>
      <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: 1.5 }}>
        Benefits for the customers on your VIP list — you fund them, you switch them on and off.
        VIPs see active perks on their Favorites page, and discounts apply automatically at checkout (never stacked — the best single perk applies).
      </p>
      {message && (
        <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: message === 'Saved.' ? statusColors.successDark : statusColors.dangerDark }}>
          {message}
        </p>
      )}

      {/* Spend-threshold perk */}
      <div style={{ padding: spacing.xs, border: `1px solid ${thresholdEnabled ? statusColors.successBorder : colors.border}`, borderRadius: radius.sm, marginBottom: spacing.xs }}>
        <div style={{ ...rowStyle, marginBottom: spacing['2xs'] }}>
          <strong>Spend-and-save</strong>
          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
            {b ? `(${b.threshold.minPct}–${b.threshold.maxPct}% · $${b.threshold.minThresholdCents / 100}–$${b.threshold.maxThresholdCents / 100})` : ''}
          </span>
        </div>
        <div style={rowStyle}>
          <input type="number" style={numInput} value={thresholdPct} min={b?.threshold.minPct} max={b?.threshold.maxPct}
            onChange={e => setThresholdPct(parseInt(e.target.value) || 0)} />
          <span>% off VIP orders over $</span>
          <input type="number" style={numInput} value={thresholdDollars} min={(b?.threshold.minThresholdCents ?? 1500) / 100} max={(b?.threshold.maxThresholdCents ?? 20000) / 100}
            onChange={e => setThresholdDollars(parseInt(e.target.value) || 0)} />
          <button
            onClick={() => save('spend_threshold', !thresholdEnabled)}
            disabled={saving === 'spend_threshold'}
            style={{
              marginLeft: 'auto',
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: thresholdEnabled ? statusColors.neutral100 : colors.primary,
              color: thresholdEnabled ? statusColors.neutral700 : 'white',
              border: 'none', borderRadius: radius.sm, cursor: 'pointer',
              fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
            }}>
            {saving === 'spend_threshold' ? 'Saving…' : thresholdEnabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </div>

      {/* Punch card perk */}
      <div style={{ padding: spacing.xs, border: `1px solid ${punchEnabled ? statusColors.successBorder : colors.border}`, borderRadius: radius.sm }}>
        <div style={{ ...rowStyle, marginBottom: spacing['2xs'] }}>
          <strong>Virtual punch card</strong>
          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
            {b ? `(${b.punch.minVisits}–${b.punch.maxVisits} visits; small orders don't punch)` : ''}
          </span>
        </div>
        <div style={{ ...rowStyle, marginBottom: spacing['2xs'] }}>
          <input type="number" style={numInput} value={punchVisits} min={b?.punch.minVisits} max={b?.punch.maxVisits}
            onChange={e => setPunchVisits(parseInt(e.target.value) || 0)} />
          <span>qualifying visits earn:</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" checked={punchRewardType === 'percent'} onChange={() => setPunchRewardType('percent')} /> % off
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" checked={punchRewardType === 'amount'} onChange={() => setPunchRewardType('amount')} /> $ off
          </label>
        </div>
        {punchRewardType === 'percent' ? (
          <div style={rowStyle}>
            <input type="number" style={numInput} value={punchPct} min={b?.punch.minRewardPct} max={b?.punch.maxRewardPct}
              onChange={e => setPunchPct(parseInt(e.target.value) || 0)} />
            <span>% off their next order</span>
            {punchPct !== 100 && (
              <>
                <span>of $</span>
                <input type="number" style={numInput} value={punchMinDollars} min={(b?.punch.minPurchaseMinCents ?? 1000) / 100} max={(b?.punch.maxPurchaseMinCents ?? 20000) / 100}
                  onChange={e => setPunchMinDollars(parseInt(e.target.value) || 0)} />
                <span>or more</span>
              </>
            )}
            {punchPct === 100 && <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>(100% = free, no minimum)</span>}
          </div>
        ) : (
          <div style={rowStyle}>
            <span>$</span>
            <input type="number" style={numInput} value={punchAmountDollars} min={(b?.punch.minAmountOffCents ?? 100) / 100} max={(b?.punch.maxAmountOffCents ?? 5000) / 100}
              onChange={e => setPunchAmountDollars(parseInt(e.target.value) || 0)} />
            <span>off their next order</span>
          </div>
        )}
        <div style={{ ...rowStyle, marginTop: spacing['2xs'] }}>
          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
            Punches count from VIP designation; the reward applies automatically on the order after they earn it.
          </span>
          <button
            onClick={() => save('punch_card', !punchEnabled)}
            disabled={saving === 'punch_card'}
            style={{
              marginLeft: 'auto',
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: punchEnabled ? statusColors.neutral100 : colors.primary,
              color: punchEnabled ? statusColors.neutral700 : 'white',
              border: 'none', borderRadius: radius.sm, cursor: 'pointer',
              fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
            }}>
            {saving === 'punch_card' ? 'Saving…' : punchEnabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </div>
    </div>
  )
}
