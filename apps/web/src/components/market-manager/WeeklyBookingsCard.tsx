import { createServiceClient } from '@/lib/supabase/server'
import WeeklyBookingsList, { type WeeklyBookingRow } from '@/components/market-manager/WeeklyBookingsList'
import DashboardCard from '@/components/dashboard/DashboardCard'
import { term } from '@/lib/vertical/terminology'

/**
 * Manager dashboard card showing weekly booth rental bookings at this
 * market. Phase C Stage 1 (2026-05-16); Stage 1A (2026-05-17) added
 * inline booth-number editor via the client child <WeeklyBookingsList>.
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
 * Payment information NOT shown — payment ships in Stage 3 via Stripe.
 *
 * RLS: weekly_booth_rentals is default-deny — service client mandatory.
 * Auth verified UPSTREAM by the dashboard page's isMarketManager() check.
 */
interface WeeklyBookingsCardProps {
  marketId: string
  vertical: string
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

export default async function WeeklyBookingsCard({ marketId, vertical }: WeeklyBookingsCardProps) {
  const serviceClient = createServiceClient()

  // 1. Bookings at this market, ordered by week_start_date DESC so
  //    upcoming weeks bubble to the top.
  const { data: rentalsRaw } = await serviceClient
    .from('weekly_booth_rentals')
    .select('id, vendor_profile_id, week_start_date, inventory_id, booth_number, price_cents, status, booked_at')
    .eq('market_id', marketId)
    .order('week_start_date', { ascending: false })
    // The list is week-SCOPED now (2026-08-03), so this limit no longer bounds
    // what's on screen — it bounds which weeks the picker can reach. At 50 a
    // single vendor's recurring run could consume the whole budget and hide
    // other weeks entirely. Per-market row counts are small; 400 covers a full
    // season of a busy market.
    .limit(400)

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

  // Collapses rather than disappearing (owner, 2026-08-08). This card is where
  // a manager assigns booth numbers — vanishing it before the first booking
  // means they never see the tool exists until the week it matters.
  const noBookingsYet = rentals.length === 0

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
    <DashboardCard
      title={`Weekly ${term(vertical, 'booth').toLowerCase()} bookings`}
      description={`One week at a time — use the arrows to move between weeks. Set a ${term(vertical, 'booth').toLowerCase()} number on any row. Anyone booked for several weeks is summarized once at the bottom instead of repeating on every week.`}
      {...(noBookingsYet ? {
        empty: {
          kind: 'waiting' as const,
          message: `Once ${term(vertical, 'vendors').toLowerCase()} book a ${term(vertical, 'booth').toLowerCase()}, each week's roster shows up here and you can assign ${term(vertical, 'booth').toLowerCase()} numbers.`,
        },
      } : {})}
    >
      <WeeklyBookingsList
        marketId={marketId}
        vertical={vertical}
        bookings={rentals.map<WeeklyBookingRow>((r) => ({
          id: r.id,
          vendor_profile_id: r.vendor_profile_id,
          vendor_name: vendorNameById.get(r.vendor_profile_id) || 'Unknown vendor',
          week_start_date: r.week_start_date,
          size_label: sizeLabelById.get(r.inventory_id) || '—',
          booth_number: r.booth_number,
          price_cents: r.price_cents,
          status: r.status,
        }))}
      />
    </DashboardCard>
  )
}
