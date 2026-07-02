import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import BookParkSpotForm from '@/components/vendor/BookParkSpotForm'

/**
 * Vendor food-truck park-spot booking page (FT-only).
 *
 * Server component: loads the park, its active spots, and its active
 * weekly schedule. Renders friendly bail-out copy for parks that aren't
 * ready to take paid bookings, otherwise hands off to BookParkSpotForm
 * which collects the spot + dates and posts to the booking API (Stripe
 * Checkout on success).
 *
 * park_spots + market_schedules are service-only (RLS-deny for vendors),
 * so this page reads with the service client.
 */
interface PageProps {
  params: Promise<{ vertical: string; id: string }>
}

interface SpotRow {
  id: string
  label: string
  max_length_ft: number | null
  power: 'shore' | 'generator_ok' | 'none'
  has_water: boolean
  base_price_cents: number
  recurring_eligible: boolean
}

interface PendingOccurrence {
  id: string
  bookingDate: string
  spotLabel: string | null
  priceCents: number
}

export default async function BookParkSpotPage({ params }: PageProps) {
  const { vertical, id } = await params

  const supabase = createServiceClient()

  const { data: market } = await supabase
    .from('markets')
    .select('id, name, vertical_id, park_mode, stripe_charges_enabled, timezone')
    .eq('id', id)
    .maybeSingle()

  if (!market || market.vertical_id !== 'food_trucks') {
    return (
      <BailOut vertical={vertical}>
        <h1 style={headingStyle}>Food-truck parks only</h1>
        <p style={mutedStyle}>This page is for food-truck parks.</p>
      </BailOut>
    )
  }

  if (market.park_mode !== 'paid') {
    return (
      <BailOut vertical={vertical}>
        <h1 style={headingStyle}>Bookings not open</h1>
        <p style={mutedStyle}>This park isn&apos;t taking paid spot bookings yet.</p>
      </BailOut>
    )
  }

  if (market.stripe_charges_enabled !== true) {
    return (
      <BailOut vertical={vertical}>
        <h1 style={headingStyle}>Payment setup incomplete</h1>
        <p style={mutedStyle}>This park hasn&apos;t finished payment setup yet.</p>
      </BailOut>
    )
  }

  const { data: spotsRaw } = await supabase
    .from('park_spots')
    .select('id, label, max_length_ft, power, has_water, base_price_cents, recurring_eligible')
    .eq('market_id', id)
    .eq('active', true)
    .order('label')

  const spots: SpotRow[] = (spotsRaw ?? []).map((s) => ({
    id: s.id as string,
    label: s.label as string,
    max_length_ft: (s.max_length_ft as number | null) ?? null,
    power: s.power as SpotRow['power'],
    has_water: s.has_water as boolean,
    base_price_cents: s.base_price_cents as number,
    recurring_eligible: (s.recurring_eligible as boolean | null) ?? false,
  }))

  if (spots.length === 0) {
    return (
      <BailOut vertical={vertical}>
        <h1 style={headingStyle}>No spots available</h1>
        <p style={mutedStyle}>No spots are available to book right now.</p>
      </BailOut>
    )
  }

  const { data: schedulesRaw } = await supabase
    .from('market_schedules')
    .select('day_of_week, start_time, end_time')
    .eq('market_id', id)
    .eq('active', true)

  const scheduleDows = Array.from(
    new Set((schedulesRaw ?? []).map((r) => r.day_of_week as number))
  ).sort((a, b) => a - b)

  // Recurring occurrences awaiting payment for THIS vendor at this park (P4b).
  // Auth-gated: anonymous visitors / non-FT vendors simply see none.
  let pendingOccurrences: PendingOccurrence[] = []
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (user) {
    const { profile } = await getVendorProfileForVertical<{ id: string }>(
      authClient, user.id, 'food_trucks', 'id'
    )
    if (profile) {
      const { data: occRaw } = await supabase
        .from('park_spot_bookings')
        .select('id, booking_date, price_cents, park_spots:spot_id ( label )')
        .eq('market_id', id)
        .eq('vendor_profile_id', profile.id)
        .eq('status', 'pending_payment')
        .not('standing_reservation_id', 'is', null)
        .order('booking_date', { ascending: true })

      pendingOccurrences = (occRaw ?? []).map((o) => {
        const rel = o.park_spots as { label: string | null } | { label: string | null }[] | null
        const spotLabel = Array.isArray(rel) ? (rel[0]?.label ?? null) : (rel?.label ?? null)
        return {
          id: o.id as string,
          bookingDate: o.booking_date as string,
          spotLabel,
          priceCents: o.price_cents as number,
        }
      })
    }
  }

  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <div style={{ marginBottom: spacing.md }}>
        <Link
          href={`/${vertical}/markets/${id}`}
          style={{ color: colors.textMuted, fontSize: typography.sizes.sm, textDecoration: 'none' }}
        >
          ← Back to {market.name}
        </Link>
      </div>
      <h1 style={headingStyle}>Book a spot at {market.name}</h1>
      <p style={mutedStyle}>
        Pick a spot and the day(s) you want to park. Payment is collected up
        front through Stripe — the park receives their portion automatically.
      </p>
      <BookParkSpotForm
        marketId={id}
        vertical={vertical}
        marketName={market.name as string}
        timezone={(market.timezone as string | null) ?? 'America/Chicago'}
        spots={spots}
        scheduleDows={scheduleDows}
        pendingOccurrences={pendingOccurrences}
      />
    </div>
  )
}

const headingStyle = {
  margin: 0,
  marginBottom: spacing.xs,
  fontSize: typography.sizes['2xl'],
  fontWeight: typography.weights.bold,
  color: colors.textPrimary,
} as const

const mutedStyle = {
  margin: 0,
  marginBottom: spacing.md,
  fontSize: typography.sizes.base,
  color: colors.textMuted,
  lineHeight: 1.5,
} as const

const primaryButtonStyle = {
  display: 'inline-block',
  padding: `${spacing.sm} ${spacing.md}`,
  backgroundColor: colors.primary,
  color: 'white',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  textDecoration: 'none',
  cursor: 'pointer',
} as const

function BailOut({ vertical, children }: { vertical: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <div style={{
        padding: spacing.lg,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        textAlign: 'center',
      }}>
        {children}
        <Link href={`/${vertical}`} style={primaryButtonStyle}>Back to home</Link>
      </div>
    </div>
  )
}
