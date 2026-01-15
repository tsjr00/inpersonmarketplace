'use client'

import OrderStatusBadge from './OrderStatusBadge'

interface OrderItem {
  id: string
  listing_id: string
  listing_title: string
  listing_image: string | null
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  status: string
  market_name: string
  market_type: string
  market_address?: string
  market_city?: string
  pickup_date?: string
}

interface OrderCardProps {
  order: {
    id: string
    order_number: string
    order_status: string
    customer_name: string
    total_cents: number
    created_at: string
    items: OrderItem[]
  }
  onConfirmItem?: (itemId: string) => void
  onReadyItem?: (itemId: string) => void
  onFulfillItem?: (itemId: string) => void
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function OrderCard({ order, onConfirmItem, onReadyItem, onFulfillItem }: OrderCardProps) {
  const orderDate = new Date(order.created_at).toLocaleDateString()
  const orderTime = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Get unique markets for this order
  const markets = [...new Set(order.items.map(item => item.market_name))]

  // Calculate vendor's subtotal for this order
  const vendorSubtotal = order.items.reduce((sum, item) => sum + item.subtotal_cents, 0)

  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: 20,
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
              Order #{order.order_number}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {orderDate} at {orderTime} - Customer: {order.customer_name}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
            {formatPrice(vendorSubtotal)}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Your items</div>
        </div>
      </div>

      {/* Markets */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 4, marginTop: 0 }}>
          Pickup Location{markets.length > 1 ? 's' : ''}:
        </p>
        {markets.map((market, idx) => (
          <span key={idx} style={{
            display: 'inline-block',
            padding: '4px 10px',
            backgroundColor: '#f3f4f6',
            borderRadius: 6,
            fontSize: 13,
            marginRight: 8,
            marginBottom: 4
          }}>
            {market}
          </span>
        ))}
      </div>

      {/* Items */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8, marginTop: 0 }}>
          Your Items ({order.items.length}):
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {order.items.map(item => (
            <div key={item.id} style={{
              padding: 12,
              backgroundColor: '#f9fafb',
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}>
              <div style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}>
                {/* Image */}
                <div style={{
                  width: 60,
                  height: 60,
                  backgroundColor: '#e5e7eb',
                  borderRadius: 6,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}>
                  {item.listing_image ? (
                    <img
                      src={item.listing_image}
                      alt={item.listing_title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: 24 }}>📦</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                        {item.listing_title}
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#6b7280' }}>
                        Qty: {item.quantity} x {formatPrice(item.unit_price_cents)} = {formatPrice(item.subtotal_cents)}
                      </p>
                    </div>
                    <OrderStatusBadge status={item.status} />
                  </div>

                  {/* Item Actions */}
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {item.status === 'pending' && onConfirmItem && (
                      <button
                        onClick={() => onConfirmItem(item.id)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          minHeight: 36
                        }}
                      >
                        Confirm
                      </button>
                    )}

                    {item.status === 'confirmed' && onReadyItem && (
                      <button
                        onClick={() => onReadyItem(item.id)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          minHeight: 36
                        }}
                      >
                        Mark Ready
                      </button>
                    )}

                    {item.status === 'ready' && onFulfillItem && (
                      <button
                        onClick={() => onFulfillItem(item.id)}
                        style={{
                          padding: '6px 14px',
                          backgroundColor: '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          minHeight: 36
                        }}
                      >
                        Mark Fulfilled
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
