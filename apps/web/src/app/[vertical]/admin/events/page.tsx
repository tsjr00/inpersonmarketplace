'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import Link from 'next/link'
import { spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'

interface CateringRequest {
  id: string
  status: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string | null
  event_date: string
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  headcount: number
  address: string
  city: string
  state: string
  zip: string
  cuisine_preferences: string | null
  dietary_notes: string | null
  budget_notes: string | null
  vendor_count: number
  setup_instructions: string | null
  additional_notes: string | null
  market_id: string | null
  admin_notes: string | null
  created_at: string
}

interface VendorOption {
  id: string
  business_name: string
  event_approved?: boolean
  vertical_id: string
}

interface MarketVendor {
  vendor_profile_id: string
  response_status: string | null
  response_notes: string | null
  invited_at: string | null
  vendor_name?: string
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

  // Pending event applications
  const [pendingApplications, setPendingApplications] = useState<Array<{
    id: string; business_name: string; submitted_at: string
  }>>([])

  // Vendor invite state
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [mvMap, setMvMap] = useState<Record<string, MarketVendor[]>>({})
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

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
        <form onSubmit={handleCreateEvent} style={{
          padding: spacing.md,
          backgroundColor: 'white',
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.md,
          marginBottom: spacing.md,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
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
                <span style={{ fontWeight: typography.weights.medium, color: statusColors.neutral900, fontSize: typography.sizes.sm }}>
                  {app.business_name}
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
        {['all', 'new', 'reviewing', 'approved', 'declined', 'completed'].map(
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
        <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '1fr 2fr' : '1fr', gap: spacing.md }}>
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
                  <p
                    style={{
                      fontSize: typography.sizes.xs,
                      color: statusColors.neutral500,
                      margin: `${spacing['3xs']} 0 0`,
                    }}
                  >
                    Submitted{' '}
                    {new Date(selected.created_at).toLocaleDateString()}
                  </p>
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
                </div>
              </div>

              {/* Contact info */}
              <Section title="Contact">
                <DetailRow label="Contact" value={`${selected.contact_name} (${selected.contact_email})`} />
                {selected.contact_phone && <DetailRow label="Phone" value={selected.contact_phone} />}
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
                <DetailRow label={`${term(vertical, 'event_vendor_unit')}s Requested`} value={`${selected.vendor_count}`} />
                <DetailRow
                  label="Location"
                  value={`${selected.address}, ${selected.city}, ${selected.state} ${selected.zip}`}
                />
              </Section>

              {/* Preferences */}
              {(selected.cuisine_preferences || selected.dietary_notes || selected.budget_notes) && (
                <Section title="Preferences">
                  {selected.cuisine_preferences && <DetailRow label="Cuisine" value={selected.cuisine_preferences} />}
                  {selected.dietary_notes && <DetailRow label="Dietary" value={selected.dietary_notes} />}
                  {selected.budget_notes && <DetailRow label="Budget" value={selected.budget_notes} />}
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
                      {typeof window !== 'undefined' ? `${window.location.origin}/events/${selected.event_token}` : `/events/${selected.event_token}`}
                    </code>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/events/${selected.event_token}`
                        navigator.clipboard.writeText(url)
                        setActionMessage('Event link copied!')
                      }}
                      style={{
                        ...sizing.control,
                        backgroundColor: statusColors.infoBg,
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
                  </div>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs, marginBottom: spacing.xs }}>
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
                    <div style={{ marginBottom: spacing.sm }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.sizes.sm }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${statusColors.neutral200}` }}>
                            <th style={{ textAlign: 'left', padding: spacing['2xs'], color: statusColors.neutral600, fontWeight: typography.weights.semibold }}>Vendor</th>
                            <th style={{ textAlign: 'left', padding: spacing['2xs'], color: statusColors.neutral600, fontWeight: typography.weights.semibold }}>Status</th>
                            <th style={{ textAlign: 'left', padding: spacing['2xs'], color: statusColors.neutral600, fontWeight: typography.weights.semibold }}>Menu Items</th>
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
                    <p
                      style={{
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
                        color: statusColors.neutral700,
                        marginBottom: spacing['2xs'],
                        marginTop: 0,
                      }}
                    >
                      Invite Vendors
                    </p>
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
                            .map((v) => (
                              <label
                                key={v.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: spacing['2xs'],
                                  fontSize: typography.sizes.sm,
                                  color: statusColors.neutral700,
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedVendors.includes(v.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedVendors((prev) => [
                                        ...prev,
                                        v.id,
                                      ])
                                    } else {
                                      setSelectedVendors((prev) =>
                                        prev.filter((id) => id !== v.id)
                                      )
                                    }
                                  }}
                                />
                                {v.business_name}
                                {v.event_approved && (
                                  <span style={{
                                    padding: `1px ${spacing['2xs']}`,
                                    backgroundColor: '#d1fae5',
                                    color: '#065f46',
                                    borderRadius: 8,
                                    fontSize: typography.sizes.xs,
                                    fontWeight: typography.weights.semibold,
                                    marginLeft: spacing['3xs'],
                                  }}>
                                    Event ✓
                                  </span>
                                )}
                              </label>
                            ))}
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
