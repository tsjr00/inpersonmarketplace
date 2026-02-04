'use client'

import Link from 'next/link'
import { AddToCartButton, AvailableMarket } from '@/components/cart/AddToCartButton'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { ProcessedMarket } from '@/lib/utils/listing-availability'

interface ListingPurchaseSectionProps {
  listingId: string
  maxQuantity?: number | null
  primaryColor?: string
  vertical?: string
  isPremiumRestricted?: boolean
  markets?: ProcessedMarket[]
}

export default function ListingPurchaseSection({
  listingId,
  maxQuantity,
  primaryColor = '#333',
  vertical = 'farmers_market',
  isPremiumRestricted = false,
  markets = []
}: ListingPurchaseSectionProps) {
  // Show premium upgrade message instead of add to cart when restricted
  if (isPremiumRestricted) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#eff6ff',
        border: '2px solid #3b82f6',
        borderRadius: radius.md,
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: '#1e40af',
          marginBottom: spacing.xs
        }}>
          ⭐ Premium Early-Bird Access
        </div>
        <p style={{
          fontSize: typography.sizes.sm,
          color: '#3b82f6',
          margin: `0 0 ${spacing.sm} 0`
        }}>
          This listing is in the premium early-bird window. Upgrade to buy now!
        </p>
        <Link
          href={`/${vertical}/buyer/upgrade`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: radius.sm,
            fontWeight: typography.weights.semibold,
            minHeight: 44
          }}
        >
          Upgrade to Premium
        </Link>
      </div>
    )
  }

  // Map ProcessedMarket to AvailableMarket for AddToCartButton
  const availableMarkets: AvailableMarket[] = markets.map(m => ({
    market_id: m.market_id,
    market_name: m.market_name,
    market_type: m.market_type,
    address: m.address,
    city: m.city,
    state: m.state,
    is_accepting: m.is_accepting,
    next_pickup_at: m.next_pickup_at || undefined,
    start_time: m.start_time || undefined,
    end_time: m.end_time || undefined
  }))

  // Calculate if we should show the mixed availability warning
  // (some markets open, some closed)
  const openMarkets = availableMarkets.filter(m => m.is_accepting)
  const closedMarkets = availableMarkets.filter(m => !m.is_accepting)
  const showMixedWarning = openMarkets.length > 0 && closedMarkets.length > 0
  const ordersClosed = availableMarkets.length > 0 && openMarkets.length === 0

  return (
    <AddToCartButton
      listingId={listingId}
      maxQuantity={maxQuantity}
      primaryColor={primaryColor}
      vertical={vertical}
      ordersClosed={ordersClosed}
      markets={availableMarkets}
      showMixedAvailabilityWarning={showMixedWarning}
    />
  )
}
