'use client'

import { useState, useEffect } from 'react'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { CATEGORIES, FOOD_TRUCK_CATEGORIES } from '@/lib/constants'

interface EventRequestFormProps {
  vertical: string
  vendorPreference?: string | null
  // Server-computed average max_headcount_per_wave from the event-approved
  // vendor pool. Used by the capacity layer of the vendor_count suggestion.
  avgVendorThroughput: number
  // Server-computed average distinct categories per vendor in the pool.
  // Used by the variety layer — accounts for multi-category vendors so the
  // suggestion doesn't demand 1 vendor per cuisine the organizer picks.
  avgCategoriesPerVendor: number
  // Size of the pool used to compute averages. Drives helper text wording.
  vendorPoolSize: number
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
  event_setting: string
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

// Injected once at form root — collapses 2-col / 3-col grids to single column
// on phone widths. The form is otherwise inline-styled (no CSS framework here),
// so this is the smallest pattern that gives us a real mobile breakpoint.
const FORM_RESPONSIVE_CSS = `
  @media (max-width: 600px) {
    .event-row-2col, .event-row-3col {
      grid-template-columns: 1fr !important;
    }
  }
`

export function EventRequestForm({ vertical, vendorPreference, avgVendorThroughput, avgCategoriesPerVendor, vendorPoolSize }: EventRequestFormProps) {
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
    event_setting: '',
    cuisine_preferences: '',
    dietary_restrictions: [],
    dietary_other: '',
    budget_notes: '',
    beverages_provided: false,
    dessert_provided: false,
    vendor_count: '',
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
  // Track whether the user has manually edited vendor_count so the auto-suggest
  // useEffect doesn't overwrite their value when other fields change.
  const [vendorCountManuallyEdited, setVendorCountManuallyEdited] = useState(false)
  // Tracks the system's computed suggestion separately from form.vendor_count.
  // Helper text reads from this so it doesn't follow the user's manual edits.
  const [systemSuggested, setSystemSuggested] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: keyof FormData, value: string) {
    if (field === 'vendor_count') setVendorCountManuallyEdited(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // Layered vendor_count suggestion. See session75_event_consolidated_plan.md
  // and the formula write-up for full reasoning. Layers:
  //   1. Demand:    estimatedOrders = headcount × buyerRate (event_type-driven)
  //   2. Timing:    numWaves = ceil(eventMinutes / 30)
  //   3. Peak load: peakLoadPerWave varies by event_type's demand profile
  //                 (concentrated lunch/party vs sustained team_building vs spread crowd)
  //   4. Capacity:  capacityVendors = ceil(peakLoadPerWave / avgVendorThroughput)
  //   5. Variety:   categoryVendors = ceil(numCategories / avgCategoriesPerVendor)
  //                 — multi-category-aware so we don't blindly demand 1 per cuisine
  //   6. Combine:   suggested = clamp(max(capacity, variety), 1, 20)
  useEffect(() => {
    if (!form.event_type || !form.headcount) {
      setSystemSuggested(null)
      return
    }
    const headcount = parseInt(form.headcount, 10)
    if (isNaN(headcount) || headcount < 1) {
      setSystemSuggested(null)
      return
    }

    // Layer 1 — buyer rate by event_type
    let buyerRate = 0.6
    switch (form.event_type) {
      case 'corporate_lunch':
      case 'team_building':
        buyerRate = 1.0
        break
      case 'private_party':
        buyerRate = 0.9
        break
      case 'grand_opening':
      case 'festival':
        buyerRate = 0.2
        break
      default:
        buyerRate = 0.6
    }
    const estimatedOrders = Math.round(headcount * buyerRate)

    // Layer 2 — wave count from times (else assume 2hr / 4 waves)
    let numWaves = 4
    if (form.event_start_time && form.event_end_time) {
      const sParts = form.event_start_time.split(':').map(Number)
      const eParts = form.event_end_time.split(':').map(Number)
      if (sParts.length >= 2 && eParts.length >= 2 && !sParts.some(isNaN) && !eParts.some(isNaN)) {
        const minutes = (eParts[0] * 60 + eParts[1]) - (sParts[0] * 60 + sParts[1])
        if (minutes > 0) numWaves = Math.max(1, Math.ceil(minutes / 30))
      }
    }

    // Layer 3 — peak load per wave by demand profile
    let peakLoadPerWave: number
    if (form.event_type === 'corporate_lunch' || form.event_type === 'private_party' || form.event_type === 'other') {
      // CONCENTRATED: ~50% of orders compress into a single peak 30-min wave
      peakLoadPerWave = estimatedOrders * 0.5
    } else if (form.event_type === 'team_building') {
      // SUSTAINED: 50% of orders cluster in peak ~25% of event
      const peakWaves = Math.max(1, Math.ceil(numWaves * 0.25))
      peakLoadPerWave = (estimatedOrders * 0.5) / peakWaves
    } else {
      // SPREAD (grand_opening, festival): foot traffic distributed evenly
      peakLoadPerWave = estimatedOrders / numWaves
    }

    // Layer 4 — capacity-driven vendor count
    const capacityVendors = Math.ceil(peakLoadPerWave / Math.max(1, avgVendorThroughput))

    // Layer 5 — variety floor (multi-category-aware)
    const numCategories = form.preferred_vendor_categories.length
    const categoryVendors = numCategories > 0
      ? Math.max(1, Math.ceil(numCategories / Math.max(1, avgCategoriesPerVendor)))
      : 0

    // Layer 6 — combine, clamp to [1, 20]
    const suggested = Math.max(1, Math.min(20, Math.max(capacityVendors, categoryVendors)))

    setSystemSuggested(suggested)

    // Pre-fill the input only when user hasn't manually edited yet
    if (!vendorCountManuallyEdited) {
      // queueMicrotask defers the state update out of the render-effect
      // synchronous path — same pattern as P1-6 in OrganizerEventDetails.tsx
      queueMicrotask(() => {
        setForm(prev => ({ ...prev, vendor_count: String(suggested) }))
      })
    }
  }, [
    form.event_type,
    form.headcount,
    form.event_start_time,
    form.event_end_time,
    form.preferred_vendor_categories,
    avgVendorThroughput,
    avgCategoriesPerVendor,
    vendorCountManuallyEdited,
  ])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    // Validate required fields. Address is OPTIONAL at Stage 1 (per design); it
    // becomes required at the dashboard side / for status to advance to 'approved'.
    if (
      !form.company_name.trim() ||
      !form.contact_name.trim() ||
      !form.contact_email.trim() ||
      !form.event_type ||
      !form.event_date ||
      !form.event_start_time ||
      !form.event_end_time ||
      !form.headcount ||
      !form.city.trim() ||
      !form.state.trim() ||
      !form.zip.trim() ||
      !form.event_setting ||
      form.preferred_vendor_categories.length === 0
    ) {
      setError(t('erf.required_fields', locale))
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      setError(t('erf.invalid_email', locale))
      return
    }

    // Validate end_time > start_time
    {
      const sParts = form.event_start_time.split(':').map(Number)
      const eParts = form.event_end_time.split(':').map(Number)
      if (sParts.length >= 2 && eParts.length >= 2 && !sParts.some(isNaN) && !eParts.some(isNaN)) {
        if (eParts[0] * 60 + eParts[1] <= sParts[0] * 60 + sParts[1]) {
          setError('Event end time must be after start time.')
          return
        }
      }
    }

    const hc = parseInt(form.headcount, 10)
    if (isNaN(hc) || hc < 10 || hc > 5000) {
      setError(t('erf.headcount_range', locale))
      return
    }

    // Validate hybrid payment cap when hybrid is selected (hybrid is currently
    // hidden from PAYMENT_MODELS — kept for future build-out).
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
          // Stage 1: address is optional; send as null when empty so admin gate
          // for 'approved' status can detect it's missing. City/state/zip are
          // required and trimmed as before.
          address: form.address.trim() || null,
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          // event_setting (indoor/outdoor/either) — separate from setup_instructions
          // free-text. Was previously misused as the same column.
          event_setting: form.event_setting,
          cuisine_preferences: form.preferred_vendor_categories.length > 0 ? form.preferred_vendor_categories.join(', ') : (form.cuisine_preferences.trim() || null),
          dietary_notes: [...form.dietary_restrictions, ...(form.dietary_other.trim() ? [form.dietary_other.trim()] : [])].join(', ') || null,
          budget_notes: form.budget_notes.trim() || null,
          beverages_provided: form.beverages_provided,
          dessert_provided: form.dessert_provided,
          vendor_count: form.vendor_count || null,
          // Free-text setup notes — Stage 2 dashboard collects this.
          setup_instructions: null,
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
      <style dangerouslySetInnerHTML={{ __html: FORM_RESPONSIVE_CSS }} />
      {/* Quick-Start: Company & Contact */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Tell us about your event</h3>
        <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400, margin: `0 0 ${spacing.sm}`, lineHeight: 1.5 }}>
          Start with the basics — you can add more details from your event dashboard after signing in.
        </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {/* Event type — sets context for downstream matching (deal-breakers, buyer rate, kid bonuses, etc.) */}
            <div>
              <label style={labelStyle}>What kind of event is this? *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'] }}>
                {EVENT_TYPES.map(et => {
                  const selected = form.event_type === et.value
                  return (
                    <button key={et.value} type="button"
                      onClick={() => updateField('event_type', et.value)}
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
                      {selected ? '✓ ' : ''}{et.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Company + Contact */}
            <div>
              <label style={labelStyle}>Your name *</label>
              <input type="text" placeholder="Full name" value={form.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)} style={inputStyle} required />
            </div>
            <div className="event-row-2col" style={rowStyle}>
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

            {/* Event date + headcount */}
            <div className="event-row-2col" style={rowStyle}>
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

            {/* Event start + end time — required for capacity, wave generation, and lunch detection */}
            <div className="event-row-2col" style={rowStyle}>
              <div>
                <label style={labelStyle}>Start time *</label>
                <input type="time" value={form.event_start_time}
                  onChange={(e) => updateField('event_start_time', e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>End time *</label>
                <input type="time" value={form.event_end_time}
                  onChange={(e) => updateField('event_end_time', e.target.value)} style={inputStyle} required />
              </div>
            </div>

            {/* Location: city + state + zip */}
            <div className="event-row-3col" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: spacing.sm }}>
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
              <div>
                <label style={labelStyle}>Zip *</label>
                <input type="text" placeholder="79111" maxLength={10} value={form.zip}
                  onChange={(e) => updateField('zip', e.target.value)} style={inputStyle} required />
              </div>
            </div>

            {/* Address — Stage 1 optional, required before event approval */}
            <div>
              <label style={labelStyle}>Street address</label>
              <input type="text" placeholder="123 Main St" value={form.address}
                onChange={(e) => updateField('address', e.target.value)} style={inputStyle} />
              <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                Recommended now; required before your event can be approved
              </p>
            </div>

            {/* Event setting (indoor/outdoor/either) — separate column from setup_instructions free-text */}
            <div>
              <label style={labelStyle}>Event setting *</label>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                {[
                  { value: 'outdoor', label: 'Outdoor' },
                  { value: 'indoor', label: 'Indoor' },
                  { value: 'either', label: 'Either / Both' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => updateField('event_setting', opt.value)}
                    style={{
                      flex: 1, padding: spacing['2xs'],
                      borderRadius: radius.md,
                      border: `1.5px solid ${form.event_setting === opt.value ? accent : statusColors.neutral300}`,
                      backgroundColor: form.event_setting === opt.value ? accent : 'white',
                      color: form.event_setting === opt.value ? 'white' : statusColors.neutral600,
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

            {/* Vendor count — auto-suggested from event_type + headcount + times +
                category coverage + vendor pool throughput. Helper text reads from
                systemSuggested (separate from form.vendor_count) so it doesn't follow
                user manual edits. */}
            <div>
              <label style={labelStyle}>How many vendors do you want?</label>
              <input type="number" min={1} max={20} value={form.vendor_count}
                onChange={(e) => updateField('vendor_count', e.target.value)}
                style={{ ...inputStyle, maxWidth: 120 }} />
              <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                {systemSuggested == null ? (
                  'Pick an event type and headcount above and we’ll suggest a starting number.'
                ) : (
                  <>
                    {(() => {
                      const catCount = form.preferred_vendor_categories.length
                      const catUnit = catCount === 1
                        ? term(vertical, 'event_preference_unit_singular')
                        : term(vertical, 'event_preference_unit_plural')
                      const vendorWord = term(vertical, 'vendors').toLowerCase()
                      const throughputPhrase = isFM
                        ? `avg ${avgVendorThroughput} orders per vendor`
                        : `avg ${avgVendorThroughput} orders / 30-min wave`
                      return vendorPoolSize > 0
                        ? `Based on ${form.headcount} ${parseInt(form.headcount, 10) === 1 ? 'attendee' : 'attendees'} and ${catCount} ${catUnit} at a ${form.event_type.replace('_', ' ')} event, balanced against our ${vendorPoolSize} event-approved ${vendorWord} (${throughputPhrase}, avg ${avgCategoriesPerVendor.toFixed(1)} ${term(vertical, 'event_preference_unit_plural')} per vendor), we suggest `
                        : `For a ${form.headcount}-person ${form.event_type.replace('_', ' ')} event with ${catCount} ${catUnit}, we suggest `
                    })()}
                    <strong>{systemSuggested} {systemSuggested === 1 ? 'vendor' : 'vendors'}</strong>
                    {form.vendor_count && parseInt(form.vendor_count, 10) !== systemSuggested
                      ? ` — you’re using ${form.vendor_count}.`
                      : '. Adjust if needed.'}
                  </>
                )}
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
