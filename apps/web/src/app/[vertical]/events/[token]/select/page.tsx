'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

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
  business_name: string
  cuisine_categories: string[]
  avg_price_cents: number | null
  average_rating: number | null
  rating_count: number
  tier: string
  pickup_lead_minutes: number
  profile_image_url: string | null
  catering_items: Array<{ title: string; price_cents: number }>
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
                            ~${(v.avg_price_cents / 100).toFixed(0)}/meal
                          </span>
                        )}
                      </div>
                    </div>

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
                              {item.title} — ${(item.price_cents / 100).toFixed(2)}
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
