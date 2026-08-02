import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { isStripeCheckoutExpired } from '@/lib/cron/order-timing'

/**
 * GET /api/buyer/slot-availability?listingId=&marketId=&pickupDate=
 *
 * Which pickup slots are already full for this truck at this market on this
 * date (mig 216). Display-only — checkout re-checks atomically via
 * check_pickup_slot_capacity, so a slot that fills between page load and
 * checkout is still caught server-side. This just stops buyers from picking a
 * time that's already gone.
 *
 * Public (no auth): a buyer browses before signing in, and this leaks nothing
 * beyond "this time is unavailable" — the same thing the slot list already
 * implies. Uses the service client because it aggregates order rows the buyer
 * cannot read directly, and returns ONLY booleans + the caps, never order data.
 *
 * Returns { enabled: false } when the vendor hasn't set a capacity, which is the
 * default for every truck until they opt in.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/buyer/slot-availability', 'GET', async () => {
    const listingId = request.nextUrl.searchParams.get('listingId')
    const marketId = request.nextUrl.searchParams.get('marketId')
    const pickupDate = request.nextUrl.searchParams.get('pickupDate')

    if (!listingId || !marketId || !pickupDate) {
      return NextResponse.json({ enabled: false, fullSlots: [] })
    }

    const service = createServiceClient()

    // Resolve the listing's vendor, then that vendor's caps.
    const { data: listing } = await service
      .from('listings')
      .select('vendor_profile_id')
      .eq('id', listingId)
      .maybeSingle()
    if (!listing?.vendor_profile_id) {
      return NextResponse.json({ enabled: false, fullSlots: [] })
    }

    const { data: vendor } = await service
      .from('vendor_profiles')
      .select('pickup_capacity_app_orders, pickup_capacity_items')
      .eq('id', listing.vendor_profile_id as string)
      .maybeSingle()

    const capOrders = (vendor?.pickup_capacity_app_orders as number | null) ?? null
    const capItems = (vendor?.pickup_capacity_items as number | null) ?? null
    if (capOrders === null && capItems === null) {
      // Not opted in — unlimited, today's behavior.
      return NextResponse.json({ enabled: false, fullSlots: [] })
    }

    // Current load per slot. Must mirror check_pickup_slot_capacity's filters
    // exactly, or the UI and the enforcement will disagree: cancelled items and
    // cancelled/refunded orders never consume capacity, and an unpaid 'pending'
    // order holds its slot for only 10 minutes.
    //
    // That last one is not a detail. Orders are inserted BEFORE payment
    // (checkout/session/route.ts:913-914) and the only cleanup cron runs once a
    // day, so counting every pending row would grey out a truck's whole lunch
    // service over checkouts nobody completed. The RPC applies the same window in
    // SQL; here it is the shared isStripeCheckoutExpired() helper, which is the
    // same rule cron Phase 2 cancels on — one definition, three call sites, so
    // the UI and enforcement cannot drift apart.
    const { data: rows } = await service
      .from('order_items')
      .select('order_id, quantity, preferred_pickup_time, orders!inner(status, created_at)')
      .eq('vendor_profile_id', listing.vendor_profile_id as string)
      .eq('market_id', marketId)
      .eq('pickup_date', pickupDate)
      .is('cancelled_at', null)
      .neq('status', 'cancelled')
      .not('preferred_pickup_time', 'is', null)

    const perSlot = new Map<string, { orders: Set<string>; items: number }>()
    for (const r of rows ?? []) {
      const ord = Array.isArray(r.orders) ? r.orders[0] : r.orders
      const order = ord as { status?: string; created_at?: string } | null
      const status = order?.status
      if (status === 'cancelled' || status === 'refunded') continue

      // Abandoned checkout — released itself, same as in the RPC. Clock skew
      // between Node here and NOW() in Postgres is irrelevant at 10-minute
      // granularity, and this surface is display-only regardless: checkout
      // re-checks server-side.
      if (status === 'pending' && order?.created_at && isStripeCheckoutExpired(order.created_at)) continue

      const slot = (r.preferred_pickup_time as string).slice(0, 5) // "HH:MM"
      const entry = perSlot.get(slot) ?? { orders: new Set<string>(), items: 0 }
      entry.orders.add(r.order_id as string)
      entry.items += (r.quantity as number) || 0
      perSlot.set(slot, entry)
    }

    // A slot is full when one MORE order (or one more item) wouldn't fit.
    const fullSlots: string[] = []
    for (const [slot, used] of perSlot) {
      const ordersFull = capOrders !== null && used.orders.size + 1 > capOrders
      const itemsFull = capItems !== null && used.items + 1 > capItems
      if (ordersFull || itemsFull) fullSlots.push(slot)
    }

    return NextResponse.json({ enabled: true, fullSlots })
  })
}
