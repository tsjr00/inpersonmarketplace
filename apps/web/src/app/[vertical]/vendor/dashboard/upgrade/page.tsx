'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VendorUpgradePage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')
  const [isProcessing, setIsProcessing] = useState(false)

  const handleUpgrade = async () => {
    setIsProcessing(true)

    // For now, show a message that Stripe integration is coming
    // In the future, this will redirect to Stripe Checkout
    alert('Stripe payment integration coming soon! For now, contact support to upgrade your account.')
    setIsProcessing(false)
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

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 20
          }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                backgroundColor: '#dbeafe',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0
              }}>
                *
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Priority Placement
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                  Your listings appear higher in search results
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                backgroundColor: '#d1fae5',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0
              }}>
                +
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Featured Sections
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                  Get featured on the homepage and category pages
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                backgroundColor: '#fef3c7',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0
              }}>
                $
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Premium Badge
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                  Stand out with a premium badge on your profile
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                backgroundColor: '#fce7f3',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0
              }}>
                %
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600, color: '#333' }}>
                  Analytics Access
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                  Detailed insights on views, sales, and trends
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
              backgroundColor: '#059669',
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
                Can I cancel anytime?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Yes! You can cancel your subscription at any time. Your premium features will remain active until the end of your billing period.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                How soon will I see results?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                Premium features are activated immediately. You&apos;ll see improved placement in search results right away.
              </p>
            </div>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: '#333' }}>
                Is there a free trial?
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: '#666' }}>
                We don&apos;t offer a free trial, but you can cancel within the first 30 days for a full refund if you&apos;re not satisfied.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
