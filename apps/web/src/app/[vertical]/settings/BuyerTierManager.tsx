'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isBuyerPremiumEnabled } from '@/lib/vertical'
import { SUBSCRIPTION_PRICES } from '@/lib/stripe/config'

interface BuyerTierManagerProps {
  vertical: string
  currentTier: string
  tierExpiresAt?: string | null
  stripeSubscriptionId?: string | null
  primaryColor: string
}

export default function BuyerTierManager({
  vertical,
  currentTier,
  tierExpiresAt,
  stripeSubscriptionId,
  primaryColor
}: BuyerTierManagerProps) {
  const router = useRouter()
  const [showDowngradeModal, setShowDowngradeModal] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')

  const isPremium = currentTier === 'premium'
  const hasActiveSubscription = !!stripeSubscriptionId

  // Don't render anything if buyer premium is disabled for this vertical
  if (!isBuyerPremiumEnabled(vertical)) {
    return null
  }

  const monthlyPrice = (SUBSCRIPTION_PRICES.buyer.monthly.amountCents / 100).toFixed(2)
  const annualPrice = (SUBSCRIPTION_PRICES.buyer.annual.amountCents / 100).toFixed(2)

  const handleDowngrade = async () => {
    setIsProcessing(true)
    setError('')

    try {
      const res = await fetch('/api/buyer/tier/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
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
    // Free tier - show upgrade option
    return (
      <div style={{
        padding: 20,
        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        borderRadius: 8,
        border: '1px solid #93c5fd'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        }}>
          <span style={{ fontSize: 20 }}>⭐</span>
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: '#1e40af'
          }}>
            Upgrade to Premium
          </h3>
        </div>

        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#1e3a8a' }}>
          Get early access to new listings, priority support, and more for just{' '}
          <strong>${monthlyPrice}/month</strong> or <strong>${annualPrice}/year</strong>.
        </p>

        <ul style={{
          margin: '0 0 16px 0',
          paddingLeft: 20,
          fontSize: 13,
          color: '#1e3a8a',
          lineHeight: 1.6
        }}>
          <li><strong>Market Box Subscriptions</strong> - exclusive access to vendor bundles</li>
          <li>Early access to new & seasonal listings</li>
          <li>Priority customer support</li>
          <li>Order insights dashboard</li>
          <li>Premium member badge</li>
        </ul>

        <Link
          href={`/${vertical}/buyer/upgrade`}
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#2563eb',
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

  // Premium tier - show current benefits and downgrade option
  return (
    <>
      <div style={{
        padding: 20,
        backgroundColor: '#f0fdf4',
        borderRadius: 8,
        border: '1px solid #86efac'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        }}>
          <span style={{ fontSize: 20 }}>⭐</span>
          <h3 style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: '#166534'
          }}>
            Premium Member
          </h3>
        </div>

        <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#166534' }}>
          You&apos;re enjoying all premium benefits:
        </p>

        <ul style={{
          margin: '0 0 16px 0',
          paddingLeft: 20,
          fontSize: 13,
          color: '#166534',
          lineHeight: 1.6
        }}>
          <li><strong>Market Box Subscriptions</strong> - exclusive access to vendor bundles</li>
          <li><strong>Early access</strong> to new and seasonal listings</li>
          <li><strong>Priority support</strong> for faster response times</li>
          <li><strong>Order insights</strong> dashboard and purchase analytics</li>
          <li><strong>Premium badge</strong> on your profile</li>
        </ul>

        {tierExpiresAt && (
          <p style={{
            margin: '0 0 16px 0',
            fontSize: 13,
            color: '#166534'
          }}>
            Your membership renews on{' '}
            <strong>{new Date(tierExpiresAt).toLocaleDateString()}</strong>
          </p>
        )}

        <button
          onClick={() => setShowDowngradeModal(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: '#166534',
            border: '1px solid #166534',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          Cancel Membership
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
              Cancel Premium Membership?
            </h3>

            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4b5563' }}>
              Are you sure you want to cancel your Premium membership?
              You will lose the following benefits:
            </p>

            <ul style={{
              margin: '0 0 16px 0',
              paddingLeft: 20,
              fontSize: 14,
              color: '#6b7280',
              lineHeight: 1.6
            }}>
              <li><strong>Market Box Subscriptions</strong> - no longer able to subscribe</li>
              <li>Early access to new listings</li>
              <li>Early access to seasonal products</li>
              <li>Priority customer support</li>
              <li>Order insights and analytics</li>
              <li>Favorites management</li>
              <li>Premium shopper badge</li>
              <li>Priority access to limited items</li>
            </ul>

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
                  Your benefits will remain active until the end of your current billing period.
                  No refunds will be issued for unused subscription time.
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
                Keep Premium
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
                {isProcessing ? 'Processing...' : 'Cancel Membership'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
