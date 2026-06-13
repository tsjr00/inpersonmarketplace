import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getTierLimits, isPremiumTier } from '@/lib/vendor-limits'
import { withErrorTracing } from '@/lib/errors/with-error-tracing'
import { TracedError } from '@/lib/errors/traced-error'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { geocodeZipCode } from '@/lib/geocode'
import { DEFAULT_CUTOFF_HOURS } from '@/lib/constants'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

// GET - Get vendor's markets
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`vendor-markets-get:${clientIp}`, rateLimits.api)
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

    // Get vendor profile for this vertical — multi-vertical safe via shared utility
    const { profile: vendorProfile, error: vpError } = await getVendorProfileForVertical<{
      id: string
      tier: string | null
      home_market_id: string | null
      status: string
      deleted_at: string | null
      market_box_frequency: string | null
      profile_data: Record<string, unknown> | null
    }>(supabase, user.id, vertical, 'id, tier, home_market_id, status, deleted_at, market_box_frequency, profile_data')

    if (vpError || !vendorProfile || vendorProfile.deleted_at !== null) {
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
    const tier = vendorProfile.tier || 'free'
    const tierLimits = getTierLimits(tier, vertical)
    const isVendorPremium = isPremiumTier(tier, vertical)

    // Query vendor attendance records (including vendor-specific times for polling)
    const { data: attendanceData } = await supabase
      .from('vendor_market_schedules')
      .select('market_id, schedule_id, vendor_start_time, vendor_end_time')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('is_active', true)

    const marketsWithAttendance = new Set(
      (attendanceData || []).map(a => a.market_id as string)
    )

    // Query markets where vendor actually has current commerce:
    // published listings OR active market boxes. Drives the "Active" badge
    // in the UI so vendors see which markets are producing sales right now
    // vs. merely enrolled (attendance row only). Separate from the attendance
    // set above, which persists across listing churn and drives FT pickup
    // availability via get_available_pickup_dates.
    const [listingMarketsRes, activeBoxesRes, marketVendorRes] = await Promise.all([
      supabase
        .from('listing_markets')
        .select('market_id, listings!inner(vendor_profile_id, status, deleted_at)')
        .eq('listings.vendor_profile_id', vendorProfile.id)
        .eq('listings.status', 'published')
        .is('listings.deleted_at', null),
      supabase
        .from('market_box_offerings')
        .select('pickup_market_id')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('active', true),
      // Session 92 A3 — markets where this vendor has a market_vendors
      // relationship (invited/accepted/approved; declined excluded).
      // Drives the "connected" set for the open-booth snapshot: we only
      // surface availability at markets the vendor already has a
      // connection to (user decision 2026-06-12 — no cross-market
      // vendor poaching via availability surfacing).
      supabase
        .from('market_vendors')
        .select('market_id, response_status')
        .eq('vendor_profile_id', vendorProfile.id),
    ])

    const marketsWithListings = new Set<string>()
    for (const row of listingMarketsRes.data || []) {
      if (row.market_id) marketsWithListings.add(row.market_id as string)
    }
    for (const box of activeBoxesRes.data || []) {
      if (box.pickup_market_id) marketsWithListings.add(box.pickup_market_id as string)
    }

    // Build a lookup of vendor-specific times by schedule_id
    const vendorTimesBySchedule = new Map<string, { start: string; end: string }>()
    for (const a of attendanceData || []) {
      if (a.schedule_id && (a.vendor_start_time || a.vendor_end_time)) {
        vendorTimesBySchedule.set(a.schedule_id, {
          start: a.vendor_start_time || '',
          end: a.vendor_end_time || '',
        })
      }
    }

    // Phase B (2026-05-16) geographic filter: show only markets within
    // ~100 miles of the vendor's location. Vendor location is derived
    // from their profile_data.zip (set during signup). If we can't
    // geocode (no zip, unrecognized zip), we skip filtering — graceful
    // fallback so vendors with incomplete profiles still see something.
    //
    // Markets the vendor is already attending or has listings at are
    // ALWAYS kept regardless of distance — we don't yank visibility
    // from established relationships.
    //
    // Private pickup markets are vendor-owned, never filtered.
    const VENDOR_MARKET_RADIUS_MILES = 100
    let vendorLat: number | null = null
    let vendorLng: number | null = null
    const profileData = (vendorProfile.profile_data || {}) as Record<string, unknown>
    const profileZipRaw =
      (profileData.zip ?? profileData.zip_code ?? profileData.postal_code ?? null) as
        | string
        | null
    if (typeof profileZipRaw === 'string' && profileZipRaw.trim().length > 0) {
      try {
        const geo = await geocodeZipCode(profileZipRaw.trim())
        if (geo) {
          vendorLat = geo.latitude
          vendorLng = geo.longitude
        }
      } catch {
        // Silent — fall through to no-filter.
      }
    }

    // Predicate: should this market be visible to this vendor?
    // True if no vendor location, market has no coordinates, vendor
    // already has a relationship with it, or within radius.
    const isWithinRadius = (
      mLat: number | null | undefined,
      mLng: number | null | undefined,
      marketId: string
    ): boolean => {
      if (vendorLat === null || vendorLng === null) return true // no filter
      if (marketsWithAttendance.has(marketId) || marketsWithListings.has(marketId)) {
        return true // preserve existing relationships
      }
      if (mLat === null || mLat === undefined || mLng === null || mLng === undefined) {
        return true // market has no coords — show by default
      }
      const distance = haversineMiles(vendorLat, vendorLng, Number(mLat), Number(mLng))
      return distance <= VENDOR_MARKET_RADIUS_MILES
    }

    // Get event markets (future events only — past events auto-filtered)
    const today = new Date().toISOString().split('T')[0]
    const eventMarkets = (allMarkets || [])
      .filter(m => m.market_type === 'event' && m.event_end_date >= today)
      .filter(m => isWithinRadius(m.latitude as number, m.longitude as number, m.id as string))
      .map(m => {
        const schedules = (m.market_schedules || []).map((s: any) => {
          const vendorTimes = vendorTimesBySchedule.get(s.id)
          return {
            ...s,
            start_time: vendorTimes?.start || s.start_time,
            end_time: vendorTimes?.end || s.end_time,
          }
        })
        return {
          ...m,
          market_schedules: schedules,
          hasAttendance: marketsWithAttendance.has(m.id),
          hasListings: marketsWithListings.has(m.id),
        }
      })

    const fixedMarkets = (allMarkets || [])
      .filter(m => m.market_type === 'traditional')
      .filter(m => isWithinRadius(m.latitude as number, m.longitude as number, m.id as string))
      .map(m => {
      // Merge vendor-specific times into market schedules
      const schedules = (m.market_schedules || []).map((s: any) => {
        const vendorTimes = vendorTimesBySchedule.get(s.id)
        return {
          ...s,
          // Use vendor times when available, otherwise market defaults
          start_time: vendorTimes?.start || s.start_time,
          end_time: vendorTimes?.end || s.end_time,
        }
      })
      return {
        ...m,
        market_schedules: schedules,
        isHomeMarket: m.id === vendorProfile.home_market_id,
        // Session 70: home_market_id no longer restricts which markets vendors
        // can use. Tier-cap enforcement happens at listing save time via
        // POST /api/vendor/listings/[listingId]/markets. Kept for backward compat.
        canUse: true,
        homeMarketRestricted: false,
        hasAttendance: marketsWithAttendance.has(m.id),
        hasListings: marketsWithListings.has(m.id),
      }
    })

    // ============================================================
    // Session 92 A3: open-booth snapshot for CONNECTED markets.
    // Connected = market_vendors row (non-declined) OR attendance OR
    // listings at the market. Only traditional markets with online
    // booking enabled (stripe_charges_enabled) get a snapshot.
    //
    // Math mirrors the book flow's capacity model: per tier,
    //   open = count − placeholders(tier) − non-cancelled rentals(tier, week)
    // Untiered placeholders are ignored here, matching the booking RPC's
    // per-tier check (known modeling gap, see backlog "booth-tier
    // required" item). Display-only — the RPC remains authoritative at
    // booking time.
    //
    // Service client: booth tables are RLS-deny for non-managers (same
    // pattern as the book page, which is also vendor-facing). Auth was
    // enforced above (user + vendor profile).
    // ============================================================
    const connectedMarketIds = new Set<string>()
    for (const row of marketVendorRes.data || []) {
      if ((row.response_status as string | null) !== 'declined') {
        connectedMarketIds.add(row.market_id as string)
      }
    }
    for (const id of marketsWithAttendance) connectedMarketIds.add(id)
    for (const id of marketsWithListings) connectedMarketIds.add(id)

    // Next bookable Sunday (strictly future) in a market's local timezone.
    // Mirrors the book page's nextSundays() week math.
    const nextBookableSunday = (timezone: string): string => {
      const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
      const daysUntil = (7 - localNow.getDay()) % 7 || 7
      const d = new Date(localNow)
      d.setDate(localNow.getDate() + daysUntil)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    type BoothAvailabilityEntry = { week_start: string; open_count: number; from_price_cents: number | null }
    const boothAvailabilityByMarket = new Map<string, BoothAvailabilityEntry>()

    const bookableConnected = (allMarkets || []).filter(m =>
      m.market_type === 'traditional' &&
      connectedMarketIds.has(m.id as string) &&
      m.stripe_charges_enabled === true
    )

    if (bookableConnected.length > 0) {
      const serviceClient = createServiceClient()
      const ids = bookableConnected.map(m => m.id as string)
      const weekByMarket = new Map<string, string>(
        bookableConnected.map(m => [
          m.id as string,
          nextBookableSunday((m.timezone as string | null) || 'America/Chicago'),
        ])
      )
      const weekDates = [...new Set(weekByMarket.values())]

      const [inventoryRes, placeholdersRes, rentalsRes] = await Promise.all([
        serviceClient
          .from('market_booth_inventory')
          .select('id, market_id, count, weekly_price_cents')
          .in('market_id', ids),
        serviceClient
          .from('market_booth_placeholders')
          .select('market_id, inventory_id')
          .in('market_id', ids)
          .not('inventory_id', 'is', null),
        serviceClient
          .from('weekly_booth_rentals')
          .select('market_id, inventory_id, week_start_date, status')
          .in('market_id', ids)
          .in('week_start_date', weekDates)
          .in('status', ['pending_payment', 'paid']),
      ])

      const placeholderCountByTier = new Map<string, number>()
      for (const p of placeholdersRes.data || []) {
        const key = p.inventory_id as string
        placeholderCountByTier.set(key, (placeholderCountByTier.get(key) || 0) + 1)
      }

      const rentalCountByTierWeek = new Map<string, number>()
      for (const r of rentalsRes.data || []) {
        const key = `${r.inventory_id}|${r.week_start_date}`
        rentalCountByTierWeek.set(key, (rentalCountByTierWeek.get(key) || 0) + 1)
      }

      const tiersByMarket = new Map<string, Array<{ id: string; count: number; price: number }>>()
      for (const t of inventoryRes.data || []) {
        const mid = t.market_id as string
        const list = tiersByMarket.get(mid) || []
        list.push({ id: t.id as string, count: (t.count as number) || 0, price: t.weekly_price_cents as number })
        tiersByMarket.set(mid, list)
      }

      for (const mid of ids) {
        const tiers = tiersByMarket.get(mid)
        if (!tiers || tiers.length === 0) continue // no inventory → no snapshot
        const week = weekByMarket.get(mid)!
        let openTotal = 0
        let fromPrice: number | null = null
        for (const tier of tiers) {
          const taken =
            (placeholderCountByTier.get(tier.id) || 0) +
            (rentalCountByTierWeek.get(`${tier.id}|${week}`) || 0)
          const open = Math.max(0, tier.count - taken)
          openTotal += open
          if (open > 0 && (fromPrice === null || tier.price < fromPrice)) {
            fromPrice = tier.price
          }
        }
        boothAvailabilityByMarket.set(mid, {
          week_start: week,
          open_count: openTotal,
          from_price_cents: fromPrice,
        })
      }
    }

    const fixedMarketsWithBooths = fixedMarkets.map(m => ({
      ...m,
      boothAvailability: boothAvailabilityByMarket.get(m.id as string) ?? null,
    }))

    // Count current fixed markets for this vendor
    const { data: currentCount } = await supabase
      .rpc('get_vendor_fixed_market_count', {
        p_vendor_profile_id: vendorProfile.id,
        p_vertical_id: vertical
      })

    const currentFixedMarketCount = currentCount || 0

    // Get vendor's market suggestions (pending, approved, rejected) — both traditional and event
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
        market_type,
        approval_status,
        rejection_reason,
        submitted_at,
        event_start_date,
        event_end_date,
        market_schedules (
          id,
          day_of_week,
          start_time,
          end_time,
          active
        )
      `)
      .eq('vertical_id', vertical)
      .in('market_type', ['traditional', 'event'])
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

    // NEW-8: pending manager-initiated invitations to this vendor.
    // Market_vendors rows with response_status='invited' AND approved=false.
    // Surfaced on /[vertical]/vendor/markets via PendingMarketInvitations
    // card. Includes market metadata so the card can render without a
    // second round-trip.
    const { data: invitationRows } = await supabase
      .from('market_vendors')
      .select(`
        id,
        market_id,
        invited_at,
        markets!inner (
          id, name, address, city, state, zip, market_type, vertical_id
        )
      `)
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('response_status', 'invited')
      .eq('approved', false)
      .order('invited_at', { ascending: false })

    const pendingInvitations = (invitationRows || [])
      .map((row) => {
        const m = row.markets as unknown as
          | { id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null; market_type: string; vertical_id: string }
          | { id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null; market_type: string; vertical_id: string }[]
          | null
        const market = Array.isArray(m) ? m[0] : m
        if (!market) return null
        // Scope to this vendor's vertical — defensive, the join already
        // matches via vendor_profile_id but markets can be in different
        // verticals if the vendor has cross-vertical profiles.
        if (market.vertical_id !== vertical) return null
        return {
          market_vendor_id: row.id as string,
          market_id: row.market_id as string,
          invited_at: (row.invited_at as string | null) ?? null,
          market_name: market.name,
          market_address: market.address,
          market_city: market.city,
          market_state: market.state,
          market_zip: market.zip,
          market_type: market.market_type,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    return NextResponse.json({
      fixedMarkets: fixedMarketsWithBooths,
      eventMarkets,
      privatePickupMarkets: vendorMarkets,
      marketSuggestions: transformedSuggestions,
      pendingInvitations,
      homeMarketId: vendorProfile.home_market_id,
      marketBoxFrequency: vendorProfile.market_box_frequency === 'biweekly' ? 'biweekly' : 'weekly',
      vendorTier: tier,
      vendorStatus: vendorProfile.status || 'pending',
      isPremium: isVendorPremium,
      limits: {
        traditionalMarkets: tierLimits.traditionalMarkets,
        privatePickupLocations: tierLimits.privatePickupLocations,
        pickupWindowsPerLocation: tierLimits.pickupWindowsPerLocation,
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
  const rateLimitResult = await checkRateLimit(`vendor-markets-post:${clientIp}`, rateLimits.api)
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
          // Auto-geocoded successfully
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

    // Get vendor profile with tier to check window limit — multi-vertical safe
    const { profile: vendorProfileForTier, error: tierError } = await getVendorProfileForVertical<{
      id: string
      tier: string | null
      deleted_at: string | null
    }>(supabase, user.id, vertical, 'id, tier, deleted_at')

    if (tierError || !vendorProfileForTier || vendorProfileForTier.deleted_at !== null) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    const tier = vendorProfileForTier.tier || 'free'
    const tierLimits = getTierLimits(tier, vertical)
    const maxWindows = tierLimits.pickupWindowsPerLocation

    if (pickup_windows.length > maxWindows) {
      return NextResponse.json({
        error: `Maximum of ${maxWindows} pickup windows allowed for ${tier} tier vendors.${(tier === 'free' || tier === 'standard') ? ' Upgrade your plan for more windows.' : ''}`
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
    // Food trucks default to 0 cutoff (prepare on the spot), FM uses DB default
    const cutoffHours = vertical === 'food_trucks' ? DEFAULT_CUTOFF_HOURS.food_trucks : undefined
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

/**
 * Haversine distance between two lat/lng pairs in miles.
 * Used to filter markets to a vendor's local area (Phase B 2026-05-16).
 * Inline copy — also exists in src/app/api/markets/nearby/route.ts;
 * extract to a shared lib if a third caller appears.
 */
function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const toRad = (deg: number): number => deg * (Math.PI / 180)
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
