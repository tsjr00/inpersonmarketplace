'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/lib/hooks/useCart'
import { calculateDisplayPrice, formatPrice } from '@/lib/constants'

interface CheckoutItem {
  listingId: string
  quantity: number
  title: string
  price_cents: number
  vendor_name: string
  available: boolean
  available_quantity: number | null
}

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const { items, clearCart, removeFromCart, updateQuantity } = useCart()

  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [marketWarnings, setMarketWarnings] = useState<string[]>([])
  const [marketValid, setMarketValid] = useState(true)

  // Check auth and validate cart items
  useEffect(() => {
    async function validateCart() {
      try {
        // Check authentication
        const authResponse = await fetch('/api/auth/me')
        if (authResponse.ok) {
          const authData = await authResponse.json()
          setUser(authData.user)
        }

        // Validate cart items
        if (items.length === 0) {
          setCheckoutItems([])
          setLoading(false)
          return
        }

        const response = await fetch('/api/cart/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map(item => ({
              listingId: item.listingId,
              quantity: item.quantity,
            })),
          }),
        })

        if (response.ok) {
          const data = await response.json()
          setCheckoutItems(data.items || [])
        } else {
          // Fall back to local cart data
          setCheckoutItems(items.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
            title: item.title || 'Unknown Item',
            price_cents: item.price_cents || 0,
            vendor_name: item.vendor_name || 'Unknown Vendor',
            available: true,
            available_quantity: null,
          })))
        }
      } catch (err) {
        console.error('Cart validation error:', err)
        setCheckoutItems(items.map(item => ({
          listingId: item.listingId,
          quantity: item.quantity,
          title: item.title || 'Unknown Item',
          price_cents: item.price_cents || 0,
          vendor_name: item.vendor_name || 'Unknown Vendor',
          available: true,
          available_quantity: null,
        })))
      } finally {
        setLoading(false)
      }
    }

    validateCart()
  }, [items])

  // Validate market compatibility
  useEffect(() => {
    async function validateMarkets() {
      if (!user) return

      try {
        const res = await fetch('/api/cart/validate')
        if (res.ok) {
          const data = await res.json()
          setMarketWarnings(data.warnings || [])
          setMarketValid(data.valid !== false && (!data.warnings || data.warnings.length === 0))
        }
      } catch (err) {
        console.error('Market validation error:', err)
      }
    }

    if (user && items.length > 0) {
      validateMarkets()
    }
  }, [user, items])

  async function handleCheckout() {
    if (!user) {
      // Redirect to login with return URL
      router.push(`/${vertical}/login?redirect=/${vertical}/checkout`)
      return
    }

    setProcessing(true)
    setError(null)

    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: checkoutItems.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
          })),
          vertical,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Checkout failed')
      }

      if (data.url) {
        // Redirect to Stripe Checkout
        clearCart()
        window.location.href = data.url
      } else if (data.orderId) {
        // Direct success (free order or test mode)
        clearCart()
        router.push(`/${vertical}/checkout/success?order=${data.orderId}`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setProcessing(false)
    }
  }

  // Calculate totals with platform fee
  const total = checkoutItems.reduce((sum, item) => {
    return sum + calculateDisplayPrice(item.price_cents) * item.quantity
  }, 0)

  // Check if all items are available
  const hasUnavailableItems = checkoutItems.some(item => !item.available)

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #333',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 15px',
          }} />
          <p>Loading checkout...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        padding: '24px 16px',
      }}>
        <div style={{
          maxWidth: 600,
          margin: '0 auto',
          textAlign: 'center',
          padding: '60px 20px',
        }}>
          <div style={{ fontSize: 80, marginBottom: 20, opacity: 0.3 }}>🛒</div>
          <h1 style={{ marginBottom: 15, marginTop: 0 }}>Your cart is empty</h1>
          <p style={{ color: '#666', marginBottom: 30 }}>
            Add some items to your cart to checkout
          </p>
          <Link
            href={`/${vertical}/browse`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '15px 30px',
              backgroundColor: '#333',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
              minHeight: 44,
            }}
          >
            Browse Products
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
      }}
      className="checkout-page"
    >
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #eee',
        padding: '16px',
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
        }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: '#666',
              textDecoration: 'none',
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
            }}
          >
            ← Back to Shopping
          </Link>
          <h1 style={{ margin: '8px 0 0 0', fontSize: 24 }}>Checkout</h1>
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px',
      }}>
        <div className="checkout-grid" style={{
          display: 'grid',
          gap: 24,
        }}>
          {/* Cart Items */}
          <div className="cart-items">
            <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>Order Items</h2>

            {error && (
              <div style={{
                padding: 15,
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: 8,
                color: '#721c24',
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {marketWarnings.length > 0 && (
              <div style={{
                padding: 16,
                backgroundColor: '#fef3c7',
                border: '2px solid #f59e0b',
                borderRadius: 8,
                marginBottom: 16,
              }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#92400e' }}>
                  Market Compatibility Issues:
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#92400e' }}>
                  {marketWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {checkoutItems.map(item => (
                <div
                  key={item.listingId}
                  style={{
                    padding: 16,
                    backgroundColor: 'white',
                    borderRadius: 8,
                    border: item.available ? '1px solid #e5e7eb' : '2px solid #dc3545',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>
                        {item.title}
                      </h3>
                      <p style={{ color: '#666', fontSize: 14, margin: '0 0 8px 0' }}>
                        {item.vendor_name}
                      </p>

                      {!item.available && (
                        <div style={{
                          padding: '8px 12px',
                          backgroundColor: '#f8d7da',
                          color: '#721c24',
                          borderRadius: 4,
                          fontSize: 13,
                          marginBottom: 8,
                        }}>
                          {item.available_quantity === 0
                            ? 'Sold out'
                            : `Only ${item.available_quantity} available`
                          }
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, color: '#666' }}>Qty:</span>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <button
                            onClick={() => updateQuantity(item.listingId, item.quantity - 1)}
                            style={{
                              width: 36,
                              height: 36,
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px 0 0 4px',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                              fontSize: 18,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            −
                          </button>
                          <span style={{
                            width: 40,
                            height: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderTop: '1px solid #e5e7eb',
                            borderBottom: '1px solid #e5e7eb',
                            fontSize: 14,
                          }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.listingId, item.quantity + 1)}
                            disabled={item.available_quantity !== null && item.quantity >= item.available_quantity}
                            style={{
                              width: 36,
                              height: 36,
                              border: '1px solid #e5e7eb',
                              borderRadius: '0 4px 4px 0',
                              backgroundColor: 'white',
                              cursor: item.available_quantity !== null && item.quantity >= item.available_quantity ? 'not-allowed' : 'pointer',
                              fontSize: 18,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: item.available_quantity !== null && item.quantity >= item.available_quantity ? 0.5 : 1,
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 18, fontWeight: 'bold', margin: '0 0 4px 0' }}>
                        {formatPrice(calculateDisplayPrice(item.price_cents) * item.quantity)}
                      </p>
                      <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px 0' }}>
                        {formatPrice(calculateDisplayPrice(item.price_cents))} each
                      </p>
                      <button
                        onClick={() => removeFromCart(item.listingId)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'white',
                          color: '#dc3545',
                          border: '1px solid #dc3545',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13,
                          minHeight: 36,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Summary */}
          <div className="order-summary">
            <div style={{
              backgroundColor: 'white',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              padding: 20,
              position: 'sticky',
              top: 20,
            }}>
              <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>Order Summary</h2>

              <div style={{ marginBottom: 16 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  fontSize: 14,
                  color: '#666',
                }}>
                  <span>Items ({checkoutItems.reduce((s, i) => s + i.quantity, 0)})</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: 16,
                  borderTop: '1px solid #f3f4f6',
                  fontSize: 20,
                  fontWeight: 'bold',
                }}>
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              {!user && (
                <div style={{
                  padding: 12,
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffeeba',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 14,
                }}>
                  <strong>Sign in required</strong>
                  <p style={{ margin: '4px 0 0', color: '#856404' }}>
                    You&apos;ll need to sign in to complete your purchase
                  </p>
                </div>
              )}

              {hasUnavailableItems && (
                <div style={{
                  padding: 12,
                  backgroundColor: '#f8d7da',
                  border: '1px solid #f5c6cb',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 14,
                  color: '#721c24',
                }}>
                  Some items in your cart are no longer available. Please remove them to continue.
                </div>
              )}

              <button
                onClick={handleCheckout}
                disabled={processing || hasUnavailableItems || !marketValid}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '14px 20px',
                  fontSize: 16,
                  fontWeight: 600,
                  backgroundColor: processing || hasUnavailableItems || !marketValid ? '#ccc' : '#333',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: processing || hasUnavailableItems || !marketValid ? 'not-allowed' : 'pointer',
                  minHeight: 48,
                }}
              >
                {processing ? 'Processing...' : !marketValid ? 'Fix Market Issues' : user ? 'Pay Now' : 'Sign In to Checkout'}
              </button>

              <p style={{
                fontSize: 12,
                color: '#999',
                textAlign: 'center',
                marginTop: 12,
                marginBottom: 0,
              }}>
                Secure checkout powered by Stripe
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .checkout-page .checkout-grid {
          grid-template-columns: 1fr;
        }
        .checkout-page .order-summary {
          order: -1;
        }
        @media (min-width: 1024px) {
          .checkout-page .checkout-grid {
            grid-template-columns: 1fr 380px;
          }
          .checkout-page .order-summary {
            order: 0;
          }
        }
      `}</style>
    </div>
  )
}
