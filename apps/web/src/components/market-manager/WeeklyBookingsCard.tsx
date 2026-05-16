import { createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Manager dashboard card showing weekly booth rental bookings at this
 * market. Phase C Stage 1 (2026-05-16) — read-only display.
 *
 * Source: weekly_booth_rentals (mig 139). Joined client-side to
 * vendor_profiles (for business_name) and market_booth_inventory (for
 * size_label). Three small queries + JS stitching — no Supabase
 * relationship-hint surprises, matches the pattern in
 * api/market-manager/[marketId]/vendors/route.ts.
 *
 * Renders nothing when there are no bookings — keeps the dashboard quiet
 * before vendors start booking.
 *
 * Stage 1 scope: display only. No inline booth-number editor (separate
 * piece — next session). No payment information (payment ships in
 * Stage 3 via Stripe).
 *
 * RLS: weekly_booth_rentals is default-deny — service client mandatory.
 * Auth verified UPSTREAM by the dashboard page's isMarketManager() check.
 */
interface WeeklyBookingsCardProps {
  marketId: string
  /** Market's IANA timezone — used to format week labels with no
   *  UTC-shift surprises. Optional; falls back to America/Chicago. */
  marketTimezone?: string | null
}

type RentalStatus = 'pending_payment' | 'paid' | 'cancelled' | 'completed'

interface RentalRow {
  id: string
  vendor_profile_id: string
  week_start_date: string
  inventory_id: string
  booth_number: string | null
  price_cents: number
  status: RentalStatus
  booked_at: string
}

function statusBadge(status: RentalStatus): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'paid':
      return { bg: '#d4edda', fg: '#155724', label: 'Paid' }
    case 'pending_payment':
      return { bg: '#fff3cd', fg: '#856404', label: 'Pending payment' }
    case 'cancelled':
      return { bg: '#f8d7da', fg: '#721c24', label: 'Cancelled' }
    case 'completed':
      return { bg: '#cce5ff', fg: '#004085', label: 'Completed' }
    default:
      return { bg: '#e9ecef', fg: '#495057', label: status }
  }
}

function formatWeek(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default async function WeeklyBookingsCard({ marketId }: WeeklyBookingsCardProps) {
  const serviceClient = createServiceClient()

  // 1. Bookings at this market, ordered by week_start_date DESC so
  //    upcoming weeks bubble to the top.
  const { data: rentalsRaw } = await serviceClient
    .from('weekly_booth_rentals')
    .select('id, vendor_profile_id, week_start_date, inventory_id, booth_number, price_cents, status, booked_at')
    .eq('market_id', marketId)
    .order('week_start_date', { ascending: false })
    .limit(50)

  const rentals: RentalRow[] = (rentalsRaw ?? []).map((r) => ({
    id: r.id as string,
    vendor_profile_id: r.vendor_profile_id as string,
    week_start_date: r.week_start_date as string,
    inventory_id: r.inventory_id as string,
    booth_number: (r.booth_number as string | null) ?? null,
    price_cents: r.price_cents as number,
    status: r.status as RentalStatus,
    booked_at: r.booked_at as string,
  }))

  // Quiet state — no bookings yet.
  if (rentals.length === 0) return null

  // 2 + 3. Stitch in vendor business names + inventory size labels.
  const vendorIds = Array.from(new Set(rentals.map((r) => r.vendor_profile_id)))
  const inventoryIds = Array.from(new Set(rentals.map((r) => r.inventory_id)))

  const [vendorsResult, inventoryResult] = await Promise.all([
    serviceClient
      .from('vendor_profiles')
      .select('id, profile_data')
      .in('id', vendorIds),
    serviceClient
      .from('market_booth_inventory')
      .select('id, size_label')
      .in('id', inventoryIds),
  ])

  const vendorNameById = new Map<string, string>()
  for (const v of vendorsResult.data ?? []) {
    const pd = (v.profile_data || {}) as { business_name?: string; farm_name?: string }
    vendorNameById.set(
      v.id as string,
      pd.business_name || pd.farm_name || 'Unknown vendor'
    )
  }

  const sizeLabelById = new Map<string, string>()
  for (const inv of inventoryResult.data ?? []) {
    sizeLabelById.set(inv.id as string, inv.size_label as string)
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <h2 style={{
        marginTop: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Weekly booth bookings
      </h2>
      <p style={{
        margin: 0,
        marginBottom: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        Bookings vendors have placed at your market. Online payment is
        coming — for now coordinate payment directly with each vendor.
        The most recent 50 bookings shown.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {rentals.map((r) => {
          const vendorName = vendorNameById.get(r.vendor_profile_id) || 'Unknown vendor'
          const sizeLabel = sizeLabelById.get(r.inventory_id) || '—'
          const badge = statusBadge(r.status)
          return (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.xs,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.sm,
                  color: colors.textPrimary,
                }}>
                  {vendorName}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                  Week of {formatWeek(r.week_start_date)} · {sizeLabel} · {formatPrice(r.price_cents)}
                  {r.booth_number && (
                    <> · Booth #{r.booth_number}</>
                  )}
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
