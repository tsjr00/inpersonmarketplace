/**
 * Event Actions — Shared Logic
 *
 * Reusable functions for event lifecycle operations.
 * Called by both admin routes (manual) and self-service flow (automated).
 *
 * These functions require a Supabase service client (bypass RLS).
 * They do NOT handle HTTP responses — callers handle that.
 *
 * See: event_system_deep_dive.md Parts 12-15
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNotification } from '@/lib/notifications/service'
import { scoreVendorMatch, type VendorMatchInput } from './viability'

// --- Types ---

interface CateringRequest {
  id: string
  vertical_id: string
  company_name: string
  event_date: string
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  headcount: number
  expected_meal_count: number | null
  address: string
  city: string
  state: string
  zip: string
  vendor_count: number
  cuisine_preferences: string | null
  event_type: string | null
  payment_model: string | null
}

interface ApprovalResult {
  success: boolean
  market_id?: string
  event_token?: string
  error?: string
}

interface AutoInviteResult {
  success: boolean
  invited: number
  matched: number
  error?: string
}

// --- Event Approval (Market + Token + Schedule Creation) ---

/**
 * Approve an event request: generate token, create market, create schedule.
 * Extracted from admin events PATCH route for reuse in self-service flow.
 *
 * Does NOT update the catering_request status — caller must do that.
 * Returns the market_id and event_token for the caller to store.
 */
export async function approveEventRequest(
  serviceClient: SupabaseClient,
  request: CateringRequest
): Promise<ApprovalResult> {
  // Generate unique event token for shareable URL
  const tokenBase = request.company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
  const tokenSuffix = Date.now().toString(36).slice(-6)
  const event_token = `${tokenBase}-${tokenSuffix}`

  // Create event market
  const isFM = request.vertical_id === 'farmers_market'
  const eventSuffix = isFM ? 'Pop-Up Market' : 'Private Event'
  const eventName = `${request.company_name} ${eventSuffix}`

  const { data: market, error: marketError } = await serviceClient
    .from('markets')
    .insert({
      vertical_id: request.vertical_id,
      vendor_profile_id: null,
      name: eventName,
      market_type: 'event',
      address: request.address,
      city: request.city,
      state: request.state,
      zip: request.zip,
      event_start_date: request.event_date,
      event_end_date: request.event_end_date || request.event_date,
      cutoff_hours: 48,
      status: 'active',
      active: true,
      approval_status: 'approved',
      catering_request_id: request.id,
      headcount: request.headcount,
      is_private: true,
    })
    .select('id')
    .single()

  if (marketError || !market) {
    console.error('[event-actions] Failed to create event market:', marketError)
    return { success: false, error: 'Failed to create event market' }
  }

  // Create schedule entry for the event day
  const eventDate = new Date(request.event_date + 'T00:00:00')
  const dayOfWeek = eventDate.getUTCDay()

  await serviceClient.from('market_schedules').insert({
    market_id: market.id,
    day_of_week: dayOfWeek,
    start_time: request.event_start_time || '11:00:00',
    end_time: request.event_end_time || '14:00:00',
    active: true,
  })

  return {
    success: true,
    market_id: market.id,
    event_token,
  }
}

// --- Auto-Match + Auto-Invite Vendors ---

/** Minimum vendor match score to be auto-invited (0-5 scale) */
const MIN_MATCH_SCORE = 2.5

/** Maximum vendors to auto-invite (prevents spam if many vendors match) */
const MAX_AUTO_INVITE = 15

/**
 * Auto-match event-approved vendors to an event and send invitations.
 * Used by self-service flow — no admin involvement.
 *
 * Process:
 * 1. Query all event-approved vendors for the vertical
 * 2. Score each vendor against event criteria
 * 3. Filter to green/yellow matches (skip red)
 * 4. Create market_vendors records with response_status='invited'
 * 5. Send invitation notifications
 *
 * Returns count of vendors invited.
 */
export async function autoMatchAndInvite(
  serviceClient: SupabaseClient,
  request: CateringRequest,
  marketId: string
): Promise<AutoInviteResult> {
  // 1. Get all event-approved vendors for this vertical
  const { data: vendors } = await serviceClient
    .from('vendor_profiles')
    .select('id, user_id, profile_data, event_approved, tier, average_rating, rating_count, pickup_lead_minutes, orders_confirmed_count, orders_cancelled_after_confirm_count')
    .eq('vertical_id', request.vertical_id)
    .eq('status', 'approved')
    .eq('event_approved', true)

  if (!vendors || vendors.length === 0) {
    return { success: true, invited: 0, matched: 0, error: 'No event-approved vendors found' }
  }

  // Get listing categories + check catering menu count per vendor
  const vendorIds = vendors.map(v => v.id)
  const { data: listings } = await serviceClient
    .from('listings')
    .select('vendor_profile_id, category, listing_data')
    .in('vendor_profile_id', vendorIds)
    .eq('status', 'published')
    .is('deleted_at', null)

  // Build per-vendor category lists and catering item counts
  const vendorCategories: Record<string, string[]> = {}
  const vendorCateringCount: Record<string, number> = {}
  if (listings) {
    for (const l of listings) {
      const vid = l.vendor_profile_id as string
      if (!vendorCategories[vid]) vendorCategories[vid] = []
      if (!vendorCateringCount[vid]) vendorCateringCount[vid] = 0
      if (l.category) {
        const cats = vendorCategories[vid]
        if (!cats.includes(l.category as string)) cats.push(l.category as string)
      }
      const ld = l.listing_data as Record<string, unknown> | null
      if (ld?.event_menu_item) vendorCateringCount[vid]++
    }
  }

  // 2. Score each vendor against event criteria
  const eventData = {
    cuisine_preferences: request.cuisine_preferences,
    headcount: request.headcount,
    expected_meal_count: request.expected_meal_count,
    vendor_count: request.vendor_count,
    event_start_time: request.event_start_time,
    event_end_time: request.event_end_time,
  }

  const scoredVendors: Array<{ vendor: typeof vendors[0]; score: ReturnType<typeof scoreVendorMatch>; cateringItems: number }> = []

  for (const v of vendors) {
    const profileData = v.profile_data as Record<string, unknown> | null
    const eventReadiness = profileData?.event_readiness as Record<string, unknown> | null
    const confirmedCount = (v as Record<string, unknown>).orders_confirmed_count as number || 0
    const cancelledCount = (v as Record<string, unknown>).orders_cancelled_after_confirm_count as number || 0
    const cancellationRate = confirmedCount >= 10 ? Math.round((cancelledCount / confirmedCount) * 100) : 0
    const cateringItems = vendorCateringCount[v.id] || 0

    // Skip vendors with fewer than 4 catering items (minimum requirement)
    if (cateringItems < 4) continue

    const matchInput: VendorMatchInput = {
      vendor_id: v.id,
      business_name: (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown',
      listing_categories: vendorCategories[v.id] || [],
      max_headcount_per_wave: (eventReadiness?.max_headcount_per_wave as number) || 30,
      max_runtime_hours: (eventReadiness?.max_runtime_hours as number) || 6,
      has_event_experience: !!(eventReadiness?.has_event_experience),
      average_rating: v.average_rating as number | null,
      rating_count: (v.rating_count || 0) as number,
      cancellation_rate: cancellationRate,
      tier: (v.tier || 'free') as string,
      pickup_lead_minutes: (v.pickup_lead_minutes || 30) as number,
    }

    const score = scoreVendorMatch(matchInput, eventData)

    // 3. Filter: skip vendors with red cuisine match or red capacity
    if (score.cuisine_match === 'red' || score.capacity_fit === 'red') continue
    if (score.platform_score < MIN_MATCH_SCORE) continue

    scoredVendors.push({ vendor: v, score, cateringItems })
  }

  // Sort by platform score (highest first), then by lead time advantage
  scoredVendors.sort((a, b) => {
    if (a.score.lead_time_advantage && !b.score.lead_time_advantage) return -1
    if (!a.score.lead_time_advantage && b.score.lead_time_advantage) return 1
    return b.score.platform_score - a.score.platform_score
  })

  // Limit to MAX_AUTO_INVITE vendors
  const toInvite = scoredVendors.slice(0, MAX_AUTO_INVITE)

  if (toInvite.length === 0) {
    return { success: true, invited: 0, matched: 0, error: 'No vendors matched event criteria' }
  }

  // 4. Check for existing invitations (prevent duplicates on retry)
  const toInviteIds = toInvite.map(v => v.vendor.id)
  const { data: existingMv } = await serviceClient
    .from('market_vendors')
    .select('vendor_profile_id')
    .eq('market_id', marketId)
    .in('vendor_profile_id', toInviteIds)

  const alreadyInvited = new Set((existingMv || []).map(mv => mv.vendor_profile_id as string))
  const newInvites = toInvite.filter(v => !alreadyInvited.has(v.vendor.id))

  if (newInvites.length === 0) {
    return { success: true, invited: 0, matched: toInvite.length, error: 'All matched vendors already invited' }
  }

  // 5. Create market_vendors records
  const mvRows = newInvites.map(v => ({
    market_id: marketId,
    vendor_profile_id: v.vendor.id,
    response_status: 'invited',
    invited_at: new Date().toISOString(),
  }))

  const { error: insertError } = await serviceClient
    .from('market_vendors')
    .insert(mvRows)

  if (insertError) {
    console.error('[event-actions] Failed to create market_vendors:', insertError)
    return { success: false, invited: 0, matched: toInvite.length, error: 'Failed to create invitations' }
  }

  // 6. Send notification to each invited vendor
  const eventDateFormatted = new Date(request.event_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
  const headcountPerVendor = Math.ceil(request.headcount / request.vendor_count)

  for (const inv of newInvites) {
    if (!inv.vendor.user_id) continue
    await sendNotification(inv.vendor.user_id as string, 'catering_vendor_invited', {
      // company_name intentionally NOT shared — organizer identity protected
      companyName: 'Private Event',
      headcount: request.headcount,
      headcountPerVendor,
      eventDate: eventDateFormatted,
      eventAddress: `${request.city}, ${request.state}`,
      vertical: request.vertical_id,
      marketId: marketId,
    }, { vertical: request.vertical_id })
  }

  return {
    success: true,
    invited: newInvites.length,
    matched: toInvite.length,
  }
}
