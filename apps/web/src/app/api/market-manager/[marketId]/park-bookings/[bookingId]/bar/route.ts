import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { runBarredBookingOrderCascade } from '@/lib/markets/cancel-date-cascade'

/**
 * POST /api/market-manager/[marketId]/park-bookings/[bookingId]/bar
 *
 * FT park-manager B3 — operator bars a specific PAID booking for a
 * non-compliant truck. Per the book-then-vet design:
 *   - the booking row STAYS `paid` (status unchanged) so the partial-unique
 *     index keeps holding the slot — it is NOT reopened for resale (the
 *     operator does not profit twice);
 *   - NO Stripe refund (the truck forfeits the fee — the penalty + threat);
 *   - reason required; the truck is notified.
 *
 * Body: { reason: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; bookingId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/park-bookings/[bookingId]/bar', 'POST', async () => {
    const rl = await checkRateLimit(`mm-bar:${getClientIp(request)}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { marketId, bookingId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    const allowed = await isMarketManager(supabase, marketId, user)
    if (!allowed) return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    if (!reason) {
      return NextResponse.json({ error: 'A reason is required to cancel a booking.', field: 'reason' }, { status: 400 })
    }

    const service = createServiceClient()

    crumb.supabase('select', 'park_spot_bookings')
    const { data: booking } = await observed(service
      .from('park_spot_bookings')
      .select('id, market_id, vendor_profile_id, booking_date, status, manager_barred_at')
      .eq('id', bookingId)
      .maybeSingle(), { table: 'park_spot_bookings' })
    if (!booking || booking.market_id !== marketId) {
      return NextResponse.json({ error: 'Booking not found at this park' }, { status: 404 })
    }
    if (booking.status !== 'paid') {
      return NextResponse.json({ error: 'Only a paid booking can be cancelled this way.' }, { status: 409 })
    }
    if (booking.manager_barred_at) {
      return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 })
    }

    // Status stays 'paid' on purpose → the slot is NOT reopened for resale.
    crumb.supabase('update', 'park_spot_bookings')
    const { error } = await service
      .from('park_spot_bookings')
      .update({ manager_barred_at: new Date().toISOString(), bar_reason: reason })
      .eq('id', bookingId)
      .eq('status', 'paid')
    if (error) throw traced.fromSupabase(error, { table: 'park_spot_bookings', operation: 'update' })

    // G2 (user decision 2026-07-18): the truck was removed from this date, so
    // its BUYER orders for this (park, date) must not stay stranded — cancel +
    // refund them via the market-day cascade machinery scoped to this vendor
    // (guarded cancels, inventory restore, Stripe refunds w/ logError,
    // tip/small-fee rollup on fully-dead orders). The truck's spot fee is
    // still forfeited (bar semantics unchanged); only buyers are made whole.
    // Note: mig 200 stops NEW orders for the barred date at the availability
    // layer — this cascade handles the orders that already existed.
    crumb.logic('Barred booking — cancelling + refunding buyer orders for the date')
    const cascade = await runBarredBookingOrderCascade(service, {
      marketId,
      bookingDate: booking.booking_date as string,
      vendorProfileId: booking.vendor_profile_id as string,
      reason: 'Truck removed from this date by the park operator',
    })

    // Notify the truck (no refund of the spot fee — grounded in the B1
    // acknowledgment) and the affected buyers (order cancelled + refunded).
    const { data: market } = await observed(service.from('markets').select('name, vertical_id').eq('id', marketId).maybeSingle(), { table: 'markets' })
    const { data: vp } = await observed(service.from('vendor_profiles').select('user_id, profile_data').eq('id', booking.vendor_profile_id as string).maybeSingle(), { table: 'vendor_profiles' })
    if (vp?.user_id) {
      await sendNotification(
        vp.user_id as string,
        'park_booking_barred',
        {
          marketName: (market?.name as string) || 'the park',
          marketDate: booking.booking_date as string,
          marketId,
          reason,
        },
        { vertical: (market?.vertical_id as string) || 'food_trucks' }
      )
    }

    const truckName = ((vp?.profile_data as Record<string, unknown> | null)?.business_name as string) || 'The truck'
    const vertical = (market?.vertical_id as string) || 'food_trucks'
    for (const notif of cascade.buyerOrderNotifs) {
      await sendNotification(
        notif.buyerUserId,
        'order_cancelled_by_vendor',
        {
          vendorName: truckName,
          orderNumber: notif.orderNumber,
          orderId: notif.orderId,
          reason: `${truckName} is no longer at this location on that date. Your payment is being refunded.`,
        },
        { vertical }
      )
    }

    return NextResponse.json({
      success: true,
      ordersRefunded: cascade.refundedItemCount,
      refundFailures: cascade.refundFailures,
    })
  })
}
