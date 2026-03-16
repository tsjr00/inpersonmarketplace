'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isBuyerPremiumEnabled, term } from '@/lib/vertical'
import { SUBSCRIPTION_PRICES } from '@/lib/stripe/config'
import { colors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

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
  const locale = getClientLocale()
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
            {t('buyer_tier.upgrade_title', locale)}
          </h3>
        </div>

        <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#1e3a8a' }}>
          {t('buyer_tier.upgrade_desc', locale, { monthly: monthlyPrice, annual: annualPrice })}
        </p>

        <ul style={{
          margin: '0 0 16px 0',
          paddingLeft: 20,
          fontSize: 13,
          color: '#1e3a8a',
          lineHeight: 1.6
        }}>
          <li><strong>{t('buyer_tier.mbox_sub', locale, { market_box: term(vertical, 'market_box') })}</strong> - {t('buyer_tier.mbox_desc', locale)}</li>
          <li>{t('buyer_tier.early_access', locale)}</li>
          <li>{t('buyer_tier.priority_support', locale)}</li>
          <li>{t('buyer_tier.insights', locale)}</li>
          <li>{t('buyer_tier.badge', locale)}</li>
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
          {t('buyer_tier.upgrade_now', locale)}
        </Link>
      </div>
    )
  }

  // Premium tier - show current benefits and downgrade option
  return (
    <>
      <div style={{
        padding: 20,
        backgroundColor: colors.primaryLight,
        borderRadius: 8,
        border: `1px solid ${colors.primary}`
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
            color: colors.primaryDark
          }}>
            {t('buyer_tier.premium_title', locale)}
          </h3>
        </div>

        <p style={{ margin: '0 0 8px 0', fontSize: 14, color: colors.primaryDark }}>
          {t('buyer_tier.premium_desc', locale)}
        </p>

        <ul style={{
          margin: '0 0 16px 0',
          paddingLeft: 20,
          fontSize: 13,
          color: colors.primaryDark,
          lineHeight: 1.6
        }}>
          <li><strong>{t('buyer_tier.mbox_sub', locale, { market_box: term(vertical, 'market_box') })}</strong> - {t('buyer_tier.mbox_desc', locale)}</li>
          <li><strong>{t('buyer_tier.early_benefit', locale)}</strong> {t('buyer_tier.early_detail', locale)}</li>
          <li><strong>{t('buyer_tier.support_benefit', locale)}</strong> {t('buyer_tier.support_detail', locale)}</li>
          <li><strong>{t('buyer_tier.insights_benefit', locale)}</strong> {t('buyer_tier.insights_detail', locale)}</li>
          <li><strong>{t('buyer_tier.badge_benefit', locale)}</strong> {t('buyer_tier.badge_detail', locale)}</li>
        </ul>

        {tierExpiresAt && (
          <p style={{
            margin: '0 0 16px 0',
            fontSize: 13,
            color: colors.primaryDark
          }}>
            {t('buyer_tier.renews_on', locale, { date: new Date(tierExpiresAt).toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US') })}
          </p>
        )}

        <button
          onClick={() => setShowDowngradeModal(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: colors.primaryDark,
            border: `1px solid ${colors.primaryDark}`,
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          {t('buyer_tier.cancel_btn', locale)}
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
              {t('buyer_tier.cancel_title', locale)}
            </h3>

            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4b5563' }}>
              {t('buyer_tier.cancel_desc', locale)}
            </p>

            <ul style={{
              margin: '0 0 16px 0',
              paddingLeft: 20,
              fontSize: 14,
              color: '#6b7280',
              lineHeight: 1.6
            }}>
              <li><strong>{t('buyer_tier.mbox_sub', locale, { market_box: term(vertical, 'market_box') })}</strong> - {t('buyer_tier.cancel_mbox_detail', locale)}</li>
              <li>{t('buyer_tier.cancel_early', locale)}</li>
              <li>{t('buyer_tier.cancel_seasonal', locale)}</li>
              <li>{t('buyer_tier.cancel_support', locale)}</li>
              <li>{t('buyer_tier.cancel_insights', locale)}</li>
              <li>{t('buyer_tier.cancel_favorites', locale)}</li>
              <li>{t('buyer_tier.cancel_badge', locale)}</li>
              <li>{t('buyer_tier.cancel_priority', locale)}</li>
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
                  {t('buyer_tier.billing_notice', locale)}
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
                {t('buyer_tier.keep', locale)}
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
                {isProcessing ? t('buyer_tier.processing', locale) : t('buyer_tier.cancel_btn', locale)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
