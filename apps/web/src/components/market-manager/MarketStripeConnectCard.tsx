'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Manager dashboard card for Stripe Connect onboarding + status.
 * Phase C Stage 2 (2026-05-17).
 *
 * Self-fetches status on mount via GET /api/market-manager/[marketId]/stripe/status.
 * "Start" / "Continue" / "Resume" button POSTs to .../stripe/onboard and
 * redirects to the returned Stripe-hosted URL.
 *
 * Four render states based on the status response:
 *   1. Not connected     — no Stripe account yet. Big "Start onboarding" CTA.
 *   2. In progress       — account exists, details_submitted=false. "Continue
 *                          onboarding" CTA.
 *   3. Under review      — details_submitted=true, but charges or payouts not
 *                          yet enabled. Quiet "Stripe is reviewing your info"
 *                          message; refresh button for impatient managers.
 *   4. Active            — all three flags green. Compact status line.
 *
 * Query param handling:
 *   ?stripe=complete  → user returned from Stripe after submitting details.
 *                       Refetch status (which syncs DB state) and show a
 *                       "thanks, you're all set" or "Stripe is reviewing"
 *                       message based on result.
 *   ?stripe=refresh   → user abandoned Stripe; refetch status to make sure
 *                       we have the latest state.
 *
 * No critical-path files touched. No webhook required at this stage.
 */
interface MarketStripeConnectCardProps {
  marketId: string
}

interface StatusResponse {
  connected: boolean
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
}

type CardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_connected' }
  | { kind: 'in_progress' }
  | { kind: 'under_review' }
  | { kind: 'active' }

function classifyStatus(s: StatusResponse): CardState {
  if (!s.connected) return { kind: 'not_connected' }
  if (!s.detailsSubmitted) return { kind: 'in_progress' }
  if (s.chargesEnabled && s.payoutsEnabled) return { kind: 'active' }
  return { kind: 'under_review' }
}

export default function MarketStripeConnectCard({ marketId }: MarketStripeConnectCardProps) {
  const searchParams = useSearchParams()
  const [state, setState] = useState<CardState>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [returnFlash, setReturnFlash] = useState<'complete' | 'refresh' | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-manager/${marketId}/stripe/status`)
      const data = (await res.json().catch(() => ({}))) as StatusResponse & { error?: string }
      if (!res.ok) {
        setState({ kind: 'error', message: data.error || 'Could not load Stripe status' })
        return
      }
      setState(classifyStatus(data))
    } catch {
      setState({ kind: 'error', message: 'Network error checking Stripe status' })
    }
  }, [marketId])

  // Initial load + react to return-from-Stripe query flags.
  // Both the flash setter and fetchStatus (which transitively calls
  // setState after its await) trip react-hooks/set-state-in-effect
  // if invoked synchronously inside the effect body. Defer with
  // queueMicrotask so React sees both on the next tick.
  useEffect(() => {
    const flag = searchParams.get('stripe')
    let cleared = false
    let timer: ReturnType<typeof setTimeout> | null = null

    queueMicrotask(() => {
      if (cleared) return
      if (flag === 'complete' || flag === 'refresh') {
        setReturnFlash(flag as 'complete' | 'refresh')
      }
      fetchStatus()
    })

    if (flag === 'complete' || flag === 'refresh') {
      timer = setTimeout(() => {
        if (!cleared) setReturnFlash(null)
      }, 4000)
    }

    return () => {
      cleared = true
      if (timer) clearTimeout(timer)
    }
  }, [searchParams, fetchStatus])

  const handleOnboard = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/stripe/onboard`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setActionError(data.error || 'Could not generate onboarding link')
        setBusy(false)
        return
      }
      // Redirect to Stripe-hosted onboarding
      window.location.href = data.url
    } catch {
      setActionError('Network error — please try again')
      setBusy(false)
    }
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <h2 style={{
        marginTop: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Booth rental payments
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        Connect a Stripe account to receive booth rental payments from
        vendors who book at your market. Your account is separate from
        your vendor account (if you have one) — handled by Stripe directly,
        we never see your bank details.
      </p>

      {returnFlash === 'complete' && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#d4edda',
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          marginBottom: spacing.sm,
        }}>
          ✓ Returned from Stripe. Checking your account status…
        </div>
      )}
      {returnFlash === 'refresh' && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fff3cd',
          color: '#856404',
          border: '1px solid #ffeeba',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          marginBottom: spacing.sm,
        }}>
          You stepped away from Stripe before finishing. You can pick up where you left off.
        </div>
      )}

      {state.kind === 'loading' && (
        <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
          Checking Stripe connection…
        </div>
      )}

      {state.kind === 'error' && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
        }}>
          {state.message}
        </div>
      )}

      {state.kind === 'not_connected' && (
        <Action
          headline="No Stripe account yet"
          body="Vendors can book booths at your market right now, but you can't receive online payment until you finish Stripe onboarding."
          buttonLabel={busy ? 'Working…' : 'Start Stripe onboarding'}
          onClick={handleOnboard}
          busy={busy}
        />
      )}
      {state.kind === 'in_progress' && (
        <Action
          headline="Stripe onboarding in progress"
          body="You started but haven't finished. Continue where you left off — Stripe should remember your progress."
          buttonLabel={busy ? 'Working…' : 'Continue onboarding'}
          onClick={handleOnboard}
          busy={busy}
        />
      )}
      {state.kind === 'under_review' && (
        <div>
          <StatusBadge bg="#fff3cd" fg="#856404" label="Under review" />
          <p style={{
            margin: `${spacing.sm} 0 0 0`,
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            lineHeight: 1.5,
          }}>
            You finished onboarding. Stripe is reviewing your information —
            this usually takes a few minutes to a few hours. You don&apos;t
            need to do anything; we&apos;ll update this card once Stripe
            enables charges + payouts.
          </p>
          <button
            type="button"
            onClick={fetchStatus}
            style={refreshButtonStyle}
          >
            Refresh status
          </button>
        </div>
      )}
      {state.kind === 'active' && (
        <div>
          <StatusBadge bg="#d4edda" fg="#155724" label="Active" />
          <p style={{
            margin: `${spacing.sm} 0 0 0`,
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            lineHeight: 1.5,
          }}>
            Stripe is connected and ready to receive booth rental payments.
            Online checkout for vendors will go live in the next update.
          </p>
          <button
            type="button"
            onClick={handleOnboard}
            disabled={busy}
            style={{ ...refreshButtonStyle, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Working…' : 'Manage in Stripe'}
          </button>
        </div>
      )}

      {actionError && (
        <div style={{
          marginTop: spacing.sm,
          padding: spacing.sm,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
        }}>
          {actionError}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: `${spacing['3xs']} ${spacing.xs}`,
      backgroundColor: bg,
      color: fg,
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
    }}>
      {label}
    </span>
  )
}

function Action({
  headline,
  body,
  buttonLabel,
  onClick,
  busy,
}: {
  headline: string
  body: string
  buttonLabel: string
  onClick: () => void
  busy: boolean
}) {
  return (
    <div>
      <h3 style={{
        margin: 0,
        marginBottom: spacing['2xs'],
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        {headline}
      </h3>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
        lineHeight: 1.5,
      }}>
        {body}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={{
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: colors.primary,
          color: 'white',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

const refreshButtonStyle: React.CSSProperties = {
  marginTop: spacing.sm,
  padding: `${spacing.xs} ${spacing.md}`,
  backgroundColor: 'transparent',
  color: colors.primary,
  border: `1px solid ${colors.primary}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
}
