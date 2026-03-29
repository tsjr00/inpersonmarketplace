'use client'

import { useState } from 'react'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

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
  competing_food_options: string
  is_ticketed: boolean
  estimated_dwell_hours: string
  address: string
  city: string
  state: string
  zip: string
  cuisine_preferences: string
  dietary_notes: string
  budget_notes: string
  beverages_provided: boolean
  dessert_provided: boolean
  vendor_count: string
  setup_instructions: string
  additional_notes: string
  is_recurring: boolean
  recurring_frequency: string
  service_level: string
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
  { value: 'hybrid', label: 'Company covers a base meal, individuals can upgrade' },
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
  // Vendor search/select state (for "I'll choose" path)
  const [vendorSearchMode, setVendorSearchMode] = useState<'recommend' | 'choose'>('recommend')
  const [vendorSearch, setVendorSearch] = useState('')
  const [vendorResults, setVendorResults] = useState<Array<{
    id: string; business_name: string; cuisine_categories: string[]
    avg_price_cents: number | null; average_rating: number | null
    rating_count: number; pickup_lead_minutes: number; catering_item_count: number
  }>>([])
  const [selectedVendors, setSelectedVendors] = useState<Array<{ id: string; name: string }>>([])
  const [vendorSearchLoading, setVendorSearchLoading] = useState(false)
  const [vendorSearchTimer, setVendorSearchTimer] = useState<NodeJS.Timeout | null>(null)

  // Debounced vendor search
  function handleVendorSearch(q: string) {
    setVendorSearch(q)
    if (vendorSearchTimer) clearTimeout(vendorSearchTimer)
    if (q.trim().length < 2) {
      setVendorResults([])
      return
    }
    const timer = setTimeout(async () => {
      setVendorSearchLoading(true)
      try {
        const res = await fetch(`/api/event-approved-vendors?vertical=${vertical}&q=${encodeURIComponent(q.trim())}`)
        if (res.ok) {
          const data = await res.json()
          // Filter out already-selected vendors
          setVendorResults((data.vendors || []).filter(
            (v: { id: string }) => !selectedVendors.some(sv => sv.id === v.id)
          ))
        }
      } catch { /* silent */ }
      setVendorSearchLoading(false)
    }, 300)
    setVendorSearchTimer(timer)
  }

  function addVendor(vendor: { id: string; business_name: string }) {
    if (selectedVendors.length >= 10) return
    if (selectedVendors.some(v => v.id === vendor.id)) return
    setSelectedVendors(prev => [...prev, { id: vendor.id, name: vendor.business_name }])
    setVendorSearch('')
    setVendorResults([])
  }

  function removeVendor(vendorId: string) {
    setSelectedVendors(prev => prev.filter(v => v.id !== vendorId))
  }

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
    competing_food_options: '',
    is_ticketed: false,
    estimated_dwell_hours: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    cuisine_preferences: '',
    dietary_notes: '',
    budget_notes: '',
    beverages_provided: false,
    dessert_provided: false,
    vendor_count: '2',
    setup_instructions: '',
    additional_notes: vendorPreference ? `Preferred vendor: ${vendorPreference}` : '',
    is_recurring: false,
    recurring_frequency: '',
    service_level: 'self_service',
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
          competing_food_options: form.competing_food_options.trim() || null,
          is_ticketed: form.is_ticketed,
          estimated_dwell_hours: form.estimated_dwell_hours ? parseFloat(form.estimated_dwell_hours) : null,
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          cuisine_preferences: form.cuisine_preferences.trim() || null,
          dietary_notes: form.dietary_notes.trim() || null,
          budget_notes: form.budget_notes.trim() || null,
          beverages_provided: form.beverages_provided,
          dessert_provided: form.dessert_provided,
          vendor_count: form.vendor_count || null,
          setup_instructions: form.setup_instructions.trim() || null,
          additional_notes: form.additional_notes.trim() || null,
          is_recurring: form.is_recurring,
          recurring_frequency: form.is_recurring ? form.recurring_frequency || null : null,
          service_level: form.service_level || 'self_service',
          vendor_preferences: selectedVendors.length > 0
            ? selectedVendors.map((v, i) => ({ vendor_id: v.id, priority: i + 1 }))
            : null,
        }),
      })

      if (!res.ok) {
        const result = await res.json()
        setError(result.error || t('erf.submit_failed', locale))
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError(t('erf.network_error', locale))
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
          {t('erf.success_title', locale)}
        </p>
        <p
          style={{
            fontSize: typography.sizes.sm,
            color: statusColors.neutral600,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {t('erf.success_msg', locale, { details: term(vertical, 'event_success_message', locale) })}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Section: Service Level */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>How can we help?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {getServiceLevels(vertical).map((sl) => (
            <label
              key={sl.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.xs,
                padding: spacing.sm,
                border: `2px solid ${form.service_level === sl.value ? accent : statusColors.neutral200}`,
                borderRadius: radius.md,
                cursor: 'pointer',
                backgroundColor: form.service_level === sl.value ? `${accent}08` : 'transparent',
                transition: 'border-color 0.2s',
              }}
            >
              <input
                type="radio"
                name="service_level"
                value={sl.value}
                checked={form.service_level === sl.value}
                onChange={(e) => updateField('service_level', e.target.value)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>
                  {sl.label}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginTop: 2, lineHeight: 1.5 }}>
                  {sl.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Section: Vendor Selection (self-service only) */}
      {form.service_level === 'self_service' && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Vendor Preference</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                fontSize: typography.sizes.sm, color: statusColors.neutral700, cursor: 'pointer',
              }}>
                <input type="radio" name="vendor_search_mode" value="recommend"
                  checked={vendorSearchMode === 'recommend'}
                  onChange={() => setVendorSearchMode('recommend')} />
                {vertical === 'farmers_market' ? 'Recommend vendors for me based on my event details' : 'Recommend trucks for me based on my event details'}
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                fontSize: typography.sizes.sm, color: statusColors.neutral700, cursor: 'pointer',
              }}>
                <input type="radio" name="vendor_search_mode" value="choose"
                  checked={vendorSearchMode === 'choose'}
                  onChange={() => setVendorSearchMode('choose')} />
                {vertical === 'farmers_market' ? 'I want to choose specific vendors' : 'I want to choose specific trucks'}
              </label>
            </div>

            {vendorSearchMode === 'choose' && (
              <div>
                <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.xs}`, lineHeight: 1.5 }}>
                  {vertical === 'farmers_market'
                    ? 'Search for vendors by name or product type. Select up to 10 in your preferred priority order. We\u2019ll reach out to your top choices first.'
                    : 'Search for food trucks by name or cuisine type. Select up to 10 in your preferred priority order. We\u2019ll reach out to your top choices first.'}
                </p>

                {/* Search input */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder={vertical === 'farmers_market' ? 'Search by vendor name or product type...' : 'Search by truck name or cuisine...'}
                    value={vendorSearch}
                    onChange={(e) => handleVendorSearch(e.target.value)}
                    style={inputStyle}
                  />
                  {vendorSearchLoading && (
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                      Searching...
                    </span>
                  )}

                  {/* Search results dropdown */}
                  {vendorResults.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                      backgroundColor: 'white', border: `1px solid ${statusColors.neutral300}`,
                      borderRadius: radius.md, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      maxHeight: 240, overflowY: 'auto',
                    }}>
                      {vendorResults.map(v => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => addVendor(v)}
                          style={{
                            width: '100%', padding: `${spacing.xs} ${spacing.sm}`,
                            backgroundColor: 'transparent', border: 'none', borderBottom: `1px solid ${statusColors.neutral100}`,
                            cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>
                              {v.business_name}
                            </div>
                            <div style={{ fontSize: 11, color: statusColors.neutral500 }}>
                              {v.cuisine_categories.join(', ') || 'Various'}
                              {v.avg_price_cents ? ` \u2022 ~$${(v.avg_price_cents / 100).toFixed(0)}/meal` : ''}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: statusColors.neutral400, textAlign: 'right' }}>
                            {v.average_rating ? `${v.average_rating.toFixed(1)}\u2605` : ''}
                            {v.pickup_lead_minutes <= 15 ? ' \u26A1' : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected vendors list */}
                {selectedVendors.length > 0 && (
                  <div style={{ marginTop: spacing.xs }}>
                    <div style={{ fontSize: 11, fontWeight: typography.weights.semibold, color: statusColors.neutral500, marginBottom: spacing['3xs'] }}>
                      YOUR SELECTIONS ({selectedVendors.length}/10) — in priority order
                    </div>
                    {selectedVendors.map((v, i) => (
                      <div key={v.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: statusColors.neutral50,
                        border: `1px solid ${statusColors.neutral200}`,
                        borderRadius: radius.sm,
                        marginBottom: spacing['3xs'],
                      }}>
                        <span style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700 }}>
                          <strong style={{ color: accent }}>{i + 1}.</strong> {v.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeVendor(v.id)}
                          style={{
                            backgroundColor: 'transparent', border: 'none',
                            color: statusColors.neutral400, cursor: 'pointer', fontSize: typography.sizes.lg, lineHeight: 1, padding: 0,
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section: Company & Contact */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t('erf.section_contact', locale)}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>{t('erf.company_name', locale)}</label>
            <input
              type="text"
              placeholder={t('erf.company_placeholder', locale)}
              value={form.company_name}
              onChange={(e) => updateField('company_name', e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>{t('erf.contact_name', locale)}</label>
              <input
                type="text"
                placeholder={t('erf.contact_placeholder', locale)}
                value={form.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{t('erf.email', locale)}</label>
              <input
                type="email"
                placeholder={t('erf.email_placeholder', locale)}
                value={form.contact_email}
                onChange={(e) => updateField('contact_email', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>{t('erf.phone', locale)}</label>
            <input
              type="tel"
              placeholder={t('erf.phone_placeholder', locale)}
              value={form.contact_phone}
              onChange={(e) => updateField('contact_phone', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Section: Event Type & Payment */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Event Type</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>What type of event is this? *</label>
            <select
              value={form.event_type}
              onChange={(e) => updateField('event_type', e.target.value)}
              style={{ ...inputStyle, backgroundColor: 'white', cursor: 'pointer' }}
              required
            >
              <option value="">Select event type...</option>
              {EVENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Who will be paying for food? *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
              {PAYMENT_MODELS.map((pm) => (
                <label key={pm.value} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  fontSize: typography.sizes.sm,
                  color: statusColors.neutral700,
                  cursor: 'pointer',
                  padding: `${spacing['3xs']} 0`,
                }}>
                  <input
                    type="radio"
                    name="payment_model"
                    value={pm.value}
                    checked={form.payment_model === pm.value}
                    onChange={(e) => updateField('payment_model', e.target.value)}
                    style={{ margin: 0 }}
                  />
                  {pm.label}
                </label>
              ))}
            </div>
          </div>
          {/* Budget — only for company_paid or hybrid */}
          {/* Budget — only for company_paid or hybrid. Dual fields: enter one, the other auto-calculates */}
          {(form.payment_model === 'company_paid' || form.payment_model === 'hybrid') && (
            <div>
              <label style={labelStyle}>
                {vertical === 'farmers_market' ? 'Vendor budget (enter either total or per-vendor)' : 'Food budget (enter either total or per-meal)'}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
                <div>
                  <input
                    type="number"
                    placeholder="Total budget (e.g., 2500)"
                    min="0"
                    step="0.01"
                    value={form.total_food_budget}
                    disabled={!!form.per_meal_budget}
                    onChange={(e) => setForm(prev => ({ ...prev, total_food_budget: e.target.value, per_meal_budget: '' }))}
                    style={{ ...inputStyle, opacity: form.per_meal_budget ? 0.5 : 1 }}
                  />
                  <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: 10, color: statusColors.neutral400 }}>
                    Total budget ($)
                  </p>
                </div>
                <div>
                  <input
                    type="number"
                    placeholder={vertical === 'farmers_market' ? 'Per vendor (e.g., 200)' : 'Per meal (e.g., 15)'}
                    min="0"
                    step="0.01"
                    value={form.per_meal_budget}
                    disabled={!!form.total_food_budget}
                    onChange={(e) => setForm(prev => ({ ...prev, per_meal_budget: e.target.value, total_food_budget: '' }))}
                    style={{ ...inputStyle, opacity: form.total_food_budget ? 0.5 : 1 }}
                  />
                  <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: 10, color: statusColors.neutral400 }}>
                    {vertical === 'farmers_market' ? 'Per-vendor budget ($)' : 'Per-meal budget ($)'}
                  </p>
                </div>
              </div>
              <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                Helps us match vendors that fit your budget
              </p>
            </div>
          )}
          <div>
            <label style={labelStyle}>Is this a recurring event?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], fontSize: typography.sizes.sm, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.is_recurring}
                  onChange={(e) => setForm(prev => ({ ...prev, is_recurring: e.target.checked, recurring_frequency: e.target.checked ? prev.recurring_frequency : '' }))}
                />
                Yes, this is recurring
              </label>
              {form.is_recurring && (
                <select
                  value={form.recurring_frequency}
                  onChange={(e) => updateField('recurring_frequency', e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 140, cursor: 'pointer', backgroundColor: 'white' }}
                >
                  <option value="">How often?</option>
                  {RECURRING_OPTIONS.map((ro) => (
                    <option key={ro.value} value={ro.value}>{ro.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section: Event Details */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t('erf.section_event', locale)}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>{t('erf.event_date', locale)}</label>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => updateField('event_date', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{t('erf.end_date', locale)}</label>
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
              <label style={labelStyle}>{t('erf.start_time', locale)}</label>
              <input
                type="time"
                value={form.event_start_time}
                onChange={(e) => updateField('event_start_time', e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('erf.end_time', locale)}</label>
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
              <label style={labelStyle}>{t('erf.headcount', locale)}</label>
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
                {t('erf.min_people', locale)}
              </p>
            </div>
            <div>
              <label style={labelStyle}>
                {vertical === 'farmers_market' ? 'Expected buyers / shoppers' : 'Expected food orders'}
              </label>
              <input
                type="number"
                placeholder={form.headcount || '50'}
                min="1"
                max="5000"
                value={form.expected_meal_count}
                onChange={(e) => updateField('expected_meal_count', e.target.value)}
                style={inputStyle}
              />
              <p
                style={{
                  margin: `${spacing['3xs']} 0 0`,
                  fontSize: typography.sizes.xs,
                  color: statusColors.neutral400,
                }}
              >
                {vertical === 'farmers_market'
                  ? 'How many attendees do you expect to browse and shop?'
                  : 'May differ from guest count — not everyone orders at every event'}
              </p>
            </div>
          </div>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>{term(vertical, 'event_vendor_count_label', locale)}</label>
              <select
                value={form.vendor_count}
                onChange={(e) => updateField('vendor_count', e.target.value)}
                style={{ ...inputStyle, backgroundColor: 'white', cursor: 'pointer' }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} {term(vertical, 'event_vendor_unit', locale)}{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Location */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t('erf.section_location', locale)}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>{t('erf.street', locale)}</label>
            <input
              type="text"
              placeholder={t('erf.street_placeholder', locale)}
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: spacing.sm }}>
            <div>
              <label style={labelStyle}>{t('erf.city', locale)}</label>
              <input
                type="text"
                placeholder={t('erf.city_placeholder', locale)}
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{t('erf.state', locale)}</label>
              <input
                type="text"
                placeholder={t('erf.state_placeholder', locale)}
                maxLength={2}
                value={form.state}
                onChange={(e) => updateField('state', e.target.value.toUpperCase())}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{t('erf.zip', locale)}</label>
              <input
                type="text"
                placeholder={t('erf.zip_placeholder', locale)}
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
        <h3 style={sectionTitleStyle}>{t('erf.section_prefs', locale)}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>{term(vertical, 'event_preference_label', locale)}</label>
            <input
              type="text"
              placeholder={term(vertical, 'event_preference_placeholder', locale)}
              value={form.cuisine_preferences}
              onChange={(e) => updateField('cuisine_preferences', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('erf.dietary', locale)}</label>
            <input
              type="text"
              placeholder={t('erf.dietary_placeholder', locale)}
              value={form.dietary_notes}
              onChange={(e) => updateField('dietary_notes', e.target.value)}
              style={inputStyle}
            />
          </div>
          {/* Menu planning — food-specific, only for food trucks */}
          {vertical === 'food_trucks' && (
            <div>
              <label style={labelStyle}>Menu planning</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.sizes.sm, color: statusColors.neutral700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.beverages_provided}
                    onChange={(e) => setForm(prev => ({ ...prev, beverages_provided: e.target.checked }))}
                  />
                  Beverages will be provided separately (not from food vendors)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.sizes.sm, color: statusColors.neutral700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.dessert_provided}
                    onChange={(e) => setForm(prev => ({ ...prev, dessert_provided: e.target.checked }))}
                  />
                  Dessert will be provided separately
                </label>
              </div>
            </div>
          )}
          <div>
            <label style={labelStyle}>
              {vertical === 'farmers_market'
                ? 'Are there other vendors or shopping options at the venue?'
                : 'Are there other food options at the venue?'}
            </label>
            <input
              type="text"
              placeholder={vertical === 'farmers_market'
                ? 'e.g., retail stores, other vendor markets, craft fairs'
                : 'e.g., cafeteria, nearby restaurants, other catering'}
              value={form.competing_food_options}
              onChange={(e) => updateField('competing_food_options', e.target.value)}
              style={inputStyle}
            />
            <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
              Helps us estimate how many people are likely to order
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.sizes.sm, color: statusColors.neutral700, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_ticketed}
                onChange={(e) => setForm(prev => ({ ...prev, is_ticketed: e.target.checked }))}
              />
              This is a ticketed event
            </label>
          </div>
          {(form.event_type === 'grand_opening' || form.event_type === 'festival') && (
            <div>
              <label style={labelStyle}>How long do attendees typically stay? (hours)</label>
              <input
                type="number"
                placeholder="e.g., 3"
                min="0.5"
                max="24"
                step="0.5"
                value={form.estimated_dwell_hours}
                onChange={(e) => updateField('estimated_dwell_hours', e.target.value)}
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <label style={labelStyle}>Additional budget or pricing notes</label>
            <input
              type="text"
              placeholder="Any other details about budget expectations or constraints"
              value={form.budget_notes}
              onChange={(e) => updateField('budget_notes', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Section: Setup & Notes */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>{t('erf.section_setup', locale)}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <div>
            <label style={labelStyle}>{t('erf.setup_label', locale)}</label>
            <textarea
              placeholder={vertical === 'food_trucks' ? t('erf.setup_ft_placeholder', locale) : t('erf.setup_fm_placeholder', locale)}
              value={form.setup_instructions}
              onChange={(e) => updateField('setup_instructions', e.target.value)}
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('erf.anything_else', locale)}</label>
            <textarea
              placeholder={t('erf.anything_placeholder', locale)}
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
