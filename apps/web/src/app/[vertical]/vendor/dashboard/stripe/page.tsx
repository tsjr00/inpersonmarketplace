'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { colors, statusColors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
        backgroundColor: colors.surfaceBase
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: `4px solid ${colors.border}`,
            borderTop: `4px solid ${colors.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 15px'
          }} />
          <p style={{ color: colors.textMuted }}>Loading...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: spacing.xl
    }}>
      <div style={{ maxWidth: containers.sm, margin: '0 auto' }}>
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
        >
          ← Vendor Dashboard
        </Link>

        <h1 style={{
          marginTop: spacing.sm,
          marginBottom: spacing['2xs'],
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold,
          color: colors.primary
        }}>
          Payment Settings
        </h1>
        <p style={{ color: colors.textMuted, marginBottom: spacing.md, fontSize: typography.sizes.base }}>
          Connect your bank account to receive payments from customers
        </p>

        {error && (
          <div style={{
            padding: spacing.sm,
            backgroundColor: '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: radius.md,
            color: '#ef4444',
            marginBottom: spacing.md,
            fontSize: typography.sizes.sm
          }}>
            {error}
          </div>
        )}

        {/* Main Card */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          padding: spacing.lg,
          boxShadow: shadows.sm
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing['2xs'],
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary
          }}>
            Stripe Connect
          </h2>
          <p style={{ color: colors.textMuted, marginBottom: spacing.md, fontSize: typography.sizes.base }}>
            Receive payments directly to your bank account via Stripe
          </p>

          {!status?.connected ? (
            <>
              <p style={{ color: colors.textSecondary, marginBottom: spacing.md, fontSize: typography.sizes.sm }}>
                To start selling and receiving payments, you need to connect your bank account
                through Stripe. This is a secure process that takes about 5 minutes.
              </p>

              <div style={{ marginBottom: spacing.md }}>
                <h3 style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  marginBottom: spacing.xs,
                  color: colors.textPrimary
                }}>
                  What you&apos;ll need:
                </h3>
                <ul style={{ margin: 0, paddingLeft: 20, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
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
                  padding: `${spacing.sm} ${spacing.lg}`,
                  backgroundColor: onboarding ? colors.surfaceMuted : colors.primary,
                  color: onboarding ? colors.textMuted : 'white',
                  border: 'none',
                  borderRadius: radius.md,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  cursor: onboarding ? 'not-allowed' : 'pointer'
                }}
              >
                {onboarding ? 'Redirecting to Stripe...' : 'Connect Bank Account'}
              </button>
            </>
          ) : (
            <>
              <div style={{
                padding: spacing.sm,
                backgroundColor: statusColors.successLight,
                border: `1px solid ${statusColors.success}`,
                borderRadius: radius.md,
                color: statusColors.success,
                marginBottom: spacing.md,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs
              }}>
                <span style={{ fontSize: 20 }}>✓</span>
                <span style={{ fontWeight: typography.weights.semibold }}>Your Stripe account is connected</span>
              </div>

              <div style={{ marginBottom: spacing.md }}>
                <StatusItem label="Charges Enabled" enabled={status.chargesEnabled} />
                <StatusItem label="Payouts Enabled" enabled={status.payoutsEnabled} />
                <StatusItem label="Details Submitted" enabled={status.detailsSubmitted} />
              </div>

              {!status.chargesEnabled || !status.payoutsEnabled ? (
                <>
                  <p style={{ color: colors.textMuted, marginBottom: spacing.sm, fontSize: typography.sizes.sm }}>
                    Your account setup is incomplete. Click below to continue.
                  </p>
                  <button
                    onClick={startOnboarding}
                    disabled={onboarding}
                    style={{
                      padding: `${spacing.xs} ${spacing.md}`,
                      backgroundColor: 'transparent',
                      color: colors.primary,
                      border: `2px solid ${colors.primary}`,
                      borderRadius: radius.md,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      cursor: onboarding ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {onboarding ? 'Redirecting...' : 'Complete Setup'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => router.push(`/${vertical}/vendor/orders`)}
                  style={{
                    width: '100%',
                    padding: `${spacing.sm} ${spacing.lg}`,
                    backgroundColor: statusColors.success,
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.md,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
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
      padding: `${spacing.xs} 0`,
      borderBottom: `1px solid ${colors.border}`
    }}>
      <span style={{ color: colors.textPrimary, fontSize: typography.sizes.sm }}>{label}</span>
      {enabled ? (
        <span style={{ color: statusColors.success, fontSize: 20 }}>✓</span>
      ) : (
        <span style={{ color: colors.textMuted, fontSize: 20 }}>○</span>
      )}
    </div>
  )
}
