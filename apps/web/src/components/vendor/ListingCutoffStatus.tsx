'use client'

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface ListingCutoffStatusProps {
  listingId: string
  status: string
}

export default function ListingCutoffStatus({ listingId, status }: ListingCutoffStatusProps) {
  const [cutoffInfo, setCutoffInfo] = useState<{
    is_accepting: boolean
    closing_soon: boolean
    hours_until_cutoff: number | null
    next_market_at: string | null
  } | null>(null)

  useEffect(() => {
    // Only fetch for published listings
    if (status !== 'published') return

    async function fetchCutoff() {
      try {
        const response = await fetch(`/api/listings/${listingId}/availability`)
        if (response.ok) {
          const data = await response.json()
          setCutoffInfo({
            is_accepting: data.is_accepting_orders,
            closing_soon: data.closing_soon || false,
            hours_until_cutoff: data.hours_until_cutoff,
            next_market_at: data.markets?.[0]?.next_market_at || null
          })
        }
      } catch (error) {
        // Silently fail - cutoff info is optional
      }
    }

    fetchCutoff()
  }, [listingId, status])

  // Don't show anything for non-published or if no cutoff info
  if (status !== 'published' || !cutoffInfo) {
    return null
  }

  // Orders are closed
  if (!cutoffInfo.is_accepting) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: `${spacing['3xs']} ${spacing['2xs']}`,
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        color: '#991b1b',
        marginBottom: spacing['2xs']
      }}>
        <span>🚫</span>
        <span>Orders closed for vendor prep</span>
      </div>
    )
  }

  // Closing soon
  if (cutoffInfo.closing_soon && cutoffInfo.hours_until_cutoff) {
    const hours = cutoffInfo.hours_until_cutoff
    const timeStr = hours < 1
      ? `${Math.round(hours * 60)}m`
      : hours < 24
        ? `${Math.floor(hours)}h`
        : `${Math.floor(hours / 24)}d`

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: `${spacing['3xs']} ${spacing['2xs']}`,
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        color: '#92400e',
        marginBottom: spacing['2xs']
      }}>
        <span>⏰</span>
        <span>Orders close in {timeStr}</span>
      </div>
    )
  }

  // All good, accepting orders
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing['3xs'],
      padding: `${spacing['3xs']} ${spacing['2xs']}`,
      backgroundColor: colors.primaryLight,
      border: `1px solid ${colors.primary}`,
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      color: colors.primaryDark,
      marginBottom: spacing['2xs']
    }}>
      <span>✓</span>
      <span>Accepting orders</span>
    </div>
  )
}
