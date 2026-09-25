import { createServiceClient } from '@/lib/supabase/server'
import WeeklyBookingsList, { type WeeklyBookingRow } from '@/components/market-manager/WeeklyBookingsList'
import DashboardCard from '@/components/dashboard/DashboardCard'
import BoothNumberingHelp from '@/components/market-manager/BoothNumberingHelp'
import { term } from '@/lib/vertical/terminology'
import { describeTierLabels, type BoothInventoryRow } from '@/lib/markets/booth-types'

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
 * With no bookings yet it COLLAPSES to one line (owner rule 2026-08-08: empty
 * sections collapse, never vanish) — and that line carries the week sheet
 * (OB-030 D2, owner option (a) 2026-09-25): the sheet lists holds and
 * off-platform booths, which a manager needs before anyone books. The link
 * has no ?week, so the sheet opens on the current week in the MARKET's
 * timezone — or next week once this week's last market day has passed.
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

  // Every tier at the market (not just the booked ones): the help paragraph
  // shows the whole number map (mig 258).
  const [vendorsResult, inventoryResult] = await Promise.all([
    serviceClient
      .from('vendor_profiles')
      .select('id, profile_data')
      .in('id', vendorIds),
    serviceClient
      .from('market_booth_inventory')
      .select('id, size_label, label_prefix, label_start, label_end, labels')
      .eq('market_id', marketId)
      .order('size_label', { ascending: true }),
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
  const helpTiers = ((inventoryResult.data ?? []) as unknown as BoothInventoryRow[])
    .map((t) => ({ size_label: t.size_label, description: describeTierLabels(t) }))

  return (
    <DashboardCard
      title={`Weekly ${term(vertical, 'booth').toLowerCase()} bookings`}
      {...(noBookingsYet ? {
        empty: {
          kind: 'waiting' as const,
          // Mig 258 / F2a: numbers arrive WITH the booking — the manager is not
          // assigning them here.
          message: `No bookings yet. Once ${term(vertical, 'vendors').toLowerCase()} book, each week's roster shows up here with the ${term(vertical, 'booth').toLowerCase()} number each one was given. The week sheet already lists your holds and off-platform ${term(vertical, 'booths').toLowerCase()}.`,
          // No ?week: the sheet opens on this week, or next week once this week's
          // last market day has passed (owner 2026-09-25).
          action: { href: `/${vertical}/market-manager/${marketId}/week-sheet`, label: '🖨 Print the week sheet' },
        },
      } : {})}
      description={`Manage the bookings: any week, not just this one — use the arrows to move between weeks. Bookings get their number automatically (the vendor's held number if they have one, else the lowest free number in their size); you only step in here to move an UNPAID booking to another number of the same size, or to cancel a paid week. Anyone booked for several weeks is summarized once at the bottom. (The occupancy card above is the picture; this is where you act.)`}
    >
      {/* The one booth-numbers story (N-8). */}
      <div style={{ marginBottom: 12 }}>
        <BoothNumberingHelp vertical={vertical} tiers={helpTiers} compact />
      </div>
      <WeeklyBookingsList
        marketId={marketId}
        vertical={vertical}
        bookings={rentals.map<WeeklyBookingRow>((r) => ({
          id: r.id,
          vendor_profile_id: r.vendor_profile_id,
          vendor_name: vendorNameById.get(r.vendor_profile_id) || 'Unknown vendor',
          week_start_date: r.week_start_date,
          inventory_id: r.inventory_id,
          size_label: sizeLabelById.get(r.inventory_id) || '—',
          booth_number: r.booth_number,
          price_cents: r.price_cents,
          status: r.status,
        }))}
      />
    </DashboardCard>
  )
}
