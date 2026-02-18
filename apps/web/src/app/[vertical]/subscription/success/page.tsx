'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { getFtTierLabel, FT_TIER_LIMITS, type FoodTruckTier } from '@/lib/vendor-limits'

export default function SubscriptionSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const sessionId = searchParams.get('session_id')

  const [loading, setLoading] = useState(true)
  const [subscriptionType, setSubscriptionType] = useState<'vendor' | 'buyer' | 'food_truck_vendor' | null>(null)
  const [tier, setTier] = useState<string | null>(null)

  useEffect(() => {
    async function verifySession() {
      if (!sessionId) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/subscriptions/verify?session_id=${sessionId}`)
        const data = await res.json()

        if (res.ok) {
          setSubscriptionType(data.type)
          setTier(data.tier)
        }
      } catch (err) {
        console.error('Verification error:', err)
        // Don't show error - the webhook will handle the tier upgrade
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

  const isFtVendor = subscriptionType === 'food_truck_vendor'
  const isVendor = subscriptionType === 'vendor' || isFtVendor
  const dashboardLink = isVendor
    ? `/${vertical}/vendor/dashboard`
    : `/${vertical}/browse`

  // FT tier-specific title
  const isFreeDowngrade = isFtVendor && tier === 'free'
  const title = isFreeDowngrade
    ? 'You\'re on the Free Plan'
    : isFtVendor && tier
      ? `Welcome to ${getFtTierLabel(tier)}!`
      : 'Welcome to Premium!'

  const subtitle = isFreeDowngrade
    ? 'Your plan has been changed to Free. You can upgrade anytime to unlock more features.'
    : isFtVendor && tier
      ? `Your ${getFtTierLabel(tier)} plan is now active. You can start using all your ${getFtTierLabel(tier)} features right away.`
      : isVendor
        ? 'Your premium subscription is now active. You can now access all premium vendor features.'
        : 'Your premium subscription is now active. You can now access Market Box subscriptions and other premium features.'

  // FT tier-specific benefits
  const ftTierKey = (tier || 'free') as FoodTruckTier
  const ftLimits = isFtVendor ? FT_TIER_LIMITS[ftTierKey] || FT_TIER_LIMITS.free : null

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
          {title}
        </h1>

        <p style={{
          fontSize: 16,
          color: '#6b7280',
          margin: '0 0 32px 0',
          lineHeight: 1.6
        }}>
          {subtitle}
        </p>

        {/* Benefits */}
        <div style={{
          backgroundColor: colors.primaryLight,
          borderRadius: 12,
          padding: 24,
          marginBottom: 32,
          textAlign: 'left'
        }}>
          <h3 style={{
            fontSize: 14,
            fontWeight: 600,
            color: colors.primaryDark,
            margin: '0 0 16px 0',
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}>
            {isFtVendor ? `Your ${getFtTierLabel(tier || 'free')} Benefits` : 'Your Premium Benefits'}
          </h3>

          {isFtVendor && ftLimits ? (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: colors.primaryDark, lineHeight: 1.8 }}>
              <li><strong>{ftLimits.productListings} menu items</strong></li>
              <li><strong>{ftLimits.privatePickupLocations} service locations</strong></li>
              <li><strong>{ftLimits.totalMarketBoxes} Chef Box offerings</strong></li>
              <li><strong>{ftLimits.analyticsDays}-day analytics</strong>{ftLimits.analyticsExport ? ' with export' : ''}</li>
              {ftLimits.priorityPlacement > 0 && (
                <li><strong>{ftLimits.priorityPlacement === 2 ? '1st' : '2nd'} priority placement</strong> in search results</li>
              )}
              {ftLimits.notificationChannels.includes('email') && (
                <li><strong>Email notifications</strong> for orders</li>
              )}
              {ftLimits.notificationChannels.includes('sms') && (
                <li><strong>SMS notifications</strong> for orders</li>
              )}
            </ul>
          ) : isVendor ? (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: colors.primaryDark, lineHeight: 1.8 }}>
              <li><strong>15 product listings</strong> (was 5)</li>
              <li><strong>4 traditional markets</strong> (was 1)</li>
              <li><strong>5 private pickup locations</strong> (was 1)</li>
              <li><strong>6 Market Box offerings</strong> with unlimited subscribers</li>
              <li><strong>Priority placement</strong> in search results</li>
              <li><strong>Premium badge</strong> on your profile</li>
              <li><strong>Advanced analytics</strong></li>
            </ul>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: colors.primaryDark, lineHeight: 1.8 }}>
              <li><strong>Market Box Subscriptions</strong> - exclusive access to vendor bundles</li>
              <li><strong>Early access</strong> to new and seasonal listings</li>
              <li><strong>Priority support</strong> for faster response times</li>
              <li><strong>Premium member badge</strong></li>
            </ul>
          )}
        </div>

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
          {isVendor ? 'Go to Dashboard' : 'Start Shopping'}
        </Link>

        <p style={{ marginTop: 24, fontSize: 13, color: '#9ca3af' }}>
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
