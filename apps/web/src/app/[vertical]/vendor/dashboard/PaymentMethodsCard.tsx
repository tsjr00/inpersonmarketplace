'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface PaymentMethodsCardProps {
  vendorId: string
  vertical: string
  stripeConnected: boolean
  initialValues: {
    venmo_username: string | null
    cashapp_cashtag: string | null
    paypal_username: string | null
    accepts_cash_at_pickup: boolean
  }
}

export default function PaymentMethodsCard({
  vendorId,
  vertical,
  stripeConnected,
  initialValues
}: PaymentMethodsCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [venmoUsername, setVenmoUsername] = useState(initialValues.venmo_username || '')
  const [cashappCashtag, setCashappCashtag] = useState(initialValues.cashapp_cashtag || '')
  const [paypalUsername, setPaypalUsername] = useState(initialValues.paypal_username || '')
  const [acceptsCash, setAcceptsCash] = useState(initialValues.accepts_cash_at_pickup)

  // Fee balance state (collapsed from FeeBalanceCard)
  const [feeBalance, setFeeBalance] = useState<{ balance_cents: number; requires_payment: boolean } | null>(null)
  const [feePaying, setFeePaying] = useState(false)

  useEffect(() => {
    fetch(`/api/vendor/fees?vendor_id=${vendorId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && data.balance_cents > 0) setFeeBalance(data) })
      .catch(() => {})
  }, [vendorId])

  const handlePayFees = async () => {
    setFeePaying(true)
    try {
      const res = await fetch('/api/vendor/fees/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId, vertical_id: vertical })
      })
      const result = await res.json()
      if (res.ok && result.checkout_url) {
        window.location.href = result.checkout_url
      } else {
        setError(result.error || 'Failed to create payment')
        setFeePaying(false)
      }
    } catch {
      setError('Payment failed')
      setFeePaying(false)
    }
  }

  const hasExternalMethods = venmoUsername || cashappCashtag || paypalUsername || acceptsCash

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/vendor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          venmo_username: venmoUsername || null,
          cashapp_cashtag: cashappCashtag || null,
          paypal_username: paypalUsername || null,
          accepts_cash_at_pickup: acceptsCash
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setVenmoUsername(initialValues.venmo_username || '')
    setCashappCashtag(initialValues.cashapp_cashtag || '')
    setPaypalUsername(initialValues.paypal_username || '')
    setAcceptsCash(initialValues.accepts_cash_at_pickup)
    setError(null)
    setIsEditing(false)
  }

  // Count enabled methods
  const methodCount = [
    stripeConnected,
    !!venmoUsername,
    !!cashappCashtag,
    !!paypalUsername,
    acceptsCash
  ].filter(Boolean).length

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      boxShadow: shadows.sm
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.xs
      }}>
        <div>
          <h3 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold
          }}>
            Payment Methods
          </h3>
          <p style={{
            margin: `${spacing['3xs']} 0 0 0`,
            fontSize: typography.sizes.xs,
            color: colors.textMuted
          }}>
            {methodCount} method{methodCount !== 1 ? 's' : ''} enabled
          </p>
        </div>

        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: colors.surfaceMuted,
              color: colors.textSecondary,
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              cursor: 'pointer'
            }}
          >
            Edit
          </button>
        )}
      </div>

      {success && (
        <div style={{
          padding: spacing['2xs'],
          backgroundColor: colors.primaryLight,
          color: colors.primaryDark,
          borderRadius: radius.sm,
          fontSize: typography.sizes.xs,
          marginBottom: spacing.xs
        }}>
          Payment methods saved
        </div>
      )}

      {error && (
        <div style={{
          padding: spacing['2xs'],
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: radius.sm,
          fontSize: typography.sizes.xs,
          marginBottom: spacing.xs
        }}>
          {error}
        </div>
      )}

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {/* Stripe status - clickable link when not connected */}
          {stripeConnected ? (
            <div style={{
              padding: spacing['2xs'],
              backgroundColor: colors.primaryLight,
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs
            }}>
              <span style={{ fontWeight: typography.weights.medium }}>
                ✓ Card payments enabled
              </span>
            </div>
          ) : (
            <Link
              href={`/${vertical}/vendor/dashboard/stripe`}
              style={{
                display: 'block',
                padding: spacing['2xs'],
                backgroundColor: '#fef3c7',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                textDecoration: 'none',
                color: 'inherit'
              }}
            >
              <span style={{ fontWeight: typography.weights.medium, color: '#92400e' }}>
                ⚠ Connect Stripe for card payments →
              </span>
              <span style={{ color: '#92400e', display: 'block', marginTop: spacing['3xs'] }}>
                Required for external payment methods. Click to set up.
              </span>
            </Link>
          )}

          {/* Venmo */}
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>
              Venmo Username
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ color: colors.textMuted }}>@</span>
              <input
                type="text"
                value={venmoUsername}
                onChange={(e) => setVenmoUsername(e.target.value)}
                placeholder="yourname"
                disabled={!stripeConnected}
                style={{
                  flex: 1,
                  padding: spacing['2xs'],
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  backgroundColor: stripeConnected ? 'white' : colors.surfaceMuted
                }}
              />
            </div>
          </div>

          {/* Cash App */}
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>
              Cash App Tag
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ color: colors.textMuted }}>$</span>
              <input
                type="text"
                value={cashappCashtag}
                onChange={(e) => setCashappCashtag(e.target.value)}
                placeholder="yourtag"
                disabled={!stripeConnected}
                style={{
                  flex: 1,
                  padding: spacing['2xs'],
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  backgroundColor: stripeConnected ? 'white' : colors.surfaceMuted
                }}
              />
            </div>
          </div>

          {/* PayPal */}
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>
              PayPal.me Username
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>paypal.me/</span>
              <input
                type="text"
                value={paypalUsername}
                onChange={(e) => setPaypalUsername(e.target.value)}
                placeholder="yourname"
                disabled={!stripeConnected}
                style={{
                  flex: 1,
                  padding: spacing['2xs'],
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  backgroundColor: stripeConnected ? 'white' : colors.surfaceMuted
                }}
              />
            </div>
          </div>

          {/* Cash at Pickup */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing['2xs'],
            fontSize: typography.sizes.sm,
            cursor: stripeConnected ? 'pointer' : 'not-allowed',
            opacity: stripeConnected ? 1 : 0.5
          }}>
            <input
              type="checkbox"
              checked={acceptsCash}
              onChange={(e) => setAcceptsCash(e.target.checked)}
              disabled={!stripeConnected}
            />
            Accept cash at pickup
          </label>

          {/* Fee notice */}
          {hasExternalMethods && (
            <p style={{
              fontSize: typography.sizes.xs,
              color: colors.textMuted,
              margin: `${spacing['2xs']} 0 0 0`,
              padding: spacing['2xs'],
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.sm
            }}>
              External payments: 6.5% + $0.15 buyer fee, 3.5% seller fee (auto-deducted from card sales)
            </p>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing['2xs'] }}>
            <button
              onClick={handleCancel}
              disabled={saving}
              style={{
                flex: 1,
                padding: spacing['2xs'],
                backgroundColor: colors.surfaceMuted,
                color: colors.textSecondary,
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                padding: spacing['2xs'],
                backgroundColor: colors.primary,
                color: colors.textInverse,
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {/* Stripe Section - Primary */}
          <div style={{
            padding: spacing.xs,
            backgroundColor: stripeConnected ? '#dcfce7' : '#fef3c7',
            borderRadius: radius.sm,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: spacing.sm,
            flexWrap: 'nowrap'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                {stripeConnected ? '💳 Card payments enabled' : 'Card payments not set up'}
              </div>
              {!stripeConnected && (
                <div style={{ fontSize: typography.sizes.xs, color: '#92400e' }}>
                  Required to receive payments
                </div>
              )}
            </div>
            <Link
              href={`/${vertical}/vendor/dashboard/stripe`}
              style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: stripeConnected ? colors.surfaceMuted : colors.primary,
                color: stripeConnected ? colors.textSecondary : colors.textInverse,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                textDecoration: 'none',
                fontWeight: typography.weights.medium,
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              {stripeConnected ? 'Manage' : 'Set Up'}
            </Link>
          </div>

          {/* Other payment methods list */}
          <div style={{ fontSize: typography.sizes.sm }}>
            {venmoUsername && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <span style={{ color: '#16a34a' }}>✓</span>
                <span>Venmo (@{venmoUsername})</span>
              </div>
            )}
            {cashappCashtag && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <span style={{ color: '#16a34a' }}>✓</span>
                <span>Cash App (${cashappCashtag})</span>
              </div>
            )}
            {paypalUsername && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <span style={{ color: '#16a34a' }}>✓</span>
                <span>PayPal ({paypalUsername})</span>
              </div>
            )}
            {acceptsCash && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <span style={{ color: '#16a34a' }}>✓</span>
                <span>Cash at Pickup</span>
              </div>
            )}
            {!venmoUsername && !cashappCashtag && !paypalUsername && !acceptsCash && (
              <span style={{ color: colors.textMuted, fontStyle: 'italic', fontSize: typography.sizes.xs }}>
                No additional payment methods
              </span>
            )}
          </div>

          {/* Fee Balance (only when balance > 0) */}
          {feeBalance && (
            <div style={{
              marginTop: spacing.xs,
              padding: spacing.xs,
              backgroundColor: feeBalance.requires_payment ? '#fef3c7' : colors.surfaceMuted,
              borderRadius: radius.sm,
              border: feeBalance.requires_payment ? '1px solid #f59e0b' : 'none'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.medium,
                    color: feeBalance.requires_payment ? '#92400e' : colors.textSecondary
                  }}>
                    {feeBalance.requires_payment ? 'Platform fees due' : 'Platform fees'}
                  </div>
                  <div style={{
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.bold,
                    color: feeBalance.requires_payment ? '#92400e' : colors.textPrimary
                  }}>
                    ${(feeBalance.balance_cents / 100).toFixed(2)}
                  </div>
                </div>
                <button
                  onClick={handlePayFees}
                  disabled={feePaying}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    backgroundColor: feeBalance.requires_payment ? '#f59e0b' : colors.surfaceMuted,
                    color: feeBalance.requires_payment ? 'white' : colors.textSecondary,
                    border: feeBalance.requires_payment ? 'none' : `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    cursor: feePaying ? 'wait' : 'pointer',
                    opacity: feePaying ? 0.7 : 1
                  }}
                >
                  {feePaying ? '...' : 'Pay Now'}
                </button>
              </div>
              {!feeBalance.requires_payment && (
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                  Auto-deducted from your next card sale
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
