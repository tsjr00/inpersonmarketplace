'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function StripeCompletePage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const [checking, setChecking] = useState(true)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const response = await fetch('/api/vendor/stripe/status')
      const data = await response.json()

      if (data.connected && data.chargesEnabled && data.payoutsEnabled) {
        setSuccess(true)
      }
    } catch (err) {
      console.error('Status check failed:', err)
    } finally {
      setChecking(false)
    }
  }

  if (checking) {
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
          <p>Checking your Stripe status...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        border: '1px solid #ddd',
        padding: 40,
        maxWidth: 500,
        width: '100%',
        textAlign: 'center'
      }}>
        <div style={{
          width: 60,
          height: 60,
          backgroundColor: success ? '#d4edda' : '#fff3cd',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 30
        }}>
          {success ? '✓' : '⏳'}
        </div>

        <h1 style={{ marginBottom: 10 }}>
          {success ? 'Bank Account Connected!' : 'Setup In Progress'}
        </h1>

        <p style={{ color: '#666', marginBottom: 30 }}>
          {success
            ? 'You can now start selling and receiving payments'
            : 'Your account is being verified by Stripe'
          }
        </p>

        {success ? (
          <>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 25 }}>
              Your Stripe account is fully connected. You can now create bundles
              and start receiving orders from customers.
            </p>
            <button
              onClick={() => router.push(`/${vertical}/vendor/dashboard`)}
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
              Go to Dashboard
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 25 }}>
              Stripe is verifying your information. This usually takes a few minutes.
              You can check back later or proceed to your dashboard.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => router.push(`/${vertical}/vendor/dashboard`)}
                style={{
                  width: '100%',
                  padding: '15px 30px',
                  backgroundColor: '#333',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => {
                  setChecking(true)
                  checkStatus()
                }}
                style={{
                  width: '100%',
                  padding: '15px 30px',
                  backgroundColor: 'white',
                  color: '#333',
                  border: '2px solid #333',
                  borderRadius: 6,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Check Status Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
