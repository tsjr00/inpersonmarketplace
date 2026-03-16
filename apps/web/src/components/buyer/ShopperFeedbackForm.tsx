'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

type FeedbackCategory = 'suggest_market' | 'technical_problem' | 'feature_request' | 'vendor_concern' | 'general_feedback'

interface ShopperFeedbackFormProps {
  vertical: string
  onClose: () => void
  onSuccess?: () => void
}

function getCategories(vertical: string, locale: string): { value: FeedbackCategory; label: string; description: string; icon: string }[] {
  return [
    {
      value: 'suggest_market',
      label: t('feedback.cat_suggest', locale, { market: term(vertical, 'market', locale) }),
      description: t('feedback.cat_suggest_desc', locale, { traditional_market: term(vertical, 'traditional_market', locale).toLowerCase() }),
      icon: vertical === 'food_trucks' ? '📍' : '🏪'
    },
    {
      value: 'technical_problem',
      label: t('feedback.cat_technical', locale),
      description: t('feedback.cat_technical_desc', locale),
      icon: '🔧'
    },
    {
      value: 'feature_request',
      label: t('feedback.cat_feature', locale),
      description: t('feedback.cat_feature_desc', locale),
      icon: '💡'
    },
    {
      value: 'vendor_concern',
      label: t('feedback.cat_vendor', locale, { vendor: term(vertical, 'vendor', locale) }),
      description: t('feedback.cat_vendor_desc', locale, { vendor: term(vertical, 'vendor', locale).toLowerCase() }),
      icon: '⚠️'
    },
    {
      value: 'general_feedback',
      label: t('feedback.cat_general', locale),
      description: t('feedback.cat_general_desc', locale),
      icon: '💬'
    }
  ]
}

export default function ShopperFeedbackForm({ vertical, onClose, onSuccess }: ShopperFeedbackFormProps) {
  const locale = getClientLocale()
  const categories = getCategories(vertical, locale)
  const [category, setCategory] = useState<FeedbackCategory | ''>('')
  const [message, setMessage] = useState('')
  const [marketName, setMarketName] = useState('')
  const [marketLocation, setMarketLocation] = useState('')
  const [marketSchedule, setMarketSchedule] = useState('')
  const [submitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Optimistically show success screen immediately
    setSuccess(true)
    onSuccess?.()

    // Fire API in background
    try {
      const res = await fetch('/api/buyer/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          category,
          message,
          market_name: category === 'suggest_market' ? marketName : null,
          market_location: category === 'suggest_market' ? marketLocation : null,
          market_schedule: category === 'suggest_market' ? marketSchedule : null
        })
      })

      if (!res.ok) {
        const data = await res.json()
        setSuccess(false)
        setError(data.error || t('feedback.failed', locale))
      }
    } catch (err) {
      console.error('Error submitting feedback:', err)
      setSuccess(false)
      setError(t('feedback.failed_retry', locale))
    }
  }

  if (success) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: radius.lg,
          padding: spacing.xl,
          maxWidth: 500,
          width: '100%',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: spacing.md }}>✅</div>
          <h2 style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.xl, fontWeight: typography.weights.bold }}>
            {t('feedback.thank_you', locale)}
          </h2>
          <p style={{ color: colors.textSecondary, marginBottom: spacing.lg }}>
            {t('feedback.thank_you_msg', locale)}
          </p>
          <button
            onClick={onClose}
            style={{
              padding: `${spacing.sm} ${spacing.xl}`,
              backgroundColor: colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: radius.md,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer',
              minHeight: 44
            }}
          >
            {t('feedback.close', locale)}
          </button>
        </div>
      </div>
    )
  }

  const marketNamePlaceholder = vertical === 'food_trucks'
    ? t('feedback.ph_market_name_ft', locale)
    : t('feedback.ph_market_name_fm', locale)

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
      zIndex: 1000,
      overflowY: 'auto'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: radius.lg,
        maxWidth: 600,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: shadows.xl
      }}>
        {/* Header */}
        <div style={{
          padding: spacing.lg,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          backgroundColor: 'white',
          zIndex: 1
        }}>
          <h2 style={{ margin: 0, fontSize: typography.sizes.xl, fontWeight: typography.weights.bold }}>
            {t('feedback.title', locale)}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: colors.textMuted,
              padding: spacing.xs,
              minHeight: 44,
              minWidth: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: spacing.lg }}>
          {/* Important Notices */}
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.lg
          }}>
            <h4 style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#92400e' }}>
              {t('feedback.please_note', locale)}
            </h4>
            <ul style={{ margin: 0, paddingLeft: spacing.lg, fontSize: typography.sizes.sm, color: '#78350f', lineHeight: 1.6 }}>
              <li style={{ marginBottom: spacing.xs }}>
                <strong>{t('feedback.refunds_label', locale)}</strong> {t('feedback.refunds_notice', locale)}
              </li>
              <li style={{ marginBottom: spacing.xs }}>
                <strong>{t('feedback.market_policies', locale, { market: term(vertical, 'market', locale) })}</strong>{' '}
                {vertical === 'food_trucks'
                  ? t('feedback.market_policies_desc_ft', locale)
                  : t('feedback.market_policies_desc_fm', locale)}
              </li>
              <li>
                <strong>{t('feedback.response_label', locale)}</strong> {t('feedback.response_notice', locale)}
              </li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: spacing.md,
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: radius.md,
              color: '#991b1b',
              marginBottom: spacing.md
            }}>
              {error}
            </div>
          )}

          {/* Category Selection */}
          <div style={{ marginBottom: spacing.lg }}>
            <label style={{
              display: 'block',
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              marginBottom: spacing.sm,
              color: colors.textPrimary
            }}>
              {t('feedback.what_share', locale)}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {categories.map(cat => (
                <label
                  key={cat.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: spacing.sm,
                    padding: spacing.md,
                    border: `2px solid ${category === cat.value ? colors.primary : colors.border}`,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    backgroundColor: category === cat.value ? colors.primaryLight : 'white',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.value}
                    checked={category === cat.value}
                    onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ fontSize: typography.sizes.lg }}>{cat.icon}</span>
                      <span style={{ fontWeight: typography.weights.medium, color: colors.textPrimary }}>{cat.label}</span>
                    </div>
                    <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                      {cat.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Market Suggestion Fields */}
          {category === 'suggest_market' && (
            <div style={{
              padding: spacing.md,
              backgroundColor: colors.primaryLight,
              border: `1px solid ${colors.primary}`,
              borderRadius: radius.md,
              marginBottom: spacing.lg
            }}>
              <h4 style={{ margin: `0 0 ${spacing.md} 0`, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.primaryDark }}>
                {t('feedback.market_details', locale, { market: term(vertical, 'market', locale) })}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                <div>
                  <label style={{ display: 'block', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, marginBottom: spacing['3xs'] }}>
                    {t('feedback.market_name', locale, { market: term(vertical, 'market', locale) })}
                  </label>
                  <input
                    type="text"
                    value={marketName}
                    onChange={(e) => setMarketName(e.target.value)}
                    placeholder={marketNamePlaceholder}
                    required
                    style={{
                      width: '100%',
                      padding: spacing.sm,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.md,
                      fontSize: typography.sizes.base,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, marginBottom: spacing['3xs'] }}>
                    {t('feedback.location', locale)}
                  </label>
                  <input
                    type="text"
                    value={marketLocation}
                    onChange={(e) => setMarketLocation(e.target.value)}
                    placeholder={t('feedback.ph_location', locale)}
                    required
                    style={{
                      width: '100%',
                      padding: spacing.sm,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.md,
                      fontSize: typography.sizes.base,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, marginBottom: spacing['3xs'] }}>
                    {t('feedback.when_operate', locale)}
                  </label>
                  <input
                    type="text"
                    value={marketSchedule}
                    onChange={(e) => setMarketSchedule(e.target.value)}
                    placeholder={t('feedback.ph_schedule', locale)}
                    style={{
                      width: '100%',
                      padding: spacing.sm,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.md,
                      fontSize: typography.sizes.base,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Vendor Concern Notice */}
          {category === 'vendor_concern' && (
            <div style={{
              padding: spacing.md,
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: radius.md,
              marginBottom: spacing.lg
            }}>
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: '#991b1b', lineHeight: 1.6 }}>
                <strong>{t('feedback.vendor_concern_label', locale)}</strong> {t('feedback.vendor_concern_reminder', locale)}
              </p>
            </div>
          )}

          {/* Message */}
          <div style={{ marginBottom: spacing.lg }}>
            <label style={{
              display: 'block',
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              marginBottom: spacing.sm,
              color: colors.textPrimary
            }}>
              {category === 'suggest_market' ? t('feedback.additional_details', locale) : t('feedback.your_message', locale)}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                category === 'suggest_market'
                  ? t('feedback.ph_suggest', locale)
                  : category === 'technical_problem'
                  ? t('feedback.ph_technical', locale)
                  : category === 'feature_request'
                  ? t('feedback.ph_feature', locale)
                  : category === 'vendor_concern'
                  ? t('feedback.ph_vendor', locale)
                  : t('feedback.ph_general', locale)
              }
              required={category !== 'suggest_market'}
              rows={5}
              style={{
                width: '100%',
                padding: spacing.sm,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: `${spacing.sm} ${spacing.lg}`,
                backgroundColor: colors.surfaceMuted,
                color: colors.textPrimary,
                border: 'none',
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.medium,
                cursor: 'pointer',
                minHeight: 44
              }}
            >
              {t('feedback.cancel', locale)}
            </button>
            <button
              type="submit"
              disabled={!category || submitting || (category !== 'suggest_market' && !message.trim())}
              style={{
                padding: `${spacing.sm} ${spacing.lg}`,
                backgroundColor: (!category || submitting) ? colors.textMuted : colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                cursor: (!category || submitting) ? 'not-allowed' : 'pointer',
                minHeight: 44
              }}
            >
              {submitting ? t('feedback.submitting', locale) : t('feedback.submit', locale)}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
