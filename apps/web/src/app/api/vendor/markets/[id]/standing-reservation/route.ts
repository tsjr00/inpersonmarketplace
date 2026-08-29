import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, logError, observed } from '@/lib/errors'
import { fetchMarketOptinForVendor } from '@/lib/markets/optin-public'
import { computeAgreementVersionFromSnapshot } from '@/lib/markets/agreement-version'
import { sendNotification } from '@/lib/notifications'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * POST /api/vendor/markets/[id]/standing-reservation
 *
 * FT park-manager P4a — a food truck REQUESTS a recurring hold on a spot for a
 * day-of-week ("Spot A every Saturday"). Creates a `requested` row; the operator
 * approves it (manager route). Gates: FT paid park, spot active + in-market +
 * recurring_eligible, day is an operating day, not already held for that DOW.
 *
 * Body: { spot_id: string, day_of_week: number(0-6) }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vendor/markets/[id]/standing-reservation', 'POST', async () => {
    const { id: marketId } = await params

    const rl = await checkRateLimit(`standing-req:${getClientIp(request)}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const body = await request.json().catch(() => ({}))
    const spotId = typeof body?.spot_id === 'string' ? body.spot_id : ''
    const dow = Number(body?.day_of_week)
    if (!spotId) return NextResponse.json({ error: 'spot_id is required', field: 'spot_id' }, { status: 400 })
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return NextResponse.json({ error: 'day_of_week must be 0–6', field: 'day_of_week' }, { status: 400 })
    }
    // B1 — compliance acknowledgment required (docs not required; book-then-vet).
    if (body?.doc_ack_accepted !== true) {
      return NextResponse.json({ error: 'doc_ack_accepted must be true', field: 'doc_ack_accepted' }, { status: 400 })
    }
    // P4a follow-up — the truck says when the hold should begin (gates generation).
    const requestedStartDate = typeof body?.requested_start_date === 'string' ? body.requested_start_date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate)) {
      return NextResponse.json({ error: 'requested_start_date is required (YYYY-MM-DD)', field: 'requested_start_date' }, { status: 400 })
    }

    const { data: market } = await observed(supabase
      .from('markets')
      .select('id, name, vertical_id, park_mode, manager_user_id, timezone')
      .eq('id', marketId)
      .maybeSingle(), { table: 'markets' })
    if (!market) return NextResponse.json({ error: 'Park not found' }, { status: 404 })
    if (market.park_mode !== 'paid') {
      return NextResponse.json(
        { error: `${(market.name as string) || 'This park'} isn't taking paid spot bookings.` },
        { status: 409 }
      )
    }

    const { profile, error: profErr } = await getVendorProfileForVertical<{ id: string; profile_data: Record<string, unknown> | null }>(
      supabase, user.id, market.vertical_id as string, 'id, profile_data'
    )
    if (profErr || !profile) {
      return NextResponse.json({ error: profErr || 'Food truck profile not found' }, { status: 404 })
    }

    const service = createServiceClient()

    // B3 — a blocked truck can't request a recurring hold either. Fail-open.
    const { data: vetting } = await observed(service
      .from('park_vendor_vetting')
      .select('blocked')
      .eq('market_id', marketId)
      .eq('vendor_profile_id', profile.id)
      .maybeSingle(), { table: 'park_vendor_vetting' })
    if (vetting?.blocked === true) {
      return NextResponse.json(
        { error: `${(market.name as string) || 'This park'} has blocked new bookings from your food truck.` },
        { status: 403 }
      )
    }

    crumb.supabase('select', 'park_spots')
    const { data: spot } = await observed(service
      .from('park_spots')
      .select('id, market_id, active, recurring_eligible, label, max_length_ft')
      .eq('id', spotId)
      .maybeSingle(), { table: 'park_spots' })
    if (!spot || spot.market_id !== marketId) {
      return NextResponse.json({ error: 'Spot not found at this park', field: 'spot_id' }, { status: 404 })
    }
    if (spot.active !== true) {
      return NextResponse.json({ error: 'That spot is not available.', field: 'spot_id' }, { status: 409 })
    }
    if (spot.recurring_eligible !== true) {
      return NextResponse.json({ error: 'That spot is not eligible for recurring holds.', field: 'spot_id' }, { status: 409 })
    }

    // Tester finding P6 (user decision 2026-07-15: BLOCK with explanation) —
    // occurrences inherit this hold's spot, so an oversized truck is blocked
    // here too. Only enforced when BOTH numbers are known.
    const readiness = ((profile.profile_data as Record<string, unknown> | null)?.event_readiness ?? {}) as Record<string, unknown>
    const truckLengthFt = typeof readiness.vehicle_length_feet === 'number' && readiness.vehicle_length_feet > 0
      ? readiness.vehicle_length_feet
      : null
    const spotMaxLengthFt = (spot.max_length_ft as number | null) ?? null
    if (truckLengthFt !== null && spotMaxLengthFt !== null && truckLengthFt > spotMaxLengthFt) {
      return NextResponse.json(
        {
          error: `Your truck is ${truckLengthFt} ft, but ${(spot.label as string) || 'this spot'} fits up to ${spotMaxLengthFt} ft. Choose a larger spot.`,
          field: 'spot_id',
        },
        { status: 409 }
      )
    }

    // The DOW must be an operating day of the park.
    const { data: scheds } = await observed(service
      .from('market_schedules')
      .select('day_of_week')
      .eq('market_id', marketId)
      .eq('active', true), { table: 'market_schedules' })
    const activeDows = new Set((scheds ?? []).map((s) => s.day_of_week as number))
    if (!activeDows.has(dow)) {
      return NextResponse.json({ error: "The park isn't open on that day.", field: 'day_of_week' }, { status: 400 })
    }

    // The requested start date must fall on the selected DOW and be today or
    // later (park-local). It gates when the generator starts materializing
    // occurrences, so an approval can't charge for a date before the truck meant.
    const [sy, sm, sd] = requestedStartDate.split('-').map(Number)
    if (new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay() !== dow) {
      return NextResponse.json({ error: 'The start date must fall on the day of week you chose.', field: 'requested_start_date' }, { status: 400 })
    }
    const tz = (market.timezone as string | null) || 'America/Chicago'
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    const todayLocalISO = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`
    if (requestedStartDate < todayLocalISO) {
      return NextResponse.json({ error: 'The start date must be today or later.', field: 'requested_start_date' }, { status: 400 })
    }

    // B2: auto-affiliate — ensure a market_vendors row so the truck lands on the
    // operator's roster to be vetted. Idempotent; best-effort.
    crumb.supabase('insert', 'market_vendors')
    const { error: mvErr } = await service
      .from('market_vendors')
      .upsert(
        { market_id: marketId, vendor_profile_id: profile.id, approved: false },
        { onConflict: 'market_id,vendor_profile_id', ignoreDuplicates: true }
      )
    if (mvErr) {
      logError(traced.fromSupabase(mvErr, { table: 'market_vendors', operation: 'insert' }))
    }

    // B1: record acceptance of the park's opt-in agreement + compliance
    // acknowledgment + info-sharing consent (unlocks manager doc review).
    // Synthetic `_` entries are excluded from the version hash. Idempotent (23505).
    const { snapshot } = await fetchMarketOptinForVendor(marketId)
    const finalSnapshot = [
      ...snapshot,
      { statement_id: '_info_sharing_consent', category: '_meta', statement_text: 'Vendor authorizes the platform to share their compliance documentation with the park operator.', placeholder_values: {} },
      { statement_id: '_park_doc_acknowledgment', category: '_meta', statement_text: 'Truck acknowledges it must upload every required document, keep them unexpired and valid before the rented time, and that missing/expired/inaccurate docs may result in cancellation without refund and declined future bookings.', placeholder_values: {} },
    ]
    const agreementVersion = computeAgreementVersionFromSnapshot(snapshot)
    crumb.supabase('insert', 'vendor_market_agreement_acceptances')
    const { error: vmaaErr } = await service
      .from('vendor_market_agreement_acceptances')
      .insert({
        vendor_profile_id: profile.id,
        market_id: marketId,
        statements_snapshot: finalSnapshot,
        agreement_version: agreementVersion,
      })
    if (vmaaErr && vmaaErr.code !== '23505') {
      throw traced.fromSupabase(vmaaErr, { table: 'vendor_market_agreement_acceptances', operation: 'insert' })
    }

    crumb.supabase('insert', 'park_standing_reservations')
    const { data, error } = await service
      .from('park_standing_reservations')
      .insert({
        market_id: marketId,
        vendor_profile_id: profile.id,
        spot_id: spotId,
        day_of_week: dow,
        status: 'requested',
        requested_start_date: requestedStartDate,
      })
      .select('id, spot_id, day_of_week, status, requested_start_date')
      .single()

    if (error) {
      if (error.code === '23505') {
        // The partial-unique index allows one requested/active hold per
        // (spot, day_of_week). Tell the truck WHICH case they hit — their own
        // pending request (so they stop re-trying with a new date) vs. another
        // truck's hold — instead of a vague "already held".
        const { data: conflict } = await observed(service
          .from('park_standing_reservations')
          .select('vendor_profile_id, status')
          .eq('spot_id', spotId)
          .eq('day_of_week', dow)
          .in('status', ['requested', 'active'])
          .maybeSingle(), { table: 'park_standing_reservations' })
        const mine = conflict?.vendor_profile_id === profile.id
        const msg = mine
          ? conflict?.status === 'active'
            ? 'You already have an active weekly hold for this spot on this day.'
            : "You've already requested this spot on this day — it's pending the operator's review. You can't request it again until they respond, and changing the start date won't change that."
          : 'Another truck already holds (or has requested) this spot on this day. Try a different spot or day.'
        return NextResponse.json({ error: msg, field: 'spot_id' }, { status: 409 })
      }
      throw traced.fromSupabase(error, { table: 'park_standing_reservations', operation: 'insert' })
    }

    // Notify the operator that a hold request is waiting (sendNotification never
    // throws). Recipient = the park's assigned manager; skip if there's none.
    const managerUserId = market.manager_user_id as string | null | undefined
    if (managerUserId) {
      const { data: vp } = await observed(service
        .from('vendor_profiles')
        .select('profile_data')
        .eq('id', profile.id)
        .maybeSingle(), { table: 'vendor_profiles' })
      const pd = vp?.profile_data as { business_name?: string; farm_name?: string } | null
      const startDisplay = new Date(sy, sm - 1, sd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      await sendNotification(
        managerUserId,
        'park_standing_hold_requested',
        {
          marketName: (market.name as string) || 'your park',
          vendorName: pd?.business_name || pd?.farm_name || 'A food truck',
          spotLabel: (spot.label as string) || 'a spot',
          weekday: WEEKDAYS[dow],
          marketDate: startDisplay,
          marketId,
        },
        { vertical: (market.vertical_id as string) || 'food_trucks' }
      )
    }

    return NextResponse.json({ row: data }, { status: 201 })
  })
}
