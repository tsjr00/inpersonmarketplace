'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCart } from '@/lib/hooks/useCart'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { calculateItemDisplayPrice, formatPrice } from '@/lib/pricing'
import type { EventShopData } from '@/lib/events/shop-data'

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

interface WaveData {
  id: string
  wave_number: number
  start_time: string
  end_time: string
  capacity: number
  reserved_count: number
  remaining: number
  status: string
}

interface WaveReservation {
  id: string
  wave_id: string
  wave_number: number
  status: string
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
interface ShopClientProps {
  vertical: string
  token: string
  /**
   * Full event shop payload pre-fetched by the server component. All
   * initial state is derived from this — no post-hydration fetch
   * waterfall.
   */
  initialData: EventShopData
  /** Server already knows if the request is authenticated via cookies. */
  isLoggedInInitial: boolean
}

export function ShopClient({ vertical, token, initialData, isLoggedInInitial }: ShopClientProps) {
  const { addToCart, itemCount, summary, items: cartItems } = useCart()

  // All initial state comes from server-rendered props (Session 70
  // refactor). Setters stay in place so handlers that mutate state
  // after the page loads still work — only the on-mount fetch was
  // removed.

  // `loading` / `error` remain as state so mutation handlers (code
  // verification, wave reservation, order placement) can set them.
  // They start idle because initial data is already present.
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [event, setEvent] = useState<EventData | null>(initialData.event as EventData | null)
  const [schedule, setSchedule] = useState<ScheduleData | null>(initialData.schedule)
  const [vendors, setVendors] = useState<Vendor[]>(initialData.vendors as Vendor[])
  const [isFT, setIsFT] = useState(initialData.is_food_truck)
  const [pickupDate, setPickupDate] = useState<string>(initialData.pickup_date || '')

  // Auth state — server knows via cookies. Step 3 of the refactor
  // removes the /api/auth/me re-check entirely; until then, the
  // existing useEffect below refreshes this value post-hydration but
  // starts correct.
  const [isLoggedIn, setIsLoggedIn] = useState(isLoggedInInitial)
  const [checkingAuth, setCheckingAuth] = useState(false)

  // Per-listing quantity selection (before adding to cart)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [pickupTime, setPickupTime] = useState<string>('')
  const [addingToCart, setAddingToCart] = useState<string | null>(null) // vendor id being added
  const [cartMessage, setCartMessage] = useState<string | null>(null)
  const isSubmittingRef = useRef(false) // prevents double-click race condition

  // Access code + hybrid state — requires_access_code + company_max_per_attendee_cents
  // come from initialData. If the user already has an ordered reservation,
  // they've used their allowance so we skip the code prompt.
  const hasOrderedReservation = initialData.user_reservation?.status === 'ordered'
  const [requiresAccessCode, setRequiresAccessCode] = useState(initialData.requires_access_code)
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const [accessCodeVerified, setAccessCodeVerified] = useState(hasOrderedReservation)
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [companyCap, setCompanyCap] = useState<number | null>(initialData.company_max_per_attendee_cents)
  const [companyAllowanceUsed, setCompanyAllowanceUsed] = useState(hasOrderedReservation)

  // Wave ordering state (company-paid events)
  const [paymentModel, setPaymentModel] = useState<string>(initialData.payment_model)
  const [waveOrderingEnabled, setWaveOrderingEnabled] = useState(initialData.wave_ordering_enabled)
  const [waves, setWaves] = useState<WaveData[]>(initialData.waves)
  const [userReservation, setUserReservation] = useState<WaveReservation | null>(initialData.user_reservation)
  const [, setSelectedWaveId] = useState<string | null>(null)
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null)
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [reservingWave, setReservingWave] = useState(false)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [orderResult, setOrderResult] = useState<{ order_number: string } | null>(null)
  const [waveError, setWaveError] = useState<string | null>(null)

  // Check auth
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me')
        setIsLoggedIn(res.ok)
      } catch {
        setIsLoggedIn(false)
      }
      setCheckingAuth(false)
    }
    checkAuth()
  }, [])

  // Session 70 — the on-mount `/api/events/${token}/shop` fetch that
  // used to live here was removed. Initial data now arrives via the
  // `initialData` prop from the server-component wrapper, so the
  // content is visible on first paint rather than after hydrate+fetch.
  //
  // The API route still exists (`/api/events/[token]/shop`) and still
  // serves the same payload via the same lib function — a future
  // refetch-on-mutation helper can call it when that's needed.

  // Compute time slots for events (both FT and FM — 30-min intervals)
  const timeSlots = useMemo(() => {
    if (!schedule?.start_time || !schedule?.end_time) return []
    // All events use 30-min slots (consistent, avoids half-hour boundary overlap)
    return generateSlots(schedule.start_time, schedule.end_time, 30)
  }, [schedule])

  // Items currently selected (not yet added to cart)
  const selectedItems = useMemo(() => {
    const items: Array<{ listing: Listing; vendor: Vendor; qty: number }> = []
    for (const v of vendors) {
      for (const l of v.listings) {
        const qty = quantities[l.id] || 0
        if (qty > 0) items.push({ listing: l, vendor: v, qty })
      }
    }
    return items
  }, [vendors, quantities])


  function updateQty(listingId: string, delta: number, max: number | null) {
    setQuantities(prev => {
      const current = prev[listingId] || 0
      const next = Math.max(0, current + delta)
      if (max !== null && next > max) return prev
      return { ...prev, [listingId]: next }
    })
  }

  // Check if a listing is already in the server-side cart
  function getCartQty(listingId: string): number {
    const cartItem = cartItems.find(ci => ci.listingId === listingId)
    return cartItem?.quantity || 0
  }

  async function addVendorToCart(vendorId: string) {
    if (isSubmittingRef.current) return
    if (!event || !schedule || !pickupDate) return

    const vendorItems = selectedItems.filter(item => item.vendor.id === vendorId)
    if (vendorItems.length === 0) return
    isSubmittingRef.current = true

    if (isFT && !pickupTime) {
      setCartMessage('Please select a pickup time for your food')
      isSubmittingRef.current = false
      return
    }

    setAddingToCart(vendorId)
    setCartMessage(null)

    try {
      // Validate vendor has capacity before adding to cart
      const totalQty = vendorItems.reduce((sum, i) => sum + i.qty, 0)
      const capRes = await fetch(`/api/events/${token}/validate-capacity?vendor_profile_id=${vendorId}`)
      if (capRes.ok) {
        const capData = await capRes.json()
        if (!capData.allowed) {
          setCartMessage(capData.reason || `This vendor has reached their order capacity for this event (${capData.cap} orders). Please choose a different vendor.`)
          setAddingToCart(null)
          isSubmittingRef.current = false
          return
        }
        if (capData.remaining !== null && totalQty > capData.remaining) {
          setCartMessage(`This vendor can only accept ${capData.remaining} more order${capData.remaining === 1 ? '' : 's'} at this event.`)
          setAddingToCart(null)
          isSubmittingRef.current = false
          return
        }
      }

      for (const item of vendorItems) {
        await addToCart(
          item.listing.id,
          item.qty,
          event.market_id,
          schedule.id,
          pickupDate,
          pickupTime || undefined
        )
      }

      // Clear selection quantities for this vendor (cart now has the real data)
      setQuantities(prev => {
        const next = { ...prev }
        for (const item of vendorItems) delete next[item.listing.id]
        return next
      })

      const vendorName = vendors.find(v => v.id === vendorId)?.business_name || 'Vendor'
      setCartMessage(`Added ${vendorItems.length} item${vendorItems.length > 1 ? 's' : ''} from ${vendorName} to cart!`)
    } catch (err) {
      setCartMessage(`Error: ${err instanceof Error ? err.message : 'Failed to add item'}`)
    }
    setAddingToCart(null)
    isSubmittingRef.current = false
  }

  // ── Access code verification ──
  async function verifyAccessCode() {
    if (!accessCodeInput.trim()) return
    setVerifyingCode(true)
    setAccessCodeError(null)
    try {
      const res = await fetch(`/api/events/${token}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accessCodeInput.trim() }),
      })
      const data = await res.json()
      if (data.valid) {
        setAccessCodeVerified(true)
        if (data.company_max_per_attendee_cents) setCompanyCap(data.company_max_per_attendee_cents)
      } else {
        setAccessCodeError('Invalid access code. Please check with your event organizer.')
      }
    } catch {
      setAccessCodeError('Unable to verify. Please try again.')
    }
    setVerifyingCode(false)
  }

  // ── Payment model logic ──
  // Pure company-paid: all items company-paid (wave flow)
  // Hybrid: one item ≤ cap company-paid, rest attendee-paid
  // Attendee-paid: everything goes to cart
  const isCompanyPaid = paymentModel === 'company_paid' && waveOrderingEnabled && accessCodeVerified && !companyAllowanceUsed
  const isHybrid = paymentModel === 'hybrid' && accessCodeVerified
  const canUseCompanyAllowance = isHybrid && !companyAllowanceUsed && waveOrderingEnabled

  async function handleReserveWave(waveId: string) {
    if (reservingWave) return
    setReservingWave(true)
    setWaveError(null)
    try {
      const res = await fetch(`/api/events/${token}/waves/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wave_id: waveId }),
      })
      const data = await res.json()
      if (!res.ok) {
        // If wave is full, suggest the next available wave
        const isFullError = data.error?.includes('full') || data.error?.includes('no longer available')
        if (isFullError) {
          const attemptedWave = waves.find(w => w.id === waveId)
          const nextOpen = waves.find(w => w.status === 'open' && w.wave_number > (attemptedWave?.wave_number || 0))
          if (nextOpen) {
            setWaveError(
              `The vendors have reached their order fulfilment capacity for the timeframe from ${formatTime(attemptedWave?.start_time || '')} to ${formatTime(attemptedWave?.end_time || '')}. ` +
              `The next available fulfilment timeframe is from ${formatTime(nextOpen.start_time)} to ${formatTime(nextOpen.end_time)} — please select that time slot.`
            )
          } else {
            setWaveError('All time slots are currently full. Please check back later — slots may open if other attendees cancel.')
          }
        } else {
          setWaveError(data.error || 'Failed to reserve time slot')
        }
        return
      }
      // Find the wave info for display
      const wave = waves.find(w => w.id === waveId)
      setUserReservation({
        id: data.reservation_id,
        wave_id: waveId,
        wave_number: wave?.wave_number || 0,
        status: 'reserved',
      })
      setSelectedWaveId(waveId)
      // Update local wave counts
      setWaves(prev => prev.map(w =>
        w.id === waveId
          ? { ...w, reserved_count: w.reserved_count + 1, remaining: w.remaining - 1, status: w.remaining - 1 <= 0 ? 'full' : 'open' }
          : w
      ))
    } catch {
      setWaveError('Connection error. Please try again.')
    } finally {
      setReservingWave(false)
    }
  }

  async function handleCancelReservation() {
    if (!userReservation || reservingWave) return
    setReservingWave(true)
    setWaveError(null)
    try {
      const res = await fetch(`/api/events/${token}/waves/reserve`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: userReservation.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaveError(data.error || 'Failed to cancel reservation')
        return
      }
      const oldWaveId = userReservation.wave_id
      setUserReservation(null)
      setSelectedWaveId(null)
      setSelectedListingId(null)
      setSelectedVendorId(null)
      // Update local wave counts
      setWaves(prev => prev.map(w =>
        w.id === oldWaveId
          ? { ...w, reserved_count: Math.max(0, w.reserved_count - 1), remaining: w.remaining + 1, status: 'open' }
          : w
      ))
    } catch {
      setWaveError('Connection error. Please try again.')
    } finally {
      setReservingWave(false)
    }
  }

  async function handleConfirmOrder() {
    if (!userReservation || !selectedListingId || !selectedVendorId || placingOrder) return
    setPlacingOrder(true)
    setWaveError(null)
    try {
      const res = await fetch(`/api/events/${token}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: userReservation.id,
          listing_id: selectedListingId,
          vendor_profile_id: selectedVendorId,
          wave_id: userReservation.wave_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaveError(data.error || 'Failed to place order')
        return
      }
      setOrderResult({ order_number: data.order_number })
      setUserReservation(prev => prev ? { ...prev, status: 'ordered' } : null)
    } catch {
      setWaveError('Connection error. Please try again.')
    } finally {
      setPlacingOrder(false)
    }
  }

  // Find selected listing + vendor names for confirmation display
  const selectedListing = useMemo(() => {
    if (!selectedListingId) return null
    for (const v of vendors) {
      const l = v.listings.find(li => li.id === selectedListingId)
      if (l) return { ...l, vendorName: v.business_name }
    }
    return null
  }, [selectedListingId, vendors])

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
            href={`/${vertical}/login?redirect=/${vertical}/events/${token}/shop`}
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

      {/* ═══════ ACCESS CODE ENTRY (company-paid + hybrid) ═══════ */}
      {requiresAccessCode && isLoggedIn && !checkingAuth && !accessCodeVerified && (
        <div style={{
          padding: spacing.md,
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: radius.lg,
          marginBottom: spacing.md,
          textAlign: 'center',
        }}>
          <h3 style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.base, color: '#1e40af' }}>
            Enter Your Event Access Code
          </h3>
          <p style={{ fontSize: typography.sizes.sm, color: '#3b82f6', margin: `0 0 ${spacing.sm}` }}>
            {paymentModel === 'company_paid'
              ? 'Your employer is covering this meal. Enter the access code shared by your event organizer.'
              : `Your employer covers one item up to $${((companyCap || 0) / 100).toFixed(2)}. Enter the code to claim your meal.`}
          </p>
          <div style={{ display: 'flex', gap: spacing.xs, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="e.g. ACME2026"
              value={accessCodeInput}
              onChange={(e) => setAccessCodeInput(e.target.value.toUpperCase())}
              maxLength={8}
              style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                border: `1px solid ${accessCodeError ? '#fca5a5' : '#93c5fd'}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.base,
                fontFamily: 'monospace',
                letterSpacing: '0.15em',
                textAlign: 'center',
                width: 160,
                textTransform: 'uppercase',
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyAccessCode() }}
            />
            <button
              onClick={verifyAccessCode}
              disabled={verifyingCode || !accessCodeInput.trim()}
              style={{
                padding: `${spacing['2xs']} ${spacing.md}`,
                backgroundColor: accent,
                color: 'white',
                border: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
                cursor: verifyingCode ? 'not-allowed' : 'pointer',
                opacity: verifyingCode ? 0.7 : 1,
              }}
            >
              {verifyingCode ? 'Verifying...' : 'Verify'}
            </button>
          </div>
          {accessCodeError && (
            <p style={{ fontSize: typography.sizes.xs, color: '#dc2626', margin: `${spacing.xs} 0 0` }}>
              {accessCodeError}
            </p>
          )}
          <p style={{ fontSize: typography.sizes.xs, color: '#6b7280', margin: `${spacing.sm} 0 0` }}>
            Don&apos;t have a code? You can still browse and order — you&apos;ll pay at checkout.
          </p>
        </div>
      )}

      {/* Company allowance banner (hybrid — code verified, allowance available) */}
      {isHybrid && !companyAllowanceUsed && isLoggedIn && (
        <div style={{
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: radius.md,
          marginBottom: spacing.md,
          fontSize: typography.sizes.sm,
          color: '#166534',
        }}>
          Your company covers one item up to <strong>${((companyCap || 0) / 100).toFixed(2)}</strong>. Items marked &ldquo;Covered&rdquo; are free to you.
          {!waveOrderingEnabled && ' Additional items will be added to your cart for checkout.'}
        </div>
      )}

      {/* Company allowance used banner */}
      {isHybrid && companyAllowanceUsed && isLoggedIn && (
        <div style={{
          padding: `${spacing['2xs']} ${spacing.sm}`,
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: radius.md,
          marginBottom: spacing.md,
          fontSize: typography.sizes.sm,
          color: '#1e40af',
        }}>
          You&apos;ve used your company-covered meal. Additional items can be added to your cart for personal checkout.
        </div>
      )}

      {/* ═══════ COMPANY-PAID WAVE FLOW ═══════ */}
      {isCompanyPaid && isLoggedIn && !checkingAuth && (
        <>
          {/* Order complete — show pick ticket */}
          {orderResult ? (
            <div style={{
              textAlign: 'center',
              padding: `${spacing.xl} ${spacing.md}`,
              backgroundColor: '#f0fdf4',
              border: '2px solid #86efac',
              borderRadius: radius.lg,
            }}>
              <div style={{ fontSize: 48, marginBottom: spacing.sm }}>&#10003;</div>
              <h2 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: '#166534', margin: `0 0 ${spacing.xs}` }}>
                Order Confirmed!
              </h2>
              <div style={{
                fontSize: typography.sizes['3xl'],
                fontWeight: typography.weights.bold,
                color: accent,
                padding: `${spacing.sm} ${spacing.md}`,
                backgroundColor: 'white',
                borderRadius: radius.md,
                border: `2px solid ${accent}`,
                display: 'inline-block',
                margin: `${spacing.md} 0`,
                letterSpacing: '0.05em',
              }}>
                {orderResult.order_number}
              </div>
              <p style={{ fontSize: typography.sizes.sm, color: '#4b5563', margin: `${spacing.sm} 0 0` }}>
                Show this number at the event to pick up your order.
              </p>
              {userReservation && (
                <p style={{ fontSize: typography.sizes.sm, color: '#6b7280', margin: `${spacing.xs} 0 0` }}>
                  Your time slot: Wave {userReservation.wave_number}
                  {selectedListing && <> &middot; {selectedListing.title} from {selectedListing.vendorName}</>}
                </p>
              )}
              <Link
                href={`/${vertical}/events/${token}/my-order`}
                style={{
                  display: 'inline-block',
                  marginTop: spacing.md,
                  padding: `${spacing['2xs']} ${spacing.md}`,
                  backgroundColor: accent,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.sm,
                }}
              >
                View Order &amp; QR Code
              </Link>
            </div>
          ) : (
            <>
              {/* Wave error */}
              {waveError && (
                <div style={{
                  padding: `${spacing['2xs']} ${spacing.sm}`,
                  marginBottom: spacing.sm,
                  borderRadius: radius.sm,
                  backgroundColor: '#fef2f2',
                  color: '#dc2626',
                  fontSize: typography.sizes.sm,
                }}>
                  {waveError}
                </div>
              )}

              {/* Step 1: Wave Selection */}
              {!userReservation ? (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: statusColors.neutral50,
                  border: `1px solid ${statusColors.neutral200}`,
                  borderRadius: radius.md,
                  marginBottom: spacing.md,
                }}>
                  <h2 style={{
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    color: statusColors.neutral700,
                    margin: `0 0 ${spacing.xs}`,
                  }}>
                    Step 1: Select your time slot
                  </h2>
                  <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.sm}` }}>
                    Choose when you&apos;d like to pick up your food. Each slot has limited capacity.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    {waves.map(wave => {
                      const isFull = wave.status === 'full' || wave.remaining <= 0
                      const isClosed = wave.status === 'closed'
                      const isLow = !isFull && !isClosed && wave.remaining <= Math.ceil(wave.capacity * 0.25)
                      return (
                        <button
                          key={wave.id}
                          onClick={() => !isFull && !isClosed && handleReserveWave(wave.id)}
                          disabled={isFull || isClosed || reservingWave}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: `${spacing.xs} ${spacing.sm}`,
                            borderRadius: radius.md,
                            border: `1.5px solid ${isFull || isClosed ? statusColors.neutral200 : isLow ? '#f59e0b' : accent}`,
                            backgroundColor: isFull || isClosed ? statusColors.neutral100 : 'white',
                            cursor: isFull || isClosed || reservingWave ? 'not-allowed' : 'pointer',
                            opacity: isFull || isClosed ? 0.6 : 1,
                            minHeight: 48,
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>
                              Wave {wave.wave_number}: {formatTime(wave.start_time)} &ndash; {formatTime(wave.end_time)}
                            </div>
                          </div>
                          <div style={{
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.medium,
                            color: isFull || isClosed ? statusColors.neutral400 : isLow ? '#d97706' : '#166534',
                            whiteSpace: 'nowrap',
                            marginLeft: spacing.sm,
                          }}>
                            {isClosed ? 'Closed' : isFull ? 'Full' : `${wave.remaining} spots left`}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {reservingWave && (
                    <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginTop: spacing.xs, textAlign: 'center' }}>
                      Reserving your spot...
                    </p>
                  )}
                </div>
              ) : (
                /* Wave reserved — show summary with change option */
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: radius.md,
                  marginBottom: spacing.md,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: typography.sizes.xs, color: '#166534', fontWeight: typography.weights.medium }}>
                      Your time slot
                    </div>
                    <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>
                      Wave {userReservation.wave_number}
                      {(() => {
                        const w = waves.find(wv => wv.id === userReservation.wave_id)
                        return w ? `: ${formatTime(w.start_time)} – ${formatTime(w.end_time)}` : ''
                      })()}
                    </div>
                  </div>
                  {userReservation.status === 'reserved' && (
                    <button
                      onClick={handleCancelReservation}
                      disabled={reservingWave}
                      style={{
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: radius.sm,
                        backgroundColor: 'white',
                        color: statusColors.neutral600,
                        fontSize: typography.sizes.xs,
                        cursor: reservingWave ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Change
                    </button>
                  )}
                </div>
              )}

              {/* Step 2: Food Selection (only after wave reserved) */}
              {userReservation && userReservation.status === 'reserved' && (
                <>
                  <div style={{
                    padding: spacing.sm,
                    backgroundColor: statusColors.neutral50,
                    border: `1px solid ${statusColors.neutral200}`,
                    borderRadius: radius.md,
                    marginBottom: spacing.md,
                  }}>
                    <h2 style={{
                      fontSize: typography.sizes.base,
                      fontWeight: typography.weights.semibold,
                      color: statusColors.neutral700,
                      margin: `0 0 ${spacing.xs}`,
                    }}>
                      Step 2: Choose your meal
                    </h2>
                    <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: 0 }}>
                      Select one item from any vendor below.
                    </p>
                  </div>

                  {vendors.map(vendor => (
                    <div key={vendor.id} style={{
                      marginBottom: spacing.md,
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
                        alignItems: 'flex-start',
                        gap: spacing.sm,
                      }}>
                        {vendor.profile_image_url && (
                          <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                            <Image src={vendor.profile_image_url} alt={vendor.business_name} width={48} height={48} style={{ objectFit: 'cover' }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: 0 }}>
                            {vendor.business_name}
                          </h3>
                          {vendor.description && (
                            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: `4px 0 0`, lineHeight: 1.45 }}>
                              {vendor.description.length > 200 ? vendor.description.slice(0, 200) + '...' : vendor.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Listings — radio-style selection (one item across all vendors) */}
                      <div style={{ padding: spacing.sm }}>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                          gap: spacing.md,
                        }}>
                          {vendor.listings.map(listing => {
                            const isSelected = selectedListingId === listing.id
                            return (
                              <button
                                key={listing.id}
                                onClick={() => {
                                  setSelectedListingId(listing.id)
                                  setSelectedVendorId(vendor.id)
                                }}
                                style={{
                                  border: `2px solid ${isSelected ? accent : statusColors.neutral200}`,
                                  borderRadius: radius.md,
                                  overflow: 'hidden',
                                  backgroundColor: isSelected ? `${accent}0D` : 'white',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  padding: 0,
                                  transition: 'border-color 0.15s',
                                }}
                              >
                                {listing.primary_image_url ? (
                                  <div style={{ width: '100%', height: 180, position: 'relative', backgroundColor: statusColors.neutral100 }}>
                                    <Image src={listing.primary_image_url} alt={listing.title} fill style={{ objectFit: 'cover' }} />
                                    {isSelected && (
                                      <div style={{
                                        position: 'absolute', top: 8, right: 8,
                                        width: 28, height: 28, borderRadius: '50%',
                                        backgroundColor: accent, color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 16, fontWeight: 'bold',
                                      }}>
                                        &#10003;
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ width: '100%', height: 160, backgroundColor: statusColors.neutral100, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                    <span style={{ fontSize: 48, opacity: 0.4 }}>&#127857;</span>
                                    {isSelected && (
                                      <div style={{
                                        position: 'absolute', top: 8, right: 8,
                                        width: 28, height: 28, borderRadius: '50%',
                                        backgroundColor: accent, color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 16, fontWeight: 'bold',
                                      }}>
                                        &#10003;
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div style={{ padding: spacing.sm }}>
                                  <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, lineHeight: 1.3 }}>
                                    {listing.title}
                                  </div>
                                  {listing.description && (
                                    <div style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, marginTop: 6, lineHeight: 1.45 }}>
                                      {listing.description.length > 200 ? listing.description.slice(0, 200) + '...' : listing.description}
                                    </div>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Confirm Order bar */}
                  {selectedListingId && (
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
                          {selectedListing?.title}
                        </span>
                        <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginLeft: spacing.xs }}>
                          from {selectedListing?.vendorName}
                        </span>
                      </div>
                      <button
                        onClick={handleConfirmOrder}
                        disabled={placingOrder}
                        style={{
                          padding: `${spacing['2xs']} ${spacing.md}`,
                          backgroundColor: placingOrder ? statusColors.neutral300 : accent,
                          color: 'white',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontWeight: typography.weights.semibold,
                          fontSize: typography.sizes.sm,
                          cursor: placingOrder ? 'not-allowed' : 'pointer',
                          minHeight: 44,
                        }}
                      >
                        {placingOrder ? 'Placing Order...' : 'Confirm Order'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════ STANDARD ATTENDEE-PAID FLOW (existing) ═══════ */}
      {/* Pickup time selector — all event types (FT + FM) */}
      {!isCompanyPaid && isLoggedIn && timeSlots.length > 0 && (
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
            {isFT ? 'What time do you want your food ready?' : 'When would you like to pick up your items?'}
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

      {/* Cart message (attendee-paid only) */}
      {!isCompanyPaid && cartMessage && (
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

      {/* Vendors + Listings (attendee-paid flow) */}
      {!isCompanyPaid && (vendors.length === 0 ? (
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
          const vendorSelectedItems = vendor.listings.filter(l => (quantities[l.id] || 0) > 0)
          const vendorSelectedTotal = vendorSelectedItems.reduce(
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
                alignItems: 'flex-start',
                gap: spacing.sm,
              }}>
                {vendor.profile_image_url && (
                  <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                    <Image src={vendor.profile_image_url} alt={vendor.business_name} width={48} height={48} style={{ objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: 0 }}>
                    {vendor.business_name}
                  </h2>
                  {vendor.description && (
                    <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: `4px 0 0`, lineHeight: 1.45 }}>
                      {vendor.description.length > 200 ? vendor.description.slice(0, 200) + '...' : vendor.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Listings grid */}
              <div style={{ padding: spacing.sm }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: spacing.md,
                }}>
                  {vendor.listings.map(listing => {
                    const qty = quantities[listing.id] || 0
                    const inCartQty = getCartQty(listing.id)
                    const maxQty = listing.quantity
                    const displayPrice = calculateItemDisplayPrice(listing.price_cents)

                    return (
                      <div key={listing.id} style={{
                        border: `1px solid ${qty > 0 ? accent : inCartQty > 0 ? '#86efac' : statusColors.neutral200}`,
                        borderRadius: radius.md,
                        overflow: 'hidden',
                        backgroundColor: qty > 0 ? `${accent}08` : inCartQty > 0 ? '#f0fdf408' : 'white',
                        transition: 'border-color 0.2s',
                      }}>
                        {/* Image */}
                        {listing.primary_image_url ? (
                          <div style={{ width: '100%', height: 180, position: 'relative', backgroundColor: statusColors.neutral100 }}>
                            <Image src={listing.primary_image_url} alt={listing.title} fill style={{ objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div style={{ width: '100%', height: 160, backgroundColor: statusColors.neutral100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 48, opacity: 0.4 }}>📦</span>
                          </div>
                        )}

                        {/* Info */}
                        <div style={{ padding: spacing.sm }}>
                          <h3 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: 0, lineHeight: 1.3 }}>
                            {listing.title}
                          </h3>
                          {listing.description && (
                            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: `6px 0 0`, lineHeight: 1.45 }}>
                              {listing.description.length > 200 ? listing.description.slice(0, 200) + '...' : listing.description}
                            </p>
                          )}

                          {/* Price + quantity (logged in only) */}
                          {isLoggedIn ? (
                            <div style={{ marginTop: spacing.xs }}>
                              <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: accent }}>
                                {formatPrice(displayPrice)}
                                {listing.unit_label && <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, fontWeight: typography.weights.normal }}> / {listing.unit_label}</span>}
                              </div>
                              {maxQty !== null && maxQty <= 10 && (
                                <div style={{ fontSize: 10, color: '#d97706', marginTop: 1 }}>
                                  {maxQty} left
                                </div>
                              )}
                              {/* In-cart indicator */}
                              {inCartQty > 0 && qty === 0 && (
                                <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#166534', marginTop: 6 }}>
                                  ✓ {inCartQty} in cart
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

                {/* Per-vendor Add to Cart */}
                {isLoggedIn && vendorSelectedItems.length > 0 && (
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
                      : `Add ${vendorSelectedItems.length} item${vendorSelectedItems.length > 1 ? 's' : ''} from ${vendor.business_name} — ${formatPrice(vendorSelectedTotal)}`
                    }
                  </button>
                )}
              </div>
            </div>
          )
        })
      ))}

      {/* Sticky cart bar — shows server-side cart state (attendee-paid only) */}
      {!isCompanyPaid && isLoggedIn && itemCount > 0 && (
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
              {itemCount} item{itemCount > 1 ? 's' : ''} in cart
            </span>
            <span style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, marginLeft: spacing.xs }}>
              {formatPrice(summary.total_cents)}
            </span>
            {pickupTime && (
              <span style={{ fontSize: typography.sizes.xs, color: accent, marginLeft: spacing.xs }}>
                Ready at {formatTime(pickupTime)}
              </span>
            )}
          </div>
          <Link
            href={`/${vertical}/checkout`}
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
            Checkout
          </Link>
        </div>
      )}
    </div>
  )
}
