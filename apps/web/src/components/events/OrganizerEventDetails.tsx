'use client'

import { useState, useEffect } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  CHANGEABLE_FIELDS,
  CHANGE_REQUEST_REASONS,
  EXPLANATION_MIN,
  EXPLANATION_MAX,
} from '@/lib/events/change-requests'

interface OrganizerEventDetailsProps {
  /**
   * The event id OR its event_token — both are accepted by
   * /api/events/[token]/details (lib/events/event-ref.ts).
   *
   * This used to be `eventToken`, and a pre-approval event has no token, so the
   * editor simply never rendered — even though `address` is an allowed field
   * here and 'new' is an editable status. That is why an event submitted without
   * a street address could not be approved AND could not be corrected.
   */
  eventRef: string
  status: string
  vertical: string
  primaryColor: string
}

interface EventDetails {
  [key: string]: string | number | boolean | string[] | null | undefined
  cuisine_preferences: string | null
  dietary_notes: string | null
  preferred_vendor_categories: string[] | null
  total_food_budget_cents: number | null
  per_meal_budget_cents: number | null
  estimated_spend_per_attendee_cents: number | null
  expected_meal_count: number | null
  budget_notes: string | null
  beverages_provided: boolean
  dessert_provided: boolean
  competing_food_options: string | null
  setup_instructions: string | null
  additional_notes: string | null
  vendor_stay_policy: string | null
  estimated_dwell_hours: number | null
  is_themed: boolean
  theme_description: string | null
  children_present: boolean
  has_competing_vendors: boolean
  is_ticketed: boolean
  vendor_count: number
  // Event Basics group — surfaced from Stage 1 + corrections allowed in Stage 2
  event_type: string | null
  event_start_time: string | null
  event_end_time: string | null
  event_setting: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  event_date: string | null
  headcount: number | null
  company_name: string | null
  contact_name: string | null
  market_id: string | null
  is_recurring: boolean
  recurring_frequency: string | null
  contact_phone: string | null
}

const EDITABLE_STATUSES = ['new', 'reviewing', 'approved', 'ready']

/**
 * Approval copies these into the `markets` row, and `event_date` also decides
 * the market's schedule weekday (`lib/events/event-actions.ts:126-159`). Editing
 * them afterwards would change nothing vendors or shoppers see, and would leave
 * the market running on the wrong day. Locked once a market exists; the server
 * rejects them too (`api/events/[token]/details`), this is only the UI half.
 */
const PRE_APPROVAL_ONLY_FIELDS = ['city', 'state', 'zip', 'event_date', 'headcount', 'company_name']

// Field groups for progressive disclosure
const FIELD_GROUPS = [
  {
    label: 'Event Basics',
    description: 'Type, timing, and location — this is what vendors are matched on. A wrong city or zip matches the wrong vendors. Address is required before approval.',
    fields: ['company_name', 'event_type', 'event_date', 'event_start_time', 'event_end_time', 'event_setting', 'address', 'city', 'state', 'zip', 'headcount', 'contact_name', 'contact_phone'],
  },
  {
    label: 'Food Preferences',
    description: 'Helps us match you with the right vendors',
    fields: ['cuisine_preferences', 'dietary_notes', 'preferred_vendor_categories'],
  },
  {
    label: 'Budget',
    description: 'Helps vendors plan their menu and pricing',
    fields: ['total_food_budget_cents', 'per_meal_budget_cents', 'estimated_spend_per_attendee_cents', 'expected_meal_count', 'budget_notes'],
  },
  {
    label: 'Event Context',
    description: 'Helps vendors prepare for your specific event',
    fields: ['beverages_provided', 'dessert_provided', 'competing_food_options', 'has_competing_vendors', 'is_themed', 'theme_description', 'children_present', 'is_ticketed'],
  },
  {
    label: 'Logistics',
    description: 'Setup and operational details for event day',
    fields: ['setup_instructions', 'vendor_stay_policy', 'estimated_dwell_hours', 'vendor_count', 'additional_notes'],
  },
]

function isFieldFilled(details: EventDetails, field: string): boolean {
  const val = details[field]
  if (val === null || val === undefined || val === '') return false
  if (Array.isArray(val) && val.length === 0) return false
  if (typeof val === 'number' && val === 0 && field.includes('cents')) return false
  if (typeof val === 'boolean') return true // booleans are always "filled"
  return true
}

function countFilledInGroup(details: EventDetails, fields: string[]): number {
  // Exclude boolean fields from the "unfilled" count since they always have a value
  const countable = fields.filter(f => typeof details[f] !== 'boolean')
  return countable.filter(f => isFieldFilled(details, f)).length
}

function countTotalInGroup(fields: string[], details: EventDetails): number {
  return fields.filter(f => typeof details[f] !== 'boolean').length
}

export default function OrganizerEventDetails({ eventRef, status, vertical, primaryColor }: OrganizerEventDetailsProps) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<EventDetails | null>(null)

  // What a change would cost right now — real numbers from the server, used
  // both for the warning copy and to know whether there is anyone to disturb.
  const [changeCost, setChangeCost] = useState<{
    preorder_count: number
    committed_vendor_count: number
    window: 'open' | 'blocked' | 'past' | 'unknown'
    hours_until_event: number | null
    block_at_hours: number
  } | null>(null)

  // Non-null while the acknowledgment dialog is open; holds the count to show.
  const [pendingAckCount, setPendingAckCount] = useState<number | null>(null)

  // Non-null once a save has been refused by the hard block. Carries the change
  // they attempted so the request form does not make them retype it — they are
  // close to their event and short of time, which is why they are here at all.
  const [blockedChange, setBlockedChange] = useState<{
    message: string
    preorderCount: number
    changes: Record<string, string>
  } | null>(null)
  const [requestReason, setRequestReason] = useState('')
  const [requestExplanation, setRequestExplanation] = useState('')
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestResult, setRequestResult] = useState<string | null>(null)

  async function submitChangeRequest() {
    if (!blockedChange) return
    setRequestSubmitting(true)
    setRequestResult(null)
    try {
      const res = await fetch(`/api/events/${eventRef}/change-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason_category: requestReason,
          explanation: requestExplanation,
          requested_changes: blockedChange.changes,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setRequestResult(
          'Sent. We will look at this and come back to you — check your email.'
        )
        setBlockedChange(null)
        setRequestReason('')
        setRequestExplanation('')
        setEditGroup(null)
      } else {
        setRequestResult(data.error || 'We could not send that. Please contact us directly.')
      }
    } catch {
      setRequestResult('We could not send that. Please contact us directly.')
    }
    setRequestSubmitting(false)
  }

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editGroup, setEditGroup] = useState<number | null>(null)

  // Local form state
  const [formData, setFormData] = useState<Record<string, unknown>>({})

  // Re-match banner state. Set when API PATCH response says matchingChanged.
  // Cleared when user clicks "Refresh" or "Skip", or when banner action completes.
  const [showRefreshBanner, setShowRefreshBanner] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null)

  const isEditable = EDITABLE_STATUSES.includes(status)

  async function handleRefreshMatches() {
    if (refreshing) return
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const res = await fetch(`/api/events/${eventRef}/refresh-matches`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setRefreshMessage(body.message || 'Matches refreshed.')
        setShowRefreshBanner(false)
      } else {
        setRefreshMessage(body.error || 'Could not refresh matches.')
      }
    } catch {
      setRefreshMessage('Network error refreshing matches.')
    }
    setRefreshing(false)
  }

  async function loadDetails() {
    if (details) return // already loaded
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventRef}/details`)
      if (res.ok) {
        const data = await res.json()
        setDetails(data.event)
        setChangeCost(data.change_cost ?? null)
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => {
    if (expanded && !details) {
      queueMicrotask(() => { void loadDetails() })
    }
  }, [expanded, details])

  // A field the market has already copied, on an event that HAS a market.
  const isFieldLocked = (field: string) =>
    PRE_APPROVAL_ONLY_FIELDS.includes(field) && !!details?.market_id

  function startEditing(groupIdx: number) {
    if (!details) return
    const group = FIELD_GROUPS[groupIdx]
    const initial: Record<string, unknown> = {}
    for (const f of group.fields) {
      // Locked fields are never put in formData, so they can never be PATCHed
      // even if the read-only rendering below were bypassed.
      if (isFieldLocked(f)) continue
      initial[f] = details[f] ?? ''
    }
    setFormData(initial)
    setEditGroup(groupIdx)
    setSaveMessage(null)
  }

  /**
   * `acknowledged` is only ever true on the retry after the organizer confirms
   * the dialog. The SERVER decides whether an acknowledgment is needed — this
   * component never predicts it. Duplicating that judgment here would mean two
   * places that have to agree about what a change costs, and they would drift.
   */
  async function saveGroup(acknowledged = false) {
    setSaving(true)
    setSaveMessage(null)
    try {
      // Clean up form data: convert empty strings to null
      const cleaned: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(formData)) {
        if (v === '' || v === undefined) {
          cleaned[k] = null
        } else if (k.includes('cents') && typeof v === 'string') {
          const parsed = Math.round(parseFloat(v) * 100)
          cleaned[k] = isNaN(parsed) ? null : parsed
        } else if (k === 'estimated_dwell_hours' && typeof v === 'string') {
          const parsed = parseFloat(v)
          cleaned[k] = isNaN(parsed) ? null : parsed
        } else if (k === 'vendor_count' && typeof v === 'string') {
          const parsed = parseInt(v)
          cleaned[k] = isNaN(parsed) ? null : parsed
        } else if (k === 'expected_meal_count' && typeof v === 'string') {
          const parsed = parseInt(v)
          cleaned[k] = isNaN(parsed) ? null : parsed
        } else {
          cleaned[k] = v
        }
      }

      const res = await fetch(`/api/events/${eventRef}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cleaned, change_acknowledged: acknowledged }),
      })

      if (res.ok) {
        const saveResult = await res.json().catch(() => ({}))
        // Refresh details
        const refresh = await fetch(`/api/events/${eventRef}/details`)
        if (refresh.ok) {
          const data = await refresh.json()
          setDetails(data.event)
          setChangeCost(data.change_cost ?? null)
        }
        setSaveMessage('Saved!')
        setEditGroup(null)
        // If the save changed any matching-affecting field, surface a banner so
        // the organizer can choose to re-run the vendor match. Manual button —
        // not auto — to avoid spamming vendors with re-invites on every tweak.
        //
        // ⚠ Gated on the event actually HAVING a market. `refresh-matches`
        // rejects anything unapproved (`:81-86` of that route), so before this
        // gate existed the banner offered a button that could only fail. It was
        // unreachable pre-approval until 2026-08-08, when the editor stopped
        // being token-gated — this gate is the other half of that change.
        if (saveResult.matchingChanged && details?.market_id) {
          setShowRefreshBanner(true)
          setRefreshMessage(null)
        }
      } else {
        const err = await res.json()
        if (err.change_acknowledgment_required) {
          // Not an error the organizer caused — a cost they have not seen yet.
          // Hold the edit open behind the dialog rather than dumping them back
          // to the form having lost nothing but their momentum.
          setPendingAckCount(Number(err.preorder_count) || 0)
          setSaving(false)
          return
        }
        if (err.change_blocked) {
          // The refusal has to lead somewhere. Carry the change they attempted
          // into the request so they do not retype it — the whole point is that
          // they are close to their event and short of time.
          const attempted: Record<string, string> = {}
          for (const f of CHANGEABLE_FIELDS) {
            const v = cleaned[f]
            if (v !== undefined && v !== null && String(v).trim()) {
              attempted[f] = String(v)
            }
          }
          setBlockedChange({
            message: String(err.error || ''),
            preorderCount: Number(err.preorder_count) || 0,
            changes: attempted,
          })
          setSaving(false)
          return
        }
        setSaveMessage(`Error: ${err.error}`)
      }
    } catch {
      setSaveMessage('Failed to save')
    }
    setSaving(false)
  }

  // Completion indicator
  const totalGroups = FIELD_GROUPS.length
  const filledGroups = details ? FIELD_GROUPS.filter(g => {
    const filled = countFilledInGroup(details, g.fields)
    const total = countTotalInGroup(g.fields, details)
    return total > 0 && filled > 0
  }).length : 0

  return (
    <div style={{ marginTop: spacing.xs }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: typography.sizes.sm,
          color: primaryColor,
          fontWeight: typography.weights.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: spacing['3xs'],
        }}
      >
        {expanded ? '▾' : '▸'} Event Details
        {details && (
          <span style={{
            fontSize: typography.sizes.xs,
            color: filledGroups === totalGroups ? statusColors.successDark : statusColors.neutral500,
            fontWeight: typography.weights.normal,
            marginLeft: spacing['2xs'],
          }}>
            ({filledGroups}/{totalGroups} sections started)
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: spacing.xs }}>
          {loading && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>Loading details...</p>
          )}

          {/* Access code (read-only, shown after approval for company-paid/hybrid) */}
          {details && details.access_code && (
            <div style={{
              marginBottom: spacing.xs,
              padding: spacing.xs,
              backgroundColor: statusColors.infoLight,
              borderRadius: radius.md,
              border: `1px solid ${statusColors.infoBorder}`,
            }}>
              <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.infoDark }}>
                Event Access Code
              </span>
              <div style={{
                fontFamily: 'monospace',
                fontSize: typography.sizes.xl,
                fontWeight: typography.weights.bold,
                letterSpacing: '0.2em',
                color: statusColors.infoDark,
                margin: `${spacing['2xs']} 0`,
              }}>
                {details.access_code}
              </div>
              <p style={{ fontSize: typography.sizes.xs, color: statusColors.info, margin: 0 }}>
                Share this code with attendees so they can order their company-covered meal.
                {details.company_max_per_attendee_cents && (
                  <> Each person gets one item up to <strong>${(details.company_max_per_attendee_cents as number / 100).toFixed(2)}</strong>.</>
                )}
              </p>
            </div>
          )}

          {/* Refresh-matches banner — appears after a Stage 2 save changes a matching-affecting field */}
          {showRefreshBanner && (
            <div style={{
              marginBottom: spacing.xs,
              padding: spacing.xs,
              backgroundColor: statusColors.warningLight,
              borderRadius: radius.md,
              border: `1px solid ${statusColors.warningBorder}`,
            }}>
              <p style={{ fontSize: typography.sizes.sm, color: statusColors.warningDark, margin: `0 0 ${spacing['2xs']}` }}>
                Your changes affect vendor matching. Refresh matches now?
              </p>
              <div style={{ display: 'flex', gap: spacing.xs }}>
                <button
                  onClick={handleRefreshMatches}
                  disabled={refreshing}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.sm}`,
                    backgroundColor: primaryColor,
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold,
                    cursor: refreshing ? 'not-allowed' : 'pointer',
                    opacity: refreshing ? 0.7 : 1,
                  }}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh matches'}
                </button>
                <button
                  onClick={() => { setShowRefreshBanner(false); setRefreshMessage(null) }}
                  style={{
                    padding: `${spacing['3xs']} ${spacing.sm}`,
                    backgroundColor: 'white',
                    color: statusColors.warningDark,
                    border: `1px solid ${statusColors.warningBorder}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    cursor: 'pointer',
                  }}
                >
                  Skip
                </button>
              </div>
              {refreshMessage && (
                <p style={{ fontSize: typography.sizes.xs, color: statusColors.warningDark, marginTop: spacing['2xs'] }}>
                  {refreshMessage}
                </p>
              )}
            </div>
          )}
          {!showRefreshBanner && refreshMessage && (
            <p style={{ fontSize: typography.sizes.xs, color: statusColors.successDark, marginBottom: spacing.xs }}>
              {refreshMessage}
            </p>
          )}

          {details && FIELD_GROUPS.map((group, gIdx) => {
            const filled = countFilledInGroup(details, group.fields)
            const total = countTotalInGroup(group.fields, details)
            const isEditingThis = editGroup === gIdx

            return (
              <div key={gIdx} style={{
                marginBottom: spacing.xs,
                padding: spacing.xs,
                backgroundColor: statusColors.neutral50,
                borderRadius: radius.md,
                border: `1px solid ${statusColors.neutral200}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: statusColors.neutral700 }}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginLeft: spacing['2xs'] }}>
                      {total > 0 ? `${filled}/${total} filled` : 'Optional'}
                    </span>
                  </div>
                  {isEditable && !isEditingThis && (
                    <button
                      onClick={() => startEditing(gIdx)}
                      style={{
                        background: 'none',
                        border: `1px solid ${primaryColor}`,
                        borderRadius: radius.sm,
                        padding: `2px ${spacing.xs}`,
                        fontSize: typography.sizes.xs,
                        color: primaryColor,
                        cursor: 'pointer',
                      }}
                    >
                      {filled > 0 ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>

                <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `${spacing['3xs']} 0 0` }}>
                  {group.description}
                </p>

                {/* Read-only display when not editing */}
                {!isEditingThis && filled > 0 && (
                  <div style={{ marginTop: spacing['2xs'], fontSize: typography.sizes.xs, color: statusColors.neutral600 }}>
                    {group.fields.map(f => {
                      if (!isFieldFilled(details, f)) return null
                      const val = details[f]
                      const label = fieldLabel(f, vertical)
                      const display = formatFieldValue(f, val)
                      return (
                        <div key={f} style={{ marginBottom: 2 }}>
                          <strong>{label}:</strong> {display}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Edit form */}
                {isEditingThis && (
                  <div style={{ marginTop: spacing.xs }}>
                    {/*
                      Consequence warning, shown only once the event is LIVE
                      (a market exists) and only on the group that carries the
                      timing fields. Pre-approval there is nobody to disrupt, so
                      warning then would just be noise that trains people to
                      ignore it.

                      `warning` (amber), not `attention` (orange): amber is
                      "this is degrading" — nothing is broken and no task is
                      being assigned. See the state vocabulary in design-tokens.
                    */}
                    {!!details.market_id && group.fields.some(f =>
                      f === 'event_start_time' || f === 'event_end_time' || f === 'event_end_date'
                    ) && (
                      <div style={{
                        marginBottom: spacing.xs,
                        padding: spacing['2xs'],
                        backgroundColor: statusColors.warningLight,
                        border: `1px solid ${statusColors.warningBorder}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        color: statusColors.warningDark,
                        lineHeight: 1.5,
                      }}>
                        {/*
                          Real numbers, not abstractions. "14 people have
                          pre-ordered" changes behaviour where "please be
                          careful" does not — and when the counts are zero this
                          says so plainly rather than implying a cost that is
                          not there.
                        */}
                        <strong>Changing your event timing has real costs.</strong>{' '}
                        {changeCost && changeCost.committed_vendor_count > 0 ? (
                          <>
                            <strong>{changeCost.committed_vendor_count}</strong>{' '}
                            {changeCost.committed_vendor_count === 1
                              ? (vertical === 'farmers_market' ? 'vendor has' : 'food truck has')
                              : (vertical === 'farmers_market' ? 'vendors have' : 'food trucks have')}{' '}
                            committed staff and food to these hours
                          </>
                        ) : (
                          <>
                            {vertical === 'farmers_market' ? 'Vendors' : 'Food trucks'} commit staff
                            and food to these hours
                          </>
                        )}
                        {changeCost && changeCost.preorder_count > 0 ? (
                          <>
                            , and <strong>{changeCost.preorder_count}</strong>{' '}
                            {changeCost.preorder_count === 1 ? 'person has' : 'people have'} already
                            pre-ordered. Each of them will be asked to confirm they can still make
                            it, and any who do not answer are refunded before the event — so a
                            timing change usually means fewer pre-orders, not just a different hour.
                          </>
                        ) : (
                          <>. Nobody has pre-ordered yet, so a change now costs you the least it
                            ever will.</>
                        )}
                      </div>
                    )}
                    {group.fields.map(f => {
                      const label = fieldLabel(f, vertical)
                      const val = formData[f]
                      const locked = isFieldLocked(f)
                      return (
                        <div key={f} style={{ marginBottom: spacing.xs }}>
                          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700, marginBottom: 2 }}>
                            {label}
                          </label>
                          {locked ? (
                            <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                              {formatFieldValue(f, details[f]) || '—'}
                              <span style={{ fontStyle: 'italic', marginLeft: spacing['2xs'] }}>
                                — locked now that your event is approved. Contact us to change it.
                              </span>
                            </div>
                          ) : (
                            renderField(f, val, (v) => setFormData(prev => ({ ...prev, [f]: v })))
                          )}
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs }}>
                      <button
                        // NOT `onClick={saveGroup}` — React would pass the click
                        // event as `acknowledged`, and a MouseEvent is truthy, so
                        // every save would claim the organizer had already
                        // acknowledged and skip the dialog entirely.
                        onClick={() => void saveGroup()}
                        disabled={saving}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.sm}`,
                          backgroundColor: primaryColor,
                          color: 'white',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          opacity: saving ? 0.7 : 1,
                        }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditGroup(null); setSaveMessage(null) }}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.sm}`,
                          backgroundColor: 'white',
                          color: statusColors.neutral600,
                          border: `1px solid ${statusColors.neutral300}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    {saveMessage && (
                      <p style={{ fontSize: typography.sizes.xs, color: saveMessage.startsWith('Error') ? statusColors.danger : statusColors.successDark, marginTop: spacing['2xs'] }}>
                        {saveMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {details && !isEditable && (
            <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, fontStyle: 'italic', marginTop: spacing['2xs'] }}>
              Details are locked after the event is {status === 'active' ? 'active' : status}.
            </p>
          )}
        </div>
      )}

      {/*
        The way out of the hard block. Deliberately an inline PANEL, not a
        dialog: it needs a reason, a free-text explanation and a review of what
        they are asking for, and a modal that size on a phone is a trap. It also
        keeps the refusal message visible above it rather than replacing it.
      */}
      {blockedChange && (
        <div style={{
          marginTop: spacing.sm,
          padding: spacing.sm,
          backgroundColor: statusColors.warningLight,
          border: `1px solid ${statusColors.warningBorder}`,
          borderRadius: radius.md,
        }}>
          <p style={{
            margin: `0 0 ${spacing.xs}`,
            fontSize: typography.sizes.sm,
            color: statusColors.warningDark,
            lineHeight: 1.5,
          }}>
            {blockedChange.message}
          </p>

          <p style={{
            margin: `0 0 ${spacing.xs}`,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            color: statusColors.neutral800,
          }}>
            If this cannot wait, tell us what happened and we will sort it out with you.
          </p>

          {Object.keys(blockedChange.changes).length > 0 && (
            <div style={{
              marginBottom: spacing.xs,
              padding: spacing['2xs'],
              backgroundColor: '#ffffff',
              borderRadius: radius.sm,
              fontSize: typography.sizes.xs,
              color: statusColors.neutral700,
            }}>
              <strong>What you are asking to change:</strong>
              <ul style={{ margin: `${spacing['3xs']} 0 0`, paddingLeft: '1.2em' }}>
                {Object.entries(blockedChange.changes).map(([f, v]) => (
                  <li key={f}>{fieldLabel(f, vertical)}: {formatFieldValue(f, v)}</li>
                ))}
              </ul>
            </div>
          )}

          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700, marginBottom: 2 }}>
            What happened?
          </label>
          <select
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            style={{
              width: '100%',
              padding: spacing['2xs'],
              borderRadius: radius.sm,
              border: `1px solid ${statusColors.neutral300}`,
              fontSize: typography.sizes.sm,
              marginBottom: spacing.xs,
            }}
          >
            <option value="">Choose a reason…</option>
            {CHANGE_REQUEST_REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700, marginBottom: 2 }}>
            In your own words
          </label>
          {/*
            Required on every reason, not just "other". The category is for us;
            this sentence is what the vendors read, attributed to the organizer
            — so they know the change came from them and not from us.
          */}
          <textarea
            value={requestExplanation}
            onChange={(e) => setRequestExplanation(e.target.value)}
            rows={3}
            maxLength={EXPLANATION_MAX}
            placeholder="A sentence or two is plenty."
            style={{
              width: '100%',
              padding: spacing['2xs'],
              borderRadius: radius.sm,
              border: `1px solid ${statusColors.neutral300}`,
              fontSize: typography.sizes.sm,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <p style={{ margin: `2px 0 ${spacing.xs}`, fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
            {vertical === 'farmers_market' ? 'The vendors' : 'The food trucks'} who committed to your
            event will be shown what you write here.
          </p>

          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <button
              onClick={() => void submitChangeRequest()}
              disabled={
                requestSubmitting ||
                !requestReason ||
                requestExplanation.trim().length < EXPLANATION_MIN
              }
              style={{
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: requestSubmitting || !requestReason || requestExplanation.trim().length < EXPLANATION_MIN
                  ? statusColors.neutral300
                  : primaryColor,
                color: '#ffffff',
                border: 'none',
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                cursor: requestSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {requestSubmitting ? 'Sending…' : 'Send this to us'}
            </button>
            <button
              onClick={() => { setBlockedChange(null); setRequestResult(null) }}
              style={{
                padding: `${spacing['3xs']} ${spacing.sm}`,
                backgroundColor: 'transparent',
                color: statusColors.neutral600,
                border: `1px solid ${statusColors.neutral300}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer',
              }}
            >
              Leave it as it is
            </button>
          </div>
        </div>
      )}

      {requestResult && (
        <p style={{
          marginTop: spacing.xs,
          fontSize: typography.sizes.sm,
          color: statusColors.neutral700,
        }}>
          {requestResult}
        </p>
      )}

      {/*
        The consequence acknowledgment. Raised by the SERVER, not predicted here
        — it only appears when a change would actually make someone re-confirm.
        A native confirm() is not an option: it is blocked on mobile.
      */}
      <ConfirmDialog
        open={pendingAckCount !== null}
        title="This change affects people who already ordered"
        message={
          `${pendingAckCount} ${pendingAckCount === 1 ? 'person has' : 'people have'} pre-ordered for this event. ` +
          `Saving this will ask ${pendingAckCount === 1 ? 'them' : 'each of them'} to confirm they can still make it, ` +
          `and any order nobody confirms will be refunded before the event — so you will likely end up with fewer ` +
          `pre-orders than you have now. Your ${vertical === 'farmers_market' ? 'vendors' : 'food trucks'} will be told about the change too. ` +
          `Only save if the event really has moved.`
        }
        confirmLabel="Yes, save the change"
        cancelLabel="Keep it as it is"
        variant="danger"
        onConfirm={() => {
          setPendingAckCount(null)
          void saveGroup(true)
        }}
        onCancel={() => setPendingAckCount(null)}
      />
    </div>
  )
}

// ── Field helpers ──

function fieldLabel(field: string, vertical: string): string {
  const labels: Record<string, string> = {
    cuisine_preferences: term(vertical, 'event_preference_label'),
    dietary_notes: 'Dietary Requirements',
    preferred_vendor_categories: 'Preferred Vendor Types',
    total_food_budget_cents: 'Total Food Budget',
    per_meal_budget_cents: 'Budget Per Meal',
    estimated_spend_per_attendee_cents: 'Estimated Spend Per Person',
    expected_meal_count: 'Expected Meal Count',
    budget_notes: 'Budget Notes',
    beverages_provided: 'Beverages Already Provided?',
    dessert_provided: 'Dessert Already Provided?',
    competing_food_options: 'Other Food at Venue',
    has_competing_vendors: 'Other Food Vendors Present?',
    is_themed: 'Themed Event?',
    theme_description: 'Theme Details',
    children_present: 'Children Attending?',
    is_ticketed: 'Ticketed Event?',
    setup_instructions: 'Setup Instructions',
    vendor_stay_policy: 'Vendor Stay Policy',
    estimated_dwell_hours: 'Average Attendee Stay (hours)',
    vendor_count: 'Number of Vendors Wanted',
    additional_notes: 'Additional Notes',
    // Event Basics group
    event_type: 'Event Type',
    event_start_time: 'Start Time',
    event_end_time: 'End Time',
    event_setting: 'Event Setting',
    address: 'Street Address',
    city: 'City',
    state: 'State',
    zip: 'Zip',
    event_date: 'Event Date',
    headcount: 'Expected Attendees',
    company_name: 'Company / Event Name',
    contact_name: 'Contact Name',
    contact_phone: 'Phone',
    is_recurring: 'Recurring Event?',
    recurring_frequency: 'How Often?',
  }
  return labels[field] || field.replace(/_/g, ' ')
}

// Display labels for the event_type / event_setting / recurring_frequency enums.
// Match the values stored in the DB (and accepted by the API validation).
const EVENT_TYPE_LABELS: Record<string, string> = {
  corporate_lunch: 'Corporate Lunch / Team Meal',
  team_building: 'Team Building / Employee Appreciation',
  grand_opening: 'Grand Opening / Promotional Event',
  festival: 'Festival / Community Event',
  private_party: 'Private Party / Celebration',
  other: 'Other',
}
const EVENT_SETTING_LABELS: Record<string, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  either: 'Either / Both',
}
const RECURRING_FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
}

function formatFieldValue(field: string, val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (Array.isArray(val)) return val.join(', ') || 'None'
  if (field.includes('cents') && typeof val === 'number') return `$${(val / 100).toFixed(2)}`
  if (field === 'vendor_stay_policy') {
    const map: Record<string, string> = {
      may_leave_when_sold_out: 'May leave when sold out',
      stay_full_event: 'Stay for full event',
      vendor_discretion: 'Vendor discretion',
    }
    return map[val as string] || String(val)
  }
  if (field === 'event_type') return EVENT_TYPE_LABELS[val as string] || String(val)
  if (field === 'event_setting') return EVENT_SETTING_LABELS[val as string] || String(val)
  if (field === 'recurring_frequency') return RECURRING_FREQ_LABELS[val as string] || String(val)
  return String(val)
}

const inputStyle = {
  width: '100%',
  padding: `${spacing['3xs']} ${spacing.xs}`,
  border: `1px solid ${statusColors.neutral300}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  boxSizing: 'border-box' as const,
}

function renderField(field: string, value: unknown, onChange: (v: unknown) => void) {
  // Event date
  if (field === 'event_date') {
    return (
      <input
        type="date"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  // State — 2-letter code, matches the intake form's handling
  if (field === 'state') {
    return (
      <input
        type="text"
        maxLength={2}
        placeholder="TX"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        style={inputStyle}
      />
    )
  }

  if (field === 'zip') {
    return (
      <input
        type="text"
        maxLength={10}
        placeholder="79111"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  // Time inputs
  if (field === 'event_start_time' || field === 'event_end_time') {
    return (
      <input
        type="time"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  // Event type select
  if (field === 'event_type') {
    return (
      <select
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={inputStyle}
      >
        <option value="">-- Select event type --</option>
        {Object.entries(EVENT_TYPE_LABELS).map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
    )
  }

  // Event setting select
  if (field === 'event_setting') {
    return (
      <select
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={inputStyle}
      >
        <option value="">-- Select setting --</option>
        {Object.entries(EVENT_SETTING_LABELS).map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
    )
  }

  // Recurring frequency select
  if (field === 'recurring_frequency') {
    return (
      <select
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={inputStyle}
      >
        <option value="">-- Select frequency --</option>
        {Object.entries(RECURRING_FREQ_LABELS).map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
    )
  }

  // Phone input
  if (field === 'contact_phone') {
    return (
      <input
        type="tel"
        placeholder="555-555-5555"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  // is_recurring also boolean — added to the boolean list below
  // Boolean fields
  if (['beverages_provided', 'dessert_provided', 'is_themed', 'children_present', 'has_competing_vendors', 'is_ticketed', 'is_recurring'].includes(field)) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], fontSize: typography.sizes.sm }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        Yes
      </label>
    )
  }

  // Cents fields — show as dollars
  if (field.includes('cents')) {
    const dollars = typeof value === 'number' && value > 0 ? (value / 100).toFixed(2) : value || ''
    return (
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="0.00"
        value={dollars as string}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  // Headcount — bounds mirror the intake form and the API validation.
  if (field === 'headcount') {
    return (
      <input
        type="number"
        min="10"
        max="5000"
        value={value as string || ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={inputStyle}
      />
    )
  }

  // Numeric fields
  if (['expected_meal_count', 'vendor_count'].includes(field)) {
    return (
      <input
        type="number"
        min="1"
        value={value as string || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  if (field === 'estimated_dwell_hours') {
    return (
      <input
        type="number"
        step="0.5"
        min="0.5"
        max="24"
        placeholder="e.g. 2.5"
        value={value as string || ''}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    )
  }

  // Select for vendor_stay_policy
  if (field === 'vendor_stay_policy') {
    return (
      <select
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={inputStyle}
      >
        <option value="">-- Select --</option>
        <option value="may_leave_when_sold_out">May leave when sold out</option>
        <option value="stay_full_event">Stay for full event</option>
        <option value="vendor_discretion">Vendor discretion</option>
      </select>
    )
  }

  // Textarea for longer text
  if (['cuisine_preferences', 'dietary_notes', 'setup_instructions', 'additional_notes', 'budget_notes', 'competing_food_options', 'theme_description'].includes(field)) {
    return (
      <textarea
        rows={3}
        placeholder={field === 'cuisine_preferences' ? 'e.g. BBQ, Mexican, Asian fusion...'
          : field === 'dietary_notes' ? 'e.g. Nut-free options needed, vegetarian options...'
          : field === 'setup_instructions' ? 'e.g. Loading dock at back entrance, 20A power available...'
          : ''}
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, resize: 'vertical' as const }}
      />
    )
  }

  // Array field
  if (field === 'preferred_vendor_categories') {
    return (
      <input
        type="text"
        placeholder="e.g. BBQ, Tacos, Desserts (comma-separated)"
        value={Array.isArray(value) ? value.join(', ') : (value as string) || ''}
        onChange={(e) => {
          const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          onChange(arr.length > 0 ? arr : null)
        }}
        style={inputStyle}
      />
    )
  }

  // Default text input
  return (
    <input
      type="text"
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
    />
  )
}
