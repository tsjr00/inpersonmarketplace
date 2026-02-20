'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { formatQuantityDisplay } from '@/lib/constants'
import { term } from '@/lib/vertical'

interface MarketBoxOffering {
  id: string
  name: string
  description: string | null
  image_urls: string[]
  price_cents: number
  quantity_amount: number | null
  quantity_unit: string | null
  pickup_day_of_week: number
  pickup_start_time: string
  pickup_end_time: string
  active: boolean
  max_subscribers: number | null
  created_at: string
  market: {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
  } | null
}

interface Subscriber {
  id: string
  start_date: string
  status: string
  weeks_completed: number
  term_weeks: number
  extended_weeks: number
  buyer: {
    display_name: string
    email: string
  }
}

interface Pickup {
  id: string
  week_number: number
  scheduled_date: string
  status: string
  ready_at: string | null
  picked_up_at: string | null
  missed_at: string | null
  rescheduled_to: string | null
  vendor_notes: string | null
  is_extension: boolean
  skipped_by_vendor_at: string | null
  skip_reason: string | null
  buyer_confirmed_at: string | null
  vendor_confirmed_at: string | null
  confirmation_window_expires_at: string | null
  subscription: {
    id: string
    term_weeks: number
    extended_weeks: number
    buyer: {
      display_name: string
      email: string
    }
    offering: {
      name: string
    }
  }
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function VendorMarketBoxDetailPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const offeringId = params.id as string
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  const [offering, setOffering] = useState<MarketBoxOffering | null>(null)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [activeSubscriberCount, setActiveSubscriberCount] = useState(0)
  const [pickups, setPickups] = useState<Pickup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'subscribers' | 'pickups'>('overview')
  const [updatingPickup, setUpdatingPickup] = useState<string | null>(null)
  const [skipModalPickup, setSkipModalPickup] = useState<Pickup | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [skipping, setSkipping] = useState(false)
  const [waitingForBuyer, setWaitingForBuyer] = useState<string | null>(null)
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null)

  const fetchOffering = useCallback(async () => {
    try {
      const res = await fetch(`/api/vendor/market-boxes/${offeringId}`)
      const data = await res.json()

      if (!res.ok) {
        setError({
          message: data.error || 'Failed to fetch offering',
          code: data.code,
          traceId: data.traceId
        })
        return
      }

      setOffering(data.offering)
      setActiveSubscriberCount(data.active_count || 0)

      // Transform subscriptions into Subscriber shape for the subscribers tab
      const subs = (data.subscriptions || []).map((s: Record<string, unknown>) => {
        const buyer = s.buyer as Record<string, unknown> | null
        return {
          id: s.id as string,
          start_date: s.start_date as string,
          status: s.status as string,
          weeks_completed: (s.weeks_completed as number) || 0,
          term_weeks: (s.term_weeks as number) || 4,
          extended_weeks: (s.extended_weeks as number) || 0,
          buyer: {
            display_name: (buyer?.display_name as string) || 'Buyer',
            email: (buyer?.email as string) || '',
          },
        }
      })
      setSubscribers(subs)
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load offering' })
    }
  }, [offeringId])

  const fetchPickups = useCallback(async () => {
    try {
      const res = await fetch(`/api/vendor/market-boxes/pickups?offering_id=${offeringId}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch pickups')
      }

      setPickups(data.pickups || [])
    } catch (err) {
      console.error('Failed to load pickups:', err)
    }
  }, [offeringId])

  useEffect(() => {
    Promise.all([fetchOffering(), fetchPickups()]).finally(() => setLoading(false))
  }, [fetchOffering, fetchPickups])

  const handlePickupAction = async (pickupId: string, action: string, rescheduleTo?: string) => {
    setUpdatingPickup(pickupId)
    setConfirmMessage(null)
    try {
      const body: Record<string, string> = { action }
      if (rescheduleTo) {
        body.reschedule_to = rescheduleTo
      }

      const res = await fetch(`/api/vendor/market-boxes/pickups/${pickupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update pickup')
      }

      // Handle mutual confirmation response for picked_up action
      if (action === 'picked_up' && data.waiting_for_buyer) {
        setWaitingForBuyer(pickupId)
        setConfirmMessage('Waiting for buyer to confirm pickup (30 seconds)...')
      } else if (action === 'picked_up' && data.completed) {
        setConfirmMessage('Pickup confirmed by both parties!')
        setTimeout(() => setConfirmMessage(null), 5000)
      }

      fetchPickups()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setUpdatingPickup(null)
    }
  }

  // Poll for pickup completion when waiting for buyer
  useEffect(() => {
    if (!waitingForBuyer) return
    const interval = setInterval(() => {
      fetchPickups().then(() => {
        const pickup = pickups.find(p => p.id === waitingForBuyer)
        if (pickup?.status === 'picked_up') {
          setWaitingForBuyer(null)
          setConfirmMessage('Pickup confirmed by both parties!')
          setTimeout(() => setConfirmMessage(null), 5000)
        }
      })
    }, 3000)
    const timeout = setTimeout(() => {
      setWaitingForBuyer(null)
      setConfirmMessage(null)
      clearInterval(interval)
    }, 35000)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [waitingForBuyer, fetchPickups, pickups])

  const handleSkipWeek = async () => {
    if (!skipModalPickup) return
    setSkipping(true)
    try {
      const res = await fetch(`/api/vendor/market-boxes/pickups/${skipModalPickup.id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: skipReason || null }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to skip week')
      }

      setSkipModalPickup(null)
      setSkipReason('')
      fetchPickups()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to skip week')
    } finally {
      setSkipping(false)
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
      case 'scheduled': return { bg: '#e0e7ff', text: '#3730a3' }
      case 'ready': return { bg: '#fef3c7', text: '#92400e' }
      case 'picked_up': return { bg: '#dcfce7', text: '#166534' }
      case 'missed': return { bg: '#fee2e2', text: '#991b1b' }
      case 'rescheduled': return { bg: '#f3e8ff', text: '#6b21a8' }
      case 'skipped': return { bg: '#f3f4f6', text: '#6b7280' }
      default: return { bg: '#f3f4f6', text: '#374151' }
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center', paddingTop: 100 }}>
          Loading...
        </div>
      </div>
    )
  }

  if (error || !offering) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          {error ? (
            <ErrorDisplay error={error} verticalId={vertical} />
          ) : (
            <div style={{
              padding: 24,
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#991b1b',
              textAlign: 'center'
            }}>
              Offering not found
            </div>
          )}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href={`/${vertical}/vendor/market-boxes`} style={{ color: branding.colors.primary }}>
              {`Back to ${term(vertical, 'market_boxes')}`}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/${vertical}/vendor/market-boxes`}
            style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
          >
            ← Back to {term(vertical, 'market_boxes')}
          </Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h1 style={{ color: branding.colors.primary, margin: 0, fontSize: 28 }}>
                  {offering.name}
                </h1>
                {!offering.active && (
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    INACTIVE
                  </span>
                )}
              </div>
              <p style={{ color: '#666', margin: '8px 0 0 0', fontSize: 14 }}>
                {formatPrice(offering.price_cents)} for 4 weeks
              </p>
            </div>
            <Link
              href={`/${vertical}/vendor/market-boxes/${offeringId}/edit`}
              style={{
                padding: '10px 20px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 14
              }}
            >
              {`Edit/Reconfigure ${term(vertical, 'market_box')}`}
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #e5e7eb' }}>
          {(['overview', 'subscribers', 'pickups'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 20px',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? `2px solid ${branding.colors.primary}` : '2px solid transparent',
                color: activeTab === tab ? branding.colors.primary : '#6b7280',
                fontWeight: activeTab === tab ? 600 : 400,
                cursor: 'pointer',
                fontSize: 14,
                textTransform: 'capitalize'
              }}
            >
              {tab}
              {tab === 'subscribers' && ` (${activeSubscriberCount})`}
              {tab === 'pickups' && ` (${pickups.filter(p => p.status === 'scheduled' || p.status === 'ready').length} upcoming)`}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ padding: 20, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: 16 }}>Details</h3>

              {offering.description && (
                <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>{offering.description}</p>
              )}

              <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#6b7280', minWidth: 120 }}>Price:</span>
                  <span style={{ color: '#374151', fontWeight: 500 }}>{formatPrice(offering.price_cents)} for 4 weeks</span>
                </div>
                {formatQuantityDisplay(offering.quantity_amount, offering.quantity_unit) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#6b7280', minWidth: 120 }}>Size / Amount:</span>
                    <span style={{ color: '#374151', fontWeight: 500 }}>{formatQuantityDisplay(offering.quantity_amount, offering.quantity_unit)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#6b7280', minWidth: 120 }}>Pickup Day:</span>
                  <span style={{ color: '#374151' }}>{DAYS[offering.pickup_day_of_week]}s</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#6b7280', minWidth: 120 }}>Pickup Time:</span>
                  <span style={{ color: '#374151' }}>{formatTime(offering.pickup_start_time)} - {formatTime(offering.pickup_end_time)}</span>
                </div>
                {offering.market && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#6b7280', minWidth: 120 }}>Location:</span>
                    <span style={{ color: '#374151' }}>
                      {offering.market.name} - {offering.market.address}, {offering.market.city}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: '#6b7280', minWidth: 120 }}>Subscribers:</span>
                  <span style={{ color: '#374151' }}>
                    {activeSubscriberCount}
                    {offering.max_subscribers && ` / ${offering.max_subscribers} max`}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
              <div style={{ padding: 16, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: branding.colors.primary }}>{activeSubscriberCount}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Active Subscribers</div>
              </div>
              <div style={{ padding: 16, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#166534' }}>
                  {pickups.filter(p => p.status === 'picked_up').length}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Completed Pickups</div>
              </div>
              <div style={{ padding: 16, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#92400e' }}>
                  {pickups.filter(p => p.status === 'scheduled' || p.status === 'ready').length}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Upcoming Pickups</div>
              </div>
            </div>
          </div>
        )}

        {/* Subscribers Tab */}
        {activeTab === 'subscribers' && (
          <div>
            {subscribers.length === 0 ? (
              <div style={{
                padding: 40,
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
                <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>No Subscribers Yet</h3>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  When buyers subscribe to this market box, they&apos;ll appear here.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {subscribers.map(sub => (
                  <div
                    key={sub.id}
                    style={{
                      padding: 16,
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#374151' }}>{sub.buyer.display_name}</div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{sub.buyer.email}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, color: '#6b7280' }}>Started {formatDate(sub.start_date)}</div>
                          <div style={{ fontSize: 13, color: '#374151' }}>
                            Week {sub.weeks_completed} of {sub.term_weeks + sub.extended_weeks}
                          </div>
                        </div>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: sub.status === 'active' ? '#dcfce7' : '#f3f4f6',
                          color: sub.status === 'active' ? '#166534' : '#6b7280',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          textTransform: 'uppercase'
                        }}>
                          {sub.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pickups Tab */}
        {activeTab === 'pickups' && (
          <div>
            {/* Confirmation message */}
            {confirmMessage && (
              <div style={{
                padding: '12px 16px',
                marginBottom: 16,
                backgroundColor: confirmMessage.includes('both parties') ? '#dcfce7' : confirmMessage.includes('Waiting') ? '#fef3c7' : '#fee2e2',
                border: `1px solid ${confirmMessage.includes('both parties') ? '#86efac' : confirmMessage.includes('Waiting') ? '#fcd34d' : '#fecaca'}`,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: confirmMessage.includes('both parties') ? '#166534' : confirmMessage.includes('Waiting') ? '#92400e' : '#991b1b',
              }}>
                {confirmMessage}
              </div>
            )}
            {pickups.length === 0 ? (
              <div style={{
                padding: 40,
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
                <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>No Pickups Scheduled</h3>
                <p style={{ color: '#6b7280', margin: 0 }}>
                  Pickups will appear here when subscribers purchase this market box.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pickups.map(pickup => {
                  const statusColor = getStatusColor(pickup.status)
                  const isUpcoming = pickup.status === 'scheduled' || pickup.status === 'ready'
                  const today = new Date().toISOString().split('T')[0]
                  const isToday = pickup.scheduled_date === today
                  const isPast = pickup.scheduled_date < today

                  return (
                    <div
                      key={pickup.id}
                      style={{
                        padding: 16,
                        backgroundColor: 'white',
                        border: `1px solid ${isToday ? branding.colors.primary : '#e5e7eb'}`,
                        borderRadius: 8,
                        opacity: pickup.status === 'picked_up' || pickup.status === 'missed' || pickup.status === 'skipped' ? 0.7 : 1
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: '#374151' }}>
                              {formatDate(pickup.scheduled_date)}
                            </span>
                            {isToday && (
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: branding.colors.primary,
                                color: 'white',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600
                              }}>
                                TODAY
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
                              {pickup.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#6b7280' }}>
                            Week {pickup.week_number} of {(pickup.subscription?.term_weeks || 4) + (pickup.subscription?.extended_weeks || 0)} • {pickup.subscription?.buyer?.display_name || 'Buyer'}
                            {pickup.is_extension && (
                              <span style={{
                                marginLeft: 8,
                                padding: '2px 6px',
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 600
                              }}>
                                EXTENSION
                              </span>
                            )}
                          </div>
                          {pickup.rescheduled_to && (
                            <div style={{ fontSize: 13, color: '#6b21a8', marginTop: 4 }}>
                              Rescheduled to {formatDate(pickup.rescheduled_to)}
                            </div>
                          )}
                          {pickup.status === 'skipped' && pickup.skip_reason && (
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>
                              Skip reason: {pickup.skip_reason}
                            </div>
                          )}
                        </div>

                        {isUpcoming && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {pickup.status === 'scheduled' && (
                              <button
                                onClick={() => handlePickupAction(pickup.id, 'ready')}
                                disabled={updatingPickup === pickup.id}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  border: 'none',
                                  borderRadius: 4,
                                  fontSize: 13,
                                  cursor: 'pointer'
                                }}
                              >
                                Mark Ready
                              </button>
                            )}
                            {(pickup.status === 'scheduled' || pickup.status === 'ready') && (
                              <>
                                {/* Buyer waiting indicator */}
                                {pickup.buyer_confirmed_at && !pickup.vendor_confirmed_at && (
                                  <span style={{
                                    padding: '4px 8px',
                                    backgroundColor: '#fef3c7',
                                    color: '#92400e',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    animation: 'pulse 1.5s infinite',
                                  }}>
                                    Buyer confirmed!
                                  </span>
                                )}
                                <button
                                  onClick={() => handlePickupAction(pickup.id, 'picked_up')}
                                  disabled={updatingPickup === pickup.id || waitingForBuyer === pickup.id}
                                  style={{
                                    padding: '6px 12px',
                                    backgroundColor: pickup.buyer_confirmed_at
                                      ? '#b45309'  // Urgent — buyer is waiting
                                      : waitingForBuyer === pickup.id
                                        ? '#9ca3af'
                                        : '#dcfce7',
                                    color: pickup.buyer_confirmed_at ? 'white' : '#166534',
                                    border: 'none',
                                    borderRadius: 4,
                                    fontSize: 13,
                                    fontWeight: pickup.buyer_confirmed_at ? 600 : 400,
                                    cursor: updatingPickup === pickup.id ? 'not-allowed' : 'pointer'
                                  }}
                                >
                                  {waitingForBuyer === pickup.id
                                    ? 'Waiting for buyer...'
                                    : pickup.buyer_confirmed_at
                                      ? 'Confirm Handoff Now!'
                                      : 'Picked Up'}
                                </button>
                                {!pickup.is_extension && (
                                  <button
                                    onClick={() => setSkipModalPickup(pickup)}
                                    disabled={updatingPickup === pickup.id}
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: '#f3f4f6',
                                      color: '#374151',
                                      border: '1px solid #d1d5db',
                                      borderRadius: 4,
                                      fontSize: 13,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Skip Week
                                  </button>
                                )}
                                {isPast && (
                                  <button
                                    onClick={() => handlePickupAction(pickup.id, 'missed')}
                                    disabled={updatingPickup === pickup.id}
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: '#fee2e2',
                                      color: '#991b1b',
                                      border: 'none',
                                      borderRadius: 4,
                                      fontSize: 13,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Missed
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Skip Week Modal */}
        {skipModalPickup && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#374151' }}>Skip This Week?</h3>
              <p style={{ color: '#6b7280', margin: '0 0 16px 0', fontSize: 14 }}>
                Skipping Week {skipModalPickup.week_number} for {skipModalPickup.subscription?.buyer?.display_name || 'this subscriber'} will:
              </p>
              <ul style={{ color: '#6b7280', fontSize: 14, margin: '0 0 16px 0', paddingLeft: 20 }}>
                <li>Mark this pickup as skipped</li>
                <li>Add an extra week to the end of their subscription</li>
                <li>The subscriber will be notified</li>
              </ul>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151', fontSize: 14 }}>
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  placeholder="e.g., Weather delay, crop shortage..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setSkipModalPickup(null); setSkipReason('') }}
                  disabled={skipping}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSkipWeek}
                  disabled={skipping}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: skipping ? '#9ca3af' : branding.colors.primary,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: skipping ? 'not-allowed' : 'pointer'
                  }}
                >
                  {skipping ? 'Skipping...' : 'Skip Week'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
