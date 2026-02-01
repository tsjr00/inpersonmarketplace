import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTierLimits } from '@/lib/vendor-limits'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PUT - Update market
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id: marketId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
      }
      if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
        return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 })
      }
    }

    // Get vendor profile with tier
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Verify ownership
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found or unauthorized' }, { status: 404 })
    }

    // For private pickup markets, validate and update pickup_windows
    if (market.market_type === 'private_pickup') {
      // Validate pickup_windows - required for private pickup, min 1
      if (!pickup_windows || !Array.isArray(pickup_windows) || pickup_windows.length === 0) {
        return NextResponse.json({ error: 'At least one pickup window is required' }, { status: 400 })
      }

      // Check tier-based window limit
      const tier = vendorProfile.tier || 'standard'
      const tierLimits = getTierLimits(tier)
      const maxWindows = tierLimits.pickupWindowsPerLocation

      if (pickup_windows.length > maxWindows) {
        return NextResponse.json({
          error: `Maximum of ${maxWindows} pickup windows allowed for ${tier} tier vendors.${tier === 'standard' ? ' Upgrade to premium for more windows.' : ''}`
        }, { status: 400 })
      }

      // Validate each pickup window
      for (const window of pickup_windows) {
        if (window.day_of_week === undefined || window.day_of_week === '' ||
            !window.start_time || !window.end_time) {
          return NextResponse.json({ error: 'Each pickup window requires day, start time, and end time' }, { status: 400 })
        }
      }
    }

    // Update market
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
      console.error('[/api/vendor/markets/[id]] Error updating market:', updateError)
      return NextResponse.json({ error: 'Failed to update market' }, { status: 500 })
    }

    // For private pickup markets, update the schedules
    if (market.market_type === 'private_pickup' && pickup_windows) {
      // Delete existing schedules
      const { error: deleteSchedulesError } = await supabase
        .from('market_schedules')
        .delete()
        .eq('market_id', marketId)

      if (deleteSchedulesError) {
        console.error('[/api/vendor/markets/[id]] Error deleting schedules:', deleteSchedulesError)
        return NextResponse.json({ error: 'Failed to update pickup schedule' }, { status: 500 })
      }

      // Create new schedules
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
        console.error('[/api/vendor/markets/[id]] Error creating schedules:', scheduleError)
        return NextResponse.json({ error: 'Failed to update pickup schedule' }, { status: 500 })
      }
    }

    return NextResponse.json({ market: updated })
  } catch (error) {
    console.error('[/api/vendor/markets/[id]] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete market
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id: marketId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Verify ownership
    const { data: market, error: marketError } = await supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (marketError || !market) {
      return NextResponse.json({ error: 'Market not found or unauthorized' }, { status: 404 })
    }

    // Check if market has active listings
    const { data: listingCount, error: countError } = await supabase
      .rpc('get_vendor_listing_count_at_market', {
        p_vendor_profile_id: vendorProfile.id,
        p_market_id: marketId
      })

    if (countError) {
      console.error('[/api/vendor/markets/[id]] Error checking listing count:', countError)
      return NextResponse.json({ error: 'Failed to check listings' }, { status: 500 })
    }

    if (listingCount > 0) {
      return NextResponse.json({
        error: 'Cannot delete market with active listings. Remove listings first.'
      }, { status: 400 })
    }

    // Delete market (will cascade to listing_markets due to FK)
    const { error: deleteError } = await supabase
      .from('markets')
      .delete()
      .eq('id', marketId)
      .eq('vendor_profile_id', vendorProfile.id)

    if (deleteError) {
      console.error('[/api/vendor/markets/[id]] Error deleting market:', deleteError)
      return NextResponse.json({ error: 'Failed to delete market' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[/api/vendor/markets/[id]] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
