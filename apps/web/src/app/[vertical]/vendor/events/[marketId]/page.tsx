'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'

interface EventDetails {
  market_id: string
  market_name: string
  event_date: string
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  headcount: number
  address: string
  city: string
  state: string
  zip: string
  company_name: string
  cuisine_preferences: string | null
  dietary_notes: string | null
  setup_instructions: string | null
  vendor_count: number
  response_status: string | null
  response_notes: string | null
  accepted_count: number
}

const verticalAccent: Record<string, string> = {
  food_trucks: '#ff5757',
  farmers_market: '#2d5016',
}

export default function VendorCateringDetailPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const marketId = params.marketId as string
  const accent = verticalAccent[vertical] || verticalAccent.farmers_market

  const [details, setDetails] = useState<EventDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [responding, setResponding] = useState(false)
  const [responseNotes, setResponseNotes] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId])

  async function fetchDetails() {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}`)
      if (res.ok) {
        const data = await res.json()
        setDetails(data.event)
      } else {
        const err = await res.json()
        setError(err.error || 'Failed to load event details')
      }
    } catch {
      setError('Network error')
    }
    setLoading(false)
  }

  async function handleRespond(status: 'accepted' | 'declined') {
    setResponding(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/vendor/events/${marketId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_status: status,
          response_notes: responseNotes.trim() || null,
        }),
      })
      if (res.ok) {
        setActionMessage(
          status === 'accepted'
            ? 'You accepted this catering invitation!'
            : 'You declined this invitation.'
        )
        setDetails((prev) =>
          prev ? { ...prev, response_status: status } : prev
        )
      } else {
        const err = await res.json()
        setActionMessage(`Error: ${err.error}`)
      }
    } catch {
      setActionMessage('Network error')
    }
    setResponding(false)
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
        <p style={{ color: statusColors.neutral500 }}>Loading event details...</p>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
        <p style={{ color: statusColors.danger }}>{error || 'Event not found'}</p>
        <Link href={`/${vertical}/dashboard`} style={{ color: accent, fontSize: typography.sizes.sm }}>
          ← Back to Dashboard
        </Link>
      </div>
    )
  }

  const headcountPerTruck =
    details.accepted_count > 0
      ? Math.ceil(details.headcount / details.accepted_count)
      : Math.ceil(details.headcount / details.vendor_count)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
      <Link
        href={`/${vertical}/dashboard`}
        style={{
          color: statusColors.neutral500,
          textDecoration: 'none',
          fontSize: typography.sizes.sm,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: spacing.md,
        }}
      >
        ← Back to Dashboard
      </Link>

      {/* Header */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing['2xs'] }}>
          <span style={{ ...sizing.badge, backgroundColor: statusColors.infoLight, color: statusColors.infoDark }}>
            {term(vertical, 'event_feature_name')}
          </span>
          {details.response_status && (
            <span
              style={{
                ...sizing.badge,
                backgroundColor:
                  details.response_status === 'accepted'
                    ? statusColors.successLight
                    : details.response_status === 'declined'
                      ? statusColors.dangerLight
                      : statusColors.warningLight,
                color:
                  details.response_status === 'accepted'
                    ? statusColors.successDark
                    : details.response_status === 'declined'
                      ? statusColors.dangerDark
                      : statusColors.warningDark,
                textTransform: 'capitalize',
              }}
            >
              {details.response_status}
            </span>
          )}
        </div>
        <h1
          style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: statusColors.neutral900,
            margin: `0 0 ${spacing['2xs']}`,
          }}
        >
          {details.market_name}
        </h1>
        <p style={{ color: statusColors.neutral500, margin: 0, fontSize: typography.sizes.sm }}>
          {details.company_name}
        </p>
      </div>

      {actionMessage && (
        <div
          style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            marginBottom: spacing.md,
            borderRadius: radius.md,
            backgroundColor: actionMessage.startsWith('Error')
              ? statusColors.dangerLight
              : statusColors.successLight,
            color: actionMessage.startsWith('Error')
              ? statusColors.danger
              : statusColors.successDark,
            fontSize: typography.sizes.sm,
          }}
        >
          {actionMessage}
        </div>
      )}

      {/* Key details cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: spacing.sm,
          marginBottom: spacing.lg,
        }}
      >
        <InfoCard
          label="Event Date"
          value={fmtDate(details.event_date)}
          sub={
            details.event_end_date && details.event_end_date !== details.event_date
              ? `through ${fmtDate(details.event_end_date)}`
              : undefined
          }
        />
        <InfoCard
          label="Your Est. Headcount"
          value={`~${headcountPerTruck} people`}
          sub={`${details.headcount} total / ${details.accepted_count || details.vendor_count} ${term(vertical, 'event_vendor_unit')}s`}
        />
        {(details.event_start_time || details.event_end_time) && (
          <InfoCard
            label="Time"
            value={`${details.event_start_time?.slice(0, 5) || '?'} — ${details.event_end_time?.slice(0, 5) || '?'}`}
          />
        )}
        <InfoCard
          label="Location"
          value={`${details.city}, ${details.state}`}
          sub={details.address}
        />
      </div>

      {/* Preferences */}
      {(details.cuisine_preferences || details.dietary_notes) && (
        <div
          style={{
            padding: spacing.sm,
            backgroundColor: statusColors.neutral50,
            border: `1px solid ${statusColors.neutral200}`,
            borderRadius: radius.md,
            marginBottom: spacing.md,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: statusColors.neutral700,
              margin: `0 0 ${spacing['2xs']}`,
            }}
          >
            Client Preferences
          </h3>
          {details.cuisine_preferences && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: `0 0 ${spacing['3xs']}`, lineHeight: 1.5 }}>
              <strong>Cuisine:</strong> {details.cuisine_preferences}
            </p>
          )}
          {details.dietary_notes && (
            <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, margin: 0, lineHeight: 1.5 }}>
              <strong>Dietary:</strong> {details.dietary_notes}
            </p>
          )}
        </div>
      )}

      {/* Setup instructions */}
      {details.setup_instructions && (
        <div
          style={{
            padding: spacing.sm,
            backgroundColor: statusColors.warningLight,
            border: `1px solid ${statusColors.warningBorder}`,
            borderRadius: radius.md,
            marginBottom: spacing.md,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: statusColors.warningDark,
              margin: `0 0 ${spacing['2xs']}`,
            }}
          >
            Setup Instructions
          </h3>
          <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, margin: 0, lineHeight: 1.5 }}>
            {details.setup_instructions}
          </p>
        </div>
      )}

      {/* Response section */}
      {details.response_status === 'invited' && (
        <div
          style={{
            padding: spacing.md,
            border: `2px solid ${accent}`,
            borderRadius: radius.lg,
            marginBottom: spacing.md,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: statusColors.neutral800,
              margin: `0 0 ${spacing.xs}`,
            }}
          >
            Respond to This Invitation
          </h3>
          <div style={{ marginBottom: spacing.sm }}>
            <label
              style={{
                display: 'block',
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                color: statusColors.neutral600,
                marginBottom: spacing['3xs'],
              }}
            >
              Notes (optional)
            </label>
            <textarea
              placeholder="Any questions or comments for the organizer..."
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              style={{
                width: '100%',
                padding: sizing.control.padding,
                border: `1px solid ${statusColors.neutral300}`,
                borderRadius: radius.md,
                fontSize: sizing.control.fontSize,
                minHeight: '60px',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <button
              onClick={() => handleRespond('accepted')}
              disabled={responding}
              style={{
                flex: 1,
                ...sizing.cta,
                fontWeight: typography.weights.semibold,
                backgroundColor: responding ? '#ccc' : statusColors.success,
                color: 'white',
                border: 'none',
                cursor: responding ? 'not-allowed' : 'pointer',
              }}
            >
              {responding ? 'Sending...' : 'Accept'}
            </button>
            <button
              onClick={() => handleRespond('declined')}
              disabled={responding}
              style={{
                flex: 1,
                ...sizing.cta,
                fontWeight: typography.weights.semibold,
                backgroundColor: 'white',
                color: statusColors.danger,
                border: `2px solid ${statusColors.danger}`,
                cursor: responding ? 'not-allowed' : 'pointer',
              }}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* If accepted, show next steps */}
      {details.response_status === 'accepted' && (
        <div
          style={{
            padding: spacing.md,
            backgroundColor: statusColors.successLight,
            border: `1px solid ${statusColors.successBorder}`,
            borderRadius: radius.lg,
          }}
        >
          <h3
            style={{
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: statusColors.successDark,
              margin: `0 0 ${spacing.xs}`,
            }}
          >
            Next Steps
          </h3>
          <ol
            style={{
              margin: 0,
              paddingLeft: spacing.md,
              display: 'flex',
              flexDirection: 'column',
              gap: spacing['2xs'],
            }}
          >
            <li style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
              Add your event menu items to the{' '}
              <Link href={`/${vertical}/markets/${marketId}`} style={{ color: accent, fontWeight: typography.weights.semibold }}>
                event market page
              </Link>
            </li>
            <li style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
              Keep your menu focused — just what you want to sell at this event
            </li>
            <li style={{ fontSize: typography.sizes.sm, color: statusColors.neutral700, lineHeight: 1.5 }}>
              Pre-orders will arrive before the event so you can prep exactly what&apos;s needed
            </li>
          </ol>
        </div>
      )}
    </div>
  )
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      style={{
        padding: spacing.sm,
        backgroundColor: 'white',
        border: `1px solid ${statusColors.neutral200}`,
        borderRadius: radius.md,
      }}
    >
      <p
        style={{
          margin: `0 0 ${spacing['3xs']}`,
          fontSize: typography.sizes.xs,
          color: statusColors.neutral500,
          fontWeight: typography.weights.semibold,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: statusColors.neutral800,
        }}
      >
        {value}
      </p>
      {sub && (
        <p
          style={{
            margin: `${spacing['3xs']} 0 0`,
            fontSize: typography.sizes.xs,
            color: statusColors.neutral400,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  )
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
