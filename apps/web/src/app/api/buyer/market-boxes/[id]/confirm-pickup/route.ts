import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/buyer/market-boxes/[id]/confirm-pickup
 * Buyer confirms they picked up their market box
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/buyer/market-boxes/[id]/confirm-pickup', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-market-box-confirm-pickup:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: subscriptionId } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify subscription belongs to user and get vendor info for notification
    const { data: subscription } = await supabase
      .from('market_box_subscriptions')
      .select(`
        id, status,
        offering:market_box_offerings(
          id, name, vertical_id, vendor_profile_id,
          vendor_profiles(user_id, profile_data)
        )
      `)
      .eq('id', subscriptionId)
      .eq('buyer_user_id', user.id)
      .single()

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: 'Subscription is not active' }, { status: 400 })
    }

    const body = await request.json()
    const { pickup_id } = body

    if (!pickup_id) {
      return NextResponse.json({ error: 'pickup_id is required' }, { status: 400 })
    }

    // Get the pickup with confirmation state
    const { data: pickup } = await supabase
      .from('market_box_pickups')
      .select('id, status, subscription_id, vendor_confirmed_at, buyer_confirmed_at, confirmation_window_expires_at')
      .eq('id', pickup_id)
      .eq('subscription_id', subscriptionId)
      .single()

    if (!pickup) {
      return NextResponse.json({ error: 'Pickup not found' }, { status: 404 })
    }

    // Can only confirm 'ready' pickups
    if (pickup.status !== 'ready') {
      if (pickup.status === 'picked_up') {
        return NextResponse.json({ error: 'This pickup has already been confirmed' }, { status: 400 })
      }
      if (pickup.status === 'scheduled') {
        return NextResponse.json({ error: 'Vendor has not marked this pickup as ready yet' }, { status: 400 })
      }
      return NextResponse.json({ error: `Cannot confirm pickup with status: ${pickup.status}` }, { status: 400 })
    }

    // Check if already confirmed by buyer
    if (pickup.buyer_confirmed_at) {
      return NextResponse.json({ error: 'You already confirmed this pickup. Waiting for vendor.' }, { status: 400 })
    }

    const now = new Date()
    const CONFIRMATION_WINDOW_SECONDS = 30
    const vendorAlreadyConfirmed = !!pickup.vendor_confirmed_at

    if (vendorAlreadyConfirmed) {
      // Check if vendor's 30-second window is still valid
      const windowExpires = pickup.confirmation_window_expires_at
        ? new Date(pickup.confirmation_window_expires_at)
        : null

      if (windowExpires && now > windowExpires) {
        // Window expired — reset vendor confirmation
        await supabase
          .from('market_box_pickups')
          .update({
            vendor_confirmed_at: null,
            confirmation_window_expires_at: null,
            updated_at: now.toISOString(),
          })
          .eq('id', pickup_id)

        return NextResponse.json({
          error: 'Confirmation window expired. Please ask the vendor to confirm handoff again.',
          code: 'WINDOW_EXPIRED',
        }, { status: 400 })
      }

      // Both confirmed! Complete the pickup
      const { data: updated, error } = await supabase
        .from('market_box_pickups')
        .update({
          status: 'picked_up',
          picked_up_at: now.toISOString(),
          buyer_confirmed_at: now.toISOString(),
          confirmation_window_expires_at: null,
          updated_at: now.toISOString(),
        })
        .eq('id', pickup_id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // The trigger will auto-update subscription.weeks_completed

      return NextResponse.json({
        pickup: updated,
        message: 'Pickup confirmed by both parties! Enjoy your market box.',
        completed: true,
      })
    } else {
      // Buyer confirming first — start 30s window, wait for vendor
      const windowExpires = new Date(now.getTime() + CONFIRMATION_WINDOW_SECONDS * 1000)

      const { data: updated, error } = await supabase
        .from('market_box_pickups')
        .update({
          buyer_confirmed_at: now.toISOString(),
          confirmation_window_expires_at: windowExpires.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', pickup_id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Notify vendor to confirm handoff
      const offering = (subscription as any)?.offering
      const vendorUserId = offering?.vendor_profiles?.user_id
      if (vendorUserId) {
        await sendNotification(vendorUserId, 'pickup_confirmation_needed', {
          orderItemId: pickup_id,
        }, { vertical: offering?.vertical_id })
      }

      return NextResponse.json({
        pickup: updated,
        message: 'Receipt acknowledged. Vendor has 30 seconds to confirm handoff.',
        confirmation_window_expires_at: windowExpires.toISOString(),
        completed: false,
      })
    }
  })
}
