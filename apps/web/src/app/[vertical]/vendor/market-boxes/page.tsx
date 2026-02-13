'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import ShareButton from '@/components/marketing/ShareButton'

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
  created_at: string
  active_subscribers: number
  max_subscribers: number | null
  is_at_capacity: boolean
  market: {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
  } | null
}

interface Limits {
  tier: string
  max_offerings: number
  current_offerings: number
  can_create_more: boolean
  subscriber_limit: number | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function VendorMarketBoxesPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  const [offerings, setOfferings] = useState<MarketBoxOffering[]>([])
  const [limits, setLimits] = useState<Limits | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    fetchOfferings()
    // Get base URL for share links
    setBaseUrl(`${window.location.protocol}//${window.location.host}`)
  }, [])

  const fetchOfferings = async () => {
    try {
      const res = await fetch(`/api/vendor/market-boxes?vertical=${vertical}`)
      const data = await res.json()

      if (!res.ok) {
        setError({
          message: data.error || 'Failed to fetch offerings',
          code: data.code,
          traceId: data.traceId
        })
        return
      }

      setOfferings(data.offerings || [])
      setLimits(data.limits || null)
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to load market boxes' })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (offeringId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/vendor/market-boxes/${offeringId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update offering')
      }

      fetchOfferings()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update')
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, padding: 24 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center', paddingTop: 100 }}>
          Loading...
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
            href={`/${vertical}/vendor/dashboard`}
            style={{ color: branding.colors.primary, textDecoration: 'none', fontSize: 14 }}
          >
            ← Back to Dashboard
          </Link>
          <h1 style={{ color: branding.colors.primary, margin: '16px 0 8px 0', fontSize: 28 }}>
            Market Boxes
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Offer 4-week <strong>prepaid</strong> subscription bundles to premium buyers
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: 24 }}>
            <ErrorDisplay error={error} verticalId={vertical} />
          </div>
        )}

        {/* Tier Info Banner */}
        {limits && (
          <div style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: limits.tier === 'premium' ? '#fef3c7' : '#f3f4f6',
            border: `1px solid ${limits.tier === 'premium' ? '#fcd34d' : '#e5e7eb'}`,
            borderRadius: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <strong style={{ fontSize: 14, color: limits.tier === 'premium' ? '#92400e' : '#374151' }}>
                  {limits.tier === 'premium' ? 'Premium Vendor' : 'Standard Vendor'}
                </strong>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#666' }}>
                  {limits.current_offerings} of {limits.max_offerings} offering{limits.max_offerings > 1 ? 's' : ''} used
                  {limits.subscriber_limit && ` • ${limits.subscriber_limit} subscribers per box`}
                  {!limits.subscriber_limit && ' • Unlimited subscribers'}
                </p>
              </div>
              {limits.tier !== 'premium' && (
                <Link
                  href={`/${vertical}/vendor/dashboard/upgrade`}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: branding.colors.primary,
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  Upgrade for More
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Create New Button */}
        {limits?.can_create_more && (
          <div style={{ marginBottom: 24 }}>
            <Link
              href={`/${vertical}/vendor/market-boxes/new`}
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14
              }}
            >
              + Create Market Box
            </Link>
          </div>
        )}

        {!limits?.can_create_more && offerings.length > 0 && (
          <div style={{
            padding: 12,
            marginBottom: 24,
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            color: '#92400e',
            fontSize: 13
          }}>
            You&apos;ve reached your limit of {limits?.max_offerings} market box offering{(limits?.max_offerings || 0) > 1 ? 's' : ''}.
            {limits?.tier !== 'premium' && ' Upgrade to Premium for more.'}
          </div>
        )}

        {/* Offerings List */}
        {offerings.length === 0 ? (
          <div style={{
            padding: 40,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#374151' }}>No Market Boxes Yet</h3>
            <p style={{ color: '#6b7280', margin: '0 0 24px 0' }}>
              Create your first 4-week subscription box to offer recurring purchases to premium buyers.
            </p>
            {limits?.can_create_more && (
              <Link
                href={`/${vertical}/vendor/market-boxes/new`}
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
                Create Your First Market Box
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {offerings.map(offering => (
              <div
                key={offering.id}
                style={{
                  padding: 16,
                  backgroundColor: 'white',
                  border: `1px solid ${offering.active ? '#e5e7eb' : '#fecaca'}`,
                  borderRadius: 8,
                  opacity: offering.active ? 1 : 0.7
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  {/* Image */}
                  {offering.image_urls && offering.image_urls.length > 0 && (
                    <img
                      src={offering.image_urls[0]}
                      alt={offering.name}
                      style={{
                        width: 100,
                        height: 100,
                        objectFit: 'cover',
                        borderRadius: 8,
                        flexShrink: 0
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 18, color: '#374151' }}>{offering.name}</h3>
                      {!offering.active && (
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600
                        }}>
                          INACTIVE
                        </span>
                      )}
                      {offering.is_at_capacity && (
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600
                        }}>
                          AT CAPACITY
                        </span>
                      )}
                    </div>

                    {offering.description && (
                      <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: 14 }}>
                        {offering.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: '#666' }}>
                      <div>
                        <strong>Price:</strong> {formatPrice(offering.price_cents)} for 4 weeks
                      </div>
                      <div>
                        <strong>Pickup:</strong> {DAYS[offering.pickup_day_of_week]}s {formatTime(offering.pickup_start_time)}-{formatTime(offering.pickup_end_time)}
                      </div>
                      {offering.market && (
                        <div>
                          <strong>Location:</strong> {offering.market.name}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 12, fontSize: 13 }}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: offering.active_subscribers > 0 ? '#dcfce7' : '#f3f4f6',
                        color: offering.active_subscribers > 0 ? '#166534' : '#6b7280',
                        borderRadius: 4
                      }}>
                        {offering.active_subscribers} active subscriber{offering.active_subscribers !== 1 ? 's' : ''}
                        {offering.max_subscribers && ` / ${offering.max_subscribers} max`}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Link
                      href={`/${vertical}/vendor/market-boxes/${offering.id}`}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: branding.colors.primary,
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 500,
                        textAlign: 'center'
                      }}
                    >
                      Manage
                    </Link>
                    {/* Share button - only for active offerings */}
                    {offering.active && baseUrl && (
                      <ShareButton
                        url={`${baseUrl}/${vertical}/market-box/${offering.id}`}
                        title={`${offering.name} - Market Box Subscription`}
                        text={`Subscribe to ${offering.name} for weekly pickups!`}
                        variant="compact"
                      />
                    )}
                    <button
                      onClick={() => handleToggleActive(offering.id, offering.active)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: offering.active ? '#fee2e2' : '#dcfce7',
                        color: offering.active ? '#991b1b' : '#166534',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      {offering.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
