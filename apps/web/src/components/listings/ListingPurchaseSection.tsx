'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AddToCartButton, AvailableMarket } from '@/components/cart/AddToCartButton'
import CutoffStatusBanner from './CutoffStatusBanner'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface ListingPurchaseSectionProps {
  listingId: string
  maxQuantity?: number | null
  primaryColor?: string
  vertical?: string
  isPremiumRestricted?: boolean
}

export default function ListingPurchaseSection({
  listingId,
  maxQuantity,
  primaryColor = '#333',
  vertical = 'farmers_market',
  isPremiumRestricted = false
}: ListingPurchaseSectionProps) {
  const [ordersClosed, setOrdersClosed] = useState(false)
  const [markets, setMarkets] = useState<AvailableMarket[]>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)

  // Fetch available markets for this listing
  useEffect(() => {
    async function fetchMarkets() {
      try {
        const res = await fetch(`/api/listings/${listingId}/markets`)
        if (res.ok) {
          const data = await res.json()
          setMarkets(data.markets || [])
        }
      } catch (error) {
        console.error('Error fetching listing markets:', error)
      } finally {
        setLoadingMarkets(false)
      }
    }
    fetchMarkets()
  }, [listingId])

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

  return (
    <div>
      {/* Cutoff Status Banner */}
      <CutoffStatusBanner
        listingId={listingId}
        onStatusChange={(isAccepting) => setOrdersClosed(!isAccepting)}
      />

      {/* Add to Cart Button */}
      {loadingMarkets ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}>
          Loading pickup locations...
        </div>
      ) : (
        <AddToCartButton
          listingId={listingId}
          maxQuantity={maxQuantity}
          primaryColor={primaryColor}
          vertical={vertical}
          ordersClosed={ordersClosed}
          markets={markets}
        />
      )}
    </div>
  )
}
