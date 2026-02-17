'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { colors } from '@/lib/design-tokens'

export default function VendorUpgradePage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [alreadyPremium, setAlreadyPremium] = useState(false)

  // Check if already premium on mount
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
            backgroundColor: colors.primaryLight,
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
            Your vendor account already has premium status. You have access to all premium features.
          </p>
          <Link
            href={`/${vertical}/vendor/dashboard`}
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
            Back to Dashboard
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
          href={`/${vertical}/vendor/dashboard`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: '#666',
            textDecoration: 'none',
            fontSize: 14,
            marginBottom: 24
          }}
        >
          &larr; Back to Dashboard
        </Link>

        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: 40
        }}>
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
            Get more visibility and grow your business
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
            Premium Benefits
          </h2>

          {/* Featured Benefit - Market Box */}
          <div style={{
            padding: 20,
            background: colors.primaryLight,
            borderRadius: 12,
            border: `2px solid ${colors.primary}`,
            marginBottom: 24
          }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                width: 56,
                height: 56,
                backgroundColor: colors.primary,
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
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.primaryDark }}>
                    Market Box Subscriptions
                  </h3>
                  <span style={{
                    padding: '2px 8px',
                    backgroundColor: colors.primary,
                    color: 'white',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600
                  }}>
                    REVENUE BOOSTER
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: colors.primaryDark, lineHeight: 1.5 }}>
                  Create 6 Market Box offerings with 4 active simultaneously. <strong>Unlimited subscribers</strong> (Standard: 2 max). Guaranteed recurring revenue with 4-week prepaid subscriptions.
                </p>
              </div>
            </div>
          </div>

          {/* Comparison Table */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr 1fr',
            gap: 1,
            backgroundColor: '#e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
            marginBottom: 24,
            fontSize: 13
          }}>
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

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>Market Box Offerings</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>2</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>6</div>

            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#4b5563' }}>Max Subscribers/Box</div>
            <div style={{ padding: '8px 16px', backgroundColor: 'white', color: '#6b7280', textAlign: 'center' }}>2</div>
            <div style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#1e40af', textAlign: 'center', fontWeight: 600 }}>Unlimited</div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20
          }}>
            {/* Priority Placement */}
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
                🔝
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Priority Search Placement
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Listings appear higher in search results and category pages for more visibility.
                </p>
              </div>
            </div>

            {/* Featured Sections */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                backgroundColor: '#fce7f3',
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
                  Featured Everywhere
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Get highlighted on homepage, browse pages, and market pages.
                </p>
              </div>
            </div>

            {/* Premium Badge */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 44,
                height: 44,
                backgroundColor: '#e0e7ff',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0
              }}>
                🏆
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Premium Badge
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Badge on your profile and all listings builds trust with shoppers.
                </p>
              </div>
            </div>

            {/* Analytics */}
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
                📊
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Advanced Analytics
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Sales trends, top products, customer insights, and order analytics.
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
              <span style={{ fontSize: 36, fontWeight: 'bold', color: '#333' }}>$24.99</span>
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
              backgroundColor: colors.primary,
              color: 'white',
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600
            }}>
              SAVE 30%
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
              <span style={{ fontSize: 36, fontWeight: 'bold', color: '#333' }}>$208.15</span>
              <span style={{ color: '#666', fontSize: 16 }}>/year</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
              Just $17.35/month when billed annually.
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
            {isProcessing ? 'Processing...' : `Upgrade Now - ${selectedPlan === 'monthly' ? '$24.99/mo' : '$208.15/yr'}`}
          </button>
          <p style={{
            marginTop: 16,
            fontSize: 13,
            color: '#666'
          }}>
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>

        {/* FAQ or Additional Info */}
        <div style={{
          marginTop: 48,
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
                Market Boxes let you offer 4-week prepaid subscription bundles to buyers. You get guaranteed recurring revenue and can build customer loyalty with weekly pickups.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                What happens if I downgrade?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Excess listings/markets/boxes will be managed automatically. You&apos;ll need to select which ones to keep active within standard limits.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                Can I cancel anytime?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Yes! Cancel anytime - premium features remain active until billing period ends. No refunds for unused time.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
