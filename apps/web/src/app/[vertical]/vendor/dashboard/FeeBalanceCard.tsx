'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface FeeBalanceCardProps {
  vendorId: string
  vertical: string
}

interface FeeData {
  balance_cents: number
  oldest_unpaid_at: string | null
  requires_payment: boolean
  thresholds: {
    balance_cents: number
    age_days: number
  }
}

export default function FeeBalanceCard({ vendorId, vertical }: FeeBalanceCardProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<FeeData | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    fetchBalance()
  }, [vendorId])

  const fetchBalance = async () => {
    try {
      const response = await fetch(`/api/vendor/fees?vendor_id=${vendorId}`)
      if (!response.ok) {
        throw new Error('Failed to load fee balance')
      }
      const feeData = await response.json()
      setData(feeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const handlePayNow = async () => {
    setPaying(true)
    try {
      const response = await fetch('/api/vendor/fees/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId, vertical_id: vertical })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create payment')
      }

      // Redirect to Stripe Checkout
      if (result.checkout_url) {
        window.location.href = result.checkout_url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
      setPaying(false)
    }
  }

  // Don't show if no balance
  if (!loading && (!data || data.balance_cents <= 0)) {
    return null
  }

  const balanceDollars = data ? (data.balance_cents / 100).toFixed(2) : '0.00'

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: data?.requires_payment ? '#fef3c7' : colors.surfaceElevated,
      border: `1px solid ${data?.requires_payment ? '#f59e0b' : colors.border}`,
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
            color: data?.requires_payment ? '#92400e' : colors.primary,
            margin: 0,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold
          }}>
            {data?.requires_payment ? 'Platform Fees Due' : 'Platform Fees'}
          </h3>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: 0 }}>
          Loading...
        </p>
      ) : error ? (
        <p style={{ fontSize: typography.sizes.sm, color: '#dc2626', margin: 0 }}>
          {error}
        </p>
      ) : data && (
        <div>
          <p style={{
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: data.requires_payment ? '#92400e' : colors.textPrimary,
            margin: `0 0 ${spacing['2xs']} 0`
          }}>
            ${balanceDollars}
          </p>

          {data.requires_payment ? (
            <p style={{
              fontSize: typography.sizes.xs,
              color: '#92400e',
              margin: `0 0 ${spacing.xs} 0`
            }}>
              Payment required to continue accepting external payments
            </p>
          ) : (
            <p style={{
              fontSize: typography.sizes.xs,
              color: colors.textMuted,
              margin: `0 0 ${spacing.xs} 0`
            }}>
              Auto-deducted from your next card sale
            </p>
          )}

          <button
            onClick={handlePayNow}
            disabled={paying}
            style={{
              width: '100%',
              padding: spacing['2xs'],
              backgroundColor: data.requires_payment ? '#f59e0b' : colors.surfaceMuted,
              color: data.requires_payment ? 'white' : colors.textSecondary,
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: data.requires_payment ? typography.weights.medium : typography.weights.normal,
              cursor: paying ? 'wait' : 'pointer',
              opacity: paying ? 0.7 : 1
            }}
          >
            {paying ? 'Loading...' : `Pay $${balanceDollars} Now`}
          </button>
        </div>
      )}
    </div>
  )
}
