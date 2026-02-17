'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { defaultBranding } from '@/lib/branding'
import { formatDisplayPrice, formatQuantityDisplay } from '@/lib/constants'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import ShareButton from '@/components/marketing/ShareButton'
import { useCart } from '@/lib/hooks/useCart'
import { getMapsUrl } from '@/lib/utils/maps-link'
import { term } from '@/lib/vertical'

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
    quantity_amount?: number | null
    quantity_unit?: string | null
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

export default function MarketBoxDetailClient() {
  const params = useParams()
  const vertical = params.vertical as string
  const offeringId = params.id as string
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const { addMarketBoxToCart } = useCart()

  const [data, setData] = useState<MarketBoxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  const [selectedTermWeeks, setSelectedTermWeeks] = useState<number>(4)

  const fetchOffering = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-boxes/${offeringId}`)
      const responseData = await res.json()

      if (!res.ok) {
        setError({
          message: responseData.error || 'Failed to fetch offering',
          code: responseData.code,
          traceId: responseData.traceId
        })
        return
      }

      setData(responseData)
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load offering' })
    } finally {
      setLoading(false)
    }
  }, [offeringId])

  useEffect(() => {
    fetchOffering()
  }, [fetchOffering])

  const handleAddToCart = async () => {
    setSubscribing(true)
    setError(null)

    try {
      await addMarketBoxToCart(offeringId, selectedTermWeeks)
      // Cart drawer opens automatically via addMarketBoxToCart
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to add to cart' })
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
              {`${term(vertical, 'market_box')} not found`}
            </div>
          )}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href={`/${vertical}/browse?view=market-boxes`} style={{ color: branding.colors.primary }}>
              {`Back to ${term(vertical, 'market_boxes')}`}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link
            href={`/${vertical}/browse?view=market-boxes`}
            style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
          >
            {`← Back to ${term(vertical, 'market_boxes')}`}
          </Link>
          <ShareButton
            url={`${window.location.origin}/${vertical}/market-box/${offeringId}`}
            title={data?.offering.name || 'Market Box'}
            text={`${data?.offering.name || 'Market Box'} from ${data?.vendor.name || 'vendor'}`}
            variant="compact"
          />
        </div>

        {/* Main Content */}
        <div style={{ marginTop: 24, display: 'grid', gap: 24 }}>
          {/* Market Box Image */}
          {offering.image_urls && offering.image_urls.length > 0 ? (
            <div style={{
              position: 'relative',
              width: '100%',
              height: 300,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: '#f3f4f6'
            }}>
              <Image
                src={offering.image_urls[0]}
                alt={offering.name}
                fill
                sizes="(max-width: 768px) 100vw, 600px"
                style={{ objectFit: 'cover' }}
                priority
              />
            </div>
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
                Prepaid Weekly Subscription
              </span>
              {isAtCapacity ? (
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
              ) : availability.spots_remaining !== null && (
                <span style={{
                  padding: '4px 12px',
                  backgroundColor: '#dcfce7',
                  color: '#166534',
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 600
                }}>
                  {availability.spots_remaining} spot{availability.spots_remaining !== 1 ? 's' : ''} left
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

            {/* Term Selection - Compact */}
            {hasMultipleTerms ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
                  Choose your subscription length:
                </div>
                <div className="term-grid" style={{ display: 'grid', gap: 10 }}>
                  {available_terms.map(termOption => (
                    <button
                      key={termOption.weeks}
                      onClick={() => setSelectedTermWeeks(termOption.weeks)}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: selectedTermWeeks === termOption.weeks ? '#eff6ff' : 'white',
                        border: `2px solid ${selectedTermWeeks === termOption.weeks ? branding.colors.primary : '#e5e7eb'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}
                    >
                      {termOption.savings_cents > 0 && (
                        <span style={{
                          position: 'absolute',
                          top: -6,
                          right: 8,
                          padding: '1px 6px',
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 600
                        }}>
                          Save {formatPrice(termOption.savings_cents)}
                        </span>
                      )}
                      <span style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>
                        {termOption.label}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: branding.colors.primary, fontSize: 18 }}>
                          {formatPrice(termOption.price_cents)}
                        </span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          ({formatPrice(termOption.price_per_week_cents)}/wk)
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 32, fontWeight: 700, color: branding.colors.primary }}>
                  {formatPrice(selectedTerm?.price_cents || offering.price_cents)}
                  {formatQuantityDisplay(offering.quantity_amount ?? null, offering.quantity_unit ?? null) && (
                    <span style={{ fontSize: 16, fontWeight: 400, color: '#6b7280' }}>
                      {' / '}{formatQuantityDisplay(offering.quantity_amount ?? null, offering.quantity_unit ?? null)}
                    </span>
                  )}
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

          {/* How It Works - moved up, styled like other boxes */}
          <div style={{
            padding: 20,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: 16 }}>How It Works</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>•</span>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>Pay {formatPrice(selectedTerm?.price_cents || offering.price_cents)} upfront for {selectedTermWeeks} weeks</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>•</span>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>First pickup: {getNextPickupDate(offering.pickup_day_of_week)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>•</span>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>Return {DAYS[offering.pickup_day_of_week]}s for {selectedTermWeeks} weeks</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>•</span>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>{`${term(vertical, 'market_box')} pickup times may differ from the ${term(vertical, 'vendor').toLowerCase()}'s regular retail hours`}</span>
              </div>
            </div>
            <div style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: '#f0fdf4',
              borderRadius: 6,
              fontSize: 13,
              color: '#166534',
              lineHeight: 1.5
            }}>
              If unforeseen circumstances such as weather or other agricultural realities require your vendor to skip a week, your subscription will automatically be extended by one week at no additional cost.
            </div>
          </div>

          {/* Pickup Details & Vendor Info - side by side on desktop */}
          <div className="details-grid" style={{ display: 'grid', gap: 16 }}>
            {/* Pickup Details */}
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8
            }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: 16 }}>Pickup Details</h3>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>📅</span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>
                      Every {DAYS[offering.pickup_day_of_week]}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      First: {getNextPickupDate(offering.pickup_day_of_week)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🕐</span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>
                      {formatTime(offering.pickup_start_time)} - {formatTime(offering.pickup_end_time)}
                    </div>
                  </div>
                </div>

                {market && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>📍</span>
                    <div>
                      <div style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>
                        {market.name}
                      </div>
                      <a
                        href={getMapsUrl(market.address, market.city, market.state)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', fontSize: 12, color: '#6b7280', textDecoration: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        {market.address}, {market.city}, {market.state}
                      </a>
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
              <h3 style={{ margin: '0 0 12px 0', color: '#374151', fontSize: 16 }}>Sold by</h3>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {vendor.profile_image_url ? (
                  <div style={{
                    position: 'relative',
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '2px solid #e5e7eb'
                  }}>
                    <Image
                      src={vendor.profile_image_url}
                      alt={vendor.name}
                      fill
                      sizes="50px"
                      style={{ objectFit: 'cover' }}
                    />
                  </div>
                ) : (
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    backgroundColor: '#f3f4f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: '#9ca3af'
                  }}>
                    {term(vertical, 'vendor_icon_emoji')}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <Link
                    href={`/${vertical}/vendor/${vendor.id}/profile`}
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: branding.colors.primary,
                      textDecoration: 'none'
                    }}
                  >
                    {vendor.name}
                  </Link>
                  {vendor.description && (
                    <p style={{
                      margin: '2px 0 0 0',
                      fontSize: 12,
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
                  marginTop: 12,
                  padding: '10px 14px',
                  backgroundColor: branding.colors.primary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  textAlign: 'center'
                }}
              >
                View Vendor Profile
              </Link>
            </div>
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
              </div>
            )}

            <button
              onClick={handleAddToCart}
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
              {subscribing ? 'Adding...' : `Add to Cart — ${formatPrice(selectedTerm?.price_cents || offering.price_cents)}`}
            </button>

            <p style={{ marginTop: 12, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
              {selectedTermWeeks}-week subscription · Full amount charged at checkout
            </p>
          </div>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .term-grid {
          grid-template-columns: 1fr;
        }
        .details-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .term-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (min-width: 768px) {
          .details-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  )
}
