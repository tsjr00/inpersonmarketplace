'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import OrderCard from '@/components/vendor/OrderCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Toast, { type ToastType } from '@/components/shared/Toast'
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
  market_name: string
  market_type: string
  market_address?: string
  market_city?: string
  pickup_date?: string | null
  pickup_start_time?: string | null
  pickup_end_time?: string | null
  pickup_snapshot?: Record<string, unknown> | null
  preferred_pickup_time?: string | null
  display?: {
    market_name: string
    pickup_date: string | null
    start_time: string | null
    end_time: string | null
    preferred_pickup_time?: string | null
    address: string | null
    city: string | null
    state: string | null
  } | null
  pickup_confirmed_at?: string | null
  buyer_confirmed_at?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancellation_reason?: string | null
}

interface Order {
  id: string
  order_number: string
  order_status: string
  payment_method?: string
  customer_name: string
  total_cents: number
  created_at: string
  items: OrderItem[]
}

// Status colors matching the stat pills
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  ready: { bg: '#d1fae5', text: '#065f46' },
  fulfilled: { bg: '#f3e8ff', text: '#7e22ce' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' }
}

const ACTIVE_STATUSES = ['pending', 'confirmed', 'ready']
const HISTORY_STATUSES = ['fulfilled', 'cancelled', 'refunded']

export default function VendorDashboardOrdersPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active')
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null)
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    variant?: 'default' | 'danger'
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch(`/api/vendor/orders?vertical=${vertical}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch orders')
      }

      setOrders(data.orders || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [vertical])

  useEffect(() => {
    fetchOrders()
    fetchStripeStatus()

    const startPolling = () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = setInterval(fetchOrders, 30000)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else {
        fetchOrders()
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchOrders])

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

  // ── Order Action Handlers ──────────────────────────────────────

  const handleConfirmItem = (itemId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Confirm Order',
      message: 'By confirming this order, you are committing to fulfill it. This means you have the product available and the capacity to prepare it for the scheduled pickup. Cancelling confirmed orders affects your reliability score.\n\nDo you want to confirm this order?',
      confirmLabel: 'Confirm Order',
      variant: 'default',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await fetch(`/api/vendor/orders/${itemId}/confirm`, { method: 'POST' })
          if (res.ok) {
            fetchOrders()
          } else {
            const data = await res.json()
            if (data.code === 'STRIPE_NOT_CONNECTED') {
              setStripeConnected(false)
              setError('You must complete Stripe setup before confirming orders.')
              return
            }
            setToast({ message: data.error || 'Failed to confirm item', type: 'error' })
          }
        } catch {
          setToast({ message: 'An error occurred', type: 'error' })
        }
      }
    })
  }

  const handleReadyItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/vendor/orders/${itemId}/ready`, { method: 'POST' })
      if (res.ok) {
        fetchOrders()
      } else {
        const data = await res.json()
        setToast({ message: data.error || 'Failed to mark item ready', type: 'error' })
      }
    } catch {
      setToast({ message: 'An error occurred', type: 'error' })
    }
  }

  const handleFulfillItem = (itemId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Mark as Fulfilled',
      message: 'Mark this item as fulfilled (customer picked up)?',
      confirmLabel: 'Mark Fulfilled',
      variant: 'default',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await fetch(`/api/vendor/orders/${itemId}/fulfill`, { method: 'POST' })
          if (res.ok) {
            fetchOrders()
          } else {
            const data = await res.json()
            setToast({ message: data.error || 'Failed to fulfill item', type: 'error' })
          }
        } catch {
          setToast({ message: 'An error occurred', type: 'error' })
        }
      }
    })
  }

  const handleRejectItem = (itemId: string, reason: string) => {
    setConfirmDialog({
      open: true,
      title: 'Reject Item',
      message: `Are you sure you want to reject this item? The customer will be refunded.\n\nReason: ${reason}`,
      confirmLabel: 'Reject & Refund',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await fetch(`/api/vendor/orders/${itemId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
          })
          if (res.ok) {
            fetchOrders()
          } else {
            const data = await res.json()
            setToast({ message: data.error || 'Failed to reject item', type: 'error' })
          }
        } catch {
          setToast({ message: 'An error occurred', type: 'error' })
        }
      }
    })
  }

  const handleConfirmExternalPayment = async (orderId: string) => {
    try {
      const res = await fetch(`/api/vendor/orders/${orderId}/confirm-external-payment`, { method: 'POST' })
      if (res.ok) {
        setToast({ message: 'Payment confirmed! Order is now active.', type: 'success' })
        fetchOrders()
      } else {
        const data = await res.json()
        setToast({ message: data.error || 'Failed to confirm payment', type: 'error' })
      }
    } catch {
      setToast({ message: 'An error occurred', type: 'error' })
    }
  }

  const handleResolveStaleOrder = async (orderId: string, resolution: 'fulfilled' | 'problem', itemIds: string[]) => {
    if (resolution === 'fulfilled') {
      // Late fulfillment: mark each stale confirmed item as ready, then fulfilled
      let allOk = true
      for (const itemId of itemIds) {
        try {
          // Ready step
          const readyRes = await fetch(`/api/vendor/orders/${itemId}/ready`, { method: 'POST' })
          if (!readyRes.ok) {
            const data = await readyRes.json()
            setToast({ message: data.error || `Failed to mark item ready`, type: 'error' })
            allOk = false
            break
          }
          // Fulfill step
          const fulfillRes = await fetch(`/api/vendor/orders/${itemId}/fulfill`, { method: 'POST' })
          if (!fulfillRes.ok) {
            const data = await fulfillRes.json()
            setToast({ message: data.error || `Failed to fulfill item`, type: 'error' })
            allOk = false
            break
          }
        } catch {
          setToast({ message: 'An error occurred resolving the order', type: 'error' })
          allOk = false
          break
        }
      }
      if (allOk) {
        setToast({ message: 'Order marked as fulfilled. Thank you for resolving this!', type: 'success' })
        fetchOrders()
      }
    } else {
      // Problem: reject each stale confirmed item (triggers refund)
      let allOk = true
      for (const itemId of itemIds) {
        try {
          const res = await fetch(`/api/vendor/orders/${itemId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Order was not completed — reported as problem by vendor after pickup date passed.' })
          })
          if (!res.ok) {
            const data = await res.json()
            setToast({ message: data.error || `Failed to reject item`, type: 'error' })
            allOk = false
            break
          }
        } catch {
          setToast({ message: 'An error occurred', type: 'error' })
          allOk = false
          break
        }
      }
      if (allOk) {
        setToast({ message: 'Problem reported. Customer will be refunded for affected items.', type: 'success' })
        fetchOrders()
      }
    }
  }

  // ── Filtering & Sorting ────────────────────────────────────────

  // An order is "active" if ANY item has an active status
  const isOrderActive = (order: Order) =>
    order.items.some(item => ACTIVE_STATUSES.includes(item.status))

  const filteredOrders = orders.filter(order =>
    viewMode === 'active' ? isOrderActive(order) : !isOrderActive(order)
  )

  // Sort by urgency: ready > confirmed > pending > fulfilled > cancelled
  const getOrderPriority = (order: Order): number => {
    const statuses = order.items.map(i => i.status)
    if (statuses.includes('ready')) return 1
    if (statuses.includes('confirmed')) return 2
    if (statuses.includes('pending')) return 3
    if (statuses.includes('fulfilled')) return 4
    return 5
  }

  const getOrderPriorityLabel = (order: Order): string => {
    const statuses = order.items.map(i => i.status)
    if (statuses.includes('ready')) return 'ready'
    if (statuses.includes('confirmed')) return 'confirmed'
    if (statuses.includes('pending')) return 'pending'
    if (statuses.includes('fulfilled')) return 'fulfilled'
    return 'cancelled'
  }

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const priorityDiff = getOrderPriority(a) - getOrderPriority(b)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  // Count ALL items across ALL orders for stat pills
  const allItems = orders.flatMap(o => o.items)
  const statusCounts = {
    pending: allItems.filter(i => i.status === 'pending').length,
    confirmed: allItems.filter(i => i.status === 'confirmed').length,
    ready: allItems.filter(i => i.status === 'ready').length,
    fulfilled: allItems.filter(i => i.status === 'fulfilled').length,
    cancelled: allItems.filter(i => i.status === 'cancelled').length,
  }

  const totalActive = orders.filter(isOrderActive).length
  const totalHistory = orders.filter(o => !isOrderActive(o)).length

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: `4px solid ${colors.border}`,
            borderTop: `4px solid ${colors.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 15px'
          }} />
          <p style={{ color: colors.textMuted }}>Loading orders...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      padding: `${spacing.md} ${spacing.sm}`,
      backgroundColor: colors.surfaceBase,
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: spacing.md,
        flexWrap: 'wrap',
        gap: spacing.sm
      }}>
        <div>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
          >
            &larr; Vendor Dashboard
          </Link>
          <h1 style={{
            color: colors.primary,
            marginBottom: spacing['2xs'],
            marginTop: spacing.xs,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold
          }}>
            Customer Orders
          </h1>
          <p style={{ color: colors.textSecondary, margin: 0 }}>
            Manage incoming orders from customers
          </p>
        </div>
        <button
          onClick={() => fetchOrders()}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: typography.weights.semibold,
            minHeight: 44
          }}
        >
          &#8635; Refresh
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: radius.md,
          color: '#721c24',
          marginBottom: spacing.md
        }}>
          {error}
        </div>
      )}

      {/* Stripe Setup Warning */}
      {stripeConnected === false && orders.length > 0 && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fef2f2',
          border: `2px solid #dc2626`,
          borderRadius: radius.md,
          marginBottom: spacing.md
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 24 }}>&#9888;&#65039;</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#dc2626', fontSize: typography.sizes.base }}>
                Stripe Setup Required
              </p>
              <p style={{ margin: '8px 0 0 0', color: '#991b1b', fontSize: typography.sizes.sm, lineHeight: 1.4 }}>
                You have orders waiting, but your Stripe account is not connected. You must complete Stripe setup before you can confirm or fulfill orders.
              </p>
              <Link
                href={`/${vertical}/vendor/dashboard/stripe`}
                style={{
                  display: 'inline-block',
                  marginTop: 12,
                  padding: `${spacing['2xs']} ${spacing.sm}`,
                  backgroundColor: '#dc2626',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold
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
        marginBottom: spacing.sm,
        backgroundColor: '#e5e7eb',
        borderRadius: radius.md,
        padding: 3,
        width: 'fit-content',
      }}>
        <button
          onClick={() => setViewMode('active')}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: viewMode === 'active' ? 'white' : 'transparent',
            color: viewMode === 'active' ? colors.textPrimary : colors.textMuted,
            border: 'none',
            borderRadius: radius.sm,
            cursor: 'pointer',
            fontWeight: viewMode === 'active' ? typography.weights.semibold : typography.weights.normal,
            fontSize: typography.sizes.sm,
            boxShadow: viewMode === 'active' ? shadows.sm : 'none',
          }}
        >
          Active{totalActive > 0 ? ` (${totalActive})` : ''}
        </button>
        <button
          onClick={() => setViewMode('history')}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: viewMode === 'history' ? 'white' : 'transparent',
            color: viewMode === 'history' ? colors.textPrimary : colors.textMuted,
            border: 'none',
            borderRadius: radius.sm,
            cursor: 'pointer',
            fontWeight: viewMode === 'history' ? typography.weights.semibold : typography.weights.normal,
            fontSize: typography.sizes.sm,
            boxShadow: viewMode === 'history' ? shadows.sm : 'none',
          }}
        >
          History{totalHistory > 0 ? ` (${totalHistory})` : ''}
        </button>
      </div>

      {/* Status Stat Pills */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        gap: spacing.xs,
        marginBottom: spacing.md
      }}>
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} style={{
            padding: `${spacing.xs} ${spacing.sm}`,
            backgroundColor: STATUS_COLORS[status]?.bg || '#f3f4f6',
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.xs
          }}>
            <span style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: STATUS_COLORS[status]?.text || colors.textSecondary,
              textTransform: 'capitalize'
            }}>
              {status}
            </span>
            <span style={{
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.bold,
              color: STATUS_COLORS[status]?.text || colors.textSecondary
            }}>
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Orders List — sorted by urgency with section separators */}
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
                  onConfirmExternalPayment={handleConfirmExternalPayment}
                  onResolveStaleOrder={handleResolveStaleOrder}
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
          <div style={{ fontSize: 48, marginBottom: spacing.sm }}>
            {viewMode === 'history' ? '\uD83D\uDCCB' : '\uD83D\uDCE6'}
          </div>
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base, margin: 0 }}>
            {viewMode === 'active' ? 'No active orders' : 'No order history yet'}
          </p>
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, marginTop: spacing['2xs'] }}>
            Orders will appear here when customers make purchases.
          </p>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </div>
  )
}
