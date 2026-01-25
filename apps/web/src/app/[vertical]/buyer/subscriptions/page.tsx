'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'

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
  total_paid_cents: number
  offering: {
    id: string
    name: string
    description: string | null
    price_cents: number
    pickup_day_of_week: number
    pickup_start_time: string
    pickup_end_time: string
    market: {
      id: string
      name: string
      city: string
      state: string
    } | null
    vendor: {
      id: string
      business_name: string
    }
  }
  pickups: Pickup[]
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function BuyerSubscriptionsPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/buyer/market-boxes')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch subscriptions')
      }

      setSubscriptions(data.subscriptions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
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
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
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
      case 'skipped': return { bg: '#e5e7eb', text: '#6b7280' }
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
          Loading...
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
            ← Back to Orders
          </Link>
          <h1 style={{ color: branding.colors.primary, margin: '16px 0 8px 0', fontSize: 28 }}>
            My Subscriptions
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Manage your Market Box subscriptions and view upcoming pickups
          </p>
        </div>

        {error && (
          <div style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b'
          }}>
            {error}
          </div>
        )}

        {/* Upcoming Pickups Banner */}
        {upcomingPickups.length > 0 && (
          <div style={{
            padding: 20,
            marginBottom: 24,
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#1e40af', fontSize: 16 }}>
              Next Pickup
            </h3>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#1e40af', fontSize: 18 }}>
                  {formatDate(upcomingPickups[0].scheduled_date)}
                </div>
                <div style={{ fontSize: 14, color: '#3b82f6' }}>
                  {upcomingPickups[0].subscription.offering.name}
                </div>
              </div>
              {upcomingPickups[0].status === 'ready' && (
                <span style={{
                  padding: '6px 12px',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  borderRadius: 16,
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  Ready for Pickup!
                </span>
              )}
            </div>
            {upcomingPickups[0].subscription.offering.market && (
              <div style={{ marginTop: 12, fontSize: 14, color: '#3b82f6' }}>
                📍 {upcomingPickups[0].subscription.offering.market.name}, {upcomingPickups[0].subscription.offering.market.city}
                <br />
                🕐 {formatTime(upcomingPickups[0].subscription.offering.pickup_start_time)} - {formatTime(upcomingPickups[0].subscription.offering.pickup_end_time)}
              </div>
            )}
          </div>
        )}

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
            Browse Market Boxes
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
            <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>No Subscriptions Yet</h3>
            <p style={{ color: '#6b7280', margin: '0 0 24px 0' }}>
              Subscribe to a Market Box for weekly pickups of fresh products.
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
              Browse Market Boxes
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
                        by {subscription.offering.vendor.business_name}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, color: branding.colors.primary }}>
                        {formatPrice(subscription.total_paid_cents)}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {subscription.weeks_completed} of {subscription.total_weeks || subscription.term_weeks || 4} weeks
                        {subscription.extended_weeks > 0 && (
                          <span style={{ display: 'block', fontSize: 11, color: '#059669' }}>
                            (+{subscription.extended_weeks} extended)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pickup Info */}
                  <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
                    {DAYS[subscription.offering.pickup_day_of_week]}s {formatTime(subscription.offering.pickup_start_time)}-{formatTime(subscription.offering.pickup_end_time)}
                    {subscription.offering.market && (
                      <> at {subscription.offering.market.name}</>
                    )}
                  </div>

                  {/* Pickups Timeline */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {subscription.pickups.map(pickup => {
                      const pickupColor = getPickupStatusColor(pickup.status)
                      const isToday = pickup.scheduled_date === today

                      return (
                        <div
                          key={pickup.id}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: pickupColor.bg,
                            border: isToday ? `2px solid ${branding.colors.primary}` : '1px solid transparent',
                            borderRadius: 6,
                            textAlign: 'center',
                            minWidth: 80
                          }}
                        >
                          <div style={{ fontSize: 11, color: pickupColor.text, fontWeight: 600 }}>
                            Week {pickup.week_number}
                            {pickup.is_extension && (
                              <span style={{ fontSize: 9, display: 'block', color: '#6b21a8' }}>+ext</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: pickupColor.text }}>
                            {formatDate(pickup.scheduled_date)}
                          </div>
                          {pickup.status === 'ready' && (
                            <div style={{ fontSize: 10, marginTop: 2, color: '#92400e', fontWeight: 600 }}>
                              READY
                            </div>
                          )}
                          {pickup.status === 'picked_up' && (
                            <div style={{ fontSize: 10, marginTop: 2 }}>✓</div>
                          )}
                          {pickup.status === 'missed' && (
                            <div style={{ fontSize: 10, marginTop: 2 }}>✗</div>
                          )}
                          {pickup.status === 'skipped' && (
                            <div style={{ fontSize: 10, marginTop: 2, color: '#6b7280' }}>SKIPPED</div>
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
                      View Details →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
