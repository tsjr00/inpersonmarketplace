'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
// The canonical wave-count calculation. A local copy of this lived here until
// 2026-08-11 — added the day before while fixing T-03, which was itself caused
// by the wave count having two sources. The exported original was two
// directories away the whole time. One definition, one place.
import { calculateWaveCount } from '@/lib/events/viability'
import { estimateOrders, expectedPeakOrdersPerWave } from '@/lib/events/demand-model'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import MarketAgreementBlock from '@/components/market-manager/MarketAgreementBlock'

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
  background_check_required: boolean | null
  background_check_details: string | null
  is_themed: boolean
  theme_description: string | null
  has_competing_vendors: boolean
  event_max_orders_total: number | null
  event_max_orders_per_wave: number | null
  profile_max_headcount_per_wave: number | null
  // Event Vendor Fee (V1 2026-08-14) — disclosed pre-acceptance (decision 2)
  vendor_fee_cents: number | null
  vendor_fee_pays_cents: number | null
  // 'covered' (Phase 3, 2026-08-16): promoted backup whose spot the
  // defector's forfeited fee pays for — settled, never a bill.
  vendor_fee_status: 'paid' | 'covered' | 'unpaid' | null
  organizer_selected_at: string | null
  is_backup: boolean
  standby_opted_in: boolean
  // R3-4 (2026-08-27): what else the vendor has on the event's dates. Present
  // while the invitation is open; null when there is nothing to check.
  availability?: AvailabilityView | null
}

interface AvailabilityConflict {
  kind: 'schedule' | 'park_booking' | 'booth_rental' | 'event' | 'private_pickup'
  marketId: string
  marketName: string
  date: string
  startTime: string | null
  endTime: string | null
  openOrderCount: number
  marketBoxPickupCount: number
  paid: boolean
}

interface AvailabilityView {
  multiCapable: boolean
  conflicts: AvailabilityConflict[]
  blockedByOrders: boolean
  blockedByEvent: boolean
  needsSkipAcknowledgment: boolean
  needsMultiConfirmation: boolean
}

const CONFLICT_KIND_LABEL: Record<AvailabilityConflict['kind'], string> = {
  schedule: 'your weekly schedule',
  park_booking: 'a paid spot',
  booth_rental: 'a paid booth',
  event: 'another event you accepted',
  private_pickup: 'your pickup location',
}

function fmtConflictDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtConflictHours(c: AvailabilityConflict): string {
  if (!c.startTime || !c.endTime) return 'all day'
  const f = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ampm = h! >= 12 ? 'PM' : 'AM'
    const hh = h! % 12 === 0 ? 12 : h! % 12
    return m ? `${hh}:${String(m).padStart(2, '0')} ${ampm}` : `${hh} ${ampm}`
  }
  return `${f(c.startTime)}–${f(c.endTime)}`
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
  const [cateringListings, setCateringListings] = useState<Array<{ id: string; title: string; price_cents: number }>>([])
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set())
  const [loadingListings, setLoadingListings] = useState(false)

  // Event Vendor Fee pay step (V1 2026-08-14)
  const [payingFee, setPayingFee] = useState(false)

  // Backup bench (mig 232): standby is an opt-in with no obligation — the
  // commitment is to being ASKED, never to going.
  const [standbyBusy, setStandbyBusy] = useState(false)
  async function toggleStandby(join: boolean) {
    if (standbyBusy) return
    setStandbyBusy(true)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}/standby`, {
        method: join ? 'POST' : 'DELETE',
      })
      if (res.ok) {
        setDetails(prev => (prev ? { ...prev, standby_opted_in: join } : prev))
      } else {
        const data = await res.json().catch(() => ({}))
        setActionMessage(`Error: ${data.error || 'Could not update standby.'}`)
      }
    } catch {
      setActionMessage('Error: Network error — please try again.')
    }
    setStandbyBusy(false)
  }

  async function payVendorFee() {
    if (payingFee) return
    setPayingFee(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}/pay`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setActionMessage(`Error: ${data.error || 'Could not start the fee payment.'}`)
    } catch {
      setActionMessage('Error: network problem — please try again.')
    }
    setPayingFee(false)
  }

  // Event capacity state
  const [maxOrdersTotal, setMaxOrdersTotal] = useState<number | ''>('')
  const [maxOrdersPerWave, setMaxOrdersPerWave] = useState<number | ''>('')
  const [useProfileWaveCapacity, setUseProfileWaveCapacity] = useState(true)

  // Event agreement acceptance. MarketAgreementBlock fires onChange(true)
  // automatically when the organizer selected no statements, so this defaults
  // open for events with no agreement and gates only when there is one.
  const [agreementAccepted, setAgreementAccepted] = useState(false)

  // R3-4: the vendor's answer to "you have something else that day" —
  // flagged (multi-truck / multi-location): "I'll cover both"; not flagged:
  // "I understand I won't sell there that day and pre-orders will be paused".
  // Open orders at the other place, or another accepted event, cannot be
  // acknowledged away — the button stays disabled and the box says why.
  const [conflictAck, setConflictAck] = useState(false)

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

        // T-03: seed the capacity fields from the vendor's profile default.
        //
        // The "Use my profile default" radio is PRE-CHECKED on load, and a
        // pre-checked radio never fires onChange — so the only line that sets
        // this value (that radio's handler) never ran. The vendor was shown
        // "20 per wave / 8 waves x 20 = 160" because the render falls back to
        // the profile value for DISPLAY, while the form state still held ''.
        // Accepting was then refused with "please confirm your per-wave
        // capacity" — pointing at a field the screen already showed as filled
        // in. The only way through was to click "Custom for this event" and
        // retype the same number. Found by owner testing 2026-08-10.
        //
        // T-04 (acceptance not persisting) was the same bug: the accept never
        // succeeded, so there was nothing to persist.
        //
        // Seeded here rather than in an effect body — this is an async
        // callback, so it does not trip react-hooks/set-state-in-effect.
        const perWave = data.event?.profile_max_headcount_per_wave
        if (perWave) {
          setMaxOrdersPerWave(perWave)
          // @paired-rule capacity-seeding — see lib/paired-rules.ts.
          setMaxOrdersTotal(
            perWave * calculateWaveCount(data.event.event_start_time, data.event.event_end_time)
          )
        }

        // The menu picker is on screen from the start now (T-10), so its
        // options load with the page instead of on a click that no longer
        // exists. Skipped once the vendor has responded — the form is gone by
        // then and the query would be wasted.
        if (data.event?.response_status !== 'accepted' && data.event?.response_status !== 'declined') {
          void fetchCateringListings()
        }
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
    if (!agreementAccepted) {
      setActionMessage('Error: Please accept the event agreement to participate')
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
          agreement_accepted: agreementAccepted,
          // R3-4: one checkbox, read by the route according to the vendor's flag
          skip_conflicts_acknowledged: conflictAck,
          multi_truck_confirmed: conflictAck,
        }),
      })
      if (res.ok) {
        setActionMessage(vertical === 'farmers_market' ? 'You accepted this event and your items have been submitted!' : 'You accepted this event and your menu has been submitted!')
        setDetails((prev) => prev ? { ...prev, response_status: 'accepted' } : prev)
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setResponding(false)
  }

  // Declining is the only single-click response. Accepting goes through
  // handleConfirmAccept, which carries the menu, the capacity and the
  // agreement — the form is always on screen now, so there is nothing to
  // reveal first. Narrowed to 'declined' so the compiler keeps it that way.
  async function handleRespond(status: 'declined') {
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

  /**
   * T-65 — how many people this vendor should plan for.
   *
   * This used to divide by `accepted_count` alone. That count is a straight
   * tally of vendors who have ALREADY accepted, from api/vendor/events/[marketId]
   * — it does NOT include the vendor reading this page. So the second truck
   * invited to a 4-truck event saw "100 total ÷ 1" and was told to expect ~100
   * shoppers, when the organizer had asked for four. A vendor buys food off
   * this number; overstating it costs them real money in waste.
   *
   * Neither denominator is right on its own, so we stop pretending it is one
   * number (owner-approved 2026-08-13):
   *   · FEWEST trucks  = those committed so far, counting YOU  → the high end
   *   · MOST trucks    = what the organizer asked for          → the low end
   * `expected` can never be below `committed` — more may accept than requested
   * (backups), and a range whose "most" is smaller than its "fewest" is
   * nonsense. When the two ends agree, we show a single number.
   */
  const viewerHasAccepted = details.response_status === 'accepted'
  const committedVendors = Math.max(1, details.accepted_count + (viewerHasAccepted ? 0 : 1))
  const expectedVendors = Math.max(committedVendors, details.vendor_count || committedVendors)
  const headcountPerVendorHigh = Math.ceil(details.headcount / committedVendors)
  const headcountPerVendorLow = Math.ceil(details.headcount / expectedVendors)
  const headcountIsRange = headcountPerVendorLow !== headcountPerVendorHigh
  const headcountPerVendor = headcountIsRange
    ? `${headcountPerVendorLow}–${headcountPerVendorHigh}`
    : String(headcountPerVendorLow)
  /** "2 of 4 confirmed so far" — the reason the number is a range. */
  const headcountBasis = headcountIsRange
    ? `${details.headcount} guests ÷ ${expectedVendors} ${term(vertical, 'event_vendor_unit')}s if all confirm, ÷ ${committedVendors} if none else do (${details.accepted_count} of ${details.vendor_count} confirmed so far)`
    : `${details.headcount} total ÷ ${expectedVendors} ${term(vertical, 'event_vendor_unit')}s`

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
        {/* Owner 2026-08-26: say how the two-step works up front — accepting
            is not the booking; the organizer's selection is. */}
        {details.response_status !== 'accepted' && (
          <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `${spacing['2xs']} 0 0`, lineHeight: 1.5 }}>
            Accepting tells the organizer you&apos;re available. If they select you, you&apos;ll get a separate confirmation — that&apos;s when to block the date.
          </p>
        )}
      </div>

      {/* Event Vendor Fee (V1 2026-08-14). Disclosed BEFORE acceptance
          (decision 2). The pay button appears only when the organizer has
          selected this vendor; a paid row is the spot being secured. */}
      {details.vendor_fee_cents != null && details.vendor_fee_cents > 0 && details.response_status !== 'declined' && (
        <div style={{
          marginBottom: spacing.md,
          padding: spacing.sm,
          backgroundColor: details.vendor_fee_status === 'paid' || details.vendor_fee_status === 'covered' ? statusColors.successLight : statusColors.infoLight,
          border: `1px solid ${details.vendor_fee_status === 'paid' || details.vendor_fee_status === 'covered' ? statusColors.successBorder : statusColors.infoBorder}`,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          color: details.vendor_fee_status === 'paid' || details.vendor_fee_status === 'covered' ? statusColors.successDark : statusColors.infoDark,
        }}>
          {details.vendor_fee_status === 'paid' ? (
            <><strong>Your spot is secured</strong> — Event Vendor Fee paid
              ({details.vendor_fee_pays_cents != null ? `$${(details.vendor_fee_pays_cents / 100).toFixed(2)}` : ''}).</>
          ) : details.vendor_fee_status === 'covered' ? (
            <><strong>Your spot fee is covered</strong> — the vendor you&apos;re replacing forfeited
              their fee when they cancelled, and that forfeit is your step-in bonus
              {details.vendor_fee_pays_cents != null ? ` ($${(details.vendor_fee_pays_cents / 100).toFixed(2)} — nothing to pay)` : ' — nothing to pay'}.</>
          ) : (
            <>
              <strong>Event Vendor Fee:</strong>{' '}
              {details.vendor_fee_pays_cents != null ? `$${(details.vendor_fee_pays_cents / 100).toFixed(2)}` : ''} to
              secure your spot, paid only after the organizer selects you.
              {details.response_status !== 'accepted' && (
                <> Accepting the invitation means you agree to this fee if selected.</>
              )}
              {details.response_status === 'accepted' && !details.organizer_selected_at && (
                <> The organizer hasn&apos;t made their selection yet — you&apos;ll be able to pay here once they do.</>
              )}
              {details.response_status === 'accepted' && details.organizer_selected_at && (
                <div style={{ marginTop: spacing.xs }}>
                  <button
                    onClick={() => void payVendorFee()}
                    disabled={payingFee}
                    style={{
                      padding: `${spacing['2xs']} ${spacing.md}`,
                      backgroundColor: accent,
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      cursor: payingFee ? 'not-allowed' : 'pointer',
                      opacity: payingFee ? 0.7 : 1,
                    }}
                  >
                    {payingFee ? 'Opening checkout…' : `Pay ${details.vendor_fee_pays_cents != null ? `$${(details.vendor_fee_pays_cents / 100).toFixed(2)}` : 'fee'} & secure your spot`}
                  </button>
                  <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                    The organizer selected you — your spot is held for 12 hours from selection.
                    First payment wins if spots run short.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Backup bench (mig 232, owner model 2026-08-15): shown to an accepted
          vendor the organizer did NOT select. Opt-in, zero obligation. */}
      {details.response_status === 'accepted' && details.is_backup && (
        <div style={{
          marginBottom: spacing.md,
          padding: spacing.sm,
          backgroundColor: statusColors.neutral50,
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.md,
          fontSize: typography.sizes.sm,
          color: statusColors.neutral700,
          lineHeight: 1.5,
        }}>
          {details.standby_opted_in ? (
            <>
              <strong>You&apos;re on the standby bench.</strong> If a selected {vertical === 'farmers_market' ? 'vendor' : 'truck'} cancels,
              you&apos;re first in line to be asked. You committed to being asked — not to going — and can
              decline freely, or{' '}
              <button
                onClick={() => void toggleStandby(false)}
                disabled={standbyBusy}
                style={{ background: 'none', border: 'none', padding: 0, color: accent, textDecoration: 'underline', cursor: standbyBusy ? 'default' : 'pointer', fontSize: typography.sizes.sm }}
              >
                leave the bench
              </button>.
            </>
          ) : (
            <>
              <strong>The organizer went with other {vertical === 'farmers_market' ? 'vendors' : 'trucks'} this time.</strong>{' '}
              Want to be on standby? If a selected {vertical === 'farmers_market' ? 'vendor' : 'truck'} cancels, you&apos;re first in line
              to be asked — you&apos;re committing to being asked, not to going, and you can decline freely.
              <div style={{ marginTop: spacing.xs }}>
                <button
                  onClick={() => void toggleStandby(true)}
                  disabled={standbyBusy}
                  style={{
                    padding: `${spacing['2xs']} ${spacing.md}`,
                    backgroundColor: 'transparent',
                    color: accent,
                    border: `1px solid ${accent}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    cursor: standbyBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {standbyBusy ? 'Saving…' : 'Join the standby bench'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
          <DetailRow label="Your est. headcount" value={`~${headcountPerVendor} people`} sub={headcountBasis} />
          {details.payment_model && (
            <DetailRow label="Payment" value={PAYMENT_MODEL_LABELS[details.payment_model] || details.payment_model} />
          )}
          <DetailRow label="Vendors confirmed" value={`${details.accepted_count} of ${details.vendor_count}`} />
          {details.is_ticketed && <DetailRow label="Ticketed" value="Yes — attendees have committed to attending" />}
          {details.children_present && <DetailRow label="Children" value="Yes — consider family-friendly offerings" />}
          {details.is_themed && <DetailRow label="Theme" value={details.theme_description || 'Yes'} />}
          {/* Mig 231 (owner 2026-08-15): schools/churches/daycares often
              require vendor background checks — shown BEFORE the decision so
              the vendor can weigh the process and any cost. */}
          {details.background_check_required && (
            <div style={{
              marginTop: spacing['2xs'],
              padding: spacing.xs,
              backgroundColor: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              color: '#92400e',
              lineHeight: 1.5,
            }}>
              <strong>This organizer requires a vendor background check.</strong>
              {details.background_check_details
                ? <> {details.background_check_details}</>
                : <> Details of the process will be provided by the organizer.</>}
            </div>
          )}
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
          {/* T-65: the conservative/optimistic pair now carries the truck-count
              uncertainty as well as the spend-per-head uncertainty — worst case
              is the MOST vendors sharing the crowd at the lowest spend, best
              case is the FEWEST at the highest. Folding it into the existing
              frame keeps this at two numbers instead of four, and both ends are
              defensible rather than a single figure that was never true. */}
          {vertical === 'farmers_market' ? (
            <div style={{ fontSize: typography.sizes.sm, color: '#15803d', lineHeight: 1.8 }}>
              <div><strong>Your estimated shoppers:</strong> {headcountBasis} = <strong>~{headcountPerVendor} shoppers</strong></div>
              <div><strong>Conservative estimate:</strong> {headcountPerVendorLow} shoppers × $8 avg spend = <strong>${(headcountPerVendorLow * 8).toLocaleString()}</strong></div>
              <div><strong>Optimistic estimate:</strong> {headcountPerVendorHigh} shoppers × $20 avg spend = <strong>${(headcountPerVendorHigh * 20).toLocaleString()}</strong></div>
              <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: '#4b5563' }}>
                Pre-orders let customers reserve items before the event — guaranteed sales before you arrive.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: typography.sizes.sm, color: '#15803d', lineHeight: 1.8 }}>
              <div><strong>Your estimated servings:</strong> {headcountBasis} = <strong>~{headcountPerVendor} servings</strong></div>
              <div><strong>Conservative estimate:</strong> {headcountPerVendorLow} servings × $10/plate = <strong>${(headcountPerVendorLow * 10).toLocaleString()}</strong></div>
              <div><strong>Optimistic estimate:</strong> {headcountPerVendorHigh} servings × $15/plate = <strong>${(headcountPerVendorHigh * 15).toLocaleString()}</strong></div>
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
          {/* The response form is ALWAYS visible.
            *
            * It used to sit behind a button labelled "Accept" — which accepted
            * nothing: handleRespond('accepted') only flipped a local flag and
            * returned. So a vendor clicked "Accept" and only THEN saw which
            * items they'd be committing to sell, what capacity they'd be
            * promising, and what terms they'd be agreeing to. The terms of the
            * deal appeared after the button that said you accepted it.
            *
            * Nothing behind it was protected: the organizer's name and street
            * address are withheld server-side until acceptance
            * (api/vendor/events/[marketId]), not by this toggle. Owner decision
            * 2026-08-11 — show it all; the bottom button is the single point of
            * commitment. (T-10, and it dissolves T-14 and most of T-15.)
            */}
          {/* T-57: Decline used to sit HERE — above the menu picker, the
            * capacity fields and the agreement. Introduced by the 2026-08-11
            * toggle removal, which made the whole form always-visible and left
            * the decline button stranded at the top. Asking someone to say no
            * before they have read anything is the wrong order; it now sits
            * beside Accept at the bottom, where both answers are available at
            * the same moment. Do not move it back up. */}
          {(
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
                      // Same helper the loader uses to seed the fields, so the
                      // number shown here and the number submitted cannot drift.
                      // @paired-rule capacity-seeding — display must mirror the seeded/submitted value. See lib/paired-rules.ts.
                      const waveCount = calculateWaveCount(details.event_start_time, details.event_end_time)
                      const profilePerWave = details.profile_max_headcount_per_wave
                      // Owner 2026-08-26: "8 waves × 15 per wave" invited the wrong
                      // math on a 40-person event. Say what THIS event actually asks
                      // of the vendor, from the same demand model the organizer saw.
                      const eventDemand = estimateOrders({
                        headcount: details.headcount,
                        expectedMealCount: null,
                        paymentModel: details.payment_model,
                        eventType: details.event_type,
                        startTime: details.event_start_time,
                        isTicketed: details.is_ticketed,
                        hasCompetingFood: details.has_competing_vendors,
                      })
                      const eventPeak = expectedPeakOrdersPerWave(eventDemand.orders, waveCount)
                      const yourPeakShare = Math.max(1, Math.ceil(eventPeak / expectedVendors))
                      const committedPerWave = typeof maxOrdersPerWave === 'number' && maxOrdersPerWave >= 1
                        ? maxOrdersPerWave
                        : (profilePerWave ?? 0)

                      if (!profilePerWave) {
                        return (
                          <div style={{ padding: spacing.xs, backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: radius.sm }}>
                            <p style={{ fontSize: typography.sizes.sm, color: '#dc2626', margin: 0, lineHeight: 1.5 }}>
                              Your profile is missing capacity data. Please update your event readiness questionnaire before accepting this event.
                            </p>
                            {/* T-66: this pointed at the dashboard, which left
                                the vendor to find the questionnaire themselves
                                — and it had moved from Locations to the
                                business profile, so it wasn't where they'd
                                look. Links straight at the section now. */}
                            <Link
                              href={`/${vertical}/vendor/edit#event-readiness`}
                              style={{ display: 'inline-block', marginTop: spacing.xs, fontSize: typography.sizes.sm, color: accent, fontWeight: typography.weights.semibold }}
                            >
                              Update event readiness →
                            </Link>
                          </div>
                        )
                      }

                      const calculatedTotal = (maxOrdersPerWave || profilePerWave) * waveCount

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                          <p style={{ fontSize: typography.sizes.xs, color: '#374151', margin: 0, lineHeight: 1.5 }}>
                            <strong>This event:</strong> about {details.headcount} attendees — up to <strong>{waveCount} half-hour ordering {waveCount === 1 ? 'window' : 'windows'}</strong> (attendees
                            pick a window when they pre-order; a full window closes, the others stay open). We expect roughly <strong>~{eventDemand.orders} orders in total</strong> and
                            a busiest window of about <strong>{eventPeak}</strong> across all {term(vertical, 'event_vendor_unit')}s — about <strong>{yourPeakShare}</strong> for you
                            with {expectedVendors} {term(vertical, 'event_vendor_unit')}s.
                          </p>
                          <p style={{ fontSize: typography.sizes.xs, margin: 0, lineHeight: 1.5, color: committedPerWave >= yourPeakShare ? '#166534' : '#92400e', fontWeight: typography.weights.semibold }}>
                            {committedPerWave >= yourPeakShare
                              ? `Comfortable — your ${committedPerWave} per window is above your share of the busiest window.`
                              : `Tight — your ${committedPerWave} per window is below your share of the busiest window (${yourPeakShare}).`}
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
                            {/* Owner request 2026-08-15: matching offered this
                                event based on the readiness claim; a lower
                                commitment here can leave the organizer short.
                                Non-blocking note — display only, the seeded/
                                submitted value is untouched (@paired-rule
                                capacity-seeding unaffected). */}
                            {!useProfileWaveCapacity && typeof maxOrdersPerWave === 'number' && maxOrdersPerWave >= 1 && maxOrdersPerWave < profilePerWave && (
                              <p style={{ margin: `${spacing['2xs']} 0 0`, padding: `${spacing['3xs']} ${spacing.xs}`, backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: radius.sm, fontSize: typography.sizes.xs, color: '#92400e', lineHeight: 1.5 }}>
                                Your readiness profile says you can serve {profilePerWave} per wave — this event was
                                offered to you based on that number. Committing to fewer may leave the organizer short,
                                so only lower it if this event really calls for it.
                              </p>
                            )}
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#374151', marginBottom: 4 }}>
                              Your cap for the whole event ({waveCount} windows &times; {maxOrdersPerWave || profilePerWave} per window = {calculatedTotal}) — the most you&apos;d ever be asked to serve here, not a forecast
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

              {/* R3-4 (owner rule 2026-08-27): what else the vendor has on the
                  event's dates, shown from invitation on. A vendor cannot do
                  the event AND another scheduled location at the same time
                  unless they have said they can cover both (profile flag);
                  otherwise they choose — and choosing the event pauses
                  pre-orders at the other place for the day. */}
              {details.availability && details.availability.conflicts.length > 0 && (() => {
                const a = details.availability
                const isFT = vertical === 'food_trucks'
                const flagLabel = isFT ? 'Multiple trucks' : 'I can staff more than one location at the same time'
                const blocked = a.blockedByOrders || a.blockedByEvent
                return (
                  <div style={{
                    padding: spacing.sm,
                    marginBottom: spacing.sm,
                    backgroundColor: statusColors.warningLight,
                    border: `1px solid ${statusColors.warningBorder}`,
                    borderRadius: radius.md,
                  }}>
                    <p style={{ margin: `0 0 ${spacing['2xs']}`, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.warningDark }}>
                      You have something else during this event
                    </p>
                    <ul style={{ margin: `0 0 ${spacing.xs}`, paddingLeft: 18, fontSize: typography.sizes.sm, color: statusColors.warningDark, lineHeight: 1.5 }}>
                      {a.conflicts.map(c => {
                        const work = c.openOrderCount + c.marketBoxPickupCount
                        return (
                          <li key={`${c.marketId}|${c.date}`}>
                            <strong>{c.marketName}</strong> — {fmtConflictDate(c.date)}, {fmtConflictHours(c)} ({CONFLICT_KIND_LABEL[c.kind]}
                            {work > 0 ? `, ${work} open order${work === 1 ? '' : 's'}` : ''})
                          </li>
                        )
                      })}
                    </ul>
                    {a.multiCapable ? (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: typography.sizes.sm, color: statusColors.warningDark, cursor: 'pointer' }}>
                        <input type="checkbox" checked={conflictAck} onChange={(e) => setConflictAck(e.target.checked)} style={{ marginTop: 3 }} />
                        <span>
                          Your profile says you can cover more than one place at once. <strong>I confirm I&apos;ll be at both</strong> — this event and the commitment{a.conflicts.length === 1 ? '' : 's'} above. The organizer will see this.
                        </span>
                      </label>
                    ) : a.blockedByEvent ? (
                      <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.warningDark, lineHeight: 1.5 }}>
                        You already accepted another event at the same time. Withdraw from it first, or — if you really can cover both — turn on <Link href={`/${vertical}/vendor/edit`} style={{ color: statusColors.warningDark, fontWeight: typography.weights.semibold }}>&ldquo;{flagLabel}&rdquo; in your profile</Link>.
                      </p>
                    ) : a.blockedByOrders ? (
                      <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.warningDark, lineHeight: 1.5 }}>
                        Customers already have orders with you at that time. <Link href={`/${vertical}/vendor/orders`} style={{ color: statusColors.warningDark, fontWeight: typography.weights.semibold }}>Fulfill or cancel those orders</Link> and this box will clear — or, if you can cover both, turn on <Link href={`/${vertical}/vendor/edit`} style={{ color: statusColors.warningDark, fontWeight: typography.weights.semibold }}>&ldquo;{flagLabel}&rdquo; in your profile</Link>.
                      </p>
                    ) : (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: typography.sizes.sm, color: statusColors.warningDark, cursor: 'pointer' }}>
                        <input type="checkbox" checked={conflictAck} onChange={(e) => setConflictAck(e.target.checked)} style={{ marginTop: 3 }} />
                        <span>
                          Our records show you operate one {isFT ? 'truck' : 'location'} at a time. <strong>I understand that by taking this event I won&apos;t sell at the place{a.conflicts.length === 1 ? '' : 's'} above that day</strong> — pre-orders there will be paused for the day{a.conflicts.some(c => c.paid) ? ', and a paid spot is not refunded' : ''}. Can cover both? Turn on <Link href={`/${vertical}/vendor/edit`} style={{ color: statusColors.warningDark, fontWeight: typography.weights.semibold }}>&ldquo;{flagLabel}&rdquo; in your profile</Link> instead.
                        </span>
                      </label>
                    )}
                    {blocked && (
                      <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.warningDark }}>
                        Accepting is disabled until this is resolved. You can still decline.
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Event agreement — the commitments the organizer set for this
                  event. Renders nothing (and auto-accepts) if none were set. */}
              <MarketAgreementBlock marketId={marketId} vertical={vertical} onChange={setAgreementAccepted} />

              {(() => {
                const a = details.availability
                const conflictGate = !!a && a.conflicts.length > 0 && (a.blockedByOrders || a.blockedByEvent || !conflictAck)
                const acceptDisabled = responding || selectedListingIds.size === 0 || !agreementAccepted || conflictGate || (vertical === 'food_trucks' && !details.profile_max_headcount_per_wave)
                return (
              <div style={{ display: 'flex', gap: spacing.sm }}>
                <button
                  onClick={handleConfirmAccept}
                  disabled={acceptDisabled}
                  style={{
                    flex: 1,
                    ...sizing.cta,
                    fontWeight: typography.weights.semibold,
                    backgroundColor: acceptDisabled ? '#ccc' : statusColors.success,
                    color: 'white',
                    border: 'none',
                    cursor: acceptDisabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {responding ? 'Submitting...' : `Accept with ${selectedListingIds.size} item${selectedListingIds.size !== 1 ? 's' : ''}`}
                </button>
                {/* T-57: Decline lives here, beside Accept, so both answers are
                    offered at the same point — after the vendor has seen the
                    event, the menu, the capacity and the agreement. It is NOT
                    disabled by the accept-side conditions (item count,
                    agreement, capacity): a vendor who cannot accept must still
                    be able to say no. */}
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
                )
              })()}
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
                // Owner 2026-08-26: FT vendors pick their items AT acceptance
                // (respond → listing_ids), so "add your items to the event market
                // page" was a holdover pointing at the location profile.
                : 'Your selected items are now on the event menu — attendees can pre-order them'
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
