'use client'

import { useState } from 'react'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { CATEGORIES, FOOD_TRUCK_CATEGORIES } from '@/lib/constants'

interface EventRequestFormProps {
  vertical: string
  vendorPreference?: string | null
}

interface FormData {
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  event_type: string
  payment_model: string
  event_date: string
  event_end_date: string
  event_start_time: string
  event_end_time: string
  headcount: string
  expected_meal_count: string
  total_food_budget: string
  per_meal_budget: string
  has_competing_vendors: boolean
  competing_food_options: string
  is_ticketed: boolean
  estimated_dwell_hours: string
  address: string
  city: string
  state: string
  zip: string
  cuisine_preferences: string
  dietary_restrictions: string[]
  dietary_other: string
  budget_notes: string
  beverages_provided: boolean
  dessert_provided: boolean
  vendor_count: string
  setup_instructions: string
  additional_notes: string
  is_recurring: boolean
  recurring_frequency: string
  service_level: string
  children_present: boolean
  is_themed: boolean
  theme_description: string
  estimated_spend_per_attendee: string
  preferred_vendor_categories: string[]
  cutoff_hours: string
  event_allow_day_of_orders: boolean
  vendor_stay_policy: string
  company_max_per_attendee: string
}

function getServiceLevels(vertical: string) {
  const vendorTerm = vertical === 'farmers_market' ? 'vendors' : 'food trucks'
  return [
    {
      value: 'self_service',
      label: 'Self-Service (Free)',
      description: `We automatically match and notify qualifying ${vendorTerm}. You select from interested vendors. No platform fee.`,
    },
    {
      value: 'full_service',
      label: 'Full Service (Managed)',
      description: 'Our team personally coordinates your event — vendor selection, logistics, day-of support. Platform fee applies.',
    },
  ]
}

const EVENT_TYPES = [
  { value: 'corporate_lunch', label: 'Corporate Lunch / Team Meal' },
  { value: 'team_building', label: 'Team Building / Employee Appreciation' },
  { value: 'grand_opening', label: 'Grand Opening / Promotional Event' },
  { value: 'festival', label: 'Festival / Community Event' },
  { value: 'private_party', label: 'Private Party / Celebration' },
  { value: 'other', label: 'Other' },
]

const PAYMENT_MODELS = [
  { value: 'company_paid', label: 'Our company pays for everyone' },
  { value: 'attendee_paid', label: 'Each person pays for themselves' },
]

const RECURRING_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
]

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

export function EventRequestForm({ vertical, vendorPreference }: EventRequestFormProps) {
  const accent = verticalAccent[vertical] || verticalAccent.farmers_market
  const locale = getClientLocale()
  const [form, setForm] = useState<FormData>({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    event_type: '',
    payment_model: '',
    event_date: '',
    event_end_date: '',
    event_start_time: '',
    event_end_time: '',
    headcount: '',
    expected_meal_count: '',
    total_food_budget: '',
    per_meal_budget: '',
    has_competing_vendors: false,
    competing_food_options: '',
    is_ticketed: false,
    estimated_dwell_hours: '',
    children_present: false,
    is_themed: false,
    theme_description: '',
    estimated_spend_per_attendee: '',
    preferred_vendor_categories: [],
    address: '',
    city: '',
    state: '',
    zip: '',
    cuisine_preferences: '',
    dietary_restrictions: [],
    dietary_other: '',
    budget_notes: '',
    beverages_provided: false,
    dessert_provided: false,
    vendor_count: '2',
    setup_instructions: '',
    additional_notes: vendorPreference ? `Preferred vendor: ${vendorPreference}` : '',
    is_recurring: false,
    recurring_frequency: '',
    service_level: 'self_service',
    cutoff_hours: '24',
    event_allow_day_of_orders: true,
    vendor_stay_policy: 'vendor_discretion',
    company_max_per_attendee: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
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
      setError(t('erf.required_fields', locale))
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      setError(t('erf.invalid_email', locale))
      return
    }

    const hc = parseInt(form.headcount, 10)
    if (isNaN(hc) || hc < 10 || hc > 5000) {
      setError(t('erf.headcount_range', locale))
      return
    }

    // Validate hybrid payment cap when hybrid is selected
    if (form.payment_model === 'hybrid') {
      const cap = parseFloat(form.company_max_per_attendee)
      if (!form.company_max_per_attendee.trim() || isNaN(cap) || cap <= 0) {
        setError('Company contribution per person is required for hybrid payment events.')
        return
      }
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/event-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim(),
          contact_email: form.contact_email.trim().toLowerCase(),
          contact_phone: form.contact_phone.trim() || null,
          event_type: form.event_type || null,
          payment_model: form.payment_model || null,
          event_date: form.event_date,
          event_end_date: form.event_end_date || null,
          event_start_time: form.event_start_time || null,
          event_end_time: form.event_end_time || null,
          headcount: form.headcount,
          expected_meal_count: form.expected_meal_count ? parseInt(form.expected_meal_count) : null,
          total_food_budget_cents: form.total_food_budget ? Math.round(parseFloat(form.total_food_budget) * 100) : null,
          per_meal_budget_cents: form.per_meal_budget ? Math.round(parseFloat(form.per_meal_budget) * 100) : null,
          has_competing_vendors: form.has_competing_vendors,
          competing_food_options: form.has_competing_vendors ? (form.competing_food_options.trim() || null) : null,
          is_ticketed: form.is_ticketed,
          estimated_dwell_hours: form.estimated_dwell_hours ? parseFloat(form.estimated_dwell_hours) : null,
          children_present: form.children_present,
          is_themed: form.is_themed,
          theme_description: form.is_themed ? (form.theme_description.trim() || null) : null,
          estimated_spend_per_attendee_cents: form.estimated_spend_per_attendee ? Math.round(parseFloat(form.estimated_spend_per_attendee) * 100) : null,
          preferred_vendor_categories: form.preferred_vendor_categories.length > 0 ? form.preferred_vendor_categories : null,
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          cuisine_preferences: form.preferred_vendor_categories.length > 0 ? form.preferred_vendor_categories.join(', ') : (form.cuisine_preferences.trim() || null),
          dietary_notes: [...form.dietary_restrictions, ...(form.dietary_other.trim() ? [form.dietary_other.trim()] : [])].join(', ') || null,
          budget_notes: form.budget_notes.trim() || null,
          beverages_provided: form.beverages_provided,
          dessert_provided: form.dessert_provided,
          vendor_count: form.vendor_count || null,
          setup_instructions: form.setup_instructions.trim() || null,
          additional_notes: form.additional_notes.trim() || null,
          is_recurring: form.is_recurring,
          recurring_frequency: form.is_recurring ? form.recurring_frequency || null : null,
          service_level: form.service_level || 'self_service',
          cutoff_hours: form.cutoff_hours || '24',
          event_allow_day_of_orders: form.event_allow_day_of_orders,
          vendor_stay_policy: form.vendor_stay_policy || null,
          company_max_per_attendee_cents: form.company_max_per_attendee ? Math.round(parseFloat(form.company_max_per_attendee) * 100) : null,
          vendor_preferences: null,
        }),
      })

      if (!res.ok) {
        const result = await res.json()
        setError(result.error || t('erf.submit_failed', locale))
        setSubmitting(false)
        return
      }

      const successData = await res.json()
      setMatchCount(successData.match_count || 0)
      setSubmitted(true)
    } catch {
      setError(t('erf.network_error', locale))
      setSubmitting(false)
    }
  }

  if (submitted) {
    const vendorWord = vertical === 'farmers_market' ? 'vendors' : 'food trucks'
    const signupUrl = `/${vertical}/signup?ref=event&email=${encodeURIComponent(form.contact_email)}`
    const loginUrl = `/${vertical}/login?ref=event&email=${encodeURIComponent(form.contact_email)}`
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
        <div style={{ fontSize: 48, marginBottom: spacing.sm }}>&#10003;</div>
        <p style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: '#166534', marginBottom: spacing.xs }}>
          {t('erf.success_title', locale)}
        </p>
        {matchCount > 0 && (
          <p style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: accent, margin: `0 0 ${spacing.xs}` }}>
            {matchCount} qualified {vendorWord} found in your area
          </p>
        )}
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, lineHeight: 1.6, margin: `0 0 ${spacing.sm}` }}>
          Create a free account to manage your event from your personal dashboard.
        </p>
        <div style={{
          textAlign: 'left',
          display: 'inline-block',
          margin: `0 auto ${spacing.md}`,
          padding: `${spacing.sm} ${spacing.md}`,
          backgroundColor: 'white',
          borderRadius: radius.md,
          border: `1px solid ${statusColors.successBorder}`,
        }}>
          <p style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#166534', margin: `0 0 ${spacing.xs}` }}>
            With your account you can:
          </p>
          <ul style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: 0, paddingLeft: '1.2em', lineHeight: 1.8 }}>
            <li>Track your event status and {vendorWord} responses in real time</li>
            <li>Review and approve {vendorWord} for your event</li>
            <li>See pre-order volume and revenue as attendees shop</li>
            {vertical === 'food_trucks' && <li>Monitor pickup wave reservations and capacity</li>}
            <li>Edit event details and communicate with your {vendorWord}</li>
            <li>Rate and review {vendorWord} after your event</li>
          </ul>
        </div>
        <div>
          <a
            href={signupUrl}
            style={{
              display: 'inline-block',
              padding: `${spacing.xs} ${spacing.lg}`,
              backgroundColor: accent,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base,
            }}
          >
            Create Your Free Account
          </a>
        </div>
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, marginTop: spacing.sm }}>
          Already have an account?{' '}
          <a href={loginUrl} style={{ color: accent, fontWeight: typography.weights.semibold, textDecoration: 'none' }}>
            Sign in
          </a>
        </p>
      </div>
    )
  }

  const isFM = vertical === 'farmers_market'

  return (
    <form onSubmit={handleSubmit}>
      {/* Quick-Start: Company & Contact */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Tell us about your event</h3>
        <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400, margin: `0 0 ${spacing.sm}`, lineHeight: 1.5 }}>
          Start with the basics — you can add more details from your event dashboard after signing in.
        </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {/* Company + Contact */}
            <div>
              <label style={labelStyle}>Your name *</label>
              <input type="text" placeholder="Full name" value={form.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)} style={inputStyle} required />
            </div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Organization / Company *</label>
                <input type="text" placeholder={isFM ? 'Company, church, school, etc.' : 'Company or organization name'}
                  value={form.company_name} onChange={(e) => updateField('company_name', e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" placeholder="you@company.com" value={form.contact_email}
                  onChange={(e) => updateField('contact_email', e.target.value)} style={inputStyle} required />
              </div>
            </div>

            {/* Event basics */}
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Event date *</label>
                <input type="date" value={form.event_date}
                  onChange={(e) => updateField('event_date', e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Estimated headcount *</label>
                <input type="number" placeholder="50" min="10" max="5000" value={form.headcount}
                  onChange={(e) => updateField('headcount', e.target.value)} style={inputStyle} required />
                <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                  Total expected attendees (min 10)
                </p>
              </div>
            </div>

            {/* Location */}
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>City *</label>
                <input type="text" placeholder="City" value={form.city}
                  onChange={(e) => updateField('city', e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>State *</label>
                <input type="text" placeholder="TX" maxLength={2} value={form.state}
                  onChange={(e) => updateField('state', e.target.value.toUpperCase())} style={inputStyle} required />
              </div>
            </div>

            {/* Indoor / Outdoor */}
            <div>
              <label style={labelStyle}>Event setting</label>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                {[
                  { value: 'outdoor', label: 'Outdoor' },
                  { value: 'indoor', label: 'Indoor' },
                  { value: 'either', label: 'Either / Both' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => updateField('setup_instructions', opt.value)}
                    style={{
                      flex: 1, padding: spacing['2xs'],
                      borderRadius: radius.md,
                      border: `1.5px solid ${form.setup_instructions === opt.value ? accent : statusColors.neutral300}`,
                      backgroundColor: form.setup_instructions === opt.value ? accent : 'white',
                      color: form.setup_instructions === opt.value ? 'white' : statusColors.neutral600,
                      fontSize: typography.sizes.sm, fontWeight: typography.weights.medium,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment model */}
            <div>
              <label style={labelStyle}>Who&apos;s paying for the food?</label>
              <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                {PAYMENT_MODELS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => updateField('payment_model', opt.value)}
                    style={{
                      flex: 1, minWidth: 140, padding: spacing['2xs'],
                      borderRadius: radius.md,
                      border: `1.5px solid ${form.payment_model === opt.value ? accent : statusColors.neutral300}`,
                      backgroundColor: form.payment_model === opt.value ? accent : 'white',
                      color: form.payment_model === opt.value ? 'white' : statusColors.neutral600,
                      fontSize: typography.sizes.xs, fontWeight: typography.weights.medium,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hybrid: company cap per person */}
            {form.payment_model === 'hybrid' && (
              <div>
                <label style={labelStyle}>How much will the company cover per person? *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                  <span style={{ fontSize: typography.sizes.base, color: statusColors.neutral600 }}>$</span>
                  <input type="number" placeholder="15.00" min="1" step="0.50"
                    value={form.company_max_per_attendee}
                    onChange={(e) => updateField('company_max_per_attendee', e.target.value)}
                    style={{ ...inputStyle, width: 120 }}
                    required />
                  <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>per person</span>
                </div>
                <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                  Each attendee gets one item up to this amount on the company. Additional items are paid by the individual.
                </p>
              </div>
            )}

            {/* Vendor categories — what types are you looking for */}
            <div>
              <label style={labelStyle}>
                What types of {isFM ? 'vendors' : 'food'} are you looking for?
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'] }}>
                {(isFM ? [...CATEGORIES] : [...FOOD_TRUCK_CATEGORIES]).map(cat => {
                  const selected = form.preferred_vendor_categories.includes(cat)
                  return (
                    <button key={cat} type="button"
                      onClick={() => setForm(prev => ({
                        ...prev,
                        preferred_vendor_categories: selected
                          ? prev.preferred_vendor_categories.filter(c => c !== cat)
                          : [...prev.preferred_vendor_categories, cat]
                      }))}
                      style={{
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        borderRadius: radius.full,
                        border: `1.5px solid ${selected ? accent : statusColors.neutral300}`,
                        backgroundColor: selected ? accent : 'white',
                        color: selected ? 'white' : statusColors.neutral600,
                        fontSize: typography.sizes.xs,
                        fontWeight: selected ? typography.weights.semibold : typography.weights.normal,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {selected ? '✓ ' : ''}{cat}
                    </button>
                  )
                })}
              </div>
              <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                Select all that interest you — helps us find the best matches
              </p>
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
        {submitting ? t('erf.submitting', locale) : term(vertical, 'event_submit_button', locale)}
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
        {t('erf.footer_text', locale)}
      </p>
    </form>
  )
}
