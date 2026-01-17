'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'

interface MarketBoxOffering {
  id: string
  name: string
  description: string | null
  image_urls: string[]
  price_cents: number
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
  active_subscribers: number
  subscribers: Subscriber[]
}

interface Subscriber {
  id: string
  start_date: string
  status: string
  weeks_completed: number
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
  subscription: {
    id: string
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
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  const [offering, setOffering] = useState<MarketBoxOffering | null>(null)
  const [pickups, setPickups] = useState<Pickup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'subscribers' | 'pickups'>('overview')
  const [updatingPickup, setUpdatingPickup] = useState<string | null>(null)

  const fetchOffering = useCallback(async () => {
    try {
      const res = await fetch(`/api/vendor/market-boxes/${offeringId}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch offering')
      }

      setOffering(data.offering)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load offering')
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

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update pickup')
      }

      fetchPickups()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setUpdatingPickup(null)
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
          <div style={{
            padding: 24,
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
            textAlign: 'center'
          }}>
            {error || 'Offering not found'}
          </div>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href={`/${vertical}/vendor/market-boxes`} style={{ color: branding.colors.primary }}>
              Back to Market Boxes
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
            ← Back to Market Boxes
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
              Edit/Reconfigure Market Box
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
              {tab === 'subscribers' && ` (${offering.active_subscribers})`}
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
                    {offering.active_subscribers}
                    {offering.max_subscribers && ` / ${offering.max_subscribers} max`}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
              <div style={{ padding: 16, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: branding.colors.primary }}>{offering.active_subscribers}</div>
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
            {(!offering.subscribers || offering.subscribers.length === 0) ? (
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
                {(offering.subscribers || []).map(sub => (
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
                            Week {sub.weeks_completed + 1} of 4
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
                        opacity: pickup.status === 'picked_up' || pickup.status === 'missed' ? 0.7 : 1
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
                            Week {pickup.week_number} • {pickup.subscription.buyer.display_name}
                          </div>
                          {pickup.rescheduled_to && (
                            <div style={{ fontSize: 13, color: '#6b21a8', marginTop: 4 }}>
                              Rescheduled to {formatDate(pickup.rescheduled_to)}
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
                                <button
                                  onClick={() => handlePickupAction(pickup.id, 'picked_up')}
                                  disabled={updatingPickup === pickup.id}
                                  style={{
                                    padding: '6px 12px',
                                    backgroundColor: '#dcfce7',
                                    color: '#166534',
                                    border: 'none',
                                    borderRadius: 4,
                                    fontSize: 13,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Picked Up
                                </button>
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
      </div>
    </div>
  )
}
