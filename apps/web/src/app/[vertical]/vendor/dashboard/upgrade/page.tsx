'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { colors } from '@/lib/design-tokens'
import { FT_TIER_LIMITS, getFtTierLabel, type FoodTruckTier } from '@/lib/vendor-limits'
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

// ── Farmers Market Premium Upgrade Page ──────────────────────────────────

function FarmersMarketUpgradePage({ vertical }: { vertical: string }) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [alreadyPremium, setAlreadyPremium] = useState(false)

  useEffect(() => {
    async function checkSubscription() {
      try {
        const res = await fetch('/api/vendor/subscription/status')
        if (res.ok) {
          const data = await res.json()
          if (data.tier === 'premium') {
            setAlreadyPremium(true)
          }
        }
      } catch (err) {
        console.error('Error checking subscription:', err)
      } finally {
        setLoading(false)
      }
    }
    checkSubscription()
  }, [])

  const handleUpgrade = async () => {
    setIsProcessing(true)
    setError(null)

    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vendor',
          cycle: selectedPlan,
          vertical: vertical,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError({
          message: data.error || 'Failed to create checkout session',
          code: data.code,
          traceId: data.traceId
        })
        setIsProcessing(false)
        return
      }

      if (data.url) {
        window.location.href = data.url
      } else {
        setError({ message: 'No checkout URL returned' })
        setIsProcessing(false)
      }
    } catch (err) {
      console.error('Upgrade error:', err)
      setError({ message: err instanceof Error ? err.message : 'Failed to start checkout' })
      setIsProcessing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    )
  }

  if (alreadyPremium) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px 16px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', paddingTop: 80 }}>
          <div style={{
            width: 80, height: 80, backgroundColor: colors.primaryLight, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 40
          }}>
            ✓
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 'bold', color: '#111827', margin: '0 0 12px 0' }}>
            You&apos;re Already Premium!
          </h1>
          <p style={{ fontSize: 16, color: '#6b7280', margin: '0 0 32px 0', lineHeight: 1.6 }}>
            Your vendor account already has premium status. You have access to all premium features.
          </p>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{ display: 'inline-block', padding: '14px 32px', backgroundColor: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: 8, fontWeight: 600, fontSize: 16 }}
          >
            Back to Dashboard
          </Link>
          <p style={{ marginTop: 24, fontSize: 13, color: '#9ca3af' }}>
            Manage your subscription in{' '}
            <Link href={`/${vertical}/settings`} style={{ color: '#2563eb', textDecoration: 'none' }}>account settings</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '24px 16px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#666', textDecoration: 'none', fontSize: 14, marginBottom: 24 }}
        >
          &larr; Back to Dashboard
        </Link>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 'bold', color: '#333', margin: '0 0 12px 0' }}>Upgrade to Premium</h1>
          <p style={{ fontSize: 18, color: '#666', margin: 0 }}>Get more visibility and grow your business</p>
        </div>

        {/* Benefits Grid */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 32, marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: '#333', margin: '0 0 24px 0' }}>Premium Benefits</h2>

          {/* Featured Benefit - Market Box */}
          <div style={{ padding: 20, background: colors.primaryLight, borderRadius: 12, border: `2px solid ${colors.primary}`, marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 56, height: 56, backgroundColor: colors.primary, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0, color: 'white' }}>
                📦
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.primaryDark }}>{term(vertical, 'market_box')} Subscriptions</h3>
                  <span style={{ padding: '2px 8px', backgroundColor: colors.primary, color: 'white', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>REVENUE BOOSTER</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: colors.primaryDark, lineHeight: 1.5 }}>
                  Create 6 {term(vertical, 'market_box')} offerings with 4 active simultaneously. <strong>Unlimited subscribers</strong> (Standard: 2 max). Guaranteed recurring revenue with 4-week prepaid subscriptions.
                </p>
              </div>
            </div>
          </div>

          {/* Comparison Table */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 1, backgroundColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 24, fontSize: 13 }}>
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#374151' }}>Feature</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, color: '#374151', textAlign: 'center' }}>Standard</div>
            <div style={{ padding: '10px 16px', backgroundColor: '#dbeafe', fontWeight: 600, color: '#1e40af', textAlign: 'center' }}>Premium</div>

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>Product Listings</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>5</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>10</div>

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>Traditional Markets</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>1</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>4</div>

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>Private Pickup Locations</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>1</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>5</div>

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>Pickup Windows/Location</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>2</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>6</div>

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>{term(vertical, 'market_box')} Offerings</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>2</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>6</div>

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>Max Subscribers/Box</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>2</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>Unlimited</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 44, height: 44, backgroundColor: '#fef3c7', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🔝</div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>Priority Search Placement</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Listings appear higher in search results and category pages for more visibility.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 44, height: 44, backgroundColor: '#fce7f3', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>⭐</div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>Featured Everywhere</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Get highlighted on homepage, browse pages, and market pages.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 44, height: 44, backgroundColor: '#e0e7ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏆</div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>Premium Badge</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Badge on your profile and all listings builds trust with shoppers.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 44, height: 44, backgroundColor: '#f3e8ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📊</div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>Advanced Analytics</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>Sales trends, top products, customer insights, and order analytics.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
          <div onClick={() => setSelectedPlan('monthly')} style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, cursor: 'pointer', border: selectedPlan === 'monthly' ? '2px solid #2563eb' : '2px solid #e5e7eb', boxShadow: selectedPlan === 'monthly' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>Monthly</h3>
              {selectedPlan === 'monthly' && (<div style={{ backgroundColor: '#2563eb', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>SELECTED</div>)}
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 'bold', color: '#333' }}>${(SUBSCRIPTION_AMOUNTS.vendor_monthly_cents / 100).toFixed(2)}</span>
              <span style={{ color: '#666', fontSize: 16 }}>/month</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>Cancel anytime. No long-term commitment.</p>
          </div>

          <div onClick={() => setSelectedPlan('annual')} style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, cursor: 'pointer', border: selectedPlan === 'annual' ? '2px solid #2563eb' : '2px solid #e5e7eb', boxShadow: selectedPlan === 'annual' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.1)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: -10, right: 16, backgroundColor: colors.primary, color: 'white', padding: '4px 12px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>SAVE 30%</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>Annual</h3>
              {selectedPlan === 'annual' && (<div style={{ backgroundColor: '#2563eb', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>SELECTED</div>)}
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 'bold', color: '#333' }}>${(SUBSCRIPTION_AMOUNTS.vendor_annual_cents / 100).toFixed(2)}</span>
              <span style={{ color: '#666', fontSize: 16 }}>/year</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>Just ${(SUBSCRIPTION_AMOUNTS.vendor_annual_cents / 100 / 12).toFixed(2)}/month when billed annually.</p>
          </div>
        </div>

        {error && (<div style={{ marginBottom: 16 }}><ErrorDisplay error={error} verticalId={vertical} /></div>)}

        <div style={{ textAlign: 'center' }}>
          <button onClick={handleUpgrade} disabled={isProcessing} style={{ padding: '16px 48px', fontSize: 18, fontWeight: 600, backgroundColor: isProcessing ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: isProcessing ? 'not-allowed' : 'pointer', minHeight: 56 }}>
            {isProcessing ? 'Processing...' : `Upgrade Now - ${selectedPlan === 'monthly' ? `$${(SUBSCRIPTION_AMOUNTS.vendor_monthly_cents / 100).toFixed(2)}/mo` : `$${(SUBSCRIPTION_AMOUNTS.vendor_annual_cents / 100).toFixed(2)}/yr`}`}
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: '#666' }}>Secure payment powered by Stripe. Cancel anytime.</p>
        </div>

        <div style={{ marginTop: 48, padding: 24, backgroundColor: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#333' }}>Frequently Asked Questions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>What are {term(vertical, 'market_boxes')}?</h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>{term(vertical, 'market_boxes')} let you offer 4-week prepaid subscription bundles to buyers. You get guaranteed recurring revenue and can build customer loyalty with weekly pickups.</p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>What happens if I downgrade?</h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>Excess listings/markets/boxes will be managed automatically. You&apos;ll need to select which ones to keep active within standard limits.</p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>Can I cancel anytime?</h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>Yes! Cancel anytime - premium features remain active until billing period ends. No refunds for unused time.</p>
            </div>
          </div>
        </div>
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
