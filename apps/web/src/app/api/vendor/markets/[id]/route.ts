import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTierLimits } from '@/lib/vendor-limits'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PUT - Update market
export async function PUT(request: Request, { params }: RouteParams) {
  const { id: marketId } = await params

  return withErrorTracing(`/api/vendor/markets/${marketId}`, 'PUT', async () => {
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

    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    crumb.supabase('select', 'markets')
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (marketError || !market) {
      throw traced.notFound('ERR_MARKET_001', 'Market not found or unauthorized')
    }

    // For private pickup markets, validate and update pickup_windows
    if (market.market_type === 'private_pickup') {
      // Validate pickup_windows - required for private pickup, min 1
      if (!pickup_windows || !Array.isArray(pickup_windows) || pickup_windows.length === 0) {
        throw traced.validation('ERR_VALIDATION_001', 'At least one pickup window is required')
      }

      // Check tier-based window limit
      const tier = vendorProfile.tier || 'standard'
      const tierLimits = getTierLimits(tier)
      const maxWindows = tierLimits.pickupWindowsPerLocation

      if (pickup_windows.length > maxWindows) {
        throw traced.validation('ERR_VALIDATION_001', `Maximum of ${maxWindows} pickup windows allowed for ${tier} tier vendors.${tier === 'standard' ? ' Upgrade to premium for more windows.' : ''}`)
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
      .select()
      .single()

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'markets', operation: 'update' })
    }

    // For private pickup markets, update the schedules
    if (market.market_type === 'private_pickup' && pickup_windows) {
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
export async function DELETE(request: Request, { params }: RouteParams) {
  const { id: marketId } = await params

  return withErrorTracing(`/api/vendor/markets/${marketId}`, 'DELETE', async () => {
    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      throw traced.notFound('ERR_VENDOR_001', 'Vendor profile not found')
    }

    crumb.supabase('select', 'markets')
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (marketError || !market) {
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

    if (listingCount > 0) {
      throw traced.validation('ERR_MARKET_002', 'Cannot delete market with active listings. Remove listings first.')
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
