'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { colors } from '@/lib/design-tokens'
import { TIER_LIMITS, normalizeTier, getVendorTierLabel, type VendorTier } from '@/lib/vendor-limits'
import { SUBSCRIPTION_AMOUNTS } from '@/lib/pricing'
import { term } from '@/lib/vertical'

// ── Unified 3-Tier Upgrade Page ──────────────────────────────────────

const TIERS: { key: VendorTier; monthlyPrice: number; annualPrice: number; popular?: boolean }[] = [
  { key: 'free', monthlyPrice: 0, annualPrice: 0 },
  { key: 'pro', monthlyPrice: SUBSCRIPTION_AMOUNTS.pro_monthly_cents / 100, annualPrice: SUBSCRIPTION_AMOUNTS.pro_annual_cents / 100, popular: true },
  { key: 'boss', monthlyPrice: SUBSCRIPTION_AMOUNTS.boss_monthly_cents / 100, annualPrice: SUBSCRIPTION_AMOUNTS.boss_annual_cents / 100 },
]

function FeatureRow({ label, free, pro, boss }: { label: string; free: string; pro: string; boss: string }) {
  return (
    <>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563', fontSize: 13 }}>{label}</div>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#9ca3af', textAlign: 'center', fontSize: 13 }}>{free}</div>
      <div style={{ padding: '8px 16px', backgroundColor: '#fef2f2', color: '#991b1b', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{pro}</div>
      <div style={{ padding: '8px 16px', backgroundColor: '#fef2f2', color: '#991b1b', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{boss}</div>
    </>
  )
}

export default function UpgradePage() {
  const params = useParams()
  const vertical = params.vertical as string
  const isFoodTruck = vertical === 'food_trucks'

  const [currentTier, setCurrentTier] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState<string | null>(null)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')

  useEffect(() => {
    async function checkSubscription() {
      try {
        const res = await fetch(`/api/vendor/subscription/status?vertical=${vertical}`)
        if (res.ok) {
          const data = await res.json()
          setCurrentTier(normalizeTier(data.tier))
        } else {
          setCurrentTier('free')
        }
      } catch {
        setCurrentTier('free')
      } finally {
        setLoading(false)
      }
    }
    checkSubscription()
  }, [vertical])

  const handleSelectTier = async (tier: string) => {
    if (tier === currentTier) return

    const tierOrder: Record<string, number> = { free: 0, pro: 1, boss: 2 }
    const isDowngrade = (tierOrder[tier] || 0) < (tierOrder[currentTier || 'free'] || 0)

    if (isDowngrade && showDowngradeConfirm !== tier) {
      setShowDowngradeConfirm(tier)
      return
    }

    setIsProcessing(tier)
    setError(null)
    setShowDowngradeConfirm(null)

    try {
      if (tier === 'free') {
        // Downgrade to free
        const res = await fetch('/api/vendor/tier/downgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vertical })
        })
        if (res.ok) {
          setCurrentTier('free')
        } else {
          const data = await res.json()
          setError({ message: data.error || 'Failed to downgrade' })
        }
      } else {
        // Upgrade — redirect to Stripe checkout
        const res = await fetch('/api/subscriptions/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier,
            cycle: billingCycle,
            vertical,
            subscriptionType: 'vendor',
          })
        })

        if (res.ok) {
          const data = await res.json()
          if (data.url) window.location.href = data.url
        } else {
          const data = await res.json()
          setError({ message: data.error || 'Failed to start checkout' })
        }
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'An error occurred' })
    } finally {
      setIsProcessing(null)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <p style={{ color: '#6b7280' }}>Loading...</p>
      </div>
    )
  }

  const normalizedCurrent = normalizeTier(currentTier)
  const tierOrder: Record<string, number> = { free: 0, pro: 1, boss: 2 }
  const limits = TIER_LIMITS

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link href={`/${vertical}/vendor/dashboard`} style={{ color: colors.primary, textDecoration: 'none', fontSize: 14 }}>
            ← Back to Dashboard
          </Link>
          <h1 style={{ marginTop: 12, marginBottom: 8, fontSize: 28, fontWeight: 700, color: '#111827' }}>
            Choose Your Plan
          </h1>
          <p style={{ color: '#6b7280', fontSize: 15, margin: 0 }}>
            Scale your {isFoodTruck ? 'food truck' : 'vendor'} business with the right plan
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: 24 }}>
            <ErrorDisplay error={error} />
          </div>
        )}

        {/* Billing Cycle Toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 32, backgroundColor: '#e5e7eb', padding: 4, borderRadius: 8, width: 'fit-content', margin: '0 auto 32px' }}>
          <button
            onClick={() => setBillingCycle('monthly')}
            style={{
              padding: '8px 20px',
              backgroundColor: billingCycle === 'monthly' ? 'white' : 'transparent',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: billingCycle === 'monthly' ? 600 : 400,
              color: billingCycle === 'monthly' ? '#111827' : '#6b7280',
              cursor: 'pointer',
              boxShadow: billingCycle === 'monthly' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            style={{
              padding: '8px 20px',
              backgroundColor: billingCycle === 'annual' ? 'white' : 'transparent',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: billingCycle === 'annual' ? 600 : 400,
              color: billingCycle === 'annual' ? '#111827' : '#6b7280',
              cursor: 'pointer',
              boxShadow: billingCycle === 'annual' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            Annual <span style={{ fontSize: 11, color: '#059669' }}>Save ~30%</span>
          </button>
        </div>

        {/* Tier Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 40 }}>
          {TIERS.map(t => {
            const isCurrent = normalizedCurrent === t.key
            const isUpgrade = (tierOrder[t.key] || 0) > (tierOrder[normalizedCurrent] || 0)
            const isDowngrade = (tierOrder[t.key] || 0) < (tierOrder[normalizedCurrent] || 0)
            const price = billingCycle === 'annual' ? t.annualPrice : t.monthlyPrice
            const monthlyEquiv = billingCycle === 'annual' && t.annualPrice > 0 ? (t.annualPrice / 12).toFixed(2) : null

            return (
              <div
                key={t.key}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 12,
                  border: t.popular ? '2px solid #ff3131' : isCurrent ? '2px solid #059669' : '1px solid #e5e7eb',
                  padding: 24,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {t.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: '#ff3131', color: 'white', padding: '4px 16px', borderRadius: 12,
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    Most Popular
                  </div>
                )}

                <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#111827' }}>
                  {getVendorTierLabel(t.key)}
                </h3>

                {isCurrent && (
                  <span style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginBottom: 8 }}>
                    Current Plan
                  </span>
                )}

                <div style={{ marginBottom: 16, marginTop: 8 }}>
                  {price === 0 ? (
                    <span style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>Free</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 32, fontWeight: 700, color: '#111827' }}>
                        ${billingCycle === 'annual' ? monthlyEquiv : price.toFixed(0)}
                      </span>
                      <span style={{ fontSize: 14, color: '#6b7280' }}>/mo</span>
                      {billingCycle === 'annual' && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                          ${price.toFixed(2)}/year
                        </div>
                      )}
                    </>
                  )}
                </div>

                <ul style={{ margin: '0 0 auto', padding: '0 0 0 16px', fontSize: 13, color: '#4b5563', lineHeight: 2 }}>
                  <li>{TIER_LIMITS[t.key].productListings} {isFoodTruck ? 'menu items' : 'listings'}</li>
                  <li>{TIER_LIMITS[t.key].traditionalMarkets} {term(vertical, 'markets').toLowerCase()}</li>
                  <li>{TIER_LIMITS[t.key].marketBoxes} {term(vertical, 'market_boxes').toLowerCase()}</li>
                  <li>{TIER_LIMITS[t.key].analyticsDays}-day analytics</li>
                  {TIER_LIMITS[t.key].priorityPlacement > 0 && (
                    <li>{TIER_LIMITS[t.key].priorityPlacement === 2 ? '1st' : '2nd'} priority placement</li>
                  )}
                </ul>

                <div style={{ marginTop: 16 }}>
                  {isCurrent ? (
                    <div style={{
                      padding: '10px 0', textAlign: 'center',
                      color: '#059669', fontWeight: 600, fontSize: 14,
                    }}>
                      ✓ Active
                    </div>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => handleSelectTier(t.key)}
                      disabled={!!isProcessing}
                      style={{
                        width: '100%', padding: '10px 0',
                        backgroundColor: isProcessing === t.key ? '#d1d5db' : '#ff3131',
                        color: 'white', border: 'none', borderRadius: 8,
                        fontSize: 14, fontWeight: 600,
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isProcessing === t.key ? 'Processing...' : `Upgrade to ${getVendorTierLabel(t.key)}`}
                    </button>
                  ) : isDowngrade ? (
                    <>
                      <button
                        onClick={() => handleSelectTier(t.key)}
                        disabled={!!isProcessing}
                        style={{
                          width: '100%', padding: '10px 0',
                          backgroundColor: showDowngradeConfirm === t.key ? '#ef4444' : 'transparent',
                          color: showDowngradeConfirm === t.key ? 'white' : '#6b7280',
                          border: `1px solid ${showDowngradeConfirm === t.key ? '#ef4444' : '#d1d5db'}`,
                          borderRadius: 8, fontSize: 14, fontWeight: 500,
                          cursor: isProcessing ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isProcessing === t.key ? 'Processing...' : showDowngradeConfirm === t.key ? 'Confirm Downgrade' : 'Downgrade'}
                      </button>
                      {showDowngradeConfirm === t.key && (
                        <p style={{ fontSize: 11, color: '#ef4444', margin: '4px 0 0', textAlign: 'center' }}>
                          Click again to confirm
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {/* Feature Comparison Table */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          <h2 style={{ padding: '16px 16px 8px', margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
            Compare Plans
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: '#374151', borderBottom: '2px solid #e5e7eb' }}>Feature</div>
            <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: '#9ca3af', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>Free</div>
            <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: '#991b1b', textAlign: 'center', borderBottom: '2px solid #e5e7eb', backgroundColor: '#fef2f2' }}>Pro</div>
            <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: '#991b1b', textAlign: 'center', borderBottom: '2px solid #e5e7eb', backgroundColor: '#fef2f2' }}>Boss</div>

            <FeatureRow label={isFoodTruck ? 'Menu Items' : 'Product Listings'} free={String(limits.free.productListings)} pro={String(limits.pro.productListings)} boss={String(limits.boss.productListings)} />
            <FeatureRow label={term(vertical, 'markets')} free={String(limits.free.traditionalMarkets)} pro={String(limits.pro.traditionalMarkets)} boss={String(limits.boss.traditionalMarkets)} />
            <FeatureRow label="Private Pickups" free={String(limits.free.privatePickupLocations)} pro={String(limits.pro.privatePickupLocations)} boss={String(limits.boss.privatePickupLocations)} />
            <FeatureRow label="Pickup Windows / Location" free={String(limits.free.pickupWindowsPerLocation)} pro={String(limits.pro.pickupWindowsPerLocation)} boss={String(limits.boss.pickupWindowsPerLocation)} />
            <FeatureRow label={term(vertical, 'market_boxes')} free={String(limits.free.marketBoxes)} pro={String(limits.pro.marketBoxes)} boss={String(limits.boss.marketBoxes)} />
            <FeatureRow label="Subscribers / Offering" free={String(limits.free.maxSubscribersPerOffering)} pro={String(limits.pro.maxSubscribersPerOffering)} boss={String(limits.boss.maxSubscribersPerOffering)} />
            <FeatureRow label="Analytics" free={`${limits.free.analyticsDays} days`} pro={`${limits.pro.analyticsDays} days`} boss={`${limits.boss.analyticsDays} days + export`} />
            <FeatureRow label="Priority Placement" free="—" pro="2nd priority" boss="1st priority" />
            <FeatureRow label="Notifications" free="In-app + Email" pro="+ Push" boss="+ SMS" />
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href={`/${vertical}/vendor/dashboard`} style={{ color: '#6b7280', textDecoration: 'none', fontSize: 14 }}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
