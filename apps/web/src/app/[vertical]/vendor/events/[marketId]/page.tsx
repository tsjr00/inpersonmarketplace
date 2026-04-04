'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface EventDetails {
  market_id: string
  market_name: string
  event_date: string
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  headcount: number
  address: string
  city: string
  state: string
  zip: string
  company_name: string
  cuisine_preferences: string | null
  dietary_notes: string | null
  setup_instructions: string | null
  vendor_count: number
  response_status: string | null
  response_notes: string | null
  accepted_count: number
  event_type: string | null
  payment_model: string | null
  is_ticketed: boolean
  children_present: boolean
  is_themed: boolean
  theme_description: string | null
  has_competing_vendors: boolean
  event_max_orders_total: number | null
  event_max_orders_per_wave: number | null
  profile_max_headcount_per_wave: number | null
}

const verticalAccent: Record<string, string> = {
  food_trucks: '#ff5757',
  farmers_market: '#2d5016',
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  corporate_lunch: 'Corporate Event',
  team_building: 'Team Building',
  grand_opening: 'Grand Opening / Promotional',
  festival: 'Festival / Community Event',
  private_party: 'Private Party / Celebration',
  other: 'Special Event',
}

const PAYMENT_MODEL_LABELS: Record<string, string> = {
  company_paid: 'Organizer pays for attendees',
  attendee_paid: 'Attendees pay individually',
  hybrid: 'Organizer covers base, attendees can upgrade',
}

export default function VendorCateringDetailPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const marketId = params.marketId as string
  const accent = verticalAccent[vertical] || verticalAccent.farmers_market

  const [details, setDetails] = useState<EventDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [responding, setResponding] = useState(false)
  const [responseNotes, setResponseNotes] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [showMenuPicker, setShowMenuPicker] = useState(false)
  const [cateringListings, setCateringListings] = useState<Array<{ id: string; title: string; price_cents: number }>>([])
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set())
  const [loadingListings, setLoadingListings] = useState(false)

  // Event capacity state
  const [maxOrdersTotal, setMaxOrdersTotal] = useState<number | ''>('')
  const [maxOrdersPerWave, setMaxOrdersPerWave] = useState<number | ''>('')
  const [useProfileWaveCapacity, setUseProfileWaveCapacity] = useState(true)

  // Contact organizer state
  const [showMessageForm, setShowMessageForm] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageResult, setMessageResult] = useState<string | null>(null)

  // Cancel participation state
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    fetchDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId])

  async function fetchDetails() {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}`)
      if (res.ok) {
        const data = await res.json()
        setDetails(data.event)
      } else {
        const err = await res.json()
        setError(err.error || 'Failed to load event details')
      }
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  async function fetchCateringListings() {
    setLoadingListings(true)
    try {
      const supabase = createClient()
      // Get vendor's own profile
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!vendorProfile) return

      // Get published listings with event_menu_item flag
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, price_cents, listing_data')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'published')
        .eq('vertical_id', vertical)
        .is('deleted_at', null)
        .order('title')

      const catering = (listings || []).filter(l => {
        const data = l.listing_data as Record<string, unknown> | null
        return data?.event_menu_item === true
      })

      setCateringListings(catering.map(l => ({ id: l.id, title: l.title, price_cents: l.price_cents })))
    } catch { /* ignore */ }
    setLoadingListings(false)
  }

  function handleAcceptClick() {
    setShowMenuPicker(true)
    if (cateringListings.length === 0) fetchCateringListings()
  }

  function toggleListing(id: string) {
    setSelectedListingIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (vertical !== 'food_trucks' || next.size < 7) {
        next.add(id)
      }
      return next
    })
  }

  async function handleConfirmAccept() {
    if (selectedListingIds.size === 0) {
      setActionMessage('Error: Please select at least one item')
      return
    }
    if (!maxOrdersTotal || maxOrdersTotal < 1) {
      setActionMessage('Error: Please enter your maximum order capacity for this event')
      return
    }
    const isFT = vertical === 'food_trucks'
    if (isFT && (!maxOrdersPerWave || maxOrdersPerWave < 1)) {
      setActionMessage('Error: Please confirm your per-wave customer capacity')
      return
    }
    setResponding(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_status: 'accepted',
          response_notes: responseNotes.trim() || null,
          listing_ids: Array.from(selectedListingIds),
          event_max_orders_total: maxOrdersTotal,
          event_max_orders_per_wave: isFT ? maxOrdersPerWave : undefined,
        }),
      })
      if (res.ok) {
        setActionMessage(vertical === 'farmers_market' ? 'You accepted this event and your items have been submitted!' : 'You accepted this event and your menu has been submitted!')
        setDetails((prev) => prev ? { ...prev, response_status: 'accepted' } : prev)
        setShowMenuPicker(false)
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setResponding(false)
  }

  async function handleRespond(status: 'accepted' | 'declined') {
    if (status === 'accepted') {
      handleAcceptClick()
      return
    }
    setResponding(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_status: status,
          response_notes: responseNotes.trim() || null,
        }),
      })
      if (res.ok) {
        setActionMessage('You declined this invitation.')
        setDetails((prev) => prev ? { ...prev, response_status: status } : prev)
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setResponding(false)
  }

  async function handleSendMessage() {
    if (messageText.trim().length < 10) {
      setMessageResult('Error: Message must be at least 10 characters')
      return
    }
    setSendingMessage(true)
    setMessageResult(null)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText.trim() }),
      })
      if (res.ok) {
        setMessageResult('Message sent to the event organizer!')
        setMessageText('')
        setShowMessageForm(false)
      } else {
        const err = await res.json()
        setMessageResult(`Error: ${err.error || 'Failed to send message'}`)
      }
    } catch {
      setMessageResult('Error: Network error')
    }
    setSendingMessage(false)
  }

  async function handleCancelParticipation(reason?: string) {
    if (!reason || reason.trim().length < 10) return
    setCancelling(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (res.ok) {
        setActionMessage('Your participation has been cancelled. The organizer has been notified.')
        setDetails((prev) => prev ? { ...prev, response_status: 'cancelled' } : prev)
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error || 'Failed to cancel'}`)
      }
    } catch {
      setActionMessage('Error: Network error')
    }
    setCancelling(false)
    setShowCancelDialog(false)
  }

  // Check if event is within 72 hours (late cancellation warning)
  const isLateCancellation = details?.event_date
    ? (() => {
        const eventDate = new Date(details.event_date + 'T00:00:00')
        const now = new Date()
        const hoursUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
        return hoursUntil < 72
      })()
    : false

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
        <p style={{ color: statusColors.neutral500 }}>Loading event details...</p>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
        <p style={{ color: statusColors.danger }}>{error || 'Event not found'}</p>
        <Link href={`/${vertical}/dashboard`} style={{ color: accent, fontSize: typography.sizes.sm }}>
          ← Back to Dashboard
        </Link>
      </div>
    )
  }

  const headcountPerVendor =
    details.accepted_count > 0
      ? Math.ceil(details.headcount / details.accepted_count)
      : Math.ceil(details.headcount / details.vendor_count)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
      <Link
        href={`/${vertical}/dashboard`}
        style={{
          color: statusColors.neutral500,
          textDecoration: 'none',
          fontSize: typography.sizes.sm,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: spacing.md,
        }}
      >
        ← Back to Dashboard
      </Link>

      {/* Header */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing['2xs'] }}>
          <span style={{ ...sizing.badge, backgroundColor: statusColors.infoLight, color: statusColors.infoDark }}>
            {term(vertical, 'event_feature_name')}
          </span>
          {details.response_status && (
            <span
              style={{
                ...sizing.badge,
                backgroundColor:
                  details.response_status === 'accepted'
                    ? statusColors.successLight
                    : details.response_status === 'declined'
                      ? statusColors.dangerLight
                      : statusColors.warningLight,
                color:
                  details.response_status === 'accepted'
                    ? statusColors.successDark
                    : details.response_status === 'declined'
                      ? statusColors.dangerDark
                      : statusColors.warningDark,
                textTransform: 'capitalize',
              }}
            >
              {details.response_status}
            </span>
          )}
        </div>
        <h1
          style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: statusColors.neutral900,
            margin: `0 0 ${spacing['2xs']}`,
          }}
        >
          Private Event Invitation
        </h1>
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, margin: 0 }}>
          {details.event_type ? EVENT_TYPE_LABELS[details.event_type] || details.event_type : 'Private Event'} · {details.city}, {details.state}
        </p>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            marginBottom: spacing.md,
            borderRadius: radius.md,
            backgroundColor: actionMessage.startsWith('Error')
              ? statusColors.dangerLight
              : statusColors.successLight,
            color: actionMessage.startsWith('Error')
              ? statusColors.danger
              : statusColors.successDark,
            fontSize: typography.sizes.sm,
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* Event Details — consolidated single card */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: statusColors.neutral50,
        border: `1px solid ${statusColors.neutral200}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h3 style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral700, margin: `0 0 ${spacing.xs}` }}>
          Event Details
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <DetailRow label="Date" value={`${fmtDate(details.event_date)}${details.event_end_date && details.event_end_date !== details.event_date ? ` — ${fmtDate(details.event_end_date)}` : ''}`} />
          {(details.event_start_time || details.event_end_time) && (
            <DetailRow label="Time" value={`${fmtTime12(details.event_start_time)} — ${fmtTime12(details.event_end_time)}`} />
          )}
          <DetailRow label="Location" value={details.address ? `${details.address}, ${details.city}, ${details.state}` : `${details.city}, ${details.state}${details.response_status !== 'accepted' ? ' (full address after acceptance)' : ''}`} />
          <DetailRow label="Your est. headcount" value={`~${headcountPerVendor} people`} sub={`${details.headcount} total ÷ ${details.accepted_count || details.vendor_count} ${term(vertical, 'event_vendor_unit')}s`} />
          {details.payment_model && (
            <DetailRow label="Payment" value={PAYMENT_MODEL_LABELS[details.payment_model] || details.payment_model} />
          )}
          <DetailRow label="Vendors confirmed" value={`${details.accepted_count} of ${details.vendor_count}`} />
          {details.is_ticketed && <DetailRow label="Ticketed" value="Yes — attendees have committed to attending" />}
          {details.children_present && <DetailRow label="Children" value="Yes — consider family-friendly offerings" />}
          {details.is_themed && <DetailRow label="Theme" value={details.theme_description || 'Yes'} />}
          {details.has_competing_vendors ? (
            <p style={{ fontSize: typography.sizes.xs, color: '#d97706', margin: `${spacing['2xs']} 0 0` }}>
              ⚠ Other vendors/shopping options at venue — attendee spending may be split
            </p>
          ) : (
            <p style={{ fontSize: typography.sizes.xs, color: '#059669', margin: `${spacing['2xs']} 0 0` }}>
              ✓ No competing vendors — you&apos;ll have a captive audience
            </p>
          )}
        </div>
      </div>

      {/* Revenue Estimate — show the math */}
      {details.headcount > 0 && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: radius.md,
          marginBottom: spacing.md,
        }}>
          <h3 style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#166534', margin: `0 0 ${spacing.xs}` }}>
            Revenue Estimate
          </h3>
          {vertical === 'farmers_market' ? (
            <div style={{ fontSize: typography.sizes.sm, color: '#15803d', lineHeight: 1.8 }}>
              <div><strong>Your estimated shoppers:</strong> {details.headcount} total guests ÷ {details.accepted_count || details.vendor_count} vendors = <strong>~{headcountPerVendor} shoppers</strong></div>
              <div><strong>Conservative estimate:</strong> {headcountPerVendor} shoppers × $8 avg spend = <strong>${(headcountPerVendor * 8).toLocaleString()}</strong></div>
              <div><strong>Optimistic estimate:</strong> {headcountPerVendor} shoppers × $20 avg spend = <strong>${(headcountPerVendor * 20).toLocaleString()}</strong></div>
              <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: '#166534' }}>
                Platform fee: 6.5% | Your payout: 93.5% of sales
              </div>
              <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: '#4b5563' }}>
                Pre-orders let customers reserve items before the event — guaranteed sales before you arrive.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: typography.sizes.sm, color: '#15803d', lineHeight: 1.8 }}>
              <div><strong>Your estimated servings:</strong> {details.headcount} total guests ÷ {details.accepted_count || details.vendor_count} trucks = <strong>~{headcountPerVendor} servings</strong></div>
              <div><strong>Conservative estimate:</strong> {headcountPerVendor} servings × $10/plate = <strong>${(headcountPerVendor * 10).toLocaleString()}</strong></div>
              <div><strong>Optimistic estimate:</strong> {headcountPerVendor} servings × $15/plate = <strong>${(headcountPerVendor * 15).toLocaleString()}</strong></div>
              <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: '#166534' }}>
                Platform fee: 6.5% | Your payout: 93.5% of sales
              </div>
              <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: '#4b5563' }}>
                Pre-orders help you prep exactly what you need — less waste, more profit.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preferences */}
      {(details.cuisine_preferences || details.dietary_notes) && (
        <div
          style={{
            padding: spacing.sm,
            backgroundColor: statusColors.neutral50,
            border: `1px solid ${statusColors.neutral200}`,
            borderRadius: radius.md,
            marginBottom: spacing.md,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: statusColors.neutral700,
              margin: `0 0 ${spacing['2xs']}`,
            }}
          >
            {vertical === 'farmers_market' ? 'Organizer Preferences' : 'Client Preferences'}
          </h3>
          {details.cuisine_preferences && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: `0 0 ${spacing['3xs']}`, lineHeight: 1.5 }}>
              <strong>{vertical === 'farmers_market' ? 'Product Types:' : 'Cuisine:'}</strong> {details.cuisine_preferences}
            </p>
          )}
          {details.dietary_notes && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: 0, lineHeight: 1.5 }}>
              <strong>Dietary:</strong> {details.dietary_notes}
            </p>
          )}
        </div>
      )}

      {/* Setup instructions */}
      {details.setup_instructions && (
        <div
          style={{
            padding: spacing.sm,
            backgroundColor: statusColors.warningLight,
            border: `1px solid ${statusColors.warningBorder}`,
            borderRadius: radius.md,
            marginBottom: spacing.md,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: statusColors.warningDark,
              margin: `0 0 ${spacing['2xs']}`,
            }}
          >
            Setup Instructions
          </h3>
          <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, margin: 0, lineHeight: 1.5 }}>
            {details.setup_instructions}
          </p>
        </div>
      )}

      {/* Response section */}
      {details.response_status === 'invited' && (
        <div
          style={{
            padding: spacing.md,
            border: `2px solid ${accent}`,
            borderRadius: radius.lg,
            marginBottom: spacing.md,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: statusColors.neutral800,
              margin: `0 0 ${spacing.xs}`,
            }}
          >
            Respond to This Invitation
          </h3>
          <div style={{ marginBottom: spacing.sm }}>
            <label
              style={{
                display: 'block',
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                color: statusColors.neutral600,
                marginBottom: spacing['3xs'],
              }}
            >
              Notes (optional)
            </label>
            <textarea
              placeholder="Any questions or comments for the organizer..."
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              style={{
                width: '100%',
                padding: sizing.control.padding,
                border: `1px solid ${statusColors.neutral300}`,
                borderRadius: radius.md,
                fontSize: sizing.control.fontSize,
                minHeight: '60px',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          {!showMenuPicker ? (
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <button
                onClick={() => handleRespond('accepted')}
                disabled={responding}
                style={{
                  flex: 1,
                  ...sizing.cta,
                  fontWeight: typography.weights.semibold,
                  backgroundColor: responding ? '#ccc' : statusColors.success,
                  color: 'white',
                  border: 'none',
                  cursor: responding ? 'not-allowed' : 'pointer',
                }}
              >
                Accept
              </button>
              <button
                onClick={() => handleRespond('declined')}
                disabled={responding}
                style={{
                  flex: 1,
                  ...sizing.cta,
                  fontWeight: typography.weights.semibold,
                  backgroundColor: 'white',
                  color: statusColors.danger,
                  border: `2px solid ${statusColors.danger}`,
                  cursor: responding ? 'not-allowed' : 'pointer',
                }}
              >
                Decline
              </button>
            </div>
          ) : (
            <div>
              <h4 style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: `0 0 ${spacing['2xs']}` }}>
                {vertical === 'food_trucks' ? 'Select your menu for this event (4-7 items)' : 'Select items for this event'}
              </h4>
              <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.sm}` }}>
                Only items marked &quot;Available for Events&quot; in your listings are shown.
                {cateringListings.length === 0 && !loadingListings && ' No event-eligible items found — mark items as "Available for Events" in your listings first.'}
              </p>
              {loadingListings ? (
                <p style={{ color: statusColors.neutral500, fontSize: typography.sizes.sm }}>Loading your items...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'], marginBottom: spacing.sm }}>
                  {cateringListings.map(listing => {
                    const selected = selectedListingIds.has(listing.id)
                    const maxItems = vertical === 'food_trucks' ? 7 : Infinity
                    const atLimit = selectedListingIds.size >= maxItems && !selected
                    return (
                      <button
                        key={listing.id}
                        onClick={() => toggleListing(listing.id)}
                        disabled={atLimit}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          backgroundColor: selected ? statusColors.successLight : 'white',
                          border: `1.5px solid ${selected ? statusColors.success : statusColors.neutral200}`,
                          borderRadius: radius.md,
                          cursor: atLimit ? 'not-allowed' : 'pointer',
                          opacity: atLimit ? 0.5 : 1,
                          textAlign: 'left',
                          fontSize: typography.sizes.sm,
                        }}
                      >
                        <span style={{ fontWeight: selected ? typography.weights.semibold : typography.weights.normal, color: statusColors.neutral800 }}>
                          {selected ? '✓ ' : ''}{listing.title}
                        </span>
                        <span style={{ color: statusColors.neutral500, fontSize: typography.sizes.xs }}>
                          ${(listing.price_cents / 100).toFixed(2)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.sm}` }}>
                {selectedListingIds.size} selected{vertical === 'food_trucks' ? ' (4-7 required)' : ''}
              </p>

              {/* Event Capacity Section */}
              <div style={{
                padding: spacing.sm,
                backgroundColor: '#eff6ff',
                border: '1px solid #93c5fd',
                borderRadius: radius.md,
                marginBottom: spacing.sm,
              }}>
                <h4 style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#1e40af', margin: `0 0 ${spacing['2xs']}` }}>
                  Your Event Capacity
                </h4>
                <p style={{ fontSize: typography.sizes.xs, color: '#3b82f6', margin: `0 0 ${spacing.xs}`, lineHeight: 1.5 }}>
                  {vertical === 'food_trucks'
                    ? 'Set the maximum number of customers you can serve at this event. Once your capacity is reached, your items will stop accepting pre-orders. This protects you from being overwhelmed on event day.'
                    : 'Set the maximum number of orders you can prepare for this event. Once your capacity is reached, your items will stop accepting pre-orders. This ensures every order gets fulfilled.'
                  }
                </p>

                {vertical === 'food_trucks' ? (
                  <>
                    {/* FT: Wave-aware capacity */}
                    {(() => {
                      const startTime = details.event_start_time
                      const endTime = details.event_end_time
                      let waveCount = 4 // default
                      if (startTime && endTime) {
                        const [sH, sM] = startTime.split(':').map(Number)
                        const [eH, eM] = endTime.split(':').map(Number)
                        const durationMin = (eH * 60 + eM) - (sH * 60 + sM)
                        waveCount = durationMin > 0 ? Math.ceil(durationMin / 30) : 4
                      }
                      const profilePerWave = details.profile_max_headcount_per_wave

                      if (!profilePerWave) {
                        return (
                          <div style={{ padding: spacing.xs, backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: radius.sm }}>
                            <p style={{ fontSize: typography.sizes.sm, color: '#dc2626', margin: 0, lineHeight: 1.5 }}>
                              Your profile is missing capacity data. Please update your event readiness questionnaire before accepting this event.
                            </p>
                            <Link
                              href={`/${vertical}/vendor/dashboard`}
                              style={{ display: 'inline-block', marginTop: spacing.xs, fontSize: typography.sizes.sm, color: accent, fontWeight: typography.weights.semibold }}
                            >
                              Go to Dashboard →
                            </Link>
                          </div>
                        )
                      }

                      const calculatedTotal = (maxOrdersPerWave || profilePerWave) * waveCount

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                          <p style={{ fontSize: typography.sizes.xs, color: '#374151', margin: 0, lineHeight: 1.5 }}>
                            This event has <strong>{waveCount} waves</strong> (30-minute service windows).
                            Each wave is a time slot that customers select when ordering.
                            When a wave fills up, that time slot closes but others stay open.
                          </p>
                          <div>
                            <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#374151', marginBottom: 4 }}>
                              Customers you can serve per wave (30-min window)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: typography.sizes.xs, color: '#374151', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  checked={useProfileWaveCapacity}
                                  onChange={() => { setUseProfileWaveCapacity(true); setMaxOrdersPerWave(profilePerWave) }}
                                />
                                Use my profile default ({profilePerWave})
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: typography.sizes.xs, color: '#374151', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  checked={!useProfileWaveCapacity}
                                  onChange={() => setUseProfileWaveCapacity(false)}
                                />
                                Custom for this event:
                              </label>
                              {!useProfileWaveCapacity && (
                                <input
                                  type="number"
                                  min={1}
                                  max={500}
                                  value={maxOrdersPerWave}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value) || ''
                                    setMaxOrdersPerWave(v as number)
                                    if (typeof v === 'number') setMaxOrdersTotal(v * waveCount)
                                  }}
                                  style={{
                                    width: 70,
                                    padding: '4px 8px',
                                    border: `1px solid ${statusColors.neutral300}`,
                                    borderRadius: radius.sm,
                                    fontSize: typography.sizes.sm,
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#374151', marginBottom: 4 }}>
                              Total event capacity ({waveCount} waves &times; {maxOrdersPerWave || profilePerWave} per wave = {calculatedTotal})
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={5000}
                              value={maxOrdersTotal === '' ? calculatedTotal : maxOrdersTotal}
                              onChange={(e) => setMaxOrdersTotal(parseInt(e.target.value) || '')}
                              onFocus={() => { if (maxOrdersTotal === '') setMaxOrdersTotal(calculatedTotal) }}
                              style={{
                                width: 100,
                                padding: '6px 8px',
                                border: `1px solid ${statusColors.neutral300}`,
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.sm,
                              }}
                            />
                            <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.4 }}>
                              You can lower this if needed. Once this total is reached across all time slots, your items are removed from the event page.
                            </p>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                ) : (
                  /* FM: Simple total */
                  <div>
                    <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#374151', marginBottom: 4 }}>
                      Maximum orders you can fulfill for this event *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      placeholder="e.g. 50"
                      value={maxOrdersTotal}
                      onChange={(e) => setMaxOrdersTotal(parseInt(e.target.value) || '')}
                      style={{
                        width: 120,
                        padding: '6px 8px',
                        border: `1px solid ${statusColors.neutral300}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.sm,
                      }}
                    />
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0', lineHeight: 1.4 }}>
                      This is the total number of orders you can prepare and bring. Once reached, your items stop accepting pre-orders. Be realistic — every order you accept is a commitment to a customer.
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: spacing.sm }}>
                <button
                  onClick={handleConfirmAccept}
                  disabled={responding || selectedListingIds.size === 0 || (vertical === 'food_trucks' && !details.profile_max_headcount_per_wave)}
                  style={{
                    flex: 1,
                    ...sizing.cta,
                    fontWeight: typography.weights.semibold,
                    backgroundColor: responding || selectedListingIds.size === 0 || (vertical === 'food_trucks' && !details.profile_max_headcount_per_wave) ? '#ccc' : statusColors.success,
                    color: 'white',
                    border: 'none',
                    cursor: responding || selectedListingIds.size === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {responding ? 'Submitting...' : `Accept with ${selectedListingIds.size} item${selectedListingIds.size !== 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => { setShowMenuPicker(false); setSelectedListingIds(new Set()) }}
                  style={{
                    ...sizing.cta,
                    fontWeight: typography.weights.semibold,
                    backgroundColor: 'white',
                    color: statusColors.neutral500,
                    border: `1px solid ${statusColors.neutral300}`,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* If accepted, show next steps */}
      {details.response_status === 'accepted' && (
        <div
          style={{
            padding: spacing.md,
            backgroundColor: statusColors.successLight,
            border: `1px solid ${statusColors.successBorder}`,
            borderRadius: radius.lg,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: statusColors.successDark,
              margin: `0 0 ${spacing.xs}`,
            }}
          >
            Next Steps
          </h3>
          <ol
            style={{
              margin: 0,
              paddingLeft: spacing.md,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing['2xs'],
            }}
          >
            <li style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
              {vertical === 'farmers_market'
                ? 'Your selected items are now visible to event attendees'
                : <>Add your event menu items to the{' '}<Link href={`/${vertical}/markets/${marketId}`} style={{ color: accent, fontWeight: typography.weights.semibold }}>event market page</Link></>
              }
            </li>
            <li style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
              {vertical === 'farmers_market'
                ? 'Keep your selection focused — highlight your best products for this audience'
                : 'Keep your menu focused — just what you want to sell at this event'
              }
            </li>
            <li style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
              {vertical === 'farmers_market'
                ? 'Pre-orders let customers reserve items ahead — guaranteed sales before you arrive'
                : "Pre-orders will arrive before the event so you can prep exactly what's needed"
              }
            </li>
          </ol>
        </div>
      )}

      {/* Contact Organizer — available for accepted vendors */}
      {details.response_status === 'accepted' && (
        <div style={{ marginTop: spacing.md }}>
          {messageResult && (
            <div
              style={{
                padding: `${spacing['2xs']} ${spacing.xs}`,
                marginBottom: spacing.sm,
                borderRadius: radius.md,
                backgroundColor: messageResult.startsWith('Error') ? statusColors.dangerLight : statusColors.successLight,
                color: messageResult.startsWith('Error') ? statusColors.danger : statusColors.successDark,
                fontSize: typography.sizes.sm,
              }}
            >
              {messageResult}
            </div>
          )}

          {!showMessageForm ? (
            <button
              onClick={() => { setShowMessageForm(true); setMessageResult(null) }}
              style={{
                ...sizing.cta,
                width: '100%',
                fontWeight: typography.weights.semibold,
                backgroundColor: 'white',
                color: accent,
                border: `2px solid ${accent}`,
                cursor: 'pointer',
              }}
            >
              Contact Event Organizer
            </button>
          ) : (
            <div style={{
              padding: spacing.sm,
              border: `1px solid ${statusColors.neutral200}`,
              borderRadius: radius.md,
              backgroundColor: 'white',
            }}>
              <h4 style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: statusColors.neutral800,
                margin: `0 0 ${spacing['2xs']}`,
              }}>
                Send a Message to the Organizer
              </h4>
              <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.sm}` }}>
                Your message is sent via the platform — the organizer&apos;s contact info stays private unless they shared it with you.
              </p>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Questions about setup, logistics, timing..."
                maxLength={1000}
                style={{
                  width: '100%',
                  padding: sizing.control.padding,
                  border: `1px solid ${statusColors.neutral300}`,
                  borderRadius: radius.md,
                  fontSize: sizing.control.fontSize,
                  minHeight: '80px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  outline: 'none',
                  marginBottom: spacing['2xs'],
                }}
              />
              <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400, margin: `0 0 ${spacing.sm}` }}>
                {messageText.length}/1000 characters {messageText.length > 0 && messageText.length < 10 && '(min 10)'}
              </p>
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMessage || messageText.trim().length < 10}
                  style={{
                    flex: 1,
                    ...sizing.cta,
                    fontWeight: typography.weights.semibold,
                    backgroundColor: sendingMessage || messageText.trim().length < 10 ? '#ccc' : accent,
                    color: 'white',
                    border: 'none',
                    cursor: sendingMessage || messageText.trim().length < 10 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sendingMessage ? 'Sending...' : 'Send Message'}
                </button>
                <button
                  onClick={() => { setShowMessageForm(false); setMessageText('') }}
                  style={{
                    ...sizing.cta,
                    fontWeight: typography.weights.semibold,
                    backgroundColor: 'white',
                    color: statusColors.neutral500,
                    border: `1px solid ${statusColors.neutral300}`,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancel Participation — available for accepted vendors, styled as destructive */}
      {details.response_status === 'accepted' && (
        <div style={{ marginTop: spacing.lg, paddingTop: spacing.md, borderTop: `1px solid ${statusColors.neutral200}` }}>
          <button
            onClick={() => setShowCancelDialog(true)}
            disabled={cancelling}
            style={{
              ...sizing.cta,
              width: '100%',
              fontWeight: typography.weights.semibold,
              backgroundColor: 'white',
              color: statusColors.danger,
              border: `1px solid ${statusColors.neutral300}`,
              cursor: cancelling ? 'not-allowed' : 'pointer',
              fontSize: typography.sizes.sm,
            }}
          >
            {cancelling ? 'Cancelling...' : 'Cancel My Participation'}
          </button>
          {isLateCancellation && (
            <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.danger, textAlign: 'center' }}>
              This event is less than 72 hours away. Late cancellations may affect your vendor score.
            </p>
          )}
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelDialog}
        title="Cancel Event Participation"
        message={
          isLateCancellation
            ? 'This event is less than 72 hours away. Late cancellations are flagged and may affect your vendor score. Are you sure you want to cancel?'
            : 'Are you sure you want to cancel your participation? The event organizer will be notified and a backup vendor may be contacted.'
        }
        confirmLabel={cancelling ? 'Cancelling...' : 'Yes, Cancel'}
        cancelLabel="Keep My Spot"
        variant="danger"
        showInput
        inputLabel="Reason for cancellation"
        inputPlaceholder="Please explain why you need to cancel (min 10 characters)..."
        inputRequired
        onConfirm={handleCancelParticipation}
        onCancel={() => setShowCancelDialog(false)}
      />
    </div>
  )
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      style={{
        padding: spacing.sm,
        backgroundColor: 'white',
        border: `1px solid ${statusColors.neutral200}`,
        borderRadius: radius.md,
      }}
    >
      <p
        style={{
          margin: `0 0 ${spacing['3xs']}`,
          fontSize: typography.sizes.xs,
          color: statusColors.neutral500,
          fontWeight: typography.weights.semibold,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: statusColors.neutral800,
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            margin: `${spacing['3xs']} 0 0`,
            fontSize: typography.sizes.xs,
            color: statusColors.neutral400,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function fmtTime12(time: string | null): string {
  if (!time) return '?'
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function DetailRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.xs }}>
      <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, flexShrink: 0 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: typography.sizes.sm, color: statusColors.neutral800, fontWeight: typography.weights.medium }}>{value}</span>
        {sub && <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400, marginLeft: spacing['2xs'] }}>({sub})</span>}
      </div>
    </div>
  )
}
