import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────

export interface EventShopListing {
  id: string
  title: string
  description: string | null
  price_cents: number
  primary_image_url: string | null
  quantity: number | null
  unit_label: string | null
}

export interface EventShopVendor {
  id: string
  business_name: string
  description: string | null
  profile_image_url: string | null
  pickup_lead_minutes: number
  listings: EventShopListing[]
}

export interface EventShopEvent {
  company_name: string
  event_date: string
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  city: string
  state: string
  address: string
  vertical_id: string
  market_id: string
  status: string
  is_themed: boolean
  theme_description: string | null
  children_present: boolean
}

export interface EventShopSchedule {
  id: string
  start_time: string
  end_time: string
}

export interface EventShopWave {
  id: string
  wave_number: number
  start_time: string
  end_time: string
  capacity: number
  reserved_count: number
  remaining: number
  status: string
}

export interface EventShopUserReservation {
  id: string
  wave_id: string
  wave_number: number
  status: string
}

export interface EventShopData {
  event: EventShopEvent | null
  schedule: EventShopSchedule | null
  pickup_date: string | null
  vendors: EventShopVendor[]
  vendor_count: number
  is_food_truck: boolean
  payment_model: string
  company_max_per_attendee_cents: number | null
  requires_access_code: boolean
  wave_ordering_enabled: boolean
  waves: EventShopWave[]
  user_reservation: EventShopUserReservation | null
  /** Present only when the lib couldn't populate the full response. */
  reason?: 'not_found'
  errorMessage?: string
}

// ── Fetch function ────────────────────────────────────────────────────

/**
 * Fetch everything needed by the event shop page in one call.
 *
 * Called by:
 * - `apps/web/src/app/api/events/[token]/shop/route.ts` — HTTP wrapper
 *   that adds auth check + rate limit + cache headers, then returns the
 *   JSON payload.
 * - `apps/web/src/app/[vertical]/events/[token]/shop/page.tsx` — server
 *   component that calls this directly, bypasses the HTTP layer for
 *   faster first paint, and passes the result to the client subcomponent
 *   as initial props.
 *
 * The caller supplies its own service client + auth identity. Pass
 * `user = null` for unauthenticated callers; `price_cents` and inventory
 * will be zeroed/nulled in the response and `user_reservation` will be
 * null. All other fields stay populated so anonymous browsers can still
 * see the event + vendors + listings (just not prices).
 */
export async function getEventShopData(
  serviceClient: SupabaseClient,
  token: string,
  user: { id: string } | null
): Promise<EventShopData> {
  const empty: EventShopData = {
    event: null,
    schedule: null,
    pickup_date: null,
    vendors: [],
    vendor_count: 0,
    is_food_truck: false,
    payment_model: 'attendee_paid',
    company_max_per_attendee_cents: null,
    requires_access_code: false,
    wave_ordering_enabled: false,
    waves: [],
    user_reservation: null,
  }

  const isAuthenticated = !!user

  // Fetch event by token
  const { data: event, error: eventError } = await serviceClient
    .from('catering_requests')
    .select('id, company_name, event_date, event_end_date, event_start_time, event_end_time, headcount, address, city, state, zip, vertical_id, market_id, status, vendor_count, is_themed, theme_description, children_present, payment_model, company_max_per_attendee_cents')
    .eq('event_token', token)
    .in('status', ['approved', 'ready', 'active'])
    .single()

  if (eventError || !event || !event.market_id) {
    return { ...empty, reason: 'not_found', errorMessage: eventError?.message }
  }

  // Get market schedule (needed for cart's schedule_id + pickup_date)
  const { data: schedule } = await serviceClient
    .from('market_schedules')
    .select('id, start_time, end_time, day_of_week')
    .eq('market_id', event.market_id)
    .limit(1)
    .single()

  // Get accepted vendor IDs from market_vendors (simple query, no join)
  const { data: marketVendors } = await serviceClient
    .from('market_vendors')
    .select('vendor_profile_id')
    .eq('market_id', event.market_id)
    .eq('response_status', 'accepted')

  const acceptedVendorIds = (marketVendors || []).map(mv => mv.vendor_profile_id as string)

  // Fetch vendor profiles separately (avoids PostgREST FK ambiguity with replaced_vendor_id)
  const vendorProfileMap: Record<string, {
    id: string; profile_data: Record<string, unknown>
    profile_image_url: string | null; description: string | null
    pickup_lead_minutes: number
  }> = {}

  if (acceptedVendorIds.length > 0) {
    const { data: profiles } = await serviceClient
      .from('vendor_profiles')
      .select('id, profile_data, profile_image_url, description, pickup_lead_minutes')
      .in('id', acceptedVendorIds)
      .eq('status', 'approved')
      .is('deleted_at', null)

    for (const vp of profiles || []) {
      vendorProfileMap[vp.id] = {
        id: vp.id,
        profile_data: vp.profile_data as Record<string, unknown>,
        profile_image_url: vp.profile_image_url,
        description: vp.description,
        pickup_lead_minutes: (vp.pickup_lead_minutes as number) || 30,
      }
    }
  }

  const vendors: EventShopVendor[] = []

  // Batch: get ALL event_vendor_listings for this market in one query,
  // then ALL listings in one query, then group by vendor in JS.
  const { data: allEvlRows } = await serviceClient
    .from('event_vendor_listings')
    .select('vendor_profile_id, listing_id')
    .eq('market_id', event.market_id)
    .in('vendor_profile_id', acceptedVendorIds)

  const allListingIds = [...new Set((allEvlRows || []).map(r => r.listing_id as string))]

  // Fetch ALL listings in one call. Images come from the `listing_images`
  // table (source of truth — same pattern the listing detail page, browse,
  // and vendor profile use). The `listings.image_urls` text[] column is
  // vestigial and is NOT populated by the current upload flow.
  const allListingMap: Record<string, EventShopListing> = {}
  if (allListingIds.length > 0) {
    const { data: allListingRows } = await serviceClient
      .from('listings')
      .select('id, title, description, price_cents, quantity, listing_data, listing_images (url, is_primary, display_order)')
      .in('id', allListingIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    for (const l of allListingRows || []) {
      const ld = (l.listing_data as Record<string, unknown>) || {}
      const images = (l.listing_images as { url: string; is_primary: boolean; display_order: number }[] | null) || []
      const primary = images.find(img => img.is_primary) || images[0]
      allListingMap[l.id] = {
        id: l.id,
        title: l.title,
        description: l.description,
        price_cents: isAuthenticated ? (l.price_cents as number) : 0,
        primary_image_url: primary?.url || null,
        quantity: isAuthenticated ? (l.quantity as number | null) : null,
        unit_label: (ld.unit_label as string) || null,
      }
    }
  }

  // Group by vendor
  const vendorListingsMap: Record<string, EventShopListing[]> = {}
  for (const evl of allEvlRows || []) {
    const vid = evl.vendor_profile_id as string
    const lid = evl.listing_id as string
    const listing = allListingMap[lid]
    if (!listing) continue
    if (!vendorListingsMap[vid]) vendorListingsMap[vid] = []
    vendorListingsMap[vid].push(listing)
  }

  // Build vendors array
  for (const vendorId of acceptedVendorIds) {
    const vp = vendorProfileMap[vendorId]
    if (!vp) continue
    const listings = vendorListingsMap[vendorId] || []
    if (listings.length === 0) continue
    vendors.push({
      id: vp.id,
      business_name: (vp.profile_data?.business_name as string) || (vp.profile_data?.farm_name as string) || 'Vendor',
      description: vp.description,
      profile_image_url: vp.profile_image_url,
      pickup_lead_minutes: vp.pickup_lead_minutes || 30,
      listings,
    })
  }

  const isFT = event.vertical_id === 'food_trucks'

  // Check if wave ordering is enabled for this event
  const { data: market } = await serviceClient
    .from('markets')
    .select('wave_ordering_enabled')
    .eq('id', event.market_id)
    .single()

  const waveOrderingEnabled = market?.wave_ordering_enabled === true

  // Fetch waves if enabled
  let waves: EventShopWave[] = []
  if (waveOrderingEnabled) {
    const { data: waveRows } = await serviceClient
      .rpc('get_event_waves_with_availability', { p_market_id: event.market_id })

    waves = (waveRows || []).map((w: Record<string, unknown>) => ({
      id: w.wave_id as string,
      wave_number: w.wave_number as number,
      start_time: w.start_time as string,
      end_time: w.end_time as string,
      capacity: w.capacity as number,
      reserved_count: w.reserved_count as number,
      remaining: w.remaining as number,
      status: w.status as string,
    }))
  }

  // Fetch user's existing wave reservation (if authenticated)
  let userReservation: EventShopUserReservation | null = null
  if (user && waveOrderingEnabled) {
    const { data: reservation } = await serviceClient
      .from('event_wave_reservations')
      .select('id, wave_id, status')
      .eq('market_id', event.market_id)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (reservation) {
      const matchedWave = waves.find(w => w.id === reservation.wave_id)
      userReservation = {
        id: reservation.id,
        wave_id: reservation.wave_id as string,
        wave_number: matchedWave?.wave_number || 0,
        status: reservation.status as string,
      }
    }
  }

  return {
    event: {
      company_name: event.company_name as string,
      event_date: event.event_date as string,
      event_end_date: event.event_end_date as string | null,
      event_start_time: event.event_start_time as string | null,
      event_end_time: event.event_end_time as string | null,
      city: event.city as string,
      state: event.state as string,
      address: event.address as string,
      vertical_id: event.vertical_id as string,
      market_id: event.market_id as string,
      status: event.status as string,
      is_themed: event.is_themed as boolean,
      theme_description: event.theme_description as string | null,
      children_present: event.children_present as boolean,
    },
    schedule: schedule ? {
      id: schedule.id as string,
      start_time: schedule.start_time as string,
      end_time: schedule.end_time as string,
    } : null,
    pickup_date: event.event_date as string,
    vendors,
    vendor_count: vendors.length,
    is_food_truck: isFT,
    payment_model: (event.payment_model as string) || 'attendee_paid',
    company_max_per_attendee_cents: (event.company_max_per_attendee_cents as number | null) || null,
    requires_access_code: event.payment_model === 'company_paid' || event.payment_model === 'hybrid',
    wave_ordering_enabled: waveOrderingEnabled,
    waves,
    user_reservation: userReservation,
  }
}
