'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import Link from 'next/link'
import { colors, spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'
import EventChipInControl from '@/components/events/EventChipInControl'
import AdminChangeRequestsCard from '@/components/events/AdminChangeRequestsCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { term } from '@/lib/vertical/terminology'
import { calculateViability, scoreVendorMatch, type EventScoreInput, type ScoreLevel, type VendorMatchInput } from '@/lib/events/viability'

interface CateringRequest {
  id: string
  status: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string | null
  /** Null until the organizer signs up and the row is claimed by email match. */
  organizer_user_id: string | null
  event_type: string | null
  payment_model: string | null
  per_meal_budget_cents: number | null
  event_date: string
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  headcount: number
  expected_meal_count: number | null
  total_food_budget_cents: number | null
  competing_food_options: string | null
  is_ticketed: boolean
  estimated_dwell_hours: number | null
  address: string
  city: string
  state: string
  zip: string
  cuisine_preferences: string | null
  dietary_notes: string | null
  budget_notes: string | null
  beverages_provided: boolean
  dessert_provided: boolean
  vendor_count: number
  setup_instructions: string | null
  additional_notes: string | null
  is_recurring: boolean
  recurring_frequency: string | null
  market_id: string | null
  admin_notes: string | null
  event_token: string | null
  service_level: string | null
  children_present: boolean
  is_themed: boolean
  theme_description: string | null
  has_competing_vendors: boolean
  estimated_spend_per_attendee_cents: number | null
  preferred_vendor_categories: string[] | null
  vendor_stay_policy: string | null
  created_at: string
}

/**
 * Event Lifecycle Status Definitions:
 *   new        — Request received, not yet reviewed by admin
 *   reviewing  — Admin is evaluating viability (scoring, logistics, budget check)
 *   approved   — Passes viability check; market + token created; ready to invite vendors
 *   declined   — Request doesn't meet platform criteria (unrealistic budget, scope, etc.)
 *   cancelled  — Organizer or admin cancelled before or during event
 *   ready      — Enough vendors confirmed; event page shareable with organizer
 *   active     — Event day (orders being fulfilled)
 *   review     — Post-event; feedback collection window (~7 days)
 *   completed  — Settled; all vendor payouts processed
 */
const LIFECYCLE_STEPS = [
  { status: 'new', label: 'Received', subtitle: 'Review request' },
  { status: 'reviewing', label: 'Reviewing', subtitle: 'Evaluate viability' },
  { status: 'approved', label: 'Approved', subtitle: 'Invite vendors' },
  { status: 'ready', label: 'Confirmed', subtitle: 'Share event page' },
  { status: 'active', label: 'Active', subtitle: 'Event day' },
  { status: 'review', label: 'Feedback', subtitle: 'Collect reviews' },
  { status: 'completed', label: 'Settled', subtitle: 'Payouts done' },
]

const EVENT_TYPE_LABELS: Record<string, string> = {
  corporate_lunch: 'Corporate Lunch / Team Meal',
  team_building: 'Team Building / Employee Appreciation',
  grand_opening: 'Grand Opening / Promotional',
  festival: 'Festival / Community Event',
  private_party: 'Private Party / Celebration',
  other: 'Other',
}

const PAYMENT_MODEL_LABELS: Record<string, string> = {
  company_paid: 'Company pays for everyone',
  attendee_paid: 'Each person pays individually',
  hybrid: 'Company covers base, individuals upgrade',
}

const SCORE_COLORS: Record<ScoreLevel, { bg: string; text: string; border: string }> = {
  green: { bg: statusColors.successLight, text: statusColors.successDark, border: statusColors.successBorder },
  yellow: { bg: statusColors.warningLight, text: statusColors.warningDark, border: statusColors.warningBorder },
  red: { bg: statusColors.dangerLight, text: statusColors.dangerDark, border: statusColors.dangerBorder },
}

interface VendorOption {
  id: string
  business_name: string
  event_approved?: boolean
  tier: string
  average_rating: number | null
  rating_count: number
  pickup_lead_minutes: number
  avg_price_cents: number | null
  listing_categories: string[]
  cancellation_rate: number
  event_item_count: number
  /** T-64: the vendor's REAL readiness from the API. Null = questionnaire not
   *  completed, which is a hard matching gate (T-70) — show that, don't score. */
  readiness: {
    max_headcount_per_wave: number
    max_runtime_hours: number
    has_event_experience: boolean
    requires_generator: boolean
    generator_type?: string
    strong_odors: boolean
    food_perishability?: string
    seating_recommended: boolean
    education_focused: boolean
  } | null
}

interface MarketVendor {
  vendor_profile_id: string
  response_status: string | null
  response_notes: string | null
  invited_at: string | null
  vendor_name?: string
  menu_items?: string[]
}

const statusBadge: Record<string, { bg: string; text: string; border: string }> = {
  new: { bg: statusColors.infoLight, text: statusColors.infoDark, border: statusColors.infoBorder },
  reviewing: { bg: statusColors.warningLight, text: statusColors.warningDark, border: statusColors.warningBorder },
  approved: { bg: statusColors.successLight, text: statusColors.successDark, border: statusColors.successBorder },
  declined: { bg: statusColors.dangerLight, text: statusColors.dangerDark, border: statusColors.dangerBorder },
  cancelled: { bg: statusColors.neutral100, text: statusColors.neutral600, border: statusColors.neutral300 },
  completed: { bg: statusColors.successLight, text: statusColors.successDark, border: statusColors.successBorder },
}

const responseBadge: Record<string, { bg: string; text: string }> = {
  invited: { bg: statusColors.infoLight, text: statusColors.infoDark },
  accepted: { bg: statusColors.successLight, text: statusColors.successDark },
  declined: { bg: statusColors.dangerLight, text: statusColors.dangerDark },
}

export default function AdminCateringPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [requests, setRequests] = useState<CateringRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Pending event applications (eligible=false: vendor not yet approved —
  // shown with a flag per owner decision 2026-08-15, no longer hidden)
  const [pendingApplications, setPendingApplications] = useState<Array<{
    id: string; business_name: string; submitted_at: string; eligible: boolean
  }>>([])

  // Vendor invite state
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [mvMap, setMvMap] = useState<Record<string, MarketVendor[]>>({})
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Missing-address repair (2026-08-08). An event with no street address cannot
  // be approved, and until now the admin had no way to record one — so an event
  // could sit unfixable while the admin knew the address from a phone call.
  const [addressDraft, setAddressDraft] = useState('')
  const [savingAddress, setSavingAddress] = useState(false)

  // Create event state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    event_date: '', event_end_date: '', event_start_time: '11:00', event_end_time: '14:00',
    headcount: '50', address: '', city: '', state: '', zip: '', vendor_count: '2',
    cuisine_preferences: '', setup_instructions: '', additional_notes: '',
  })

  // Repeat event state
  const [showRepeatForm, setShowRepeatForm] = useState(false)
  const [repeatDate, setRepeatDate] = useState('')
  const [repeatEndDate, setRepeatEndDate] = useState('')
  const [repeatStartTime, setRepeatStartTime] = useState('')
  const [repeatEndTime, setRepeatEndTime] = useState('')
  const [repeating, setRepeating] = useState(false)

  // Wave generation state
  const [generatingWaves, setGeneratingWaves] = useState(false)
  const [waveInfo, setWaveInfo] = useState<Record<string, { count: number; capacity: number } | null>>({})

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical])

  async function fetchData() {
    setLoading(true)
    try {
      const [eventsRes, appsRes] = await Promise.all([
        fetch(`/api/admin/events?vertical=${vertical}`),
        fetch(`/api/admin/vendors/pending-event-applications?vertical=${vertical}`),
      ])
      if (eventsRes.ok) {
        const data = await eventsRes.json()
        setRequests(data.requests || [])
        setVendors(data.vendors || [])
        setMvMap(data.marketVendorsMap || {})
      }
      if (appsRes.ok) {
        const data = await appsRes.json()
        setPendingApplications(data.applications || [])
      }
    } catch {
      // silent
    }
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const data = await res.json()
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? data.request : r))
        )
        setActionMessage(`Status updated to ${status}`)
        // If approved, the market was just created — no vendors yet
        if (status === 'approved' && data.request.market_id) {
          setMvMap((prev) => ({ ...prev, [data.request.market_id]: [] }))
        }
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
  }

  async function saveAddress(id: string) {
    const value = addressDraft.trim()
    if (!value || savingAddress) return
    setSavingAddress(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: value }),
      })
      if (res.ok) {
        const data = await res.json()
        setRequests((prev) => prev.map((r) => (r.id === id ? data.request : r)))
        setAddressDraft('')
        setActionMessage('Street address saved — this event can be approved now.')
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setSavingAddress(false)
  }

  async function inviteVendors(requestId: string) {
    if (selectedVendors.length === 0) return
    setInviting(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/events/${requestId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_ids: selectedVendors }),
      })
      if (res.ok) {
        const data = await res.json()
        setActionMessage(
          `Invited ${data.invited} vendor(s)${data.skipped ? ` (${data.skipped} already invited)` : ''}`
        )
        setSelectedVendors([])
        // Refresh data to get updated market vendors
        fetchData()
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setInviting(false)
  }

  async function rematchVendors(requestId: string) {
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/events/${requestId}/rematch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) {
        const skippedInfo = data.skipped?.length > 0
          ? `\nSkipped: ${data.skipped.map((s: { name: string; reason: string }) => `${s.name} — ${s.reason}`).join('; ')}`
          : ''
        setActionMessage(`${data.message}${skippedInfo}`)
        fetchData()
      } else {
        setActionMessage(`Error: ${data.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
  }

  async function repeatEvent(id: string) {
    if (!repeatDate || repeating) return
    setRepeating(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/events/${id}/repeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_date: repeatDate,
          event_end_date: repeatEndDate || null,
          event_start_time: repeatStartTime || null,
          event_end_time: repeatEndTime || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setActionMessage('Repeat event created successfully')
        setShowRepeatForm(false)
        setRepeatDate('')
        setRepeatEndDate('')
        setRepeatStartTime('')
        setRepeatEndTime('')
        await fetchData()
        setSelectedId(data.request?.id || null)
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setRepeating(false)
  }

  async function generateWaves(requestId: string) {
    if (generatingWaves) return
    setGeneratingWaves(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/admin/events/${requestId}/generate-waves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (res.ok) {
        setActionMessage(`Generated ${data.waves_created} waves (${data.capacity_per_wave} capacity each)`)
        setWaveInfo(prev => ({ ...prev, [requestId]: { count: data.waves_created, capacity: data.capacity_per_wave } }))
      } else {
        setActionMessage(`Error: ${data.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setGeneratingWaves(false)
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setActionMessage(null)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createForm, vertical }),
      })
      if (res.ok) {
        setShowCreateForm(false)
        setCreateForm({
          company_name: '', contact_name: '', contact_email: '', contact_phone: '',
          event_date: '', event_end_date: '', event_start_time: '11:00', event_end_time: '14:00',
          headcount: '50', address: '', city: '', state: '', zip: '', vendor_count: '2',
          cuisine_preferences: '', setup_instructions: '', additional_notes: '',
        })
        fetchData()
        setActionMessage('Event created successfully')
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Failed to create event')
    }
    setCreating(false)
  }

  const selected = requests.find((r) => r.id === selectedId)
  const filtered =
    statusFilter === 'all'
      ? requests
      : requests.filter((r) => r.status === statusFilter)

  const marketVendors = selected?.market_id ? (mvMap[selected.market_id] || []) : []

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      <AdminNav type="vertical" vertical={vertical} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: statusColors.neutral900, margin: 0 }}>
          {term(vertical, 'event_feature_name')}
        </h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: showCreateForm ? statusColors.neutral400 : statusColors.successDark,
            color: 'white',
            border: 'none',
            borderRadius: radius.md,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: 'pointer',
          }}
        >
          {showCreateForm ? 'Cancel' : '+ Create Event'}
        </button>
      </div>

      {/* Create Event Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateEvent} className="admin-form-grid" style={{
          padding: spacing.md,
          backgroundColor: 'white',
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.md,
          marginBottom: spacing.md,
          gap: spacing.xs,
        }}>
          <h3 style={{ gridColumn: '1 / -1', margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
            New Event
          </h3>
          <input placeholder="Company / Org Name *" required value={createForm.company_name} onChange={e => setCreateForm(f => ({ ...f, company_name: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="Contact Name" value={createForm.contact_name} onChange={e => setCreateForm(f => ({ ...f, contact_name: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="Contact Email" type="email" value={createForm.contact_email} onChange={e => setCreateForm(f => ({ ...f, contact_email: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="Contact Phone" value={createForm.contact_phone} onChange={e => setCreateForm(f => ({ ...f, contact_phone: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>Event Date *</label>
            <input type="date" required value={createForm.event_date} onChange={e => setCreateForm(f => ({ ...f, event_date: e.target.value }))} style={{ width: '100%', padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>End Date</label>
            <input type="date" value={createForm.event_end_date} onChange={e => setCreateForm(f => ({ ...f, event_end_date: e.target.value }))} style={{ width: '100%', padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>Start Time</label>
            <input type="time" value={createForm.event_start_time} onChange={e => setCreateForm(f => ({ ...f, event_start_time: e.target.value }))} style={{ width: '100%', padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>End Time</label>
            <input type="time" value={createForm.event_end_time} onChange={e => setCreateForm(f => ({ ...f, event_end_time: e.target.value }))} style={{ width: '100%', padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, boxSizing: 'border-box' }} />
          </div>
          <input placeholder="Headcount *" type="number" required value={createForm.headcount} onChange={e => setCreateForm(f => ({ ...f, headcount: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="# of Vendors" type="number" value={createForm.vendor_count} onChange={e => setCreateForm(f => ({ ...f, vendor_count: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="Address *" required value={createForm.address} onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="City *" required value={createForm.city} onChange={e => setCreateForm(f => ({ ...f, city: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="State *" required value={createForm.state} onChange={e => setCreateForm(f => ({ ...f, state: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <input placeholder="ZIP" value={createForm.zip} onChange={e => setCreateForm(f => ({ ...f, zip: e.target.value }))} style={{ padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
          <textarea placeholder="Setup instructions" value={createForm.setup_instructions} onChange={e => setCreateForm(f => ({ ...f, setup_instructions: e.target.value }))} rows={2} style={{ gridColumn: '1 / -1', padding: spacing.xs, border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, resize: 'vertical' }} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: spacing.xs }}>
            <button type="button" onClick={() => setShowCreateForm(false)} style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: statusColors.neutral100, border: 'none', borderRadius: radius.sm, cursor: 'pointer', fontSize: typography.sizes.sm }}>
              Cancel
            </button>
            <button type="submit" disabled={creating} style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: creating ? statusColors.neutral400 : statusColors.successDark, color: 'white', border: 'none', borderRadius: radius.sm, cursor: creating ? 'not-allowed' : 'pointer', fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
              {creating ? 'Creating...' : 'Create Event (Approved)'}
            </button>
          </div>
        </form>
      )}

      {/* Organizer change requests — renders nothing when the queue is empty.
          Placed above everything else because every row is time-critical by
          definition: a request only exists because the event was too close for
          the organizer to change it themselves. */}
      <AdminChangeRequestsCard vertical={vertical} primaryColor={colors.primary} />

      {/* Pending Event Applications */}
      {pendingApplications.length > 0 && (
        <div style={{
          marginBottom: spacing.md,
          padding: spacing.md,
          backgroundColor: statusColors.warningLight,
          border: `1px solid ${statusColors.warningBorder}`,
          borderRadius: radius.md,
        }}>
          <h3 style={{
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            color: statusColors.warningDark,
            margin: `0 0 ${spacing.xs}`,
          }}>
            Pending Vendor Event Applications ({pendingApplications.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            {pendingApplications.map(app => (
              <Link
                key={app.id}
                href={`/${vertical}/admin/vendors/${app.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: 'white',
                  borderRadius: radius.sm,
                  textDecoration: 'none',
                  border: `1px solid ${statusColors.warningBorder}`,
                }}
              >
                <span style={{ fontWeight: typography.weights.medium, color: statusColors.neutral900, fontSize: typography.sizes.sm, display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                  {app.business_name}
                  {!app.eligible && (
                    <span style={{ padding: `1px ${spacing.xs}`, backgroundColor: statusColors.neutral100, color: statusColors.neutral600, border: `1px solid ${statusColors.neutral300}`, borderRadius: 8, fontSize: 10, fontWeight: typography.weights.semibold }}>
                      not eligible — vendor not yet approved
                    </span>
                  )}
                </span>
                <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral600 }}>
                  Applied {new Date(app.submitted_at).toLocaleDateString()} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Status filter */}
      <div
        style={{
          display: 'flex',
          gap: spacing['2xs'],
          marginBottom: spacing.md,
          flexWrap: 'wrap',
        }}
      >
        {/* S-1: derived from LIFECYCLE_STEPS + terminals — a second hand-typed
            list here drifted (ready/active/review/cancelled were missing, so
            mid-lifecycle events couldn't be narrowed to). */}
        {['all', ...LIFECYCLE_STEPS.map((step) => step.status), 'declined', 'cancelled'].map(
          (s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                ...sizing.control,
                border: `1px solid ${statusFilter === s ? statusColors.selectionBorder : statusColors.neutral300}`,
                backgroundColor:
                  statusFilter === s
                    ? statusColors.selectionBg
                    : 'white',
                color:
                  statusFilter === s
                    ? statusColors.selectionText
                    : statusColors.neutral600,
                cursor: 'pointer',
                fontWeight: statusFilter === s ? typography.weights.semibold : typography.weights.normal,
                textTransform: 'capitalize',
              }}
            >
              {s} {s !== 'all' ? `(${requests.filter((r) => r.status === s).length})` : `(${requests.length})`}
            </button>
          )
        )}
      </div>

      {loading ? (
        <p style={{ color: statusColors.neutral500 }}>Loading...</p>
      ) : requests.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: spacing.xl,
            color: statusColors.neutral500,
          }}
        >
          <p style={{ fontSize: typography.sizes.lg }}>No requests yet</p>
          <p style={{ fontSize: typography.sizes.sm }}>
            When organizations submit requests via the {term(vertical, 'event_feature_name').toLowerCase()} page,
            they will appear here.
          </p>
        </div>
      ) : (
        <div className={`admin-detail-split${selectedId ? ' has-detail' : ''}`} style={{ gap: spacing.md }}>
          {/* Request list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            {filtered.map((req) => {
              const badge = statusBadge[req.status] || statusBadge.new
              return (
                <button
                  key={req.id}
                  onClick={() => setSelectedId(req.id === selectedId ? null : req.id)}
                  style={{
                    padding: spacing.sm,
                    border: `1px solid ${req.id === selectedId ? statusColors.selectionBorder : statusColors.neutral200}`,
                    borderRadius: radius.md,
                    backgroundColor:
                      req.id === selectedId
                        ? statusColors.selectionBg
                        : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: spacing['3xs'],
                    }}
                  >
                    <strong
                      style={{
                        fontSize: typography.sizes.sm,
                        color: statusColors.neutral800,
                      }}
                    >
                      {req.company_name}
                    </strong>
                    <span
                      style={{
                        ...sizing.badge,
                        backgroundColor: badge.bg,
                        color: badge.text,
                        border: `1px solid ${badge.border}`,
                        textTransform: 'capitalize',
                      }}
                    >
                      {req.status}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: typography.sizes.xs,
                      color: statusColors.neutral500,
                    }}
                  >
                    {req.headcount} people &middot;{' '}
                    {new Date(req.event_date + 'T00:00:00').toLocaleDateString()} &middot;{' '}
                    {req.city}, {req.state}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detail panel */}
          {selected && (
            <div
              style={{
                padding: spacing.md,
                border: `1px solid ${statusColors.neutral200}`,
                borderRadius: radius.lg,
                backgroundColor: 'white',
              }}
            >
              {actionMessage && (
                <div
                  style={{
                    padding: `${spacing['2xs']} ${spacing.xs}`,
                    marginBottom: spacing.sm,
                    borderRadius: radius.md,
                    backgroundColor: actionMessage.startsWith('Error')
                      ? statusColors.dangerLight
                      : statusColors.successLight,
                    color: actionMessage.startsWith('Error')
                      ? statusColors.danger
                      : statusColors.successDark,
                    fontSize: typography.sizes.xs,
                  }}
                >
                  {actionMessage}
                </div>
              )}

              {/* Lifecycle Stepper — shows full workflow, current step highlighted */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                marginBottom: spacing.md,
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: statusColors.neutral50,
                borderRadius: radius.md,
                border: `1px solid ${statusColors.neutral200}`,
                overflowX: 'auto',
              }}>
                {LIFECYCLE_STEPS.map((step, i) => {
                  const stepIndex = LIFECYCLE_STEPS.findIndex(s => s.status === selected.status)
                  const isDeclined = selected.status === 'declined' || selected.status === 'cancelled'
                  const isCurrent = step.status === selected.status
                  const isPast = !isDeclined && stepIndex > i
                  const isFuture = !isCurrent && !isPast

                  return (
                    <div key={step.status} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: 1,
                        minWidth: 0,
                        opacity: isFuture ? 0.4 : 1,
                      }}>
                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: isCurrent ? statusColors.infoDark
                            : isPast ? statusColors.successDark
                            : statusColors.neutral200,
                          color: (isCurrent || isPast) ? 'white' : statusColors.neutral500,
                        }}>
                          {isPast ? '\u2713' : i + 1}
                        </div>
                        <div style={{
                          fontSize: 10,
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? statusColors.infoDark : isPast ? statusColors.successDark : statusColors.neutral400,
                          marginTop: 2,
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}>
                          {step.label}
                        </div>
                        <div style={{
                          fontSize: 9,
                          color: statusColors.neutral400,
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}>
                          {step.subtitle}
                        </div>
                      </div>
                      {i < LIFECYCLE_STEPS.length - 1 && (
                        <div style={{
                          width: 16,
                          height: 2,
                          backgroundColor: isPast ? statusColors.successDark : statusColors.neutral200,
                          flexShrink: 0,
                        }} />
                      )}
                    </div>
                  )
                })}
                {/* Show declined/cancelled as overlay badge if applicable */}
                {(selected.status === 'declined' || selected.status === 'cancelled') && (
                  <div style={{
                    position: 'absolute',
                    right: spacing.sm,
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    backgroundColor: selected.status === 'declined' ? statusColors.dangerLight : statusColors.neutral100,
                    color: selected.status === 'declined' ? statusColors.dangerDark : statusColors.neutral600,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold,
                  }}>
                    {selected.status === 'declined' ? 'Declined' : 'Cancelled'}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: spacing.md,
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: typography.sizes.xl,
                      fontWeight: typography.weights.bold,
                      color: statusColors.neutral900,
                      margin: 0,
                    }}
                  >
                    {selected.company_name}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginTop: spacing['3xs'] }}>
                    <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: 0 }}>
                      Submitted {new Date(selected.created_at).toLocaleDateString()}
                    </p>
                    <span style={{
                      padding: `2px ${spacing.xs}`,
                      borderRadius: radius.full,
                      fontSize: 10,
                      fontWeight: typography.weights.semibold,
                      backgroundColor: selected.service_level === 'self_service' ? '#dbeafe' : '#fef3c7',
                      color: selected.service_level === 'self_service' ? '#1e40af' : '#92400e',
                      border: `1px solid ${selected.service_level === 'self_service' ? '#93c5fd' : '#fcd34d'}`,
                    }}>
                      {selected.service_level === 'self_service' ? 'Self-Service' : 'Managed'}
                    </span>
                  </div>
                </div>

                {/* Status actions */}
                <div style={{ display: 'flex', gap: spacing['2xs'] }}>
                  {selected.status === 'new' && (
                    <>
                      <button
                        onClick={() => updateStatus(selected.id, 'reviewing')}
                        style={{ ...sizing.control, backgroundColor: statusColors.warningLight, color: statusColors.warningDark, border: `1px solid ${statusColors.warningBorder}`, cursor: 'pointer' }}
                      >
                        Review
                      </button>
                      <button
                        onClick={() => updateStatus(selected.id, 'approved')}
                        style={{ ...sizing.control, backgroundColor: statusColors.successLight, color: statusColors.successDark, border: `1px solid ${statusColors.successBorder}`, cursor: 'pointer' }}
                      >
                        Approve
                      </button>
                    </>
                  )}
                  {selected.status === 'reviewing' && (
                    <>
                      <button
                        onClick={() => updateStatus(selected.id, 'approved')}
                        style={{ ...sizing.control, backgroundColor: statusColors.successLight, color: statusColors.successDark, border: `1px solid ${statusColors.successBorder}`, cursor: 'pointer' }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => updateStatus(selected.id, 'declined')}
                        style={{ ...sizing.control, backgroundColor: statusColors.dangerLight, color: statusColors.dangerDark, border: `1px solid ${statusColors.dangerBorder}`, cursor: 'pointer' }}
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {selected.status === 'approved' && (
                    <button
                      onClick={() => updateStatus(selected.id, 'ready')}
                      style={{ ...sizing.control, backgroundColor: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', cursor: 'pointer' }}
                    >
                      Open Pre-Orders
                    </button>
                  )}
                  {selected.status === 'ready' && (
                    <button
                      onClick={() => updateStatus(selected.id, 'active')}
                      style={{ ...sizing.control, backgroundColor: statusColors.successLight, color: statusColors.successDark, border: `1px solid ${statusColors.successBorder}`, cursor: 'pointer' }}
                    >
                      Event Started
                    </button>
                  )}
                  {selected.status === 'active' && (
                    <button
                      onClick={() => updateStatus(selected.id, 'review')}
                      style={{ ...sizing.control, backgroundColor: '#f3e8ff', color: '#7e22ce', border: '1px solid #c4b5fd', cursor: 'pointer' }}
                    >
                      Event Ended — Collect Feedback
                    </button>
                  )}
                  {selected.status === 'review' && (
                    <button
                      onClick={() => updateStatus(selected.id, 'completed')}
                      style={{ ...sizing.control, backgroundColor: statusColors.neutral100, color: statusColors.neutral700, border: `1px solid ${statusColors.neutral300}`, cursor: 'pointer' }}
                    >
                      Mark Complete
                    </button>
                  )}

                  {/* Cancel Event — available from any non-terminal status */}
                  {selected.status && !['completed', 'cancelled', 'declined'].includes(selected.status) && (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      style={{ ...sizing.control, backgroundColor: statusColors.dangerLight, color: statusColors.danger, border: `1px solid ${statusColors.dangerBorder}`, cursor: 'pointer' }}
                    >
                      Cancel Event
                    </button>
                  )}
                </div>

                {/* Cancel confirmation dialog */}
                <ConfirmDialog
                  open={showCancelConfirm}
                  title="Cancel Event"
                  message={`Are you sure you want to cancel "${selected.company_name}"? This will clean up vendor listings and notify affected vendors. This action cannot be easily undone.`}
                  confirmLabel="Cancel Event"
                  cancelLabel="Keep Event"
                  variant="danger"
                  onConfirm={() => {
                    setShowCancelConfirm(false)
                    updateStatus(selected.id, 'cancelled')
                  }}
                  onCancel={() => setShowCancelConfirm(false)}
                />
              </div>

              {/* Community Chip In — event cause contributions (admin + vertical-admin scoped) */}
              <EventChipInControl eventId={selected.id} />

              {/* Contact info */}
              <Section title="Contact">
                <DetailRow label="Contact" value={`${selected.contact_name} (${selected.contact_email})`} />
                {selected.contact_phone && <DetailRow label="Phone" value={selected.contact_phone} />}

                {/* Correcting a typo'd organizer email is a REPAIR PATH, not a
                    convenience. contact_email is one of the two ways a route
                    identifies the organizer, so a wrong one means the signup
                    link went nowhere, the account claim can never match, and
                    the organizer cannot fix it themselves — by definition they
                    cannot authenticate. Only an admin can break that loop.
                    Audit finding, 2026-08-08. */}
                <EmailRepairControl
                  eventId={selected.id}
                  currentEmail={selected.contact_email}
                  organizerLinked={!!selected.organizer_user_id}
                  onSaved={(req) => setRequests(prev => prev.map(r => (r.id === req.id ? req : r)))}
                  onMessage={setActionMessage}
                />
              </Section>

              {/* Event info */}
              <Section title="Event Details">
                <DetailRow
                  label="Date"
                  value={
                    selected.event_end_date && selected.event_end_date !== selected.event_date
                      ? `${fmtDate(selected.event_date)} — ${fmtDate(selected.event_end_date)}`
                      : fmtDate(selected.event_date)
                  }
                />
                {(selected.event_start_time || selected.event_end_time) && (
                  <DetailRow
                    label="Time"
                    value={`${selected.event_start_time || '?'} — ${selected.event_end_time || '?'}`}
                  />
                )}
                <DetailRow label="Headcount" value={`${selected.headcount} people`} />
                {selected.expected_meal_count && selected.expected_meal_count !== selected.headcount && (
                  <DetailRow label={vertical === 'farmers_market' ? 'Expected Buyers' : 'Expected Orders'} value={`${selected.expected_meal_count}${vertical === 'farmers_market' ? ' shoppers' : ' meals'}`} />
                )}
                <DetailRow label={`${term(vertical, 'event_vendor_unit')}s Requested`} value={`${selected.vendor_count}`} />
                <DetailRow
                  label="Location"
                  value={selected.address?.trim()
                    ? `${selected.address}, ${selected.city}, ${selected.state} ${selected.zip}`
                    : `⚠ No street address — ${selected.city}, ${selected.state} ${selected.zip}`}
                />
                {/* Repair path for the approval blocker. Only appears when the
                    address is actually missing, so it stays out of the way for
                    the normal case. */}
                {!selected.address?.trim() && (
                  <div style={{
                    margin: `${spacing.xs} 0`,
                    padding: spacing.xs,
                    backgroundColor: statusColors.warningLight,
                    border: `1px solid ${statusColors.warningBorder}`,
                    borderRadius: radius.sm,
                  }}>
                    <p style={{ margin: `0 0 ${spacing['2xs']}`, fontSize: typography.sizes.xs, color: statusColors.warningDark }}>
                      This event cannot be approved without a street address. Add it here, or the organizer can add it from their event dashboard.
                    </p>
                    <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
                      <input
                        placeholder="123 Main St"
                        value={addressDraft}
                        onChange={(e) => setAddressDraft(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 180,
                          padding: spacing['2xs'],
                          border: `1px solid ${statusColors.neutral300}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm,
                        }}
                      />
                      <button
                        onClick={() => saveAddress(selected.id)}
                        disabled={savingAddress || !addressDraft.trim()}
                        style={{
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          backgroundColor: colors.primary,
                          color: 'white',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          cursor: savingAddress || !addressDraft.trim() ? 'not-allowed' : 'pointer',
                          opacity: savingAddress || !addressDraft.trim() ? 0.6 : 1,
                        }}
                      >
                        {savingAddress ? 'Saving…' : 'Save address'}
                      </button>
                    </div>
                  </div>
                )}
                {selected.event_type && (
                  <DetailRow label="Event Type" value={EVENT_TYPE_LABELS[selected.event_type] || selected.event_type} />
                )}
                {selected.payment_model && (
                  <DetailRow label="Payment" value={PAYMENT_MODEL_LABELS[selected.payment_model] || selected.payment_model} />
                )}
                {selected.total_food_budget_cents != null && (
                  <DetailRow label={vertical === 'farmers_market' ? 'Event Budget' : 'Food Budget'} value={`$${(selected.total_food_budget_cents / 100).toFixed(2)}`} />
                )}
                {vertical === 'food_trucks' && selected.beverages_provided && <DetailRow label="Beverages" value="Provided separately" />}
                {vertical === 'food_trucks' && selected.dessert_provided && <DetailRow label="Dessert" value="Provided separately" />}
              </Section>

              {/* Viability Assessment — admin-only scoring */}
              {(() => {
                const scoreInput: EventScoreInput = {
                  event_type: selected.event_type,
                  payment_model: selected.payment_model,
                  total_food_budget_cents: selected.total_food_budget_cents,
                  per_meal_budget_cents: selected.per_meal_budget_cents,
                  expected_meal_count: selected.expected_meal_count,
                  headcount: selected.headcount,
                  vendor_count: selected.vendor_count,
                  event_start_time: selected.event_start_time,
                  event_end_time: selected.event_end_time,
                  is_recurring: selected.is_recurring,
                  is_ticketed: selected.is_ticketed || false,
                  competing_food_options: selected.competing_food_options,
                  estimated_dwell_hours: selected.estimated_dwell_hours,
                }
                const viability = calculateViability(scoreInput)

                return (
                  <Section title="Viability Assessment">
                    {/* Overall */}
                    <div style={{
                      padding: spacing.xs,
                      backgroundColor: SCORE_COLORS[viability.overall].bg,
                      border: `1px solid ${SCORE_COLORS[viability.overall].border}`,
                      borderRadius: radius.sm,
                      marginBottom: spacing.xs,
                    }}>
                      <span style={{
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.semibold,
                        color: SCORE_COLORS[viability.overall].text,
                      }}>
                        {viability.overallLabel}
                      </span>
                    </div>

                    {/* Individual scores */}
                    {viability.budget && (
                      <div style={{ marginBottom: spacing['2xs'] }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                          <span style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: SCORE_COLORS[viability.budget.level].text,
                          }} />
                          <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700 }}>
                            Budget: {viability.budget.label}
                          </span>
                        </div>
                        <p style={{ margin: `2px 0 0 20px`, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                          {viability.budget.detail}
                        </p>
                      </div>
                    )}

                    <div style={{ marginBottom: spacing['2xs'] }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                        <span style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: SCORE_COLORS[viability.capacity.level].text,
                        }} />
                        <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700 }}>
                          Capacity: {viability.capacity.label}
                        </span>
                      </div>
                      <p style={{ margin: `2px 0 0 20px`, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                        {viability.capacity.detail}
                      </p>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                        <span style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: SCORE_COLORS[viability.duration.level].text,
                        }} />
                        <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700 }}>
                          Duration: {viability.duration.label}
                        </span>
                      </div>
                      <p style={{ margin: `2px 0 0 20px`, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                        {viability.duration.detail}
                      </p>
                    </div>

                    {/* Revenue opportunity (Products B & C only) */}
                    {viability.revenueOpportunity && (
                      <div style={{ marginBottom: spacing['2xs'] }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                          <span style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: SCORE_COLORS[viability.revenueOpportunity.level].text,
                          }} />
                          <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700 }}>
                            {vertical === 'farmers_market' ? 'Revenue/Vendor' : 'Revenue/Truck'}: {viability.revenueOpportunity.label}
                          </span>
                        </div>
                        <p style={{ margin: `2px 0 0 20px`, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                          {viability.revenueOpportunity.detail}
                        </p>
                      </div>
                    )}

                    {/* Assumptions — grouped by factor */}
                    {viability.assumptions.length > 0 && (() => {
                      // Group assumptions by category for readability
                      const groups: Record<string, string[]> = {
                        'Duration': [],
                        'Capacity': [],
                        'Revenue': [],
                        'Budget': [],
                        'Other': [],
                      }
                      for (const a of viability.assumptions) {
                        if (/duration|event.*hour|event times|event.*hr/i.test(a)) groups['Duration'].push(a)
                        else if (/wave|throughput|capacity|meals.*=|expected.*meal|buyer rate|ordering/i.test(a)) groups['Capacity'].push(a)
                        else if (/revenue|dwell|competing|ticketed|food buyers/i.test(a)) groups['Revenue'].push(a)
                        else if (/budget/i.test(a)) groups['Budget'].push(a)
                        else groups['Other'].push(a)
                      }
                      return (
                        <div style={{
                          marginTop: spacing.xs,
                          padding: spacing.xs,
                          backgroundColor: statusColors.neutral50,
                          borderRadius: radius.sm,
                          border: `1px solid ${statusColors.neutral200}`,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: typography.weights.semibold, color: statusColors.neutral500, marginBottom: spacing['3xs'] }}>
                            SCORING BREAKDOWN:
                          </div>
                          {Object.entries(groups).map(([group, items]) => {
                            if (items.length === 0) return null
                            return (
                              <div key={group} style={{ marginBottom: spacing['3xs'] }}>
                                <div style={{ fontSize: 10, fontWeight: typography.weights.semibold, color: statusColors.neutral600 }}>
                                  {group}
                                </div>
                                {items.map((a, i) => (
                                  <div key={i} style={{ fontSize: 10, color: statusColors.neutral500, lineHeight: 1.5, paddingLeft: 8 }}>
                                    &bull; {a}
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* Service speed recommendation based on confirmed vendor lead times */}
                    {(() => {
                      const confirmedVendorIds = marketVendors
                        .filter(mv => mv.response_status === 'accepted')
                        .map(mv => mv.vendor_profile_id)
                      if (confirmedVendorIds.length === 0) return null

                      const confirmedVendorData = vendors.filter(v => confirmedVendorIds.includes(v.id))
                      const allFifteen = confirmedVendorData.length > 0 && confirmedVendorData.every(v => v.pickup_lead_minutes <= 15)

                      if (!allFifteen) return null

                      return (
                        <div style={{
                          marginTop: spacing.xs,
                          padding: spacing.xs,
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #86efac',
                          borderRadius: radius.sm,
                        }}>
                          <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#166534' }}>
                            ⚡ Fast Service Available
                          </div>
                          <div style={{ fontSize: 10, color: '#15803d', marginTop: 2 }}>
                            All {confirmedVendorData.length} confirmed vendor{confirmedVendorData.length > 1 ? 's' : ''} support 15-minute service — doubles customer throughput.
                          </div>
                        </div>
                      )
                    })()}
                  </Section>
                )
              })()}

              {/* Preferences */}
              {(selected.cuisine_preferences || selected.dietary_notes || selected.budget_notes) && (
                <Section title="Preferences">
                  {selected.cuisine_preferences && <DetailRow label="Cuisine" value={selected.cuisine_preferences} />}
                  {selected.dietary_notes && <DetailRow label="Dietary" value={selected.dietary_notes} />}
                  {selected.budget_notes && <DetailRow label="Budget Notes" value={selected.budget_notes} />}
                </Section>
              )}

              {/* Event Considerations */}
              {(selected.children_present || selected.is_themed || selected.has_competing_vendors || selected.estimated_spend_per_attendee_cents || (selected.preferred_vendor_categories && selected.preferred_vendor_categories.length > 0)) && (
                <Section title="Event Considerations">
                  {selected.preferred_vendor_categories && selected.preferred_vendor_categories.length > 0 && (
                    <div style={{ marginBottom: spacing['2xs'] }}>
                      <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral600 }}>Preferred Categories: </span>
                      <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral700 }}>
                        {selected.preferred_vendor_categories.join(', ')}
                      </span>
                    </div>
                  )}
                  {selected.estimated_spend_per_attendee_cents && (
                    <DetailRow label="Est. Spend/Attendee" value={`$${(selected.estimated_spend_per_attendee_cents / 100).toFixed(2)}`} />
                  )}
                  {selected.children_present && <DetailRow label="Children Present" value="Yes" />}
                  {selected.is_themed && <DetailRow label="Themed Event" value={selected.theme_description || 'Yes (no theme specified)'} />}
                  {selected.has_competing_vendors && <DetailRow label="Competing Vendors" value={selected.competing_food_options || 'Yes (no details)'} />}
                  {selected.vendor_stay_policy && <DetailRow label="Vendor Stay Policy" value={
                    selected.vendor_stay_policy === 'may_leave_when_sold_out' ? 'May leave when sold out'
                    : selected.vendor_stay_policy === 'stay_full_event' ? 'Stay for full event'
                    : 'Vendor discretion'
                  } />}
                </Section>
              )}

              {/* Setup */}
              {(selected.setup_instructions || selected.additional_notes) && (
                <Section title="Setup & Notes">
                  {selected.setup_instructions && <DetailRow label="Setup" value={selected.setup_instructions} />}
                  {selected.additional_notes && <DetailRow label="Notes" value={selected.additional_notes} />}
                </Section>
              )}

              {/* Admin notes */}
              {selected.admin_notes && (
                <Section title="Admin Notes">
                  <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: 0, lineHeight: 1.5 }}>
                    {selected.admin_notes}
                  </p>
                </Section>
              )}

              {/* Event link for sharing */}
              {selected.event_token && (
                <Section title="Attendee Link">
                  <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                    <code style={{ fontSize: typography.sizes.xs, color: statusColors.neutral600, backgroundColor: statusColors.neutral50, padding: `${spacing['3xs']} ${spacing.xs}`, borderRadius: radius.sm, wordBreak: 'break-all' }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/${vertical}/events/${selected.event_token}` : `/${vertical}/events/${selected.event_token}`}
                    </code>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/${vertical}/events/${selected.event_token}`
                        navigator.clipboard.writeText(url)
                        setActionMessage('Event link copied!')
                      }}
                      style={{
                        ...sizing.control,
                        backgroundColor: statusColors.infoLight,
                        color: statusColors.infoDark,
                        border: `1px solid ${statusColors.infoBorder}`,
                        cursor: 'pointer',
                        fontWeight: typography.weights.semibold,
                        fontSize: typography.sizes.xs,
                      }}
                    >
                      Copy Link
                    </button>
                  </div>
                </Section>
              )}

              {/* Event market link + settlement report */}
              {selected.market_id && (
                <Section title="Event Market">
                  <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                    <a
                      href={`/${vertical}/markets/${selected.market_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: statusColors.infoDark,
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.semibold,
                      }}
                    >
                      View Event Market Page →
                    </a>
                    <a
                      href={`/${vertical}/admin/events/${selected.id}/settlement`}
                      style={{
                        ...sizing.control,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: spacing['3xs'],
                        backgroundColor: statusColors.neutral900,
                        color: 'white',
                        border: 'none',
                        textDecoration: 'none',
                        fontWeight: typography.weights.semibold,
                        fontSize: typography.sizes.xs,
                        cursor: 'pointer',
                      }}
                    >
                      Settlement Report
                    </a>
                    <button
                      onClick={() => setShowRepeatForm(!showRepeatForm)}
                      style={{
                        ...sizing.control,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: spacing['3xs'],
                        backgroundColor: statusColors.infoLight,
                        color: statusColors.infoDark,
                        border: `1px solid ${statusColors.infoBorder}`,
                        fontWeight: typography.weights.semibold,
                        fontSize: typography.sizes.xs,
                        cursor: 'pointer',
                      }}
                    >
                      {showRepeatForm ? 'Cancel' : 'Repeat Event'}
                    </button>
                    {/* Generate Waves button — for company-paid events with accepted vendors */}
                    {selected.payment_model === 'company_paid' && (
                      <button
                        onClick={() => generateWaves(selected.id)}
                        disabled={generatingWaves}
                        style={{
                          ...sizing.control,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: spacing['3xs'],
                          backgroundColor: generatingWaves ? '#ccc' : '#8BC34A',
                          color: 'white',
                          border: 'none',
                          fontWeight: typography.weights.semibold,
                          fontSize: typography.sizes.xs,
                          cursor: generatingWaves ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {generatingWaves ? 'Generating...' : waveInfo[selected.id] ? `${waveInfo[selected.id]?.count} Waves ✓` : 'Generate Waves'}
                      </button>
                    )}
                  </div>
                  {/* Wave info display */}
                  {waveInfo[selected.id] && (
                    <div style={{
                      marginTop: spacing.xs,
                      padding: `${spacing['2xs']} ${spacing.sm}`,
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      color: '#166534',
                    }}>
                      {waveInfo[selected.id]?.count} waves generated &middot; {waveInfo[selected.id]?.capacity} capacity per wave &middot; 30-min intervals
                    </div>
                  )}
                  {showRepeatForm && (
                    <div style={{
                      marginTop: spacing.sm,
                      padding: spacing.sm,
                      backgroundColor: statusColors.neutral50,
                      border: `1px solid ${statusColors.neutral200}`,
                      borderRadius: radius.md,
                    }}>
                      <p style={{ margin: `0 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: statusColors.neutral600 }}>
                        Create a new request with same company & location, new dates:
                      </p>
                      <div className="admin-grid-2" style={{ gap: spacing.xs, marginBottom: spacing.xs }}>
                        <div>
                          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral600, marginBottom: spacing['3xs'] }}>
                            Event Date *
                          </label>
                          <input
                            type="date"
                            value={repeatDate}
                            onChange={(e) => setRepeatDate(e.target.value)}
                            style={{ ...sizing.control, width: '100%', border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.md, fontSize: typography.sizes.sm }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral600, marginBottom: spacing['3xs'] }}>
                            End Date
                          </label>
                          <input
                            type="date"
                            value={repeatEndDate}
                            onChange={(e) => setRepeatEndDate(e.target.value)}
                            style={{ ...sizing.control, width: '100%', border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.md, fontSize: typography.sizes.sm }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral600, marginBottom: spacing['3xs'] }}>
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={repeatStartTime}
                            onChange={(e) => setRepeatStartTime(e.target.value)}
                            style={{ ...sizing.control, width: '100%', border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.md, fontSize: typography.sizes.sm }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral600, marginBottom: spacing['3xs'] }}>
                            End Time
                          </label>
                          <input
                            type="time"
                            value={repeatEndTime}
                            onChange={(e) => setRepeatEndTime(e.target.value)}
                            style={{ ...sizing.control, width: '100%', border: `1px solid ${statusColors.neutral300}`, borderRadius: radius.md, fontSize: typography.sizes.sm }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => repeatEvent(selected.id)}
                        disabled={!repeatDate || repeating}
                        style={{
                          ...sizing.control,
                          backgroundColor: !repeatDate || repeating ? '#ccc' : statusColors.infoDark,
                          color: 'white',
                          border: 'none',
                          fontWeight: typography.weights.semibold,
                          fontSize: typography.sizes.xs,
                          cursor: !repeatDate || repeating ? 'not-allowed' : 'pointer',
                          width: '100%',
                        }}
                      >
                        {repeating ? 'Creating...' : 'Create Repeat Event'}
                      </button>
                    </div>
                  )}
                </Section>
              )}

              {/* Vendor invitations (only for approved requests with a market) */}
              {selected.market_id && (
                <Section title="Vendor Invitations">
                  {/* Current invitations */}
                  {marketVendors.length > 0 && (
                    <div className="admin-table-wrap" style={{ marginBottom: spacing.sm }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.sizes.sm }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${statusColors.neutral200}` }}>
                            <th style={{ textAlign: 'left', padding: spacing['2xs'], color: statusColors.neutral600, fontWeight: typography.weights.semibold }}>Vendor</th>
                            <th style={{ textAlign: 'left', padding: spacing['2xs'], color: statusColors.neutral600, fontWeight: typography.weights.semibold }}>Status</th>
                            <th style={{ textAlign: 'left', padding: spacing['2xs'], color: statusColors.neutral600, fontWeight: typography.weights.semibold }}>{vertical === 'farmers_market' ? 'Items' : 'Menu Items'}</th>
                            <th style={{ textAlign: 'left', padding: spacing['2xs'], color: statusColors.neutral600, fontWeight: typography.weights.semibold }}>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketVendors.map((mv) => {
                            const rBadge = responseBadge[mv.response_status || 'invited'] || responseBadge.invited
                            const vendorInfo = vendors.find((v) => v.id === mv.vendor_profile_id)
                            return (
                              <tr key={mv.vendor_profile_id} style={{ borderBottom: `1px solid ${statusColors.neutral100}` }}>
                                <td style={{ padding: spacing['2xs'], color: statusColors.neutral800 }}>
                                  {mv.vendor_name || vendorInfo?.business_name || mv.vendor_profile_id.slice(0, 8)}
                                </td>
                                <td style={{ padding: spacing['2xs'] }}>
                                  <span
                                    style={{
                                      ...sizing.badge,
                                      backgroundColor: rBadge.bg,
                                      color: rBadge.text,
                                      textTransform: 'capitalize',
                                    }}
                                  >
                                    {mv.response_status || 'invited'}
                                  </span>
                                </td>
                                <td style={{ padding: spacing['2xs'], color: statusColors.neutral600, fontSize: typography.sizes.xs }}>
                                  {mv.menu_items && mv.menu_items.length > 0
                                    ? mv.menu_items.map((item: string) => item).join(', ')
                                    : mv.response_status === 'accepted' ? 'No items selected' : '—'}
                                </td>
                                <td style={{ padding: spacing['2xs'], color: statusColors.neutral500, fontSize: typography.sizes.xs }}>
                                  {mv.response_notes || '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Invite more vendors */}
                  <div
                    style={{
                      padding: spacing.sm,
                      backgroundColor: statusColors.neutral50,
                      borderRadius: radius.md,
                      border: `1px solid ${statusColors.neutral200}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing['2xs'] }}>
                      <p
                        style={{
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold,
                          color: statusColors.neutral700,
                          margin: 0,
                        }}
                      >
                        Invite Vendors
                      </p>
                      <button
                        onClick={() => rematchVendors(selected.id)}
                        style={{
                          padding: `2px ${spacing.xs}`,
                          backgroundColor: statusColors.infoLight,
                          color: statusColors.infoDark,
                          border: `1px solid ${statusColors.infoBorder}`,
                          borderRadius: radius.sm,
                          fontSize: 10,
                          fontWeight: typography.weights.semibold,
                          cursor: 'pointer',
                        }}
                      >
                        Re-run Auto Match
                      </button>
                    </div>
                    {vendors.length === 0 ? (
                      <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: 0 }}>
                        No approved vendors found.
                      </p>
                    ) : (
                      <>
                        <div
                          style={{
                            maxHeight: 200,
                            overflowY: 'auto',
                            marginBottom: spacing.xs,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: spacing['3xs'],
                          }}
                        >
                          {vendors
                            .filter(
                              (v) =>
                                !marketVendors.some(
                                  (mv) => mv.vendor_profile_id === v.id
                                )
                            )
                            .sort((a, b) => {
                              // Event-approved vendors first, then alphabetical
                              if (a.event_approved && !b.event_approved) return -1
                              if (!a.event_approved && b.event_approved) return 1
                              return a.business_name.localeCompare(b.business_name)
                            })
                            .map((v) => {
                              // T-64: these inputs were HARDCODED (30/wave, 6hr,
                              // no experience) — a third, diverged copy of the
                              // matching rule, so this panel showed different
                              // scores than the engine produced. Real readiness
                              // now, from the API. Null readiness = the T-70
                              // hard gate — the engine will not match this
                              // vendor at all, so say that instead of scoring.
                              // @paired-rule matching-inputs — must feed the scorer the same real readiness the engine does. See lib/paired-rules.ts.
                              const matchInput: VendorMatchInput = {
                                vendor_id: v.id, business_name: v.business_name,
                                listing_categories: v.listing_categories || [],
                                max_headcount_per_wave: v.readiness?.max_headcount_per_wave ?? 30,
                                max_runtime_hours: v.readiness?.max_runtime_hours ?? 6,
                                has_event_experience: v.readiness?.has_event_experience ?? false,
                                requires_generator: v.readiness?.requires_generator ?? false,
                                ...(v.readiness?.generator_type ? { generator_type: v.readiness.generator_type } : {}),
                                strong_odors: v.readiness?.strong_odors ?? false,
                                ...(v.readiness?.food_perishability ? { food_perishability: v.readiness.food_perishability } : {}),
                                seating_recommended: v.readiness?.seating_recommended ?? false,
                                education_focused: v.readiness?.education_focused ?? false,
                                average_rating: v.average_rating, rating_count: v.rating_count || 0,
                                cancellation_rate: v.cancellation_rate || 0, tier: v.tier,
                                pickup_lead_minutes: v.pickup_lead_minutes,
                              }
                              const ms = scoreVendorMatch(matchInput, {
                                cuisine_preferences: selected.cuisine_preferences,
                                headcount: selected.headcount, expected_meal_count: selected.expected_meal_count,
                                vendor_count: selected.vendor_count,
                                event_start_time: selected.event_start_time, event_end_time: selected.event_end_time,
                                children_present: selected.children_present, event_type: selected.event_type,
                              })
                              const hasIssues = ms.deal_breakers.length > 0
                              const hasWarns = ms.warnings.length > 0
                              const sc = ms.platform_score >= 4.0 ? '#059669' : ms.platform_score >= 3.0 ? '#d97706' : '#dc2626'
                              const levelColor = (l: ScoreLevel) => l === 'green' ? '#059669' : l === 'yellow' ? '#d97706' : '#dc2626'
                              return (
                              <div key={v.id} style={{ marginBottom: spacing['3xs'] }}>
                              <label style={{
                                display: 'flex', alignItems: 'center', gap: spacing['2xs'],
                                padding: `${spacing['3xs']} ${spacing.xs}`, borderRadius: radius.sm,
                                cursor: v.event_approved ? 'pointer' : 'not-allowed', fontSize: typography.sizes.xs,
                                backgroundColor: hasIssues ? '#fef2f2' : selectedVendors.includes(v.id) ? statusColors.successLight : 'transparent',
                                border: `1px solid ${hasIssues ? '#fca5a5' : selectedVendors.includes(v.id) ? statusColors.successBorder : 'transparent'}`,
                                opacity: hasIssues || !v.event_approved ? 0.7 : 1,
                              }}>
                                {/* T-79: the invite route hard-rejects vendors without
                                    event_approved (invite/route.ts filter) — offering a
                                    checkbox here just produced "No valid vendors found".
                                    Non-approved vendors stay VISIBLE as candidates but
                                    can't be selected; the badge says why. */}
                                <input type="checkbox" checked={selectedVendors.includes(v.id)}
                                  disabled={!v.event_approved}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedVendors(prev => [...prev, v.id])
                                    else setSelectedVendors(prev => prev.filter(id => id !== v.id))
                                  }} />
                                <span style={{ fontWeight: typography.weights.medium }}>{v.business_name}</span>
                                {v.event_approved ? (
                                  <span style={{ padding: `1px ${spacing['2xs']}`, backgroundColor: '#d1fae5', color: '#065f46', borderRadius: 8, fontSize: 10, fontWeight: typography.weights.semibold }}>Event ✓</span>
                                ) : (
                                  <span style={{ padding: `1px ${spacing['2xs']}`, backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 8, fontSize: 10, fontWeight: typography.weights.semibold }}>not event-approved — can&apos;t invite</span>
                                )}
                                <span style={{
                                  padding: `1px ${spacing['2xs']}`,
                                  backgroundColor: v.event_item_count >= 4 ? '#dbeafe' : '#fef3c7',
                                  color: v.event_item_count >= 4 ? '#1e40af' : '#92400e',
                                  borderRadius: 8, fontSize: 10, fontWeight: typography.weights.semibold,
                                }}>
                                  {v.event_item_count} event items{v.event_item_count < 4 ? ' (need 4+)' : ''}
                                </span>
                                {/* T-70: no completed readiness = the engine will
                                    never auto-match this vendor. A score would be
                                    fiction, so show the gate instead. Admins can
                                    still hand-invite — they may know something the
                                    questionnaire doesn't. */}
                                {v.readiness === null ? (
                                  <span style={{ padding: `1px ${spacing['2xs']}`, backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 8, fontSize: 10, fontWeight: typography.weights.semibold }}>
                                    no readiness — auto-match skips
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 10, fontWeight: typography.weights.semibold, color: sc }}>{ms.platform_score.toFixed(1)}</span>
                                )}
                                <span style={{ fontSize: 10, color: statusColors.neutral400, display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap', marginLeft: 'auto' }}>
                                  {v.avg_price_cents != null && (
                                    <span style={{
                                      color: selected.per_meal_budget_cents
                                        ? v.avg_price_cents <= selected.per_meal_budget_cents ? '#059669' : '#dc2626'
                                        : selected.total_food_budget_cents && selected.expected_meal_count
                                          ? v.avg_price_cents <= Math.round(selected.total_food_budget_cents / selected.expected_meal_count) ? '#059669' : '#dc2626'
                                          : statusColors.neutral500,
                                    }}>~${(v.avg_price_cents / 100).toFixed(0)}/{vertical === 'farmers_market' ? 'item' : 'meal'}</span>
                                  )}
                                  {v.average_rating != null && <span>{v.average_rating.toFixed(1)}★</span>}
                                  {v.pickup_lead_minutes <= 15 && <span style={{ color: '#059669' }}>15min⚡</span>}
                                  <span style={{ textTransform: 'capitalize' }}>{v.tier}</span>
                                </span>
                              </label>
                              <div style={{ paddingLeft: 28, fontSize: 10, lineHeight: 1.4, color: statusColors.neutral500 }}>
                                <span style={{ color: levelColor(ms.cuisine_match) }}>Cuisine: {ms.cuisine_match}</span>
                                {' · '}<span style={{ color: levelColor(ms.capacity_fit) }}>Capacity: {ms.capacity_fit}</span>
                                {' · '}<span style={{ color: levelColor(ms.runtime_fit) }}>Runtime: {ms.runtime_fit}</span>
                              </div>
                              {hasIssues && <div style={{ paddingLeft: 28, fontSize: 10, color: '#dc2626', lineHeight: 1.4 }}>
                                {ms.deal_breakers.map((db, i) => <div key={i}>⛔ {db}</div>)}
                              </div>}
                              {hasWarns && <div style={{ paddingLeft: 28, fontSize: 10, color: '#d97706', lineHeight: 1.4 }}>
                                {ms.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
                              </div>}
                              </div>)
                            })}
                        </div>
                        <button
                          onClick={() => inviteVendors(selected.id)}
                          disabled={
                            inviting || selectedVendors.length === 0
                          }
                          style={{
                            ...sizing.control,
                            backgroundColor:
                              selectedVendors.length === 0
                                ? statusColors.neutral200
                                : statusColors.infoDark,
                            color:
                              selectedVendors.length === 0
                                ? statusColors.neutral500
                                : 'white',
                            border: 'none',
                            cursor:
                              selectedVendors.length === 0
                                ? 'not-allowed'
                                : 'pointer',
                            fontWeight: typography.weights.semibold,
                          }}
                        >
                          {inviting
                            ? 'Sending...'
                            : `Send Invitations (${selectedVendors.length})`}
                        </button>
                      </>
                    )}
                  </div>
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: spacing.md }}>
      <h3
        style={{
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: statusColors.neutral700,
          marginBottom: spacing['2xs'],
          marginTop: 0,
          paddingBottom: spacing['3xs'],
          borderBottom: `1px solid ${statusColors.neutral100}`,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}

/**
 * Correct a typo'd organizer email, then decide whether to tell them.
 *
 * The send is a SEPARATE, deliberate step — owner, 2026-08-08: "the admin route
 * should tell me it changed and let me trigger the email." Auto-sending on save
 * would mail whoever the corrected address belongs to without the admin
 * choosing to, and a correction is exactly the moment you want to look before
 * you send.
 *
 * Collapsed to a single link until used: this is a repair tool, not part of the
 * normal review flow.
 */
function EmailRepairControl({
  eventId,
  currentEmail,
  organizerLinked,
  onSaved,
  onMessage,
}: {
  eventId: string
  currentEmail: string
  organizerLinked: boolean
  onSaved: (req: CateringRequest) => void
  onMessage: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(currentEmail)
  const [busy, setBusy] = useState(false)
  // Only offer the resend once something actually changed this session —
  // otherwise it invites re-mailing an organizer who is already fine.
  const [changed, setChanged] = useState(false)

  async function call(body: Record<string, unknown>, okMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.request) onSaved(data.request as CateringRequest)
        if (data.contactEmailChanged) setChanged(true)
        // Never claim the mail went out when it didn't — RESEND_API_KEY may be
        // unset in this environment and the route reports that honestly.
        onMessage(
          'linkEmailSent' in data && body.resend_organizer_link
            ? (data.linkEmailSent ? 'Link email sent.' : 'Saved, but the email did NOT send — check RESEND_API_KEY.')
            : okMsg
        )
      } else {
        onMessage(`Error: ${data.error}`)
      }
    } catch {
      onMessage('Network error')
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginTop: spacing['2xs'],
          color: colors.primary,
          fontSize: typography.sizes.xs,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Fix contact email
      </button>
    )
  }

  return (
    <div style={{
      marginTop: spacing.xs,
      padding: spacing.xs,
      backgroundColor: statusColors.neutral50,
      border: `1px solid ${statusColors.neutral200}`,
      borderRadius: radius.sm,
    }}>
      <p style={{ margin: `0 0 ${spacing['2xs']}`, fontSize: typography.sizes.xs, color: statusColors.neutral600 }}>
        {organizerLinked
          ? 'This organizer has an account linked, so they can also change this themselves.'
          : 'No account is linked yet — until this address is right, the organizer cannot reach their event and cannot fix it themselves.'}
      </p>
      <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: spacing['2xs'],
            border: `1px solid ${statusColors.neutral300}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
          }}
        />
        <button
          onClick={() => call({ contact_email: draft }, 'Contact email updated.')}
          disabled={busy || !draft.trim() || draft.trim().toLowerCase() === currentEmail.toLowerCase()}
          style={{
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy || !draft.trim() || draft.trim().toLowerCase() === currentEmail.toLowerCase() ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save email'}
        </button>
      </div>
      {changed && (
        <div style={{ marginTop: spacing['2xs'] }}>
          <p style={{ margin: `0 0 ${spacing['3xs']}`, fontSize: typography.sizes.xs, color: statusColors.warningDark }}>
            Saved — but the organizer still hasn&rsquo;t received their link. Send it now?
          </p>
          <button
            onClick={() => call({ resend_organizer_link: true }, 'Link email sent.')}
            disabled={busy}
            style={{
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: statusColors.warningLight,
              color: statusColors.warningDark,
              border: `1px solid ${statusColors.warningBorder}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Send their event link
          </button>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: spacing.xs,
        marginBottom: spacing['3xs'],
        fontSize: typography.sizes.sm,
      }}
    >
      <span
        style={{
          color: statusColors.neutral500,
          minWidth: 100,
          flexShrink: 0,
        }}
      >
        {label}:
      </span>
      <span style={{ color: statusColors.neutral800 }}>{value}</span>
    </div>
  )
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
