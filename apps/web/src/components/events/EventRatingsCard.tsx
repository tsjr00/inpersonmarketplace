'use client'

import { useState, useEffect } from 'react'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'

/**
 * Read-only attendee-ratings summary for the organizer (Events Tier-1,
 * survey-3a). Shows the average star rating, count, and approved comments for
 * this event. Only admin-approved ratings are returned by the backend; the
 * organizer never sees pending or hidden feedback. Mounted in My Events next
 * to the other event cards.
 *
 * Backend: GET /api/events/[token]/ratings.
 */

interface EventRatingsCardProps {
  eventToken: string
  primaryColor: string
}

interface RatingRow {
  rating: number
  comment: string | null
  created_at: string
}

function stars(n: number): string {
  const full = Math.round(n)
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full)
}

export default function EventRatingsCard({ eventToken, primaryColor }: EventRatingsCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [average, setAverage] = useState<number | null>(null)
  const [ratings, setRatings] = useState<RatingRow[]>([])

  async function load() {
    try {
      const res = await fetch(`/api/events/${eventToken}/ratings`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCount(data.count ?? 0)
        setAverage(data.average ?? null)
        setRatings((data.ratings || []) as RatingRow[])
      } else {
        setLoadError(data.error || 'Could not load ratings.')
      }
    } catch {
      setLoadError('Network error loading ratings.')
    }
    setLoaded(true)
  }

  useEffect(() => {
    if (expanded && !loaded) queueMicrotask(() => { void load() })
  }, [expanded, loaded])

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
        {expanded ? '▾' : '▸'} Attendee ratings
        {loaded && !loadError && (
          <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, fontWeight: typography.weights.normal, marginLeft: spacing['2xs'] }}>
            {count > 0 ? `(${average} ★ · ${count})` : '(none yet)'}
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ marginTop: spacing.xs }}>
          {!loaded && !loadError && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>Loading…</p>
          )}
          {loadError && (
            <p style={{ fontSize: typography.sizes.sm, color: '#dc2626' }}>{loadError}</p>
          )}

          {loaded && !loadError && count === 0 && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, margin: 0 }}>
              No approved attendee ratings yet. Ratings appear here after attendees rate your event and the platform reviews them.
            </p>
          )}

          {loaded && !loadError && count > 0 && (
            <>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: spacing.xs,
                padding: spacing.xs, backgroundColor: statusColors.neutral50,
                border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.md,
                marginBottom: spacing.xs,
              }}>
                <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: statusColors.neutral800 }}>
                  {average}
                </span>
                <span style={{ color: '#f59e0b', fontSize: typography.sizes.base }} aria-hidden>{stars(average ?? 0)}</span>
                <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
                  {count} rating{count === 1 ? '' : 's'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                {ratings.filter((r) => r.comment).map((r, i) => (
                  <div key={i} style={{
                    padding: spacing.xs, backgroundColor: 'white',
                    border: `1px solid ${statusColors.neutral200}`, borderRadius: radius.sm,
                  }}>
                    <div style={{ color: '#f59e0b', fontSize: typography.sizes.sm }} aria-hidden>{stars(r.rating)}</div>
                    <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, margin: `${spacing['3xs']} 0 0`, lineHeight: 1.5 }}>
                      {r.comment}
                    </p>
                    <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400, margin: `${spacing['3xs']} 0 0` }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                {ratings.every((r) => !r.comment) && (
                  <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: 0 }}>
                    No written comments — the score above reflects star ratings only.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
