'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import OrderCard from '@/components/vendor/OrderCard'
import OrderFilters from '@/components/vendor/OrderFilters'

interface OrderItem {
  id: string
  listing_id: string
  listing_title: string
  listing_image: string | null
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  status: string
  market_id: string
  market_name: string
  market_type: string
  market_address?: string
  market_city?: string
  pickup_date?: string
}

interface Order {
  id: string
  order_number: string
  order_status: string
  customer_name: string
  total_cents: number
  created_at: string
  items: OrderItem[]
}

interface Market {
  id: string
  name: string
}

export default function VendorOrdersPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [orders, setOrders] = useState<Order[]>([])
  const [allItems, setAllItems] = useState<OrderItem[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<string | null>(null)

  useEffect(() => {
    fetchOrders()
    fetchMarkets()
  }, [statusFilter, marketFilter])

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (marketFilter) params.set('market_id', marketFilter)

      const res = await fetch(`/api/vendor/orders?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
        setAllItems(data.orderItems || [])
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMarkets = async () => {
    try {
      const res = await fetch('/api/vendor/markets')
      if (res.ok) {
        const data = await res.json()
        const allMarkets = [
          ...(data.fixedMarkets || []),
          ...(data.privatePickupMarkets || [])
        ]
        setMarkets(allMarkets.map((m: any) => ({ id: m.id, name: m.name })))
      }
    } catch (error) {
      console.error('Error fetching markets:', error)
    }
  }

  const handleConfirmItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/vendor/orders/${itemId}/confirm`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchOrders()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to confirm item')
      }
    } catch (error) {
      console.error('Error confirming item:', error)
      alert('An error occurred')
    }
  }

  const handleReadyItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/vendor/orders/${itemId}/ready`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchOrders()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to mark item ready')
      }
    } catch (error) {
      console.error('Error marking item ready:', error)
      alert('An error occurred')
    }
  }

  const handleFulfillItem = async (itemId: string) => {
    if (!confirm('Mark this item as fulfilled (customer picked up)?')) return

    try {
      const res = await fetch(`/api/vendor/orders/${itemId}/fulfill`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchOrders()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to fulfill item')
      }
    } catch (error) {
      console.error('Error fulfilling item:', error)
      alert('An error occurred')
    }
  }

  const handleRejectItem = async (itemId: string, reason: string) => {
    if (!confirm(`Are you sure you want to reject this item? The customer will be refunded.\n\nReason: ${reason}`)) {
      return
    }

    try {
      const res = await fetch(`/api/vendor/orders/${itemId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })
      if (res.ok) {
        fetchOrders()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to reject item')
      }
    } catch (error) {
      console.error('Error rejecting item:', error)
      alert('An error occurred')
    }
  }

  const handleClearFilters = () => {
    setStatusFilter(null)
    setMarketFilter(null)
  }

  // Count items by status
  const statusCounts = {
    pending: allItems.filter(i => i.status === 'pending').length,
    confirmed: allItems.filter(i => i.status === 'confirmed').length,
    ready: allItems.filter(i => i.status === 'ready').length,
    fulfilled: allItems.filter(i => i.status === 'fulfilled').length
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Loading orders...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ color: '#111827', marginBottom: 8, marginTop: 0, fontSize: 28, fontWeight: 'bold' }}>
            Orders
          </h1>
          <p style={{ color: '#6b7280', margin: 0 }}>
            Manage customer orders and pickup fulfillment
          </p>
        </div>
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6b7280',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          Back to Dashboard
        </Link>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 24 }}>
        <OrderFilters
          currentStatus={statusFilter}
          currentMarketId={marketFilter}
          markets={markets}
          onStatusChange={setStatusFilter}
          onMarketChange={setMarketFilter}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 24
      }}>
        <div style={{ padding: 16, backgroundColor: '#fef3c7', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
            Pending
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#92400e' }}>
            {statusCounts.pending}
          </p>
        </div>
        <div style={{ padding: 16, backgroundColor: '#dbeafe', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
            Confirmed
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#1e40af' }}>
            {statusCounts.confirmed}
          </p>
        </div>
        <div style={{ padding: 16, backgroundColor: '#d1fae5', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#065f46' }}>
            Ready
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#065f46' }}>
            {statusCounts.ready}
          </p>
        </div>
        <div style={{ padding: 16, backgroundColor: '#e0e7ff', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#4338ca' }}>
            Fulfilled
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#4338ca' }}>
            {statusCounts.fulfilled}
          </p>
        </div>
      </div>

      {/* Orders List */}
      {orders.length > 0 ? (
        <div>
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onConfirmItem={handleConfirmItem}
              onReadyItem={handleReadyItem}
              onFulfillItem={handleFulfillItem}
              onRejectItem={handleRejectItem}
            />
          ))}
        </div>
      ) : (
        <div style={{
          padding: 60,
          backgroundColor: 'white',
          borderRadius: 8,
          textAlign: 'center',
          border: '1px solid #e5e7eb'
        }}>
          <p style={{ color: '#6b7280', fontSize: 16, margin: 0 }}>
            No orders found.
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8 }}>
            {statusFilter || marketFilter
              ? 'Try adjusting your filters.'
              : 'Orders will appear here when customers make purchases.'}
          </p>
        </div>
      )}
    </div>
  )
}
