'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { colors, statusColors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { FullPageLoading } from '@/components/shared/Spinner'
import { formatPrice, FEES, calculateSmallOrderFee, getSmallOrderFeeConfig } from '@/lib/pricing'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

/**
 * Bundle checkout (mig 244) — the dedicated view the checkout page renders
 * for ?bundle=<id>. A bundle is its own order (v1): no cart, no mixing, one
 * copy per checkout.
 *
 * THE MONEY MIRROR: every number here is derived the same way the server
 * derives it — displayPriceCents comes from the API (which computes it with
 * the same lib/bundles/core.ts function the Stripe line uses), the service
 * fee is the standard per-order flat, and the small-order fee is computed on
 * the COMPONENT sum only (matching checkout/session, where the margin rides
 * outside orderPricing). Total here === Stripe total to the cent.
 */

interface BundleDetail {
  id: string
  name: string
  description: string | null
  market: { id: string; name: string; vertical: string; city: string | null; state: string | null }
  pickupMarketDate: string | null
  pickupNotes: string | null
  components: Array<{ listingId: string; quantity: number; title: string; priceCents: number; vendorProfileId: string | null; vendorName: string }>
  componentSumCents: number
  marginCents: number
  displayPriceCents: number
  remaining: number
  available: boolean
  orderingOpen: boolean
  cause: { name: string; pct: number } | null
}

interface BundleCheckoutProps {
  vertical: string
  bundleId: string
}

export default function BundleCheckout({ vertical, bundleId }: BundleCheckoutProps) {
  const locale = getClientLocale()
  const [bundle, setBundle] = useState<BundleDetail | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'gone'>('loading')
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/bundles/${bundleId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return
        if (data?.id) {
          setBundle(data as BundleDetail)
          setLoadState('ready')
        } else {
          setLoadState('gone')
        }
      })
      .catch(() => { if (!cancelled) setLoadState('gone') })
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return
        setUser(data?.user ?? null)
        setAuthChecked(true)
      })
      .catch(() => { if (!cancelled) setAuthChecked(true) })
    return () => { cancelled = true }
  }, [bundleId])

  const buy = async () => {
    if (isSubmittingRef.current || processing) return
    isSubmittingRef.current = true
    setProcessing(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleItem: { bundleId }, vertical }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.assign(data.url as string)
      } else {
        setError((data.error as string) || t('bundle.error_checkout', locale))
        isSubmittingRef.current = false
        setProcessing(false)
      }
    } catch {
      setError(t('bundle.error_generic', locale))
      isSubmittingRef.current = false
      setProcessing(false)
    }
  }

  if (loadState === 'loading') {
    return <FullPageLoading message={t('bundle.loading', locale)} />
  }

  const card = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase, padding: spacing.md }}>
      <div style={{ maxWidth: containers.sm, margin: '0 auto', backgroundColor: 'white', borderRadius: radius.lg, border: `1px solid ${colors.border}`, boxShadow: shadows.sm, padding: spacing.lg }}>
        {children}
      </div>
    </div>
  )

  if (loadState === 'gone' || !bundle) {
    return card(
      <>
        <h1 style={{ fontSize: typography.sizes.lg, margin: `0 0 ${spacing.sm}` }}>{t('bundle.gone_title', locale)}</h1>
        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
          {t('bundle.gone_desc', locale)}
        </p>
        <Link href={`/${vertical}/browse`} style={{ color: colors.primary, fontSize: typography.sizes.sm }}>{t('bundle.keep_shopping', locale)}</Link>
      </>
    )
  }

  const smallOrderFeeCents = calculateSmallOrderFee(bundle.componentSumCents, vertical)
  const totalCents = bundle.displayPriceCents + FEES.buyerFlatFeeCents + smallOrderFeeCents

  return card(
    <>
      <h1 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, margin: `0 0 ${spacing['3xs']}` }}>
        🧺 {bundle.name}
      </h1>
      <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing.sm}` }}>
        {t('bundle.curated_by', locale, { market: bundle.market.name })}
        {bundle.pickupMarketDate ? <> · {t('bundle.pickup_on', locale, { date: bundle.pickupMarketDate })}{bundle.pickupNotes ? ` — ${bundle.pickupNotes}` : ''}</> : null}
      </p>

      {bundle.description && (
        <p style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, lineHeight: 1.6, margin: `0 0 ${spacing.sm}` }}>{bundle.description}</p>
      )}

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm }}>
        {bundle.components.map((c, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm, padding: `${spacing['3xs']} 0`, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
            <span>
              {c.quantity}× {c.title}
              <span style={{ color: colors.textMuted }}> · {c.vendorName}</span>
            </span>
          </div>
        ))}
      </div>

      {/* The money block — mirrors checkout/session exactly */}
      <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, display: 'flex', flexDirection: 'column', gap: spacing['3xs'], marginBottom: spacing.sm }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('bundle.items_line', locale)}</span><span>{formatPrice(bundle.displayPriceCents)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: colors.textMuted }}>
          <span>{t('bundle.service_fee', locale)}</span><span>{formatPrice(FEES.buyerFlatFeeCents)}</span>
        </div>
        {smallOrderFeeCents > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: colors.textMuted }}>
            <span>{t('bundle.small_order_fee', locale, { amount: formatPrice(getSmallOrderFeeConfig(vertical).thresholdCents) })}</span>
            <span>{formatPrice(smallOrderFeeCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: typography.weights.bold, borderTop: `1px solid ${colors.border}`, paddingTop: spacing['3xs'] }}>
          <span>{t('bundle.total', locale)}</span><span>{formatPrice(totalCents)}</span>
        </div>
      </div>

      {bundle.cause && (
        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm }}>
          🤝 {t('bundle.cause_line', locale, { pct: String(bundle.cause.pct), org: bundle.cause.name })}
        </div>
      )}

      {bundle.remaining <= 5 && bundle.remaining > 0 && (
        <div style={{ fontSize: typography.sizes.xs, color: '#b45309', fontWeight: typography.weights.semibold, marginBottom: spacing.sm }}>
          {t('bundle.only_n_left', locale, { n: String(bundle.remaining) })}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: spacing.sm, padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, backgroundColor: statusColors.dangerLight, color: statusColors.dangerDark, border: `1px solid ${statusColors.dangerBorder}` }}>
          {error}
        </div>
      )}

      {!bundle.available ? (
        <div style={{ textAlign: 'center', padding: spacing.sm, backgroundColor: colors.surfaceBase, borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textMuted }}>
          {bundle.remaining === 0 ? t('bundle.sold_out_msg', locale) : t('bundle.ordering_closed_msg', locale)}
        </div>
      ) : authChecked && !user ? (
        <Link
          href={`/${vertical}/login?redirect=${encodeURIComponent(`/${vertical}/checkout?bundle=${bundleId}`)}`}
          style={{ display: 'block', textAlign: 'center', padding: `${spacing.sm} ${spacing.md}`, backgroundColor: colors.primary, color: 'white', borderRadius: radius.sm, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textDecoration: 'none' }}
        >
          {t('bundle.sign_in', locale)}
        </Link>
      ) : (
        <button
          onClick={buy}
          disabled={processing || !authChecked}
          style={{
            width: '100%',
            padding: `${spacing.sm} ${spacing.md}`,
            backgroundColor: processing ? colors.border : colors.primary,
            color: 'white', border: 'none', borderRadius: radius.sm,
            fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
            cursor: processing ? 'wait' : 'pointer',
          }}
        >
          {processing ? t('bundle.starting', locale) : t('bundle.pay', locale, { amount: formatPrice(totalCents) })}
        </button>
      )}

      <div style={{ marginTop: spacing.sm, textAlign: 'center' }}>
        <Link href={`/${vertical}/markets/${bundle.market.id}`} style={{ color: colors.textMuted, fontSize: typography.sizes.xs, textDecoration: 'none' }}>
          {t('bundle.back_to', locale, { market: bundle.market.name })}
        </Link>
      </div>
    </>
  )
}
