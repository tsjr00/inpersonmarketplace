'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Follow/unfollow button for a market profile (Session 92 Phase B).
 * Followers receive the market-day-morning notification. Logged-out users
 * get a sign-in redirect (preserving the return path).
 */
interface FollowMarketButtonProps {
  vertical: string
  marketId: string
  initialFollowing: boolean
  isLoggedIn: boolean
}

export default function FollowMarketButton({
  vertical,
  marketId,
  initialFollowing,
  isLoggedIn,
}: FollowMarketButtonProps) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (!isLoggedIn) {
      const returnTo = `/${vertical}/markets/${marketId}`
      router.push(`/${vertical}/login?returnTo=${encodeURIComponent(returnTo)}`)
      return
    }
    setBusy(true)
    const next = !following
    try {
      const res = await fetch(`/api/markets/${marketId}/follow`, {
        method: next ? 'POST' : 'DELETE',
      })
      if (res.ok) {
        setFollowing(next)
      }
    } catch {
      // leave state unchanged on failure
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: `${spacing['2xs']} ${spacing.sm}`,
        backgroundColor: following ? colors.primary : 'transparent',
        color: following ? 'white' : colors.primary,
        border: `1px solid ${colors.primary}`,
        borderRadius: radius.md,
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.7 : 1,
      }}
    >
      {following ? '★ Following' : '☆ Follow'}
    </button>
  )
}
