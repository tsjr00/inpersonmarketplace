'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

type FeedbackCategory = 'suggest_market' | 'technical_problem' | 'feature_request' | 'payment_issue' | 'order_management' | 'listing_help' | 'general_feedback'

interface VendorFeedbackFormProps {
  vertical: string
  onClose: () => void
  onSuccess?: () => void
}

function getCategories(vertical: string): { value: FeedbackCategory; label: string; description: string; icon: string }[] {
  return [
    {
      value: 'suggest_market',
      label: `Suggest a ${term(vertical, 'market')}`,
      description: `Tell us about a ${term(vertical, 'traditional_market').toLowerCase()} where you sell that isn't on our platform yet`,
      icon: '🏪'
    },
    {
      value: 'technical_problem',
      label: 'Report a Technical Problem',
      description: 'Something not working right? Let us know so we can fix it',
      icon: '🔧'
    },
    {
      value: 'listing_help',
      label: `${term(vertical, 'listing')} Help`,
      description: `Need help with creating, editing, or managing your ${term(vertical, 'listings').toLowerCase()}`,
      icon: '📦'
    },
    {
      value: 'order_management',
      label: 'Order Management Issue',
      description: 'Problems with viewing, confirming, or fulfilling customer orders',
      icon: '📋'
    },
    {
      value: 'payment_issue',
      label: 'Payment or Stripe Issue',
      description: 'Questions or problems with payments, payouts, or Stripe setup',
      icon: '💳'
    },
    {
      value: 'feature_request',
      label: 'Request a Feature',
      description: 'Have an idea that would help you sell more or manage your business better?',
      icon: '💡'
    },
    {
      value: 'general_feedback',
      label: 'General Feedback',
      description: 'Anything else you\'d like to share with us',
      icon: '💬'
    }
  ]
}

export default function VendorFeedbackForm({ vertical, onClose, onSuccess }: VendorFeedbackFormProps) {
  const [category, setCategory] = useState<FeedbackCategory | ''>('')
  const [message, setMessage] = useState('')
  const [marketName, setMarketName] = useState('')
  const [marketLocation, setMarketLocation] = useState('')
  const [marketSchedule, setMarketSchedule] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/vendor/feedback', {
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

      if (res.ok) {
        setSuccess(true)
        onSuccess?.()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to submit feedback')
      }
    } catch (err) {
      console.error('Error submitting feedback:', err)
      setError('Failed to submit feedback. Please try again.')
    } finally {
      setSubmitting(false)
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
            Thank You!
          </h2>
          <p style={{ color: colors.textSecondary, marginBottom: spacing.lg }}>
            We appreciate you taking the time to share your feedback. Your input helps us build a better platform for all vendors.
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
            Close
          </button>
        </div>
      </div>
    )
  }

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
            Vendor Feedback
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
            backgroundColor: '#dbeafe',
            border: '1px solid #93c5fd',
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.lg
          }}>
            <h4 style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#1e40af' }}>
              How We Use Your Feedback
            </h4>
            <ul style={{ margin: 0, paddingLeft: spacing.lg, fontSize: typography.sizes.sm, color: '#1e3a8a', lineHeight: 1.6 }}>
              <li style={{ marginBottom: spacing.xs }}>
                <strong>Technical issues</strong> are prioritized and addressed quickly
              </li>
              <li style={{ marginBottom: spacing.xs }}>
                <strong>Feature requests</strong> help shape our product roadmap
              </li>
              <li style={{ marginBottom: spacing.xs }}>
                <strong>Market suggestions</strong> help us expand to serve more vendors
              </li>
              <li>
                We may not respond individually but we read every submission
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
              What can we help with? *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {getCategories(vertical).map(cat => (
                <label
                  key={cat.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: spacing.sm,
                    padding: spacing.md,
                    border: `2px solid ${category === cat.value ? colors.accent : colors.border}`,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    backgroundColor: category === cat.value ? '#fef3c7' : 'white',
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
              backgroundColor: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: radius.md,
              marginBottom: spacing.lg
            }}>
              <h4 style={{ margin: `0 0 ${spacing.md} 0`, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: '#166534' }}>
                {term(vertical, 'market')} Details
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                <div>
                  <label style={{ display: 'block', fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, marginBottom: spacing['3xs'] }}>
                    Market Name *
                  </label>
                  <input
                    type="text"
                    value={marketName}
                    onChange={(e) => setMarketName(e.target.value)}
                    placeholder={`e.g., Downtown Saturday ${term(vertical, 'traditional_market')}`}
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
                    Location *
                  </label>
                  <input
                    type="text"
                    value={marketLocation}
                    onChange={(e) => setMarketLocation(e.target.value)}
                    placeholder="e.g., 123 Main St, Austin, TX or City Park parking lot"
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
                    When does it operate? (optional)
                  </label>
                  <input
                    type="text"
                    value={marketSchedule}
                    onChange={(e) => setMarketSchedule(e.target.value)}
                    placeholder="e.g., Saturdays 8am-1pm, April through October"
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

          {/* Payment Issue Notice */}
          {category === 'payment_issue' && (
            <div style={{
              padding: spacing.md,
              backgroundColor: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: radius.md,
              marginBottom: spacing.lg
            }}>
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: '#92400e', lineHeight: 1.6 }}>
                <strong>Note:</strong> For urgent payment issues, you can also contact Stripe directly through your{' '}
                <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" style={{ color: '#92400e' }}>
                  Stripe Dashboard
                </a>
                . Include any error messages or transaction IDs in your feedback to help us investigate faster.
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
              {category === 'suggest_market' ? 'Additional details (optional)' : 'Describe your issue or suggestion *'}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                category === 'suggest_market'
                  ? 'Any other details about this market that might help us...'
                  : category === 'technical_problem'
                  ? 'Please describe the issue. What were you trying to do? What happened instead? Include any error messages you saw...'
                  : category === 'listing_help'
                  ? 'Describe what you need help with regarding your listings...'
                  : category === 'order_management'
                  ? 'Describe the issue with your orders. Include order numbers if relevant...'
                  : category === 'payment_issue'
                  ? 'Describe the payment issue. Include transaction IDs or error messages if available...'
                  : category === 'feature_request'
                  ? 'Describe the feature you\'d like to see and how it would help your business...'
                  : 'Share your thoughts with us...'
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={!category || submitting || (category !== 'suggest_market' && !message.trim())}
              style={{
                padding: `${spacing.sm} ${spacing.lg}`,
                backgroundColor: (!category || submitting) ? colors.textMuted : colors.accent,
                color: 'white',
                border: 'none',
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                cursor: (!category || submitting) ? 'not-allowed' : 'pointer',
                minHeight: 44
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
