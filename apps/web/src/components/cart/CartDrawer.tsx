'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useCart, CartItem } from '@/lib/hooks/useCart'
import { calculateDisplayPrice, formatPrice } from '@/lib/constants'
import { formatPickupDate } from '@/types/pickup'

export function CartDrawer() {
  const router = useRouter()
  const params = useParams()
  const vertical = params?.vertical as string
  const { items, removeFromCart, updateQuantity, itemCount, isOpen, setIsOpen, loading, hasScheduleIssues } = useCart()

  // Calculate display total with percentage fee only
  // Flat fee ($0.15) is added at checkout, not in cart
  const baseSubtotal = items.reduce((sum, item) => {
    return sum + (item.price_cents || 0) * item.quantity
  }, 0)
  const displayTotal = calculateDisplayPrice(baseSubtotal)

  function handleCheckout() {
    setIsOpen(false)
    router.push(`/${vertical}/checkout`)
  }

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEsc)
      return () => window.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, setIsOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setIsOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999,
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 420,
        backgroundColor: 'white',
        zIndex: 1000,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 25px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Shopping Cart</h2>
            <p style={{ margin: '5px 0 0', color: '#666', fontSize: 14 }}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#666',
              padding: 5,
            }}
          >
            x
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 25,
        }}>
          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#999',
            }}>
              <p>Loading cart...</p>
            </div>
          ) : items.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#999',
            }}>
              <div style={{ fontSize: 60, marginBottom: 15, opacity: 0.3 }}>🛒</div>
              <p>Your cart is empty</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              {/* Warning banner for schedule issues */}
              {hasScheduleIssues && (
                <div style={{
                  padding: 12,
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  color: '#991b1b',
                  fontSize: 13,
                }}>
                  <strong>Some items need attention</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                    One or more items have pickup time changes. Please remove affected items or select a new pickup date.
                  </p>
                </div>
              )}
              {items.map(item => (
                <CartItemCard
                  key={item.id}
                  item={item}
                  onRemove={removeFromCart}
                  onUpdateQuantity={updateQuantity}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{
            padding: 25,
            borderTop: '1px solid #eee',
            backgroundColor: '#fafafa',
          }}>
            <div style={{ marginBottom: 15 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 18,
                fontWeight: 'bold',
              }}>
                <span>Total</span>
                <span>{formatPrice(displayTotal)}</span>
              </div>
            </div>

            <button
              onClick={handleCheckout}
              style={{
                width: '100%',
                padding: '15px 20px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: '#333',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function CartItemCard({
  item,
  onRemove,
  onUpdateQuantity,
}: {
  item: CartItem
  onRemove: (cartItemId: string) => Promise<void>
  onUpdateQuantity: (cartItemId: string, quantity: number) => Promise<void>
}) {
  const [updatingQty, setUpdatingQty] = useState(false)
  const displayPriceCents = calculateDisplayPrice(item.price_cents || 0)
  const itemTotalCents = displayPriceCents * item.quantity
  const hasIssue = Boolean(item.schedule_issue)

  const handleQuantityChange = async (newQty: number) => {
    setUpdatingQty(true)
    try {
      await onUpdateQuantity(item.id, newQty)
    } finally {
      setUpdatingQty(false)
    }
  }

  return (
    <div style={{
      padding: 15,
      border: hasIssue ? '2px solid #fca5a5' : '1px solid #eee',
      borderRadius: 8,
      backgroundColor: hasIssue ? '#fef2f2' : 'white',
    }}>
      {/* Schedule issue warning */}
      {item.schedule_issue && (
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          backgroundColor: '#fee2e2',
          borderRadius: 6,
          fontSize: 12,
          color: '#991b1b',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⚠️</span>
          <span>{item.schedule_issue}</span>
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.title || 'Unknown Item'}
          </h4>
          <p style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: '#888',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.vendor_name || 'Unknown Vendor'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 500 }}>
            {formatPrice(displayPriceCents)} each
          </p>
        </div>
        <button
          onClick={() => onRemove(item.id)}
          style={{
            background: 'none',
            border: 'none',
            color: hasIssue ? '#dc2626' : '#999',
            cursor: 'pointer',
            padding: 5,
            fontSize: 18,
          }}
          title="Remove item"
        >
          🗑️
        </button>
      </div>

      {/* Pickup info */}
      {item.pickup_display && (
        <div style={{
          marginBottom: 10,
          padding: '6px 10px',
          backgroundColor: hasIssue ? '#fee2e2' : '#f0f9ff',
          borderRadius: 6,
          fontSize: 12,
          color: hasIssue ? '#7f1d1d' : '#0369a1',
        }}>
          <span style={{ fontWeight: 600 }}>Pickup:</span>{' '}
          {item.pickup_date ? formatPickupDate(item.pickup_date) : item.pickup_display.date_formatted}
          {item.pickup_display.time_formatted && (
            <span> · {item.pickup_display.time_formatted}</span>
          )}
          {item.market_name && (
            <span style={{ display: 'block', marginTop: 2, color: hasIssue ? '#991b1b' : '#6b7280' }}>
              @ {item.market_name}
            </span>
          )}
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            onClick={() => handleQuantityChange(item.quantity - 1)}
            disabled={updatingQty}
            style={{
              width: 28,
              height: 28,
              border: '1px solid #ddd',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: updatingQty ? 'default' : 'pointer',
              fontSize: 16,
              opacity: updatingQty ? 0.5 : 1,
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
            {item.quantity}
          </span>
          <button
            onClick={() => handleQuantityChange(item.quantity + 1)}
            disabled={updatingQty}
            style={{
              width: 28,
              height: 28,
              border: '1px solid #ddd',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: updatingQty ? 'default' : 'pointer',
              fontSize: 16,
              opacity: updatingQty ? 0.5 : 1,
            }}
          >
            +
          </button>
        </div>
        <span style={{ fontSize: 16, fontWeight: 'bold' }}>
          {formatPrice(itemTotalCents)}
        </span>
      </div>
    </div>
  )
}
