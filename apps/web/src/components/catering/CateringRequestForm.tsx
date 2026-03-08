'use client'

import { useState } from 'react'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'

interface CateringRequestFormProps {
  vertical: string
}

interface FormData {
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  event_date: string
  event_end_date: string
  event_start_time: string
  event_end_time: string
  headcount: string
  address: string
  city: string
  state: string
  zip: string
  cuisine_preferences: string
  dietary_notes: string
  budget_notes: string
  vendor_count: string
  setup_instructions: string
  additional_notes: string
}

const verticalAccent: Record<string, string> = {
  food_trucks: '#ff5757',
  farmers_market: '#2d5016',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: sizing.control.padding,
  border: `1px solid ${statusColors.neutral300}`,
  borderRadius: radius.md,
  fontSize: sizing.control.fontSize,
  minHeight: sizing.control.minHeight,
  color: statusColors.neutral800,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.semibold,
  color: statusColors.neutral600,
  marginBottom: spacing['3xs'],
}

const sectionStyle: React.CSSProperties = {
  marginBottom: spacing.md,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: typography.sizes.base,
  fontWeight: typography.weights.semibold,
  color: statusColors.neutral800,
  marginBottom: spacing.xs,
  paddingBottom: spacing['3xs'],
  borderBottom: `1px solid ${statusColors.neutral200}`,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: spacing.sm,
}

export function CateringRequestForm({ vertical }: CateringRequestFormProps) {
  const accent = verticalAccent[vertical] || verticalAccent.farmers_market
  const [form, setForm] = useState<FormData>({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    event_date: '',
    event_end_date: '',
    event_start_time: '',
    event_end_time: '',
    headcount: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    cuisine_preferences: '',
    dietary_notes: '',
    budget_notes: '',
    vendor_count: '2',
    setup_instructions: '',
    additional_notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    // Validate required fields
    if (
      !form.company_name.trim() ||
      !form.contact_name.trim() ||
      !form.contact_email.trim() ||
      !form.event_date ||
      !form.headcount ||
      !form.address.trim() ||
      !form.city.trim() ||
      !form.state.trim() ||
      !form.zip.trim()
    ) {
      setError('Please fill in all required fields.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      setError('Please enter a valid email address.')
      return
    }

    const hc = parseInt(form.headcount, 10)
    if (isNaN(hc) || hc < 10 || hc > 5000) {
      setError('Headcount must be between 10 and 5,000.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/catering-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim(),
          contact_email: form.contact_email.trim().toLowerCase(),
          contact_phone: form.contact_phone.trim() || null,
          event_date: form.event_date,
          event_end_date: form.event_end_date || null,
          event_start_time: form.event_start_time || null,
          event_end_time: form.event_end_time || null,
          headcount: form.headcount,
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          cuisine_preferences: form.cuisine_preferences.trim() || null,
          dietary_notes: form.dietary_notes.trim() || null,
          budget_notes: form.budget_notes.trim() || null,
          vendor_count: form.vendor_count || null,
          setup_instructions: form.setup_instructions.trim() || null,
          additional_notes: form.additional_notes.trim() || null,
        }),
      })

      if (!res.ok) {
        const result = await res.json()
        setError(result.error || 'Submission failed. Please try again.')
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: `${spacing.lg} ${spacing.md}`,
          backgroundColor: statusColors.successLight,
          border: `1px solid ${statusColors.successBorder}`,
          borderRadius: radius.lg,
        }}
      >
        <p
          style={{
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: '#166534',
            marginBottom: spacing['2xs'],
          }}
        >
          Request Received!
        </p>
        <p
          style={{
            fontSize: typography.sizes.sm,
            color: statusColors.neutral600,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Thank you for your catering request. We&apos;ll review your event
          details and reach out within 24 hours to discuss food truck options
          and next steps.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Section: Company & Contact */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Company & Contact</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>Company / Organization Name *</label>
            <input
              type="text"
              placeholder="Acme Corp"
              value={form.company_name}
              onChange={(e) => updateField('company_name', e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Contact Name *</label>
              <input
                type="text"
                placeholder="Jane Smith"
                value={form.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                placeholder="jane@acme.com"
                value={form.contact_email}
                onChange={(e) => updateField('contact_email', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Phone (optional)</label>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={form.contact_phone}
              onChange={(e) => updateField('contact_phone', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Section: Event Details */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Event Details</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Event Date *</label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => updateField('event_date', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>End Date (if multi-day)</label>
              <input
                type="date"
                value={form.event_end_date}
                onChange={(e) => updateField('event_end_date', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input
                type="time"
                value={form.event_start_time}
                onChange={(e) => updateField('event_start_time', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input
                type="time"
                value={form.event_end_time}
                onChange={(e) => updateField('event_end_time', e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Expected Headcount *</label>
              <input
                type="number"
                placeholder="50"
                min="10"
                max="5000"
                value={form.headcount}
                onChange={(e) => updateField('headcount', e.target.value)}
                style={inputStyle}
                required
              />
              <p
                style={{
                  margin: `${spacing['3xs']} 0 0`,
                  fontSize: typography.sizes.xs,
                  color: statusColors.neutral400,
                }}
              >
                Minimum 10 people
              </p>
            </div>
            <div>
              <label style={labelStyle}>Number of Food Trucks</label>
              <select
                value={form.vendor_count}
                onChange={(e) => updateField('vendor_count', e.target.value)}
                style={{ ...inputStyle, backgroundColor: 'white', cursor: 'pointer' }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} truck{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Location */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Event Location</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>Street Address *</label>
            <input
              type="text"
              placeholder="123 Corporate Blvd"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: spacing.sm }}>
            <div>
              <label style={labelStyle}>City *</label>
              <input
                type="text"
                placeholder="Springfield"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>State *</label>
              <input
                type="text"
                placeholder="IL"
                maxLength={2}
                value={form.state}
                onChange={(e) => updateField('state', e.target.value.toUpperCase())}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>ZIP *</label>
              <input
                type="text"
                placeholder="62701"
                maxLength={10}
                value={form.zip}
                onChange={(e) => updateField('zip', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section: Preferences */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Preferences (Optional)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>Cuisine Preferences</label>
            <input
              type="text"
              placeholder="BBQ, Mexican, Asian fusion, etc."
              value={form.cuisine_preferences}
              onChange={(e) => updateField('cuisine_preferences', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Dietary Considerations</label>
            <input
              type="text"
              placeholder="Vegetarian options needed, nut-free, gluten-free, etc."
              value={form.dietary_notes}
              onChange={(e) => updateField('dietary_notes', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Budget Notes</label>
            <input
              type="text"
              placeholder="~$15 per person, flexible on pricing, etc."
              value={form.budget_notes}
              onChange={(e) => updateField('budget_notes', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Section: Setup & Notes */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Setup & Additional Info (Optional)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>Setup Instructions</label>
            <textarea
              placeholder="Where should trucks park? Is there power available? Any access restrictions?"
              value={form.setup_instructions}
              onChange={(e) => updateField('setup_instructions', e.target.value)}
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Anything Else?</label>
            <textarea
              placeholder="Special requests, recurring event interest, past catering experience, etc."
              value={form.additional_notes}
              onChange={(e) => updateField('additional_notes', e.target.value)}
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: spacing.sm,
            padding: `${spacing['2xs']} ${spacing.xs}`,
            backgroundColor: statusColors.dangerLight,
            border: `1px solid ${statusColors.dangerBorder}`,
            borderRadius: radius.md,
            color: statusColors.danger,
            fontSize: typography.sizes.xs,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          ...sizing.cta,
          fontWeight: typography.weights.semibold,
          backgroundColor: submitting ? '#ccc' : accent,
          color: '#fff',
          border: 'none',
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Catering Request'}
      </button>

      <p
        style={{
          textAlign: 'center',
          marginTop: spacing.xs,
          fontSize: typography.sizes.xs,
          color: statusColors.neutral400,
          lineHeight: 1.5,
        }}
      >
        We&apos;ll review your request and reach out within 24 hours.
        No commitment until we confirm details together.
      </p>
    </form>
  )
}
