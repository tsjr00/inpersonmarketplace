'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { CATEGORIES, FOOD_TRUCK_CATEGORIES } from '@/lib/constants'
import {
  MIN_EVENT_LEAD_DAYS,
  earliestBookableDate,
  eventLeadDays,
  leadTimeStatus,
  rushedWarning,
  tooSoonMessage,
} from '@/lib/events/lead-time'
import { calculateWaveCount, estimateOrders, expectedPeakOrdersPerWave, suggestVendorCount } from '@/lib/events/demand-model'

interface EventRequestFormProps {
  vertical: string
  vendorPreference?: string | null | undefined
  // Server-computed average max_headcount_per_wave from the event-approved
  // vendor pool. Used by the capacity layer of the vendor_count suggestion.
  poolCapacityPerWave: number
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

export function EventRequestForm({ vertical, vendorPreference, poolCapacityPerWave, avgCategoriesPerVendor, vendorPoolSize }: EventRequestFormProps) {
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
  // NOTE: the system's suggestion is NOT state — it is derived below via
  // useMemo. Helper text reads it directly, so it stays independent of the
  // user's manual edits to form.vendor_count.
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // null = matching never ran for this submission (full-service, or self-service
  // with no address yet). 0 = matching ran and found nobody. The two must not be
  // collapsed — see the note on `match_count` in api/event-requests.
  const [matchCount, setMatchCount] = useState<number | null>(null)

  // Ticked only when the chosen date falls inside the rushed window. Reset
  // whenever the date changes, so moving from one rushed date to another asks
  // again rather than carrying a stale agreement forward.
  const [rushedAck, setRushedAck] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The red box sits just above the submit button; on a phone the user may be
  // scrolled elsewhere when it appears. Bring it into view (owner 2026-08-26:
  // iPhone submit "did nothing" — a silent block is worse than a loud one).
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  function updateField(field: keyof FormData, value: string) {
    if (field === 'vendor_count') setVendorCountManuallyEdited(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // vendor_count suggestion — the SHARED demand model (lib/events/demand-model.ts,
  // owner 2026-08-26; replaced this form's private event-type rate table and its
  // "half of all orders in one wave" placeholder):
  //   1. Orders:    organizer's expected_meal_count, else headcount × the reviewed
  //                 band (payment model + lunch/not + ticketed; competing food → low end)
  //   2. Waves:     ceil(eventMinutes / 30)
  //   3. Peak:      orders/waves × (1 + PEAK_WAVE_MARGIN)
  //   4. Capacity:  ceil(peak / pool MEDIAN per-wave capacity)
  //   5. Variety:   ceil(numCategories / avgCategoriesPerVendor)
  //   6. Combine:   clamp(max(capacity, variety), 1, 20)
  // The real check happens at selection time against accepted vendors' claims.
  //
  // Split into a derivation + a side effect on 2026-08-08. It was one effect
  // that both computed this number into state AND pre-filled form.vendor_count,
  // which tripped `react-hooks/set-state-in-effect` (a real lint ERROR, not a
  // warning). The number is a pure function of the inputs below, so it is now
  // derived during render; only the pre-fill — an actual side effect that
  // writes OTHER state — remains an effect. No formula changed.
  const systemSuggested = useMemo<number | null>(() => {
    if (!form.event_type || !form.headcount) return null
    const headcount = parseInt(form.headcount, 10)
    if (isNaN(headcount) || headcount < 1) return null
    // Shared demand model (lib/events/demand-model.ts, owner 2026-08-26):
    // organizer's expected buyers if given, else headcount × the reviewed
    // rate band (payment model + lunch/not + ticketed; competing food → low
    // end); peak wave = average × (1 + PEAK_WAVE_MARGIN); capacity need vs
    // the pool MEDIAN per-wave capacity; variety need vs cuisines asked for.
    const expectedMeals = form.expected_meal_count ? parseInt(form.expected_meal_count, 10) : null
    const demand = estimateOrders({
      headcount,
      expectedMealCount: expectedMeals && expectedMeals > 0 ? expectedMeals : null,
      paymentModel: form.payment_model || null,
      eventType: form.event_type,
      startTime: form.event_start_time || null,
      isTicketed: form.is_ticketed,
      hasCompetingFood: form.has_competing_vendors,
    })
    const waves = calculateWaveCount(form.event_start_time || null, form.event_end_time || null)
    const peak = expectedPeakOrdersPerWave(demand.orders, waves)
    return suggestVendorCount({
      peakOrdersPerWave: peak,
      capacityPerWave: poolCapacityPerWave,
      categoryCount: form.preferred_vendor_categories.length,
      avgCategoriesPerVendor,
    }).suggested
  }, [
    form.event_type,
    form.headcount,
    form.expected_meal_count,
    form.payment_model,
    form.is_ticketed,
    form.has_competing_vendors,
    form.event_start_time,
    form.event_end_time,
    form.preferred_vendor_categories,
    poolCapacityPerWave,
    avgCategoriesPerVendor,
  ])

  // The side effect half: pre-fill the visible input, but only until the user
  // takes it over. `vendorCountManuallyEdited` is a dependency here and NOT of
  // the memo above — the suggestion itself never depends on whether the user
  // has typed, only on whether we're still allowed to apply it.
  //
  // Keyed on `systemSuggested` rather than the raw inputs: when an input moves
  // but the suggestion lands on the same number, the old code re-wrote the same
  // value (a no-op) and this simply doesn't fire. The null guard preserves the
  // old early-return — no event type yet means don't touch vendor_count at all.
  useEffect(() => {
    if (systemSuggested == null || vendorCountManuallyEdited) return
    // queueMicrotask defers the state update out of the render-effect
    // synchronous path — same pattern as P1-6 in OrganizerEventDetails.tsx
    queueMicrotask(() => {
      setForm(prev => ({ ...prev, vendor_count: String(systemSuggested) }))
    })
  }, [systemSuggested, vendorCountManuallyEdited])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    try {
      await submitRequest()
    } catch (err) {
      // Anything thrown outside the fetch (a render-time assumption, a parse)
      // used to die silently in the console. Surface it in the red box instead.
      setError(err instanceof Error ? err.message : t('erf.submit_failed', locale))
      setSubmitting(false)
    }
  }

  async function submitRequest() {

    // Validate required fields. Address is REQUIRED as of 2026-08-08 — it was
    // optional here while approval refused to advance without it, so an event
    // could be submitted straight into an unfixable state. Mirrors the same
    // check in api/event-requests (never trust the client alone).
    if (
      !form.company_name.trim() ||
      !form.contact_name.trim() ||
      !form.contact_email.trim() ||
      !form.event_type ||
      !form.event_date ||
      !form.event_start_time ||
      !form.event_end_time ||
      !form.headcount ||
      !form.address.trim() ||
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

    // Lead time. Mirrors api/event-requests — the server is the enforcement,
    // this just avoids a round trip and keeps the message identical.
    const submitLeadStatus = leadTimeStatus(form.event_date)
    if (submitLeadStatus === 'invalid') {
      setError('Please enter a valid event date')
      return
    }
    if (submitLeadStatus === 'too_soon') {
      setError(tooSoonMessage())
      return
    }
    if (submitLeadStatus === 'rushed' && !rushedAck) {
      setError('Please confirm you understand the short turnaround before submitting.')
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
          // Only meaningful inside the rushed window; the server ignores it
          // otherwise and requires it when the date falls in that window.
          rushed_acknowledged: rushedAck,
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
          // Required and validated above; the `|| null` is a belt-and-braces
          // guard so an empty string can never masquerade as a supplied address
          // and slip past the approval gate's truthiness check.
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
      setMatchCount(
        typeof successData.match_count === 'number' ? successData.match_count : null
      )
      setSubmitted(true)
      // Owner 2026-08-30: the form is long — without this the success screen
      // appears mid-page and its headline is never seen.
      window.scrollTo({ top: 0 })
    } catch {
      setError(t('erf.network_error', locale))
      setSubmitting(false)
    }
  }

  if (submitted) {
    const vendorWord = vertical === 'farmers_market' ? 'vendors' : 'food trucks'
    const vendorWordSingular = vertical === 'farmers_market' ? 'vendor' : 'food truck'
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
        {/*
          Three distinct states, and they must stay distinct. `matchCount` is the
          scored, criteria-filtered count from autoMatchAndInvite — not a roster
          size — so a number here is a claim we can defend. null means matching
          never ran for this submission; saying nothing is the only honest option.

          The "refine your criteria for more matches" promise is real and is
          genuinely gated behind the account: api/events/[token]/refresh-matches
          401s an anonymous caller and re-runs the full matching engine. Do not
          reword it into "we are still searching" — the engine runs once per
          submission and does not keep looking on its own.
        */}
        {matchCount !== null && matchCount > 0 && (
          <>
            {/* T-49: this used to read "We matched N vendors to your event",
                which overpromises. The intake form does not collect what
                matching actually needs — vendors want budget and logistics,
                organizers want the event-context answers — so the number here
                is a FIRST PASS on partial information, and saying so sets the
                expectation that finishing the profile changes it.
                ⚠ Still must not imply we keep searching in the background:
                the engine runs once per submission. Re-running is an action
                the organizer takes from the dashboard. */}
            <p style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: accent, margin: `0 0 ${spacing.xs}` }}>
              {matchCount} {matchCount === 1 ? vendorWordSingular : vendorWord} look like a fit so far
            </p>
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, lineHeight: 1.6, margin: `0 0 ${spacing.sm}` }}>
              They have not been invited yet — {vendorWord} decide on the details you give them.
              Create your free account, set your vendor fee (or choose no fee), answer the budget,
              event-context and logistics questions, and click <strong>Send invitations</strong> from
              your dashboard. They typically respond within 48 hours of that.
            </p>
          </>
        )}
        {matchCount === 0 && (
          <>
            <p style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: accent, margin: `0 0 ${spacing.xs}` }}>
              No {vendorWord} matched your exact criteria yet
            </p>
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, lineHeight: 1.6, margin: `0 0 ${spacing.sm}` }}>
              Your event is live. Create your free account to widen your criteria from your
              dashboard and reach more {vendorWord}.
            </p>
          </>
        )}
        {matchCount === null && (
          <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, lineHeight: 1.6, margin: `0 0 ${spacing.sm}` }}>
            Create a free account to manage your event from your personal dashboard.
          </p>
        )}
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
        {/* T-48: sign-in used to be a sentence under the button, and it read as
            a footnote rather than a door — an organizer who already had an
            account (a market manager, say) followed the primary CTA into
            signup and hit "an account with this email already exists". Two
            equal-weight buttons now, because at this point we do not know
            which of the two they are. The signup page's duplicate-email branch
            also offers a Log in link now, so the wrong choice is recoverable
            rather than a wall. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' }}>
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
          <a
            href={loginUrl}
            style={{
              display: 'inline-block',
              padding: `${spacing.xs} ${spacing.lg}`,
              backgroundColor: 'white',
              color: accent,
              textDecoration: 'none',
              borderRadius: radius.md,
              border: `2px solid ${accent}`,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base,
            }}
          >
            I Already Have an Account
          </a>
        </div>
        {/* The silent failure this prevents: an event is claimed by MATCHING
            EMAIL — /event-manager updates catering_requests.organizer_user_id
            where contact_email = the logged-in user's email. Nothing to click,
            it just happens on load. But nothing told the organizer the two
            addresses have to match, and the signup link only PREFILLS this
            email — they can change it. Sign up as a personal address when the
            form said work@company.com and the event is never linked: they log
            in, see no events, get bounced to the shopper dashboard, and there
            is nothing on screen explaining why. Very hard to diagnose from a
            support email. (Owner asked about this 2026-08-13.) */}
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, marginTop: spacing.sm }}>
          Use <strong>{form.contact_email}</strong> when you sign in or create your account — that&apos;s
          how we connect you to this event.
        </p>
      </div>
    )
  }

  const isFM = vertical === 'farmers_market'
  const vendorWordLower = isFM ? 'vendors' : 'food trucks'

  // Recomputed as the organizer picks a date. 'rushed' surfaces the
  // acknowledgment below the field; the server enforces the same thresholds.
  const leadStatus = form.event_date ? leadTimeStatus(form.event_date) : null
  const leadDays = form.event_date ? eventLeadDays(form.event_date) : null

  // noValidate (owner 2026-08-26): the browser's built-in checks (required,
  // type=email/date/time, min/max/step) block the submit BEFORE our handler
  // runs, and iOS Safari shows nothing when they do — the button "did
  // nothing". Every rule they enforced already exists in handleSubmit with a
  // readable message, so let ours run and be seen.
  return (
    <form onSubmit={handleSubmit} noValidate>
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
                {/*
                  `min` stops the picker offering a date inside the hard floor.
                  The server rejects it too (api/event-requests) — this is the
                  courtesy half, not the enforcement half.
                */}
                <input type="date" value={form.event_date} min={earliestBookableDate()}
                  onChange={(e) => { setRushedAck(false); updateField('event_date', e.target.value) }}
                  style={inputStyle} required />
                <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                  At least {MIN_EVENT_LEAD_DAYS} days out — {vendorWordLower} need time to respond and your guests need time to pre-order
                </p>
                {/*
                  The rushed-window acknowledgment. Not a softer rejection — its
                  job is to make a rushed organizer AWARE they are rushing, so
                  they line up their details and their people before the clock
                  starts. Amber, not red: nothing is wrong, this is degrading.
                */}
                {leadStatus === 'rushed' && leadDays !== null && (
                  <div style={{
                    marginTop: spacing['2xs'],
                    padding: spacing['2xs'],
                    backgroundColor: statusColors.warningLight,
                    border: `1px solid ${statusColors.warningBorder}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    color: statusColors.warningDark,
                    lineHeight: 1.5,
                  }}>
                    <p style={{ margin: `0 0 ${spacing['3xs']}` }}>
                      {rushedWarning(leadDays, vendorWordLower)}
                    </p>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: spacing['3xs'], cursor: 'pointer', fontWeight: typography.weights.semibold }}>
                      <input
                        type="checkbox"
                        checked={rushedAck}
                        onChange={(e) => setRushedAck(e.target.checked)}
                        style={{ marginTop: 2 }}
                      />
                      <span>I understand the timing is tight and we are ready to move quickly.</span>
                    </label>
                  </div>
                )}
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

            {/* Address — REQUIRED as of 2026-08-08. It was optional here while
                approval refused to proceed without it, so an event could be
                submitted into a state it could never leave. */}
            <div>
              <label style={labelStyle}>Street address *</label>
              <input type="text" placeholder="123 Main St" value={form.address}
                onChange={(e) => updateField('address', e.target.value)} style={inputStyle} required />
              <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral400 }}>
                Where vendors should show up. Your event can&rsquo;t be approved without it.
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
                      const hc = parseInt(form.headcount, 10)
                      const meals = form.expected_meal_count ? parseInt(form.expected_meal_count, 10) : null
                      const demand = estimateOrders({
                        headcount: hc,
                        expectedMealCount: meals && meals > 0 ? meals : null,
                        paymentModel: form.payment_model || null,
                        eventType: form.event_type,
                        startTime: form.event_start_time || null,
                        isTicketed: form.is_ticketed,
                        hasCompetingFood: form.has_competing_vendors,
                      })
                      const basis = demand.basis === 'organizer'
                        ? `your ${demand.orders} expected orders`
                        : `${demand.rate.label} of attendees ordering${demand.usedLowEnd ? ' (low end — you noted competing food)' : ''}`
                      const pool = vendorPoolSize > 0 ? ` and the ${vendorWord} on the platform` : ''
                      // Owner 2026-08-26: the reasoning stays, the inventory does not —
                      // never reveal the pool size or its averages here.
                      return `Based on ${hc} ${hc === 1 ? 'attendee' : 'attendees'}, ${catCount} ${catUnit}${pool} at a ${form.event_type.replace('_', ' ')} event — assuming ${basis} and planning for a busier-than-average wave — we suggest `
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
          ref={errorRef}
          role="alert"
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

      {/*
        Layer 2 of the late-change protection: name the commitment BEFORE they
        submit, while the date is still free to change. Every later layer costs
        the organizer something — an acknowledgment, an admin conversation, a
        blocked edit. This one is just information, delivered at the only moment
        when acting on it is free.

        Concrete, not abstract: "real businesses" and "buy food and plan their
        day" land where "please be considerate" does not.
      */}
      <p
        style={{
          textAlign: 'center',
          fontSize: typography.sizes.xs,
          color: statusColors.neutral600,
          lineHeight: 1.5,
          margin: `0 0 ${spacing.xs}`,
        }}
      >
        When you book, real {vendorWordLower} commit to your date — they buy food and plan their
        day around it. Please make sure your date is settled before you submit.
      </p>

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
