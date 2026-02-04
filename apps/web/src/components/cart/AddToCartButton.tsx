'use client'

import { useState, useEffect } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { useToast } from '@/lib/hooks/useToast'

export interface AvailableMarket {
  market_id: string
  market_name: string
  market_type: 'traditional' | 'private_pickup'
  address?: string
  city?: string
  state?: string
  is_accepting: boolean
  next_pickup_at?: string
}

interface AddToCartButtonProps {
  listingId: string
  maxQuantity?: number | null
  primaryColor?: string
  vertical?: string
  ordersClosed?: boolean
  markets?: AvailableMarket[]
  /** Show warning when some markets are closed but others are open */
  showMixedAvailabilityWarning?: boolean
}

export function AddToCartButton({
  listingId,
  maxQuantity,
  primaryColor = '#333',
  vertical = 'farmers_market',
  ordersClosed = false,
  markets = [],
  showMixedAvailabilityWarning = false
}: AddToCartButtonProps) {
  const { addToCart, items } = useCart()
  const { showToast, ToastContainer } = useToast()
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)

  // Filter to only open markets
  const openMarkets = markets.filter(m => m.is_accepting)
  const hasMultipleMarkets = openMarkets.length > 1
  const hasNoOpenMarkets = openMarkets.length === 0

  // Auto-select if only one open market
  useEffect(() => {
    if (openMarkets.length === 1 && !selectedMarketId) {
      setSelectedMarketId(openMarkets[0].market_id)
    }
  }, [openMarkets, selectedMarketId])

  // Check how many of this item are already in cart (across all markets)
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

    if (!selectedMarketId) {
      showToast('Please select a pickup location', 'warning')
      return
    }

    setAdding(true)
    setError(null)

    try {
      await addToCart(listingId, quantity, selectedMarketId)
      const selectedMarket = openMarkets.find(m => m.market_id === selectedMarketId)
      showToast(`Added to cart! Pickup at ${selectedMarket?.market_name || 'selected location'}`, 'success')
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
  const needsMarketSelection = hasMultipleMarkets && !selectedMarketId
  const isDisabled = adding || isSoldOut || availableToAdd <= 0 || ordersClosed || hasNoOpenMarkets || needsMarketSelection

  // Format next pickup date
  const formatNextPickup = (dateStr?: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div>
      <ToastContainer />

      {/* Market Selection - Show when open markets exist */}
      {openMarkets.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <label style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: '#374151',
            marginBottom: 6
          }}>
            Select Pickup Location
          </label>

          {hasMultipleMarkets ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {openMarkets.map(market => (
                <button
                  key={market.market_id}
                  type="button"
                  onClick={() => setSelectedMarketId(market.market_id)}
                  style={{
                    padding: '8px 10px',
                    border: selectedMarketId === market.market_id
                      ? `2px solid ${primaryColor}`
                      : '1px solid #e5e7eb',
                    borderRadius: 6,
                    backgroundColor: selectedMarketId === market.market_id ? '#f0fdf4' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14 }}>
                      {market.market_type === 'traditional' ? '🏪' : '📦'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
                        {market.market_name}
                      </div>
                      {market.next_pickup_at && (
                        <div style={{ fontSize: 11, color: '#059669' }}>
                          Next: {formatNextPickup(market.next_pickup_at)}
                        </div>
                      )}
                    </div>
                    {selectedMarketId === market.market_id && (
                      <span style={{ color: primaryColor, fontSize: 16 }}>✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Single market - show as info, more compact
            <div style={{
              padding: '8px 10px',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>
                  {openMarkets[0]?.market_type === 'traditional' ? '🏪' : '📦'}
                </span>
                <div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>
                    {openMarkets[0]?.market_name}
                  </div>
                  {openMarkets[0]?.next_pickup_at && (
                    <div style={{ fontSize: 11, color: '#059669' }}>
                      Next: {formatNextPickup(openMarkets[0].next_pickup_at)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mixed Availability Warning - show when some markets closed, others open */}
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
            If you missed the cutoff for pre-orders, visit the market in person or order for another location.
          </p>
        </div>
      )}

      {/* Quantity Selector */}
      {!isSoldOut && availableToAdd > 0 && !hasNoOpenMarkets && (
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
        ) : ordersClosed || hasNoOpenMarkets ? (
          'Orders Currently Closed'
        ) : isSoldOut ? (
          'Sold Out'
        ) : availableToAdd <= 0 ? (
          'Max in Cart'
        ) : needsMarketSelection ? (
          'Select Pickup Location'
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

      {/* Already in cart notice - show with market info */}
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
              • {item.quantity}x at {item.market_name || 'selected location'}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
