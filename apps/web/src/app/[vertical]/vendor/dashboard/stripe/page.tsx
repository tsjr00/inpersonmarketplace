'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface StripeStatus {
  connected: boolean
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
}

export default function VendorStripePage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const [status, setStatus] = useState<StripeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboarding, setOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const response = await fetch('/api/vendor/stripe/status')
      const data = await response.json()
      setStatus(data)
    } catch {
      setError('Failed to check Stripe status')
    } finally {
      setLoading(false)
    }
  }

  async function startOnboarding() {
    setOnboarding(true)
    setError(null)

    try {
      const response = await fetch('/api/vendor/stripe/onboard', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to start onboarding')
      }

      const data = await response.json()
      window.location.href = data.url
    } catch {
      setError('Failed to start Stripe onboarding. Please try again.')
      setOnboarding(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #333',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 15px'
          }} />
          <p>Loading...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      padding: 40
    }}>
      {/* Header */}
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}
        >
          ← Back to Dashboard
        </Link>

        <h1 style={{ marginTop: 20, marginBottom: 10 }}>Payment Settings</h1>
        <p style={{ color: '#666', marginBottom: 30 }}>
          Connect your bank account to receive payments from customers
        </p>

        {error && (
          <div style={{
            padding: 15,
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: 8,
            color: '#721c24',
            marginBottom: 20
          }}>
            {error}
          </div>
        )}

        {/* Main Card */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #ddd',
          padding: 30
        }}>
          <h2 style={{ marginTop: 0, marginBottom: 10 }}>Stripe Connect</h2>
          <p style={{ color: '#666', marginBottom: 20 }}>
            Receive payments directly to your bank account via Stripe
          </p>

          {!status?.connected ? (
            <>
              <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
                To start selling and receiving payments, you need to connect your bank account
                through Stripe. This is a secure process that takes about 5 minutes.
              </p>

              <div style={{ marginBottom: 25 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                  What you&apos;ll need:
                </h3>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#666', fontSize: 14 }}>
                  <li>Business or personal information</li>
                  <li>Bank account details (routing &amp; account number)</li>
                  <li>Social Security Number or EIN</li>
                </ul>
              </div>

              <button
                onClick={startOnboarding}
                disabled={onboarding}
                style={{
                  width: '100%',
                  padding: '15px 30px',
                  backgroundColor: onboarding ? '#ccc' : '#333',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: onboarding ? 'not-allowed' : 'pointer'
                }}
              >
                {onboarding ? 'Redirecting to Stripe...' : 'Connect Bank Account'}
              </button>
            </>
          ) : (
            <>
              <div style={{
                padding: 15,
                backgroundColor: '#d4edda',
                border: '1px solid #c3e6cb',
                borderRadius: 8,
                color: '#155724',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}>
                <span style={{ fontSize: 20 }}>✓</span>
                <span>Your Stripe account is connected</span>
              </div>

              <div style={{ marginBottom: 20 }}>
                <StatusItem label="Charges Enabled" enabled={status.chargesEnabled} />
                <StatusItem label="Payouts Enabled" enabled={status.payoutsEnabled} />
                <StatusItem label="Details Submitted" enabled={status.detailsSubmitted} />
              </div>

              {!status.chargesEnabled || !status.payoutsEnabled ? (
                <>
                  <p style={{ color: '#666', marginBottom: 15, fontSize: 14 }}>
                    Your account setup is incomplete. Click below to continue.
                  </p>
                  <button
                    onClick={startOnboarding}
                    disabled={onboarding}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: 'white',
                      color: '#333',
                      border: '2px solid #333',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: onboarding ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {onboarding ? 'Redirecting...' : 'Complete Setup'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => router.push(`/${vertical}/vendor/dashboard/orders`)}
                  style={{
                    width: '100%',
                    padding: '15px 30px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  View Orders
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusItem({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid #eee'
    }}>
      <span>{label}</span>
      {enabled ? (
        <span style={{ color: '#28a745', fontSize: 20 }}>✓</span>
      ) : (
        <span style={{ color: '#ccc', fontSize: 20 }}>○</span>
      )}
    </div>
  )
}
