'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface OrderDetails {
  id: string
  order_number: string
  status: string
  total_amount_cents: number
  created_at: string
  items: Array<{
    title: string
    quantity: number
    subtotal_cents: number
    vendor_name: string
  }>
}

export default function CheckoutSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const orderId = searchParams.get('order')
  const sessionId = searchParams.get('session_id')

  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOrder() {
      try {
        // Try to get order details
        let url = '/api/buyer/orders'
        if (orderId) {
          url = `/api/buyer/orders/${orderId}`
        } else if (sessionId) {
          url = `/api/buyer/orders?session_id=${sessionId}`
        }

        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          setOrder(data.order || data)
        }
      } catch (err) {
        console.error('Failed to fetch order:', err)
        setError('Could not load order details')
      } finally {
        setLoading(false)
      }
    }

    if (orderId || sessionId) {
      fetchOrder()
    } else {
      setLoading(false)
    }
  }, [orderId, sessionId])

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
          <p>Loading order details...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      padding: 40,
    }}>
      <div style={{
        maxWidth: 600,
        margin: '0 auto',
      }}>
        {/* Success Banner */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #ddd',
          padding: 40,
          textAlign: 'center',
          marginBottom: 30,
        }}>
          <div style={{
            width: 80,
            height: 80,
            backgroundColor: '#d4edda',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: 40,
          }}>
            ✓
          </div>

          <h1 style={{ margin: '0 0 10px 0', fontSize: 28 }}>
            Order Confirmed!
          </h1>
          <p style={{ color: '#666', marginBottom: 0 }}>
            Thank you for your purchase. Your order has been placed successfully.
          </p>
        </div>

        {/* Order Details */}
        {order && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            border: '1px solid #ddd',
            padding: 25,
            marginBottom: 30,
          }}>
            <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 20 }}>
              Order Details
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 15,
              marginBottom: 20,
              padding: 15,
              backgroundColor: '#f8f9fa',
              borderRadius: 6,
            }}>
              <div>
                <p style={{ color: '#666', fontSize: 12, margin: '0 0 3px 0' }}>Order Number</p>
                <p style={{ fontWeight: 600, margin: 0 }}>{order.order_number}</p>
              </div>
              <div>
                <p style={{ color: '#666', fontSize: 12, margin: '0 0 3px 0' }}>Date</p>
                <p style={{ fontWeight: 600, margin: 0 }}>
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p style={{ color: '#666', fontSize: 12, margin: '0 0 3px 0' }}>Status</p>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  backgroundColor: order.status === 'paid' ? '#d4edda' : '#fff3cd',
                  color: order.status === 'paid' ? '#155724' : '#856404',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {order.status === 'paid' ? 'Paid' : order.status}
                </span>
              </div>
              <div>
                <p style={{ color: '#666', fontSize: 12, margin: '0 0 3px 0' }}>Total</p>
                <p style={{ fontWeight: 600, margin: 0, fontSize: 18, color: '#28a745' }}>
                  ${(order.total_amount_cents / 100).toFixed(2)}
                </p>
              </div>
            </div>

            {order.items && order.items.length > 0 && (
              <>
                <h3 style={{ fontSize: 16, marginBottom: 15 }}>Items</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {order.items.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '12px 15px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: 6,
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 500 }}>{item.title}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 13, color: '#666' }}>
                          {item.vendor_name} • Qty: {item.quantity}
                        </p>
                      </div>
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        ${(item.subtotal_cents / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div style={{
            padding: 15,
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeeba',
            borderRadius: 8,
            color: '#856404',
            marginBottom: 30,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Next Steps */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #ddd',
          padding: 25,
          marginBottom: 30,
        }}>
          <h2 style={{ marginTop: 0, marginBottom: 15, fontSize: 20 }}>
            What&apos;s Next?
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#666', lineHeight: 1.8 }}>
            <li>You&apos;ll receive a confirmation email with your order details</li>
            <li>The vendor will be notified of your order</li>
            <li>Pick up your items at the designated market location</li>
            <li>Track your order status in your dashboard</li>
          </ul>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 15,
          justifyContent: 'center',
        }}>
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{
              padding: '15px 30px',
              backgroundColor: '#333',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
            }}
          >
            View My Orders
          </Link>
          <Link
            href={`/${vertical}/browse`}
            style={{
              padding: '15px 30px',
              backgroundColor: 'white',
              color: '#333',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
              border: '2px solid #333',
            }}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
