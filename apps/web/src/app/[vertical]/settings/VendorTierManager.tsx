'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TIER_LIMITS, normalizeTier, getVendorTierLabel, type VendorTier } from '@/lib/vendor-limits'
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
  const router = useRouter()
  const [showDowngradeModal, setShowDowngradeModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const tier = normalizeTier(currentTier)
  const limits = TIER_LIMITS[tier]
  const label = getVendorTierLabel(tier)
  const hasActiveSubscription = !!stripeSubscriptionId
  const isFoodTruck = vertical === 'food_trucks'

  const tierColors: Record<VendorTier, { bg: string; border: string; text: string; badge: string }> = {
    free: { bg: '#f9fafb', border: '#e5e7eb', text: '#545454', badge: '#9ca3af' },
    pro:  { bg: '#fff5f5', border: '#ff8f8f', text: '#545454', badge: '#ff3131' },
    boss: { bg: '#fffbeb', border: '#ffd54f', text: '#545454', badge: '#545454' },
  }
  const c = tierColors[tier]

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
          <li><strong>{limits.productListings}</strong> {isFoodTruck ? 'menu items' : 'product listings'}</li>
          <li><strong>{limits.traditionalMarkets}</strong> {term(vertical, limits.traditionalMarkets > 1 ? 'traditional_markets' : 'traditional_market').toLowerCase()}</li>
          <li><strong>{limits.privatePickupLocations}</strong> {isFoodTruck ? 'single truck location' : 'private pickup'}{limits.privatePickupLocations !== 1 ? 's' : ''}</li>
          <li><strong>{limits.marketBoxes}</strong> {term(vertical, 'market_box')} offering{limits.marketBoxes !== 1 ? 's' : ''} (up to {limits.maxSubscribersPerOffering} subscribers)</li>
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
          {hasActiveSubscription && tier !== 'free' && (
            <button
              onClick={() => setShowDowngradeModal(true)}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                color: '#ef4444',
                border: '1px solid #fca5a5',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Downgrade to Free
            </button>
          )}
        </div>
      </div>

      {/* Downgrade Modal */}
      {showDowngradeModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: 24,
            borderRadius: 8,
            maxWidth: 420,
            width: '90%',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600 }}>
              Downgrade to Free?
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#666' }}>
              Your subscription will be cancelled and your plan will revert to Free at the end of the current billing period.
              Some features may become unavailable if you exceed Free tier limits.
            </p>
            {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDowngradeModal(false)}
                disabled={isProcessing}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDowngrade}
                disabled={isProcessing}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                }}
              >
                {isProcessing ? 'Processing...' : 'Confirm Downgrade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
