'use client'

import React from 'react'
import Link from 'next/link'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { type AvailablePickupDate, groupPickupDatesByMarket } from '@/types/pickup'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

/*
 * PICKUP SCHEDULING CONTEXT
 *
 * This component now passes available pickup DATES (not just markets) to AddToCartButton.
 * Buyers select a specific date, not just a location.
 *
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 */

interface ListingPurchaseSectionProps {
  listingId: string
  maxQuantity?: number | null
  primaryColor?: string
  vertical?: string
  isPremiumRestricted?: boolean
  availablePickupDates?: AvailablePickupDate[]
  pickupLeadMinutes?: number
  paymentBadges?: React.ReactNode
}

export default function ListingPurchaseSection({
  listingId,
  maxQuantity,
  primaryColor = '#333',
  vertical = 'farmers_market',
  isPremiumRestricted = false,
  availablePickupDates = [],
  pickupLeadMinutes,
  paymentBadges
}: ListingPurchaseSectionProps) {
  const locale = getClientLocale()

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
          {t('listing.premium_title', locale)}
        </div>
        <p style={{
          fontSize: typography.sizes.sm,
          color: '#3b82f6',
          margin: `0 0 ${spacing.sm} 0`
        }}>
          {t('listing.premium_desc', locale)}
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
          {t('listing.upgrade_btn', locale)}
        </Link>
      </div>
    )
  }

  // Group by market for display, filter to accepting dates
  const marketGroups = groupPickupDatesByMarket(availablePickupDates)

  // Check availability status
  const acceptingDates = availablePickupDates.filter(d => d.is_accepting)
  const hasAcceptingDates = acceptingDates.length > 0
  const hasMixedAvailability = acceptingDates.length > 0 &&
    acceptingDates.length < availablePickupDates.length

  return (
    <AddToCartButton
      listingId={listingId}
      maxQuantity={maxQuantity}
      primaryColor={primaryColor}
      vertical={vertical}
      availablePickupDates={availablePickupDates}
      ordersClosed={!hasAcceptingDates}
      showMixedAvailabilityWarning={hasMixedAvailability}
      pickupLeadMinutes={pickupLeadMinutes}
      paymentBadges={paymentBadges}
    />
  )
}
