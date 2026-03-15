'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import OrderStatusSummary from '@/components/buyer/OrderStatusSummary'
import OrderTimeline from '@/components/buyer/OrderTimeline'
import PickupDetails from '@/components/buyer/PickupDetails'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import PostPurchaseSharePrompt from '@/components/marketing/PostPurchaseSharePrompt'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { formatPrice, calculateDisplayPrice, calculateBuyerPrice, FEES, formatQuantityDisplay } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

// Format confirmed pickup time (HH:MM or HH:MM:SS) to 12h display
function formatPickupTime12h(time: string | null | undefined): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatPickupDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

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
  quantity_amount: number | null
  quantity_unit: string | null
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  status: string
  vendor_name: string
  vendor_profile_id: string | null
  vendor_email: string | null
  vendor_phone: string | null
  market: Market
  pickup_date: string | null
  pickup_start_time: string | null
  pickup_end_time: string | null
  pickup_snapshot: Record<string, unknown> | null
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
  buyer_confirmed_at: string | null
  vendor_confirmed_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  refund_amount_cents: number | null
  confirmation_window_expires_at: string | null
  lockdown_active: boolean
  preferred_pickup_time: string | null
  issue_reported_at: string | null
  issue_reported_by: string | null
  issue_description: string | null
}

interface OrderDetail {
  id: string
  order_number: string
  status: string
  payment_method?: string
  total_cents: number
  tip_percentage: number
  tip_amount: number
  created_at: string
  updated_at: string
  items: OrderItem[]
}

export default function BuyerOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const orderId = params.id as string
  const locale = getClientLocale()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null)
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null)
  const [, setReportingItemId] = useState<string | null>(null)

  // Share prompt state (shown after pickup confirmation)
  const [showSharePrompt, setShowSharePrompt] = useState(false)
  const [shareVendors, setShareVendors] = useState<{ id: string; name: string }[]>([])

  // Inline status banners (replace browser alert())
  const [statusBanner, setStatusBanner] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Confirmation dialog state (replace browser confirm())
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    variant: 'default' | 'danger'
    showInput?: boolean
    inputLabel?: string
    inputPlaceholder?: string
    onConfirm: (input?: string) => void
  }>({
    open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {}
  })

  // Problem reporting state
  const [showProblemSection, setShowProblemSection] = useState(false)
  const [problemItems, setProblemItems] = useState<Record<string, boolean>>({})
  const [problemDescriptions, setProblemDescriptions] = useState<Record<string, string>>({})
  const [submittingProblems, setSubmittingProblems] = useState(false)

  // Show a status banner that auto-dismisses
  const showBanner = (message: string, type: 'success' | 'error') => {
    setStatusBanner({ message, type })
    setTimeout(() => setStatusBanner(null), 5000)
  }

  useEffect(() => {
    fetchOrder()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/buyer/orders/${orderId}`)
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/${vertical}/login?redirect=/${vertical}/buyer/orders/${orderId}`)
          return
        }
        setError({
          message: data.error || 'Order not found',
          code: data.code,
          traceId: data.traceId
        })
        return
      }
      setOrder(data.order)
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load order' })
    } finally {
      setLoading(false)
    }
  }

  const executeConfirmPickup = async (itemId: string) => {
    setConfirmingItemId(itemId)
    try {
      const res = await fetch(`/api/buyer/orders/${itemId}/confirm`, {
        method: 'POST'
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to confirm pickup')
      }

      // Collect unique vendors for share prompt
      if (order) {
        const vendorMap = new Map<string, { id: string; name: string }>()
        for (const item of order.items) {
          if (item.vendor_profile_id && !item.cancelled_at) {
            vendorMap.set(item.vendor_profile_id, {
              id: item.vendor_profile_id,
              name: item.vendor_name,
            })
          }
        }
        if (vendorMap.size > 0) {
          setShareVendors(Array.from(vendorMap.values()))
          setShowSharePrompt(true)
        }
      }

      // Refresh order to get updated status
      fetchOrder()
    } catch (err) {
      showBanner(err instanceof Error ? err.message : 'Failed to confirm pickup', 'error')
    } finally {
      setConfirmingItemId(null)
    }
  }

  const handleConfirmPickup = (itemId: string, skipDialog = false) => {
    if (skipDialog) {
      executeConfirmPickup(itemId)
      return
    }
    setConfirmDialog({
      open: true,
      title: t('order.confirm_pickup_title', locale),
      message: t('order.confirm_pickup_msg', locale),
      confirmLabel: t('order.confirm_received', locale),
      variant: 'default',
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        executeConfirmPickup(itemId)
      },
    })
  }

  const handleCancelItem = (itemId: string, itemStatus: string) => {
    const isConfirmed = ['confirmed', 'ready'].includes(itemStatus)
    const confirmMessage = isConfirmed
      ? t('order.cancel_confirmed_msg', locale)
      : t('order.cancel_pending_msg', locale)

    setConfirmDialog({
      open: true,
      title: t('order.cancel_title', locale),
      message: confirmMessage,
      confirmLabel: t('order.cancel_btn', locale),
      variant: 'danger',
      showInput: true,
      inputLabel: t('order.cancel_reason', locale),
      inputPlaceholder: t('order.cancel_placeholder', locale),
      onConfirm: async (reason?: string) => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setCancellingItemId(itemId)
        try {
          const res = await fetch(`/api/buyer/orders/${itemId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || '' })
          })

          const data = await res.json()

          if (!res.ok) {
            throw new Error(data.error || 'Failed to cancel item')
          }

          if (data.cancellation_fee_applied) {
            showBanner(t('order.cancel_fee_applied', locale, { amount: `$${(data.refund_amount_cents / 100).toFixed(2)}` }), 'success')
          } else {
            showBanner(t('order.cancel_success', locale), 'success')
          }

          await fetchOrder()
        } catch (err) {
          showBanner(err instanceof Error ? err.message : 'Failed to cancel item', 'error')
        } finally {
          setCancellingItemId(null)
        }
      },
    })
  }

  // TODO: Wire up report issue button in order detail UI
  const _handleReportIssue = (itemId: string) => {
    setConfirmDialog({
      open: true,
      title: t('order.report_title', locale),
      message: t('order.report_msg', locale),
      confirmLabel: t('order.report_btn', locale),
      variant: 'danger',
      showInput: true,
      inputLabel: t('order.report_label', locale),
      inputPlaceholder: t('order.report_placeholder', locale),
      onConfirm: async (description?: string) => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setReportingItemId(itemId)
        try {
          const res = await fetch(`/api/buyer/orders/${itemId}/report-issue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: description || 'Item not received' })
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to report issue')

          showBanner(t('order.report_submitted', locale), 'success')
          fetchOrder()
        } catch (err) {
          showBanner(err instanceof Error ? err.message : 'Failed to report issue', 'error')
        } finally {
          setReportingItemId(null)
        }
      },
    })
  }

  // Handle submitting all items at once (problems + received)
  const handleSubmitAllItems = (itemsNeedingConfirm: OrderItem[]) => {
    const problemItemIds = Object.keys(problemItems).filter(id => problemItems[id])

    // Validate that problem items have descriptions
    for (const itemId of problemItemIds) {
      if (!problemDescriptions[itemId]?.trim()) {
        showBanner(t('order.problem_desc_required', locale), 'error')
        return
      }
    }

    setConfirmDialog({
      open: true,
      title: t('order.receipt_title', locale),
      message: problemItemIds.length > 0
        ? t('order.receipt_msg_problems', locale)
        : t('order.receipt_msg', locale),
      confirmLabel: t('order.submit', locale),
      variant: 'default',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setSubmittingProblems(true)
        try {
          for (const item of itemsNeedingConfirm) {
            if (problemItems[item.id]) {
              await fetch(`/api/buyer/orders/${item.id}/report-issue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: problemDescriptions[item.id] })
              })
            } else {
              await fetch(`/api/buyer/orders/${item.id}/confirm`, {
                method: 'POST'
              })
            }
          }

          setProblemItems({})
          setProblemDescriptions({})
          setShowProblemSection(false)
          fetchOrder()

          if (problemItemIds.length > 0) {
            showBanner(t('order.receipt_submitted_problems', locale), 'success')
          }
        } catch (err) {
          showBanner(err instanceof Error ? err.message : 'Failed to submit', 'error')
        } finally {
          setSubmittingProblems(false)
        }
      },
    })
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase
      }}>
        <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base }}>{t('order.loading', locale)}</p>
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
        backgroundColor: colors.surfaceBase,
        gap: spacing.sm,
        padding: spacing.md
      }}>
        {error ? (
          <ErrorDisplay error={error} verticalId={vertical} />
        ) : (
          <p style={{ color: '#991b1b', fontSize: typography.sizes.base }}>{t('order.not_found', locale)}</p>
        )}
        <Link
          href={`/${vertical}/buyer/orders`}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: 'transparent',
            color: '#737373',
            textDecoration: 'none',
            borderRadius: radius.sm,
            fontWeight: typography.weights.semibold,
            fontSize: typography.sizes.base,
            border: '2px solid #737373'
          }}
        >
          {t('order.back', locale)}
        </Link>
      </div>
    )
  }

  // Compute effective order status from item statuses
  // Handles three fulfillment scenarios:
  // 1. Buyer confirmed receipt → 'fulfilled' (buyer initiated completion)
  // 2. Vendor fulfilled but buyer hasn't confirmed → 'handed_off' (needs buyer confirmation)
  // 3. Neither fulfilled → use item.status as-is
  const computeEffectiveStatus = () => {
    if (order.status === 'cancelled') return 'cancelled'
    if (order.items.length === 0) return order.status

    // Compute effective status per item
    const effectiveStatuses = order.items.map(i => {
      if (i.cancelled_at) return 'cancelled'
      if (i.buyer_confirmed_at) return 'fulfilled'
      if (i.status === 'fulfilled') return 'handed_off'
      return i.status
    })

    // Only consider non-cancelled items for order-level status
    const activeStatuses = effectiveStatuses.filter(s => s !== 'cancelled')

    if (activeStatuses.length === 0) return 'cancelled'
    if (activeStatuses.every(s => s === 'fulfilled')) return 'fulfilled'
    if (activeStatuses.some(s => s === 'handed_off')) return 'handed_off'
    if (activeStatuses.some(s => s === 'ready')) return 'ready'
    if (activeStatuses.every(s => s === 'confirmed')) return 'confirmed'
    // Some items fulfilled (picked up), rest still in progress
    if (activeStatuses.some(s => s === 'fulfilled')) {
      const remaining = activeStatuses.filter(s => s !== 'fulfilled')
      if (remaining.some(s => s === 'ready')) return 'ready'
      if (remaining.some(s => s === 'confirmed')) return 'confirmed'
      return 'pending'
    }
    return order.status === 'paid' ? 'pending' : order.status
  }

  const effectiveStatus = computeEffectiveStatus()

  // Group items by market
  const marketGroups = order.items.reduce((acc, item) => {
    const marketId = item.market.id
    if (!acc[marketId]) {
      acc[marketId] = {
        market: item.market,
        items: [],
        pickupDate: item.pickup_date,
        // Use display data from first item (from pickup_snapshot when available)
        display: item.display
      }
    }
    acc[marketId].items.push(item)
    return acc
  }, {} as Record<string, { market: Market; items: OrderItem[]; pickupDate: string | null; display: OrderItem['display'] }>)

  // Count metadata for partial readiness display
  const activeItems = order.items.filter(i => !i.cancelled_at)
  const readyCount = activeItems.filter(i => i.status === 'ready' && !i.buyer_confirmed_at).length
  const totalActiveCount = activeItems.length
  const isPartiallyReady = readyCount > 0 && readyCount < totalActiveCount
  const uniqueVendors = new Set(activeItems.map(i => i.vendor_name)).size
  const isMultiVendor = uniqueVendors > 1

  // Is this order in a pickup-ready state? Show the mobile pickup presentation
  const isPickupReady = ['ready', 'handed_off'].includes(effectiveStatus)
  // Get primary vendor/market for the hero section — prioritize ready items
  const primaryItem = order.items.find(i => i.status === 'ready' && !i.cancelled_at)
    || order.items.find(i => i.status === 'fulfilled' && !i.buyer_confirmed_at && !i.cancelled_at)
    || order.items.find(i => !i.cancelled_at && !i.buyer_confirmed_at)
    || order.items.find(i => !i.cancelled_at)
  const primaryVendor = primaryItem?.vendor_name || 'Vendor'
  const primaryMarket = primaryItem?.market?.name || 'Market'
  // Count items needing confirmation
  const itemsNeedingConfirm = order.items.filter(
    i => ['ready', 'fulfilled'].includes(i.status) && !i.buyer_confirmed_at && !i.cancelled_at
  )

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: isPickupReady ? `0 0 ${spacing.xl} 0` : `${spacing.xl} ${spacing.md}`
    }}>
      <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>

        {/* === PICKUP PRESENTATION MODE === */}
        {isPickupReady && (
          <>
            {/* Green Hero Section - ready for pickup */}
            <div style={{
              background: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
              color: 'white',
              padding: `${spacing.lg} ${spacing.md} ${spacing.md}`,
              textAlign: 'center',
            }}>
              {/* Back link - subtle */}
              <div style={{ textAlign: 'left', marginBottom: spacing.sm }}>
                <Link
                  href={`/${vertical}/buyer/orders`}
                  style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: typography.sizes.sm }}
                >
                  {t('order.back_arrow', locale)}
                </Link>
              </div>

              {/* Status badge */}
              <div style={{
                display: 'inline-block',
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: effectiveStatus === 'handed_off' ? '#f59e0b' : '#16a34a',
                borderRadius: radius.full,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.bold,
                marginBottom: spacing.sm,
                color: effectiveStatus === 'handed_off' ? '#000' : '#fff',
              }}>
                {effectiveStatus === 'handed_off' ? t('order.status_acknowledge', locale) : t('order.status_ready', locale)}
              </div>

              {/* Order Number - very prominent */}
              <p style={{
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.xs,
                textTransform: 'uppercase',
                letterSpacing: 2,
                opacity: 0.8
              }}>
                {t('order.order_number', locale)}
              </p>
              <p style={{
                margin: `0 0 ${spacing.sm} 0`,
                fontSize: '2.5rem',
                fontWeight: typography.weights.bold,
                fontFamily: 'monospace',
                letterSpacing: 3
              }}>
                {order.order_number || order.id.slice(0, 8).toUpperCase()}
              </p>

              {/* Market & Vendor - large text */}
              <p style={{
                margin: `0 0 ${spacing['3xs']} 0`,
                fontSize: typography.sizes.xl,
                fontWeight: typography.weights.bold
              }}>
                {primaryMarket}
              </p>
              <p style={{
                margin: `0 0 ${spacing.sm} 0`,
                fontSize: typography.sizes.lg,
                opacity: 0.9
              }}>
                {t('order.vendor_label', locale, { name: primaryVendor })}
              </p>

              {/* Payment method badge for external payments */}
              {order.payment_method && order.payment_method !== 'stripe' && (
                <div style={{
                  display: 'inline-block',
                  padding: `${spacing['3xs']} ${spacing.sm}`,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  marginBottom: spacing.sm,
                  border: '1px solid rgba(255,255,255,0.3)'
                }}>
                  {order.payment_method === 'cash' ? t('payment.cash', locale) :
                   order.payment_method === 'venmo' ? t('payment.venmo', locale) :
                   order.payment_method === 'cashapp' ? t('payment.cashapp', locale) :
                   order.payment_method === 'paypal' ? t('payment.paypal', locale) :
                   order.payment_method}
                </div>
              )}

              {/* Item count — with partial readiness context */}
              <p style={{
                margin: 0,
                fontSize: typography.sizes.sm,
                opacity: 0.8
              }}>
                {isPartiallyReady
                  ? t('order.items_partial', locale, { ready: String(readyCount), total: String(totalActiveCount) })
                  : totalActiveCount !== 1
                    ? t('order.items_count', locale, { count: String(totalActiveCount) })
                    : t('order.item_count', locale)
                }
                {isMultiVendor && ` • ${t('order.vendors_count', locale, { count: String(uniqueVendors) })}`}
              </p>
            </div>

            {/* Big Acknowledge Receipt Button - immediately below hero */}
            {itemsNeedingConfirm.length > 0 && !showProblemSection && (
              <div style={{ padding: `${spacing.sm} ${spacing.md}`, backgroundColor: colors.primaryLight, borderBottom: `2px solid ${colors.primary}` }}>
                <button
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: t('order.acknowledge_title', locale),
                      message: t('order.acknowledge_msg', locale),
                      confirmLabel: t('order.confirm_all', locale),
                      variant: 'default',
                      onConfirm: () => {
                        setConfirmDialog(prev => ({ ...prev, open: false }))
                        itemsNeedingConfirm.forEach(item => handleConfirmPickup(item.id, true))
                      },
                    })
                  }}
                  disabled={confirmingItemId !== null}
                  style={{
                    width: '100%',
                    padding: `${spacing.sm} ${spacing.md}`,
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.bold,
                    backgroundColor: confirmingItemId ? '#9ca3af' : colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.md,
                    cursor: confirmingItemId ? 'not-allowed' : 'pointer',
                    minHeight: 56,
                    boxShadow: shadows.primary,
                  }}
                >
                  {confirmingItemId ? t('order.confirming', locale) : itemsNeedingConfirm.length !== 1
                    ? t('order.acknowledge_btn', locale, { count: String(itemsNeedingConfirm.length) })
                    : t('order.acknowledge_btn_one', locale)
                  }
                </button>
                <p style={{
                  margin: `${spacing.xs} 0 0 0`,
                  fontSize: typography.sizes.sm,
                  color: colors.primaryDark,
                  textAlign: 'center'
                }}>
                  {t('order.confirm_hint', locale)}
                </p>
                <p style={{
                  margin: `${spacing['2xs']} 0 0 0`,
                  fontSize: typography.sizes.xs,
                  color: '#6b7280',
                  textAlign: 'center'
                }}>
                  {t('order.vendor_fulfill_hint', locale)}
                </p>
                <button
                  onClick={() => setShowProblemSection(true)}
                  style={{
                    display: 'block',
                    margin: `${spacing.xs} auto 0`,
                    padding: `${spacing['2xs']} ${spacing.sm}`,
                    backgroundColor: 'transparent',
                    color: '#b45309',
                    border: 'none',
                    fontSize: typography.sizes.sm,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  {t('order.problem_link', locale)}
                </button>
              </div>
            )}

            {/* Problem Reporting Section */}
            {itemsNeedingConfirm.length > 0 && showProblemSection && (
              <div style={{ padding: `${spacing.sm} ${spacing.md}`, backgroundColor: '#fef3c7', borderBottom: '2px solid #f59e0b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <h3 style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: '#92400e' }}>
                    {t('order.problem_title', locale)}
                  </h3>
                  <button
                    onClick={() => {
                      setShowProblemSection(false)
                      setProblemItems({})
                      setProblemDescriptions({})
                    }}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: 'transparent',
                      color: '#92400e',
                      border: '1px solid #f59e0b',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      cursor: 'pointer'
                    }}
                  >
                    {t('order.problem_cancel', locale)}
                  </button>
                </div>
                <p style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.sm, color: '#78350f' }}>
                  {t('order.problem_hint', locale)}
                </p>

                {/* Simplified Item List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {itemsNeedingConfirm.map(item => (
                    <div key={item.id} style={{
                      padding: spacing.xs,
                      backgroundColor: problemItems[item.id] ? '#fef2f2' : 'white',
                      borderRadius: radius.sm,
                      border: `1px solid ${problemItems[item.id] ? '#fca5a5' : colors.border}`
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={problemItems[item.id] || false}
                          onChange={(e) => {
                            setProblemItems(prev => ({ ...prev, [item.id]: e.target.checked }))
                            if (!e.target.checked) {
                              setProblemDescriptions(prev => {
                                const next = { ...prev }
                                delete next[item.id]
                                return next
                              })
                            }
                          }}
                          style={{ width: 18, height: 18, accentColor: '#dc2626' }}
                        />
                        <span style={{ flex: 1, fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                          <strong>{item.listing_title}</strong> (Qty: {item.quantity})
                        </span>
                      </label>
                      {problemItems[item.id] && (
                        <div style={{ marginTop: spacing.xs, marginLeft: 26 }}>
                          <input
                            type="text"
                            placeholder={t('order.problem_placeholder', locale)}
                            value={problemDescriptions[item.id] || ''}
                            onChange={(e) => setProblemDescriptions(prev => ({ ...prev, [item.id]: e.target.value }))}
                            style={{
                              width: '100%',
                              padding: spacing['2xs'],
                              border: '1px solid #fca5a5',
                              borderRadius: radius.sm,
                              fontSize: typography.sizes.sm
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Submit Button */}
                <button
                  onClick={() => handleSubmitAllItems(itemsNeedingConfirm)}
                  disabled={submittingProblems}
                  style={{
                    width: '100%',
                    marginTop: spacing.sm,
                    padding: `${spacing.xs} ${spacing.md}`,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    backgroundColor: submittingProblems ? '#9ca3af' : '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.md,
                    cursor: submittingProblems ? 'not-allowed' : 'pointer',
                    minHeight: 48
                  }}
                >
                  {submittingProblems ? t('order.submitting', locale) : t('order.submit', locale)}
                </button>
              </div>
            )}

          </>
        )}

        {/* === STANDARD HEADER (non-pickup states) === */}
        {!isPickupReady && (
          <>
            {/* Back Link */}
            <Link
              href={`/${vertical}/buyer/orders`}
              style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
            >
              {t('order.back_arrow', locale)}
            </Link>

            {/* Status Info Banner */}
            {(() => {
              const primaryVendorName = order.items.find(i => !i.cancelled_at)?.vendor_name || 'the vendor'
              const bannerConfig: Record<string, { bg: string; border: string; color: string; text: string }> = {
                pending: {
                  bg: '#fffbeb', border: '#fde68a', color: '#92400e',
                  text: t('order.banner_pending', locale, { vendor: primaryVendorName })
                },
                confirmed: {
                  bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46',
                  text: t('order.banner_confirmed', locale, { vendor: primaryVendorName })
                },
                ready: {
                  bg: '#eff6ff', border: '#93c5fd', color: '#1e40af',
                  text: t('order.banner_ready', locale)
                },
                cancelled: (() => {
                  const buyerCancelled = order.items.some(i => i.cancelled_by === 'buyer')
                  const isExternal = order.payment_method && !['stripe'].includes(order.payment_method)
                  if (buyerCancelled) {
                    return {
                      bg: '#fef2f2', border: '#fca5a5', color: '#991b1b',
                      text: isExternal
                        ? t('order.banner_cancelled_buyer', locale)
                        : t('order.banner_cancelled_buyer_refund', locale)
                    }
                  }
                  return {
                    bg: '#fef2f2', border: '#fca5a5', color: '#991b1b',
                    text: isExternal
                      ? t('order.banner_cancelled_vendor', locale, { vendor: primaryVendorName })
                      : t('order.banner_cancelled_vendor_refund', locale, { vendor: primaryVendorName })
                  }
                })(),
                fulfilled: {
                  bg: '#f5f3ff', border: '#c4b5fd', color: '#5b21b6',
                  text: t('order.banner_fulfilled', locale)
                },
              }
              const config = bannerConfig[effectiveStatus]
              if (!config) return null
              return (
                <div style={{
                  marginTop: spacing.sm,
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: config.bg,
                  border: `1px solid ${config.border}`,
                  borderRadius: radius.md,
                  color: config.color,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                  lineHeight: typography.leading.relaxed,
                }}>
                  {config.text}
                </div>
              )
            })()}

            {/* Header with Order Number + Status + Dates */}
            <div style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
              {/* Large Order Number Box */}
              <div style={{
                backgroundColor: colors.textPrimary,
                color: colors.textInverse,
                padding: `${spacing.sm} ${spacing.md}`,
                borderRadius: radius.md,
                marginBottom: spacing.sm,
                display: 'inline-block'
              }}>
                <p style={{ margin: 0, fontSize: typography.sizes.xs, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.7 }}>
                  {t('order.order_number', locale)}
                </p>
                <p style={{
                  margin: `${spacing['3xs']} 0 0 0`,
                  fontSize: typography.sizes['3xl'],
                  fontWeight: typography.weights.bold,
                  fontFamily: 'monospace',
                  letterSpacing: 2
                }}>
                  {order.order_number || order.id.slice(0, 8).toUpperCase()}
                </p>
              </div>

              {/* Status Summary - inline in header */}
              <OrderStatusSummary
                status={effectiveStatus}
                updatedAt={order.updated_at}
                readyCount={readyCount}
                totalActiveCount={totalActiveCount}
              />

              {/* Placed + Last Updated dates */}
              <p style={{ color: colors.textMuted, margin: `0 0 ${spacing['3xs']} 0`, fontSize: typography.sizes.sm }}>
                {t('order.placed', locale)} {new Date(order.created_at).toLocaleDateString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                  year: '2-digit'
                })} {new Date(order.created_at).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </p>
              <p style={{ color: colors.textMuted, margin: 0, fontSize: typography.sizes.sm }}>
                {t('order.last_updated', locale)} {new Date(order.updated_at).toLocaleDateString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                  year: '2-digit'
                })} {new Date(order.updated_at).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </>
        )}

        {/* Content below hero gets horizontal padding in pickup mode */}
        <div style={isPickupReady ? { padding: `${spacing.sm} ${spacing.md} 0` } : undefined}>
        {/* Timeline */}
        <OrderTimeline
          status={effectiveStatus}
          createdAt={order.created_at}
          updatedAt={order.updated_at}
        />

        {/* Items by Market */}
        {Object.entries(marketGroups).map(([marketId, group]) => (
          <div key={marketId} style={{ marginBottom: spacing.md }}>
            {/* Pickup Details */}
            <PickupDetails
              market={group.market}
              pickupDate={group.pickupDate}
              display={group.display}
            />

            {/* Items for this Market */}
            <div style={{
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md
            }}>
              <h3 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, marginBottom: spacing.sm, marginTop: 0, color: colors.textSecondary }}>
                {t('order.items_from', locale, { market: group.display?.market_name || group.market.name })}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {group.items.map(item => {
                  // Determine effective item status
                  let effectiveItemStatus = item.status
                  if (item.cancelled_at) {
                    effectiveItemStatus = 'cancelled'
                  } else if (item.buyer_confirmed_at) {
                    effectiveItemStatus = 'fulfilled'
                  } else if (item.status === 'fulfilled') {
                    effectiveItemStatus = 'handed_off'
                  }

                  const statusLabel =
                    effectiveItemStatus === 'cancelled' ? t('order.item_status_cancelled', locale) :
                    effectiveItemStatus === 'fulfilled' ? t('order.item_status_picked_up', locale) :
                    effectiveItemStatus === 'handed_off' ? t('order.item_status_handed', locale) :
                    effectiveItemStatus === 'ready' ? t('order.item_status_ready', locale) :
                    effectiveItemStatus === 'confirmed' ? t('order.item_status_preparing', locale) :
                    effectiveItemStatus.charAt(0).toUpperCase() + effectiveItemStatus.slice(1)

                  const statusColor =
                    effectiveItemStatus === 'cancelled' ? '#991b1b' :
                    effectiveItemStatus === 'fulfilled' ? colors.primaryDark :
                    effectiveItemStatus === 'handed_off' ? '#b45309' :
                    effectiveItemStatus === 'ready' ? colors.accent :
                    effectiveItemStatus === 'confirmed' ? colors.accent :
                    colors.textSecondary

                  return (
                  <div key={item.id} style={{
                    paddingBottom: spacing.sm,
                    borderBottom: `1px solid ${colors.borderMuted}`
                  }}>
                    <h4 style={{ margin: `0 0 ${spacing['3xs']} 0`, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                      {item.listing_title}
                      {formatQuantityDisplay(item.quantity_amount, item.quantity_unit) && (
                        <span style={{ fontWeight: typography.weights.normal, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                          {' '}({formatQuantityDisplay(item.quantity_amount, item.quantity_unit)})
                        </span>
                      )}
                    </h4>
                    <p style={{ margin: `0 0 ${spacing['2xs']} 0`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                      {t('order.by_vendor', locale, { name: item.vendor_name })}
                    </p>
                    {(item.display?.pickup_date || item.pickup_date) && (
                      <p style={{ margin: `0 0 ${spacing['2xs']} 0`, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {t('order.scheduled_pickup', locale)} {formatPickupDate(item.display?.pickup_date || item.pickup_date)}
                        {formatPickupTime12h(item.preferred_pickup_time)
                          ? ` at ${formatPickupTime12h(item.preferred_pickup_time)}`
                          : ''}
                      </p>
                    )}
                    <p style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                      {t('order.quantity_label', locale)} {item.quantity} × {formatPrice(calculateDisplayPrice(item.unit_price_cents))} = <strong>{formatPrice(calculateDisplayPrice(item.subtotal_cents))}</strong>
                    </p>

                    {/* Status + Cancel on same row */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.xs,
                      flexWrap: 'wrap'
                    }}>
                      <span style={{
                        fontSize: typography.sizes.sm,
                        color: statusColor,
                        fontWeight: typography.weights.semibold,
                      }}>
                        {t('order.status_label', locale)} {statusLabel}
                      </span>

                      {/* Cancel Button - on same row as status */}
                      {!['completed', 'cancelled', 'fulfilled'].includes(effectiveStatus) &&
                       ['pending', 'paid', 'confirmed', 'ready'].includes(item.status) &&
                       !item.cancelled_at &&
                       !item.buyer_confirmed_at && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCancelItem(item.id, item.status) }}
                          disabled={cancellingItemId === item.id}
                          style={{
                            padding: `${spacing['3xs']} ${spacing.sm}`,
                            backgroundColor: cancellingItemId === item.id ? colors.textMuted : '#dc2626',
                            color: colors.textInverse,
                            border: 'none',
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.semibold,
                            cursor: cancellingItemId === item.id ? 'not-allowed' : 'pointer',
                            marginLeft: 'auto'
                          }}
                        >
                          {cancellingItemId === item.id ? t('order.cancelling', locale) : t('order.cancel_btn', locale)}
                        </button>
                      )}
                    </div>

                    {/* Cancellation fee warning */}
                    {!['completed', 'cancelled', 'fulfilled'].includes(effectiveStatus) &&
                     ['confirmed', 'ready'].includes(item.status) &&
                     !item.cancelled_at &&
                     !item.buyer_confirmed_at && (
                      <span style={{
                        fontSize: typography.sizes.xs,
                        color: '#991b1b',
                        fontStyle: 'italic'
                      }}>
                        {t('order.cancel_fee_warning', locale)}
                      </span>
                    )}

                    {/* Cancellation Info */}
                    {item.cancelled_at && (
                      <div style={{
                        padding: `${spacing['2xs']} ${spacing.xs}`,
                        backgroundColor: '#fef2f2',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        color: '#991b1b',
                        marginTop: spacing['2xs']
                      }}>
                        <p style={{ margin: 0, fontWeight: typography.weights.semibold }}>
                          {item.cancelled_by === 'vendor' ? t('order.cancelled_by_vendor', locale) : t('order.cancelled_by_you', locale)}
                        </p>
                        {item.cancellation_reason && (
                          <p style={{ margin: `${spacing['3xs']} 0 0 0` }}>
                            {t('order.reason', locale)} {item.cancellation_reason}
                          </p>
                        )}
                        {item.refund_amount_cents && (
                          <p style={{ margin: `${spacing['3xs']} 0 0 0`, fontWeight: typography.weights.medium }}>
                            {t('order.refund', locale)} {formatPrice(item.refund_amount_cents)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Issue Already Reported Badge */}
                    {item.issue_reported_at && !item.cancelled_at && (
                      <div style={{
                        padding: `${spacing['2xs']} ${spacing.xs}`,
                        backgroundColor: '#fef3c7',
                        border: '1px solid #f59e0b',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        color: '#92400e',
                        marginTop: spacing['2xs']
                      }}>
                        {t('order.issue_reported', locale, { date: new Date(item.issue_reported_at).toLocaleDateString() })}
                      </div>
                    )}

                    {/* Status message for items awaiting confirmation */}
                    {['ready', 'fulfilled'].includes(item.status) && !item.buyer_confirmed_at && !item.cancelled_at && !item.issue_reported_at && (
                      <p style={{
                        margin: `${spacing['2xs']} 0 0 0`,
                        fontSize: typography.sizes.xs,
                        color: item.status === 'fulfilled' ? '#b45309' : colors.textMuted,
                        fontStyle: 'italic'
                      }}>
                        {item.status === 'fulfilled'
                          ? t('order.vendor_handed_hint', locale)
                          : t('order.ready_hint', locale)}
                      </p>
                    )}
                  </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Service Fee + Order Total */}
        {(() => {
          // Calculate totals from items (using buyer-facing prices, excluding cancelled)
          // Sum subtotals first, then apply buyer price (includes flat fee once)
          const activeItemsSubtotal = order.items.reduce((sum, item) =>
            item.cancelled_at ? sum : sum + item.subtotal_cents, 0
          )
          const itemsSubtotal = calculateBuyerPrice(activeItemsSubtotal)
          return (
            <div style={{
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
            }}>
              {/* Service Fee */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: spacing.xs,
                marginBottom: spacing.xs,
                borderBottom: `1px solid ${colors.borderMuted}`,
              }}>
                <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                  {t('order.service_fee', locale)}
                </span>
                <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                  {formatPrice(FEES.buyerFlatFeeCents)}
                </span>
              </div>
              {/* Tip (if any) */}
              {order.tip_amount > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                    {t('order.tip', locale, { percent: String(order.tip_percentage) })}
                  </span>
                  <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                    {formatPrice(order.tip_amount)}
                  </span>
                </div>
              )}
              {/* Total */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                  {t('order.total', locale)}
                </span>
                <span style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                  {formatPrice(itemsSubtotal)}
                </span>
              </div>
            </div>
          )
        })()}
        </div>{/* end content padding wrapper */}

      </div>

      {/* Share Prompt - shown after pickup confirmation */}
      {showSharePrompt && shareVendors.length > 0 && (
        <PostPurchaseSharePrompt
          vendors={shareVendors}
          vertical={vertical}
          onClose={() => setShowSharePrompt(false)}
        />
      )}

      {/* Status Banner — replaces browser alert() */}
      {statusBanner && (
        <div style={{
          position: 'fixed',
          bottom: spacing.md,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: `${spacing.xs} ${spacing.lg}`,
          backgroundColor: statusBanner.type === 'error' ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${statusBanner.type === 'error' ? '#fca5a5' : '#6ee7b7'}`,
          color: statusBanner.type === 'error' ? '#991b1b' : '#065f46',
          borderRadius: radius.md,
          boxShadow: shadows.lg,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.medium,
          zIndex: 1000,
          maxWidth: '90vw',
          textAlign: 'center',
        }}>
          {statusBanner.message}
          <button
            onClick={() => setStatusBanner(null)}
            style={{
              marginLeft: spacing.xs,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.bold,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Confirm Dialog — replaces browser confirm() */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        showInput={confirmDialog.showInput}
        inputLabel={confirmDialog.inputLabel}
        inputPlaceholder={confirmDialog.inputPlaceholder}
        onConfirm={(input) => confirmDialog.onConfirm(input)}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </div>
  )
}
