import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import BookBoothForm from '@/components/vendor/BookBoothForm'
import SeasonBookingSection from '@/components/vendor/SeasonBookingSection'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

/**
 * Vendor weekly booth booking page. Phase C Stage 1 (2026-05-16).
 *
 * Server component: auth-checks the user, fetches market + inventory,
 * verifies the vendor is approved at this market. Renders one of:
 *   - Login prompt (no user)
 *   - "Apply via invite link first" (no market_vendors row)
 *   - "Pending manager approval" (market_vendors.approved=false)
 *   - The booking form (approved=true)
 *
 * No Stripe integration — the form's submit hits
 * /api/vendor/markets/[id]/book which writes a row with
 * status='pending_payment'. Stage 3 ships Stripe Checkout on top.
 */
interface PageProps {
  params: Promise<{ vertical: string; id: string }>
  /** Phase C Stage 3 (2026-05-17): Stripe sets these on return.
   *  ?session=success&rental=<id>  → vendor completed Checkout.
   *  ?session=cancel               → vendor stepped away from Checkout. */
  searchParams: Promise<{ session?: string; rental?: string }>
}

interface InventoryRow {
  id: string
  size_label: string
  dimensions: string | null
  weekly_price_cents: number
}

/** Compute next N Sundays (inclusive of today if today IS Sunday) in
 *  the market's local timezone. Used to populate the week-picker. */
function nextSundays(timezone: string, count: number): string[] {
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
  const today = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate())
  // If today is Sunday (getDay() === 0), start there; otherwise step
  // forward to the upcoming Sunday.
  const daysUntilSunday = today.getDay() === 0 ? 0 : 7 - today.getDay()
  const firstSunday = new Date(today)
  firstSunday.setDate(today.getDate() + daysUntilSunday)
  const sundays: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(firstSunday)
    d.setDate(firstSunday.getDate() + i * 7)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    sundays.push(`${yyyy}-${mm}-${dd}`)
  }
  return sundays
}

export default async function BookBoothPage({ params, searchParams }: PageProps) {
  const { vertical, id: marketId } = await params
  const { session: sessionFlag } = await searchParams
  const returnFlash: 'success' | 'cancel' | undefined =
    sessionFlag === 'success' ? 'success'
    : sessionFlag === 'cancel' ? 'cancel'
    : undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch market regardless of auth state — needed for the public bail-out
  // copy ("you need to be a vendor at <market name> to book").
  const { data: market } = await supabase
    .from('markets')
    .select('id, name, vertical_id, timezone, address, city, state, stripe_charges_enabled')
    .eq('id', marketId)
    .maybeSingle()

  if (!market) {
    return (
      <Centered>
        <h1 style={headingStyle}>Market not found</h1>
        <p style={mutedStyle}>This market doesn&apos;t exist or has been removed.</p>
        <Link href={`/${vertical}`} style={primaryButtonStyle}>Back to home</Link>
      </Centered>
    )
  }

  if (!user) {
    const returnTo = `/${vertical}/markets/${marketId}/book`
    return (
      <Centered>
        <h1 style={headingStyle}>Sign in to book a booth at {market.name}</h1>
        <p style={mutedStyle}>
          Booth bookings require a vendor account. Sign in, or create an
          account to get started.
        </p>
        <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
          <Link
            href={`/${vertical}/login?returnTo=${encodeURIComponent(returnTo)}`}
            style={primaryButtonStyle}
          >
            Sign in
          </Link>
          <Link
            href={`/${vertical}/vendor-signup?market=${marketId}`}
            style={secondaryButtonStyle}
          >
            Create vendor account
          </Link>
        </div>
      </Centered>
    )
  }

  // Vendor profile in this market's vertical
  const { profile } = await getVendorProfileForVertical<{ id: string }>(
    supabase,
    user.id,
    market.vertical_id as string,
    'id'
  )

  if (!profile) {
    return (
      <Centered>
        <h1 style={headingStyle}>Vendor account required</h1>
        <p style={mutedStyle}>
          You need a vendor account in this vertical to book a booth at {market.name}.
        </p>
        <Link
          href={`/${vertical}/vendor-signup?market=${marketId}`}
          style={primaryButtonStyle}
        >
          Apply as a vendor at {market.name}
        </Link>
      </Centered>
    )
  }

  // Phase C Stage 3 design correction (2026-05-17): booth booking is an
  // open marketplace — no manager pre-approval gate. The vendor profile
  // + market existence are the only association checks. Availability +
  // payment enforce supply.
  // Service client — market_booth_inventory is RLS-deny for non-managers.
  const serviceClient = createServiceClient()

  // Fetch the inventory tiers + compute week options.
  const { data: inventoryRaw } = await serviceClient
    .from('market_booth_inventory')
    .select('id, size_label, dimensions, weekly_price_cents')
    .eq('market_id', marketId)
    .order('size_label', { ascending: true })

  const inventory: InventoryRow[] = (inventoryRaw ?? []).map((r) => ({
    id: r.id as string,
    size_label: r.size_label as string,
    dimensions: (r.dimensions as string | null) ?? null,
    weekly_price_cents: r.weekly_price_cents as number,
  }))

  if (inventory.length === 0) {
    return (
      <Centered>
        <h1 style={headingStyle}>No booths available</h1>
        <p style={mutedStyle}>
          The manager of {market.name} hasn&apos;t configured any booth size tiers
          yet. Check back later, or reach out to the manager directly.
        </p>
        <Link href={`/${vertical}/vendor/markets`} style={primaryButtonStyle}>
          Back to your markets
        </Link>
      </Centered>
    )
  }

  // Stripe-only booking model (2026-05-18). If the manager hasn't completed
  // Stripe Connect, vendors can't book through the platform — no offline-
  // payment fallback. The manager is free to take cash directly outside
  // the platform; that's just not handled here.
  if (market.stripe_charges_enabled !== true) {
    return (
      <Centered>
        <h1 style={headingStyle}>Online booking not available yet</h1>
        <p style={mutedStyle}>
          {market.name} isn&apos;t set up to accept online booth rentals yet
          — the manager hasn&apos;t finished their payment setup. Check back
          soon, or reach out to the market manager directly if you want to
          arrange a booth in the meantime.
        </p>
        <Link href={`/${vertical}/markets/${marketId}`} style={primaryButtonStyle}>
          Back to {market.name}
        </Link>
      </Centered>
    )
  }

  const weeks = nextSundays((market.timezone as string | null) || 'America/Chicago', 8)

  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <div style={{ marginBottom: spacing.md }}>
        <Link
          href={`/${vertical}/markets/${marketId}`}
          style={{ color: colors.textMuted, fontSize: typography.sizes.sm, textDecoration: 'none' }}
        >
          ← Back to {market.name}
        </Link>
      </div>
      <h1 style={headingStyle}>Book a booth at {market.name}</h1>
      <p style={mutedStyle}>
        Pick a week and a booth size. Your price is locked once you book — the
        manager can&apos;t change it after the fact. Payment is collected at
        booking via Stripe; the manager receives their portion automatically.
      </p>
      <BookBoothForm
        marketId={marketId}
        marketName={market.name as string}
        vertical={vertical}
        weeks={weeks}
        inventory={inventory}
        {...(returnFlash ? { returnFlash } : {})}
      />

      {/* Phase E — season pre-sale picker. Renders only when this market has
          OPEN seasons; otherwise the component returns null. */}
      <SeasonBookingSection marketId={marketId} />
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

const secondaryButtonStyle = {
  display: 'inline-block',
  padding: `${spacing.sm} ${spacing.md}`,
  backgroundColor: 'transparent',
  color: colors.primary,
  border: `2px solid ${colors.primary}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  textDecoration: 'none',
  cursor: 'pointer',
} as const

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <div style={{
        padding: spacing.lg,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}>
        {children}
      </div>
    </div>
  )
}
