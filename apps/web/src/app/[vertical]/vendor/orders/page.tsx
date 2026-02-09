'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import OrderCard from '@/components/vendor/OrderCard'
import OrderFilters from '@/components/vendor/OrderFilters'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
  pickup_start_time?: string | null
  pickup_end_time?: string | null
  pickup_snapshot?: Record<string, unknown> | null
  // Unified display data (prefers pickup_snapshot when available)
  display?: {
    market_name: string
    pickup_date: string | null
    start_time: string | null
    end_time: string | null
    address: string | null
    city: string | null
    state: string | null
  } | null
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

interface PickupDateOption {
  date: string
  market_id: string
  market_name: string
  order_count: number
  item_count: number
}

export default function VendorOrdersPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [orders, setOrders] = useState<Order[]>([])
  const [allItems, setAllItems] = useState<OrderItem[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [upcomingPickupDates, setUpcomingPickupDates] = useState<PickupDateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<string | null>(null)
  const [pickupDateFilter, setPickupDateFilter] = useState<string | null>(null)
  const [dateRangeFilter, setDateRangeFilter] = useState<string | null>('30days') // Default to last 30 days

  useEffect(() => {
    fetchOrders()
    fetchMarkets()
  }, [statusFilter, marketFilter, pickupDateFilter, dateRangeFilter])

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (marketFilter) params.set('market_id', marketFilter)
      if (pickupDateFilter) params.set('pickup_date', pickupDateFilter)
      if (dateRangeFilter) params.set('date_range', dateRangeFilter)

      const res = await fetch(`/api/vendor/orders?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
        setAllItems(data.orderItems || [])
        // Only update pickup dates on initial load (no pickup filter active)
        if (!pickupDateFilter && data.upcomingPickupDates) {
          setUpcomingPickupDates(data.upcomingPickupDates)
        }
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
    const confirmed = window.confirm(
      'By confirming this order, you are committing to fulfill it. ' +
      'This means you have the product available and the capacity to prepare it for the scheduled pickup. ' +
      'Cancelling confirmed orders affects your reliability score.\n\n' +
      'Do you want to confirm this order?'
    )
    if (!confirmed) return

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
    setPickupDateFilter(null)
    setDateRangeFilter('30days') // Reset to default
  }

  // Count items by status
  const statusCounts = {
    pending: allItems.filter(i => i.status === 'pending').length,
    confirmed: allItems.filter(i => i.status === 'confirmed').length,
    ready: allItems.filter(i => i.status === 'ready').length,
    fulfilled: allItems.filter(i => i.status === 'fulfilled').length,
    cancelled: allItems.filter(i => i.status === 'cancelled').length
  }

  // Sort orders by most urgent item status: ready > confirmed > pending > fulfilled > cancelled
  const getOrderPriority = (order: Order): number => {
    const itemStatuses = order.items.map(i => i.status)
    if (itemStatuses.includes('ready')) return 1      // Highest - customer waiting
    if (itemStatuses.includes('confirmed')) return 2  // Needs preparation
    if (itemStatuses.includes('pending')) return 3    // Needs confirmation
    if (itemStatuses.includes('fulfilled')) return 4  // Completed
    return 5                                          // Cancelled (lowest priority)
  }

  const getOrderPriorityLabel = (order: Order): string => {
    const itemStatuses = order.items.map(i => i.status)
    if (itemStatuses.includes('ready')) return 'ready'
    if (itemStatuses.includes('confirmed')) return 'confirmed'
    if (itemStatuses.includes('pending')) return 'pending'
    if (itemStatuses.includes('fulfilled')) return 'fulfilled'
    return 'cancelled'
  }

  const sortedOrders = [...orders].sort((a, b) => {
    const priorityDiff = getOrderPriority(a) - getOrderPriority(b)
    if (priorityDiff !== 0) return priorityDiff
    // Within same priority, sort by created_at (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  // Status colors matching the pills
  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#fef3c7', text: '#92400e' },
    confirmed: { bg: '#dbeafe', text: '#1e40af' },
    ready: { bg: '#d1fae5', text: '#065f46' },
    fulfilled: { bg: '#f3e8ff', text: '#7e22ce' },  // Deeper purple, distinct from blue
    cancelled: { bg: '#fee2e2', text: '#991b1b' }
  }

  if (loading) {
    return (
      <div style={{ padding: spacing.xl, textAlign: 'center', backgroundColor: colors.surfaceBase, minHeight: '100vh' }}>
        <p style={{ color: colors.textMuted }}>Loading orders...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: `${spacing.md} ${spacing.sm}`, backgroundColor: colors.surfaceBase, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.sm }}>
        <div>
          <h1 style={{ color: colors.primary, marginBottom: spacing['2xs'], marginTop: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold }}>
            Orders
          </h1>
          <p style={{ color: colors.textSecondary, margin: 0 }}>
            Manage customer orders and pickup fulfillment
          </p>
        </div>
        <Link
          href={`/${vertical}/vendor/dashboard`}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: colors.primaryDark,
            color: colors.textInverse,
            textDecoration: 'none',
            borderRadius: radius.sm,
            fontWeight: typography.weights.semibold,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          Back to Dashboard
        </Link>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: spacing.md }}>
        <OrderFilters
          currentStatus={statusFilter}
          currentMarketId={marketFilter}
          currentDateRange={dateRangeFilter}
          currentPickupDate={pickupDateFilter}
          markets={markets}
          upcomingPickupDates={upcomingPickupDates}
          onStatusChange={setStatusFilter}
          onMarketChange={setMarketFilter}
          onDateRangeChange={setDateRangeFilter}
          onPickupDateChange={setPickupDateFilter}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Stats - compact with matching pill colors */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: spacing.xs,
        marginBottom: spacing.md
      }}>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: STATUS_COLORS.pending.bg,
          borderRadius: radius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.xs
        }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: STATUS_COLORS.pending.text }}>
            Pending
          </span>
          <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: STATUS_COLORS.pending.text }}>
            {statusCounts.pending}
          </span>
        </div>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: STATUS_COLORS.confirmed.bg,
          borderRadius: radius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.xs
        }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: STATUS_COLORS.confirmed.text }}>
            Confirmed
          </span>
          <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: STATUS_COLORS.confirmed.text }}>
            {statusCounts.confirmed}
          </span>
        </div>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: STATUS_COLORS.ready.bg,
          borderRadius: radius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.xs
        }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: STATUS_COLORS.ready.text }}>
            Ready
          </span>
          <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: STATUS_COLORS.ready.text }}>
            {statusCounts.ready}
          </span>
        </div>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: STATUS_COLORS.fulfilled.bg,
          borderRadius: radius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.xs
        }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: STATUS_COLORS.fulfilled.text }}>
            Fulfilled
          </span>
          <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: STATUS_COLORS.fulfilled.text }}>
            {statusCounts.fulfilled}
          </span>
        </div>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: STATUS_COLORS.cancelled.bg,
          borderRadius: radius.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.xs
        }}>
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: STATUS_COLORS.cancelled.text }}>
            Cancelled
          </span>
          <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: STATUS_COLORS.cancelled.text }}>
            {statusCounts.cancelled}
          </span>
        </div>
      </div>

      {/* Orders List - sorted by urgency: ready > confirmed > pending > fulfilled */}
      {sortedOrders.length > 0 ? (
        <div>
          {sortedOrders.map((order, index) => {
            const currentPriority = getOrderPriorityLabel(order)
            const prevOrder = index > 0 ? sortedOrders[index - 1] : null
            const prevPriority = prevOrder ? getOrderPriorityLabel(prevOrder) : null
            const showSeparator = prevPriority && prevPriority !== currentPriority

            return (
              <div key={order.id}>
                {showSeparator && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    margin: `${spacing.md} 0`,
                  }}>
                    <div style={{
                      flex: 1,
                      height: 1,
                      backgroundColor: STATUS_COLORS[currentPriority]?.text || colors.border,
                      opacity: 0.3
                    }} />
                    <span style={{
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      color: STATUS_COLORS[currentPriority]?.text || colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {currentPriority}
                    </span>
                    <div style={{
                      flex: 1,
                      height: 1,
                      backgroundColor: STATUS_COLORS[currentPriority]?.text || colors.border,
                      opacity: 0.3
                    }} />
                  </div>
                )}
                <OrderCard
                  order={order}
                  onConfirmItem={handleConfirmItem}
                  onReadyItem={handleReadyItem}
                  onFulfillItem={handleFulfillItem}
                  onRejectItem={handleRejectItem}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{
          padding: spacing['3xl'],
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          textAlign: 'center',
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm
        }}>
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base, margin: 0 }}>
            No orders found.
          </p>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, marginTop: spacing['2xs'] }}>
            {statusFilter || marketFilter
              ? 'Try adjusting your filters.'
              : 'Orders will appear here when customers make purchases.'}
          </p>
        </div>
      )}
    </div>
  )
}
