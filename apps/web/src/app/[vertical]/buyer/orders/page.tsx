'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatPrice } from '@/lib/constants'

interface Order {
  id: string
  order_number: string
  status: string
  total_cents: number
  created_at: string
  items: Array<{
    id: string
    listing_title: string
    listing_image: string | null
    vendor_name: string
    quantity: number
    subtotal_cents: number
    status: string
    market: {
      id: string
      name: string
      type: string
    } | null
  }>
}

interface Market {
  id: string
  name: string
  type: string
}

export default function BuyerOrdersPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  const [orders, setOrders] = useState<Order[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [marketFilter, setMarketFilter] = useState<string>('')

  useEffect(() => {
    fetchOrders()
  }, [statusFilter, marketFilter])

  async function fetchOrders() {
    try {
      setError(null)
      const queryParams = new URLSearchParams()
      if (statusFilter) queryParams.set('status', statusFilter)
      if (marketFilter) queryParams.set('market', marketFilter)
      const response = await fetch(`/api/buyer/orders?${queryParams.toString()}`)
      if (!response.ok) {
        if (response.status === 401) {
          router.push(`/${vertical}/login?redirect=/${vertical}/buyer/orders`)
          return
        }
        throw new Error('Failed to fetch orders')
      }

      const data = await response.json()
      setOrders(data.orders || [])
      // Only update markets on initial load (no filters) to preserve the full list
      if (!statusFilter && !marketFilter && data.markets) {
        setMarkets(data.markets)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Pending Payment', color: '#856404', bgColor: '#fff3cd' },
    paid: { label: 'Paid', color: '#004085', bgColor: '#cce5ff' },
    confirmed: { label: 'Confirmed', color: '#004085', bgColor: '#cce5ff' },
    ready: { label: 'Ready for Pickup', color: '#6f42c1', bgColor: '#e2d9f3' },
    completed: { label: 'Completed', color: '#155724', bgColor: '#d4edda' },
    fulfilled: { label: 'Picked Up', color: '#155724', bgColor: '#d4edda' }, // For order items
    cancelled: { label: 'Cancelled', color: '#721c24', bgColor: '#f8d7da' },
    refunded: { label: 'Refunded', color: '#721c24', bgColor: '#f8d7da' },
  }

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
          <p>Loading orders...</p>
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
      {/* Header */}
      <div style={{
        maxWidth: 800,
        margin: '0 auto',
        marginBottom: 30,
      }}>
        <Link
          href={`/${vertical}/dashboard`}
          style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}
        >
          ← Back to Dashboard
        </Link>
        <h1 style={{ marginTop: 15, marginBottom: 5 }}>My Orders</h1>
        <p style={{ color: '#666', margin: 0 }}>
          View and track your purchases
        </p>

        {/* Filters */}
        <div style={{ marginTop: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
              Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                backgroundColor: 'white'
              }}
            >
              <option value="">All Orders</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="confirmed">Confirmed</option>
              <option value="ready">Ready for Pickup</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {markets.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                Market:
              </label>
              <select
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  backgroundColor: 'white'
                }}
              >
                <option value="">All Markets</option>
                {markets.map(market => (
                  <option key={market.id} value={market.id}>
                    {market.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          maxWidth: 800,
          margin: '0 auto 20px',
          padding: 15,
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: 8,
          color: '#721c24',
        }}>
          {error}
        </div>
      )}

      {/* Orders List */}
      <div style={{
        maxWidth: 800,
        margin: '0 auto',
      }}>
        {orders.length === 0 ? (
          <>
            {/* Empty state message */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: 8,
              border: '1px dashed #d1d5db',
              padding: 60,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 60, marginBottom: 20, opacity: 0.3 }}>📦</div>
              <h3 style={{ marginBottom: 10, color: '#666' }}>
                {statusFilter || marketFilter ? 'No matching orders' : 'No orders yet'}
              </h3>
              <p style={{ color: '#999', marginBottom: 0 }}>
                {statusFilter || marketFilter
                  ? 'Try adjusting your filters to see more orders'
                  : 'Start shopping to see your orders here'
                }
              </p>
            </div>

            {/* Browse button - only show when no filters */}
            {!statusFilter && !marketFilter && (
              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <Link
                  href={`/${vertical}/browse`}
                  style={{
                    display: 'inline-block',
                    padding: '12px 25px',
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
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {orders.map(order => {
              const config = statusConfig[order.status] || statusConfig.pending

              return (
                <div
                  key={order.id}
                  onClick={() => router.push(`/${vertical}/buyer/orders/${order.id}`)}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {/* Order Header */}
                  <div style={{
                    padding: '20px 25px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#fafafa',
                  }}>
                    <div>
                      <p style={{ color: '#666', fontSize: 13, margin: '0 0 3px 0' }}>
                        Order #{order.order_number}
                      </p>
                      <p style={{ color: '#999', fontSize: 12, margin: 0 }}>
                        {new Date(order.created_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                      <span style={{
                        padding: '5px 12px',
                        backgroundColor: config.bgColor,
                        color: config.color,
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {config.label}
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 'bold' }}>
                        {formatPrice(order.total_cents)}
                      </span>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div style={{ padding: '20px 25px' }}>
                    {order.items && order.items.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {order.items.map((item, index) => {
                          const itemConfig = statusConfig[item.status] || statusConfig.pending

                          return (
                            <div
                              key={item.id || index}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 15px',
                                backgroundColor: '#f8f9fa',
                                borderRadius: 6,
                              }}
                            >
                              <div>
                                <p style={{ margin: 0, fontWeight: 500 }}>
                                  {item.listing_title}
                                </p>
                                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#666' }}>
                                  {item.vendor_name} • Qty: {item.quantity}
                                  {item.market && ` • ${item.market.name}`}
                                </p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: '0 0 3px 0', fontWeight: 600 }}>
                                  {formatPrice(item.subtotal_cents)}
                                </p>
                                <span style={{
                                  padding: '2px 8px',
                                  backgroundColor: itemConfig.bgColor,
                                  color: itemConfig.color,
                                  borderRadius: 10,
                                  fontSize: 11,
                                  fontWeight: 500,
                                }}>
                                  {itemConfig.label}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p style={{ color: '#999', margin: 0, fontStyle: 'italic' }}>
                        No item details available
                      </p>
                    )}
                  </div>

                  {/* Order Actions */}
                  {(order.status === 'ready' || order.status === 'confirmed') && (
                    <div style={{
                      padding: '15px 25px',
                      borderTop: '1px solid #eee',
                      backgroundColor: '#f0f8ff',
                    }}>
                      <p style={{
                        margin: 0,
                        fontSize: 14,
                        color: '#004085',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <span style={{ fontSize: 18 }}>📍</span>
                        {order.status === 'ready'
                          ? 'Your order is ready for pickup!'
                          : 'Your order has been confirmed by the vendor'
                        }
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
