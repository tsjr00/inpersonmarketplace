import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/buyer/events/[token]/review-state
 *
 * Returns everything EventFeedbackForm needs to render its two
 * sections for the current user:
 *
 *   - `rateable_orders`: completed orders this user has at the event's
 *     market, grouped by vendor, with existing order_ratings if any.
 *     Used by Section A of the form.
 *   - `event_rating`: the user's existing event_ratings row (or null)
 *     for this event. Used by Section B of the form.
 *
 * Requires auth. Unauthenticated callers get 401 — the form handles
 * the not-logged-in state before calling this.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  return withErrorTracing(`/api/buyer/events/${token}/review-state`, 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`buyer-event-review-state:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve event_token → event row
    const { data: event, error: eventError } = await supabase
      .from('catering_requests')
      .select('id, market_id, status')
      .eq('event_token', token)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // No market means no orders possible (the event was never fully staged)
    if (!event.market_id) {
      return NextResponse.json({
        rateable_orders: [],
        event_rating: null,
      })
    }

    // Find user's completed order_items at this event's market, grouped
    // by vendor. We join order_items → orders (buyer check + status) and
    // vendor_profiles (display name).
    const { data: orderItemRows } = await supabase
      .from('order_items')
      .select(`
        order_id,
        vendor_profile_id,
        orders!inner (
          id,
          buyer_user_id,
          status
        ),
        vendor_profiles!inner (
          id,
          profile_data
        )
      `)
      .eq('market_id', event.market_id)
      .eq('orders.buyer_user_id', user.id)
      .eq('orders.status', 'completed')

    // Dedupe to one row per (order_id, vendor_profile_id) — a single
    // order can have multiple line items from the same vendor, but the
    // user rates the vendor once per order.
    const rateableMap = new Map<string, {
      order_id: string
      vendor_profile_id: string
      vendor_name: string
    }>()

    for (const row of orderItemRows || []) {
      const vendorProfileId = row.vendor_profile_id as string | null
      const orderId = row.order_id as string | null
      if (!vendorProfileId || !orderId) continue

      const key = `${orderId}:${vendorProfileId}`
      if (rateableMap.has(key)) continue

      const vp = row.vendor_profiles as unknown as { id: string; profile_data: Record<string, unknown> | null } | null
      const profileData = (vp?.profile_data as Record<string, unknown>) || {}
      const vendorName =
        (profileData.business_name as string) ||
        (profileData.farm_name as string) ||
        'Vendor'

      rateableMap.set(key, {
        order_id: orderId,
        vendor_profile_id: vendorProfileId,
        vendor_name: vendorName,
      })
    }

    // Batch-fetch existing order_ratings for these (order_id, vendor_profile_id)
    // pairs so the form can pre-populate edits.
    const orderIds = [...new Set([...rateableMap.values()].map(r => r.order_id))]
    const existingRatings: Record<string, { rating: number; comment: string | null }> = {}

    if (orderIds.length > 0) {
      const { data: ratingRows } = await supabase
        .from('order_ratings')
        .select('order_id, vendor_profile_id, rating, comment')
        .in('order_id', orderIds)
        .eq('buyer_user_id', user.id)

      for (const r of ratingRows || []) {
        const key = `${r.order_id}:${r.vendor_profile_id}`
        existingRatings[key] = {
          rating: r.rating as number,
          comment: (r.comment as string) || null,
        }
      }
    }

    const rateable_orders = [...rateableMap.entries()].map(([key, row]) => ({
      order_id: row.order_id,
      vendor_profile_id: row.vendor_profile_id,
      vendor_name: row.vendor_name,
      existing_rating: existingRatings[key] || null,
    }))

    // Fetch existing event_ratings row for this user + event
    const { data: eventRatingRow } = await supabase
      .from('event_ratings')
      .select('rating, comment, status')
      .eq('catering_request_id', event.id)
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      rateable_orders,
      event_rating: eventRatingRow
        ? {
            rating: eventRatingRow.rating as number,
            comment: (eventRatingRow.comment as string) || null,
            status: eventRatingRow.status as string,
          }
        : null,
    })
  })
}
