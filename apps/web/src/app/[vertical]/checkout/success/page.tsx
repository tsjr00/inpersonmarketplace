'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { useCart } from '@/lib/hooks/useCart'

interface OrderItem {
  id: string
  title: string
  quantity: number
  subtotal_cents: number
  vendor_name: string
  market_id?: string
  market_name?: string
  market_type?: string
  market_address?: string
  market_city?: string
  market_state?: string
}

interface OrderDetails {
  id: string
  order_number: string
  status: string
  total_cents: number
  created_at: string
  items: OrderItem[]
}

export default function CheckoutSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const sessionId = searchParams.get('session_id')
  const orderId = searchParams.get('order')

  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { refreshCart } = useCart()
  const hasFetched = useRef(false)

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    async function processSuccess() {
      try {
        if (sessionId) {
          // Call API success route to verify payment, clear cart, get order
          const response = await fetch(`/api/checkout/success?session_id=${sessionId}`)
          if (response.ok) {
            const data = await response.json()
            if (data.order) {
              setOrder(transformOrder(data.order))
            }
            // Refresh client-side cart state (server already cleared DB cart)
            refreshCart()
          } else {
            const data = await response.json()
            setError(data.error || 'Could not verify payment')
          }
        } else if (orderId) {
          // Direct order ID — fetch from buyer orders API
          const response = await fetch(`/api/buyer/orders/${orderId}`)
          if (response.ok) {
            const data = await response.json()
            setOrder(data.order || data)
          }
        }
      } catch (err) {
        console.error('Failed to process success:', err)
        setError('Could not load order details')
      } finally {
        setLoading(false)
      }
    }

    processSuccess()
  }, [sessionId, orderId, refreshCart])

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
            borderRadius: radius.full,
            animation: 'spin 1s linear infinite',
            margin: `0 auto ${spacing.sm}`,
          }} />
          <p style={{ color: colors.textSecondary }}>Processing your order...</p>
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
      <div style={{
        maxWidth: containers.lg,
        margin: '0 auto',
      }}>
        {/* Success Banner */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          padding: spacing.xl,
          textAlign: 'center',
          marginBottom: spacing.lg,
          boxShadow: shadows.md,
        }}>
          <div style={{
            width: 80,
            height: 80,
            backgroundColor: colors.primaryLight,
            borderRadius: radius.full,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: `0 auto ${spacing.md}`,
            fontSize: 40,
            color: colors.primary,
          }}>
            &#10003;
          </div>

          <h1 style={{
            margin: `0 0 ${spacing['2xs']} 0`,
            fontSize: typography.sizes['2xl'],
            color: colors.textPrimary,
          }}>
            Order Placed!
          </h1>
          <p style={{ color: colors.textSecondary, marginBottom: 0 }}>
            Thank you for your purchase. Your order has been submitted and the vendor will be notified.
          </p>
        </div>

        {/* Order Details */}
        {order && (
          <div style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            padding: spacing.md,
            marginBottom: spacing.lg,
            boxShadow: shadows.sm,
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: spacing.md,
              fontSize: typography.sizes.lg,
              color: colors.textPrimary,
            }}>
              Order Details
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: spacing.sm,
              marginBottom: spacing.md,
              padding: spacing.sm,
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.sm,
            }}>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Order Number</p>
                <p style={{ fontWeight: typography.weights.semibold, margin: 0, color: colors.textPrimary }}>{order.order_number}</p>
              </div>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Date</p>
                <p style={{ fontWeight: typography.weights.semibold, margin: 0, color: colors.textPrimary }}>
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Status</p>
                <span style={{
                  display: 'inline-block',
                  padding: `${spacing['3xs']} ${spacing['2xs']}`,
                  backgroundColor: colors.primaryLight,
                  color: colors.primaryDark,
                  borderRadius: radius.full,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold,
                }}>
                  Order Placed
                </span>
              </div>
              <div>
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: `0 0 ${spacing['3xs']} 0` }}>Total</p>
                <p style={{ fontWeight: typography.weights.semibold, margin: 0, fontSize: typography.sizes.lg, color: colors.primary }}>
                  ${(order.total_cents / 100).toFixed(2)}
                </p>
              </div>
            </div>

            {order.items && order.items.length > 0 && (
              <>
                <h3 style={{ fontSize: typography.sizes.base, marginBottom: spacing.sm, color: colors.textPrimary }}>Items</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                  {order.items.map((item, index) => (
                    <div
                      key={item.id || index}
                      style={{
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.sm,
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: typography.weights.medium, color: colors.textPrimary }}>{item.title}</p>
                        <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          {item.vendor_name} &bull; Qty: {item.quantity}
                        </p>
                      </div>
                      {item.market_name && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing['2xs'],
                          marginTop: spacing['2xs'],
                          padding: `${spacing['2xs']} ${spacing.xs}`,
                          backgroundColor: colors.primaryLight,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          color: colors.textSecondary,
                        }}>
                          <span>{item.market_type === 'traditional' ? '\u{1F3EA}' : '\u{1F4E6}'}</span>
                          <span>
                            <strong>Pickup:</strong> {item.market_name}
                            {item.market_address && ` - ${item.market_address}`}
                            {item.market_city && `, ${item.market_city}, ${item.market_state}`}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceSubtle,
            border: `1px solid ${colors.accent}`,
            borderRadius: radius.md,
            color: colors.textSecondary,
            marginBottom: spacing.lg,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Pickup Locations Summary */}
        {order && order.items && (() => {
          const locations = [...new Map(
            order.items
              .filter(item => item.market_name)
              .map(item => [item.market_id, item])
          ).values()]

          if (locations.length === 0) return null

          return (
            <div style={{
              backgroundColor: locations.length > 1 ? '#fff3cd' : colors.surfaceElevated,
              borderRadius: radius.md,
              border: locations.length > 1 ? '2px solid #ffc107' : `1px solid ${colors.border}`,
              padding: spacing.md,
              marginBottom: spacing.lg,
              boxShadow: shadows.sm,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs }}>
                <span style={{ fontSize: typography.sizes.xl }}>{'\u{1F4CD}'}</span>
                <div style={{ flex: 1 }}>
                  <h2 style={{
                    marginTop: 0,
                    marginBottom: spacing.sm,
                    fontSize: typography.sizes.lg,
                    color: locations.length > 1 ? '#856404' : colors.textPrimary,
                  }}>
                    {locations.length > 1 ? 'Multiple Pickup Locations' : 'Pickup Location'}
                  </h2>

                  {locations.length > 1 && (
                    <p style={{
                      margin: `0 0 ${spacing.sm} 0`,
                      color: '#856404',
                      fontSize: typography.sizes.sm,
                    }}>
                      Your order includes items from <strong>{locations.length} different locations</strong>.
                      Please visit each location to pick up your items.
                    </p>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    {locations.map((item, idx) => (
                      <div
                        key={item.market_id || idx}
                        style={{
                          padding: spacing.sm,
                          backgroundColor: locations.length > 1 ? 'rgba(255,255,255,0.5)' : colors.surfaceMuted,
                          borderRadius: radius.sm,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                          <span style={{ fontSize: typography.sizes.lg }}>
                            {item.market_type === 'traditional' ? '\u{1F3EA}' : '\u{1F4E6}'}
                          </span>
                          <div>
                            <p style={{
                              margin: 0,
                              fontWeight: typography.weights.semibold,
                              color: locations.length > 1 ? '#856404' : colors.textPrimary,
                            }}>
                              {item.market_name}
                            </p>
                            {(item.market_address || item.market_city) && (
                              <p style={{
                                margin: `${spacing['3xs']} 0 0`,
                                fontSize: typography.sizes.xs,
                                color: locations.length > 1 ? '#856404' : colors.textMuted,
                              }}>
                                {item.market_address && <>{item.market_address}<br /></>}
                                {item.market_city && <>{item.market_city}, {item.market_state}</>}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Next Steps */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          padding: spacing.md,
          marginBottom: spacing.lg,
          boxShadow: shadows.sm,
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.sm,
            fontSize: typography.sizes.lg,
            color: colors.textPrimary,
          }}>
            What&apos;s Next?
          </h2>
          <ul style={{ margin: 0, paddingLeft: spacing.md, color: colors.textSecondary, lineHeight: typography.leading.loose }}>
            <li>The vendor will be notified and will confirm your order</li>
            <li>You&apos;ll receive a notification when your items are ready for pickup</li>
            <li>Pick up your items at the designated market location{order?.items && [...new Set(order.items.map(i => i.market_id).filter(Boolean))].length > 1 ? 's' : ''}</li>
            <li>Track your order status in your orders page</li>
          </ul>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          justifyContent: 'center',
        }}>
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              boxShadow: shadows.primary,
            }}
          >
            View My Orders
          </Link>
          <Link
            href={`/${vertical}/browse`}
            style={{
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              border: `2px solid ${colors.primary}`,
            }}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Transform raw Supabase order data into the display format */
function transformOrder(raw: Record<string, unknown>): OrderDetails {
  const items = (raw.order_items as Array<Record<string, unknown>> || []).map(item => {
    const listing = item.listing as Record<string, unknown> | null
    const vendorProfiles = listing?.vendor_profiles as Record<string, unknown> | null
    const profileData = vendorProfiles?.profile_data as Record<string, unknown> | null
    const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
    const market = item.markets as Record<string, unknown> | null

    return {
      id: item.id as string,
      title: (listing?.title as string) || 'Unknown Item',
      quantity: item.quantity as number,
      subtotal_cents: item.subtotal_cents as number,
      vendor_name: vendorName,
      market_id: market?.id as string | undefined,
      market_name: market?.name as string | undefined,
      market_type: market?.market_type as string | undefined,
      market_address: market?.address as string | undefined,
      market_city: market?.city as string | undefined,
      market_state: market?.state as string | undefined,
    }
  })

  return {
    id: raw.id as string,
    order_number: raw.order_number as string,
    status: raw.status as string,
    total_cents: raw.total_cents as number,
    created_at: raw.created_at as string,
    items,
  }
}
