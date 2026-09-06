'use client'

import { useState, useEffect, useCallback } from 'react'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { formatPrice } from '@/lib/pricing'
import { bundleDisplayPriceCents, splitMargin, BUNDLE_LIMITS } from '@/lib/bundles/core'

/**
 * Bundle approval queue (mig 244, market_bundles_build_plan.md).
 *
 * Per-bundle admin approval with a value-add justification is the locked
 * decision — and Q6 made this review the ONLY margin judgment (no code
 * bounds), so the card shows everything that judgment needs: the margin in
 * absolute and % terms, the components at live prices with their vendors,
 * the derived buyer price, and the manager's justification. The approve
 * action re-verifies vendor opt-outs + the 3-active cap server-side.
 */

interface BundlesAdminPageProps { vertical: string }

interface ComponentRow { listing_id: string; quantity: number }
interface BundleRow {
  id: string
  market_id: string
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
  created_at: string
  market_bundle_components: ComponentRow[]
}
interface MarketRow { id: string; name: string; city: string | null; state: string | null; manager_email: string | null }
interface ListingRow {
  id: string
  title: string
  price_cents: number
  status: string
  vendor_profiles: { profile_data: Record<string, unknown> | null; bundles_opt_out: boolean } | null
}
interface Beneficiary { id: string; name: string; active: boolean }

const TABS = [
  { key: 'pending_approval', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'archived', label: 'Archived' },
]

export default function BundlesAdminPage({ vertical }: BundlesAdminPageProps) {
  const [tab, setTab] = useState('pending_approval')
  const [bundles, setBundles] = useState<BundleRow[] | null>(null)
  const [markets, setMarkets] = useState<Map<string, MarketRow>>(new Map())
  const [listings, setListings] = useState<Map<string, ListingRow>>(new Map())
  const [beneficiaries, setBeneficiaries] = useState<Map<string, Beneficiary>>(new Map())
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [rejectTarget, setRejectTarget] = useState<BundleRow | null>(null)

  const load = useCallback(async () => {
    setBundles(null)
    try {
      const res = await fetch(`/api/admin/bundles?vertical=${encodeURIComponent(vertical)}&status=${encodeURIComponent(tab)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setBundles((data.bundles as BundleRow[]) || [])
        setMarkets(new Map(((data.markets as MarketRow[]) || []).map(m => [m.id, m])))
        setListings(new Map(((data.listings as ListingRow[]) || []).map(l => [l.id, l])))
        setBeneficiaries(new Map(((data.beneficiaries as Beneficiary[]) || []).map(b => [b.id, b])))
      } else {
        setBundles([])
        setResult({ type: 'error', text: (data.error as string) || 'Could not load bundles.' })
      }
    } catch {
      setBundles([])
    }
  }, [vertical, tab])

  useEffect(() => { load() }, [load])

  const act = async (bundleId: string, action: 'approve' | 'reject') => {
    setBusy(bundleId)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/bundles/${bundleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult({ type: 'success', text: action === 'approve' ? 'Approved — the bundle is now on sale.' : 'Rejected.' })
        load()
      } else {
        setResult({ type: 'error', text: (data.error as string) || `Could not ${action}.` })
      }
    } finally {
      setBusy(null)
      setRejectTarget(null)
    }
  }

  const vendorName = (l: ListingRow | undefined): string => {
    const pd = l?.vendor_profiles?.profile_data ?? {}
    return (pd.business_name as string) || (pd.farm_name as string) || 'Vendor'
  }

  return (
    <div>
      <h1 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, margin: `0 0 ${spacing.xs}` }}>
        🧺 Curated Bundles
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing.md}` }}>
        Manager-curated multi-vendor bundles. Approval is the margin judgment — there are no code
        bounds on the margin by design. A market may run at most {BUNDLE_LIMITS.maxActivePerMarket} active
        bundles; approval re-checks vendor opt-outs.
      </p>

      <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: tab === t.key ? colors.primary : 'white',
              color: tab === t.key ? 'white' : colors.textPrimary,
              border: `1px solid ${tab === t.key ? colors.primary : colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

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
      ) : bundles.length === 0 ? (
        <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>
          Nothing {tab === 'pending_approval' ? 'awaiting review' : `in ${TABS.find(t => t.key === tab)?.label.toLowerCase()}`}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {bundles.map(b => {
            const market = markets.get(b.market_id)
            const componentSum = b.market_bundle_components.reduce((s, c) => {
              const l = listings.get(c.listing_id)
              return s + (l ? l.price_cents * c.quantity : 0)
            }, 0)
            const buyerPays = bundleDisplayPriceCents(componentSum, b.margin_cents)
            const marginPct = componentSum > 0 ? Math.round((b.margin_cents / componentSum) * 100) : 0
            const { causeCents } = splitMargin(b.margin_cents, b.cause_pct)
            const optOutVendors = b.market_bundle_components
              .map(c => listings.get(c.listing_id))
              .filter(l => l?.vendor_profiles?.bundles_opt_out)
            return (
              <div key={b.id} style={{ padding: `${spacing.sm} ${spacing.md}`, backgroundColor: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: colors.textPrimary }}>{b.name}</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginLeft: spacing.xs }}>
                      {market ? `${market.name}${market.city ? ` · ${market.city}, ${market.state ?? ''}` : ''}` : 'Unknown market'}
                    </span>
                  </div>
                  <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                    submitted {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {b.pickup_market_date ? ` · pickup ${b.pickup_market_date}` : ''}
                  </span>
                </div>

                {b.description && (
                  <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, marginTop: spacing.xs }}>{b.description}</div>
                )}

                {/* The money picture — what the approval judgment weighs */}
                <div style={{ marginTop: spacing.xs, padding: `${spacing['2xs']} ${spacing.xs}`, backgroundColor: colors.surfaceBase, borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                  Items {formatPrice(componentSum)} + margin <strong>{formatPrice(b.margin_cents)}</strong> ({marginPct}% of items)
                  → buyer pays <strong>{formatPrice(buyerPays)}</strong> · up to {b.quantity_limit} sold
                  {b.cause_pct && b.cause_beneficiary_id ? (
                    <> · 🤝 {b.cause_pct}% of margin ({formatPrice(causeCents)}) to {beneficiaries.get(b.cause_beneficiary_id)?.name || 'a cause'}</>
                  ) : null}
                </div>

                {/* Components with vendors */}
                <ul style={{ margin: `${spacing.xs} 0 0`, paddingLeft: spacing.md, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                  {b.market_bundle_components.map((c, idx) => {
                    const l = listings.get(c.listing_id)
                    return (
                      <li key={idx}>
                        {c.quantity}× {l?.title || 'Unknown listing'} — {vendorName(l)} · {l ? formatPrice(l.price_cents) : '?'}
                        {l?.status !== 'published' && <span style={{ color: statusColors.danger }}> · NOT PUBLISHED</span>}
                        {l?.vendor_profiles?.bundles_opt_out && <span style={{ color: statusColors.danger }}> · VENDOR OPTED OUT</span>}
                      </li>
                    )
                  })}
                </ul>

                {/* The value-add justification — the heart of the review */}
                <div style={{ marginTop: spacing.xs, padding: `${spacing['2xs']} ${spacing.xs}`, borderLeft: `3px solid ${colors.primary}`, backgroundColor: colors.surfaceBase, fontSize: typography.sizes.sm, color: colors.textPrimary, fontStyle: 'italic' }}>
                  “{b.justification || 'No justification provided.'}”
                </div>

                {b.status === 'pending_approval' && (
                  <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setRejectTarget(b)}
                      disabled={busy === b.id}
                      style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: 'white', color: statusColors.danger, border: `1px solid ${statusColors.dangerBorder}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, cursor: 'pointer' }}
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => act(b.id, 'approve')}
                      disabled={busy === b.id || optOutVendors.length > 0}
                      style={{
                        padding: `${spacing.xs} ${spacing.md}`,
                        backgroundColor: busy === b.id || optOutVendors.length > 0 ? colors.border : colors.primary,
                        color: 'white', border: 'none', borderRadius: radius.sm,
                        fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
                        cursor: busy === b.id ? 'wait' : 'pointer',
                      }}
                    >
                      {busy === b.id ? 'Working…' : 'Approve'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!rejectTarget}
        title="Reject this bundle?"
        message={`"${rejectTarget?.name}" will not go on sale. The manager can edit and resubmit it.`}
        confirmLabel="Reject"
        variant="danger"
        onConfirm={() => rejectTarget && act(rejectTarget.id, 'reject')}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  )
}
