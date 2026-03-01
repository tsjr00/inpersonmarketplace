'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { colors } from '@/lib/design-tokens'
import { FT_TIER_LIMITS, TIER_LIMITS, getFtTierLabel, type FoodTruckTier, type VendorTier } from '@/lib/vendor-limits'
import { SUBSCRIPTION_AMOUNTS } from '@/lib/pricing'
import { term } from '@/lib/vertical'

// ── Food Truck 3-Tier Upgrade Page ──────────────────────────────────────

const FT_TIERS: { key: FoodTruckTier; price: number; popular?: boolean }[] = [
  { key: 'free', price: 0 },
  { key: 'basic', price: SUBSCRIPTION_AMOUNTS.ft_basic_monthly_cents / 100 },
  { key: 'pro', price: SUBSCRIPTION_AMOUNTS.ft_pro_monthly_cents / 100, popular: true },
  { key: 'boss', price: SUBSCRIPTION_AMOUNTS.ft_boss_monthly_cents / 100 },
]

function FtFeatureRow({ label, free, basic, pro, boss }: { label: string; free: string; basic: string; pro: string; boss: string }) {
  return (
    <>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563', fontSize: 13 }}>{label}</div>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#9ca3af', textAlign: 'center', fontSize: 13 }}>{free}</div>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center', fontSize: 13 }}>{basic}</div>
      <div style={{ padding: '8px 16px', backgroundColor: '#fef2f2', color: '#991b1b', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{pro}</div>
      <div style={{ padding: '8px 16px', backgroundColor: '#fef2f2', color: '#991b1b', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{boss}</div>
    </>
  )
}

function FoodTruckUpgradePage({ vertical }: { vertical: string }) {
  const [currentTier, setCurrentTier] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState<string | null>(null) // tier being processed
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState<string | null>(null)

  useEffect(() => {
    async function checkSubscription() {
      try {
        const res = await fetch(`/api/vendor/subscription/status?vertical=${vertical}`)
        if (res.ok) {
          const data = await res.json()
          setCurrentTier(data.tier || 'free')
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

    // Check if downgrade
    const tierOrder: Record<string, number> = { free: 0, basic: 1, pro: 2, boss: 3 }
    const isDowngrade = (tierOrder[tier] || 0) < (tierOrder[currentTier || 'free'] || 0)

    if (isDowngrade && showDowngradeConfirm !== tier) {
      setShowDowngradeConfirm(tier)
      return
    }

    setIsProcessing(tier)
    setError(null)
    setShowDowngradeConfirm(null)

    try {
      // Free tier: cancel subscription and set tier directly (no Stripe checkout)
      if (tier === 'free') {
        const res = await fetch('/api/vendor/subscription/downgrade-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vertical }),
        })

        const data = await res.json()

        if (!res.ok) {
          setError({
            message: data.error || 'Failed to downgrade',
            code: data.code,
            traceId: data.traceId,
          })
          setIsProcessing(null)
          return
        }

        setCurrentTier('free')
        setIsProcessing(null)
        return
      }

      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vendor',
          cycle: 'monthly',
          vertical,
          tier,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError({
          message: data.error || 'Failed to create checkout session',
          code: data.code,
          traceId: data.traceId,
        })
        setIsProcessing(null)
        return
      }

      if (data.url) {
        window.location.href = data.url
      } else {
        setError({ message: 'No checkout URL returned' })
        setIsProcessing(null)
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to start checkout' })
      setIsProcessing(null)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    )
  }

  const f = FT_TIER_LIMITS.free
  const b = FT_TIER_LIMITS.basic
  const p = FT_TIER_LIMITS.pro
  const bo = FT_TIER_LIMITS.boss

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px 16px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Back Link */}
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#666', textDecoration: 'none', fontSize: 14, marginBottom: 24 }}
        >
          &larr; Back to Dashboard
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 'bold', color: '#333', margin: '0 0 12px 0' }}>
            Choose Your Plan
          </h1>
          <p style={{ fontSize: 18, color: '#666', margin: 0 }}>
            All plans include access to the Food Truck&apos;n platform. Upgrade for more features.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16 }}>
            <ErrorDisplay error={error} verticalId={vertical} />
          </div>
        )}

        {/* Tier Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
          marginBottom: 40,
        }}>
          {FT_TIERS.map(({ key, price, popular }) => {
            const limits = FT_TIER_LIMITS[key]
            const isCurrent = currentTier === key
            const tierOrder: Record<string, number> = { free: 0, basic: 1, pro: 2, boss: 3 }
            const isUpgrade = (tierOrder[key] || 0) > (tierOrder[currentTier || 'free'] || 0)
            const isDowngrade = (tierOrder[key] || 0) < (tierOrder[currentTier || 'free'] || 0)
            const processing = isProcessing === key

            return (
              <div
                key={key}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 16,
                  padding: 28,
                  border: popular ? '2px solid #ff3131' : isCurrent ? '2px solid #4A4A4A' : '2px solid #e5e7eb',
                  boxShadow: popular ? '0 8px 24px rgba(255, 49, 49, 0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Popular badge */}
                {popular && (
                  <div style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#ff3131',
                    color: 'white',
                    padding: '4px 16px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>
                    MOST POPULAR
                  </div>
                )}

                {/* Current plan badge */}
                {isCurrent && (
                  <div style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#4A4A4A',
                    color: 'white',
                    padding: '4px 16px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>
                    CURRENT PLAN
                  </div>
                )}

                {/* Tier name */}
                <h3 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 700, color: '#333', textAlign: 'center' }}>
                  {getFtTierLabel(key)}
                </h3>

                {/* Price */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  {price === 0 ? (
                    <span style={{ fontSize: 32, fontWeight: 'bold', color: '#333' }}>Free forever</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 40, fontWeight: 'bold', color: '#333' }}>${price}</span>
                      <span style={{ color: '#666', fontSize: 16 }}>/mo</span>
                    </>
                  )}
                </div>

                {/* Feature list */}
                <ul style={{ margin: '0 0 24px', paddingLeft: 20, fontSize: 14, color: '#4b5563', lineHeight: 2, flex: 1 }}>
                  <li><strong>{limits.productListings}</strong> menu items</li>
                  <li><strong>{limits.privatePickupLocations}</strong> service location{limits.privatePickupLocations !== 1 ? 's' : ''}</li>
                  {limits.totalMarketBoxes > 0 ? (
                    <li><strong>{limits.totalMarketBoxes}</strong> Chef Box offerings</li>
                  ) : (
                    <li style={{ color: '#9ca3af' }}>No Chef Boxes</li>
                  )}
                  {limits.analyticsDays > 0 ? (
                    <li><strong>{limits.analyticsDays}-day</strong> analytics{limits.analyticsExport ? ' + export' : ''}</li>
                  ) : (
                    <li style={{ color: '#9ca3af' }}>No analytics</li>
                  )}
                  {limits.priorityPlacement > 0 && (
                    <li><strong>{limits.priorityPlacement === 2 ? '1st' : '2nd'} priority</strong> placement</li>
                  )}
                  <li>Notifications: {limits.notificationChannels.map(c => c === 'in_app' ? 'In-App' : c === 'push' ? 'Push' : c === 'email' ? 'Email' : 'SMS').join(', ')}</li>
                </ul>

                {/* Action button */}
                {isCurrent ? (
                  <button
                    disabled
                    style={{
                      width: '100%',
                      padding: '14px 0',
                      fontSize: 16,
                      fontWeight: 600,
                      backgroundColor: '#f3f4f6',
                      color: '#9ca3af',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      cursor: 'not-allowed',
                    }}
                  >
                    Current Plan
                  </button>
                ) : isUpgrade ? (
                  <button
                    onClick={() => handleSelectTier(key)}
                    disabled={!!isProcessing}
                    style={{
                      width: '100%',
                      padding: '14px 0',
                      fontSize: 16,
                      fontWeight: 600,
                      backgroundColor: processing ? '#f5f5f5' : 'transparent',
                      color: processing ? '#9ca3af' : '#ff3131',
                      border: processing ? '2px solid #9ca3af' : '2px solid #ff3131',
                      borderRadius: 8,
                      cursor: processing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {processing ? 'Processing...' : `Upgrade to ${getFtTierLabel(key)}`}
                  </button>
                ) : isDowngrade ? (
                  <>
                    <button
                      onClick={() => handleSelectTier(key)}
                      disabled={!!isProcessing}
                      style={{
                        width: '100%',
                        padding: '14px 0',
                        fontSize: 16,
                        fontWeight: 600,
                        backgroundColor: showDowngradeConfirm === key ? '#dc2626' : processing ? '#9ca3af' : 'white',
                        color: showDowngradeConfirm === key ? 'white' : '#666',
                        border: showDowngradeConfirm === key ? 'none' : '1px solid #d1d5db',
                        borderRadius: 8,
                        cursor: processing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {processing ? 'Processing...' : showDowngradeConfirm === key ? 'Confirm Downgrade' : `Downgrade to ${getFtTierLabel(key)}`}
                    </button>
                    {showDowngradeConfirm === key && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626', textAlign: 'center' }}>
                        You will lose access to {getFtTierLabel(currentTier || 'free')} features. Click again to confirm.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Feature Comparison Table */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 32,
          marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#333', margin: '0 0 24px 0' }}>
            Compare Plans
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr',
            gap: 1,
            backgroundColor: '#e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#374151', fontSize: 13 }}>Feature</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#9ca3af', textAlign: 'center', fontSize: 13 }}>Free</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#374151', textAlign: 'center', fontSize: 13 }}>Basic</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#fef2f2', fontWeight: 600, color: '#991b1b', textAlign: 'center', fontSize: 13 }}>Pro</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#fef2f2', fontWeight: 600, color: '#991b1b', textAlign: 'center', fontSize: 13 }}>Boss</div>

            <FtFeatureRow label="Menu Items" free={String(f.productListings)} basic={String(b.productListings)} pro={String(p.productListings)} boss={String(bo.productListings)} />
            <FtFeatureRow label="Service Locations" free={String(f.privatePickupLocations)} basic={String(b.privatePickupLocations)} pro={String(p.privatePickupLocations)} boss={String(bo.privatePickupLocations)} />
            <FtFeatureRow label="Chef Boxes" free="—" basic={String(b.totalMarketBoxes)} pro={String(p.totalMarketBoxes)} boss={String(bo.totalMarketBoxes)} />
            <FtFeatureRow label="Subscribers/Box" free="—" basic={String(b.maxSubscribersPerOffering)} pro={String(p.maxSubscribersPerOffering)} boss={String(bo.maxSubscribersPerOffering)} />
            <FtFeatureRow label="Analytics" free="—" basic="30-day" pro="90-day" boss="90-day + Export" />
            <FtFeatureRow label="Prep Sheet" free="—" basic="Yes" pro="Yes" boss="Yes" />
            <FtFeatureRow label="Priority Placement" free="—" basic="—" pro="2nd" boss="1st" />
            <FtFeatureRow label="Notifications" free="In-App" basic="In-App" pro="App, Push, Email" boss="All (incl SMS)" />
          </div>
        </div>

        {/* FAQ */}
        <div style={{
          padding: 24,
          backgroundColor: 'white',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#333' }}>
            Frequently Asked Questions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What are Chef Boxes?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Chef Boxes let you offer 4-week prepaid meal subscriptions — like Weekly Dinner Boxes, Family Kits, or Mystery Boxes. Customers get guaranteed meals, and you get guaranteed recurring revenue.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                Can I change plans anytime?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Yes! Upgrade or downgrade anytime. When you change plans, your current subscription is canceled and you start fresh on the new plan.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What happens if I downgrade?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                If you exceed the lower plan&apos;s limits, you&apos;ll need to deactivate extra menu items, locations, or Chef Boxes to stay within your new plan&apos;s limits.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What is priority placement?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Boss members appear first in search results, Pro members appear second. Priority only applies within matching search results — it doesn&apos;t override category or location filters.
              </p>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#666' }}>
          Secure payment powered by Stripe. All plans billed monthly.
        </p>
      </div>
    </div>
  )
}

// ── Farmers Market 4-Tier Upgrade Page ──────────────────────────────────

const FM_TIERS: { key: VendorTier; price: number; popular?: boolean }[] = [
  { key: 'free', price: 0 },
  { key: 'standard', price: SUBSCRIPTION_AMOUNTS.fm_standard_monthly_cents / 100 },
  { key: 'premium', price: SUBSCRIPTION_AMOUNTS.fm_premium_monthly_cents / 100, popular: true },
  { key: 'featured', price: SUBSCRIPTION_AMOUNTS.fm_featured_monthly_cents / 100 },
]

const FM_TIER_LABELS: Record<string, string> = {
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
  featured: 'Featured',
}

function FmFeatureRow({ label, free, standard, premium, featured }: { label: string; free: string; standard: string; premium: string; featured: string }) {
  return (
    <>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563', fontSize: 13 }}>{label}</div>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#9ca3af', textAlign: 'center', fontSize: 13 }}>{free}</div>
      <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center', fontSize: 13 }}>{standard}</div>
      <div style={{ padding: '8px 16px', backgroundColor: '#f0fdf4', color: '#166534', textAlign: 'center', fontSize: 13, fontWeight: 600 }}>{premium}</div>
      <div style={{ padding: '8px 16px', backgroundColor: '#fffbeb', color: '#92400e', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{featured}</div>
    </>
  )
}

function FarmersMarketUpgradePage({ vertical }: { vertical: string }) {
  const [currentTier, setCurrentTier] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState<string | null>(null)

  useEffect(() => {
    async function checkSubscription() {
      try {
        const res = await fetch(`/api/vendor/subscription/status?vertical=${vertical}`)
        if (res.ok) {
          const data = await res.json()
          setCurrentTier(data.tier || 'free')
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

    const tierOrder: Record<string, number> = { free: 0, standard: 1, premium: 2, featured: 3 }
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
        const res = await fetch('/api/vendor/subscription/downgrade-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vertical }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError({ message: data.error || 'Failed to downgrade', code: data.code, traceId: data.traceId })
          setIsProcessing(null)
          return
        }
        setCurrentTier('free')
        setIsProcessing(null)
        return
      }

      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vendor', cycle: 'monthly', vertical, tier }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError({ message: data.error || 'Failed to create checkout session', code: data.code, traceId: data.traceId })
        setIsProcessing(null)
        return
      }
      if (data.url) {
        window.location.href = data.url
      } else {
        setError({ message: 'No checkout URL returned' })
        setIsProcessing(null)
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to start checkout' })
      setIsProcessing(null)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    )
  }

  const fr = TIER_LIMITS.free
  const st = TIER_LIMITS.standard
  const pr = TIER_LIMITS.premium
  const fe = TIER_LIMITS.featured

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px 16px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Back Link */}
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#666', textDecoration: 'none', fontSize: 14, marginBottom: 24 }}
        >
          &larr; Back to Dashboard
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 'bold', color: '#333', margin: '0 0 12px 0' }}>
            Choose Your Plan
          </h1>
          <p style={{ fontSize: 18, color: '#666', margin: 0 }}>
            Grow your business with the right plan for you.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16 }}>
            <ErrorDisplay error={error} verticalId={vertical} />
          </div>
        )}

        {/* Tier Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 20,
          marginBottom: 40,
        }}>
          {FM_TIERS.map(({ key, price, popular }) => {
            const limits = TIER_LIMITS[key]
            const isCurrent = currentTier === key
            const tierOrder: Record<string, number> = { free: 0, standard: 1, premium: 2, featured: 3 }
            const isUpgrade = (tierOrder[key] || 0) > (tierOrder[currentTier || 'free'] || 0)
            const isDowngrade = (tierOrder[key] || 0) < (tierOrder[currentTier || 'free'] || 0)
            const processing = isProcessing === key

            const borderColor = popular ? '#166534' : isCurrent ? '#4A4A4A' : key === 'featured' ? '#f59e0b' : '#e5e7eb'
            const shadowStyle = popular ? '0 8px 24px rgba(22, 101, 52, 0.15)' : '0 1px 3px rgba(0,0,0,0.1)'

            return (
              <div
                key={key}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 16,
                  padding: 24,
                  border: `2px solid ${borderColor}`,
                  boxShadow: shadowStyle,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Popular badge */}
                {popular && !isCurrent && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: '#166534', color: 'white', padding: '4px 16px', borderRadius: 20,
                    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    MOST POPULAR
                  </div>
                )}

                {/* Current plan badge */}
                {isCurrent && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: '#4A4A4A', color: 'white', padding: '4px 16px', borderRadius: 20,
                    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    CURRENT PLAN
                  </div>
                )}

                {/* Tier name */}
                <h3 style={{ margin: '8px 0 4px', fontSize: 20, fontWeight: 700, color: '#333', textAlign: 'center' }}>
                  {FM_TIER_LABELS[key]}
                </h3>

                {/* Price */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  {price === 0 ? (
                    <span style={{ fontSize: 28, fontWeight: 'bold', color: '#333' }}>Free forever</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 36, fontWeight: 'bold', color: '#333' }}>${price.toFixed(2)}</span>
                      <span style={{ color: '#666', fontSize: 16 }}>/mo</span>
                    </>
                  )}
                </div>

                {/* Feature list */}
                <ul style={{ margin: '0 0 24px', paddingLeft: 18, fontSize: 13, color: '#4b5563', lineHeight: 2, flex: 1 }}>
                  <li><strong>{limits.productListings}</strong> product listings</li>
                  <li><strong>{limits.traditionalMarkets}</strong> traditional market{limits.traditionalMarkets > 1 ? 's' : ''}</li>
                  <li><strong>{limits.privatePickupLocations}</strong> private pickup{limits.privatePickupLocations > 1 ? 's' : ''}</li>
                  <li><strong>{limits.totalMarketBoxes}</strong> {term(vertical, 'market_box')} offering{limits.totalMarketBoxes > 1 ? 's' : ''}</li>
                  <li><strong>{limits.maxSubscribersPerOffering}</strong> max subscribers</li>
                </ul>

                {/* Action button */}
                {isCurrent ? (
                  <button
                    disabled
                    style={{
                      width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600,
                      backgroundColor: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb',
                      borderRadius: 8, cursor: 'not-allowed',
                    }}
                  >
                    Current Plan
                  </button>
                ) : isUpgrade ? (
                  <button
                    onClick={() => handleSelectTier(key)}
                    disabled={!!isProcessing}
                    style={{
                      width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600,
                      backgroundColor: processing ? '#f5f5f5' : '#166534',
                      color: processing ? '#9ca3af' : 'white',
                      border: 'none', borderRadius: 8,
                      cursor: processing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {processing ? 'Processing...' : `Upgrade to ${FM_TIER_LABELS[key]}`}
                  </button>
                ) : isDowngrade ? (
                  <>
                    <button
                      onClick={() => handleSelectTier(key)}
                      disabled={!!isProcessing}
                      style={{
                        width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600,
                        backgroundColor: showDowngradeConfirm === key ? '#dc2626' : processing ? '#9ca3af' : 'white',
                        color: showDowngradeConfirm === key ? 'white' : '#666',
                        border: showDowngradeConfirm === key ? 'none' : '1px solid #d1d5db',
                        borderRadius: 8, cursor: processing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {processing ? 'Processing...' : showDowngradeConfirm === key ? 'Confirm Downgrade' : `Downgrade to ${FM_TIER_LABELS[key]}`}
                    </button>
                    {showDowngradeConfirm === key && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626', textAlign: 'center' }}>
                        You will lose access to {FM_TIER_LABELS[currentTier || 'free']} features. Click again to confirm.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Feature Comparison Table */}
        <div style={{
          backgroundColor: 'white', borderRadius: 12, padding: 32, marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#333', margin: '0 0 24px 0' }}>
            Compare Plans
          </h2>

          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr', gap: 1,
            backgroundColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#374151', fontSize: 13 }}>Feature</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#9ca3af', textAlign: 'center', fontSize: 13 }}>Free</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#374151', textAlign: 'center', fontSize: 13 }}>Standard</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#f0fdf4', fontWeight: 600, color: '#166534', textAlign: 'center', fontSize: 13 }}>Premium</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#fffbeb', fontWeight: 600, color: '#92400e', textAlign: 'center', fontSize: 13 }}>Featured</div>

            <FmFeatureRow label="Product Listings" free={String(fr.productListings)} standard={String(st.productListings)} premium={String(pr.productListings)} featured={String(fe.productListings)} />
            <FmFeatureRow label="Traditional Markets" free={String(fr.traditionalMarkets)} standard={String(st.traditionalMarkets)} premium={String(pr.traditionalMarkets)} featured={String(fe.traditionalMarkets)} />
            <FmFeatureRow label="Private Pickups" free={String(fr.privatePickupLocations)} standard={String(st.privatePickupLocations)} premium={String(pr.privatePickupLocations)} featured={String(fe.privatePickupLocations)} />
            <FmFeatureRow label="Windows/Location" free={String(fr.pickupWindowsPerLocation)} standard={String(st.pickupWindowsPerLocation)} premium={String(pr.pickupWindowsPerLocation)} featured={String(fe.pickupWindowsPerLocation)} />
            <FmFeatureRow label={`${term(vertical, 'market_box')} Offerings`} free={String(fr.totalMarketBoxes)} standard={String(st.totalMarketBoxes)} premium={String(pr.totalMarketBoxes)} featured={String(fe.totalMarketBoxes)} />
            <FmFeatureRow label="Active Offerings" free={String(fr.activeMarketBoxes)} standard={String(st.activeMarketBoxes)} premium={String(pr.activeMarketBoxes)} featured={String(fe.activeMarketBoxes)} />
            <FmFeatureRow label="Max Subscribers" free={String(fr.maxSubscribersPerOffering)} standard={String(st.maxSubscribersPerOffering)} premium={String(pr.maxSubscribersPerOffering)} featured={String(fe.maxSubscribersPerOffering)} />
          </div>
        </div>

        {/* FAQ */}
        <div style={{
          padding: 24, backgroundColor: 'white', borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#333' }}>
            Frequently Asked Questions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What are {term(vertical, 'market_boxes')}?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                {term(vertical, 'market_boxes')} let you offer 4-week prepaid subscription bundles to buyers. You get guaranteed recurring revenue and can build customer loyalty with weekly pickups.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                Can I change plans anytime?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Yes! Upgrade or downgrade anytime. When you change plans, your current subscription is canceled and you start fresh on the new plan.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What happens if I downgrade?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                If you exceed the lower plan&apos;s limits, you&apos;ll need to deactivate extra listings, markets, or {term(vertical, 'market_boxes')} to stay within your new plan&apos;s limits.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What&apos;s the difference between Premium and Featured?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Featured vendors get more listings, more markets, more {term(vertical, 'market_box')} offerings, and higher subscriber caps. Same monthly price as Premium.
              </p>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#666' }}>
          Secure payment powered by Stripe. All paid plans billed monthly.
        </p>
      </div>
    </div>
  )
}

// ── Route Component ──────────────────────────────────────────────────────

export default function VendorUpgradePage() {
  const params = useParams()
  const vertical = params.vertical as string

  if (vertical === 'food_trucks') {
    return <FoodTruckUpgradePage vertical={vertical} />
  }

  return <FarmersMarketUpgradePage vertical={vertical} />
}
