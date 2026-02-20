import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTierLimits, isPremiumTier } from '@/lib/vendor-limits'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'
import { TracedError } from '@/lib/errors/traced-error'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { geocodeZipCode } from '@/lib/geocode'

// GET - Get vendor's markets
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`vendor-markets-get:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')

    if (!vertical) {
      return NextResponse.json({ error: 'Vertical required' }, { status: 400 })
    }

    // Get vendor profile for this vertical (including home_market_id)
    const { data: vendorProfile, error: vpError } = await supabase
      .from('vendor_profiles')
      .select('id, tier, home_market_id')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .is('deleted_at', null)
      .single()

    if (vpError || !vendorProfile) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Get all markets for this vertical with schedules
    const { data: allMarkets, error: marketsError } = await supabase
      .from('markets')
      .select(`
        *,
        market_schedules (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('vertical_id', vertical)
      .eq('status', 'active')
      .order('name')

    if (marketsError) {
      console.error('[/api/vendor/markets] Error fetching markets:', marketsError)
      return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
    }

    // Get vendor's private pickup markets with schedules
    const vendorMarkets = (allMarkets || [])
      .filter(m => m.market_type === 'private_pickup' && m.vendor_profile_id === vendorProfile.id)
      .map(m => ({
        ...m,
        schedules: m.market_schedules || []
      }))

    // Get traditional markets with home market info
    const tier = vendorProfile.tier || 'standard'
    const tierLimits = getTierLimits(tier)
    const isVendorPremium = isPremiumTier(tier)

    // Query vendor attendance records to show schedule status
    const { data: attendanceData } = await supabase
      .from('vendor_market_schedules')
      .select('market_id')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('is_active', true)

    const marketsWithAttendance = new Set(
      (attendanceData || []).map(a => a.market_id as string)
    )

    const fixedMarkets = (allMarkets || []).filter(m => m.market_type === 'traditional').map(m => ({
      ...m,
      isHomeMarket: m.id === vendorProfile.home_market_id,
      // For standard vendors with a home market, restrict to only that market
      canUse: isVendorPremium || !vendorProfile.home_market_id || m.id === vendorProfile.home_market_id,
      homeMarketRestricted: !isVendorPremium && vendorProfile.home_market_id && m.id !== vendorProfile.home_market_id,
      hasAttendance: marketsWithAttendance.has(m.id)
    }))

    // Count current fixed markets for this vendor
    const { data: currentCount } = await supabase
      .rpc('get_vendor_fixed_market_count', {
        p_vendor_profile_id: vendorProfile.id,
        p_vertical_id: vertical
      })

    const currentFixedMarketCount = currentCount || 0

    // Get vendor's market suggestions (pending, approved, rejected)
    const { data: marketSuggestions, error: suggestionsError } = await supabase
      .from('markets')
      .select(`
        id,
        name,
        address,
        city,
        state,
        zip,
        description,
        website,
        approval_status,
        rejection_reason,
        submitted_at,
        market_schedules (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('vertical_id', vertical)
      .eq('market_type', 'traditional')
      .eq('submitted_by_vendor_id', vendorProfile.id)
      .in('approval_status', ['pending', 'rejected'])
      .order('submitted_at', { ascending: false })

    if (suggestionsError) {
      console.error('[/api/vendor/markets] Error fetching suggestions:', suggestionsError)
    }

    // Transform suggestions to include schedules properly
    const transformedSuggestions = (marketSuggestions || []).map(s => ({
      ...s,
      schedules: s.market_schedules || [],
      market_schedules: undefined
    }))

    return NextResponse.json({
      fixedMarkets,
      privatePickupMarkets: vendorMarkets,
      marketSuggestions: transformedSuggestions,
      homeMarketId: vendorProfile.home_market_id,
      vendorTier: tier,
      isPremium: isVendorPremium,
      limits: {
        traditionalMarkets: tierLimits.traditionalMarkets,
        privatePickupLocations: tierLimits.privatePickupLocations,
        currentFixedMarketCount,
        currentPrivatePickupCount: vendorMarkets.length,
        canAddFixed: currentFixedMarketCount < tierLimits.traditionalMarkets,
        canAddPrivatePickup: vendorMarkets.length < tierLimits.privatePickupLocations
      }
    })
  } catch (error) {
    console.error('[/api/vendor/markets] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new private pickup market
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`vendor-markets-post:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { vertical, name, address, city, state, zip, latitude, longitude, season_start, season_end, pickup_windows, expires_at } = body

    if (!vertical || !name || !address || !city || !state || !zip) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    // Auto-geocode from ZIP if coordinates not provided
    // This ensures vendors appear in location-based searches
    if (parsedLat === null && parsedLng === null && zip) {
      try {
        const geocodeResponse = await geocodeZipCode(zip)
        if (geocodeResponse) {
          parsedLat = geocodeResponse.latitude
          parsedLng = geocodeResponse.longitude
          console.log(`[/api/vendor/markets] Auto-geocoded ZIP ${zip} to ${parsedLat}, ${parsedLng}`)
        }
      } catch (geocodeError) {
        // Don't fail market creation if geocoding fails, just log it
        console.warn('[/api/vendor/markets] Geocoding failed, market will be created without coordinates:', geocodeError)
      }
    }

    // Validate pickup_windows - required for private pickup, min 1
    if (!pickup_windows || !Array.isArray(pickup_windows) || pickup_windows.length === 0) {
      return NextResponse.json({ error: 'At least one pickup window is required' }, { status: 400 })
    }

    // Get vendor profile with tier to check window limit
    const { data: vendorProfileForTier, error: tierError } = await supabase
      .from('vendor_profiles')
      .select('id, tier')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .is('deleted_at', null)
      .single()

    if (tierError || !vendorProfileForTier) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    const tier = vendorProfileForTier.tier || 'standard'
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

    // Use the vendor profile we already fetched for tier check
    const vendorProfile = vendorProfileForTier

    // FEATURE 2.2: Check private pickup location limit

    const { count: currentPrivatePickupCount } = await supabase
      .from('markets')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('market_type', 'private_pickup')

    if ((currentPrivatePickupCount || 0) >= tierLimits.privatePickupLocations) {
      return NextResponse.json({
        error: `Limit reached: ${currentPrivatePickupCount} of ${tierLimits.privatePickupLocations} private pickup locations used. Upgrade to add more pickup locations.`
      }, { status: 403 })
    }

    // Create private pickup market
    // Note: submitted_by_vendor_id is required by RLS policy for INSERT
    // Food trucks default to 0 cutoff (prepare on the spot), FM uses DB default (18)
    const cutoffHours = vertical === 'food_trucks' ? 0 : undefined
    const insertData: Record<string, unknown> = {
      vertical_id: vertical,
      vendor_profile_id: vendorProfile.id,
      submitted_by_vendor_id: vendorProfile.id, // Required by RLS policy
      name,
      market_type: 'private_pickup',
      address,
      city,
      state,
      zip,
      latitude: parsedLat,
      longitude: parsedLng,
      season_start: season_start || null,
      season_end: season_end || null,
      expires_at: expires_at || null,
      status: 'active',
      approval_status: 'approved', // Private pickup markets are auto-approved
      active: true,
    }
    if (cutoffHours !== undefined) {
      insertData.cutoff_hours = cutoffHours
    }
    const { data: market, error: createError } = await supabase
      .from('markets')
      .insert(insertData)
      .select()
      .single()

    if (createError) {
      console.error('[/api/vendor/markets] Error creating market:', createError)
      // Return detailed error information for debugging
      return NextResponse.json({
        error: 'Failed to create market',
        code: 'ERR_MARKET_CREATE_001',
        details: createError.message,
        traceId: `market-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
      }, { status: 500 })
    }

    // Create market_schedules for the pickup windows
    const schedules = pickup_windows.map((window: { day_of_week: number; start_time: string; end_time: string }) => ({
      market_id: market.id,
      day_of_week: parseInt(String(window.day_of_week)),
      start_time: window.start_time,
      end_time: window.end_time,
      active: true
    }))

    const { error: scheduleError } = await supabase
      .from('market_schedules')
      .insert(schedules)

    if (scheduleError) {
      console.error('[/api/vendor/markets] Error creating schedules:', scheduleError)
      // Market was created but schedules failed - clean up
      await supabase.from('markets').delete().eq('id', market.id)
      return NextResponse.json({
        error: 'Failed to create pickup schedule',
        code: 'ERR_MARKET_SCHEDULE_001',
        details: scheduleError.message,
        traceId: `schedule-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
      }, { status: 500 })
    }

    return NextResponse.json({ market }, { status: 201 })
  } catch (error) {
    console.error('[/api/vendor/markets POST] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      error: 'Internal server error',
      code: 'ERR_MARKET_UNEXPECTED_001',
      details: errorMessage,
      traceId: `market-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
    }, { status: 500 })
  }
}
