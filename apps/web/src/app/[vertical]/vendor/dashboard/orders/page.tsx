'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface OrderItem {
  id: string
  order_id: string
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  platform_fee_cents: number
  vendor_payout_cents: number
  status: string
  created_at: string
  order: {
    id: string
    order_number: string
    buyer_user_id: string
    created_at: string
  }
  listing: {
    title: string
    description: string
  }
}

export default function VendorOrdersPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    fetchOrders()

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchOrders, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchOrders() {
    try {
      const response = await fetch('/api/vendor/orders')
      const data = await response.json()

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to fetch orders'
        console.error('Orders fetch error:', errorMessage)
        throw new Error(errorMessage)
      }

      setOrders(data.orderItems || [])
      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load orders'
      setError(errorMessage)
      console.error('Orders error:', errorMessage)
    } finally {
      setLoading(false)
    }
  }

  async function updateOrderStatus(
    orderId: string,
    action: 'confirm' | 'ready' | 'fulfill'
  ) {
    try {
      const response = await fetch(`/api/vendor/orders/${orderId}/${action}`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to update order'
        console.error('Order update error:', errorMessage)
        throw new Error(errorMessage)
      }

      await fetchOrders()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update order status'
      alert(errorMessage)
      console.error('Order status update error:', errorMessage)
    }
  }

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true
    return order.status === activeTab
  })

  const pendingCount = orders.filter(o => o.status === 'pending').length
  const confirmedCount = orders.filter(o => o.status === 'confirmed').length
  const readyCount = orders.filter(o => o.status === 'ready').length
  const fulfilledCount = orders.filter(o => o.status === 'fulfilled').length

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '4px solid #e0e0e0',
            borderTop: '4px solid #333',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 15px'
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
      padding: 40
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30
      }}>
        <div>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}
          >
            ← Vendor Dashboard
          </Link>
          <h1 style={{ marginTop: 10, marginBottom: 5 }}>Orders</h1>
          <p style={{ color: '#666', margin: 0 }}>
            Manage incoming orders from customers
          </p>
        </div>
        <button
          onClick={fetchOrders}
          style={{
            padding: '10px 20px',
            backgroundColor: 'white',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{
          padding: 15,
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: 8,
          color: '#721c24',
          marginBottom: 20
        }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 5,
        marginBottom: 20,
        borderBottom: '1px solid #ddd',
        paddingBottom: 10
      }}>
        <TabButton
          active={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
          label={`All (${orders.length})`}
        />
        <TabButton
          active={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
          label={`Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
          highlight={pendingCount > 0}
        />
        <TabButton
          active={activeTab === 'confirmed'}
          onClick={() => setActiveTab('confirmed')}
          label={`Confirmed${confirmedCount > 0 ? ` (${confirmedCount})` : ''}`}
        />
        <TabButton
          active={activeTab === 'ready'}
          onClick={() => setActiveTab('ready')}
          label={`Ready${readyCount > 0 ? ` (${readyCount})` : ''}`}
        />
        <TabButton
          active={activeTab === 'fulfilled'}
          onClick={() => setActiveTab('fulfilled')}
          label={`Fulfilled${fulfilledCount > 0 ? ` (${fulfilledCount})` : ''}`}
        />
      </div>

      {/* Orders List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {filteredOrders.length === 0 ? (
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            border: '1px solid #ddd',
            padding: 60,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 15 }}>📦</div>
            <p style={{ color: '#666', margin: 0 }}>
              {activeTab === 'all'
                ? 'No orders yet'
                : `No ${activeTab} orders`
              }
            </p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={updateOrderStatus}
            />
          ))
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  highlight
}: {
  active: boolean
  onClick: () => void
  label: string
  highlight?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        backgroundColor: active ? '#333' : 'transparent',
        color: active ? 'white' : highlight ? '#dc3545' : '#666',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        fontWeight: active || highlight ? 600 : 400,
        fontSize: 14
      }}
    >
      {label}
    </button>
  )
}

function OrderCard({
  order,
  onUpdateStatus,
}: {
  order: OrderItem
  onUpdateStatus: (orderId: string, action: 'confirm' | 'ready' | 'fulfill') => void
}) {
  const [updating, setUpdating] = useState(false)

  async function handleAction(action: 'confirm' | 'ready' | 'fulfill') {
    setUpdating(true)
    try {
      await onUpdateStatus(order.id, action)
    } finally {
      setUpdating(false)
    }
  }

  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Pending', color: '#856404', bgColor: '#fff3cd' },
    confirmed: { label: 'Confirmed', color: '#004085', bgColor: '#cce5ff' },
    ready: { label: 'Ready', color: '#6f42c1', bgColor: '#e2d9f3' },
    fulfilled: { label: 'Fulfilled', color: '#155724', bgColor: '#d4edda' },
    cancelled: { label: 'Cancelled', color: '#721c24', bgColor: '#f8d7da' },
    refunded: { label: 'Refunded', color: '#721c24', bgColor: '#f8d7da' },
  }

  const config = statusConfig[order.status] || statusConfig.pending

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      border: '1px solid #ddd',
      padding: 20
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 15
      }}>
        <div>
          <h3 style={{ margin: '0 0 5px 0' }}>{order.listing?.title || 'Unknown Item'}</h3>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Order #{order.order?.order_number || 'N/A'}
          </p>
        </div>
        <span style={{
          padding: '5px 12px',
          backgroundColor: config.bgColor,
          color: config.color,
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600
        }}>
          {config.label}
        </span>
      </div>

      {/* Details */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 15,
        marginBottom: 15,
        padding: '15px 0',
        borderTop: '1px solid #eee',
        borderBottom: '1px solid #eee'
      }}>
        <div>
          <p style={{ color: '#666', fontSize: 12, margin: '0 0 5px 0' }}>Quantity</p>
          <p style={{ fontWeight: 600, margin: 0 }}>{order.quantity}</p>
        </div>
        <div>
          <p style={{ color: '#666', fontSize: 12, margin: '0 0 5px 0' }}>You Receive</p>
          <p style={{ fontWeight: 600, margin: 0, color: '#28a745' }}>
            ${(order.vendor_payout_cents / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <p style={{ color: '#666', fontSize: 12, margin: '0 0 5px 0' }}>Order Date</p>
          <p style={{ fontWeight: 600, margin: 0 }}>
            {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p style={{ color: '#666', fontSize: 12, margin: '0 0 5px 0' }}>Order Time</p>
          <p style={{ fontWeight: 600, margin: 0 }}>
            {new Date(order.created_at).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        {order.status === 'pending' && (
          <button
            onClick={() => handleAction('confirm')}
            disabled={updating}
            style={{
              padding: '10px 20px',
              backgroundColor: updating ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: updating ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            {updating ? 'Updating...' : 'Confirm Order'}
          </button>
        )}

        {order.status === 'confirmed' && (
          <button
            onClick={() => handleAction('ready')}
            disabled={updating}
            style={{
              padding: '10px 20px',
              backgroundColor: updating ? '#ccc' : '#6f42c1',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: updating ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            {updating ? 'Updating...' : 'Mark Ready for Pickup'}
          </button>
        )}

        {order.status === 'ready' && (
          <button
            onClick={() => handleAction('fulfill')}
            disabled={updating}
            style={{
              padding: '10px 20px',
              backgroundColor: updating ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: updating ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}
          >
            {updating ? 'Updating...' : 'Mark Fulfilled'}
          </button>
        )}

        {order.status === 'fulfilled' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            color: '#28a745',
            fontSize: 14
          }}>
            ✓ Order completed - Payout initiated
          </div>
        )}
      </div>
    </div>
  )
}
