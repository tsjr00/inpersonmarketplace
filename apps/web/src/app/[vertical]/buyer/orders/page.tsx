'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatPrice, calculateDisplayPrice, calculateBuyerPrice, FEES } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { ErrorDisplay } from '@/components/ErrorFeedback'

interface Order {
  id: string
  order_number: string
  status: string
  total_cents: number
  created_at: string
  type?: 'order' | 'market_box'
  readyCount?: number
  fulfilledCount?: number
  handedOffCount?: number
  totalActiveCount?: number
  market_box?: {
    offering_name: string
    offering_image: string | null
    vendor_name: string
    vendor_id: string | null
    market: { id: string; name: string; type: string } | null
    weeks_completed: number
    total_weeks: number
    term_weeks: number
    extended_weeks: number
    next_pickup: { date: string; status: string; week_number: number } | null
    has_ready_pickup: boolean
    pickup_day_of_week: number | null
    pickup_start_time: string | null
    pickup_end_time: string | null
  }
  items: Array<{
    id: string
    listing_title: string
    listing_image: string | null
    vendor_name: string
    quantity: number
    subtotal_cents: number
    status: string
    cancelled_at: string | null
    pickup_date: string | null
    pickup_start_time: string | null
    pickup_end_time: string | null
    pickup_snapshot: Record<string, unknown> | null
    market: {
      id: string
      name: string
      type: string
    } | null
    // Unified display data (prefers pickup_snapshot when available)
    display: {
      market_name: string
      pickup_date: string | null
      start_time: string | null
      end_time: string | null
      address: string | null
      city: string | null
      state: string | null
    } | null
  }>
}

// Format pickup date for display
function formatPickupDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

// Format time range for display (e.g., "8:00 AM - 12:00 PM")
function formatPickupTime(startTime: string | null | undefined, endTime: string | null | undefined): string | null {
  if (!startTime) return null

  const formatTime = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':').map(Number)
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return minutes === 0 ? `${displayHours} ${period}` : `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
  }

  const start = formatTime(startTime)
  if (!endTime) return start
  const end = formatTime(endTime)
  return `${start} - ${end}`
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
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
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
        // Try to extract error details from response
        try {
          const errorData = await response.json()
          setError({
            message: errorData.error || 'Failed to fetch orders',
            code: errorData.code,
            traceId: errorData.traceId
          })
        } catch {
          setError({ message: 'Failed to fetch orders' })
        }
        return
      }

      const data = await response.json()
      setOrders(data.orders || [])
      // Only update markets on initial load (no filters) to preserve the full list
      if (!statusFilter && !marketFilter && data.markets) {
        setMarkets(data.markets)
      }
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load orders' })
    } finally {
      setLoading(false)
    }
  }

  // Status colors matching vendor OrderCard for consistency
  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Order Placed', color: '#92400e', bgColor: '#fef3c7' },
    paid: { label: 'Order Placed', color: '#92400e', bgColor: '#fef3c7' },
    confirmed: { label: 'Confirmed', color: '#1e40af', bgColor: '#dbeafe' },
    ready: { label: 'Ready for Pickup', color: '#065f46', bgColor: '#d1fae5' },
    handed_off: { label: 'Acknowledge Your Pickup', color: '#b45309', bgColor: '#fef3c7' },
    completed: { label: 'Completed', color: '#7e22ce', bgColor: '#f3e8ff' },
    fulfilled: { label: 'Picked Up', color: '#7e22ce', bgColor: '#f3e8ff' },
    cancelled: { label: 'Cancelled', color: '#991b1b', bgColor: '#fee2e2' },
    refunded: { label: 'Refunded', color: '#991b1b', bgColor: '#fee2e2' },
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: `4px solid ${colors.border}`,
            borderTop: `4px solid ${colors.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: `0 auto ${spacing.sm}`,
          }} />
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base }}>Loading orders...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: spacing.xl,
    }}>
      {/* Header */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        marginBottom: spacing.lg,
      }}>
        <Link
          href={`/${vertical}/dashboard`}
          style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
        >
          ← Back to Dashboard
        </Link>
        <h1 style={{ marginTop: spacing.sm, marginBottom: spacing['3xs'], color: colors.textPrimary, fontSize: typography.sizes['2xl'] }}>My Orders</h1>
        <p style={{ color: colors.textMuted, margin: 0, fontSize: typography.sizes.base }}>
          View and track your purchases
        </p>

        {/* Filters */}
        <div style={{ marginTop: spacing.md, display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'center' }}>
            <label style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary }}>
              Status:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: `${spacing['2xs']} ${spacing.xs}`,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                backgroundColor: colors.surfaceElevated
              }}
            >
              <option value="">All Orders</option>
              <option value="pending">Order Placed</option>
              <option value="confirmed">Confirmed</option>
              <option value="ready">Ready for Pickup</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {markets.length > 0 && (
            <div style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'center' }}>
              <label style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary }}>
                Market:
              </label>
              <select
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
                style={{
                  padding: `${spacing['2xs']} ${spacing.xs}`,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  backgroundColor: colors.surfaceElevated
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
        <div style={{ maxWidth: containers.xl, margin: `0 auto ${spacing.md}` }}>
          <ErrorDisplay error={error} verticalId={vertical} />
        </div>
      )}

      {/* Orders List */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
      }}>
        {orders.length === 0 ? (
          <>
            {/* Empty state message */}
            <div style={{
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px dashed ${colors.border}`,
              padding: spacing['3xl'],
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 60, marginBottom: spacing.md, opacity: 0.3 }}>📦</div>
              <h3 style={{ marginBottom: spacing.xs, color: colors.textMuted, fontSize: typography.sizes.lg }}>
                {statusFilter || marketFilter ? 'No matching orders' : 'No orders yet'}
              </h3>
              <p style={{ color: colors.textMuted, marginBottom: 0, fontSize: typography.sizes.base }}>
                {statusFilter || marketFilter
                  ? 'Try adjusting your filters to see more orders'
                  : 'Start shopping to see your orders here'
                }
              </p>
            </div>

            {/* Browse button - only show when no filters */}
            {!statusFilter && !marketFilter && (
              <div style={{ marginTop: spacing.md, textAlign: 'center' }}>
                <Link
                  href={`/${vertical}/browse`}
                  style={{
                    display: 'inline-block',
                    padding: `${spacing.xs} ${spacing.md}`,
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    textDecoration: 'none',
                    borderRadius: radius.sm,
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.base,
                    boxShadow: shadows.primary,
                  }}
                >
                  Browse Products
                </Link>
              </div>
            )}
          </>
        ) : (() => {
          // Group orders into 4 sections
          // handed_off goes with ready since it needs buyer attention
          const readyOrders = orders
            .filter(o => ['ready', 'handed_off'].includes(o.status))
            .sort((a, b) => {
              // handed_off orders first (need immediate confirmation)
              if (a.status === 'handed_off' && b.status !== 'handed_off') return -1
              if (b.status === 'handed_off' && a.status !== 'handed_off') return 1
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            })
          const pendingOrders = orders
            .filter(o => ['pending', 'paid', 'confirmed'].includes(o.status))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          const cancelledOrders = orders
            .filter(o => ['cancelled', 'refunded'].includes(o.status))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          const completedOrders = orders
            .filter(o => ['completed', 'fulfilled'].includes(o.status))
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

          const SectionHeader = ({ title, count, color, bgColor }: { title: string; count: number; color: string; bgColor: string }) => (
            count > 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.xs} 0`,
                marginBottom: spacing.xs,
                borderBottom: `2px solid ${color}`,
              }}>
                <span style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: bgColor,
                  color: color,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.bold,
                }}>
                  {title}
                </span>
                <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                  ({count} order{count !== 1 ? 's' : ''})
                </span>
              </div>
            ) : null
          )

          const renderOrder = (order: Order) => {
            const config = statusConfig[order.status] || statusConfig.pending
            const isCompletedOrder = ['completed', 'fulfilled'].includes(order.status)
            const isCancelledOrder = ['cancelled', 'refunded'].includes(order.status)
            const itemNames = order.items?.map(item => item.listing_title).join(', ') || ''
            // Calculate buyer-facing total from items (excluding cancelled items)
            // Sum subtotals first, then apply buyer price (includes flat fee once)
            const activeItemsSubtotal = order.items?.reduce((sum, item) =>
              item.cancelled_at ? sum : sum + item.subtotal_cents, 0) || 0
            const orderTotal = calculateBuyerPrice(activeItemsSubtotal)

            // Determine visual urgency styling
            const isReady = order.status === 'ready'
            const isHandedOff = order.status === 'handed_off'
            const needsAttention = isReady || isHandedOff

            return (
              <div
                key={order.id}
                onClick={() => router.push(`/${vertical}/buyer/orders/${order.id}`)}
                style={{
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: needsAttention
                    ? `2px solid ${isHandedOff ? '#b45309' : '#166534'}`
                    : `1px solid ${colors.border}`,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                  marginBottom: spacing.sm,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = shadows.md
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Order Header - Always shown */}
                <div style={{
                  padding: `${spacing.sm} ${spacing.md}`,
                  borderBottom: (isCompletedOrder || isCancelledOrder) ? 'none' : `1px solid ${colors.borderMuted}`,
                  backgroundColor: needsAttention
                    ? (isHandedOff ? '#fef3c7' : '#dcfce7')
                    : colors.surfaceMuted,
                }}>
                  {/* Top row: Price, Status, Date */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: spacing.xs,
                    flexWrap: 'wrap',
                    gap: spacing['2xs']
                  }}>
                    <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                      {formatPrice(orderTotal)}
                    </span>
                    <span style={{
                      color: config.color,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                    }}>
                      {config.label}
                    </span>
                    <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                      {new Date(order.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  {/* Order Number Box */}
                  <div style={{
                    backgroundColor: config.bgColor,
                    color: config.color,
                    padding: `${spacing['2xs']} ${spacing.sm}`,
                    borderRadius: radius.sm,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    border: `2px solid ${config.color}20`
                  }}>
                    <span style={{ fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
                      Order
                    </span>
                    <span style={{
                      fontSize: typography.sizes.lg,
                      fontWeight: typography.weights.bold,
                      fontFamily: 'monospace',
                      letterSpacing: 1
                    }}>
                      {order.order_number || order.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                  {/* Tap for details */}
                  <p style={{
                    margin: `${spacing['2xs']} 0 0`,
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted,
                    textAlign: 'center',
                    fontStyle: 'italic'
                  }}>
                    Tap for details
                  </p>
                  {/* Show item names inline for completed/cancelled orders */}
                  {(isCompletedOrder || isCancelledOrder) && itemNames && (
                    <p style={{
                      margin: `${spacing['3xs']} 0 0 0`,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center'
                    }}>
                      {itemNames}
                    </p>
                  )}
                </div>

                {/* Order Items - Only show for active orders (not completed/cancelled) */}
                {!isCompletedOrder && !isCancelledOrder && (
                  <div style={{ padding: `${spacing.md} ${spacing.md}` }}>
                    {order.items && order.items.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                        {order.items.map((item, index) => {
                          const itemConfig = statusConfig[item.status] || statusConfig.pending

                          return (
                            <div
                              key={item.id || index}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: `${spacing.xs} ${spacing.sm}`,
                                backgroundColor: colors.surfaceMuted,
                                borderRadius: radius.sm,
                              }}
                            >
                              <div>
                                <p style={{ margin: 0, fontWeight: typography.weights.medium, color: colors.textPrimary, fontSize: typography.sizes.base }}>
                                  {item.listing_title}
                                </p>
                                <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                                  {item.vendor_name} • Qty: {item.quantity}
                                  {(item.display?.market_name || item.market?.name) && ` • ${item.display?.market_name || item.market?.name}`}
                                </p>
                                {(item.display?.pickup_date || item.pickup_date) && (
                                  <p style={{
                                    margin: `${spacing['3xs']} 0 0`,
                                    fontSize: typography.sizes.sm,
                                    color: '#1e40af',
                                  }}>
                                    Pickup: {formatPickupDate(item.display?.pickup_date || item.pickup_date)}
                                    {formatPickupTime(item.display?.start_time || item.pickup_start_time, item.display?.end_time || item.pickup_end_time) && ` • ${formatPickupTime(item.display?.start_time || item.pickup_start_time, item.display?.end_time || item.pickup_end_time)}`}
                                  </p>
                                )}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: `0 0 ${spacing['3xs']} 0`, fontWeight: typography.weights.semibold, color: colors.textPrimary, fontSize: typography.sizes.base }}>
                                  {formatPrice(calculateDisplayPrice(item.subtotal_cents))}
                                </p>
                                <span style={{
                                  padding: `2px ${spacing['2xs']}`,
                                  backgroundColor: itemConfig.bgColor,
                                  color: itemConfig.color,
                                  borderRadius: radius.full,
                                  fontSize: typography.sizes.xs,
                                  fontWeight: typography.weights.medium,
                                }}>
                                  {itemConfig.label}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p style={{ color: colors.textMuted, margin: 0, fontStyle: 'italic', fontSize: typography.sizes.sm }}>
                        No item details available
                      </p>
                    )}
                  </div>
                )}

                {/* Ready for Pickup Banner - Highlighted */}
                {order.status === 'ready' && (
                  <div style={{
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderTop: `1px solid #86efac`,
                    backgroundColor: '#dcfce7',
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: typography.sizes.base,
                      fontWeight: typography.weights.semibold,
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['2xs'],
                    }}>
                      <span style={{ fontSize: typography.sizes.xl }}>📍</span>
                      {order.readyCount && order.totalActiveCount && order.readyCount < order.totalActiveCount
                        ? `${order.readyCount} of ${order.totalActiveCount} items ready for pickup`
                        : 'Your order is ready for pickup!'
                      }
                    </p>
                  </div>
                )}

                {/* Handed Off Banner - Needs buyer confirmation */}
                {order.status === 'handed_off' && (
                  <div style={{
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderTop: `1px solid #fcd34d`,
                    backgroundColor: '#fef3c7',
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: typography.sizes.base,
                      fontWeight: typography.weights.semibold,
                      color: '#b45309',
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['2xs'],
                    }}>
                      <span style={{ fontSize: typography.sizes.xl }}>🤝</span>
                      Vendor marked as handed off - please confirm you received it
                    </p>
                  </div>
                )}

                {/* Confirmed Banner */}
                {order.status === 'confirmed' && (
                  <div style={{
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderTop: `1px solid ${colors.borderMuted}`,
                    backgroundColor: colors.primaryLight,
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: typography.sizes.sm,
                      color: colors.primaryDark,
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['2xs'],
                    }}>
                      <span style={{ fontSize: typography.sizes.lg }}>✓</span>
                      All items in your order have been confirmed
                    </p>
                  </div>
                )}
              </div>
            )
          }

          const renderMarketBox = (order: Order) => {
            const mb = order.market_box!
            const config = statusConfig[order.status] || statusConfig.confirmed
            const isReady = order.status === 'ready'
            const isCompleted = ['completed', 'fulfilled'].includes(order.status)
            const isCancelled = ['cancelled'].includes(order.status)
            const progressPercent = mb.total_weeks > 0
              ? Math.round((mb.weeks_completed / mb.total_weeks) * 100)
              : 0

            return (
              <div
                key={order.id}
                onClick={() => router.push(`/${vertical}/buyer/subscriptions/${order.id}`)}
                style={{
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: isReady
                    ? `2px solid #166534`
                    : `1px solid ${colors.border}`,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                  marginBottom: spacing.sm,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = shadows.md }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
              >
                {/* Market Box Header */}
                <div style={{
                  padding: `${spacing.sm} ${spacing.md}`,
                  borderBottom: (isCompleted || isCancelled) ? 'none' : `1px solid ${colors.borderMuted}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: isReady ? '#dcfce7' : colors.surfaceMuted,
                  gap: spacing.xs,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', flex: 1 }}>
                    {/* Teal Market Box Badge */}
                    <div style={{
                      backgroundColor: '#f0fdfa',
                      color: '#0f766e',
                      padding: `${spacing['2xs']} ${spacing.sm}`,
                      borderRadius: radius.sm,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      border: '2px solid #0f766e20'
                    }}>
                      <span style={{ fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
                        Market Box
                      </span>
                      <span style={{
                        fontSize: typography.sizes.lg,
                        fontWeight: typography.weights.bold,
                        fontFamily: 'monospace',
                        letterSpacing: 1,
                      }}>
                        {order.order_number}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: config.bgColor,
                          color: config.color,
                          borderRadius: radius.full,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold,
                        }}>
                          {config.label}
                        </span>
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: '#f0fdfa',
                          color: '#0f766e',
                          borderRadius: radius.full,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.medium,
                        }}>
                          Week {mb.weeks_completed} of {mb.total_weeks}
                        </span>
                        <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                          {new Date(order.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </span>
                      </div>
                      <p style={{
                        margin: `${spacing['3xs']} 0 0 0`,
                        fontWeight: typography.weights.medium,
                        color: colors.textPrimary,
                        fontSize: typography.sizes.base,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {mb.offering_name}
                      </p>
                      {(isCompleted || isCancelled) && (
                        <p style={{
                          margin: `${spacing['3xs']} 0 0 0`,
                          fontSize: typography.sizes.xs,
                          color: colors.textMuted,
                        }}>
                          {mb.vendor_name}{mb.market ? ` \u2022 ${mb.market.name}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                    {formatPrice(order.total_cents)}
                  </span>
                </div>

                {/* Market Box Details - Only for active orders */}
                {!isCompleted && !isCancelled && (
                  <div style={{ padding: `${spacing.md} ${spacing.md}` }}>
                    <div style={{
                      padding: `${spacing.xs} ${spacing.sm}`,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.sm,
                    }}>
                      <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                        {mb.vendor_name}{mb.market ? ` \u2022 ${mb.market.name}` : ''}
                      </p>
                      {/* Progress bar */}
                      <div style={{
                        marginTop: spacing.xs,
                        backgroundColor: '#e5e7eb',
                        borderRadius: radius.full,
                        height: 6,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${progressPercent}%`,
                          backgroundColor: '#0f766e',
                          height: '100%',
                          borderRadius: radius.full,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <p style={{
                        margin: `${spacing['3xs']} 0 0`,
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted,
                      }}>
                        {mb.weeks_completed} of {mb.total_weeks} weeks completed
                      </p>
                      {mb.next_pickup && (
                        <p style={{
                          margin: `${spacing.xs} 0 0`,
                          fontSize: typography.sizes.sm,
                          color: mb.next_pickup.status === 'ready' ? '#166534' : '#1e40af',
                          fontWeight: typography.weights.medium,
                        }}>
                          {mb.next_pickup.status === 'ready' ? 'Ready for pickup' : 'Next pickup'}:{' '}
                          {formatPickupDate(mb.next_pickup.date)}
                          {formatPickupTime(mb.pickup_start_time, mb.pickup_end_time) &&
                            ` \u2022 ${formatPickupTime(mb.pickup_start_time, mb.pickup_end_time)}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Ready banner */}
                {isReady && (
                  <div style={{
                    padding: `${spacing.sm} ${spacing.md}`,
                    borderTop: '1px solid #86efac',
                    backgroundColor: '#dcfce7',
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: typography.sizes.base,
                      fontWeight: typography.weights.semibold,
                      color: '#166534',
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['2xs'],
                    }}>
                      Your market box is ready for pickup!
                    </p>
                  </div>
                )}
              </div>
            )
          }

          const renderItem = (order: Order) =>
            order.type === 'market_box' ? renderMarketBox(order) : renderOrder(order)

          return (
            <div>
              {/* Section 1: Ready for Pickup */}
              {readyOrders.length > 0 && (
                <div style={{ marginBottom: spacing.lg }}>
                  <SectionHeader
                    title="Ready for Pickup"
                    count={readyOrders.length}
                    color="#166534"
                    bgColor="#dcfce7"
                  />
                  {readyOrders.map(renderItem)}
                </div>
              )}

              {/* Section 2: Pending / In Progress */}
              {pendingOrders.length > 0 && (
                <div style={{ marginBottom: spacing.lg }}>
                  <SectionHeader
                    title="In Progress"
                    count={pendingOrders.length}
                    color={colors.primaryDark}
                    bgColor={colors.primaryLight}
                  />
                  {pendingOrders.map(renderItem)}
                </div>
              )}

              {/* Section 3: Cancelled */}
              {cancelledOrders.length > 0 && (
                <div style={{ marginBottom: spacing.lg }}>
                  <SectionHeader
                    title="Cancelled"
                    count={cancelledOrders.length}
                    color="#991b1b"
                    bgColor="#fee2e2"
                  />
                  {cancelledOrders.map(renderItem)}
                </div>
              )}

              {/* Section 4: Completed */}
              {completedOrders.length > 0 && (
                <div style={{ marginBottom: spacing.lg }}>
                  <SectionHeader
                    title="Completed"
                    count={completedOrders.length}
                    color={colors.textMuted}
                    bgColor={colors.surfaceMuted}
                  />
                  {completedOrders.map(renderItem)}
                </div>
              )}
            </div>
          )
        })()}

      </div>
    </div>
  )
}
