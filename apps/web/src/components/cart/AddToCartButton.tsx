'use client'

import { useState } from 'react'
import { useCart } from '@/lib/hooks/useCart'
import { useToast } from '@/lib/hooks/useToast'

interface AddToCartButtonProps {
  listingId: string
  maxQuantity?: number | null
  primaryColor?: string
  vertical?: string
  ordersClosed?: boolean
}

export function AddToCartButton({
  listingId,
  maxQuantity,
  primaryColor = '#333',
  vertical = 'farmers_market',
  ordersClosed = false
}: AddToCartButtonProps) {
  const { addToCart, items } = useCart()
  const { showToast, ToastContainer } = useToast()
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check how many of this item are already in cart
  const inCartQty = items.find(i => i.listingId === listingId)?.quantity || 0
  const availableToAdd = maxQuantity !== null && maxQuantity !== undefined
    ? Math.max(0, maxQuantity - inCartQty)
    : 999

  async function handleAddToCart() {
    if (availableToAdd <= 0) {
      showToast('Maximum quantity reached', 'warning')
      return
    }

    setAdding(true)
    setError(null)

    try {
      await addToCart(listingId, quantity)
      showToast('Added to cart!', 'success')
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
  const isDisabled = adding || isSoldOut || availableToAdd <= 0 || ordersClosed

  return (
    <div>
      <ToastContainer />
      {/* Quantity Selector */}
      {!isSoldOut && availableToAdd > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 15,
        }}>
          <span style={{ fontSize: 14, color: '#666' }}>Quantity:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              style={{
                width: 32,
                height: 32,
                border: '1px solid #ddd',
                borderRadius: 4,
                backgroundColor: 'white',
                cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                fontSize: 18,
                opacity: quantity <= 1 ? 0.5 : 1,
              }}
            >
              -
            </button>
            <span style={{
              width: 40,
              textAlign: 'center',
              fontSize: 16,
              fontWeight: 500,
            }}>
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(Math.min(availableToAdd, quantity + 1))}
              disabled={quantity >= availableToAdd}
              style={{
                width: 32,
                height: 32,
                border: '1px solid #ddd',
                borderRadius: 4,
                backgroundColor: 'white',
                cursor: quantity >= availableToAdd ? 'not-allowed' : 'pointer',
                fontSize: 18,
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
        ) : ordersClosed ? (
          'Orders Closed'
        ) : isSoldOut ? (
          'Sold Out'
        ) : availableToAdd <= 0 ? (
          'Max in Cart'
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

      {/* Already in cart notice */}
      {inCartQty > 0 && (
        <p style={{
          color: '#28a745',
          fontSize: 14,
          marginTop: 10,
          marginBottom: 0,
          textAlign: 'center',
        }}>
          {inCartQty} already in cart
        </p>
      )}
    </div>
  )
}
