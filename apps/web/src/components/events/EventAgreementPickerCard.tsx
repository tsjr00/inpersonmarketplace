'use client'

import { useState, useEffect } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { groupStatementsByCategory, type OptinStatement } from '@/lib/markets/optin-types'

/**
 * Organizer-facing picker for the event's vendor agreement (Events Tier-1).
 *
 * The organizer chooses which commitments become part of every vendor's
 * agreement for THIS event; a vendor accepts them when they respond to the
 * invitation (recorded as a snapshot — see vendor/events/[marketId]/respond).
 * Event statements have no fill-in placeholders, so this is a simple grouped
 * checkbox list. Mounted in the organizer's My Events card next to the
 * broadcast composer.
 *
 * Backend: GET/PUT /api/events/[token]/agreement.
 */

interface EventAgreementPickerCardProps {
  eventToken: string
  primaryColor: string
}

export default function EventAgreementPickerCard({ eventToken, primaryColor }: EventAgreementPickerCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [catalog, setCatalog] = useState<OptinStatement[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch(`/api/events/${eventToken}/agreement`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCatalog((data.catalog || []) as OptinStatement[])
        setChecked(new Set<string>(data.selected || []))
      } else {
        setLoadError(data.error || 'Could not load the agreement options.')
        setCatalog([])
      }
    } catch {
      setLoadError('Network error loading agreement options.')
      setCatalog([])
    }
    setLoaded(true)
  }

  useEffect(() => {
    if (expanded && !loaded) queueMicrotask(() => { void load() })
  }, [expanded, loaded])

  function toggle(id: string) {
    setMessage(null)
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/events/${eventToken}/agreement`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement_ids: Array.from(checked) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage(`Saved — ${checked.size} statement${checked.size === 1 ? '' : 's'} in this event's vendor agreement.`)
      } else {
        setMessage(data.error || 'Could not save. Please try again.')
      }
    } catch {
      setMessage('Network error. Please try again.')
    }
    setSaving(false)
  }

  const grouped = catalog ? groupStatementsByCategory(catalog) : []

  return (
    <div style={{ marginTop: spacing.xs }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: typography.sizes.sm, color: primaryColor, fontWeight: typography.weights.semibold,
          display: 'flex', alignItems: 'center', gap: spacing['3xs'],
        }}
      >
        {expanded ? '▾' : '▸'} Vendor agreement
        {loaded && catalog && (
          <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, fontWeight: typography.weights.normal, marginLeft: spacing['2xs'] }}>
            ({checked.size} selected)
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: spacing.xs }}>
          <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `0 0 ${spacing.xs}`, lineHeight: 1.5 }}>
            Choose the commitments each vendor agrees to for this event. Vendors accept them when they respond to your
            invitation, and their acceptance is recorded. You can change these until vendors respond — later changes
            ask already-accepted vendors to re-accept.
          </p>

          {!loaded && !loadError && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>Loading…</p>
          )}
          {loadError && (
            <p style={{ fontSize: typography.sizes.sm, color: '#dc2626' }}>{loadError}</p>
          )}

          {loaded && catalog && catalog.length === 0 && !loadError && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>
              No agreement statements are available yet.
            </p>
          )}

          {grouped.map((group) => (
            <div key={group.category} style={{ marginBottom: spacing.sm }}>
              <div style={{
                fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
                color: statusColors.neutral500, textTransform: 'uppercase', letterSpacing: '0.5px',
                marginBottom: spacing['2xs'],
              }}>
                {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                {group.statements.map((stmt) => {
                  const isChecked = checked.has(stmt.id)
                  return (
                    <label
                      key={stmt.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: spacing.xs,
                        padding: spacing.xs,
                        backgroundColor: isChecked ? '#f0fdf4' : 'white',
                        border: `1px solid ${isChecked ? '#86efac' : statusColors.neutral200}`,
                        borderRadius: radius.sm, cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(stmt.id)}
                        style={{ marginTop: 3, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
                        {stmt.statement}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}

          {loaded && catalog && catalog.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }}>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: `${spacing['3xs']} ${spacing.sm}`, backgroundColor: primaryColor, color: 'white',
                  border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save agreement'}
              </button>
            </div>
          )}

          {message && (
            <p style={{ fontSize: typography.sizes.xs, color: message.startsWith('Saved') ? '#166534' : '#dc2626', marginTop: spacing['2xs'] }}>
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
