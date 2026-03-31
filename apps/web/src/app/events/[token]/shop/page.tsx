'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'
import { calculateItemDisplayPrice, formatPrice } from '@/lib/pricing'

// ── Types ──
interface Listing {
  id: string
  title: string
  description: string | null
  price_cents: number
  primary_image_url: string | null
  quantity: number | null
  unit_label: string | null
}

interface Vendor {
  id: string
  business_name: string
  description: string | null
  profile_image_url: string | null
  pickup_lead_minutes: number
  listings: Listing[]
}

interface EventData {
  company_name: string
  event_date: string
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  city: string
  state: string
  address: string | null
  vertical_id: string
  market_id: string
  status: string
  is_themed: boolean
  theme_description: string | null
  children_present: boolean
}

interface ScheduleData {
  id: string
  start_time: string
  end_time: string
}

// ── Helpers ──
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function generateSlots(startTime: string, endTime: string, intervalMin: number): string[] {
  const slots: string[] = []
  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)
  let current = startH * 60 + startM
  const end = endH * 60 + endM
  while (current < end) {
    const h = Math.floor(current / 60)
    const m = current % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    current += intervalMin
  }
  return slots
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── Component ──
export default function EventShopPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [event, setEvent] = useState<EventData | null>(null)
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [isFT, setIsFT] = useState(false)
  const [pickupDate, setPickupDate] = useState<string>('')

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Cart state: { [listingId]: quantity }
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [pickupTime, setPickupTime] = useState<string>('')
  const [addingToCart, setAddingToCart] = useState<string | null>(null) // vendor id being added
  const [cartMessage, setCartMessage] = useState<string | null>(null)
  const [vendorsAdded, setVendorsAdded] = useState<Set<string>>(new Set()) // vendors successfully added to cart

  // Check auth
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user)
      setCheckingAuth(false)
    })
  }, [])

  // Fetch event data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/events/${token}/shop`)
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Event not found')
          return
        }
        const data = await res.json()
        setEvent(data.event)
        setSchedule(data.schedule)
        setVendors(data.vendors)
        setIsFT(data.is_food_truck)
        setPickupDate(data.pickup_date)
      } catch {
        setError('Failed to load event')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [token])

  // Compute time slots for FT (based on longest lead time among vendors with selected items)
  const timeSlots = useMemo(() => {
    if (!isFT || !schedule?.start_time || !schedule?.end_time) return []

    // Find the longest lead time among vendors that have items selected
    const vendorsWithSelections = vendors.filter(v =>
      v.listings.some(l => (quantities[l.id] || 0) > 0)
    )

    const maxLead = vendorsWithSelections.length > 0
      ? Math.max(...vendorsWithSelections.map(v => v.pickup_lead_minutes))
      : Math.max(...vendors.map(v => v.pickup_lead_minutes), 30)

    const interval = maxLead > 15 ? 30 : 15
    return generateSlots(schedule.start_time, schedule.end_time, interval)
  }, [isFT, schedule, vendors, quantities])

  // Cart totals
  const cartItems = useMemo(() => {
    const items: Array<{ listing: Listing; vendor: Vendor; qty: number }> = []
    for (const v of vendors) {
      for (const l of v.listings) {
        const qty = quantities[l.id] || 0
        if (qty > 0) items.push({ listing: l, vendor: v, qty })
      }
    }
    return items
  }, [vendors, quantities])

  const cartTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + calculateItemDisplayPrice(item.listing.price_cents) * item.qty, 0)
  }, [cartItems])

  function updateQty(listingId: string, delta: number, max: number | null) {
    setQuantities(prev => {
      const current = prev[listingId] || 0
      const next = Math.max(0, current + delta)
      if (max !== null && next > max) return prev
      return { ...prev, [listingId]: next }
    })
  }

  async function addVendorToCart(vendorId: string) {
    if (!event || !schedule || !pickupDate) return

    const vendorItems = cartItems.filter(item => item.vendor.id === vendorId)
    if (vendorItems.length === 0) return

    // FT requires pickup time
    if (isFT && !pickupTime) {
      setCartMessage('Please select a pickup time for your food')
      return
    }

    setAddingToCart(vendorId)
    setCartMessage(null)

    try {
      for (const item of vendorItems) {
        const res = await fetch('/api/cart/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vertical: event.vertical_id,
            listingId: item.listing.id,
            marketId: event.market_id,
            scheduleId: schedule.id,
            pickupDate: pickupDate,
            quantity: item.qty,
            preferredPickupTime: isFT ? pickupTime : null,
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          setCartMessage(`Error: ${err.error || 'Failed to add item'}`)
          setAddingToCart(null)
          return
        }
      }

      // Clear quantities for this vendor and mark vendor as added
      setQuantities(prev => {
        const next = { ...prev }
        for (const item of vendorItems) delete next[item.listing.id]
        return next
      })
      setVendorsAdded(prev => new Set(prev).add(vendorId))

      const vendorName = vendors.find(v => v.id === vendorId)?.business_name || 'Vendor'
      setCartMessage(`Added ${vendorItems.length} item${vendorItems.length > 1 ? 's' : ''} from ${vendorName} to cart!`)
    } catch {
      setCartMessage('Error: Network error')
    }
    setAddingToCart(null)
  }

  // ── Render ──
  const accent = isFT ? '#ff5757' : '#2d5016'

  if (loading) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: statusColors.neutral500 }}>Loading event...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: statusColors.danger }}>{error || 'Event not found'}</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 120px 16px' }}>
      {/* Event Header */}
      <div style={{
        padding: `${spacing.md} 0`,
        borderBottom: `2px solid ${accent}`,
        marginBottom: spacing.md,
      }}>
        <h1 style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.bold,
          color: accent,
          margin: `0 0 ${spacing['3xs']}`,
        }}>
          {event.company_name}
        </h1>
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: 0, lineHeight: 1.6 }}>
          {fmtDate(event.event_date)}
          {event.event_start_time && event.event_end_time && (
            <> &middot; {formatTime(event.event_start_time)} &ndash; {formatTime(event.event_end_time)}</>
          )}
        </p>
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, margin: `${spacing['3xs']} 0 0` }}>
          {event.address ? `${event.address}, ` : ''}{event.city}, {event.state}
        </p>
        {event.is_themed && event.theme_description && (
          <p style={{ fontSize: typography.sizes.xs, color: accent, fontWeight: typography.weights.medium, margin: `${spacing['2xs']} 0 0` }}>
            {event.theme_description}
          </p>
        )}
      </div>

      {/* Login prompt */}
      {!checkingAuth && !isLoggedIn && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#eff6ff',
          border: '1px solid #93c5fd',
          borderRadius: radius.md,
          marginBottom: spacing.md,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: typography.sizes.sm, color: '#1e40af', margin: `0 0 ${spacing.xs}`, fontWeight: typography.weights.medium }}>
            Sign in to see prices and pre-order items for this event
          </p>
          <Link
            href={`/${event.vertical_id}/login?redirect=/events/${token}/shop`}
            style={{
              display: 'inline-block',
              padding: `${spacing['2xs']} ${spacing.md}`,
              backgroundColor: accent,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.sm,
            }}
          >
            Sign In to Pre-Order
          </Link>
          <p style={{ fontSize: typography.sizes.xs, color: '#6b7280', margin: `${spacing.xs} 0 0` }}>
            New here? You can create an account in seconds.
          </p>
        </div>
      )}

      {/* FT: Pickup time selector */}
      {isFT && isLoggedIn && timeSlots.length > 0 && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: statusColors.neutral50,
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.md,
          marginBottom: spacing.md,
        }}>
          <label style={{
            display: 'block',
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            color: statusColors.neutral700,
            marginBottom: spacing.xs,
          }}>
            What time do you want your food ready?
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'] }}>
            {timeSlots.map(slot => (
              <button
                key={slot}
                onClick={() => setPickupTime(slot)}
                style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  borderRadius: radius.sm,
                  border: `1.5px solid ${pickupTime === slot ? accent : statusColors.neutral300}`,
                  backgroundColor: pickupTime === slot ? accent : 'white',
                  color: pickupTime === slot ? 'white' : statusColors.neutral700,
                  fontSize: typography.sizes.sm,
                  fontWeight: pickupTime === slot ? typography.weights.semibold : typography.weights.normal,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {formatTime(slot)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cart message */}
      {cartMessage && (
        <div style={{
          padding: `${spacing['2xs']} ${spacing.sm}`,
          marginBottom: spacing.sm,
          borderRadius: radius.sm,
          backgroundColor: cartMessage.startsWith('Error') ? '#fef2f2' : '#f0fdf4',
          color: cartMessage.startsWith('Error') ? '#dc2626' : '#166534',
          fontSize: typography.sizes.sm,
        }}>
          {cartMessage}
        </div>
      )}

      {/* Vendors + Listings */}
      {vendors.length === 0 ? (
        <div style={{
          padding: spacing.lg,
          textAlign: 'center',
          color: statusColors.neutral500,
          fontSize: typography.sizes.sm,
        }}>
          No vendors have confirmed for this event yet. Check back soon!
        </div>
      ) : (
        vendors.map(vendor => {
          const vendorCartItems = vendor.listings.filter(l => (quantities[l.id] || 0) > 0)
          const vendorTotal = vendorCartItems.reduce(
            (sum, l) => sum + calculateItemDisplayPrice(l.price_cents) * (quantities[l.id] || 0), 0
          )
          const isAdding = addingToCart === vendor.id

          return (
            <div key={vendor.id} style={{
              marginBottom: spacing.lg,
              backgroundColor: 'white',
              border: `1px solid ${statusColors.neutral200}`,
              borderRadius: radius.lg,
              overflow: 'hidden',
            }}>
              {/* Vendor header */}
              <div style={{
                padding: spacing.sm,
                backgroundColor: statusColors.neutral50,
                borderBottom: `1px solid ${statusColors.neutral200}`,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
              }}>
                {vendor.profile_image_url && (
                  <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                    <Image src={vendor.profile_image_url} alt={vendor.business_name} width={40} height={40} style={{ objectFit: 'cover' }} />
                  </div>
                )}
                <div>
                  <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: 0 }}>
                    {vendor.business_name}
                  </h2>
                  {vendor.description && (
                    <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `2px 0 0`, lineHeight: 1.4 }}>
                      {vendor.description.length > 100 ? vendor.description.slice(0, 100) + '...' : vendor.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Listings grid */}
              <div style={{ padding: spacing.sm }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: spacing.sm,
                }}>
                  {vendor.listings.map(listing => {
                    const qty = quantities[listing.id] || 0
                    const maxQty = listing.quantity
                    const displayPrice = calculateItemDisplayPrice(listing.price_cents)

                    return (
                      <div key={listing.id} style={{
                        border: `1px solid ${qty > 0 ? accent : statusColors.neutral200}`,
                        borderRadius: radius.md,
                        overflow: 'hidden',
                        backgroundColor: qty > 0 ? `${accent}08` : 'white',
                        transition: 'border-color 0.2s',
                      }}>
                        {/* Image */}
                        {listing.primary_image_url ? (
                          <div style={{ width: '100%', height: 100, position: 'relative', backgroundColor: statusColors.neutral100 }}>
                            <Image src={listing.primary_image_url} alt={listing.title} fill style={{ objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div style={{ width: '100%', height: 60, backgroundColor: statusColors.neutral100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 24, opacity: 0.3 }}>📦</span>
                          </div>
                        )}

                        {/* Info */}
                        <div style={{ padding: spacing['2xs'] }}>
                          <h3 style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: 0, lineHeight: 1.3 }}>
                            {listing.title}
                          </h3>
                          {listing.description && (
                            <p style={{ fontSize: 10, color: statusColors.neutral500, margin: `2px 0 0`, lineHeight: 1.3 }}>
                              {listing.description.length > 60 ? listing.description.slice(0, 60) + '...' : listing.description}
                            </p>
                          )}

                          {/* Price + quantity (logged in only) */}
                          {isLoggedIn ? (
                            <div style={{ marginTop: spacing['2xs'] }}>
                              <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: accent }}>
                                {formatPrice(displayPrice)}
                                {listing.unit_label && <span style={{ fontSize: 10, color: statusColors.neutral500, fontWeight: typography.weights.normal }}> / {listing.unit_label}</span>}
                              </div>
                              {maxQty !== null && maxQty <= 10 && (
                                <div style={{ fontSize: 10, color: '#d97706', marginTop: 1 }}>
                                  {maxQty} left
                                </div>
                              )}
                              {/* Quantity selector */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: spacing['3xs'],
                                marginTop: spacing['3xs'],
                              }}>
                                <button
                                  onClick={() => updateQty(listing.id, -1, maxQty)}
                                  disabled={qty === 0}
                                  style={{
                                    width: 28, height: 28, borderRadius: radius.sm,
                                    border: `1px solid ${statusColors.neutral300}`,
                                    backgroundColor: 'white', cursor: qty === 0 ? 'default' : 'pointer',
                                    fontSize: 16, fontWeight: 'bold', color: qty === 0 ? statusColors.neutral300 : statusColors.neutral700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                >
                                  &minus;
                                </button>
                                <span style={{
                                  minWidth: 24, textAlign: 'center',
                                  fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
                                  color: qty > 0 ? accent : statusColors.neutral400,
                                }}>
                                  {qty}
                                </span>
                                <button
                                  onClick={() => updateQty(listing.id, 1, maxQty)}
                                  disabled={maxQty !== null && qty >= maxQty}
                                  style={{
                                    width: 28, height: 28, borderRadius: radius.sm,
                                    border: `1px solid ${accent}`,
                                    backgroundColor: accent, cursor: 'pointer',
                                    fontSize: 16, fontWeight: 'bold', color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: maxQty !== null && qty >= maxQty ? 0.4 : 1,
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginTop: spacing['2xs'], fontSize: 10, color: statusColors.neutral400 }}>
                              Sign in to see price
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Per-vendor Add to Cart / Added confirmation */}
                {isLoggedIn && vendorCartItems.length > 0 ? (
                  <button
                    onClick={() => addVendorToCart(vendor.id)}
                    disabled={isAdding}
                    style={{
                      width: '100%',
                      marginTop: spacing.sm,
                      padding: spacing.xs,
                      backgroundColor: isAdding ? statusColors.neutral300 : accent,
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      cursor: isAdding ? 'not-allowed' : 'pointer',
                      minHeight: 44,
                    }}
                  >
                    {isAdding
                      ? 'Adding...'
                      : `Add ${vendorCartItems.length} item${vendorCartItems.length > 1 ? 's' : ''} from ${vendor.business_name} — ${formatPrice(vendorTotal)}`
                    }
                  </button>
                ) : isLoggedIn && vendorsAdded.has(vendor.id) ? (
                  <div style={{
                    width: '100%',
                    marginTop: spacing.sm,
                    padding: spacing.xs,
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    color: '#166534',
                    textAlign: 'center',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    Items from {vendor.business_name} added to cart
                  </div>
                ) : null}
              </div>
            </div>
          )
        })
      )}

      {/* Sticky cart bar */}
      {isLoggedIn && cartItems.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderTop: `2px solid ${accent}`,
          padding: `${spacing.sm} ${spacing.md}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
        }}>
          <div>
            <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>
              {cartItems.length} item{cartItems.length > 1 ? 's' : ''} selected
            </span>
            <span style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, marginLeft: spacing.xs }}>
              {formatPrice(cartTotal)}
            </span>
            {isFT && pickupTime && (
              <span style={{ fontSize: typography.sizes.xs, color: accent, marginLeft: spacing.xs }}>
                Ready at {formatTime(pickupTime)}
              </span>
            )}
          </div>
          <Link
            href={`/${event.vertical_id}/checkout`}
            style={{
              padding: `${spacing['2xs']} ${spacing.md}`,
              backgroundColor: accent,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.sm,
            }}
          >
            View Cart
          </Link>
        </div>
      )}
    </div>
  )
}
