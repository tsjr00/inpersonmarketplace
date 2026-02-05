'use client'

import { useState, useEffect } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { useToast } from '@/lib/hooks/useToast'
import {
  type AvailablePickupDate,
  type PickupDateOption,
  groupPickupDatesByMarket,
  formatPickupDate,
  formatPickupTime,
  formatCutoffRemaining,
  getPickupDateColor
} from '@/types/pickup'

/*
 * PICKUP SCHEDULING CONTEXT
 *
 * This component now allows selection of specific pickup DATES, not just markets.
 * Selection is stored as (schedule_id, pickup_date) pair.
 *
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 */

interface AddToCartButtonProps {
  listingId: string
  maxQuantity?: number | null
  primaryColor?: string
  vertical?: string
  ordersClosed?: boolean
  availablePickupDates?: AvailablePickupDate[]
  /** Show warning when some dates are closed but others are open */
  showMixedAvailabilityWarning?: boolean
}

interface PickupSelection {
  scheduleId: string
  pickupDate: string
  marketId: string
  marketName: string
}

export function AddToCartButton({
  listingId,
  maxQuantity,
  primaryColor = '#333',
  vertical = 'farmers_market',
  ordersClosed = false,
  availablePickupDates = [],
  showMixedAvailabilityWarning = false
}: AddToCartButtonProps) {
  const { addToCart, items } = useCart()
  const { showToast, ToastContainer } = useToast()
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPickup, setSelectedPickup] = useState<PickupSelection | null>(null)

  // Group dates by market for display
  const marketGroups = groupPickupDatesByMarket(availablePickupDates)

  // Filter to only accepting dates
  const acceptingDates = availablePickupDates.filter(d => d.is_accepting)
  const hasAcceptingDates = acceptingDates.length > 0
  const hasMultipleOptions = acceptingDates.length > 1

  // Auto-select if only one accepting date
  useEffect(() => {
    if (acceptingDates.length === 1 && !selectedPickup) {
      const fullDate = acceptingDates[0]
      setSelectedPickup({
        scheduleId: fullDate.schedule_id,
        pickupDate: fullDate.pickup_date,
        marketId: fullDate.market_id,
        marketName: fullDate.market_name
      })
    }
  }, [acceptingDates, selectedPickup])

  // Check how many of this item are already in cart (across all dates)
  const inCartItems = items.filter(i => i.listingId === listingId)
  const inCartQty = inCartItems.reduce((sum, i) => sum + i.quantity, 0)
  const availableToAdd = maxQuantity !== null && maxQuantity !== undefined
    ? Math.max(0, maxQuantity - inCartQty)
    : 999

  async function handleAddToCart() {
    if (availableToAdd <= 0) {
      showToast('Maximum quantity reached', 'warning')
      return
    }

    if (!selectedPickup) {
      showToast('Please select a pickup date', 'warning')
      return
    }

    setAdding(true)
    setError(null)

    try {
      await addToCart(
        listingId,
        quantity,
        selectedPickup.marketId,
        selectedPickup.scheduleId,
        selectedPickup.pickupDate
      )
      const dateFormatted = formatPickupDate(selectedPickup.pickupDate)
      showToast(`Added to cart! Pickup ${dateFormatted} at ${selectedPickup.marketName}`, 'success')
      setQuantity(1) // Reset quantity after adding
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add to cart'

      // Check for unauthorized error
      if (errorMessage.toLowerCase().includes('unauthorized') || errorMessage.includes('401')) {
        showToast('Please log in to add items to your cart', 'info')
        // Redirect after brief delay
        setTimeout(() => {
          const currentPath = window.location.pathname
          window.location.href = `/${vertical}/login?redirect=${encodeURIComponent(currentPath)}`
        }, 2000)
      } else {
        showToast(errorMessage, 'error')
        setError(errorMessage)
      }
    } finally {
      setAdding(false)
    }
  }

  const isSoldOut = maxQuantity !== null && maxQuantity !== undefined && maxQuantity <= 0
  const needsSelection = hasMultipleOptions && !selectedPickup
  const isDisabled = adding || isSoldOut || availableToAdd <= 0 || ordersClosed || !hasAcceptingDates || needsSelection

  // Handle date selection - works with both full AvailablePickupDate and PickupDateOption + market info
  const handleSelectDate = (
    date: PickupDateOption,
    marketId: string,
    marketName: string
  ) => {
    if (!date.is_accepting) return
    setSelectedPickup({
      scheduleId: date.schedule_id,
      pickupDate: date.pickup_date,
      marketId,
      marketName
    })
  }

  // Check if a date is selected
  const isDateSelected = (date: PickupDateOption) => {
    return selectedPickup?.scheduleId === date.schedule_id &&
           selectedPickup?.pickupDate === date.pickup_date
  }

  return (
    <div>
      <ToastContainer />

      {/* Pickup Date Selection - Show when accepting dates exist */}
      {hasAcceptingDates && (
        <div style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 6
          }}>
            Select Pickup Date
          </label>

          {hasMultipleOptions ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {marketGroups.map(market => {
                // Only show markets with at least one accepting date
                const acceptingMarketDates = market.dates.filter(d => d.is_accepting)
                if (acceptingMarketDates.length === 0) return null

                return (
                  <div key={market.market_id}>
                    {/* Market header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 6
                    }}>
                      <span style={{ fontSize: 14 }}>
                        {market.market_type === 'traditional' ? '🏪' : '📦'}
                      </span>
                      <span style={{
                        fontWeight: 600,
                        color: '#374151',
                        fontSize: 13
                      }}>
                        {market.market_name}
                      </span>
                    </div>

                    {/* Address */}
                    {market.city && (
                      <div style={{
                        fontSize: 11,
                        color: '#6b7280',
                        marginBottom: 6,
                        marginLeft: 22
                      }}>
                        {market.address ? `${market.address}, ` : ''}{market.city}, {market.state}
                      </div>
                    )}

                    {/* Dates for this market */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      marginLeft: 22
                    }}>
                      {acceptingMarketDates.map((date, dateIndex) => {
                        const isSelected = isDateSelected(date)
                        const dateColor = getPickupDateColor(dateIndex)
                        const isClosingSoon = date.hours_until_cutoff !== null &&
                          date.hours_until_cutoff < 24 &&
                          date.hours_until_cutoff > 0

                        return (
                          <button
                            key={`${date.schedule_id}-${date.pickup_date}`}
                            type="button"
                            onClick={() => handleSelectDate(date, market.market_id, market.market_name)}
                            style={{
                              padding: '8px 12px',
                              border: isSelected
                                ? `2px solid ${primaryColor}`
                                : '1px solid #e5e7eb',
                              borderRadius: 6,
                              backgroundColor: isSelected ? '#f0fdf4' : 'white',
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Date with colored underline */}
                              <span style={{
                                fontWeight: 600,
                                color: '#374151',
                                fontSize: 13,
                                borderBottom: `2px solid ${dateColor}`,
                                paddingBottom: 1
                              }}>
                                {formatPickupDate(date.pickup_date)}
                              </span>
                              {/* Time */}
                              <span style={{
                                color: '#6b7280',
                                fontSize: 12
                              }}>
                                {formatPickupTime(date.start_time)}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {/* Closing soon warning */}
                              {isClosingSoon && (
                                <span style={{
                                  fontSize: 10,
                                  color: '#92400e',
                                  backgroundColor: '#fef3c7',
                                  padding: '2px 6px',
                                  borderRadius: 4
                                }}>
                                  {formatCutoffRemaining(date.hours_until_cutoff)}
                                </span>
                              )}
                              {/* Selection checkmark */}
                              {isSelected && (
                                <span style={{ color: primaryColor, fontSize: 16 }}>✓</span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Single accepting date - show as info
            <div style={{
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              backgroundColor: '#f9fafb'
            }}>
              {acceptingDates[0] && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 14, marginTop: 2 }}>
                    {acceptingDates[0].market_type === 'traditional' ? '🏪' : '📦'}
                  </span>
                  <div>
                    {/* Line 1: Market name */}
                    <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
                      {acceptingDates[0].market_name}
                    </div>
                    {/* Line 2: Address */}
                    {acceptingDates[0].city && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        {acceptingDates[0].address ? `${acceptingDates[0].address}, ` : ''}{acceptingDates[0].city}, {acceptingDates[0].state}
                      </div>
                    )}
                    {/* Line 3: Pickup date and time */}
                    <div style={{
                      fontSize: 12,
                      color: '#059669',
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span style={{
                        fontWeight: 600,
                        borderBottom: `2px solid ${getPickupDateColor(0)}`,
                        paddingBottom: 1
                      }}>
                        {formatPickupDate(acceptingDates[0].pickup_date)}
                      </span>
                      <span>at {formatPickupTime(acceptingDates[0].start_time)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mixed Availability Warning - show when some dates closed, others open */}
      {showMixedAvailabilityWarning && (
        <div style={{
          padding: '8px 10px',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 6,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6
        }}>
          <span style={{ fontSize: 12, flexShrink: 0 }}>⚠️</span>
          <p style={{
            margin: 0,
            fontSize: 11,
            color: '#78350f',
            lineHeight: 1.4
          }}>
            Some pickup dates are no longer accepting orders. Select an available date above.
          </p>
        </div>
      )}

      {/* Quantity Selector */}
      {!isSoldOut && availableToAdd > 0 && hasAcceptingDates && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}>
          <span style={{ fontSize: 12, color: '#666' }}>Qty:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              style={{
                width: 28,
                height: 28,
                border: '1px solid #ddd',
                borderRadius: 4,
                backgroundColor: 'white',
                cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                fontSize: 16,
                opacity: quantity <= 1 ? 0.5 : 1,
              }}
            >
              -
            </button>
            <span style={{
              width: 32,
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 500,
            }}>
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(Math.min(availableToAdd, quantity + 1))}
              disabled={quantity >= availableToAdd}
              style={{
                width: 28,
                height: 28,
                border: '1px solid #ddd',
                borderRadius: 4,
                backgroundColor: 'white',
                cursor: quantity >= availableToAdd ? 'not-allowed' : 'pointer',
                fontSize: 16,
                opacity: quantity >= availableToAdd ? 0.5 : 1,
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Add to Cart Button */}
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={isDisabled}
        style={{
          width: '100%',
          padding: '15px 20px',
          fontSize: 18,
          fontWeight: 600,
          backgroundColor: isDisabled ? '#ccc' : primaryColor,
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        {adding ? (
          'Adding...'
        ) : ordersClosed || !hasAcceptingDates ? (
          'Orders Currently Closed'
        ) : isSoldOut ? (
          'Sold Out'
        ) : availableToAdd <= 0 ? (
          'Max in Cart'
        ) : needsSelection ? (
          'Select Pickup Date'
        ) : (
          <>
            <span style={{ fontSize: 20 }}>🛒</span>
            Add to Cart
          </>
        )}
      </button>

      {/* Error message */}
      {error && (
        <p style={{
          color: '#dc3545',
          fontSize: 14,
          marginTop: 10,
          marginBottom: 0,
          textAlign: 'center',
        }}>
          {error}
        </p>
      )}

      {/* Already in cart notice - show with pickup info */}
      {inCartItems.length > 0 && (
        <div style={{
          marginTop: 12,
          padding: 10,
          backgroundColor: '#dcfce7',
          border: '1px solid #bbf7d0',
          borderRadius: 6,
          fontSize: 13
        }}>
          <p style={{ margin: 0, color: '#166534', fontWeight: 600 }}>
            In your cart:
          </p>
          {inCartItems.map(item => (
            <p key={item.id} style={{ margin: '4px 0 0 0', color: '#166534' }}>
              • {item.quantity}x{item.pickup_date ? ` for ${formatPickupDate(item.pickup_date)}` : ''} at {item.market_name || 'selected location'}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
