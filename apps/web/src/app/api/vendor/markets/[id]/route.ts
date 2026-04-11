import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTierLimits } from '@/lib/vendor-limits'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { geocodeZipCode } from '@/lib/geocode'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PUT - Update market
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id: marketId } = await params

  return withErrorTracing(`/api/vendor/markets/${marketId}`, 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-market-put:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const body = await request.json()
    const { name, address, city, state, zip, latitude, longitude, season_start, season_end, pickup_windows, expires_at } = body

    // Validate coordinates if provided
    let parsedLat: number | null = null
    let parsedLng: number | null = null
    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      parsedLat = typeof latitude === 'number' ? latitude : parseFloat(latitude)
      parsedLng = typeof longitude === 'number' ? longitude : parseFloat(longitude)
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        throw traced.validation('ERR_VALIDATION_001', 'Invalid coordinates')
      }
      if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
        throw traced.validation('ERR_VALIDATION_001', 'Coordinates out of range')
      }
    }

    // Auto-geocode from ZIP if coordinates not provided
    if (parsedLat === null && parsedLng === null && zip) {
      try {
        const geocodeResponse = await geocodeZipCode(zip)
        if (geocodeResponse) {
          parsedLat = geocodeResponse.latitude
          parsedLng = geocodeResponse.longitude
          // Auto-geocoded successfully
        }
      } catch (geocodeError) {
        console.warn('[/api/vendor/markets/[id]] Geocoding failed:', geocodeError)
      }
    }

    // Fetch market first to determine vertical — enables multi-vertical vendor lookup
    crumb.supabase('select', 'markets')
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      throw traced.notFound('ERR_MARKET_001', 'Market not found or unauthorized')
    }

    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical<{
      id: string
      tier: string
    }>(supabase, user.id, market.vertical_id, 'id, tier')

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', vpError || 'Vendor profile not found')
    }

    if (market.vendor_profile_id !== vendorProfile.id) {
      throw traced.notFound('ERR_MARKET_001', 'Market not found or unauthorized')
    }

    // For private pickup markets, validate and update pickup_windows
    if (market.market_type === 'private_pickup') {
      // Validate pickup_windows - required for private pickup, min 1
      if (!pickup_windows || !Array.isArray(pickup_windows) || pickup_windows.length === 0) {
        throw traced.validation('ERR_VALIDATION_001', 'At least one pickup window is required')
      }

      // Check tier-based window limit
      const tier = vendorProfile.tier || 'free'
      const tierLimits = getTierLimits(tier, market.vertical_id)
      const maxWindows = tierLimits.pickupWindowsPerLocation

      if (pickup_windows.length > maxWindows) {
        throw traced.validation('ERR_VALIDATION_001', `Maximum of ${maxWindows} pickup windows allowed for ${tier} tier vendors.${(tier === 'free' || tier === 'standard') ? ' Upgrade your plan for more windows.' : ''}`)
      }

      // Validate each pickup window
      for (const window of pickup_windows) {
        if (window.day_of_week === undefined || window.day_of_week === '' ||
            !window.start_time || !window.end_time) {
          throw traced.validation('ERR_VALIDATION_001', 'Each pickup window requires day, start time, and end time')
        }
      }
    }

    crumb.supabase('update', 'markets')
    const { data: updated, error: updateError } = await supabase
      .from('markets')
      .update({
        name,
        address,
        city,
        state,
        zip,
        latitude: parsedLat,
        longitude: parsedLng,
        season_start: season_start || null,
        season_end: season_end || null,
        expires_at: expires_at !== undefined ? (expires_at || null) : undefined
      })
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .select()
      .single()

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })
    }

    // Handle case where update succeeded but no rows returned (shouldn't happen with proper constraints)
    if (!updated) {
      throw traced.notFound('ERR_MARKET_003', 'Market update failed - no rows returned')
    }

    // For private pickup markets, update the schedules
    if (market.market_type === 'private_pickup' && pickup_windows) {
      // Phase 6: Check for pending orders before modifying schedules
      // Get existing schedules
      crumb.supabase('select', 'market_schedules', { check: 'existing' })
      const { data: existingSchedules } = await supabase
        .from('market_schedules')
        .select('id, day_of_week, start_time, end_time')
        .eq('market_id', marketId)

      // Find schedules being removed (not in new pickup_windows)
      const newWindowKeys = new Set(
        pickup_windows.map((w: { day_of_week: number; start_time: string; end_time: string }) =>
          `${w.day_of_week}|${w.start_time}|${w.end_time}`
        )
      )
      const schedulesBeingRemoved = (existingSchedules || []).filter(s =>
        !newWindowKeys.has(`${s.day_of_week}|${s.start_time}|${s.end_time}`)
      )

      if (schedulesBeingRemoved.length > 0) {
        const scheduleIdsToCheck = schedulesBeingRemoved.map(s => s.id)
        crumb.supabase('select', 'order_items', { check: 'pending_for_schedules' })
        const { data: pendingOrders, error: poError } = await supabase
          .from('order_items')
          .select('schedule_id')
          .in('schedule_id', scheduleIdsToCheck)
          .not('status', 'in', '("fulfilled","cancelled")')
          .is('cancelled_at', null)

        if (poError) {
          throw traced.fromSupabase(poError, { table: 'order_items', operation: 'select' })
        }

        if (pendingOrders && pendingOrders.length > 0) {
          throw traced.validation(
            'ERR_SCHEDULE_HAS_ORDERS',
            `Cannot remove pickup windows that have ${pendingOrders.length} pending order${pendingOrders.length !== 1 ? 's' : ''}. Please fulfill or cancel pending orders first.`,
            { pendingOrderCount: pendingOrders.length }
          )
        }
      }

      crumb.supabase('delete', 'market_schedules')
      const { error: deleteSchedulesError } = await supabase
        .from('market_schedules')
        .delete()
        .eq('market_id', marketId)

      if (deleteSchedulesError) {
        throw traced.fromSupabase(deleteSchedulesError, { table: 'market_schedules', operation: 'delete' })
      }

      crumb.supabase('insert', 'market_schedules')
      const schedules = pickup_windows.map((window: { day_of_week: number; start_time: string; end_time: string }) => ({
        market_id: marketId,
        day_of_week: parseInt(String(window.day_of_week)),
        start_time: window.start_time,
        end_time: window.end_time,
        active: true
      }))

      const { error: scheduleError } = await supabase
        .from('market_schedules')
        .insert(schedules)

      if (scheduleError) {
        throw traced.fromSupabase(scheduleError, { table: 'market_schedules', operation: 'insert' })
      }
    }

    return NextResponse.json({ market: updated })
  })
}

// DELETE - Delete market
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: marketId } = await params

  return withErrorTracing(`/api/vendor/markets/${marketId}`, 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-market-delete:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Fetch market first to determine vertical — enables multi-vertical vendor lookup
    crumb.supabase('select', 'markets')
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .single()

    if (marketError || !market) {
      throw traced.notFound('ERR_MARKET_001', 'Market not found or unauthorized')
    }

    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical(
      supabase,
      user.id,
      market.vertical_id
    )

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', vpError || 'Vendor profile not found')
    }

    if (market.vendor_profile_id !== vendorProfile.id) {
      throw traced.notFound('ERR_MARKET_001', 'Market not found or unauthorized')
    }

    // Check if market has active listings
    crumb.supabase('rpc', 'get_vendor_listing_count_at_market')
    const { data: listingCount, error: countError } = await supabase
      .rpc('get_vendor_listing_count_at_market', {
        p_vendor_profile_id: vendorProfile.id,
        p_market_id: marketId
      })

    if (countError) {
      throw traced.fromSupabase(countError, { operation: 'rpc', function: 'get_vendor_listing_count_at_market' })
    }

    // Expired private pickups (one-time events) can be deleted with
    // auto-unassignment of their listings. For non-expired markets, the
    // vendor must manually remove listings first to avoid accidental
    // data loss.
    const isExpired = market.expires_at && new Date(market.expires_at as string) < new Date()

    if (listingCount > 0 && !isExpired) {
      throw traced.validation(
        'ERR_MARKET_002',
        'Cannot delete market with active listings. Remove listings first. (Expired one-time-event markets can be deleted — their listings will be automatically unassigned.)'
      )
    }

    // Check for pending orders at this market (Phase 6: Schedule deletion protection)
    crumb.supabase('select', 'order_items', { check: 'pending_orders' })
    const { count: pendingOrderCount, error: orderCheckError } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .not('status', 'in', '("fulfilled","cancelled")')
      .is('cancelled_at', null)

    if (orderCheckError) {
      throw traced.fromSupabase(orderCheckError, { table: 'order_items', operation: 'select' })
    }

    if (pendingOrderCount && pendingOrderCount > 0) {
      throw traced.validation(
        'ERR_MARKET_003',
        `Cannot delete this location while ${pendingOrderCount} order${pendingOrderCount !== 1 ? 's are' : ' is'} pending. Please fulfill or cancel pending orders first.`,
        { pendingOrderCount }
      )
    }

    // For expired markets with listings, auto-unassign the listings from
    // this market before deleting. Listings continue to exist and may
    // still reference other markets; if a listing is left with zero
    // markets, it remains in the DB but will not appear in browse queries
    // (they all join listing_markets). Vendor can reassign or delete it
    // later from the listings page.
    if (listingCount > 0 && isExpired) {
      crumb.supabase('delete', 'listing_markets', { reason: 'market_expired' })
      const { error: unassignError } = await supabase
        .from('listing_markets')
        .delete()
        .eq('market_id', marketId)

      if (unassignError) {
        throw traced.fromSupabase(unassignError, {
          table: 'listing_markets',
          operation: 'delete',
        })
      }
    }

    crumb.supabase('delete', 'markets')
    const { error: deleteError } = await supabase
      .from('markets')
      .delete()
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)

    if (deleteError) {
      throw traced.fromSupabase(deleteError, { table: 'markets', operation: 'delete' })
    }

    return NextResponse.json({ success: true })
  })
}
