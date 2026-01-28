'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function SubscriptionSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const sessionId = searchParams.get('session_id')

  const [loading, setLoading] = useState(true)
  const [subscriptionType, setSubscriptionType] = useState<'vendor' | 'buyer' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function verifySession() {
      if (!sessionId) {
        setError('No session ID provided')
        setLoading(false)
        return
      }

      try {
        // Verify the session with our API
        const res = await fetch(`/api/subscriptions/verify?session_id=${sessionId}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to verify subscription')
        }

        setSubscriptionType(data.type)
      } catch (err) {
        console.error('Verification error:', err)
        // Don't show error - the subscription was likely successful
        // The webhook will handle the tier upgrade
        setSubscriptionType(null)
      } finally {
        setLoading(false)
      }
    }

    verifySession()
  }, [sessionId])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48,
            height: 48,
            border: '4px solid #e5e7eb',
            borderTop: '4px solid #2563eb',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#6b7280' }}>Confirming your subscription...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  const isVendor = subscriptionType === 'vendor'
  const dashboardLink = isVendor
    ? `/${vertical}/vendor/dashboard`
    : `/${vertical}/browse`

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      padding: '24px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        maxWidth: 600,
        width: '100%',
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 40,
        textAlign: 'center',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Success Icon */}
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

        {/* Title */}
        <h1 style={{
          fontSize: 28,
          fontWeight: 'bold',
          color: '#111827',
          margin: '0 0 12px 0'
        }}>
          Welcome to Premium!
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 16,
          color: '#6b7280',
          margin: '0 0 32px 0',
          lineHeight: 1.6
        }}>
          Your premium subscription is now active.
          {isVendor
            ? ' You can now access all premium vendor features.'
            : ' You can now access Market Box subscriptions and other premium features.'}
        </p>

        {/* Premium Benefits */}
        <div style={{
          backgroundColor: '#f0fdf4',
          borderRadius: 12,
          padding: 24,
          marginBottom: 32,
          textAlign: 'left'
        }}>
          <h3 style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#166534',
            margin: '0 0 16px 0',
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}>
            Your Premium Benefits
          </h3>
          {isVendor ? (
            <ul style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 14,
              color: '#166534',
              lineHeight: 1.8
            }}>
              <li><strong>10 product listings</strong> (was 5)</li>
              <li><strong>4 traditional markets</strong> (was 1)</li>
              <li><strong>5 private pickup locations</strong> (was 1)</li>
              <li><strong>6 Market Box offerings</strong> with unlimited subscribers</li>
              <li><strong>Priority placement</strong> in search results</li>
              <li><strong>Featured</strong> on homepage and browse pages</li>
              <li><strong>Premium badge</strong> on your profile</li>
              <li><strong>Advanced analytics</strong></li>
            </ul>
          ) : (
            <ul style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 14,
              color: '#166534',
              lineHeight: 1.8
            }}>
              <li><strong>Market Box Subscriptions</strong> - exclusive access to vendor bundles</li>
              <li><strong>Early access</strong> to new and seasonal listings</li>
              <li><strong>Priority support</strong> for faster response times</li>
              <li><strong>Order insights</strong> and purchase analytics</li>
              <li><strong>Premium member badge</strong></li>
            </ul>
          )}
        </div>

        {/* CTA Button */}
        <Link
          href={dashboardLink}
          style={{
            display: 'inline-block',
            padding: '14px 32px',
            backgroundColor: '#2563eb',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            minHeight: 48
          }}
        >
          {isVendor ? 'Go to Vendor Dashboard' : 'Start Shopping'}
        </Link>

        {/* Manage Subscription Link */}
        <p style={{
          marginTop: 24,
          fontSize: 13,
          color: '#9ca3af'
        }}>
          You can manage your subscription in your{' '}
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
