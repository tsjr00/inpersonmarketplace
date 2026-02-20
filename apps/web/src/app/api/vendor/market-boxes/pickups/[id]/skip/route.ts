import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { sendNotification } from '@/lib/notifications/service'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/vendor/market-boxes/pickups/[id]/skip
 * Skip a scheduled pickup and extend the subscription by one week
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: pickupId } = await context.params
  return withErrorTracing(`/api/vendor/market-boxes/pickups/${pickupId}/skip`, 'POST', async () => {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`vendor-skip-pickup:${clientIp}`, rateLimits.submit)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile with display name
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('id, profile_data')
    .eq('user_id', user.id)
    .single()

  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Get pickup with full details to verify ownership
  const { data: pickup } = await supabase
    .from('market_box_pickups')
    .select(`
      id,
      status,
      is_extension,
      subscription:market_box_subscriptions (
        id,
        term_weeks,
        extended_weeks,
        buyer_user_id,
        offering:market_box_offerings (
          id,
          name,
          vertical_id,
          vendor_profile_id
        )
      )
    `)
    .eq('id', pickupId)
    .single()

  if (!pickup) {
    return NextResponse.json({ error: 'Pickup not found' }, { status: 404 })
  }

  // Verify vendor owns this offering
  const subscription = pickup.subscription as any
  const offering = subscription?.offering
  if (!offering || offering.vendor_profile_id !== vendor.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Validate pickup can be skipped
  if (!['scheduled', 'ready'].includes(pickup.status)) {
    return NextResponse.json({
      error: 'Can only skip scheduled or ready pickups'
    }, { status: 400 })
  }

  if (pickup.is_extension) {
    return NextResponse.json({
      error: 'Cannot skip extension pickups - these are already makeup weeks'
    }, { status: 400 })
  }

  // Get optional reason from request body
  const body = await request.json().catch(() => ({}))
  const reason = body.reason || null

  // Call the database function to handle the skip
  const { data: result, error } = await supabase.rpc('vendor_skip_week', {
    p_pickup_id: pickupId,
    p_reason: reason
  })

  if (error) {
    console.error('[skip-week] Database error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to skip week'
    }, { status: 500 })
  }

  // Get updated pickup details
  const { data: skippedPickup } = await supabase
    .from('market_box_pickups')
    .select('*')
    .eq('id', pickupId)
    .single()

  // Get the new extension pickup
  const extensionPickupId = result?.[0]?.extension_pickup_id
  const { data: extensionPickup } = await supabase
    .from('market_box_pickups')
    .select('*')
    .eq('id', extensionPickupId)
    .single()

  // Get updated subscription
  const { data: updatedSubscription } = await supabase
    .from('market_box_subscriptions')
    .select('id, term_weeks, extended_weeks, original_end_date')
    .eq('id', subscription.id)
    .single()

  // Notify buyer about the skip
  const buyerUserId = subscription?.buyer_user_id
  const offeringName = offering?.name
  const verticalId = offering?.vertical_id
  if (buyerUserId) {
    const profileData = vendor.profile_data as Record<string, unknown> | null
    const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Your vendor'
    const pickupDate = skippedPickup?.scheduled_date
      ? new Date(skippedPickup.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : 'an upcoming date'

    await sendNotification(buyerUserId, 'market_box_skip', {
      vendorName,
      pickupDate,
      offeringName: offeringName || undefined,
      reason: reason || undefined,
    }, {
      vertical: verticalId || undefined,
    })
  }

  return NextResponse.json({
    success: true,
    skipped_pickup: skippedPickup,
    extension_pickup: extensionPickup,
    subscription: {
      ...updatedSubscription,
      total_weeks: (updatedSubscription?.term_weeks || 4) + (updatedSubscription?.extended_weeks || 0),
      new_end_date: result?.[0]?.new_scheduled_date
    },
    message: 'Week skipped. Subscription extended by 1 week.'
  })
  })
}
