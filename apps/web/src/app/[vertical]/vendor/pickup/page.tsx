'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface OrderItem {
  id: string
  listing_title: string
  listing_image: string | null
  quantity: number
  subtotal_cents: number
  status: string
  buyer_confirmed_at: string | null
}

interface Order {
  id: string
  order_number: string
  customer_name: string
  items: OrderItem[]
  created_at: string
}

interface Market {
  id: string
  name: string
  isHomeMarket?: boolean
  canUse?: boolean
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function VendorPickupPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [orders, setOrders] = useState<Order[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [selectedMarket, setSelectedMarket] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [processingItem, setProcessingItem] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (vertical) {
      fetchMarkets()
    }
  }, [vertical])

  useEffect(() => {
    if (selectedMarket) {
      fetchOrders()
    }
  }, [selectedMarket])

  const fetchMarkets = async () => {
    try {
      const res = await fetch(`/api/vendor/markets?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        // Filter fixed markets to only include those the vendor can use (respects home market restriction)
        const usableFixedMarkets = (data.fixedMarkets || []).filter((m: any) => m.canUse !== false)
        const allMarkets = [
          ...usableFixedMarkets,
          ...(data.privatePickupMarkets || [])
        ]
        setMarkets(allMarkets.map((m: any) => ({
          id: m.id,
          name: m.name,
          isHomeMarket: m.isHomeMarket || false,
          canUse: m.canUse !== false
        })))
        // Auto-select home market if available, otherwise first market
        const homeMarket = allMarkets.find((m: any) => m.isHomeMarket)
        if (homeMarket) {
          setSelectedMarket(homeMarket.id)
        } else if (allMarkets.length > 0) {
          setSelectedMarket(allMarkets[0].id)
        }
      }
    } catch (error) {
      console.error('Error fetching markets:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchOrders = async () => {
    if (!selectedMarket) return

    try {
      // Fetch orders that are ready or confirmed for this market
      const params = new URLSearchParams()
      params.set('market_id', selectedMarket)
      params.set('status', 'ready') // Focus on ready-for-pickup items

      const res = await fetch(`/api/vendor/orders?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  const handleFulfillItem = async (itemId: string) => {
    setProcessingItem(itemId)
    try {
      const res = await fetch(`/api/vendor/orders/${itemId}/fulfill`, {
        method: 'POST'
      })
      if (res.ok) {
        // Refresh orders
        fetchOrders()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to fulfill item')
      }
    } catch (error) {
      console.error('Error fulfilling item:', error)
      alert('An error occurred')
    } finally {
      setProcessingItem(null)
    }
  }

  // Filter orders by search query (order number or customer name)
  const filteredOrders = orders.filter(order => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase().trim()
    return (
      order.order_number.toLowerCase().includes(query) ||
      order.customer_name.toLowerCase().includes(query)
    )
  })

  // Get count of ready items
  const readyItemsCount = orders.reduce(
    (count, order) => count + order.items.filter(item => item.status === 'ready').length,
    0
  )

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa'
    }}>
      {/* Fixed Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        backgroundColor: '#111827',
        color: 'white',
        padding: '12px 16px',
        zIndex: 100
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12
        }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Pickup Mode
          </h1>
          <Link
            href={`/${vertical}/vendor/orders`}
            style={{
              color: 'white',
              textDecoration: 'none',
              fontSize: 14,
              opacity: 0.8
            }}
          >
            Full Orders View
          </Link>
        </div>

        {/* Market Selector */}
        <select
          value={selectedMarket}
          onChange={(e) => setSelectedMarket(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 16,
            border: 'none',
            borderRadius: 6,
            backgroundColor: '#374151',
            color: 'white',
            marginBottom: 12
          }}
        >
          <option value="">Select a market...</option>
          {markets.map(market => (
            <option key={market.id} value={market.id}>
              {market.isHomeMarket ? '🏠 ' : ''}{market.name}
            </option>
          ))}
        </select>

        {/* Search Bar */}
        <div style={{ position: 'relative' }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by order # or customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 44px 12px 16px',
              fontSize: 16,
              border: 'none',
              borderRadius: 8,
              backgroundColor: 'white',
              color: '#111827',
              boxSizing: 'border-box'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                searchInputRef.current?.focus()
              }}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                fontSize: 18,
                color: '#9ca3af',
                cursor: 'pointer',
                padding: 4
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {selectedMarket && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: readyItemsCount > 0 ? '#dcfce7' : '#f3f4f6',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <p style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: readyItemsCount > 0 ? '#166534' : '#6b7280'
          }}>
            {readyItemsCount > 0
              ? `${readyItemsCount} item${readyItemsCount !== 1 ? 's' : ''} ready for pickup`
              : 'No items ready for pickup'}
          </p>
        </div>
      )}

      {/* Orders List */}
      <div style={{ padding: 16 }}>
        {!selectedMarket ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            backgroundColor: 'white',
            borderRadius: 8,
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Select a market to view pickup orders
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            backgroundColor: 'white',
            borderRadius: 8,
            border: '1px solid #e5e7eb'
          }}>
            <p style={{ color: '#6b7280', margin: 0 }}>
              {searchQuery
                ? 'No orders match your search'
                : 'No orders ready for pickup at this market'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredOrders.map(order => (
              <div
                key={order.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden'
                }}
              >
                {/* Order Header with Prominent Number */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  backgroundColor: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  {/* Large Order Number */}
                  <div style={{
                    backgroundColor: '#111827',
                    color: 'white',
                    padding: '12px 18px',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flexShrink: 0
                  }}>
                    <span style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      opacity: 0.7
                    }}>
                      Order
                    </span>
                    <span style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                      letterSpacing: 2
                    }}>
                      {order.order_number || order.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#111827'
                    }}>
                      {order.customer_name}
                    </p>
                    <p style={{
                      margin: '4px 0 0 0',
                      fontSize: 13,
                      color: '#6b7280'
                    }}>
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Order Items */}
                <div style={{ padding: 12 }}>
                  {order.items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 0',
                        borderBottom: '1px solid #f3f4f6',
                        gap: 12
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <p style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: 500,
                          color: '#111827'
                        }}>
                          {item.listing_title}
                        </p>
                        <p style={{
                          margin: '4px 0 0 0',
                          fontSize: 13,
                          color: '#6b7280'
                        }}>
                          Qty: {item.quantity} • {formatPrice(item.subtotal_cents)}
                        </p>
                        {item.buyer_confirmed_at && (
                          <p style={{
                            margin: '6px 0 0 0',
                            fontSize: 12,
                            color: '#059669',
                            fontWeight: 500
                          }}>
                            Buyer confirmed receipt
                          </p>
                        )}
                      </div>

                      {/* Status/Action */}
                      {item.status === 'ready' ? (
                        <button
                          onClick={() => handleFulfillItem(item.id)}
                          disabled={processingItem === item.id}
                          style={{
                            padding: '12px 20px',
                            backgroundColor: processingItem === item.id ? '#9ca3af' : '#059669',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: processingItem === item.id ? 'not-allowed' : 'pointer',
                            minWidth: 100,
                            minHeight: 44
                          }}
                        >
                          {processingItem === item.id ? '...' : 'Fulfill'}
                        </button>
                      ) : item.status === 'fulfilled' ? (
                        <span style={{
                          padding: '8px 14px',
                          backgroundColor: '#d1fae5',
                          color: '#065f46',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600
                        }}>
                          Fulfilled
                        </span>
                      ) : (
                        <span style={{
                          padding: '8px 14px',
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600
                        }}>
                          {item.status === 'confirmed' ? 'Preparing' : item.status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions Footer - jumps to search bar (helpful when scrolled down on mobile) */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 16px',
        backgroundColor: 'white',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
      }}>
        <button
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
            setTimeout(() => searchInputRef.current?.focus(), 300)
          }}
          style={{
            width: '100%',
            padding: '14px 20px',
            backgroundColor: '#111827',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <span style={{ fontSize: 18 }}>🔍</span>
          Search Orders
        </button>
      </div>

      {/* Bottom padding to account for fixed footer */}
      <div style={{ height: 80 }} />
    </div>
  )
}
