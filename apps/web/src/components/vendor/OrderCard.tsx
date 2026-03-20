'use client'

import { useState } from 'react'
import Image from 'next/image'
import OrderStatusBadge from './OrderStatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

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
  // Unified display data (prefers pickup_snapshot when available)
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
  issue_reported_at?: string | null
  issue_description?: string | null
  issue_status?: string | null
  issue_resolved_at?: string | null
  issue_admin_notes?: string | null
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

// Format fulfilled date/time for display
function formatFulfilledDateTime(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }) + ' at ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })
}

// Format confirmed pickup time (HH:MM or HH:MM:SS) to 12h display
// DB column is `preferred_pickup_time` but once vendor confirms, this is a commitment
function formatPickupTime12h(time: string | null | undefined): string | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

// Format payment method for display
function formatPaymentMethod(method: string): string {
  const labels: Record<string, string> = {
    venmo: 'Venmo',
    cashapp: 'Cash App',
    paypal: 'PayPal',
    cash: 'Cash',
    stripe: 'Card',
  }
  return labels[method] || method
}

interface OrderCardProps {
  order: {
    id: string
    order_number: string
    order_status: string
    payment_method?: string
    customer_name: string
    total_cents: number
    created_at: string
    items: OrderItem[]
  }
  onConfirmItem?: (itemId: string) => void
  onReadyItem?: (itemId: string) => void
  onFulfillItem?: (itemId: string) => void
  onRejectItem?: (itemId: string, reason: string) => void
  onConfirmExternalPayment?: (orderId: string) => void
  onResolveStaleOrder?: (orderId: string, resolution: 'fulfilled' | 'problem', itemIds: string[]) => void
  onResolveIssue?: (itemId: string, action: 'confirm_delivery' | 'issue_refund', notes?: string) => void
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// Status colors matching the pills
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  ready: { bg: '#d1fae5', text: '#065f46' },
  fulfilled: { bg: '#f3e8ff', text: '#7e22ce' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' }
}

// Get the most urgent status for an order (for order number box color)
function getMostUrgentStatus(items: OrderItem[]): string {
  const statuses = items.map(i => i.status)
  if (statuses.includes('ready')) return 'ready'
  if (statuses.includes('confirmed')) return 'confirmed'
  if (statuses.includes('pending')) return 'pending'
  if (statuses.includes('fulfilled')) return 'fulfilled'
  return 'cancelled'
}

export default function OrderCard({ order, onConfirmItem, onReadyItem, onFulfillItem, onRejectItem, onConfirmExternalPayment, onResolveStaleOrder, onResolveIssue }: OrderCardProps) {
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; itemId: string }>({ open: false, itemId: '' })
  const [externalConfirmDialog, setExternalConfirmDialog] = useState(false)
  const [staleResolveDialog, setStaleResolveDialog] = useState<{ open: boolean; resolution: 'fulfilled' | 'problem' } | null>(null)
  const [issueDialog, setIssueDialog] = useState<{ open: boolean; itemId: string }>({ open: false, itemId: '' })
  const [issueNotes, setIssueNotes] = useState('')

  const isExternalPayment = order.payment_method && order.payment_method !== 'stripe'
  const isCash = order.payment_method === 'cash'
  const isPendingExternal = isExternalPayment && order.order_status === 'pending'

  // Stale confirmed detection: items in 'confirmed' status with pickup_date 2+ days past (local time)
  // Blocking activates at midnight local time on the day after the first notification
  const now = new Date()
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const staleConfirmedItems = order.items.filter(item => {
    if (item.status !== 'confirmed' || !item.pickup_date) return false
    const pickupDate = new Date(item.pickup_date + 'T00:00:00')
    const daysSince = Math.floor((todayLocal.getTime() - pickupDate.getTime()) / (24 * 60 * 60 * 1000))
    return daysSince >= 2
  })
  const isStaleBlocked = staleConfirmedItems.length > 0 && !isPendingExternal
  const orderDate = new Date(order.created_at).toLocaleDateString()
  const orderTime = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Get unique markets for this order (use display data when available)
  const markets = [...new Set(order.items.map(item => item.display?.market_name || item.market_name))]

  // Calculate vendor's subtotal for this order (excluding cancelled items)
  const vendorSubtotal = order.items
    .filter(item => item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.subtotal_cents, 0)

  // Get order box color based on most urgent item
  const urgentStatus = getMostUrgentStatus(order.items)
  const orderBoxColor = STATUS_COLORS[urgentStatus] || STATUS_COLORS.pending

  // Check if all items are fulfilled or cancelled (order is complete)
  const allItemsFulfilledOrCancelled = order.items.every(
    item => item.status === 'fulfilled' || item.status === 'cancelled'
  )
  const hasAnyFulfilledItems = order.items.some(item => item.status === 'fulfilled')

  // Get latest fulfilled date from items
  const fulfilledDates = order.items
    .filter(item => item.status === 'fulfilled' && item.pickup_confirmed_at)
    .map(item => item.pickup_confirmed_at)
    .filter((d): d is string => !!d)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  const latestFulfilledDate = fulfilledDates[0] ? formatFulfilledDateTime(fulfilledDates[0]) : null

  // Get earliest pickup date + preferred time from items (only for non-fulfilled orders)
  // Use display data when available (from pickup_snapshot)
  const activePickupItems = order.items
    .filter(item => item.status !== 'fulfilled' && item.status !== 'cancelled')
  const pickupDates = activePickupItems
    .map(item => item.display?.pickup_date || item.pickup_date)
    .filter((d): d is string => !!d)
    .sort()
  const earliestPickupDate = pickupDates[0] ? formatPickupDate(pickupDates[0]) : null
  // Get confirmed pickup time from first active item that has one
  const preferredTime = activePickupItems
    .map(item => item.display?.preferred_pickup_time || item.preferred_pickup_time)
    .find(t => !!t)
  const formattedPickupTime = formatPickupTime12h(preferredTime)

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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* Prominent Order Number - colored by most urgent status */}
          <div style={{
            backgroundColor: orderBoxColor.bg,
            color: orderBoxColor.text,
            padding: '10px 16px',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flexShrink: 0
          }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>
              Order
            </span>
            <span style={{
              fontSize: 20,
              fontWeight: 'bold',
              fontFamily: 'monospace',
              letterSpacing: 1
            }}>
              {order.order_number || order.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#374151' }}>
                {order.customer_name}
              </p>
              <span style={{
                padding: '2px 8px',
                backgroundColor: isExternalPayment ? '#fef3c7' : '#dbeafe',
                color: isExternalPayment ? '#92400e' : '#1e40af',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                {isExternalPayment ? formatPaymentMethod(order.payment_method!) : 'CARD'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#6b7280' }}>
              Ordered: {orderDate} at {orderTime}
            </p>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {/* Show fulfilled date for completed orders, pickup date for active orders */}
          {allItemsFulfilledOrCancelled && hasAnyFulfilledItems && latestFulfilledDate ? (
            <div style={{
              marginBottom: 6,
              padding: '4px 10px',
              backgroundColor: '#f3e8ff',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              color: '#7e22ce',
              display: 'inline-block'
            }}>
              Fulfilled: {latestFulfilledDate}
            </div>
          ) : earliestPickupDate ? (
            <div style={{
              marginBottom: 6,
              padding: '4px 10px',
              backgroundColor: '#dbeafe',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              color: '#1e40af',
              display: 'inline-block'
            }}>
              Pickup: {earliestPickupDate}{formattedPickupTime ? ` at ${formattedPickupTime}` : ''}
            </div>
          ) : null}
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

      {/* External Payment / Cash Order Banner */}
      {isPendingExternal && (
        <div style={{
          padding: 14,
          backgroundColor: isCash ? '#eff6ff' : '#fffbeb',
          border: `2px solid ${isCash ? '#3b82f6' : '#f59e0b'}`,
          borderRadius: 8,
          marginBottom: 16
        }}>
          <p style={{ margin: 0, fontWeight: 700, color: isCash ? '#1e40af' : '#92400e', fontSize: 14 }}>
            {isCash
              ? 'Cash Order — Confirm You Can Fulfill This'
              : `Payment sent via ${formatPaymentMethod(order.payment_method!)} — Verify and confirm below`
            }
          </p>
          <p style={{ margin: '6px 0 12px 0', fontSize: 13, color: isCash ? '#1e3a8a' : '#78350f' }}>
            {isCash
              ? 'This customer selected cash payment. Confirm that you can prepare this order for the scheduled pickup time. You\'ll collect cash when they arrive.'
              : `Check your ${formatPaymentMethod(order.payment_method!)} account for a payment of ${formatPrice(order.total_cents)}. Once verified, confirm below to start preparing the order.`
            }
          </p>
          <button
            onClick={() => setExternalConfirmDialog(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: isCash ? '#3b82f6' : '#f59e0b',
              color: isCash ? 'white' : '#78350f',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 40
            }}
          >
            {isCash ? 'Confirm Order' : 'Confirm Payment Received'}
          </button>
        </div>
      )}

      {/* Stale Confirmed Order Blocking Banner */}
      {isStaleBlocked && (
        <div style={{
          padding: 14,
          backgroundColor: '#fef2f2',
          border: '2px solid #dc2626',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#991b1b', fontSize: 14 }}>
            Overdue Order — Action Required
          </p>
          <p style={{ margin: '6px 0 12px 0', fontSize: 13, color: '#991b1b', lineHeight: 1.4 }}>
            This order&apos;s scheduled pickup has passed and it was never marked as ready or fulfilled.
            You cannot manage other orders until this is resolved. Was this order completed?
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => setStaleResolveDialog({ open: true, resolution: 'fulfilled' })}
              style={{
                padding: '8px 16px',
                backgroundColor: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: 40
              }}
            >
              Yes, Order Was Completed
            </button>
            <button
              onClick={() => setStaleResolveDialog({ open: true, resolution: 'problem' })}
              style={{
                padding: '8px 16px',
                backgroundColor: 'white',
                color: '#dc2626',
                border: '2px solid #dc2626',
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                minHeight: 40
              }}
            >
              There Was a Problem on Our End
            </button>
          </div>
        </div>
      )}

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
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  {item.listing_image ? (
                    <Image
                      src={item.listing_image}
                      alt={item.listing_title}
                      fill
                      sizes="60px"
                      style={{ objectFit: 'cover' }}
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

                  {/* Cancellation Info */}
                  {item.cancelled_at && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      backgroundColor: '#fef2f2',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#991b1b'
                    }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        {item.cancelled_by === 'buyer' ? 'Cancelled by customer' : 'You cancelled this item'}
                      </p>
                      {item.cancellation_reason && (
                        <p style={{ margin: '4px 0 0 0' }}>
                          Reason: {item.cancellation_reason}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Buyer Confirmed Badge */}
                  {item.buyer_confirmed_at && !item.cancelled_at && (
                    <div style={{
                      marginTop: 8,
                      padding: '6px 10px',
                      backgroundColor: '#d1fae5',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#065f46',
                      fontWeight: 500
                    }}>
                      Customer acknowledged receipt
                    </div>
                  )}

                  {/* Issue Reported Alert */}
                  {item.issue_reported_at && !item.issue_resolved_at && onResolveIssue && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      backgroundColor: '#fee2e2',
                      border: '1px solid #fca5a5',
                      borderRadius: 6
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b' }}>
                        Issue Reported {formatFulfilledDateTime(item.issue_reported_at)}
                      </div>
                      {item.issue_description && (
                        <div style={{ fontSize: 11, color: '#7c2d12', marginTop: 4, fontStyle: 'italic' }}>
                          &ldquo;{item.issue_description}&rdquo;
                        </div>
                      )}
                      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => {
                            setIssueDialog({ open: true, itemId: item.id })
                            setIssueNotes('')
                          }}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Resolve Issue
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Issue Resolved Display */}
                  {item.issue_reported_at && item.issue_resolved_at && (
                    <div style={{
                      marginTop: 8,
                      padding: '6px 10px',
                      backgroundColor: '#d1fae5',
                      borderRadius: 6,
                      fontSize: 12,
                      color: '#065f46'
                    }}>
                      Issue resolved {formatFulfilledDateTime(item.issue_resolved_at)}
                    </div>
                  )}

                  {/* Item Actions - hide for cancelled, fulfilled, pending external, or stale blocked items */}
                  {!item.cancelled_at && item.status !== 'cancelled' && item.status !== 'fulfilled' && !isPendingExternal && !isStaleBlocked && (
                    <>
                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                      {item.status === 'pending' && onConfirmItem && (
                        <button
                          onClick={() => onConfirmItem(item.id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            minHeight: 32
                          }}
                        >
                          Confirm
                        </button>
                      )}

                      {item.status === 'confirmed' && onReadyItem && (
                        <button
                          onClick={() => onReadyItem(item.id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            minHeight: 32
                          }}
                        >
                          Ready
                        </button>
                      )}

                      {item.status === 'ready' && onFulfillItem && (
                        <button
                          onClick={() => onFulfillItem(item.id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            minHeight: 32
                          }}
                        >
                          Fulfilled
                        </button>
                      )}

                      {/* Reject Button - available for pending/confirmed/ready items */}
                      {onRejectItem && (
                        <button
                          onClick={() => setRejectDialog({ open: true, itemId: item.id })}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: 'white',
                            color: '#dc2626',
                            border: '1px solid #dc2626',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            minHeight: 32
                          }}
                        >
                          Can&apos;t Fulfill
                        </button>
                      )}
                    </div>
                    {/* Cash no-show — small text link below button row */}
                    {item.status === 'ready' && isCash && onRejectItem && (
                      <button
                        onClick={() => onRejectItem(item.id, 'Buyer no-show — cash payment not received')}
                        style={{
                          padding: '4px 0',
                          backgroundColor: 'transparent',
                          color: '#92400e',
                          border: 'none',
                          fontSize: 11,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          marginTop: 4,
                        }}
                      >
                        Buyer didn&apos;t show up?
                      </button>
                    )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={externalConfirmDialog}
        title={isCash ? 'Confirm Order' : 'Confirm Payment Received'}
        message={isCash
          ? `Confirm that you can prepare this order for ${order.customer_name}'s scheduled pickup? The customer will be notified and will pay cash when they arrive.`
          : `Confirm that you received ${formatPaymentMethod(order.payment_method || '')} payment of ${formatPrice(order.total_cents)} from ${order.customer_name}? This will move the order to active status.`
        }
        confirmLabel={isCash ? 'Confirm Order' : 'Confirm Payment'}
        variant="default"
        onConfirm={() => {
          setExternalConfirmDialog(false)
          if (onConfirmExternalPayment) {
            onConfirmExternalPayment(order.id)
          }
        }}
        onCancel={() => setExternalConfirmDialog(false)}
      />
      <ConfirmDialog
        open={rejectDialog.open}
        title="Can't Fulfill Item"
        message="Please let the customer know why you can't fulfill this item. They will be refunded."
        confirmLabel="Reject & Refund"
        variant="danger"
        showInput
        inputLabel="Reason"
        inputPlaceholder="Why can't you fulfill this item?"
        inputRequired
        onConfirm={(reason) => {
          setRejectDialog({ open: false, itemId: '' })
          if (reason && onRejectItem) {
            onRejectItem(rejectDialog.itemId, reason)
          }
        }}
        onCancel={() => setRejectDialog({ open: false, itemId: '' })}
      />
      {/* Stale order resolution dialog */}
      <ConfirmDialog
        open={!!staleResolveDialog?.open}
        title={staleResolveDialog?.resolution === 'fulfilled'
          ? 'Confirm Order Was Completed'
          : 'Unable to Complete Order'}
        message={staleResolveDialog?.resolution === 'fulfilled'
          ? `Confirm that ${order.customer_name} received their order? This will mark all overdue items as fulfilled.`
          : isExternalPayment && !isCash
            ? `I wasn't able to complete this order. I understand I need to arrange a refund with ${order.customer_name} through ${formatPaymentMethod(order.payment_method || '')}.`
            : isCash
              ? `I wasn't able to complete this order.`
              : `I wasn't able to complete this order. I understand the customer will be refunded for any unresolved items.`}
        confirmLabel={staleResolveDialog?.resolution === 'fulfilled'
          ? 'Yes, Mark Fulfilled'
          : isExternalPayment && !isCash
            ? 'Confirm & Arrange Refund'
            : isCash
              ? 'Confirm'
              : 'Confirm & Refund Customer'}
        variant={staleResolveDialog?.resolution === 'fulfilled' ? 'default' : 'danger'}
        onConfirm={() => {
          const resolution = staleResolveDialog?.resolution || 'fulfilled'
          setStaleResolveDialog(null)
          if (onResolveStaleOrder) {
            onResolveStaleOrder(order.id, resolution, staleConfirmedItems.map(i => i.id))
          }
        }}
        onCancel={() => setStaleResolveDialog(null)}
      />
      {/* Issue Resolution Dialog — two-step: choose action, then confirm */}
      <ConfirmDialog
        open={issueDialog.open}
        title="Resolve Reported Issue"
        message="The customer reported a problem with this item. How would you like to resolve it?"
        confirmLabel="I Did Deliver This"
        cancelLabel="Issue Refund"
        showInput
        inputLabel="Notes (optional)"
        inputPlaceholder="Add any details about the resolution..."
        onConfirm={(notes) => {
          setIssueDialog({ open: false, itemId: '' })
          if (onResolveIssue) {
            onResolveIssue(issueDialog.itemId, 'confirm_delivery', notes || undefined)
          }
        }}
        onCancel={() => {
          // "Issue Refund" path — confirm the refund with a second dialog
          const itemId = issueDialog.itemId
          setIssueDialog({ open: false, itemId: '' })
          if (onResolveIssue) {
            onResolveIssue(itemId, 'issue_refund', issueNotes || undefined)
          }
        }}
      />
    </div>
  )
}
