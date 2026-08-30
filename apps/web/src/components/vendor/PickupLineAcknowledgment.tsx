'use client'

import { useState } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * "Separate pickup line for app orders" — the one thing every vendor must
 * understand before they sell (owner, 2026-08-28):
 *
 *   In-app buyers order ahead and choose a pickup time so they do NOT stand
 *   in the walk-up line. The vendor runs a second, clearly signed pickup
 *   line just for app orders. If app customers end up queuing with walk-ups
 *   anyway, they order less — the whole value of ordering ahead disappears.
 *
 * Rendered inside the onboarding checklist (gates "submit for approval" for
 * new vendors) and as a dashboard reminder for established vendors until
 * they acknowledge. One POST stores profile_data.pickup_line_acknowledged_at.
 */
interface Props {
  vertical: string
  /** Called after a successful acknowledgment so the host can refresh. */
  onAcknowledged?: () => void | Promise<void>
  /** Compact = dashboard reminder card; full = onboarding step. */
  variant?: 'full' | 'compact'
}

export default function PickupLineAcknowledgment({ vertical, onAcknowledged, variant = 'full' }: Props) {
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isFT = vertical === 'food_trucks'
  const place = isFT ? 'truck' : 'booth'

  const acknowledge = async () => {
    if (!checked || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/vendor/onboarding/acknowledge-pickup-line?vertical=${vertical}`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not save your acknowledgment')
      }
      setDone(true)
      if (onAcknowledged) await onAcknowledged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your acknowledgment')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div style={{ padding: spacing.sm, backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: radius.md, fontSize: typography.sizes.sm, color: '#166534' }}>
        ✓ Thanks — you&apos;re set up to run a separate pickup line.{' '}
        <Link href={`/${vertical}/vendor/pickup-signs`} style={{ color: '#166534', fontWeight: typography.weights.semibold }}>Print your pickup signs →</Link>
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: '#fffbeb',
      border: '1px solid #fcd34d',
      borderRadius: radius.md,
    }}>
      <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#92400e', marginBottom: spacing['2xs'] }}>
        {/* Owner 2026-08-29: we are introducing a new idea, so sell it —
            friendly, and framed as the great deal it is for them. */}
        {variant === 'full'
          ? 'Your app customers get their own line — and they’ll love you for it'
          : 'A quick one before your next service day 👋'}
      </div>
      <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: '#78350f', lineHeight: 1.55 }}>
        App orders come in ahead of time with a pickup slot, so those customers can walk straight to a
        second, clearly marked spot at your {place} and grab their food. No waiting behind the walk-up
        line — that&apos;s the whole reason they ordered ahead, and it&apos;s why they come back and order more.
      </p>
      <ul style={{ margin: `0 0 ${spacing.xs}`, paddingLeft: 18, fontSize: typography.sizes.xs, color: '#78350f', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <li>Set up a small pickup spot with the branded sign — print-ready 8.5×11 and 11×17 versions are on the{' '}
          <Link href={`/${vertical}/vendor/pickup-signs`} style={{ color: '#92400e', fontWeight: typography.weights.semibold }}>Pickup signs</Link> page.</li>
        <li>Your <em>Pickup Capacity</em> and <em>prep time</em> settings keep both lines moving.</li>
      </ul>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: typography.sizes.xs, color: '#78350f', cursor: 'pointer', marginBottom: spacing.xs }}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} disabled={saving} style={{ marginTop: 2 }} />
        <span>Got it — app orders get their own clearly signed pickup spot at my {place}.</span>
      </label>
      {error && <div style={{ fontSize: typography.sizes.xs, color: '#991b1b', marginBottom: spacing['2xs'] }}>{error}</div>}
      <button
        onClick={acknowledge}
        disabled={!checked || saving}
        style={{
          padding: `${spacing['3xs']} ${spacing.xs}`,
          backgroundColor: checked ? '#d97706' : colors.surfaceMuted,
          color: checked ? 'white' : colors.textMuted,
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.medium,
          cursor: checked && !saving ? 'pointer' : 'not-allowed',
        }}
      >
        {saving ? 'Saving…' : 'I agree'}
      </button>
    </div>
  )
}
