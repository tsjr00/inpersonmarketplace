'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/lib/hooks/useCart'

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

  async function handleCheckout() {
    if (!user) {
      // Redirect to login with return URL
      router.push(`/${vertical}/login?redirect=/${vertical}/checkout`)
      return
    }

    setProcessing(true)
    setError(null)

    try {
      const response = await fetch('/api/checkout', {
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

  // Calculate totals
  const subtotal = checkoutItems.reduce((sum, item) => {
    return sum + (item.price_cents * item.quantity)
  }, 0)
  const buyerFee = Math.round(subtotal * 0.065)
  const total = subtotal + buyerFee

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
        padding: 40,
      }}>
        <div style={{
          maxWidth: 600,
          margin: '0 auto',
          textAlign: 'center',
          padding: '80px 20px',
        }}>
          <div style={{ fontSize: 80, marginBottom: 20, opacity: 0.3 }}>🛒</div>
          <h1 style={{ marginBottom: 15 }}>Your cart is empty</h1>
          <p style={{ color: '#666', marginBottom: 30 }}>
            Add some items to your cart to checkout
          </p>
          <Link
            href={`/${vertical}/browse`}
            style={{
              display: 'inline-block',
              padding: '15px 30px',
              backgroundColor: '#333',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            Browse Products
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #eee',
        padding: '20px 40px',
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: '#666',
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            ← Back to Shopping
          </Link>
          <h1 style={{ margin: 0, fontSize: 24 }}>Checkout</h1>
          <div style={{ width: 100 }} />
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: 40,
        display: 'grid',
        gridTemplateColumns: '1fr 400px',
        gap: 40,
      }}>
        {/* Left: Cart Items */}
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 20 }}>Order Items</h2>

          {error && (
            <div style={{
              padding: 15,
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: 8,
              color: '#721c24',
              marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {checkoutItems.map(item => (
              <div
                key={item.listingId}
                style={{
                  padding: 20,
                  backgroundColor: 'white',
                  borderRadius: 8,
                  border: item.available ? '1px solid #ddd' : '2px solid #dc3545',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 5px 0', fontSize: 18 }}>
                      {item.title}
                    </h3>
                    <p style={{ color: '#666', fontSize: 14, margin: '0 0 10px 0' }}>
                      {item.vendor_name}
                    </p>

                    {!item.available && (
                      <div style={{
                        padding: '8px 12px',
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        borderRadius: 4,
                        fontSize: 13,
                        marginBottom: 10,
                      }}>
                        {item.available_quantity === 0
                          ? 'Sold out'
                          : `Only ${item.available_quantity} available`
                        }
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 14, color: '#666' }}>Qty:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button
                          onClick={() => updateQuantity(item.listingId, item.quantity - 1)}
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
                        <span style={{ width: 32, textAlign: 'center', fontSize: 14 }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.listingId, item.quantity + 1)}
                          disabled={item.available_quantity !== null && item.quantity >= item.available_quantity}
                          style={{
                            width: 28,
                            height: 28,
                            border: '1px solid #ddd',
                            borderRadius: 4,
                            backgroundColor: 'white',
                            cursor: item.available_quantity !== null && item.quantity >= item.available_quantity ? 'not-allowed' : 'pointer',
                            fontSize: 16,
                            opacity: item.available_quantity !== null && item.quantity >= item.available_quantity ? 0.5 : 1,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 18, fontWeight: 'bold', margin: '0 0 5px 0' }}>
                      ${((item.price_cents * item.quantity * 1.065) / 100).toFixed(2)}
                    </p>
                    <p style={{ fontSize: 13, color: '#666', margin: '0 0 10px 0' }}>
                      ${((item.price_cents * 1.065) / 100).toFixed(2)} each
                    </p>
                    <button
                      onClick={() => removeFromCart(item.listingId)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: 'white',
                        color: '#dc3545',
                        border: '1px solid #dc3545',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 13,
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

        {/* Right: Order Summary */}
        <div>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            border: '1px solid #ddd',
            padding: 25,
            position: 'sticky',
            top: 20,
          }}>
            <h2 style={{ marginTop: 0, marginBottom: 20 }}>Order Summary</h2>

            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 10,
                fontSize: 14,
                color: '#666',
              }}>
                <span>Subtotal ({checkoutItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                <span>${(subtotal / 100).toFixed(2)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 10,
                fontSize: 14,
                color: '#666',
              }}>
                <span>Platform Fee (6.5%)</span>
                <span>${(buyerFee / 100).toFixed(2)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: 15,
                borderTop: '1px solid #eee',
                fontSize: 20,
                fontWeight: 'bold',
              }}>
                <span>Total</span>
                <span>${(total / 100).toFixed(2)}</span>
              </div>
            </div>

            {!user && (
              <div style={{
                padding: 15,
                backgroundColor: '#fff3cd',
                border: '1px solid #ffeeba',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 14,
              }}>
                <strong>Sign in required</strong>
                <p style={{ margin: '5px 0 0', color: '#856404' }}>
                  You&apos;ll need to sign in to complete your purchase
                </p>
              </div>
            )}

            {hasUnavailableItems && (
              <div style={{
                padding: 15,
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 14,
                color: '#721c24',
              }}>
                Some items in your cart are no longer available. Please remove them to continue.
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={processing || hasUnavailableItems}
              style={{
                width: '100%',
                padding: '15px 20px',
                fontSize: 16,
                fontWeight: 600,
                backgroundColor: processing || hasUnavailableItems ? '#ccc' : '#333',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: processing || hasUnavailableItems ? 'not-allowed' : 'pointer',
              }}
            >
              {processing ? 'Processing...' : user ? 'Pay Now' : 'Sign In to Checkout'}
            </button>

            <p style={{
              fontSize: 12,
              color: '#999',
              textAlign: 'center',
              marginTop: 15,
              marginBottom: 0,
            }}>
              Secure checkout powered by Stripe
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
