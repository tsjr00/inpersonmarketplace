'use client'

import { useState } from 'react'
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
  pickup_confirmed_at?: string | null
  buyer_confirmed_at?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancellation_reason?: string | null
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
  onConfirmCashComplete?: (orderId: string) => void
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

export default function OrderCard({ order, onConfirmItem, onReadyItem, onFulfillItem, onRejectItem, onConfirmExternalPayment, onConfirmCashComplete }: OrderCardProps) {
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; itemId: string }>({ open: false, itemId: '' })
  const [externalConfirmDialog, setExternalConfirmDialog] = useState(false)

  const isExternalPayment = order.payment_method && order.payment_method !== 'stripe'
  const isCash = order.payment_method === 'cash'
  const isPendingExternal = isExternalPayment && order.order_status === 'pending'
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

  // Get earliest pickup date from items (only for non-fulfilled orders)
  // Use display data when available (from pickup_snapshot)
  const pickupDates = order.items
    .filter(item => item.status !== 'fulfilled' && item.status !== 'cancelled')
    .map(item => item.display?.pickup_date || item.pickup_date)
    .filter((d): d is string => !!d)
    .sort()
  const earliestPickupDate = pickupDates[0] ? formatPickupDate(pickupDates[0]) : null

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
              {isExternalPayment && (
                <span style={{
                  padding: '2px 8px',
                  backgroundColor: isCash ? '#fef3c7' : '#fef3c7',
                  color: '#92400e',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}>
                  {formatPaymentMethod(order.payment_method!)}
                </span>
              )}
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
              Pickup: {earliestPickupDate}
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

      {/* External Payment Banner */}
      {isPendingExternal && (
        <div style={{
          padding: 14,
          backgroundColor: '#fffbeb',
          border: '2px solid #f59e0b',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#92400e', fontSize: 14 }}>
            {isCash
              ? 'Cash Payment — Customer will pay at pickup'
              : `Payment sent via ${formatPaymentMethod(order.payment_method!)} — Verify and confirm below`
            }
          </p>
          <p style={{ margin: '6px 0 12px 0', fontSize: 13, color: '#78350f' }}>
            {isCash
              ? 'When the customer pays you in cash, click the button below to confirm payment and complete the order.'
              : `Check your ${formatPaymentMethod(order.payment_method!)} account for a payment of ${formatPrice(order.total_cents)}. Once verified, confirm below to start preparing the order.`
            }
          </p>
          <button
            onClick={() => setExternalConfirmDialog(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: isCash ? '#16a34a' : '#f59e0b',
              color: isCash ? 'white' : '#78350f',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: 40
            }}
          >
            {isCash ? 'Confirm Cash & Complete Order' : 'Confirm Payment Received'}
          </button>
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

                  {/* Item Actions - hide for cancelled, fulfilled, or pending external payment items */}
                  {!item.cancelled_at && item.status !== 'cancelled' && item.status !== 'fulfilled' && !isPendingExternal && (
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
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={externalConfirmDialog}
        title={isCash ? 'Confirm Cash Payment & Complete' : 'Confirm Payment Received'}
        message={isCash
          ? `Confirm that you received cash payment of ${formatPrice(order.total_cents)} from ${order.customer_name}? This will complete the order immediately.`
          : `Confirm that you received ${formatPaymentMethod(order.payment_method || '')} payment of ${formatPrice(order.total_cents)} from ${order.customer_name}? This will move the order to active status.`
        }
        confirmLabel={isCash ? 'Confirm Cash & Complete' : 'Confirm Payment'}
        variant="default"
        onConfirm={() => {
          setExternalConfirmDialog(false)
          if (isCash && onConfirmCashComplete) {
            onConfirmCashComplete(order.id)
          } else if (onConfirmExternalPayment) {
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
    </div>
  )
}
