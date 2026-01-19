'use client'

import { useState, useEffect } from 'react'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
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

  return (
    <div>
      {/* Cutoff Status Banner */}
      <CutoffStatusBanner
        listingId={listingId}
        onStatusChange={(isAccepting) => setOrdersClosed(!isAccepting)}
      />

      {/* Add to Cart Button */}
      <AddToCartButton
        listingId={listingId}
        maxQuantity={maxQuantity}
        primaryColor={primaryColor}
        vertical={vertical}
        ordersClosed={ordersClosed}
      />
    </div>
  )
}
