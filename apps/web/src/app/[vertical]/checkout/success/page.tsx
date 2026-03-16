'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { FullPageLoading } from '@/components/shared/Spinner'
import { formatQuantityDisplay } from '@/lib/constants'
import { useCart } from '@/lib/hooks/useCart'
import { getMapsUrl } from '@/lib/utils/maps-link'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

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

interface OrderItem {
  id: string
  title: string
  quantity_amount?: number | null
  quantity_unit?: string | null
  quantity: number
  subtotal_cents: number
  vendor_name: string
  market_id?: string
  market_name?: string
  market_type?: string
  market_address?: string
  market_city?: string
  market_state?: string
  pickup_date?: string | null
  confirmed_pickup_time?: string | null
  pickup_start_time?: string | null
  pickup_end_time?: string | null
}

interface MarketBoxSubscription {
  id: string
  term_weeks: number
  start_date: string
  total_paid_cents: number
  status: string
  offering_name: string
  vendor_name: string
  pickup_day_of_week: number | null
  pickup_start_time: string | null
  pickup_end_time: string | null
  market_name: string | null
  market_city: string | null
  market_state: string | null
}

interface OrderDetails {
  id: string
  order_number: string
  status: string
  total_cents: number
  tip_percentage: number
  tip_amount: number
  created_at: string
  items: OrderItem[]
  marketBoxSubscriptions: MarketBoxSubscription[]
}

export default function CheckoutSuccessPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const sessionId = searchParams.get('session_id')
  const orderId = searchParams.get('order')

  const locale = getClientLocale()
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
              setOrder(transformOrder(data.order, data.marketBoxSubscriptions))
            }
            // Refresh client-side cart state (server already cleared DB cart)
            refreshCart()
          } else {
            const data = await response.json()
            setError(data.error || t('success.verify_failed', locale))
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
        setError(t('success.load_failed', locale))
      } finally {
        setLoading(false)
      }
    }

    processSuccess()
  }, [sessionId, orderId, refreshCart])

  if (loading) {
    return <FullPageLoading message={t('success.processing', locale)} />
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: `${spacing.sm} ${spacing.xs}`,
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
          padding: `${spacing.sm} ${spacing.xs}`,
          textAlign: 'center',
          marginBottom: spacing.sm,
          boxShadow: shadows.md,
        }}>
          <div style={{
            width: 56,
            height: 56,
            backgroundColor: colors.primaryLight,
            borderRadius: radius.full,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: `0 auto ${spacing.xs}`,
            fontSize: 28,
            color: colors.primary,
          }}>
            &#10003;
          </div>

          <h1 style={{
            margin: `0 0 ${spacing['3xs']} 0`,
            fontSize: typography.sizes['2xl'],
            color: colors.textPrimary,
          }}>
            {t('success.title', locale)}
          </h1>
          <p style={{ color: colors.textSecondary, marginBottom: 0, fontSize: typography.sizes.sm }}>
            {t('success.subtitle', locale)}
          </p>
        </div>

        {/* Order Details */}
        {order && (
          <div style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            padding: `${spacing.xs} ${spacing.xs}`,
            marginBottom: spacing.sm,
            boxShadow: shadows.sm,
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: spacing.xs,
              fontSize: typography.sizes.lg,
              color: colors.textPrimary,
            }}>
              {t('success.details', locale)}
            </h2>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing['2xs'],
              marginBottom: spacing.sm,
              padding: spacing.xs,
              backgroundColor: colors.surfaceMuted,
              borderRadius: radius.sm,
            }}>
              {/* Row 1: Order Number + Date */}
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: 0 }}>{t('success.order_number', locale)}</p>
                  <p style={{ fontWeight: typography.weights.semibold, margin: 0, color: colors.textPrimary, fontSize: typography.sizes.base }}>{order.order_number}</p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: 0 }}>{t('success.date', locale)}</p>
                  <p style={{ fontWeight: typography.weights.semibold, margin: 0, color: colors.textPrimary }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {/* Row 2: Status + Total */}
              <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: 0 }}>{t('success.status', locale)}</p>
                  <span style={{
                    display: 'inline-block',
                    padding: `${spacing['3xs']} ${spacing['2xs']}`,
                    backgroundColor: colors.primaryLight,
                    color: colors.primaryDark,
                    borderRadius: radius.full,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold,
                  }}>
                    {t('success.status_placed', locale)}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: 0 }}>{t('success.total', locale)}</p>
                  <p style={{ fontWeight: typography.weights.semibold, margin: 0, fontSize: typography.sizes.lg, color: colors.primary }}>
                    ${(order.total_cents / 100).toFixed(2)}
                  </p>
                </div>
              </div>
              {/* Row 3: Tip info (if applicable) */}
              {order.tip_amount > 0 && (
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.xs, margin: 0 }}>
                  {t('success.tip_info', locale, { amount: (order.tip_amount / 100).toFixed(2), percent: String(order.tip_percentage) })}
                </p>
              )}
            </div>

            {order.items && order.items.length > 0 && (
              <>
                <h3 style={{ fontSize: typography.sizes.base, marginBottom: spacing.xs, color: colors.textPrimary }}>{t('success.items', locale)}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                  {order.items.map((item, index) => (
                    <div
                      key={item.id || index}
                      style={{
                        padding: spacing.xs,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.sm,
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: typography.weights.medium, color: colors.textPrimary }}>
                          {item.title}
                          {formatQuantityDisplay(item.quantity_amount ?? null, item.quantity_unit ?? null) && (
                            <span style={{ fontWeight: typography.weights.normal, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                              {' '}({formatQuantityDisplay(item.quantity_amount ?? null, item.quantity_unit ?? null)})
                            </span>
                          )}
                        </p>
                        <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          {item.vendor_name} &bull; {t('success.qty', locale, { count: String(item.quantity) })}
                        </p>
                      </div>
                      {(item.market_name || item.pickup_date) && (
                        <p style={{
                          margin: `${spacing['2xs']} 0 0`,
                          padding: `${spacing['2xs']} ${spacing.xs}`,
                          backgroundColor: colors.primaryLight,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          color: colors.textSecondary,
                          lineHeight: typography.leading.relaxed,
                        }}>
                          <span style={{ marginRight: spacing['3xs'] }}>{item.market_type === 'event' ? '\u{1F3AA}' : item.market_type === 'traditional' ? '\u{1F3EA}' : '\u{1F4E6}'}</span>
                          <strong>{t('success.pickup', locale)}</strong> {formatPickupDate(item.pickup_date) || t('success.date_tbd', locale)}
                          {item.confirmed_pickup_time
                            ? ` at ${formatPickupTime(item.confirmed_pickup_time, null)}`
                            : formatPickupTime(item.pickup_start_time, item.pickup_end_time) ? `, ${formatPickupTime(item.pickup_start_time, item.pickup_end_time)}` : ''
                          }
                          {item.market_name && ` at ${item.market_name}`}
                          {item.market_city && `, ${item.market_city}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {order.marketBoxSubscriptions && order.marketBoxSubscriptions.length > 0 && (
              <>
                <h3 style={{ fontSize: typography.sizes.base, marginTop: spacing.sm, marginBottom: spacing.xs, color: colors.textPrimary }}>
                  {t('success.mb_subscriptions', locale, { market_box: term(vertical, 'market_box', locale) })}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                  {order.marketBoxSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      style={{
                        padding: spacing.xs,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.sm,
                        borderLeft: `3px solid ${colors.primary}`,
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: typography.weights.medium, color: colors.textPrimary }}>
                        {sub.offering_name}
                      </p>
                      <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                        {sub.vendor_name} &bull; {t('cart.subscription', locale, { term: String(sub.term_weeks) })} &bull; ${(sub.total_paid_cents / 100).toFixed(2)}
                      </p>
                      <p style={{
                        margin: `${spacing['2xs']} 0 0`,
                        padding: `${spacing['2xs']} ${spacing.xs}`,
                        backgroundColor: colors.primaryLight,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        color: colors.textSecondary,
                        lineHeight: typography.leading.relaxed,
                      }}>
                        <span style={{ marginRight: spacing['3xs'] }}>{'\u{1F4E6}'}</span>
                        <strong>{t('success.starts', locale)}</strong> {new Date(sub.start_date + 'T00:00:00').toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {sub.pickup_day_of_week !== null && ` \u2022 ${t('success.every', locale, { day: t('day.' + sub.pickup_day_of_week, locale) })}`}
                        {formatPickupTime(sub.pickup_start_time, sub.pickup_end_time) && `, ${formatPickupTime(sub.pickup_start_time, sub.pickup_end_time)}`}
                        {sub.market_name && ` at ${sub.market_name}`}
                        {sub.market_city && `, ${sub.market_city}`}
                      </p>
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
              padding: `${spacing.sm} ${spacing.xs}`,
              marginBottom: spacing.sm,
              boxShadow: shadows.sm,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs }}>
                <span style={{ fontSize: typography.sizes.lg, flexShrink: 0 }}>{'\u{1F4CD}'}</span>
                <h2 style={{
                  marginTop: 0,
                  marginBottom: 0,
                  fontSize: typography.sizes.lg,
                  color: locations.length > 1 ? '#856404' : colors.textPrimary,
                }}>
                  {locations.length > 1 ? t('success.multi_pickup', locale) : t('success.pickup_location', locale)}
                </h2>
              </div>

              {locations.length > 1 && (
                <p style={{
                  margin: `${spacing.xs} 0 0`,
                  color: '#856404',
                  fontSize: typography.sizes.sm,
                }}>
                  {t('success.multi_pickup_desc', locale, { count: String(locations.length) })}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'], marginTop: spacing.xs }}>
                {locations.map((item, idx) => (
                  <div
                    key={item.market_id || idx}
                    style={{
                      padding: spacing.xs,
                      backgroundColor: locations.length > 1 ? 'rgba(255,255,255,0.5)' : colors.surfaceMuted,
                      borderRadius: radius.sm,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing['2xs'] }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        backgroundColor: item.market_type === 'event' ? '#f59e0b' : item.market_type === 'private_pickup' ? '#8b5cf6' : '#3b82f6',
                        flexShrink: 0, marginTop: 4
                      }} />
                      <div>
                        <p style={{
                          margin: 0,
                          fontWeight: typography.weights.semibold,
                          color: locations.length > 1 ? '#856404' : colors.textPrimary,
                        }}>
                          {item.market_name}
                        </p>
                        {item.pickup_date && (
                          <p style={{
                            margin: `${spacing['3xs']} 0 0`,
                            fontSize: typography.sizes.sm,
                            fontWeight: typography.weights.semibold,
                            color: colors.primary,
                          }}>
                            {formatPickupDate(item.pickup_date)}
                            {formatPickupTime(item.pickup_start_time, item.pickup_end_time) && ` \u2022 ${formatPickupTime(item.pickup_start_time, item.pickup_end_time)}`}
                          </p>
                        )}
                        {(item.market_address || item.market_city) && (
                          <a
                            href={getMapsUrl(item.market_address, item.market_city, item.market_state)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block',
                              margin: `${spacing['3xs']} 0 0`,
                              fontSize: typography.sizes.xs,
                              color: locations.length > 1 ? '#856404' : colors.textMuted,
                              textDecoration: 'none',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                          >
                            {item.market_address}{item.market_address && item.market_city ? ', ' : ''}
                            {item.market_city && <>{item.market_city}, {item.market_state}</>}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Next Steps */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          padding: `${spacing.sm} ${spacing.xs}`,
          marginBottom: spacing.sm,
          boxShadow: shadows.sm,
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.xs,
            fontSize: typography.sizes.lg,
            color: colors.textPrimary,
          }}>
            {t('success.whats_next', locale)}
          </h2>
          <ul style={{ margin: 0, paddingLeft: spacing.md, color: colors.textSecondary, fontSize: typography.sizes.sm, lineHeight: typography.leading.loose, listStyleType: 'disc' }}>
            {order?.items && order.items.length > 0 && (
              <>
                <li>{t('success.next_vendor_confirm', locale)}</li>
                <li>{t('success.next_notification', locale)}</li>
                {vertical === 'food_trucks' && (
                  <li>{t('success.next_ft_rush', locale)}</li>
                )}
                <li>{t('success.next_pickup', locale, { plural: [...new Set(order.items.map(i => i.market_id).filter(Boolean))].length > 1 ? 's' : '' })}</li>
              </>
            )}
            {order?.marketBoxSubscriptions && order.marketBoxSubscriptions.length > 0 && (
              <>
                <li>{t('success.next_mb_active', locale)}</li>
                <li>{t('success.next_mb_reminders', locale)}</li>
              </>
            )}
            <li>{t('success.next_track', locale)}</li>
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
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: 'transparent',
              color: colors.primary,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              border: `2px solid ${colors.primary}`,
              textAlign: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {t('success.view_orders', locale)}
          </Link>
          <Link
            href={`/${vertical}/browse`}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              border: `2px solid ${colors.primary}`,
              textAlign: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {t('success.continue_shopping', locale)}
          </Link>
        </div>
      </div>
    </div>
  )
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Transform raw Supabase order data into the display format */
function transformOrder(raw: Record<string, unknown>, rawMarketBoxSubs?: Array<Record<string, unknown>>): OrderDetails {
  const items = (raw.order_items as Array<Record<string, unknown>> || []).map(item => {
    const listing = item.listing as Record<string, unknown> | null
    const vendorProfiles = listing?.vendor_profiles as Record<string, unknown> | null
    const profileData = vendorProfiles?.profile_data as Record<string, unknown> | null
    const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
    const market = item.markets as Record<string, unknown> | null
    const pickupSnapshot = item.pickup_snapshot as Record<string, unknown> | null

    // Use pickup_snapshot for display when available (immutable order details)
    // Fall back to market data for backwards compatibility with older orders
    return {
      id: item.id as string,
      title: (listing?.title as string) || 'Unknown Item',
      quantity_amount: (listing?.quantity_amount as number) ?? null,
      quantity_unit: (listing?.quantity_unit as string) ?? null,
      quantity: item.quantity as number,
      subtotal_cents: item.subtotal_cents as number,
      vendor_name: vendorName,
      market_id: market?.id as string | undefined,
      market_name: (pickupSnapshot?.market_name as string) || (market?.name as string) || undefined,
      market_type: (pickupSnapshot?.market_type as string) || (market?.market_type as string) || undefined,
      market_address: (pickupSnapshot?.address as string) || (market?.address as string) || undefined,
      market_city: (pickupSnapshot?.city as string) || (market?.city as string) || undefined,
      market_state: (pickupSnapshot?.state as string) || (market?.state as string) || undefined,
      pickup_date: item.pickup_date as string | null | undefined,
      confirmed_pickup_time: (item.preferred_pickup_time as string) || (pickupSnapshot?.preferred_pickup_time as string) || undefined,
      pickup_start_time: (pickupSnapshot?.start_time as string) || (item.pickup_start_time as string) || undefined,
      pickup_end_time: (pickupSnapshot?.end_time as string) || (item.pickup_end_time as string) || undefined,
    }
  })

  // Transform market box subscriptions
  const marketBoxSubscriptions: MarketBoxSubscription[] = (rawMarketBoxSubs || []).map(sub => {
    const offering = sub.market_box_offerings as Record<string, unknown> | null
    const vendorProfiles = offering?.vendor_profiles as Record<string, unknown> | null
    const profileData = vendorProfiles?.profile_data as Record<string, unknown> | null
    const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
    const market = offering?.markets as Record<string, unknown> | null

    return {
      id: sub.id as string,
      term_weeks: sub.term_weeks as number,
      start_date: sub.start_date as string,
      total_paid_cents: sub.total_paid_cents as number,
      status: sub.status as string,
      offering_name: (offering?.name as string) || 'Market Box',
      vendor_name: vendorName,
      pickup_day_of_week: (offering?.pickup_day_of_week as number) ?? null,
      pickup_start_time: (offering?.pickup_start_time as string) || null,
      pickup_end_time: (offering?.pickup_end_time as string) || null,
      market_name: (market?.name as string) || null,
      market_city: (market?.city as string) || null,
      market_state: (market?.state as string) || null,
    }
  })

  return {
    id: raw.id as string,
    order_number: raw.order_number as string,
    status: raw.status as string,
    total_cents: raw.total_cents as number,
    tip_percentage: (raw.tip_percentage as number) || 0,
    tip_amount: (raw.tip_amount as number) || 0,
    created_at: raw.created_at as string,
    items,
    marketBoxSubscriptions,
  }
}
