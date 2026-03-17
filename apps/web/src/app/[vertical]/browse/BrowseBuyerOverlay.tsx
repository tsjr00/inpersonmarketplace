'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface BrowseBuyerOverlayProps {
  vertical: string
  premiumWindowIds: string[]
  premiumEnabled: boolean
}

/**
 * Client-side overlay for the ISR-cached browse page.
 *
 * Handles user-specific behavior that can't run on the ISR-cached server:
 * 1. Premium window filtering — hides premium-window items for non-premium users
 * 2. Premium upgrade banner — shown when items are hidden
 *
 * Premium-window items are rendered server-side with CSS class "premium-window-item"
 * which is hidden by default via a <style> tag. This overlay removes that style
 * for premium users so they can see those items.
 */
export default function BrowseBuyerOverlay({
  vertical,
  premiumWindowIds,
  premiumEnabled,
}: BrowseBuyerOverlayProps) {
  const [isPremium, setIsPremium] = useState<boolean | null>(null)
  const [checkedAuth, setCheckedAuth] = useState(false)

  useEffect(() => {
    // No premium-window items or premium not enabled — nothing to do
    if (!premiumEnabled || premiumWindowIds.length === 0) {
      setCheckedAuth(true)
      return
    }

    const supabase = createClient()

    async function checkBuyerTier() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setIsPremium(false)
          setCheckedAuth(true)
          return
        }

        const { data } = await supabase
          .from('user_profiles')
          .select('buyer_tier')
          .eq('user_id', user.id)
          .single()

        setIsPremium(data?.buyer_tier === 'premium')
      } catch {
        setIsPremium(false)
      }
      setCheckedAuth(true)
    }

    checkBuyerTier()
  }, [premiumEnabled, premiumWindowIds.length])

  // For premium users: remove the hide-style so premium-window items become visible
  useEffect(() => {
    if (isPremium === true) {
      const styleEl = document.getElementById('premium-window-hide-style')
      if (styleEl) styleEl.remove()
    }
  }, [isPremium])

  // Don't render anything until we know the tier
  if (!checkedAuth || !premiumEnabled || premiumWindowIds.length === 0) return null

  // Premium users see everything — no banner needed
  if (isPremium) return null

  // Non-premium users: show upgrade banner (items are already CSS-hidden)
  return (
    <div
      id="premium-window-banner"
      style={{
        padding: spacing.sm,
        marginBottom: spacing.md,
        backgroundColor: colors.surfaceSubtle,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        flexWrap: 'wrap'
      }}
    >
      <p style={{
        margin: 0,
        fontSize: typography.sizes.sm,
        color: colors.textSecondary,
        flex: 1,
        minWidth: 200
      }}>
        {premiumWindowIds.length} listing{premiumWindowIds.length !== 1 ? 's are' : ' is'} in the premium early-bird window.
        More items will be visible soon.
      </p>
      <Link
        href={`/${vertical}/buyer/upgrade`}
        style={{
          fontSize: typography.sizes.sm,
          color: colors.primary,
          textDecoration: 'none',
          fontWeight: typography.weights.medium,
          whiteSpace: 'nowrap'
        }}
      >
        Upgrade to Premium →
      </Link>
    </div>
  )
}
