'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface VendorTierManagerProps {
  vertical: string
  vendorId: string
  currentTier: string
  stripeSubscriptionId?: string | null
  primaryColor: string
}

export default function VendorTierManager({
  vertical,
  vendorId,
  currentTier,
  stripeSubscriptionId,
  primaryColor
}: VendorTierManagerProps) {
  const router = useRouter()
  const [showDowngradeModal, setShowDowngradeModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const isPremium = currentTier === 'premium' || currentTier === 'featured'

  // Check if this might be an annual subscription (has stripe subscription)
  // In a full implementation, we'd check the actual billing period from Stripe
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

      // Success - close modal and refresh
      setShowDowngradeModal(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isPremium) {
    // Standard tier - show upgrade option with benefits
    return (
      <div style={{
        marginTop: 16,
        padding: 20,
        background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
        borderRadius: 8,
        border: '1px solid #fcd34d'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: '#92400e'
          }}>
            Upgrade to Premium Vendor
          </h3>
        </div>

        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#78350f' }}>
          Grow your business with more listings, multiple markets, and priority visibility for just{' '}
          <strong>$24.99/month</strong> or <strong>$208.15/year</strong>.
        </p>

        <ul style={{
          margin: '0 0 16px 0',
          paddingLeft: 20,
          fontSize: 13,
          color: '#78350f',
          lineHeight: 1.6
        }}>
          <li><strong>10 product listings</strong> (Standard: 5 listings)</li>
          <li><strong>Multiple markets</strong> - sell at multiple locations (Standard: 1 market only)</li>
          <li><strong>Priority placement</strong> in search results and browse pages</li>
          <li><strong>Featured sections</strong> on homepage and category pages</li>
          <li><strong>Premium badge</strong> on your vendor profile</li>
          <li><strong>Advanced analytics</strong> - detailed sales and performance insights</li>
        </ul>

        <Link
          href={`/${vertical}/vendor/dashboard/upgrade`}
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#d97706',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 14
          }}
        >
          Upgrade Now
        </Link>
      </div>
    )
  }

  // Premium/Featured tier - show current benefits and downgrade option
  return (
    <>
      <div style={{
        marginTop: 16,
        padding: 16,
        backgroundColor: '#fef3c7',
        borderRadius: 8,
        border: '1px solid #fcd34d'
      }}>
        <p style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600, color: '#92400e' }}>
          Premium Benefits Active
        </p>
        <ul style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 13, color: '#92400e', lineHeight: 1.6 }}>
          <li><strong>10 product listings</strong> (Standard tier: 5 listings)</li>
          <li><strong>Multiple market availability</strong> - sell at multiple markets and pickup locations (Standard tier: 1 market only)</li>
          <li><strong>Priority placement</strong> in search results and category pages</li>
          <li><strong>Featured sections</strong> on homepage and browse pages</li>
          <li><strong>Premium badge</strong> displayed on your vendor profile</li>
          <li><strong>Advanced analytics</strong> - detailed insights on views, sales, and trends</li>
        </ul>

        <button
          onClick={() => setShowDowngradeModal(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: '#92400e',
            border: '1px solid #92400e',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          Downgrade to Standard
        </button>
      </div>

      {/* Downgrade Confirmation Modal */}
      {showDowngradeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 12,
            padding: 24,
            maxWidth: 480,
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: 20,
              fontWeight: 600,
              color: '#111827'
            }}>
              Downgrade to Standard?
            </h3>

            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4b5563' }}>
              Are you sure you want to downgrade your vendor account to the Standard tier?
              You will lose the following benefits:
            </p>

            <ul style={{
              margin: '0 0 16px 0',
              paddingLeft: 20,
              fontSize: 14,
              color: '#6b7280',
              lineHeight: 1.6
            }}>
              <li><strong>Listing limit reduced to 5</strong> (from 10) - excess listings will be unpublished</li>
              <li><strong>Single market only</strong> - you will need to choose one market/pickup location</li>
              <li>Priority placement in search results</li>
              <li>Featured sections on homepage and browse pages</li>
              <li>Premium badge on your vendor profile</li>
              <li>Advanced analytics access</li>
            </ul>

            {/* No refund warning for subscriptions */}
            {hasActiveSubscription && (
              <div style={{
                padding: 12,
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                marginBottom: 16
              }}>
                <p style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#991b1b',
                  fontWeight: 500
                }}>
                  Important: No refunds will be issued for unused subscription time.
                  If you have an annual subscription, the remaining balance will not be refunded.
                </p>
              </div>
            )}

            {error && (
              <div style={{
                padding: 12,
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                marginBottom: 16
              }}>
                <p style={{ margin: 0, fontSize: 13, color: '#991b1b' }}>
                  {error}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDowngradeModal(false)}
                disabled={isProcessing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDowngrade}
                disabled={isProcessing}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isProcessing ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
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
