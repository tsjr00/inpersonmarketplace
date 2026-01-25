'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { formatDisplayPrice, calculateDisplayPrice } from '@/lib/constants'

interface AvailableTerm {
  weeks: number
  label: string
  price_cents: number
  price_per_week_cents: number
  savings_cents: number
  savings_percent: number
}

interface MarketBoxData {
  offering: {
    id: string
    name: string
    description: string | null
    image_urls: string[] | null
    price_cents: number
    price_4week_cents?: number
    price_8week_cents?: number | null
    pickup_day_of_week: number
    pickup_start_time: string
    pickup_end_time: string
  }
  vendor: {
    id: string
    name: string
    description?: string | null
    profile_image_url?: string | null
    tier?: string
  }
  market: {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
  } | null
  availability: {
    is_available: boolean
    active_subscribers: number
    max_subscribers: number | null
    spots_remaining: number | null
  }
  available_terms: AvailableTerm[]
  purchase: {
    can_purchase: boolean
    block_reason: string | null
    next_start_date: string
    weeks: number
    total_price_cents: number
  }
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function MarketBoxDetailPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const offeringId = params.id as string
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  const [data, setData] = useState<MarketBoxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  const [selectedTermWeeks, setSelectedTermWeeks] = useState<number>(4)

  const fetchOffering = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-boxes/${offeringId}`)
      const responseData = await res.json()

      if (!res.ok) {
        throw new Error(responseData.error || 'Failed to fetch offering')
      }

      setData(responseData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load offering')
    } finally {
      setLoading(false)
    }
  }, [offeringId])

  useEffect(() => {
    fetchOffering()
  }, [fetchOffering])

  const handleSubscribe = async () => {
    setSubscribing(true)
    setError(null)

    try {
      const res = await fetch('/api/buyer/market-boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offering_id: offeringId,
          term_weeks: selectedTermWeeks,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to subscribe')
      }

      // Redirect to buyer's subscriptions page
      router.push(`/${vertical}/buyer/subscriptions`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe')
    } finally {
      setSubscribing(false)
    }
  }

  // Use shared formatDisplayPrice for buyer-facing prices (includes 6.5% markup)
  const formatPrice = (vendorPriceCents: number) => {
    return formatDisplayPrice(vendorPriceCents)
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  // Calculate next pickup date based on day of week
  const getNextPickupDate = (dayOfWeek: number) => {
    const today = new Date()
    const todayDay = today.getDay()
    let daysUntil = dayOfWeek - todayDay
    if (daysUntil <= 0) daysUntil += 7
    const nextDate = new Date(today)
    nextDate.setDate(today.getDate() + daysUntil)
    return nextDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', paddingTop: 100 }}>
          Loading...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{
            padding: 24,
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
            textAlign: 'center'
          }}>
            {error || 'Market box not found'}
          </div>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href={`/${vertical}/browse?view=market-boxes`} style={{ color: branding.colors.primary }}>
              Back to Market Boxes
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { offering, vendor, market, availability, available_terms, purchase } = data
  const isAtCapacity = !availability.is_available
  const hasMultipleTerms = available_terms && available_terms.length > 1
  const selectedTerm = available_terms?.find(t => t.weeks === selectedTermWeeks) || available_terms?.[0]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        {/* Back Link */}
        <Link
          href={`/${vertical}/browse?view=market-boxes`}
          style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
        >
          ← Back to Market Boxes
        </Link>

        {/* Main Content */}
        <div style={{ marginTop: 24, display: 'grid', gap: 24 }}>
          {/* Market Box Image */}
          {offering.image_urls && offering.image_urls.length > 0 ? (
            <img
              src={offering.image_urls[0]}
              alt={offering.name}
              style={{
                width: '100%',
                height: 300,
                objectFit: 'cover',
                borderRadius: 12,
                backgroundColor: '#f3f4f6'
              }}
            />
          ) : (
            <div style={{
              height: 300,
              backgroundColor: '#eff6ff',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              fontSize: 80
            }}>
              📦
            </div>
          )}

          {/* Title & Price */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{
                padding: '4px 12px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                borderRadius: 16,
                fontSize: 12,
                fontWeight: 600
              }}>
                Weekly Subscription
              </span>
              {isAtCapacity && (
                <span style={{
                  padding: '4px 12px',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 600
                }}>
                  Currently Full
                </span>
              )}
            </div>
            <h1 style={{ color: branding.colors.primary, margin: '0 0 8px 0', fontSize: 32 }}>
              {offering.name}
            </h1>
            <Link
              href={`/${vertical}/vendor/${vendor.id}/profile`}
              style={{
                fontSize: 14,
                color: branding.colors.primary,
                textDecoration: 'none',
                marginBottom: 16,
                display: 'inline-block'
              }}
            >
              by <span style={{ fontWeight: 600 }}>{vendor.name}</span> →
            </Link>

            {/* Term Selection */}
            {hasMultipleTerms ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
                  Choose your subscription length:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {available_terms.map(term => (
                    <button
                      key={term.weeks}
                      onClick={() => setSelectedTermWeeks(term.weeks)}
                      style={{
                        padding: 16,
                        backgroundColor: selectedTermWeeks === term.weeks ? '#eff6ff' : 'white',
                        border: `2px solid ${selectedTermWeeks === term.weeks ? branding.colors.primary : '#e5e7eb'}`,
                        borderRadius: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        position: 'relative'
                      }}
                    >
                      {term.savings_cents > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: -8,
                          right: 8,
                          padding: '2px 8px',
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600
                        }}>
                          Save {formatPrice(term.savings_cents)}
                        </span>
                      )}
                      <div style={{ fontWeight: 600, color: '#374151', fontSize: 16 }}>
                        {term.label}
                      </div>
                      <div style={{ fontWeight: 700, color: branding.colors.primary, fontSize: 24, marginTop: 4 }}>
                        {formatPrice(term.price_cents)}
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        {formatPrice(term.price_per_week_cents)}/week
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 32, fontWeight: 700, color: branding.colors.primary }}>
                  {formatPrice(selectedTerm?.price_cents || offering.price_cents)}
                </div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>
                  for 4 weeks ({formatPrice((selectedTerm?.price_cents || offering.price_cents) / 4)}/week)
                </div>
              </>
            )}
          </div>

          {/* Description */}
          {offering.description && (
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8
            }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: 16 }}>Description</h3>
              <p style={{ margin: 0, color: '#6b7280', lineHeight: 1.6 }}>{offering.description}</p>
            </div>
          )}

          {/* Pickup Details */}
          <div style={{
            padding: 20,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: 16 }}>Pickup Details</h3>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 24 }}>📅</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#374151' }}>
                    Every {DAYS[offering.pickup_day_of_week]}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    First pickup: {getNextPickupDate(offering.pickup_day_of_week)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 24 }}>🕐</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#374151' }}>
                    {formatTime(offering.pickup_start_time)} - {formatTime(offering.pickup_end_time)}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Pickup window
                  </div>
                </div>
              </div>

              {market && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>📍</span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#374151' }}>
                      {market.name}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>
                      {market.address}, {market.city}, {market.state}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vendor Info */}
          <div style={{
            padding: 20,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#374151', fontSize: 16 }}>Sold by</h3>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {vendor.profile_image_url ? (
                <img
                  src={vendor.profile_image_url}
                  alt={vendor.name}
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid #e5e7eb'
                  }}
                />
              ) : (
                <div style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  backgroundColor: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  color: '#9ca3af'
                }}>
                  🧑‍🌾
                </div>
              )}
              <div style={{ flex: 1 }}>
                <Link
                  href={`/${vertical}/vendor/${vendor.id}/profile`}
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: branding.colors.primary,
                    textDecoration: 'none'
                  }}
                >
                  {vendor.name}
                </Link>
                {vendor.description && (
                  <p style={{
                    margin: '4px 0 0 0',
                    fontSize: 13,
                    color: '#6b7280',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {vendor.description}
                  </p>
                )}
              </div>
            </div>
            <Link
              href={`/${vertical}/vendor/${vendor.id}/profile`}
              style={{
                display: 'block',
                marginTop: 16,
                padding: '12px 16px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                textAlign: 'center'
              }}
            >
              View Vendor Profile
            </Link>
          </div>

          {/* How It Works */}
          <div style={{
            padding: 20,
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#1e40af', fontSize: 16 }}>How It Works</h3>
            <ol style={{ margin: 0, paddingLeft: 20, color: '#1e40af', fontSize: 14, lineHeight: 1.8 }}>
              <li>Pay the full amount today ({formatPrice(selectedTerm?.price_cents || offering.price_cents)})</li>
              <li>Pick up your first box on {getNextPickupDate(offering.pickup_day_of_week)}</li>
              <li>Return every {DAYS[offering.pickup_day_of_week]} for {selectedTermWeeks} consecutive weeks</li>
              <li>Each pickup contains fresh products from {vendor.name}</li>
              <li style={{ color: '#059669' }}>If vendor needs to skip a week (weather, etc.), your subscription extends automatically</li>
            </ol>
          </div>

          {/* Subscribe Button */}
          <div style={{ marginTop: 8 }}>
            {purchase.block_reason && (
              <div style={{
                padding: 12,
                marginBottom: 16,
                backgroundColor: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: 8,
                color: '#92400e',
                fontSize: 14
              }}>
                {purchase.block_reason}
                {purchase.block_reason.includes('Premium') && (
                  <Link
                    href={`/${vertical}/buyer/upgrade`}
                    style={{
                      display: 'block',
                      marginTop: 8,
                      color: '#92400e',
                      fontWeight: 600
                    }}
                  >
                    Upgrade to Premium →
                  </Link>
                )}
              </div>
            )}

            <button
              onClick={handleSubscribe}
              disabled={subscribing || !purchase.can_purchase}
              style={{
                width: '100%',
                padding: '16px 24px',
                backgroundColor: subscribing || !purchase.can_purchase ? '#9ca3af' : branding.colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 18,
                fontWeight: 600,
                cursor: subscribing || !purchase.can_purchase ? 'not-allowed' : 'pointer'
              }}
            >
              {subscribing ? 'Processing...' : `Subscribe for ${formatPrice(selectedTerm?.price_cents || offering.price_cents)}`}
            </button>

            <p style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
              Premium membership required. You&apos;ll be charged the full amount today for {selectedTermWeeks} weeks.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
