export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getBoothMapUrl } from '@/lib/markets/booth-map'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { calculateBoothRentalFees } from '@/lib/pricing'

/**
 * Food-truck "My park bookings" page — tester finding P9 (2026-07-15).
 *
 * Read-only list of the authenticated truck's park spot bookings across
 * parks, with the DATES the tester couldn't find anywhere. FT sibling of
 * vendor/bookings (which is FM-booth-shaped); kept separate because the
 * two rental models share no tables.
 *
 * Auth + service-client pattern mirrors vendor/bookings/page.tsx:
 * park_spot_bookings is default-deny RLS (mig 172, service-only); auth is
 * verified upstream and the query filters by the caller's own
 * vendor_profile_id, so the service client only returns rows the truck owns.
 *
 * Vendor-paid amount via calculateBoothRentalFees(price_cents).vendorPaysCents
 * — the same number Stripe charged at booking time (pay/book routes).
 */

interface PageProps {
  params: Promise<{ vertical: string }>
}

interface BookingRow {
  id: string
  market_id: string
  spot_id: string
  booking_date: string
  price_cents: number
  status: string
  standing_reservation_id: string | null
  paid_at: string | null
}

function statusBadge(status: string): { bg: string; fg: string; label: string } {
  // Same palette as vendor/bookings/page.tsx statusBadge
  switch (status) {
    case 'paid': return { bg: '#d4edda', fg: '#155724', label: 'Paid' }
    case 'pending_payment': return { bg: '#fff3cd', fg: '#856404', label: 'Pending payment' }
    case 'cancelled': return { bg: '#f8d7da', fg: '#721c24', label: 'Cancelled' }
    case 'completed': return { bg: '#cce5ff', fg: '#004085', label: 'Completed' }
    case 'expired': return { bg: '#e9ecef', fg: '#495057', label: 'Expired' }
    default: return { bg: '#e9ecef', fg: '#495057', label: status }
  }
}

function formatDate(yyyyMmDd: string): string {
  // DATE column (timezone-naive) — parse in local time to avoid a UTC shift
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

export default async function VendorParkBookingsPage({ params }: PageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('vertical_id', 'food_trucks')
    .single()

  if (!vendorProfile) redirect(`/${vertical}/vendor/dashboard`)

  const serviceClient = createServiceClient()

  const { data: bookingsRaw } = await serviceClient
    .from('park_spot_bookings')
    .select('id, market_id, spot_id, booking_date, price_cents, status, standing_reservation_id, paid_at')
    .eq('vendor_profile_id', vendorProfile.id)
    .order('booking_date', { ascending: false })
    .limit(100)

  const bookings: BookingRow[] = (bookingsRaw ?? []).map((b) => ({
    id: b.id as string,
    market_id: b.market_id as string,
    spot_id: b.spot_id as string,
    booking_date: b.booking_date as string,
    price_cents: b.price_cents as number,
    status: b.status as string,
    standing_reservation_id: (b.standing_reservation_id as string | null) ?? null,
    paid_at: (b.paid_at as string | null) ?? null,
  }))

  if (bookings.length === 0) {
    return (
      <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
        <div style={{ marginBottom: spacing.md }}>
          <Link href={`/${vertical}/vendor/dashboard`} style={{ color: colors.textMuted, fontSize: typography.sizes.sm, textDecoration: 'none' }}>
            ← Back to dashboard
          </Link>
        </div>
        <h1 style={h1Style}>My park bookings</h1>
        <p style={introStyle}>
          You haven&apos;t booked any park spots yet. Find a food truck park and book a day.
        </p>
        <Link href={`/${vertical}/vendor/markets`} style={ctaStyle}>
          Find a park to book at →
        </Link>
      </div>
    )
  }

  // Stitch park names + spot labels (parallel; mirrors vendor/bookings)
  const marketIds = Array.from(new Set(bookings.map((b) => b.market_id)))
  const spotIds = Array.from(new Set(bookings.map((b) => b.spot_id)))
  const [marketsResult, spotsResult] = await Promise.all([
    serviceClient.from('markets').select('id, name').in('id', marketIds),
    serviceClient.from('park_spots').select('id, label').in('id', spotIds),
  ])
  const marketNameById = new Map<string, string>()
  for (const m of marketsResult.data ?? []) {
    marketNameById.set(m.id as string, (m.name as string) || 'Unknown park')
  }
  const spotLabelById = new Map<string, string>()
  for (const s of spotsResult.data ?? []) {
    spotLabelById.set(s.id as string, (s.label as string) || 'Spot')
  }

  // Spot map per park (mig 205) — tolerant reads so this renders pre-migration.
  const boothMapByMarket = new Map<string, string>()
  await Promise.all(marketIds.map(async (mid) => {
    const url = await getBoothMapUrl(serviceClient, mid)
    if (url) boothMapByMarket.set(mid, url)
  }))

  const todayYmd = new Date().toISOString().slice(0, 10)
  const upcoming = bookings.filter((b) => b.booking_date >= todayYmd).sort((a, b) => a.booking_date.localeCompare(b.booking_date))
  const past = bookings.filter((b) => b.booking_date < todayYmd)

  const renderRow = (b: BookingRow) => {
    const badge = statusBadge(b.status)
    const vendorPaid = calculateBoothRentalFees(b.price_cents).vendorPaysCents
    return (
      <li key={b.id} style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceElevated,
      }}>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
            {formatDate(b.booking_date)}
          </div>
          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
            {marketNameById.get(b.market_id) ?? 'Unknown park'} · {spotLabelById.get(b.spot_id) ?? 'Spot'}
            {b.standing_reservation_id ? ' · weekly hold' : ''}
          </div>
          {boothMapByMarket.has(b.market_id) && (
            <a
              href={boothMapByMarket.get(b.market_id)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: spacing['3xs'],
                fontSize: typography.sizes.xs,
                color: colors.primary,
                textDecoration: 'none',
                fontWeight: typography.weights.semibold,
              }}
            >
              📍 View spot map
            </a>
          )}
        </div>
        <span style={{
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          padding: `${spacing['3xs']} ${spacing.xs}`,
          borderRadius: radius.sm,
          backgroundColor: badge.bg,
          color: badge.fg,
        }}>
          {badge.label}
        </span>
        <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, whiteSpace: 'nowrap' }}>
          {formatPrice(vendorPaid)}
        </span>
      </li>
    )
  }

  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <div style={{ marginBottom: spacing.md }}>
        <Link href={`/${vertical}/vendor/dashboard`} style={{ color: colors.textMuted, fontSize: typography.sizes.sm, textDecoration: 'none' }}>
          ← Back to dashboard
        </Link>
      </div>
      <h1 style={h1Style}>My park bookings</h1>
      <p style={introStyle}>
        Every park spot you&apos;ve booked — the date, the park, the spot, and what you paid.
        Check in through the platform on each day you operate.
      </p>

      {upcoming.length > 0 && (
        <>
          <h2 style={h2Style}>Upcoming</h2>
          <ul style={listStyle}>{upcoming.map(renderRow)}</ul>
        </>
      )}
      {past.length > 0 && (
        <>
          <h2 style={h2Style}>Past</h2>
          <ul style={listStyle}>{past.map(renderRow)}</ul>
        </>
      )}
    </div>
  )
}

const h1Style = {
  margin: 0,
  marginBottom: spacing.xs,
  fontSize: typography.sizes['2xl'],
  fontWeight: typography.weights.bold,
  color: colors.textPrimary,
} as const

const h2Style = {
  margin: 0,
  marginTop: spacing.md,
  marginBottom: spacing.xs,
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.bold,
  color: colors.textPrimary,
} as const

const introStyle = {
  margin: 0,
  marginBottom: spacing.md,
  color: colors.textMuted,
  fontSize: typography.sizes.base,
  lineHeight: 1.5,
} as const

const listStyle = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
} as const

const ctaStyle = {
  display: 'inline-block',
  padding: `${spacing.sm} ${spacing.md}`,
  backgroundColor: colors.primary,
  color: 'white',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  textDecoration: 'none',
} as const
