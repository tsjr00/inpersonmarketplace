'use client'

import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Renders a market's public-facing details (location, schedule,
 * description) for the invite-link landing pages. Used by both
 * State A (anonymous) and State C (existing-vendor) on the
 * vendor-signup invite flow so the visitor sees what they're
 * applying to.
 *
 * Data source: `/api/markets/[id]/optin-public` returns the fields
 * this block needs. The parent fetches and passes them in.
 *
 * All fields are optional. The block renders only whatever's present
 * — empty sections collapse so half-set-up markets still look fine.
 */
interface MarketDetail {
  description: string | null
  address: string | null
  city: string | null
  state: string | null
  website: string | null
  logo_url?: string | null
  schedules: Array<{
    day_of_week: number
    start_time: string | null
    end_time: string | null
  }>
}

interface MarketDetailBlockProps {
  detail: MarketDetail
  marketLabel: string
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** Format "HH:MM:SS" or "HH:MM" → "9:00 AM". Returns the raw input
 *  if it doesn't match. */
function formatTime(t: string | null): string {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`
}

function formatSchedule(s: MarketDetail['schedules'][number]): string {
  const day = DAYS[s.day_of_week] ?? 'Unknown'
  const start = formatTime(s.start_time)
  const end = formatTime(s.end_time)
  if (!start && !end) return day
  return `${day} ${start}${start && end ? ' – ' : ''}${end}`
}

export default function MarketDetailBlock({
  detail,
  marketLabel,
}: MarketDetailBlockProps) {
  const cityState = [detail.city, detail.state].filter(Boolean).join(', ')
  const hasAddress = !!(detail.address || cityState)
  const hasSchedule = detail.schedules.length > 0
  const hasDescription = !!detail.description
  const hasWebsite = !!detail.website
  const anyDetail = hasAddress || hasSchedule || hasDescription || hasWebsite

  // Nothing to show — render nothing (parent's intro copy still gives
  // context). Avoids an empty card on barely-set-up markets.
  if (!anyDetail) return null

  return (
    <div style={{
      marginTop: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
      backgroundColor: colors.surfaceBase,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
    }}>
      {/* Logo + heading row — logo only renders if the manager uploaded
          one (mig 140, Phase B co-branding). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' }}>
        {detail.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={detail.logo_url}
            alt={`${marketLabel} logo`}
            style={{
              width: 64,
              height: 64,
              objectFit: 'contain',
              borderRadius: radius.sm,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceBase,
              flexShrink: 0,
            }}
          />
        )}
        <h3 style={{
          margin: 0,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          About {marketLabel}
        </h3>
      </div>

      {hasDescription && (
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          lineHeight: 1.6,
        }}>
          {detail.description}
        </p>
      )}

      {hasAddress && (
        <div style={{
          marginBottom: spacing.xs,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          lineHeight: 1.5,
        }}>
          <strong style={{ color: colors.textMuted, fontWeight: typography.weights.semibold, marginRight: spacing['2xs'] }}>Location:</strong>
          {[detail.address, cityState].filter(Boolean).join(' · ')}
        </div>
      )}

      {hasSchedule && (
        <div style={{
          marginBottom: spacing.xs,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          lineHeight: 1.5,
        }}>
          <strong style={{ color: colors.textMuted, fontWeight: typography.weights.semibold, marginRight: spacing['2xs'] }}>Hours:</strong>
          {detail.schedules.map((s, i) => (
            <span key={i} style={{ marginRight: spacing.sm }}>{formatSchedule(s)}</span>
          ))}
        </div>
      )}

      {hasWebsite && (
        <div style={{
          marginTop: spacing.xs,
          fontSize: typography.sizes.sm,
        }}>
          <strong style={{ color: colors.textMuted, fontWeight: typography.weights.semibold, marginRight: spacing['2xs'] }}>Website:</strong>
          <a href={detail.website ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: 'underline' }}>
            {detail.website}
          </a>
        </div>
      )}
    </div>
  )
}
