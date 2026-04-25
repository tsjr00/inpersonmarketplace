'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { getMapsUrl } from '@/lib/utils/maps-link'
import { term } from '@/lib/vertical'
import { colors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface Pickup {
  id: string
  week_number: number
  scheduled_date: string
  status: string
  picked_up_at: string | null
  missed_at: string | null
  is_extension?: boolean
  skipped_by_vendor_at?: string | null
  skip_reason?: string | null
}

interface Subscription {
  id: string
  start_date: string
  status: string
  weeks_completed: number
  term_weeks: number
  extended_weeks: number
  total_weeks: number
  pickup_frequency?: string
  total_paid_cents: number
  offering: {
    id: string
    name: string
    description: string | null
    price_cents?: number
    pickup_day_of_week: number
    pickup_start_time: string
    pickup_end_time: string
  }
  vendor: {
    id: string
    name: string
  }
  market: {
    id: string
    name: string
    address: string | null
    city: string
    state: string
  } | null
  pickups: Pickup[]
}

export default function BuyerSubscriptionsPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const locale = getClientLocale()

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch(`/api/buyer/market-boxes?vertical=${vertical}`)
      const data = await res.json()

      if (!res.ok) {
        setError({
          message: data.error || 'Failed to fetch subscriptions',
          code: data.code,
          traceId: data.traceId
        })
        return
      }

      setSubscriptions(data.subscriptions || [])
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load subscriptions' })
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return { bg: '#dcfce7', text: '#166534' }
      case 'completed': return { bg: '#e0e7ff', text: '#3730a3' }
      case 'cancelled': return { bg: '#fee2e2', text: '#991b1b' }
      default: return { bg: '#f3f4f6', text: '#374151' }
    }
  }

  const getPickupStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return { bg: '#f3f4f6', text: '#374151' }
      case 'ready': return { bg: '#fef3c7', text: '#92400e' }
      case 'picked_up': return { bg: '#dcfce7', text: '#166534' }
      case 'missed': return { bg: '#fee2e2', text: '#991b1b' }
      case 'skipped': return { bg: '#fee2e2', text: '#991b1b' }
      case 'rescheduled': return { bg: '#f3e8ff', text: '#6b21a8' }
      default: return { bg: '#f3f4f6', text: '#374151' }
    }
  }

  // Sort subscriptions: active first, then by start date
  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  })

  // Get next upcoming pickup across all active subscriptions
  const today = new Date().toISOString().split('T')[0]
  const upcomingPickups = subscriptions
    .filter(s => s.status === 'active')
    .flatMap(s => s.pickups
      .filter(p => p.scheduled_date >= today && (p.status === 'scheduled' || p.status === 'ready'))
      .map(p => ({ ...p, subscription: s }))
    )
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', paddingTop: 100 }}>
          {t('subs.loading', locale)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
          >
            {t('subs.back_to_orders', locale)}
          </Link>
          <h1 style={{ color: branding.colors.primary, margin: '16px 0 8px 0', fontSize: 28 }}>
            {t('subs.title', locale)}
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            {t('subs.manage_desc', locale, { market_box: term(vertical, 'market_box', locale) })}
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: 24 }}>
            <ErrorDisplay error={error} verticalId={vertical} />
          </div>
        )}

        {/* Upcoming Pickups Banner - Date+Time on line 1, Location+Address on line 2 */}
        {upcomingPickups.length > 0 && (() => {
          const pickup = upcomingPickups[0]
          const sub = pickup.subscription
          const market = sub.market
          const dateStr = new Date(pickup.scheduled_date + 'T00:00:00').toLocaleDateString(locale === 'es' ? 'es-ES' : 'en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })
          const timeStr = `${formatTime(sub.offering.pickup_start_time)} - ${formatTime(sub.offering.pickup_end_time)}`
          // Build location string: Market Name, Address, City, ST
          const locationParts = [market?.name]
          if (market?.address) locationParts.push(market.address)
          if (market?.city) locationParts.push(market.city)
          if (market?.state) locationParts.push(market.state)
          const locationStr = locationParts.filter(Boolean).join(', ')

          return (
            <div
              className="next-pickup-banner"
              style={{
                padding: '12px 16px',
                marginBottom: 24,
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8
              }}
            >
              {/* Line 1: Next Pickup + date + time + ready badge */}
              <div
                className="pickup-date-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: 4
                }}
              >
                <span style={{ fontWeight: 700, color: '#1e40af', fontSize: 15 }}>
                  {t('subs.next_pickup', locale)}
                </span>
                <span style={{ fontWeight: 600, color: '#1e40af', fontSize: 15 }}>
                  {dateStr} {timeStr}
                </span>
                {pickup.status === 'ready' && (
                  <span style={{
                    padding: '2px 10px',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {t('subs.ready_for_pickup', locale)}
                  </span>
                )}
              </div>
              {/* Line 2: Location with address */}
              {locationStr && (
                <a
                  href={getMapsUrl(market?.name, market?.address, market?.city, market?.state)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: 14,
                    color: '#3b82f6',
                    textDecoration: 'none'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                >
                  📍 {locationStr}
                </a>
              )}
            </div>
          )
        })()}

        {/* Browse More Link */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/${vertical}/browse?view=market-boxes`}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14
            }}
          >
            {`Browse ${term(vertical, 'market_boxes', locale)}`}
          </Link>
        </div>

        {/* Subscriptions List */}
        {sortedSubscriptions.length === 0 ? (
          <div style={{
            padding: 40,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>{t('subs.no_subs_title', locale)}</h3>
            <p style={{ color: '#6b7280', margin: '0 0 24px 0' }}>
              {t('subs.no_subs_desc', locale, { market_box: term(vertical, 'market_box', locale).toLowerCase() })}
            </p>
            <Link
              href={`/${vertical}/browse?view=market-boxes`}
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 8,
                fontWeight: 600
              }}
            >
              {`Browse ${term(vertical, 'market_boxes', locale)}`}
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sortedSubscriptions.map(subscription => {
              const statusColor = getStatusColor(subscription.status)

              return (
                <div
                  key={subscription.id}
                  style={{
                    padding: 20,
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 18, color: '#374151' }}>
                          {subscription.offering.name}
                        </h3>
                        {subscription.pickup_frequency === 'biweekly' && (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: '#fce7f3',
                            color: '#9d174d',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase'
                          }}>
                            {t('mbd.cadence_biweekly', locale)}
                          </span>
                        )}
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase'
                        }}>
                          {subscription.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        {t('subs.by_vendor', locale, { name: subscription.vendor?.name || 'Vendor' })}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: branding.colors.primary }}>
                        {formatPrice(subscription.total_paid_cents)}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {t('subs.pickups_progress', locale, {
                          completed: String(subscription.weeks_completed),
                          total: String(subscription.pickups?.length || subscription.total_weeks || subscription.term_weeks || 4)
                        })}
                        {subscription.extended_weeks > 0 && (
                          <span style={{ display: 'block', fontSize: 11, color: colors.primary }}>
                            {t('subs.extended', locale, { count: String(subscription.extended_weeks) })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pickup Info */}
                  <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
                    {t('day.' + subscription.offering.pickup_day_of_week, locale)}s {formatTime(subscription.offering.pickup_start_time)}-{formatTime(subscription.offering.pickup_end_time)}
                    {subscription.market && (
                      <> {t('subs.at_market', locale, { name: subscription.market.name })}</>
                    )}
                  </div>

                  {/* Pickups Timeline */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {subscription.pickups.map(pickup => {
                      const pickupColor = getPickupStatusColor(pickup.status)
                      const isToday = pickup.scheduled_date === today

                      // Extension weeks get green background override
                      const pillBg = pickup.is_extension && pickup.status !== 'picked_up'
                        ? colors.primaryLight
                        : pickupColor.bg
                      const pillBorder = pickup.is_extension
                        ? `1px solid ${colors.primary}`
                        : pickup.status === 'skipped'
                          ? '1px solid #fecaca'
                          : '1px solid transparent'

                      return (
                        <div
                          key={pickup.id}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: pillBg,
                            border: isToday ? `2px solid ${branding.colors.primary}` : pillBorder,
                            borderRadius: 6,
                            textAlign: 'center',
                            minWidth: 80
                          }}
                        >
                          <div style={{ fontSize: 11, color: pickup.is_extension ? colors.primaryDark : pickupColor.text, fontWeight: 600 }}>
                            {t('subs.week', locale, { number: String(pickup.week_number) })}
                            {pickup.is_extension && (
                              <span style={{ fontSize: 9, display: 'block', color: colors.primaryDark }}>{t('subs.extension', locale)}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: pickupColor.text }}>
                            {formatDate(pickup.scheduled_date)}
                          </div>
                          {pickup.status === 'ready' && (
                            <div style={{ fontSize: 10, marginTop: 2, color: '#92400e', fontWeight: 600 }}>
                              {t('subs.ready', locale)}
                            </div>
                          )}
                          {pickup.status === 'picked_up' && (
                            <div style={{ fontSize: 10, marginTop: 2 }}>✓</div>
                          )}
                          {pickup.status === 'missed' && (
                            <div style={{ fontSize: 10, marginTop: 2 }}>✗</div>
                          )}
                          {pickup.status === 'skipped' && (
                            <div style={{ fontSize: 10, marginTop: 2, color: '#991b1b', fontWeight: 600 }}>{t('subs.skipped', locale)}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* View Details Link */}
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
                    <Link
                      href={`/${vertical}/buyer/subscriptions/${subscription.id}`}
                      style={{
                        color: branding.colors.primary,
                        fontSize: 14,
                        fontWeight: 500,
                        textDecoration: 'none'
                      }}
                    >
                      {t('subs.view_details', locale)}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Responsive styles for Next Pickup banner */}
      <style>{`
        @media (max-width: 640px) {
          .next-pickup-banner {
            padding: 14px !important;
          }
          .pickup-date-row {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 4px !important;
          }
        }
      `}</style>
    </div>
  )
}
