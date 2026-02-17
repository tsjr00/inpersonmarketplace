import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { canActivateMarketBox, formatLimitError } from '@/lib/vendor-limits'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/vendor/market-boxes/[id]
 * Get a single market box offering with subscribers
 */
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/market-boxes/[id]', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-boxes-get:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: offeringId } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Get offering with market info
    const { data: offering, error } = await supabase
      .from('market_box_offerings')
      .select(`
        id,
        name,
        description,
        image_urls,
        price_cents,
        price_4week_cents,
        price_8week_cents,
        pickup_market_id,
        pickup_day_of_week,
        pickup_start_time,
        pickup_end_time,
        quantity_amount,
        quantity_unit,
        max_subscribers,
        active,
        created_at,
        updated_at,
        market:markets (
          id,
          name,
          market_type,
          address,
          city,
          state
        )
      `)
      .eq('id', offeringId)
      .eq('vendor_profile_id', vendor.id)
      .single()

    if (error || !offering) {
      return NextResponse.json({ error: 'Offering not found' }, { status: 404 })
    }

    // Get subscriptions with buyer profile data
    // Uses service client because RLS on user_profiles only allows reading own profile,
    // but vendors need to see their subscribers' names. Ownership already verified above.
    const serviceClient = createServiceClient()
    const { data: subscriptions } = await serviceClient
      .from('market_box_subscriptions')
      .select(`
        id,
        buyer_user_id,
        total_paid_cents,
        start_date,
        status,
        weeks_completed,
        term_weeks,
        extended_weeks,
        original_end_date,
        created_at,
        buyer:user_profiles!market_box_subscriptions_buyer_user_id_fkey (
          display_name,
          email
        ),
        pickups:market_box_pickups (
          id,
          week_number,
          scheduled_date,
          status,
          ready_at,
          picked_up_at,
          missed_at,
          rescheduled_to,
          vendor_notes,
          is_extension,
          skipped_by_vendor_at,
          skip_reason
        )
      `)
      .eq('offering_id', offeringId)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      offering,
      subscriptions: subscriptions || [],
      active_count: (subscriptions || []).filter(s => s.status === 'active').length,
    })
  })
}

/**
 * PATCH /api/vendor/market-boxes/[id]
 * Update a market box offering
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/market-boxes/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-boxes-patch:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: offeringId } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile with tier for limit checks
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Verify ownership and get current active state
    const { data: existing } = await supabase
      .from('market_box_offerings')
      .select('id, vendor_profile_id, active')
      .eq('id', offeringId)
      .single()

    if (!existing || existing.vendor_profile_id !== vendor.id) {
      return NextResponse.json({ error: 'Offering not found' }, { status: 404 })
    }

    // Check for active subscribers before allowing certain changes
    const { count: activeSubscribers } = await supabase
      .from('market_box_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('offering_id', offeringId)
      .eq('status', 'active')

    const body = await request.json()
    const {
      name,
      description,
      image_urls,
      price_cents,  // Legacy field
      price_4week_cents,
      price_8week_cents,
      pickup_market_id,
      pickup_day_of_week,
      pickup_start_time,
      pickup_end_time,
      max_subscribers,
      active,
      quantity_amount,
      quantity_unit,
    } = body

    // Don't allow changing pickup location/time if there are active subscribers
    if ((activeSubscribers || 0) > 0) {
      if (pickup_market_id !== undefined || pickup_day_of_week !== undefined ||
          pickup_start_time !== undefined || pickup_end_time !== undefined) {
        return NextResponse.json({
          error: 'Cannot change pickup location or time while there are active subscribers',
        }, { status: 400 })
      }
    }

    // BUG 1.1 FIX: Check activation limit when reactivating a market box
    // Only check if trying to change from inactive to active
    if (active === true && existing.active === false) {
      const activationCheck = await canActivateMarketBox(
        supabase,
        vendor.id,
        vendor.tier || 'standard'
      )
      if (!activationCheck.allowed) {
        return NextResponse.json({
          error: formatLimitError(activationCheck),
        }, { status: 403 })
      }
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (image_urls !== undefined) updates.image_urls = image_urls

    // Handle pricing updates - support both old and new field names
    if (price_4week_cents !== undefined) {
      updates.price_4week_cents = price_4week_cents
      updates.price_cents = price_4week_cents  // Keep legacy field in sync
    } else if (price_cents !== undefined) {
      updates.price_cents = price_cents
      updates.price_4week_cents = price_cents  // Keep new field in sync
    }

    // 8-week price can be set to null to disable the option
    if (price_8week_cents !== undefined) {
      updates.price_8week_cents = price_8week_cents
    }

    if (pickup_market_id !== undefined) updates.pickup_market_id = pickup_market_id
    if (pickup_day_of_week !== undefined) updates.pickup_day_of_week = pickup_day_of_week
    if (pickup_start_time !== undefined) updates.pickup_start_time = pickup_start_time
    if (pickup_end_time !== undefined) updates.pickup_end_time = pickup_end_time
    if (quantity_amount !== undefined) updates.quantity_amount = quantity_amount
    if (quantity_unit !== undefined) updates.quantity_unit = quantity_unit
    if (max_subscribers !== undefined) updates.max_subscribers = max_subscribers
    if (active !== undefined) updates.active = active

    const { data: updated, error } = await supabase
      .from('market_box_offerings')
      .update(updates)
      .eq('id', offeringId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ offering: updated })
  })
}

/**
 * DELETE /api/vendor/market-boxes/[id]
 * Deactivate a market box offering (soft delete)
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/vendor/market-boxes/[id]', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-market-boxes-delete:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { id: offeringId } = await context.params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from('market_box_offerings')
      .select('id, vendor_profile_id')
      .eq('id', offeringId)
      .single()

    if (!existing || existing.vendor_profile_id !== vendor.id) {
      return NextResponse.json({ error: 'Offering not found' }, { status: 404 })
    }

    // Check for active subscribers
    const { count: activeSubscribers } = await supabase
      .from('market_box_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('offering_id', offeringId)
      .eq('status', 'active')

    if ((activeSubscribers || 0) > 0) {
      return NextResponse.json({
        error: `Cannot delete offering with ${activeSubscribers} active subscriber(s). Wait for their subscriptions to complete.`,
      }, { status: 400 })
    }

    // Soft delete by setting active = false
    const { error } = await supabase
      .from('market_box_offerings')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', offeringId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  })
}
