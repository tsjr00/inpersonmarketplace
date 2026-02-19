'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { colors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

type Market = {
  id: string
  name: string
  market_type: string
  address: string
  city: string
  state: string
  day_of_week?: number
  start_time?: string
  end_time?: string
  currentCount: number // Account total (same for all markets)
  limit: number
  canAdd: boolean
  isVendorOwned: boolean
  isHomeMarket: boolean
  homeMarketRestricted: boolean
}

type MarketStatsResponse = {
  markets: Market[]
  currentMarketIds: string[]
  vendorTier: string
  homeMarketId: string | null
  isPremium: boolean
  totalListings: number
  tierLimits: {
    traditionalMarkets: number
    productListings: number
  }
}

type MarketSelectorProps = {
  vertical: string
  listingId?: string
  selectedMarketIds: string[]
  onChange: (marketIds: string[]) => void
  onMarketsLoaded?: (markets: Market[]) => void
  onMetadataLoaded?: (vendorTier: string, homeMarketId: string | null) => void
  disabled?: boolean
  primaryColor?: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function MarketSelector({
  vertical,
  listingId,
  selectedMarketIds,
  onChange,
  onMarketsLoaded,
  onMetadataLoaded,
  disabled = false,
  primaryColor = '#2563eb'
}: MarketSelectorProps) {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [totalListings, setTotalListings] = useState(0)
  const [listingLimit, setListingLimit] = useState(5)

  useEffect(() => {
    fetchMarkets()
  }, [vertical, listingId])

  const fetchMarkets = async () => {
    try {
      const url = `/api/vendor/market-stats?vertical=${vertical}${listingId ? `&listingId=${listingId}` : ''}`
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error('Failed to fetch markets')
      }

      const data: MarketStatsResponse = await res.json()
      setMarkets(data.markets || [])
      setTotalListings(data.totalListings || 0)
      setListingLimit(data.tierLimits?.productListings || 5)

      // Call onMarketsLoaded callback if provided
      if (onMarketsLoaded) {
        onMarketsLoaded(data.markets || [])
      }

      // Call onMetadataLoaded callback if provided
      if (onMetadataLoaded) {
        onMetadataLoaded(data.vendorTier || 'standard', data.homeMarketId || null)
      }

      // Set initial selection if editing and we haven't done initial load
      if (listingId && data.currentMarketIds && data.currentMarketIds.length > 0 && !initialLoadDone) {
        onChange(data.currentMarketIds)
        setInitialLoadDone(true)
      }
    } catch (err) {
      console.error('Error fetching markets:', err)
      setError('Failed to load markets')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (marketId: string, canAdd: boolean) => {
    if (disabled) return

    const isSelected = selectedMarketIds.includes(marketId)

    if (isSelected) {
      // Remove from selection
      onChange(selectedMarketIds.filter(id => id !== marketId))
    } else {
      // Add to selection (only if allowed)
      if (canAdd) {
        onChange([...selectedMarketIds, marketId])
      }
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 16, color: '#6b7280' }}>
        Loading markets...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: '#dc2626' }}>
        {error}
      </div>
    )
  }

  if (markets.length === 0) {
    return (
      <div style={{
        padding: 16,
        backgroundColor: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: 8
      }}>
        <p style={{ margin: 0, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>
          No Markets Available
        </p>
        <p style={{ margin: 0, fontSize: 14, color: '#92400e' }}>
          You need to set up your markets before creating listings.
          <Link
            href={`/${vertical}/vendor/markets`}
            style={{
              color: primaryColor,
              textDecoration: 'underline',
              marginLeft: 4
            }}
          >
            Go to Markets
          </Link>
        </p>
      </div>
    )
  }

  const fixedMarkets = markets.filter(m => m.market_type === 'traditional')
  const privateMarkets = markets.filter(m => m.market_type === 'private_pickup')

  // For editing, the current listing doesn't count against limit
  const effectiveCount = listingId ? Math.max(0, totalListings - 1) : totalListings
  const isAtLimit = effectiveCount >= listingLimit

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Account Listing Count */}
      <div style={{
        padding: 12,
        backgroundColor: isAtLimit ? '#fef2f2' : colors.primaryLight,
        border: `1px solid ${isAtLimit ? '#fecaca' : colors.primary}`,
        borderRadius: 8,
        fontSize: 14
      }}>
        <div style={{
          fontWeight: 600,
          color: isAtLimit ? '#dc2626' : colors.primary,
          marginBottom: 4
        }}>
          {effectiveCount} of {listingLimit} listings used
        </div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {isAtLimit
            ? 'You\'ve reached your listing limit. Delete or unpublish a listing to create a new one.'
            : `You can create ${listingLimit - effectiveCount} more listing${listingLimit - effectiveCount !== 1 ? 's' : ''}.`
          }
        </div>
      </div>

      {/* Traditional Markets */}
      {fixedMarkets.length > 0 && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 0, color: '#374151' }}>
            Traditional Markets
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fixedMarkets.map(market => {
              const isSelected = selectedMarketIds.includes(market.id)
              const canSelect = market.canAdd || isSelected

              return (
                <label
                  key={market.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: 12,
                    border: '1px solid',
                    borderColor: isSelected ? primaryColor : market.homeMarketRestricted ? '#f3f4f6' : '#d1d5db',
                    borderRadius: 8,
                    cursor: canSelect && !disabled ? 'pointer' : 'not-allowed',
                    backgroundColor: isSelected ? `${primaryColor}10` : market.homeMarketRestricted ? '#f9fafb' : '#fff',
                    opacity: canSelect ? 1 : 0.5
                  }}
                  title={market.homeMarketRestricted ? 'Upgrade to join multiple markets' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(market.id, canSelect)}
                    disabled={!canSelect || disabled}
                    style={{
                      marginRight: 12,
                      marginTop: 2,
                      minWidth: 18,
                      minHeight: 18,
                      accentColor: primaryColor
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#333', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {market.name}
                      {market.isHomeMarket && (
                        <span style={{
                          fontSize: 12,
                          color: colors.primary,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          🏠 Home Market
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>
                      {market.address}, {market.city}, {market.state}
                    </div>
                    {market.day_of_week !== null && market.day_of_week !== undefined && (
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        {DAYS[market.day_of_week]} {market.start_time} - {market.end_time}
                      </div>
                    )}
                    {(market.homeMarketRestricted || (!canSelect && !isSelected)) && (
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        {market.homeMarketRestricted && (
                          <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                            Upgrade to join multiple markets
                          </span>
                        )}
                        {!canSelect && !isSelected && !market.homeMarketRestricted && (
                          <span style={{ color: '#dc2626' }}>
                            Listing limit reached
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Private Pickup Markets */}
      {privateMarkets.length > 0 && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, marginTop: 0, color: '#374151' }}>
            My Pickup Locations
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {privateMarkets.map(market => {
              const isSelected = selectedMarketIds.includes(market.id)
              const canSelect = market.canAdd || isSelected

              return (
                <label
                  key={market.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: 12,
                    border: '1px solid',
                    borderColor: isSelected ? primaryColor : '#d1d5db',
                    borderRadius: 8,
                    cursor: canSelect && !disabled ? 'pointer' : 'not-allowed',
                    backgroundColor: isSelected ? `${primaryColor}10` : '#fff',
                    opacity: canSelect ? 1 : 0.6
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(market.id, canSelect)}
                    disabled={!canSelect || disabled}
                    style={{
                      marginRight: 12,
                      marginTop: 2,
                      minWidth: 18,
                      minHeight: 18,
                      accentColor: primaryColor
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#333' }}>
                      {market.name}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>
                      {market.address}, {market.city}, {market.state}
                    </div>
                    {!canSelect && !isSelected && (
                      <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                        Listing limit reached
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* No markets selected warning */}
      {selectedMarketIds.length === 0 && (
        <div style={{
          padding: 12,
          backgroundColor: '#f5f5f5',
          border: '1px solid #E53935',
          borderRadius: 8,
          fontSize: 14,
          color: '#4A4A4A'
        }}>
          Please select at least one {term(vertical, 'market').toLowerCase()} for this listing
        </div>
      )}

      {/* Link to add more markets */}
      <div style={{ fontSize: 13, color: '#6b7280' }}>
        <Link
          href={`/${vertical}/vendor/markets`}
          style={{ color: primaryColor, textDecoration: 'underline' }}
        >
          Manage my markets and pickup locations
        </Link>
      </div>
    </div>
  )
}
