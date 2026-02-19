'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FT_TIER_LIMITS, getFtTierLabel, isFoodTruckTier, type FoodTruckTier } from '@/lib/vendor-limits'

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
  const tier = isFoodTruckTier(currentTier) ? currentTier as FoodTruckTier : 'basic'
  const limits = FT_TIER_LIMITS[tier]
  const label = getFtTierLabel(tier)

  const tierColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    basic:  { bg: '#f9fafb', border: '#e5e7eb', text: '#545454', badge: '#737373' },
    pro:    { bg: '#fff5f5', border: '#ff8f8f', text: '#545454', badge: '#ff3131' },
    boss:   { bg: '#fffbeb', border: '#ffd54f', text: '#545454', badge: '#545454' },
  }
  const c = tierColors[tier] || tierColors.basic

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
        <li><strong>{limits.privatePickupLocations}</strong> service locations</li>
        <li><strong>{limits.totalMarketBoxes}</strong> Chef Box offerings</li>
        <li><strong>{limits.analyticsDays}-day</strong> analytics{limits.analyticsExport ? ' with export' : ''}</li>
        {limits.priorityPlacement > 0 && (
          <li><strong>{limits.priorityPlacement === 2 ? '1st' : '2nd'} priority</strong> placement in search</li>
        )}
        <li>Notifications: {limits.notificationChannels.map(ch => ch === 'in_app' ? 'In-App' : ch === 'email' ? 'Email' : 'SMS').join(', ')}</li>
      </ul>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {tier !== 'boss' && (
          <Link
            href={`/${vertical}/vendor/dashboard/upgrade`}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: '#ff3131',
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
        {tier !== 'basic' && (
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

  const isPremium = currentTier === 'premium' || currentTier === 'featured'
  const hasActiveSubscription = !!stripeSubscriptionId

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

  if (!isPremium) {
    return (
      <div style={{
        marginTop: 16, padding: 20,
        background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
        borderRadius: 8, border: '1px solid #fcd34d'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#92400e' }}>Upgrade to Premium Vendor</h3>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#78350f' }}>
          Grow your business with more listings, multiple markets, and priority visibility for just{' '}
          <strong>$24.99/month</strong> or <strong>$208.15/year</strong>.
        </p>
        <ul style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
          <li><strong>10 product listings</strong> (Standard: 5)</li>
          <li><strong>4 traditional markets</strong> (Standard: 1)</li>
          <li><strong>5 private pickup locations</strong> (Standard: 1)</li>
          <li><strong>6 pickup windows/location</strong> (Standard: 2)</li>
          <li><strong>6 Market Box offerings, unlimited subscribers</strong></li>
          <li><strong>Priority placement</strong> in search results</li>
          <li><strong>Featured</strong> on homepage, browse, and market pages</li>
          <li><strong>Premium badge</strong> and <strong>advanced analytics</strong></li>
        </ul>
        <Link
          href={`/${vertical}/vendor/dashboard/upgrade`}
          style={{ display: 'inline-block', padding: '10px 20px', backgroundColor: '#d97706', color: 'white', textDecoration: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14 }}
        >
          Upgrade Now
        </Link>
      </div>
    )
  }

  return (
    <>
      <div style={{ marginTop: 16, padding: 16, backgroundColor: '#fef3c7', borderRadius: 8, border: '1px solid #fcd34d' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: '#92400e' }}>Premium Benefits Active</p>
        <ul style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
          <li><strong>10 product listings</strong> (Standard: 5)</li>
          <li><strong>4 traditional markets + 5 private pickup locations</strong></li>
          <li><strong>6 pickup windows per location</strong> (Standard: 2)</li>
          <li><strong>6 Market Boxes, unlimited subscribers</strong> (Standard: 2 boxes, 2 max)</li>
          <li><strong>Priority placement</strong> in search results</li>
          <li><strong>Featured</strong> on homepage, browse, and market pages</li>
          <li><strong>Premium badge</strong> on profile and all listings</li>
          <li><strong>Advanced analytics</strong> - sales trends, top products, customer insights</li>
        </ul>
        <button
          onClick={() => setShowDowngradeModal(true)}
          style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#92400e', border: '1px solid #92400e', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
        >
          Downgrade to Standard
        </button>
      </div>

      {showDowngradeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 20, fontWeight: 600, color: '#111827' }}>Downgrade to Standard?</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4b5563' }}>
              Are you sure you want to downgrade your vendor account to the Standard tier? You will lose the following benefits:
            </p>
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>Listing & Location Limits:</p>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: 20, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                <li>Product listings reduced to <strong>5</strong> (excess unpublished)</li>
                <li>Traditional markets reduced to <strong>1</strong> (must select home market)</li>
                <li>Private pickup locations reduced to <strong>1</strong></li>
                <li>Pickup windows reduced to <strong>2 per location</strong></li>
              </ul>
              <p style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>Market Box Restrictions:</p>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: 20, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                <li>Market Boxes reduced to <strong>2 total, 1 active</strong></li>
                <li>Subscriber limit drops to <strong>2 per box</strong></li>
                <li>Existing subscribers over limit cannot renew</li>
              </ul>
              <p style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>Visibility & Analytics:</p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                <li>Priority search placement removed</li>
                <li>Removed from featured sections</li>
                <li>Premium badge removed</li>
                <li>Advanced analytics no longer accessible</li>
              </ul>
            </div>
            {hasActiveSubscription && (
              <div style={{ padding: 12, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
                  Important: No refunds will be issued for unused subscription time. If you have an annual subscription, the remaining balance will not be refunded.
                </p>
              </div>
            )}
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
                {isProcessing ? 'Processing...' : 'Confirm Downgrade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
