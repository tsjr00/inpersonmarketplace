'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { use } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface Beneficiary {
  id: string
  name: string
  active: boolean
}

/**
 * Vertical-admin view of the cause organizations (owner decision 2026-08-04:
 * "read plus attach").
 *
 * WHY THIS PAGE EXISTS: /[vertical]/admin/cause 404'd, so a vertical admin had
 * no way to see which organizations were available before attaching one to an
 * event — they had to already know the name.
 *
 * WHY IT IS READ-ONLY: the beneficiary pool is SHARED across verticals, and each
 * org has one Stripe destination and one balance. A vertical admin who could
 * edit payout details could redirect money for a program in another vertical.
 * So creating orgs, editing them, and Stripe onboarding stay with platform
 * admins; the API enforces this and returns only name + active status here —
 * the reduction is server-side, not just hidden in this UI.
 *
 * ATTACHING still happens where it belongs: on the event itself, via the
 * Community Chip In control on /[vertical]/admin/events.
 */
export default function VerticalAdminCausePage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params)
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/cause/beneficiaries')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load organizations')
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setBeneficiaries(d.beneficiaries || [])
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load organizations')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const card = {
    background: colors.surfaceBase,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: spacing.lg }}>
      <h1 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
        Community Giving — Organizations
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
        Organizations available for <strong>Community Chip In</strong> on your events. To use one, open the event on{' '}
        <Link href={`/${vertical}/admin/events`} style={{ color: colors.primary }}>Events</Link> and turn on Community
        Chip In there. 100% of every contribution goes to the organization; contributions are{' '}
        <strong>not tax-deductible donations</strong>.
      </p>
      <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.md }}>
        This list is shared across verticals and managed by platform admins — including how each organization gets
        paid. Ask a platform admin to add an organization that isn&apos;t here.
      </p>

      {loading ? (
        <p style={{ color: colors.textMuted }}>Loading…</p>
      ) : error ? (
        <p style={{ color: '#991b1b', fontSize: typography.sizes.sm }}>{error}</p>
      ) : beneficiaries.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
          No organizations are set up yet. A platform admin adds them.
        </p>
      ) : (
        beneficiaries.map((b) => (
          <div key={b.id} style={card}>
            <span style={{ fontWeight: typography.weights.medium, color: colors.textPrimary }}>{b.name}</span>
          </div>
        ))
      )}
    </div>
  )
}
