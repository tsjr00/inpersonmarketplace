export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { calculateBoothRentalFees } from '@/lib/pricing'

/**
 * Vendor "My Bookings" page — read-only list of the authenticated vendor's
 * weekly booth rentals across markets. Phase C Stage 3 follow-up
 * (Fix-9 / Session 83, 2026-05-19).
 *
 * Server-component + auth pattern mirrored from vendor/upcoming/page.tsx
 * (createClient → getUser → fetch vendor_profile → redirect to dashboard).
 * Uses createServiceClient for weekly_booth_rentals reads because mig 139
 * enabled default-deny RLS on the table — same justification as the
 * manager-side card at components/market-manager/WeeklyBookingsCard.tsx:21-22.
 * Auth is verified UPSTREAM (vendor_profile.user_id == auth user) and the
 * query filters by vendor_profile_id, so the service client only returns
 * rows the vendor owns.
 *
 * Stitching pattern (markets + market_booth_inventory in parallel) mirrors
 * WeeklyBookingsCard.tsx:70-97.
 *
 * Vendor-paid amount via calculateBoothRentalFees(price_cents).vendorPaysCents
 * — the same number Stripe charged at booking time. Matches the BookBoothForm
 * price display.
 *
 * READ-ONLY v1. No cancellation buttons here — cancellation flow with the
 * 3-day cutoff rule lives in Fix-10 (separate session).
 */

interface PageProps {
  params: Promise<{ vertical: string }>
}

type RentalStatus = 'pending_payment' | 'paid' | 'cancelled' | 'completed'

interface RentalRow {
  id: string
  market_id: string
  week_start_date: string
  inventory_id: string
  booth_number: string | null
  price_cents: number
  status: RentalStatus
  booked_at: string
  paid_at: string | null
}

function statusBadge(status: string): { bg: string; fg: string; label: string } {
  // Same colors + labels as the manager-side list
  // (components/market-manager/WeeklyBookingsList.tsx:38-51)
  switch (status) {
    case 'paid': return { bg: '#d4edda', fg: '#155724', label: 'Paid' }
    case 'pending_payment': return { bg: '#fff3cd', fg: '#856404', label: 'Pending payment' }
    case 'cancelled': return { bg: '#f8d7da', fg: '#721c24', label: 'Cancelled' }
    case 'completed': return { bg: '#cce5ff', fg: '#004085', label: 'Completed' }
    default: return { bg: '#e9ecef', fg: '#495057', label: status }
  }
}

function formatWeek(yyyyMmDd: string): string {
  // Parse in local time — week_start_date is a DATE column (timezone-naive);
  // parsing as ISO would shift by UTC offset.
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

export default async function VendorBookingsPage({ params }: PageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) redirect(`/${vertical}/vendor/dashboard`)

  const serviceClient = createServiceClient()

  const { data: rentalsRaw } = await serviceClient
    .from('weekly_booth_rentals')
    .select('id, market_id, week_start_date, inventory_id, booth_number, price_cents, status, booked_at, paid_at')
    .eq('vendor_profile_id', vendorProfile.id)
    .order('week_start_date', { ascending: false })
    .limit(100)

  const rentals: RentalRow[] = (rentalsRaw ?? []).map((r) => ({
    id: r.id as string,
    market_id: r.market_id as string,
    week_start_date: r.week_start_date as string,
    inventory_id: r.inventory_id as string,
    booth_number: (r.booth_number as string | null) ?? null,
    price_cents: r.price_cents as number,
    status: r.status as RentalStatus,
    booked_at: r.booked_at as string,
    paid_at: (r.paid_at as string | null) ?? null,
  }))

  // Empty state
  if (rentals.length === 0) {
    return (
      <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
        <div style={{ marginBottom: spacing.md }}>
          <Link href={`/${vertical}/vendor/dashboard`} style={{
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            textDecoration: 'none',
          }}>
            ← Back to dashboard
          </Link>
        </div>
        <h1 style={{
          margin: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold,
          color: colors.textPrimary,
        }}>
          My booth bookings
        </h1>
        <p style={{
          margin: 0,
          marginBottom: spacing.md,
          color: colors.textMuted,
          fontSize: typography.sizes.base,
          lineHeight: 1.5,
        }}>
          You don&apos;t have any booth bookings yet. Browse markets to find a spot.
        </p>
        <Link
          href={`/${vertical}/vendor/markets`}
          style={{
            display: 'inline-block',
            padding: `${spacing.sm} ${spacing.md}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            textDecoration: 'none',
          }}
        >
          Find a market to book at →
        </Link>
      </div>
    )
  }

  // Stitch market name + size label — parallel queries mirror
  // components/market-manager/WeeklyBookingsCard.tsx:70-97
  const marketIds = Array.from(new Set(rentals.map((r) => r.market_id)))
  const inventoryIds = Array.from(new Set(rentals.map((r) => r.inventory_id)))

  const [marketsResult, inventoryResult] = await Promise.all([
    serviceClient.from('markets').select('id, name').in('id', marketIds),
    serviceClient.from('market_booth_inventory').select('id, size_label').in('id', inventoryIds),
  ])

  const marketNameById = new Map<string, string>()
  for (const m of marketsResult.data ?? []) {
    marketNameById.set(m.id as string, (m.name as string) || 'Unknown market')
  }
  const sizeLabelById = new Map<string, string>()
  for (const inv of inventoryResult.data ?? []) {
    sizeLabelById.set(inv.id as string, inv.size_label as string)
  }

  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <div style={{ marginBottom: spacing.md }}>
        <Link href={`/${vertical}/vendor/dashboard`} style={{
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          textDecoration: 'none',
        }}>
          ← Back to dashboard
        </Link>
      </div>
      <h1 style={{
        margin: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        My booth bookings
      </h1>
      <p style={{
        margin: 0,
        marginBottom: spacing.md,
        color: colors.textMuted,
        fontSize: typography.sizes.base,
        lineHeight: 1.5,
      }}>
        All of your weekly booth rentals across markets, most recent first.
        {' '}
        {rentals.length} total.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {rentals.map((r) => {
          const badge = statusBadge(r.status)
          const marketName = marketNameById.get(r.market_id) ?? 'Unknown market'
          const sizeLabel = sizeLabelById.get(r.inventory_id) ?? '—'
          const fees = calculateBoothRentalFees(r.price_cents)
          return (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.sm,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.base,
                  color: colors.textPrimary,
                }}>
                  {marketName}
                </div>
                <div style={{
                  fontSize: typography.sizes.sm,
                  color: colors.textMuted,
                  marginTop: spacing['3xs'],
                }}>
                  Week of {formatWeek(r.week_start_date)} · {sizeLabel}
                  {r.booth_number ? ` · Booth ${r.booth_number}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  color: colors.textPrimary,
                }}>
                  {formatPrice(fees.vendorPaysCents)}
                </div>
                <div style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                  marginTop: spacing['3xs'],
                }}>
                  total
                </div>
              </div>
              <span style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: badge.bg,
                color: badge.fg,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                whiteSpace: 'nowrap',
              }}>
                {badge.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
