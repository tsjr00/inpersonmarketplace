'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Toast, { type ToastType } from '@/components/shared/Toast'

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
  customer_name: string
  buyer_confirmed_at: string | null
  vendor_confirmed_at: string | null
  issue_reported_at: string | null
  issue_reported_by: string | null
  issue_description: string | null
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
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)

  // Use ref to track interval so we can clear/restart it
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Memoized fetch function to prevent unnecessary re-renders
  const fetchOrdersCallback = useCallback(async () => {
    try {
      const response = await fetch(`/api/vendor/orders?vertical=${vertical}`)
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
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrdersCallback()
    fetchStripeStatus()

    // Start polling
    const startPolling = () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = setInterval(fetchOrdersCallback, 30000)
    }

    // Stop polling when tab is not visible to save resources
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else {
        // Tab became visible - fetch immediately and restart polling
        fetchOrdersCallback()
        startPolling()
      }
    }

    // Initial polling start
    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchOrdersCallback])

  async function fetchStripeStatus() {
    try {
      const response = await fetch('/api/vendor/profile')
      if (response.ok) {
        const data = await response.json()
        setStripeConnected(!!data.profile?.stripe_account_id)
      }
    } catch (err) {
      console.error('Error fetching Stripe status:', err)
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

        // If Stripe not connected, refresh status and show prominent error
        if (data.code === 'STRIPE_NOT_CONNECTED') {
          setStripeConnected(false)
          setError('You must complete Stripe setup before confirming orders. Click the link above to set up your account.')
          return
        }

        throw new Error(errorMessage)
      }

      await fetchOrdersCallback()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update order status'
      setToast({ message: errorMessage, type: 'error' })
      console.error('Order status update error:', errorMessage)
    }
  }

  const activeStatuses = ['pending', 'confirmed', 'ready']
  const historyStatuses = ['fulfilled', 'cancelled', 'refunded']

  const viewOrders = orders.filter(order =>
    viewMode === 'active'
      ? activeStatuses.includes(order.status)
      : historyStatuses.includes(order.status)
  )

  const filteredOrders = viewOrders.filter(order => {
    if (activeTab === 'all') return true
    return order.status === activeTab
  })

  const pendingCount = viewOrders.filter(o => o.status === 'pending').length
  const confirmedCount = viewOrders.filter(o => o.status === 'confirmed').length
  const readyCount = viewOrders.filter(o => o.status === 'ready').length
  const fulfilledCount = viewOrders.filter(o => o.status === 'fulfilled').length
  const cancelledCount = viewOrders.filter(o => o.status === 'cancelled').length

  const totalActive = orders.filter(o => activeStatuses.includes(o.status)).length
  const totalHistory = orders.filter(o => historyStatuses.includes(o.status)).length

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
          onClick={fetchOrdersCallback}
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

      {/* Stripe Setup Warning - show if orders exist but Stripe not connected */}
      {stripeConnected === false && orders.length > 0 && (
        <div style={{
          padding: 16,
          backgroundColor: '#fef2f2',
          border: '2px solid #dc2626',
          borderRadius: 8,
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#dc2626', fontSize: 16 }}>
                Stripe Setup Required
              </p>
              <p style={{ margin: '8px 0 0 0', color: '#991b1b', fontSize: 14, lineHeight: 1.4 }}>
                You have orders waiting, but your Stripe account is not connected. You must complete Stripe setup before you can confirm or fulfill orders.
              </p>
              <Link
                href={`/${vertical}/vendor/dashboard/stripe`}
                style={{
                  display: 'inline-block',
                  marginTop: 12,
                  padding: '10px 20px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                Complete Stripe Setup
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Active / History Toggle */}
      <div style={{
        display: 'flex',
        gap: 0,
        marginBottom: 12,
        backgroundColor: '#e5e7eb',
        borderRadius: 8,
        padding: 3,
        width: 'fit-content',
      }}>
        <button
          onClick={() => { setViewMode('active'); setActiveTab('all') }}
          style={{
            padding: '8px 20px',
            backgroundColor: viewMode === 'active' ? 'white' : 'transparent',
            color: viewMode === 'active' ? '#111' : '#666',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: viewMode === 'active' ? 600 : 400,
            fontSize: 14,
            boxShadow: viewMode === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          Active{totalActive > 0 ? ` (${totalActive})` : ''}
        </button>
        <button
          onClick={() => { setViewMode('history'); setActiveTab('all') }}
          style={{
            padding: '8px 20px',
            backgroundColor: viewMode === 'history' ? 'white' : 'transparent',
            color: viewMode === 'history' ? '#111' : '#666',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: viewMode === 'history' ? 600 : 400,
            fontSize: 14,
            boxShadow: viewMode === 'history' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          History{totalHistory > 0 ? ` (${totalHistory})` : ''}
        </button>
      </div>

      {/* Status Tabs */}
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
          label={`All (${viewOrders.length})`}
        />
        {viewMode === 'active' ? (
          <>
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
          </>
        ) : (
          <>
            <TabButton
              active={activeTab === 'fulfilled'}
              onClick={() => setActiveTab('fulfilled')}
              label={`Fulfilled${fulfilledCount > 0 ? ` (${fulfilledCount})` : ''}`}
            />
            <TabButton
              active={activeTab === 'cancelled'}
              onClick={() => setActiveTab('cancelled')}
              label={`Cancelled${cancelledCount > 0 ? ` (${cancelledCount})` : ''}`}
            />
          </>
        )}
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
            <div style={{ fontSize: 48, marginBottom: 15 }}>{viewMode === 'history' ? '📋' : '📦'}</div>
            <p style={{ color: '#666', margin: 0 }}>
              {activeTab === 'all'
                ? viewMode === 'active' ? 'No active orders' : 'No order history yet'
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
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
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
            Order #{order.order?.order_number || 'N/A'} • {order.customer_name || 'Customer'}
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

      {/* Issue Report Warning */}
      {order.issue_reported_at && (
        <div style={{
          padding: 15,
          backgroundColor: '#fef2f2',
          border: '1px solid #fca5a5',
          borderRadius: 8,
          marginBottom: 15
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: '#991b1b' }}>
                Buyer Reported Issue
              </p>
              <p style={{ margin: '5px 0 0 0', fontSize: 14, color: '#991b1b' }}>
                Reported on {new Date(order.issue_reported_at).toLocaleDateString()} at {new Date(order.issue_reported_at).toLocaleTimeString()}
              </p>
              {order.issue_description && (
                <p style={{ margin: '10px 0 0 0', fontSize: 14, color: '#7f1d1d', fontStyle: 'italic' }}>
                  &quot;{order.issue_description}&quot;
                </p>
              )}
              <p style={{ margin: '10px 0 0 0', fontSize: 13, color: '#991b1b' }}>
                Please contact the buyer to resolve this issue.
              </p>
            </div>
          </div>
        </div>
      )}

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              color: '#28a745',
              fontSize: 14
            }}>
              ✓ Order completed - Payout initiated
            </div>
            {order.buyer_confirmed_at ? (
              <div style={{
                padding: '10px 15px',
                backgroundColor: '#d1fae5',
                borderRadius: 6,
                border: '1px solid #10b981',
                fontSize: 13,
                color: '#065f46'
              }}>
                ✓ Customer acknowledged receipt on {new Date(order.buyer_confirmed_at).toLocaleDateString()} at {new Date(order.buyer_confirmed_at).toLocaleTimeString()}
              </div>
            ) : (
              <div style={{
                padding: '10px 15px',
                backgroundColor: '#fef3c7',
                borderRadius: 6,
                border: '1px solid #f59e0b',
                fontSize: 13,
                color: '#92400e'
              }}>
                ⏳ Awaiting customer acknowledgment
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
