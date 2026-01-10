'use client'

import { useRouter, useParams } from 'next/navigation'
import { useCart } from '@/lib/hooks/useCart'

export function CartDrawer() {
  const router = useRouter()
  const params = useParams()
  const vertical = params?.vertical as string
  const { items, removeFromCart, updateQuantity, itemCount, isOpen, setIsOpen } = useCart()

  const subtotal = items.reduce((sum, item) => {
    return sum + ((item.price_cents || 0) * item.quantity)
  }, 0)

  const buyerFee = Math.round(subtotal * 0.065) // 6.5% buyer fee
  const displayTotal = subtotal + buyerFee

  function handleCheckout() {
    setIsOpen(false)
    router.push(`/${vertical}/checkout`)
  }

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
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 25,
        }}>
          {items.length === 0 ? (
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
              {items.map(item => (
                <CartItem
                  key={item.listingId}
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
                marginBottom: 8,
                fontSize: 14,
                color: '#666',
              }}>
                <span>Subtotal</span>
                <span>${(subtotal / 100).toFixed(2)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 8,
                fontSize: 14,
                color: '#666',
              }}>
                <span>Platform Fee (6.5%)</span>
                <span>${(buyerFee / 100).toFixed(2)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: 10,
                borderTop: '1px solid #ddd',
                fontSize: 18,
                fontWeight: 'bold',
              }}>
                <span>Total</span>
                <span>${(displayTotal / 100).toFixed(2)}</span>
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

function CartItem({
  item,
  onRemove,
  onUpdateQuantity,
}: {
  item: {
    listingId: string
    quantity: number
    title?: string
    price_cents?: number
    vendor_name?: string
  }
  onRemove: (listingId: string) => void
  onUpdateQuantity: (listingId: string, quantity: number) => void
}) {
  const displayPrice = ((item.price_cents || 0) * 1.065) / 100
  const itemTotal = displayPrice * item.quantity

  return (
    <div style={{
      padding: 15,
      border: '1px solid #eee',
      borderRadius: 8,
      backgroundColor: 'white',
    }}>
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
            ${displayPrice.toFixed(2)} each
          </p>
        </div>
        <button
          onClick={() => onRemove(item.listingId)}
          style={{
            background: 'none',
            border: 'none',
            color: '#999',
            cursor: 'pointer',
            padding: 5,
            fontSize: 18,
          }}
          title="Remove item"
        >
          🗑️
        </button>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            onClick={() => onUpdateQuantity(item.listingId, item.quantity - 1)}
            style={{
              width: 28,
              height: 28,
              border: '1px solid #ddd',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            −
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
            onClick={() => onUpdateQuantity(item.listingId, item.quantity + 1)}
            style={{
              width: 28,
              height: 28,
              border: '1px solid #ddd',
              borderRadius: 4,
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            +
          </button>
        </div>
        <span style={{ fontSize: 16, fontWeight: 'bold' }}>
          ${itemTotal.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
