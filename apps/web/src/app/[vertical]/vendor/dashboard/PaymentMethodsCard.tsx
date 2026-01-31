'use client'

import { useState } from 'react'
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
          backgroundColor: '#dcfce7',
          color: '#166534',
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
          {/* Stripe status */}
          <div style={{
            padding: spacing['2xs'],
            backgroundColor: stripeConnected ? '#dcfce7' : '#fef3c7',
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs
          }}>
            <span style={{ fontWeight: typography.weights.medium }}>
              {stripeConnected ? '✓ Card payments enabled' : '⚠ Connect Stripe for card payments'}
            </span>
            {!stripeConnected && (
              <span style={{ color: colors.textMuted, display: 'block', marginTop: spacing['3xs'] }}>
                Required for external payment methods
              </span>
            )}
          </div>

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {/* Method list */}
          <div style={{ fontSize: typography.sizes.sm }}>
            {stripeConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <span style={{ color: '#16a34a' }}>✓</span>
                <span>Card (Stripe)</span>
              </div>
            )}
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
            {!stripeConnected && !venmoUsername && !cashappCashtag && !paypalUsername && !acceptsCash && (
              <span style={{ color: colors.textMuted, fontStyle: 'italic' }}>No payment methods configured</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
