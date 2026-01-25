'use client'

import { useState, useEffect } from 'react'
import { AddToCartButton, AvailableMarket } from '@/components/cart/AddToCartButton'
import CutoffStatusBanner from './CutoffStatusBanner'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface ListingPurchaseSectionProps {
  listingId: string
  maxQuantity?: number | null
  primaryColor?: string
  vertical?: string
}

export default function ListingPurchaseSection({
  listingId,
  maxQuantity,
  primaryColor = '#333',
  vertical = 'farmers_market'
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
