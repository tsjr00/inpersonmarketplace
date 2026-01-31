'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import OrderStatusSummary from '@/components/buyer/OrderStatusSummary'
import OrderTimeline from '@/components/buyer/OrderTimeline'
import PickupDetails from '@/components/buyer/PickupDetails'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { formatPrice, calculateDisplayPrice } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  status: string
  vendor_name: string
  vendor_email: string | null
  vendor_phone: string | null
  market: Market
  pickup_date: string | null
  buyer_confirmed_at: string | null
  vendor_confirmed_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  refund_amount_cents: number | null
  confirmation_window_expires_at: string | null
  lockdown_active: boolean
  issue_reported_at: string | null
  issue_reported_by: string | null
  issue_description: string | null
}

interface OrderDetail {
  id: string
  order_number: string
  status: string
  total_cents: number
  created_at: string
  updated_at: string
  items: OrderItem[]
}

export default function BuyerOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const orderId = params.id as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null)
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null)
  const [reportingItemId, setReportingItemId] = useState<string | null>(null)

  useEffect(() => {
    fetchOrder()
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

  const handleConfirmPickup = async (itemId: string) => {
    if (!confirm('Confirm you have received this item? This cannot be undone.')) {
      return
    }

    setConfirmingItemId(itemId)
    try {
      const res = await fetch(`/api/buyer/orders/${itemId}/confirm`, {
        method: 'POST'
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to confirm pickup')
      }

      // Refresh order to get updated status
      fetchOrder()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to confirm pickup')
    } finally {
      setConfirmingItemId(null)
    }
  }

  const handleCancelItem = async (itemId: string, itemStatus: string) => {
    const isConfirmed = ['confirmed', 'ready'].includes(itemStatus)

    const reason = prompt('Why do you want to cancel this item? (optional)')
    if (reason === null) {
      // User clicked Cancel on prompt
      return
    }

    const confirmMessage = isConfirmed
      ? 'This order has been confirmed by the vendor. A cancellation/restocking fee of up to 50% may apply. Are you sure you want to cancel?'
      : 'Are you sure you want to cancel this item? You will receive a full refund.'

    if (!confirm(confirmMessage)) {
      return
    }

    setCancellingItemId(itemId)
    try {
      const res = await fetch(`/api/buyer/orders/${itemId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel item')
      }

      // Show result message
      if (data.cancellation_fee_applied) {
        alert(`Item cancelled. A cancellation fee was applied. Refund amount: $${(data.refund_amount_cents / 100).toFixed(2)}`)
      }

      // Refresh order to get updated status
      fetchOrder()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel item')
    } finally {
      setCancellingItemId(null)
    }
  }

  const handleReportIssue = async (itemId: string) => {
    const description = prompt('Describe the issue (e.g., "I did not receive this item", "Wrong item received"):')
    if (description === null) return

    setReportingItemId(itemId)
    try {
      const res = await fetch(`/api/buyer/orders/${itemId}/report-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description || 'Item not received' })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to report issue')

      alert('Issue reported. Our support team will review and contact you.')
      fetchOrder()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to report issue')
    } finally {
      setReportingItemId(null)
    }
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
        <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base }}>Loading order details...</p>
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
          <p style={{ color: '#991b1b', fontSize: typography.sizes.base }}>Order not found</p>
        )}
        <Link
          href={`/${vertical}/buyer/orders`}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: colors.primary,
            color: colors.textInverse,
            textDecoration: 'none',
            borderRadius: radius.sm,
            fontWeight: typography.weights.semibold,
            fontSize: typography.sizes.base
          }}
        >
          Back to Orders
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
      // Buyer confirmed = fully fulfilled
      if (i.buyer_confirmed_at) return 'fulfilled'
      // Vendor fulfilled but buyer hasn't confirmed = handed_off
      if (i.status === 'fulfilled') return 'handed_off'
      return i.status
    })

    // If ALL items are fulfilled (buyer confirmed), order is fulfilled
    if (effectiveStatuses.every(s => s === 'fulfilled')) return 'fulfilled'

    // If ANY item is handed_off (vendor fulfilled, awaiting buyer), show handed_off
    if (effectiveStatuses.some(s => s === 'handed_off')) return 'handed_off'

    // If ANY item is ready (and none cancelled), show ready
    if (effectiveStatuses.some(s => s === 'ready') && !effectiveStatuses.some(s => s === 'cancelled')) return 'ready'

    // If ANY item is confirmed (and none cancelled/ready), show confirmed
    if (effectiveStatuses.some(s => s === 'confirmed') && !effectiveStatuses.some(s => ['cancelled', 'ready'].includes(s))) return 'confirmed'

    // Default to payment status (pending/paid)
    return order.status
  }

  const effectiveStatus = computeEffectiveStatus()

  // Group items by market
  const marketGroups = order.items.reduce((acc, item) => {
    const marketId = item.market.id
    if (!acc[marketId]) {
      acc[marketId] = {
        market: item.market,
        items: [],
        pickupDate: item.pickup_date
      }
    }
    acc[marketId].items.push(item)
    return acc
  }, {} as Record<string, { market: Market; items: OrderItem[]; pickupDate: string | null }>)

  // Is this order in a pickup-ready state? Show the mobile pickup presentation
  const isPickupReady = ['ready', 'handed_off'].includes(effectiveStatus)
  // Get primary vendor/market for the hero section
  const primaryItem = order.items.find(i => !i.cancelled_at)
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
            {/* Green Hero Section - designed for showing to vendor */}
            <div style={{
              background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #16a34a 100%)',
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
                  ← Back to Orders
                </Link>
              </div>

              {/* Status badge */}
              <div style={{
                display: 'inline-block',
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: effectiveStatus === 'handed_off' ? '#f59e0b' : 'rgba(255,255,255,0.2)',
                borderRadius: radius.full,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.bold,
                marginBottom: spacing.sm,
                color: effectiveStatus === 'handed_off' ? '#000' : '#fff',
              }}>
                {effectiveStatus === 'handed_off' ? 'ACKNOWLEDGE YOUR PICKUP' : 'READY FOR PICKUP'}
              </div>

              {/* Order Number - very prominent */}
              <p style={{
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.xs,
                textTransform: 'uppercase',
                letterSpacing: 2,
                opacity: 0.8
              }}>
                Order Number
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
                Vendor: {primaryVendor}
              </p>

              {/* Item count */}
              <p style={{
                margin: 0,
                fontSize: typography.sizes.sm,
                opacity: 0.8
              }}>
                {order.items.filter(i => !i.cancelled_at).length} item{order.items.filter(i => !i.cancelled_at).length !== 1 ? 's' : ''} in this order
              </p>
            </div>

            {/* Big Acknowledge Receipt Button - immediately below hero */}
            {itemsNeedingConfirm.length > 0 && (
              <div style={{ padding: `${spacing.sm} ${spacing.md}`, backgroundColor: '#f0fdf4', borderBottom: '2px solid #16a34a' }}>
                <button
                  onClick={() => {
                    // Confirm all ready items at once
                    if (confirm('Confirm you have received all items from this order? This cannot be undone.')) {
                      itemsNeedingConfirm.forEach(item => handleConfirmPickup(item.id))
                    }
                  }}
                  disabled={confirmingItemId !== null}
                  style={{
                    width: '100%',
                    padding: `${spacing.sm} ${spacing.md}`,
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.bold,
                    backgroundColor: confirmingItemId ? '#9ca3af' : '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.md,
                    cursor: confirmingItemId ? 'not-allowed' : 'pointer',
                    minHeight: 56,
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)',
                  }}
                >
                  {confirmingItemId ? 'Confirming...' : `Acknowledge Receipt (${itemsNeedingConfirm.length} item${itemsNeedingConfirm.length !== 1 ? 's' : ''})`}
                </button>
                <p style={{
                  margin: `${spacing.xs} 0 0 0`,
                  fontSize: typography.sizes.sm,
                  color: '#166534',
                  textAlign: 'center',
                  fontStyle: 'italic'
                }}>
                  Only confirm after you have all items in hand.
                </p>
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
              ← Back to Orders
            </Link>

            {/* Header with Prominent Order Number */}
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
                  Order Number
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
              <p style={{ color: colors.textMuted, margin: 0, fontSize: typography.sizes.base }}>
                Placed on {new Date(order.created_at).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          </>
        )}

        {/* Content below hero gets horizontal padding in pickup mode */}
        <div style={isPickupReady ? { padding: `${spacing.sm} ${spacing.md} 0` } : undefined}>
        {/* Status Summary */}
        <OrderStatusSummary status={effectiveStatus} updatedAt={order.updated_at} />

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
            />

            {/* Items for this Market */}
            <div style={{
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md
            }}>
              <h3 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, marginBottom: spacing.sm, marginTop: 0, color: colors.textSecondary }}>
                Items from {group.market.name}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {group.items.map(item => (
                  <div key={item.id} style={{
                    display: 'flex',
                    gap: spacing.sm,
                    paddingBottom: spacing.sm,
                    borderBottom: `1px solid ${colors.borderMuted}`
                  }}>
                    {/* Image */}
                    <div style={{
                      width: 80,
                      height: 80,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.sm,
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      {item.listing_image ? (
                        <img
                          src={item.listing_image}
                          alt={item.listing_title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: typography.sizes['2xl']
                        }}>
                          📦
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: `0 0 ${spacing['3xs']} 0`, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                        {item.listing_title}
                      </h4>
                      <p style={{ margin: `0 0 ${spacing['2xs']} 0`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                        by {item.vendor_name}
                      </p>
                      <p style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        Quantity: {item.quantity} × {formatPrice(calculateDisplayPrice(item.unit_price_cents))} = <strong>{formatPrice(calculateDisplayPrice(item.subtotal_cents))}</strong>
                      </p>

                      {/* Item Status & Confirmation */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.xs,
                        flexWrap: 'wrap'
                      }}>
                        {/* Status Badge - show effective status considering buyer confirmation */}
                        {(() => {
                          // Determine effective item status:
                          // - If buyer confirmed → fulfilled (picked up)
                          // - If vendor fulfilled but buyer hasn't confirmed → handed_off
                          // - Otherwise use item.status
                          let effectiveItemStatus = item.status
                          if (item.cancelled_at) {
                            effectiveItemStatus = 'cancelled'
                          } else if (item.buyer_confirmed_at) {
                            effectiveItemStatus = 'fulfilled'
                          } else if (item.status === 'fulfilled') {
                            effectiveItemStatus = 'handed_off'
                          }

                          return (
                            <span style={{
                              padding: `${spacing['3xs']} ${spacing.xs}`,
                              borderRadius: radius.sm,
                              fontSize: typography.sizes.xs,
                              fontWeight: typography.weights.semibold,
                              backgroundColor:
                                effectiveItemStatus === 'cancelled' ? '#fee2e2' :
                                effectiveItemStatus === 'fulfilled' ? colors.primaryLight :
                                effectiveItemStatus === 'handed_off' ? '#fef3c7' :
                                effectiveItemStatus === 'ready' ? colors.surfaceSubtle :
                                effectiveItemStatus === 'confirmed' ? colors.surfaceSubtle :
                                colors.surfaceMuted,
                              color:
                                effectiveItemStatus === 'cancelled' ? '#991b1b' :
                                effectiveItemStatus === 'fulfilled' ? colors.primaryDark :
                                effectiveItemStatus === 'handed_off' ? '#b45309' :
                                effectiveItemStatus === 'ready' ? colors.accent :
                                effectiveItemStatus === 'confirmed' ? colors.accent :
                                colors.textSecondary
                            }}>
                              {effectiveItemStatus === 'cancelled' ? 'Cancelled' :
                               effectiveItemStatus === 'fulfilled' ? 'Picked Up' :
                               effectiveItemStatus === 'handed_off' ? 'Vendor Handed Off' :
                               effectiveItemStatus === 'ready' ? 'Ready for Pickup' :
                               effectiveItemStatus === 'confirmed' ? 'Preparing' :
                               effectiveItemStatus.charAt(0).toUpperCase() + effectiveItemStatus.slice(1)}
                            </span>
                          )
                        })()}

                        {/* Cancellation Info */}
                        {item.cancelled_at && (
                          <div style={{
                            padding: `${spacing['2xs']} ${spacing.xs}`,
                            backgroundColor: '#fef2f2',
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            color: '#991b1b',
                            width: '100%'
                          }}>
                            <p style={{ margin: 0, fontWeight: typography.weights.semibold }}>
                              {item.cancelled_by === 'vendor' ? 'Cancelled by vendor' : 'You cancelled this item'}
                            </p>
                            {item.cancellation_reason && (
                              <p style={{ margin: `${spacing['3xs']} 0 0 0` }}>
                                Reason: {item.cancellation_reason}
                              </p>
                            )}
                            {item.refund_amount_cents && (
                              <p style={{ margin: `${spacing['3xs']} 0 0 0`, fontWeight: typography.weights.medium }}>
                                Refund: {formatPrice(item.refund_amount_cents)}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Buyer Confirmed Badge - only show if status badge doesn't already indicate pickup */}
                        {/* Since we now show "Picked Up" when buyer confirmed, this would be redundant */}
                        {/* Keeping this hidden but can be re-enabled if needed for clarity */}

                        {/* Confirm Button - show when ready/fulfilled and not yet confirmed */}
                        {['ready', 'fulfilled'].includes(item.status) && !item.buyer_confirmed_at && !item.cancelled_at && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: spacing['3xs'] }}>
                            <button
                              onClick={() => handleConfirmPickup(item.id)}
                              disabled={confirmingItemId === item.id}
                              style={{
                                padding: `${spacing['2xs']} ${spacing.sm}`,
                                backgroundColor: confirmingItemId === item.id ? colors.textMuted : (item.status === 'fulfilled' ? '#f59e0b' : colors.primary),
                                color: colors.textInverse,
                                border: 'none',
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.sm,
                                fontWeight: typography.weights.semibold,
                                cursor: confirmingItemId === item.id ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: spacing['3xs']
                              }}
                            >
                              {confirmingItemId === item.id ? (
                                'Confirming...'
                              ) : (
                                <>
                                  <span>✓</span> {item.status === 'fulfilled' ? 'Yes, I Received It' : 'Acknowledge Receipt'}
                                </>
                              )}
                            </button>
                            <span style={{
                              fontSize: typography.sizes.xs,
                              color: item.status === 'fulfilled' ? '#b45309' : colors.textMuted,
                              fontStyle: 'italic',
                              maxWidth: 220
                            }}>
                              {item.status === 'fulfilled'
                                ? 'Vendor marked this as handed to you. Please confirm if you received it.'
                                : 'Only confirm after you have the item in hand.'}
                            </span>
                            {/* Report Issue button - alternative to confirming */}
                            <button
                              onClick={() => handleReportIssue(item.id)}
                              disabled={reportingItemId === item.id}
                              style={{
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                backgroundColor: 'transparent',
                                color: '#991b1b',
                                border: '1px solid #fca5a5',
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.xs,
                                cursor: reportingItemId === item.id ? 'not-allowed' : 'pointer',
                                marginTop: spacing['2xs']
                              }}
                            >
                              {reportingItemId === item.id ? 'Reporting...' : 'I Did Not Receive This'}
                            </button>
                          </div>
                        )}

                        {/* Cancel Button - show for pending/paid (free cancel) and confirmed/ready (with fee) */}
                        {/* Not available for completed orders, fulfilled items, or after buyer confirms receipt */}
                        {!['completed', 'cancelled', 'fulfilled'].includes(effectiveStatus) &&
                         ['pending', 'paid', 'confirmed', 'ready'].includes(item.status) &&
                         !item.cancelled_at &&
                         !item.buyer_confirmed_at && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: spacing['3xs'] }}>
                            <button
                              onClick={() => handleCancelItem(item.id, item.status)}
                              disabled={cancellingItemId === item.id}
                              style={{
                                padding: `${spacing['2xs']} ${spacing.sm}`,
                                backgroundColor: cancellingItemId === item.id ? colors.textMuted : '#dc2626',
                                color: colors.textInverse,
                                border: 'none',
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.sm,
                                fontWeight: typography.weights.semibold,
                                cursor: cancellingItemId === item.id ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: spacing['3xs']
                              }}
                            >
                              {cancellingItemId === item.id ? 'Cancelling...' : 'Cancel Item'}
                            </button>
                            {['confirmed', 'ready'].includes(item.status) && (
                              <span style={{
                                fontSize: typography.sizes.xs,
                                color: '#991b1b',
                                fontStyle: 'italic'
                              }}>
                                Cancellation/restocking fee may apply
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Order Total with Breakdown */}
        {(() => {
          // Calculate totals from items (using buyer-facing prices)
          const itemsSubtotal = order.items.reduce((sum, item) =>
            sum + calculateDisplayPrice(item.subtotal_cents), 0
          )
          return (
            <div style={{
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: spacing.xs,
                borderTop: `2px solid ${colors.border}`,
              }}>
                <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                  Total
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
    </div>
  )
}
