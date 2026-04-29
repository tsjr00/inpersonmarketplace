'use client'

import { useState, useEffect } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

interface OrganizerEventDetailsProps {
  eventToken: string
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
}

const EDITABLE_STATUSES = ['new', 'reviewing', 'approved', 'ready']

// Field groups for progressive disclosure
const FIELD_GROUPS = [
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

export default function OrganizerEventDetails({ eventToken, status, vertical, primaryColor }: OrganizerEventDetailsProps) {
  const [expanded, setExpanded] = useState(false)
  const [details, setDetails] = useState<EventDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [editGroup, setEditGroup] = useState<number | null>(null)

  // Local form state
  const [formData, setFormData] = useState<Record<string, unknown>>({})

  const isEditable = EDITABLE_STATUSES.includes(status)

  async function loadDetails() {
    if (details) return // already loaded
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventToken}/details`)
      if (res.ok) {
        const data = await res.json()
        setDetails(data.event)
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => {
    if (expanded && !details) {
      queueMicrotask(() => { void loadDetails() })
    }
  }, [expanded, details])

  function startEditing(groupIdx: number) {
    if (!details) return
    const group = FIELD_GROUPS[groupIdx]
    const initial: Record<string, unknown> = {}
    for (const f of group.fields) {
      initial[f] = details[f] ?? ''
    }
    setFormData(initial)
    setEditGroup(groupIdx)
    setSaveMessage(null)
  }

  async function saveGroup() {
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

      const res = await fetch(`/api/events/${eventToken}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleaned),
      })

      if (res.ok) {
        // Refresh details
        const refresh = await fetch(`/api/events/${eventToken}/details`)
        if (refresh.ok) {
          const data = await refresh.json()
          setDetails(data.event)
        }
        setSaveMessage('Saved!')
        setEditGroup(null)
      } else {
        const err = await res.json()
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
            color: filledGroups === totalGroups ? '#166534' : statusColors.neutral500,
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
              backgroundColor: '#eff6ff',
              borderRadius: radius.md,
              border: '1px solid #bfdbfe',
            }}>
              <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#1e40af' }}>
                Event Access Code
              </span>
              <div style={{
                fontFamily: 'monospace',
                fontSize: typography.sizes.xl,
                fontWeight: typography.weights.bold,
                letterSpacing: '0.2em',
                color: '#1e3a8a',
                margin: `${spacing['2xs']} 0`,
              }}>
                {details.access_code}
              </div>
              <p style={{ fontSize: typography.sizes.xs, color: '#3b82f6', margin: 0 }}>
                Share this code with attendees so they can order their company-covered meal.
                {details.company_max_per_attendee_cents && (
                  <> Each person gets one item up to <strong>${(details.company_max_per_attendee_cents as number / 100).toFixed(2)}</strong>.</>
                )}
              </p>
            </div>
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
                      const label = fieldLabel(f)
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
                    {group.fields.map(f => {
                      const label = fieldLabel(f)
                      const val = formData[f]
                      return (
                        <div key={f} style={{ marginBottom: spacing.xs }}>
                          <label style={{ display: 'block', fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: statusColors.neutral700, marginBottom: 2 }}>
                            {label}
                          </label>
                          {renderField(f, val, (v) => setFormData(prev => ({ ...prev, [f]: v })))}
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: spacing.xs, marginTop: spacing.xs }}>
                      <button
                        onClick={saveGroup}
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
                      <p style={{ fontSize: typography.sizes.xs, color: saveMessage.startsWith('Error') ? '#dc2626' : '#166534', marginTop: spacing['2xs'] }}>
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
    </div>
  )
}

// ── Field helpers ──

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    cuisine_preferences: 'Cuisine Preferences',
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
  }
  return labels[field] || field.replace(/_/g, ' ')
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
  // Boolean fields
  if (['beverages_provided', 'dessert_provided', 'is_themed', 'children_present', 'has_competing_vendors', 'is_ticketed'].includes(field)) {
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
