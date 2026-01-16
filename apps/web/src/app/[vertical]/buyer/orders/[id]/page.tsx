'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import OrderStatusSummary from '@/components/buyer/OrderStatusSummary'
import OrderTimeline from '@/components/buyer/OrderTimeline'
import PickupDetails from '@/components/buyer/PickupDetails'
import { formatPrice } from '@/lib/constants'

interface Market {
  id: string
  name: string
  type: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  contact_email: string | null
  contact_phone: string | null
  schedules: {
    day_of_week: number
    start_time: string
    end_time: string
  }[]
}

interface OrderItem {
  id: string
  listing_id: string
  listing_title: string
  listing_description: string
  listing_image: string | null
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  status: string
  vendor_name: string
  vendor_email: string | null
  vendor_phone: string | null
  market: Market
  pickup_date: string | null
  buyer_confirmed_at: string | null
  vendor_confirmed_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  refund_amount_cents: number | null
}

interface OrderDetail {
  id: string
  order_number: string
  status: string
  total_cents: number
  created_at: string
  updated_at: string
  items: OrderItem[]
}

export default function BuyerOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const orderId = params.id as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null)
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null)

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/buyer/orders/${orderId}`)
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/${vertical}/login?redirect=/${vertical}/buyer/orders/${orderId}`)
          return
        }
        throw new Error('Order not found')
      }
      const data = await res.json()
      setOrder(data.order)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmPickup = async (itemId: string) => {
    if (!confirm('Confirm you have received this item? This cannot be undone.')) {
      return
    }

    setConfirmingItemId(itemId)
    try {
      const res = await fetch(`/api/buyer/orders/${itemId}/confirm`, {
        method: 'POST'
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to confirm pickup')
      }

      // Refresh order to get updated status
      fetchOrder()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to confirm pickup')
    } finally {
      setConfirmingItemId(null)
    }
  }

  const handleCancelItem = async (itemId: string) => {
    const reason = prompt('Why do you want to cancel this item? (optional)')
    if (reason === null) {
      // User clicked Cancel on prompt
      return
    }

    if (!confirm('Are you sure you want to cancel this item? You will receive a refund.')) {
      return
    }

    setCancellingItemId(itemId)
    try {
      const res = await fetch(`/api/buyer/orders/${itemId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to cancel item')
      }

      // Refresh order to get updated status
      fetchOrder()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel item')
    } finally {
      setCancellingItemId(null)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <p>Loading order details...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        gap: 16
      }}>
        <p style={{ color: '#991b1b' }}>{error || 'Order not found'}</p>
        <Link
          href={`/${vertical}/buyer/orders`}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600
          }}
        >
          Back to Orders
        </Link>
      </div>
    )
  }

  // Group items by market
  const marketGroups = order.items.reduce((acc, item) => {
    const marketId = item.market.id
    if (!acc[marketId]) {
      acc[marketId] = {
        market: item.market,
        items: [],
        pickupDate: item.pickup_date
      }
    }
    acc[marketId].items.push(item)
    return acc
  }, {} as Record<string, { market: Market; items: OrderItem[]; pickupDate: string | null }>)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Back Link */}
        <Link
          href={`/${vertical}/buyer/orders`}
          style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}
        >
          ← Back to Orders
        </Link>

        {/* Header with Prominent Order Number */}
        <div style={{ marginTop: 16, marginBottom: 24 }}>
          {/* Large Order Number Box */}
          <div style={{
            backgroundColor: '#111827',
            color: 'white',
            padding: '16px 24px',
            borderRadius: 8,
            marginBottom: 16,
            display: 'inline-block'
          }}>
            <p style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7 }}>
              Order Number
            </p>
            <p style={{
              margin: '4px 0 0 0',
              fontSize: 32,
              fontWeight: 'bold',
              fontFamily: 'monospace',
              letterSpacing: 2
            }}>
              {order.order_number || order.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <p style={{ color: '#6b7280', margin: 0 }}>
            Placed on {new Date(order.created_at).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>

        {/* Status Summary */}
        <OrderStatusSummary status={order.status} updatedAt={order.updated_at} />

        {/* Timeline */}
        <OrderTimeline
          status={order.status}
          createdAt={order.created_at}
          updatedAt={order.updated_at}
        />

        {/* Items by Market */}
        {Object.values(marketGroups).map((group) => (
          <div key={group.market.id} style={{ marginBottom: 24 }}>
            {/* Pickup Details */}
            <PickupDetails
              market={group.market}
              pickupDate={group.pickupDate}
            />

            {/* Items for this Market */}
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0, color: '#374151' }}>
                Items from {group.market.name}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {group.items.map(item => (
                  <div key={item.id} style={{
                    display: 'flex',
                    gap: 16,
                    paddingBottom: 16,
                    borderBottom: '1px solid #f3f4f6'
                  }}>
                    {/* Image */}
                    <div style={{
                      width: 80,
                      height: 80,
                      backgroundColor: '#f3f4f6',
                      borderRadius: 6,
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      {item.listing_image ? (
                        <img
                          src={item.listing_image}
                          alt={item.listing_title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 32
                        }}>
                          📦
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 600, color: '#111827' }}>
                        {item.listing_title}
                      </h4>
                      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#6b7280' }}>
                        by {item.vendor_name}
                      </p>
                      <p style={{ margin: '0 0 12px 0', fontSize: 14, color: '#374151' }}>
                        Quantity: {item.quantity} × {formatPrice(item.unit_price_cents)} = <strong>{formatPrice(item.subtotal_cents)}</strong>
                      </p>

                      {/* Item Status & Confirmation */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap'
                      }}>
                        {/* Status Badge */}
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor:
                            item.status === 'cancelled' ? '#fee2e2' :
                            item.status === 'fulfilled' ? '#d1fae5' :
                            item.status === 'ready' ? '#dbeafe' :
                            item.status === 'confirmed' ? '#fef3c7' :
                            '#f3f4f6',
                          color:
                            item.status === 'cancelled' ? '#991b1b' :
                            item.status === 'fulfilled' ? '#065f46' :
                            item.status === 'ready' ? '#1e40af' :
                            item.status === 'confirmed' ? '#92400e' :
                            '#374151'
                        }}>
                          {item.status === 'cancelled' ? 'Cancelled' :
                           item.status === 'fulfilled' ? 'Picked Up' :
                           item.status === 'ready' ? 'Ready for Pickup' :
                           item.status === 'confirmed' ? 'Preparing' :
                           item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </span>

                        {/* Cancellation Info */}
                        {item.cancelled_at && (
                          <div style={{
                            padding: '8px 12px',
                            backgroundColor: '#fef2f2',
                            borderRadius: 6,
                            fontSize: 12,
                            color: '#991b1b',
                            width: '100%'
                          }}>
                            <p style={{ margin: 0, fontWeight: 600 }}>
                              {item.cancelled_by === 'vendor' ? 'Cancelled by vendor' : 'You cancelled this item'}
                            </p>
                            {item.cancellation_reason && (
                              <p style={{ margin: '4px 0 0 0' }}>
                                Reason: {item.cancellation_reason}
                              </p>
                            )}
                            {item.refund_amount_cents && (
                              <p style={{ margin: '4px 0 0 0', fontWeight: 500 }}>
                                Refund: {formatPrice(item.refund_amount_cents)}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Buyer Confirmed Badge */}
                        {item.buyer_confirmed_at && !item.cancelled_at && (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: '#d1fae5',
                            color: '#065f46',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            <span>✓</span> You confirmed receipt
                          </span>
                        )}

                        {/* Confirm Button - show when ready/fulfilled and not yet confirmed */}
                        {['ready', 'fulfilled'].includes(item.status) && !item.buyer_confirmed_at && !item.cancelled_at && (
                          <button
                            onClick={() => handleConfirmPickup(item.id)}
                            disabled={confirmingItemId === item.id}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: confirmingItemId === item.id ? '#9ca3af' : '#059669',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: confirmingItemId === item.id ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            {confirmingItemId === item.id ? (
                              'Confirming...'
                            ) : (
                              <>
                                <span>✓</span> Confirm Receipt
                              </>
                            )}
                          </button>
                        )}

                        {/* Cancel Button - show when pending/paid (before vendor confirms) */}
                        {['pending', 'paid'].includes(item.status) && !item.cancelled_at && (
                          <button
                            onClick={() => handleCancelItem(item.id)}
                            disabled={cancellingItemId === item.id}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: cancellingItemId === item.id ? '#9ca3af' : '#dc2626',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: cancellingItemId === item.id ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            {cancellingItemId === item.id ? 'Cancelling...' : 'Cancel Item'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Order Total */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>
            Order Total
          </span>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
            {formatPrice(order.total_cents)}
          </span>
        </div>
      </div>
    </div>
  )
}
