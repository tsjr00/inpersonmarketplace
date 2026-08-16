'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
// T-06: the organizer is choosing trucks for their guests, so every price on
// this page must be the price those guests will actually pay — base + the
// buyer fee. These helpers are the single source of that number; this page
// used to divide price_cents by 100 by hand and show the vendor's base price,
// which no attendee ever sees.
import { formatDisplayPrice, calculateItemDisplayPrice } from '@/lib/pricing'

/**
 * Self-Service Event — Organizer Truck Selection Page
 *
 * After the 48hr response window, the organizer receives an email
 * linking here. They see which vendors are interested, review their
 * details and menus, select their preferred trucks, agree to terms,
 * and submit. This triggers vendor confirmations + event page creation.
 *
 * URL: /events/[token]/select
 * Auth: none required (token-based access, like the event page itself)
 */

interface InterestedVendor {
  vendor_profile_id: string
  /** T-80: already confirmed by the organizer on a prior submit. */
  selected: boolean
  /** Backup bench (mig 232): non-selected vendor opted into standby. */
  on_standby?: boolean
  business_name: string
  cuisine_categories: string[]
  avg_price_cents: number | null
  average_rating: number | null
  rating_count: number
  tier: string
  pickup_lead_minutes: number
  profile_image_url: string | null
  catering_items: Array<{ title: string; price_cents: number }>
  /** T-59: the message the vendor typed when accepting the invitation. */
  response_notes: string | null
}

interface EventDetails {
  id: string
  company_name: string
  event_date: string
  event_start_time: string | null
  event_end_time: string | null
  headcount: number
  vendor_count: number
  city: string
  state: string
  status: string
}

export default function EventSelectPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const token = params.token as string
  const isFM = vertical === 'farmers_market'
  const vendorTerm = isFM ? 'vendor' : 'truck'
  const vendorTermPlural = isFM ? 'vendors' : 'trucks'
  const vendorTermCap = isFM ? 'Vendor' : 'Truck'
  const vendorTermPluralCap = isFM ? 'Vendors' : 'Trucks'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [event, setEvent] = useState<EventDetails | null>(null)
  const [vendors, setVendors] = useState<InterestedVendor[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [menusReviewed, setMenusReviewed] = useState<Set<string>>(new Set())
  const [shareContact, setShareContact] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // T-80: an already-confirmed event renders a read-only confirmed state;
  // editing again is an explicit choice, not the default.
  const [changeMode, setChangeMode] = useState(false)
  // Backup bench (mig 232): system recommendation + current standby count.
  const [recommendedBackups, setRecommendedBackups] = useState(0)
  const [standbyCount, setStandbyCount] = useState(0)

  async function fetchData() {
    try {
      const res = await fetch(`/api/events/${token}/select`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Unable to load event details')
        setLoading(false)
        return
      }
      const data = await res.json()
      setEvent(data.event)
      setVendors(data.vendors || [])
      setRecommendedBackups(data.recommended_backups || 0)
      setStandbyCount(data.standby_count || 0)
      // T-80: pre-load prior confirmations so "Change selections" starts from
      // what the organizer already chose (menus were reviewed on that submit).
      const prior = ((data.vendors || []) as InterestedVendor[])
        .filter(v => v.selected)
        .map(v => v.vendor_profile_id)
      if (prior.length > 0) {
        setSelectedIds(prior)
        setMenusReviewed(new Set(prior))
      }
    } catch {
      setError('Failed to load. Please try again.')
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [token])

  function toggleVendor(vendorId: string) {
    setSelectedIds(prev => {
      if (prev.includes(vendorId)) return prev.filter(id => id !== vendorId)
      if (event && prev.length >= event.vendor_count) return prev // max reached
      return [...prev, vendorId]
    })
  }

  function toggleMenuReviewed(vendorId: string) {
    setMenusReviewed(prev => {
      const next = new Set(prev)
      if (next.has(vendorId)) next.delete(vendorId)
      else next.add(vendorId)
      return next
    })
  }

  async function handleSubmit() {
    if (!event || selectedIds.length === 0 || !termsAccepted || submitting) return

    // Verify all selected vendors have menu reviewed
    const allReviewed = selectedIds.every(id => menusReviewed.has(id))
    if (!allReviewed) {
      setError(`Please confirm you have reviewed the ${isFM ? 'event items' : 'catering menu'} for each selected ${vendorTerm}.`)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/events/${token}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_vendor_ids: selectedIds,
          share_contact: shareContact,
          organizer_contact_name: shareContact ? contactName.trim() : null,
          organizer_contact_phone: shareContact ? contactPhone.trim() : null,
          organizer_contact_email: shareContact ? contactEmail.trim() : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to submit selections')
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: statusColors.neutral500 }}>Loading event details...</p>
      </div>
    )
  }

  if (error && !event) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: spacing.lg }}>
          <h2 style={{ color: statusColors.neutral700 }}>Unable to Load Event</h2>
          <p style={{ color: statusColors.neutral500 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: spacing.lg, maxWidth: 500 }}>
          <div style={{ fontSize: '4rem', marginBottom: spacing.md }}>🎉</div>
          <h2 style={{ color: statusColors.neutral900, margin: `0 0 ${spacing.sm}` }}>Your {vendorTermPluralCap} Are Confirmed!</h2>
          <p style={{ color: statusColors.neutral600, lineHeight: 1.6, margin: `0 0 ${spacing.md}` }}>
            We&apos;re notifying your selected {vendorTermPlural} now. They&apos;ll connect their {isFM ? 'items' : 'catering menus'} to your event,
            and you&apos;ll receive your shareable event page link shortly.
          </p>
          <p style={{ color: statusColors.neutral500, fontSize: typography.sizes.sm }}>
            Your attendees will be able to browse {isFM ? 'products' : 'menus'} and pre-order through the event page.
          </p>
        </div>
      </div>
    )
  }

  if (!event) return null

  // T-80: a live (ready) event with confirmed vendors shows THIS instead of
  // fresh "Select" buttons. The owner re-selected on a live event and the
  // vendor got a duplicate confirmation email — editing is now an explicit
  // "Change selections" action, never the landing state.
  const confirmedVendors = vendors.filter(v => v.selected)
  if (event.status === 'ready' && confirmedVendors.length > 0 && !changeMode) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: `${spacing.lg} ${spacing.md}` }}>
          <div style={{ textAlign: 'center', marginBottom: spacing.lg }}>
            <div style={{ fontSize: '3rem', marginBottom: spacing.sm }}>✅</div>
            <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>
              Your {confirmedVendors.length !== 1 ? vendorTermPluralCap : vendorTermCap} {confirmedVendors.length !== 1 ? 'Are' : 'Is'} Confirmed
            </h1>
            <p style={{ color: statusColors.neutral600, margin: 0, lineHeight: 1.5 }}>
              Event: <strong>{event.event_date}</strong> in {event.city}, {event.state} &bull; {event.headcount} guests
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginBottom: spacing.lg }}>
            {confirmedVendors.map(v => (
              <div key={v.vendor_profile_id} style={{
                backgroundColor: 'white',
                border: `1px solid ${statusColors.successBorder}`,
                borderRadius: radius.lg,
                padding: spacing.sm,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
              }}>
                <span style={{ color: '#059669', fontWeight: typography.weights.bold }}>✓</span>
                <span style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral900 }}>
                  {v.business_name}
                </span>
              </div>
            ))}
          </div>

          {/* Backup bench (owner model 2026-08-15): the number without the
              math — "we recommend N, does that sound right" — plus who's
              actually standing by. Funding extra spots is phase 3. */}
          {recommendedBackups > 0 && (
            <div style={{
              marginBottom: spacing.sm,
              padding: spacing.sm,
              backgroundColor: statusColors.neutral50,
              border: `1px solid ${statusColors.neutral200}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              color: statusColors.neutral700,
              lineHeight: 1.5,
            }}>
              <strong>Backup {vendorTermPlural}:</strong> based on your event profile, we recommend
              keeping <strong>{recommendedBackups}</strong> backup {recommendedBackups === 1 ? vendorTerm : vendorTermPlural} on
              standby. {vendorTermPluralCap} you didn&apos;t select are invited to join the bench —{' '}
              <strong>{standbyCount}</strong> {standbyCount === 1 ? 'is' : 'are'} on standby now.
            </div>
          )}

          <a
            href={`/${vertical}/events/${token}`}
            style={{
              display: 'block',
              textAlign: 'center',
              padding: spacing.sm,
              backgroundColor: '#2563eb',
              color: 'white',
              borderRadius: radius.lg,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.bold,
              textDecoration: 'none',
              marginBottom: spacing.sm,
            }}
          >
            View Your Event Page
          </a>

          <button
            onClick={() => setChangeMode(true)}
            style={{
              width: '100%',
              padding: spacing.xs,
              backgroundColor: 'transparent',
              color: statusColors.neutral500,
              border: `1px solid ${statusColors.neutral300}`,
              borderRadius: radius.md,
              fontSize: typography.sizes.sm,
              cursor: 'pointer',
            }}
          >
            Change selections
          </button>
          <p style={{ textAlign: 'center', marginTop: spacing.xs, fontSize: typography.sizes.xs, color: statusColors.neutral400, lineHeight: 1.5 }}>
            Changing selections notifies newly added {vendorTermPlural} only. Removed {vendorTermPlural} stay
            listed as backups — and any spot fee they already paid is automatically refunded in full,
            with your portion of that fee returned from your payout account.
          </p>
        </div>
      </div>
    )
  }

  const canSubmit = selectedIds.length > 0 && termsAccepted && selectedIds.every(id => menusReviewed.has(id))

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: `${spacing.lg} ${spacing.md}` }}>

        {/* Header */}
        <div style={{ marginBottom: spacing.lg }}>
          <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: statusColors.neutral900, margin: `0 0 ${spacing.xs}` }}>
            Select Your {vendorTermPluralCap}
          </h1>
          <p style={{ color: statusColors.neutral600, margin: 0, lineHeight: 1.5 }}>
            Event: <strong>{event.event_date}</strong> in {event.city}, {event.state} &bull; {event.headcount} guests &bull; {event.vendor_count} {event.vendor_count > 1 ? vendorTermPlural : vendorTerm} needed
          </p>
        </div>

        {error && (
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.md,
            backgroundColor: statusColors.dangerLight,
            border: `1px solid ${statusColors.dangerBorder}`,
            borderRadius: radius.md,
            color: statusColors.dangerDark,
            fontSize: typography.sizes.sm,
          }}>
            {error}
          </div>
        )}

        {/* Vendor List */}
        {vendors.length === 0 ? (
          <div style={{
            padding: spacing.lg,
            textAlign: 'center',
            backgroundColor: 'white',
            borderRadius: radius.lg,
            border: `1px solid ${statusColors.neutral200}`,
          }}>
            <p style={{ color: statusColors.neutral500, margin: 0 }}>
              No vendors have responded yet. You&apos;ll receive an updated email when responses come in.
            </p>
          </div>
        ) : (
          <>
            <p style={{ color: statusColors.neutral500, fontSize: typography.sizes.sm, margin: `0 0 ${spacing.sm}` }}>
              {vendors.length} {vendors.length > 1 ? vendorTermPlural : vendorTerm} interested &bull; Select up to {event.vendor_count}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm, marginBottom: spacing.lg }}>
              {vendors.map(v => {
                const isSelected = selectedIds.includes(v.vendor_profile_id)
                const isMenuReviewed = menusReviewed.has(v.vendor_profile_id)
                const atMax = selectedIds.length >= event.vendor_count && !isSelected

                return (
                  <div
                    key={v.vendor_profile_id}
                    style={{
                      backgroundColor: 'white',
                      border: `2px solid ${isSelected ? '#2563eb' : statusColors.neutral200}`,
                      borderRadius: radius.lg,
                      padding: spacing.md,
                      opacity: atMax ? 0.5 : 1,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    {/* Vendor header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
                      <div>
                        <div style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: statusColors.neutral900 }}>
                          {v.business_name}
                        </div>
                        <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing['3xs'], flexWrap: 'wrap' }}>
                          {v.cuisine_categories.map(cat => (
                            <span key={cat} style={{
                              padding: `2px ${spacing.xs}`,
                              backgroundColor: statusColors.neutral100,
                              borderRadius: 12,
                              fontSize: 11,
                              color: statusColors.neutral600,
                            }}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', flexShrink: 0 }}>
                        {v.average_rating && (
                          <span style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, fontWeight: typography.weights.semibold }}>
                            {v.average_rating.toFixed(1)}★
                          </span>
                        )}
                        {v.pickup_lead_minutes <= 15 && (
                          <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>⚡ Fast</span>
                        )}
                        {v.avg_price_cents && (
                          <span style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>
                            ~${(calculateItemDisplayPrice(v.avg_price_cents) / 100).toFixed(0)}/meal
                          </span>
                        )}
                      </div>
                    </div>

                    {/* T-59: the message this vendor wrote when they accepted.
                        Stored on market_vendors.response_notes since the
                        feature shipped, rendered only on the ADMIN events page
                        — so the organizer never saw the note written for them.
                        Sits above the menu because it is the vendor speaking
                        directly to the person choosing. */}
                    {v.response_notes && (
                      <div style={{
                        marginBottom: spacing.xs,
                        padding: spacing.xs,
                        backgroundColor: statusColors.neutral100,
                        borderLeft: `3px solid ${statusColors.neutral300}`,
                        borderRadius: 4,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: typography.weights.semibold, color: statusColors.neutral500, marginBottom: spacing['3xs'] }}>
                          THEIR MESSAGE
                        </div>
                        <div style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {v.response_notes}
                        </div>
                      </div>
                    )}

                    {/* Catering menu preview */}
                    {v.catering_items.length > 0 && (
                      <div style={{ marginBottom: spacing.xs }}>
                        <div style={{ fontSize: 11, fontWeight: typography.weights.semibold, color: statusColors.neutral500, marginBottom: spacing['3xs'] }}>
                          {isFM ? 'EVENT ITEMS' : 'CATERING MENU'} ({v.catering_items.length} items)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'] }}>
                          {v.catering_items.map((item, i) => (
                            <span key={i} style={{
                              padding: `2px ${spacing.xs}`,
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              borderRadius: radius.sm,
                              fontSize: 12,
                              color: '#166534',
                            }}>
                              {item.title} — {formatDisplayPrice(item.price_cents)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                      <button
                        onClick={() => toggleVendor(v.vendor_profile_id)}
                        disabled={atMax}
                        style={{
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          backgroundColor: isSelected ? '#2563eb' : 'white',
                          color: isSelected ? 'white' : statusColors.neutral700,
                          border: `1px solid ${isSelected ? '#2563eb' : statusColors.neutral300}`,
                          borderRadius: radius.md,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          cursor: atMax ? 'not-allowed' : 'pointer',
                          minHeight: 36,
                        }}
                      >
                        {isSelected ? '✓ Selected' : `Select This ${vendorTermCap}`}
                      </button>

                      {isSelected && (
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing['2xs'],
                          fontSize: typography.sizes.xs,
                          color: isMenuReviewed ? '#059669' : statusColors.neutral500,
                          cursor: 'pointer',
                        }}>
                          <input
                            type="checkbox"
                            checked={isMenuReviewed}
                            onChange={() => toggleMenuReviewed(v.vendor_profile_id)}
                          />
                          I have reviewed this {vendorTerm}&apos;s {isFM ? 'event items' : 'catering menu'}
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Contact Sharing Opt-In */}
            <div style={{
              backgroundColor: 'white',
              border: `1px solid ${statusColors.neutral200}`,
              borderRadius: radius.lg,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}>
              <h3 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: `0 0 ${spacing.xs}` }}>
                Communication with {vendorTermPluralCap}
              </h3>
              <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.sm}`, lineHeight: 1.5 }}>
                Would you like to share your contact information with your selected {vendorTermPlural} so they can reach you directly for logistical questions?
                If you choose not to, {vendorTermPlural} can still send you messages through the platform.
              </p>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                fontSize: typography.sizes.sm,
                color: statusColors.neutral700,
                cursor: 'pointer',
                marginBottom: spacing.sm,
              }}>
                <input
                  type="checkbox"
                  checked={shareContact}
                  onChange={(e) => setShareContact(e.target.checked)}
                />
                Yes, share my contact information with selected {vendorTermPlural}
              </label>
              {shareContact && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingLeft: spacing.md }}>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                  />
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                  />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }}
                  />
                </div>
              )}
            </div>

            {/* Terms Agreement */}
            <div style={{
              backgroundColor: 'white',
              border: `1px solid ${statusColors.neutral200}`,
              borderRadius: radius.lg,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}>
              <h3 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: `0 0 ${spacing.xs}` }}>
                Terms of Service
              </h3>
              <div style={{
                padding: spacing.sm,
                backgroundColor: statusColors.neutral50,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                color: statusColors.neutral600,
                lineHeight: 1.6,
                marginBottom: spacing.sm,
                maxHeight: 150,
                overflowY: 'auto',
              }}>
                <p style={{ margin: `0 0 ${spacing.xs}` }}>
                  By selecting {vendorTermPlural} through this platform, you acknowledge and agree that:
                </p>
                <ul style={{ margin: 0, paddingLeft: spacing.md }}>
                  <li>This platform acts strictly as a facilitator connecting event organizers with {vendorTermPlural}.</li>
                  <li>The arrangement for {isFM ? 'products and services' : 'food service'} is between you and the selected {vendorTerm}(s).</li>
                  <li>The platform is not responsible for {isFM ? 'product quality' : 'food quality'}, vendor no-shows, preparation delays, or any issues arising from the event.</li>
                  <li>You have reviewed the {isFM ? 'event items' : 'catering menu'} for each selected {vendorTerm} and understand what will be provided.</li>
                  <li>Selected {vendorTermPlural} will receive your contact information for logistical coordination.</li>
                  <li>Cancellations by either party should be communicated as early as possible. Vendors who cancel within 72 hours of the event may face platform penalties.</li>
                  {/*
                    The organizer-side symmetry of the line above, placed here
                    because this is the moment the event goes live — confirming
                    is what mints the shareable page and QR kit. Your date and
                    times stop being private planning notes at this click, so
                    the consequence has to be stated at this click.
                  */}
                  {/* B3 shipped 2026-08-15 (mig 230) — the strong language is
                      TRUE again: re-confirmation + cutoff refunds exist. */}
                  <li>Your date and times are now what {vendorTermPlural} staff for and what attendees order against. Changing them later reduces attendance: every pre-order placed against the old window has to be re-confirmed by that attendee, and any that go unconfirmed are refunded before the event.</li>
                </ul>
              </div>
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.xs,
                fontSize: typography.sizes.sm,
                color: statusColors.neutral700,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                I have read and agree to the terms above
              </label>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{
                width: '100%',
                padding: spacing.sm,
                backgroundColor: canSubmit && !submitting ? '#2563eb' : statusColors.neutral300,
                color: canSubmit && !submitting ? 'white' : statusColors.neutral500,
                border: 'none',
                borderRadius: radius.lg,
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.bold,
                cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                minHeight: 52,
              }}
            >
              {submitting ? 'Confirming...' : `Confirm ${selectedIds.length} ${selectedIds.length !== 1 ? vendorTermPluralCap : vendorTermCap}`}
            </button>

            {selectedIds.length > 0 && !canSubmit && (
              <p style={{ textAlign: 'center', marginTop: spacing.xs, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                {!termsAccepted ? 'Please accept the terms above' : `Please confirm you reviewed each selected ${vendorTerm}'s ${isFM ? 'items' : 'menu'}`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
