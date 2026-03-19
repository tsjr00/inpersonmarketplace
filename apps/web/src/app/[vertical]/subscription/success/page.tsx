'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { FullPageLoading } from '@/components/shared/Spinner'
import { getVendorTierLabel, TIER_LIMITS, normalizeTier } from '@/lib/vendor-limits'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

export default function SubscriptionSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const sessionId = searchParams.get('session_id')
  const locale = getClientLocale()

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
    return <FullPageLoading message={t('sub_success.confirming', locale)} />
  }

  const isFtVendor = subscriptionType === 'food_truck_vendor'
  const isVendor = subscriptionType === 'vendor' || isFtVendor
  const dashboardLink = isVendor
    ? `/${vertical}/vendor/dashboard`
    : `/${vertical}/browse`

  // FT tier-specific title
  const isFreeDowngrade = isVendor && tier === 'free'
  const title = isFreeDowngrade
    ? t('sub_success.free_plan', locale)
    : isVendor && tier
      ? t('sub_success.welcome_tier', locale, { tier: getVendorTierLabel(tier || 'free') })
      : t('sub_success.welcome_premium', locale)

  const subtitle = isFreeDowngrade
    ? t('sub_success.free_desc', locale)
    : isVendor && tier
      ? t('sub_success.ft_desc', locale, { tier: getVendorTierLabel(tier || 'free') })
      : isVendor
        ? t('sub_success.vendor_desc', locale)
        : t('sub_success.buyer_desc', locale, { market_box: term(vertical, 'market_box', locale) })

  // Vendor tier-specific benefits
  const normalizedTier = normalizeTier(tier)
  const tierLabel = getVendorTierLabel(normalizedTier)
  const vendorLimits = isVendor ? TIER_LIMITS[normalizedTier] : null

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
            {isFtVendor ? t('sub_success.your_benefits', locale, { tier: getVendorTierLabel(tier || 'free') }) : t('sub_success.your_premium', locale)}
          </h3>

          {isVendor && vendorLimits ? (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: colors.primaryDark, lineHeight: 1.8 }}>
              <li><strong>{t('sub_success.menu_items', locale, { count: String(vendorLimits.productListings) })}</strong></li>
              <li><strong>{t('sub_success.service_locations', locale, { count: String(vendorLimits.privatePickupLocations) })}</strong></li>
              <li><strong>{t('sub_success.chef_box', locale, { count: String(vendorLimits.marketBoxes) })}</strong></li>
              <li><strong>{t('sub_success.analytics_days', locale, { count: String(vendorLimits.analyticsDays) })}</strong>{vendorLimits.analyticsExport ? t('sub_success.with_export', locale) : ''}</li>
              {vendorLimits.priorityPlacement > 0 && (
                <li><strong>{vendorLimits.priorityPlacement === 2 ? t('sub_success.priority_1st', locale) : t('sub_success.priority_2nd', locale)}</strong> {t('sub_success.in_search', locale)}</li>
              )}
              {vendorLimits.notificationChannels.includes('email') && (
                <li><strong>{t('sub_success.email_notif', locale)}</strong> {t('sub_success.for_orders', locale)}</li>
              )}
              {vendorLimits.notificationChannels.includes('sms') && (
                <li><strong>{t('sub_success.sms_notif', locale)}</strong> {t('sub_success.for_orders', locale)}</li>
              )}
            </ul>
          ) : isVendor ? (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: colors.primaryDark, lineHeight: 1.8 }}>
              <li><strong>{t('sub_success.vendor_listings', locale, { count: '15' })}</strong> {t('sub_success.vendor_listings_was', locale, { count: '5' })}</li>
              <li><strong>{t('sub_success.vendor_markets', locale, { count: '4' })}</strong> {t('sub_success.vendor_listings_was', locale, { count: '1' })}</li>
              <li><strong>{t('sub_success.vendor_private', locale, { count: '5' })}</strong> {t('sub_success.vendor_listings_was', locale, { count: '1' })}</li>
              <li><strong>{t('sub_success.vendor_mbox', locale, { count: '6', market_box: term(vertical, 'market_box', locale) })}</strong> {t('sub_success.vendor_unlimited_subs', locale)}</li>
              <li><strong>{t('sub_success.vendor_priority', locale)}</strong> {t('sub_success.in_search', locale)}</li>
              <li><strong>{t('sub_success.vendor_badge', locale)}</strong></li>
              <li><strong>{t('sub_success.vendor_analytics', locale)}</strong></li>
            </ul>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: colors.primaryDark, lineHeight: 1.8 }}>
              <li><strong>{t('sub_success.buyer_mbox', locale, { market_box: term(vertical, 'market_box', locale) })}</strong> - {t('sub_success.buyer_mbox_desc', locale)}</li>
              <li><strong>{t('sub_success.buyer_early', locale)}</strong> {t('sub_success.buyer_early_desc', locale)}</li>
              <li><strong>{t('sub_success.buyer_support', locale)}</strong> {t('sub_success.buyer_support_desc', locale)}</li>
              <li><strong>{t('sub_success.buyer_badge', locale)}</strong></li>
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
          {isVendor ? t('sub_success.go_dashboard', locale) : t('upgrade.start_shopping', locale)}
        </Link>

        <p style={{ marginTop: 24, fontSize: 13, color: '#9ca3af' }}>
          {t('sub_success.manage_sub', locale)}{' '}
          <Link
            href={`/${vertical}/settings`}
            style={{ color: '#2563eb', textDecoration: 'none' }}
          >
            {t('upgrade.account_settings', locale)}
          </Link>
        </p>
      </div>
    </div>
  )
}
