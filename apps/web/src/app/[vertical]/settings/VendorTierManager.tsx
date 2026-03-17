'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FT_TIER_LIMITS, TIER_LIMITS, getFtTierLabel, isFoodTruckTier, type FoodTruckTier, type VendorTier } from '@/lib/vendor-limits'
import { term } from '@/lib/vertical'

interface VendorTierManagerProps {
  vertical: string
  vendorId: string
  currentTier: string
  stripeSubscriptionId?: string | null
  primaryColor?: string
}

export default function VendorTierManager({
  vertical,
  vendorId,
  currentTier,
  stripeSubscriptionId,
}: VendorTierManagerProps) {
  // Food truck vendors get their own tier manager
  if (vertical === 'food_trucks') {
    return <FtTierManager vertical={vertical} currentTier={currentTier} />
  }

  return (
    <FmTierManager
      vertical={vertical}
      vendorId={vendorId}
      currentTier={currentTier}
      stripeSubscriptionId={stripeSubscriptionId}
    />
  )
}

// ── Food Truck Tier Manager ─────────────────────────────────────────────

function FtTierManager({ vertical, currentTier }: { vertical: string; currentTier: string }) {
  const tier = isFoodTruckTier(currentTier) ? currentTier as FoodTruckTier : 'free'
  const limits = FT_TIER_LIMITS[tier]
  const label = getFtTierLabel(tier)

  const tierColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    free:   { bg: '#f9fafb', border: '#e5e7eb', text: '#545454', badge: '#9ca3af' },
    basic:  { bg: '#f9fafb', border: '#e5e7eb', text: '#545454', badge: '#737373' },
    pro:    { bg: '#fff5f5', border: '#ff8f8f', text: '#545454', badge: '#ff3131' },
    boss:   { bg: '#fffbeb', border: '#ffd54f', text: '#545454', badge: '#545454' },
  }
  const c = tierColors[tier] || tierColors.free

  return (
    <div style={{ marginTop: 16, padding: 20, backgroundColor: c.bg, borderRadius: 8, border: `1px solid ${c.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          padding: '3px 10px',
          backgroundColor: c.badge,
          color: 'white',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 700,
        }}>
          {label.toUpperCase()}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>
          {label} Plan Active
        </span>
      </div>

      <ul style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 13, color: c.text, lineHeight: 1.8 }}>
        <li><strong>{limits.productListings}</strong> menu items</li>
        <li><strong>{limits.privatePickupLocations}</strong> single truck location{limits.privatePickupLocations !== 1 ? 's' : ''}</li>
        <li><strong>{limits.traditionalMarkets}</strong> multi-truck location{limits.traditionalMarkets !== 1 ? 's' : ''}</li>
        <li><strong>{limits.totalMarketBoxes}</strong> Chef Box{limits.totalMarketBoxes !== 1 ? 'es' : ''} (up to {limits.maxSubscribersPerOffering} subscribers)</li>
        {limits.analyticsDays > 0 ? (
          <li><strong>{limits.analyticsDays}-day</strong> analytics{limits.analyticsExport ? ' + export' : ''}</li>
        ) : (
          <li style={{ opacity: 0.6 }}>No analytics</li>
        )}
        {limits.priorityPlacement > 0 && (
          <li><strong>{limits.priorityPlacement === 2 ? '1st' : '2nd'} priority</strong> placement in search</li>
        )}
      </ul>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {tier !== 'boss' && (
          <Link
            href={`/${vertical}/vendor/dashboard/upgrade`}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: 'transparent',
              color: '#ff5757',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14,
              border: '2px solid #ff5757',
            }}
          >
            Upgrade Plan
          </Link>
        )}
        {tier !== 'free' && (
          <Link
            href={`/${vertical}/vendor/dashboard/upgrade`}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: 'transparent',
              color: '#666',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 500,
              fontSize: 14,
              border: '1px solid #d1d5db',
            }}
          >
            Change Plan
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Farmers Market Tier Manager ─────────────────────────────────────────

const FM_TIER_LABELS: Record<string, string> = {
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
  featured: 'Featured',
}

function FmTierManager({
  vertical,
  vendorId,
  currentTier,
  stripeSubscriptionId,
}: {
  vertical: string
  vendorId: string
  currentTier: string
  stripeSubscriptionId?: string | null
}) {
  const router = useRouter()
  const [showDowngradeModal, setShowDowngradeModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const tier = (['free', 'standard', 'premium', 'featured'].includes(currentTier) ? currentTier : 'free') as VendorTier
  const limits = TIER_LIMITS[tier]
  const label = FM_TIER_LABELS[tier] || 'Free'
  const hasActiveSubscription = !!stripeSubscriptionId

  const tierColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    free:     { bg: '#f9fafb', border: '#e5e7eb', text: '#545454', badge: '#9ca3af' },
    standard: { bg: '#f0fdf4', border: '#86efac', text: '#166534', badge: '#166534' },
    premium:  { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: '#3b82f6' },
    featured: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', badge: '#f59e0b' },
  }
  const c = tierColors[tier] || tierColors.free

  const handleDowngrade = async () => {
    setIsProcessing(true)
    setError('')

    try {
      const res = await fetch('/api/vendor/tier/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to downgrade')
      }

      setShowDowngradeModal(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <div style={{ marginTop: 16, padding: 20, backgroundColor: c.bg, borderRadius: 8, border: `1px solid ${c.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            padding: '3px 10px',
            backgroundColor: c.badge,
            color: 'white',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
          }}>
            {label.toUpperCase()}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: c.text }}>
            {label} Plan Active
          </span>
        </div>

        <ul style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 13, color: c.text, lineHeight: 1.8 }}>
          <li><strong>{limits.productListings}</strong> product listings</li>
          <li><strong>{limits.traditionalMarkets}</strong> {term(vertical, limits.traditionalMarkets > 1 ? 'traditional_markets' : 'traditional_market').toLowerCase()}</li>
          <li><strong>{limits.privatePickupLocations}</strong> {term(vertical, limits.privatePickupLocations > 1 ? 'private_pickups' : 'private_pickup').toLowerCase()}</li>
          <li><strong>{limits.totalMarketBoxes}</strong> {term(vertical, 'market_box')} offerings ({limits.activeMarketBoxes} active, up to {limits.maxSubscribersPerOffering} subscribers)</li>
          {limits.analyticsDays > 0 ? (
            <li><strong>{limits.analyticsDays}-day</strong> analytics{limits.analyticsExport ? ' + export' : ''}</li>
          ) : (
            <li style={{ opacity: 0.6 }}>No analytics</li>
          )}
        </ul>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {tier !== 'featured' && (
            <Link
              href={`/${vertical}/vendor/dashboard/upgrade`}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#166534',
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Upgrade Plan
            </Link>
          )}
          {tier !== 'free' && hasActiveSubscription && (
            <button
              onClick={() => setShowDowngradeModal(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Change Plan
            </button>
          )}
        </div>
      </div>

      {showDowngradeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 600, color: '#111827' }}>Cancel Subscription?</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4b5563' }}>
              Your subscription will be cancelled at the end of your billing period. You&apos;ll keep your current {label} tier benefits until then, after which your account will be downgraded to Free.
            </p>
            {error && (
              <div style={{ padding: 12, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>{error}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDowngradeModal(false)} disabled={isProcessing} style={{ padding: '10px 20px', backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDowngrade} disabled={isProcessing} style={{ padding: '10px 20px', backgroundColor: isProcessing ? '#9ca3af' : '#dc2626', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: isProcessing ? 'not-allowed' : 'pointer' }}>
                {isProcessing ? 'Processing...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
