'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { isBuyerPremiumEnabled } from '@/lib/vertical'
import { SUBSCRIPTION_PRICES } from '@/lib/stripe/config'

export default function BuyerUpgradePage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [alreadyPremium, setAlreadyPremium] = useState(false)

  const monthlyPrice = (SUBSCRIPTION_PRICES.buyer.monthly.amountCents / 100).toFixed(2)
  const annualPrice = (SUBSCRIPTION_PRICES.buyer.annual.amountCents / 100).toFixed(2)
  const monthlyEquivalent = (SUBSCRIPTION_PRICES.buyer.annual.amountCents / 12 / 100).toFixed(2)
  const annualSavings = ((SUBSCRIPTION_PRICES.buyer.monthly.amountCents * 12 - SUBSCRIPTION_PRICES.buyer.annual.amountCents) / 100).toFixed(2)

  // Redirect if premium is disabled for this vertical
  useEffect(() => {
    if (!isBuyerPremiumEnabled(vertical)) {
      router.replace(`/${vertical}/browse`)
    }
  }, [vertical, router])

  // Check if already premium on mount
  useEffect(() => {
    async function checkSubscription() {
      try {
        const res = await fetch('/api/buyer/subscription/status')
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
          type: 'buyer',
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

      // Redirect to Stripe Checkout
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

  // Show loading state
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    )
  }

  // Show already premium message
  if (alreadyPremium) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f9fafb',
        padding: '24px 16px'
      }}>
        <div style={{
          maxWidth: 600,
          margin: '0 auto',
          textAlign: 'center',
          paddingTop: 80
        }}>
          <div style={{
            width: 80,
            height: 80,
            backgroundColor: '#dcfce7',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 40
          }}>
            ✓
          </div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 'bold',
            color: '#111827',
            margin: '0 0 12px 0'
          }}>
            You&apos;re Already Premium!
          </h1>
          <p style={{
            fontSize: 16,
            color: '#6b7280',
            margin: '0 0 32px 0',
            lineHeight: 1.6
          }}>
            Your account already has premium membership. You have access to Market Box subscriptions and all premium features.
          </p>
          <Link
            href={`/${vertical}/browse`}
            style={{
              display: 'inline-block',
              padding: '14px 32px',
              backgroundColor: '#2563eb',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16
            }}
          >
            Start Shopping
          </Link>
          <p style={{
            marginTop: 24,
            fontSize: 13,
            color: '#9ca3af'
          }}>
            Manage your subscription in{' '}
            <Link
              href={`/${vertical}/settings`}
              style={{ color: '#2563eb', textDecoration: 'none' }}
            >
              account settings
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      padding: '24px 16px'
    }}>
      <div style={{
        maxWidth: 800,
        margin: '0 auto'
      }}>
        {/* Back Link */}
        <Link
          href={`/${vertical}/dashboard`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: '#666',
            textDecoration: 'none',
            fontSize: 14,
            marginBottom: 24,
            minHeight: 44,
            padding: '8px 0'
          }}
        >
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: 40
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
          <h1 style={{
            fontSize: 32,
            fontWeight: 'bold',
            color: '#333',
            margin: '0 0 12px 0'
          }}>
            Upgrade to Premium
          </h1>
          <p style={{
            fontSize: 18,
            color: '#666',
            margin: 0
          }}>
            Shop smarter with exclusive benefits
          </p>
        </div>

        {/* Benefits Grid */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 32,
          marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#333',
            margin: '0 0 24px 0'
          }}>
            Premium Member Benefits
          </h2>

          {/* Featured Benefit - Market Box */}
          <div style={{
            padding: 20,
            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
            borderRadius: 12,
            border: '2px solid #22c55e',
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                width: 56,
                height: 56,
                backgroundColor: '#22c55e',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                flexShrink: 0,
                color: 'white'
              }}>
                📦
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#166534' }}>
                    Market Box Subscriptions
                  </h3>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: '#22c55e',
                    color: 'white',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    EXCLUSIVE
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: '#166534', lineHeight: 1.5 }}>
                  Subscribe to 4-week prepaid bundles from your favorite vendors. Weekly pickups guaranteed with priority access to limited subscriber spots.
                </p>
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20
          }}>
            {/* Early Access */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                backgroundColor: '#dbeafe',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0
              }}>
                ⏰
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Early Access to Listings
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  See new products before standard shoppers. Get first pick on limited and seasonal items.
                </p>
              </div>
            </div>

            {/* Priority Support */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                backgroundColor: '#fef3c7',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0
              }}>
                💬
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Priority Support
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Faster response times with dedicated support for questions and order issues.
                </p>
              </div>
            </div>

            {/* Order Insights */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                backgroundColor: '#d1fae5',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0
              }}>
                📊
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Order Insights Dashboard
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Track spending trends, view purchase history analytics, and manage favorites.
                </p>
              </div>
            </div>

            {/* Premium Badge */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                backgroundColor: '#f3e8ff',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0
              }}>
                ⭐
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Premium Badge
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Display badge on your profile showing support for local vendors.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          marginBottom: 32
        }}>
          {/* Monthly Plan */}
          <div
            onClick={() => setSelectedPlan('monthly')}
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 24,
              cursor: 'pointer',
              border: selectedPlan === 'monthly' ? '2px solid #2563eb' : '2px solid #e5e7eb',
              boxShadow: selectedPlan === 'monthly' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>
                Monthly
              </h3>
              {selectedPlan === 'monthly' && (
                <div style={{
                  backgroundColor: '#2563eb',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600
                }}>
                  SELECTED
                </div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 'bold', color: '#333' }}>${monthlyPrice}</span>
              <span style={{ color: '#666', fontSize: 16 }}>/month</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
              Cancel anytime. No long-term commitment.
            </p>
          </div>

          {/* Annual Plan */}
          <div
            onClick={() => setSelectedPlan('annual')}
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 24,
              cursor: 'pointer',
              border: selectedPlan === 'annual' ? '2px solid #2563eb' : '2px solid #e5e7eb',
              boxShadow: selectedPlan === 'annual' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.1)',
              position: 'relative'
            }}
          >
            <div style={{
              position: 'absolute',
              top: -10,
              right: 16,
              backgroundColor: '#059669',
              color: 'white',
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600
            }}>
              SAVE 32%
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#333' }}>
                Annual
              </h3>
              {selectedPlan === 'annual' && (
                <div style={{
                  backgroundColor: '#2563eb',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600
                }}>
                  SELECTED
                </div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 'bold', color: '#333' }}>${annualPrice}</span>
              <span style={{ color: '#666', fontSize: 16 }}>/year</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
              Just ${monthlyEquivalent}/month when billed annually. Save ${annualSavings}!
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{ marginBottom: 16 }}>
            <ErrorDisplay error={error} verticalId={vertical} />
          </div>
        )}

        {/* Upgrade Button */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleUpgrade}
            disabled={isProcessing}
            style={{
              padding: '16px 48px',
              fontSize: 18,
              fontWeight: 600,
              backgroundColor: isProcessing ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              minHeight: 56
            }}
          >
            {isProcessing ? 'Processing...' : `Become a Premium Member - ${selectedPlan === 'monthly' ? `$${monthlyPrice}/mo` : `$${annualPrice}/yr`}`}
          </button>
          <p style={{
            marginTop: 16,
            fontSize: 13,
            color: '#666'
          }}>
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>

        {/* FAQ */}
        <div style={{
          marginTop: 32,
          padding: 24,
          backgroundColor: 'white',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: 16,
            fontWeight: 600,
            color: '#333'
          }}>
            Frequently Asked Questions
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What are Market Boxes?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Market Boxes are 4-week prepaid subscription bundles from vendors. You get guaranteed weekly pickups with curated items. Only premium shoppers can subscribe!
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                Can I cancel anytime?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Yes! Cancel your membership anytime. Benefits remain active until your billing period ends. Market Box subscriptions are separate commitments.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What is early access?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Premium members see new listings before standard shoppers, giving you first pick on limited or seasonal items.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
