import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { eventRefColumn } from '@/lib/events/event-ref'
import {
  changeRequiresReconfirmation,
  describeTimeUntil,
  evaluateChangeWindow,
} from '@/lib/events/change-window'
import { describeChanges } from '@/lib/events/change-requests'
import { sendNotification } from '@/lib/notifications/service'
import { requestEventReconfirmation } from '@/lib/events/reconfirmation'

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * GET /api/events/[token]/details
 * Fetch current event details for the organizer's progressive form.
 *
 * PATCH /api/events/[token]/details
 * Organizer updates Stage 1 details (matching + logistics).
 * Auth: must be the organizer (organizer_user_id match or email match).
 * Only allows updates to detail fields — never status, market_id, or event_token.
 *
 * ⚠ The [token] segment accepts EITHER an event_token OR a catering_requests.id
 * (see lib/events/event-ref.ts). A pre-approval event has no token yet, and the
 * organizer must still be able to fill in the address that approval requires —
 * that missing path is what made an addressless event permanently stuck. Auth is
 * unchanged and is organizer-based, so an id grants nothing extra.
 */

// Stage 2 detail fields: matching quality + logistics + corrections to Stage 1 entries
const ALLOWED_FIELDS = [
  'cuisine_preferences',
  'dietary_notes',
  'preferred_vendor_categories',
  'total_food_budget_cents',
  'per_meal_budget_cents',
  'estimated_spend_per_attendee_cents',
  'expected_meal_count',
  'budget_notes',
  'beverages_provided',
  'dessert_provided',
  'competing_food_options',
  'setup_instructions',
  'additional_notes',
  'vendor_stay_policy',
  // Mig 231 (owner 2026-08-15): organizer declares whether vendors need a
  // background check + the process/cost — surfaced to vendors pre-decision.
  'background_check_required',
  'background_check_details',
  // Mig 232: equal-weight risk checklist feeding the backup-bench
  // recommendation (lib/events/backup-bench.ts).
  'cancellation_risk_factors',
  'estimated_dwell_hours',
  'is_themed',
  'theme_description',
  'children_present',
  'has_competing_vendors',
  'is_ticketed',
  'vendor_count',
  // Stage 2 — corrections to Stage 1 entries + fields hidden from Stage 1
  'event_type',
  'event_start_time',
  'event_end_time',
  'event_end_date',
  'event_setting',
  'address',
  'company_max_per_attendee_cents',
  'contact_phone',
  // Location + date. Added 2026-08-08 — previously editable by NOBODY (not the
  // organizer, not admin), so a typo'd city or zip was permanent. That matters
  // because vendor matching is location-driven: a wrong city produces a
  // silently wrong match set and an event nobody can find.
  'city',
  'state',
  'zip',
  'event_date',
  // See ACCOUNT_LINKED_ONLY_FIELDS below — allowed here, but gated.
  'contact_email',
  // Audit 2026-08-08: required at intake, writable by NOBODY afterwards.
  // headcount skewed viability scoring, the market row and wave capacity;
  // company_name is the market's public name. contact_name is cosmetic.
  'headcount',
  'company_name',
  'contact_name',
]

/**
 * `contact_email` is not just a contact detail — it is one of the two ways the
 * app decides you are the organizer. Every organizer route authorises on
 * `organizer_user_id === user.id` OR, when that is still null,
 * `contact_email === user.email`.
 *
 * So while the email IS the key, letting the organizer edit it means a typo
 * locks them out permanently — which is the exact bug this field was added to
 * fix (audit, 2026-08-08: a wrong contact_email meant the signup link went to
 * the wrong address, the account claim never matched, and NO route could
 * repair it). Recreating that with the repair itself would be absurd.
 *
 * Once `organizer_user_id` is set, access is anchored to their ACCOUNT and the
 * email is only a notification address — safe to edit, and a mistake is
 * recoverable. So: organizer may change it only after the account is linked.
 * Before that, only an admin can (api/admin/events/[id]), which is also the
 * repair path for events already broken.
 */
const ACCOUNT_LINKED_ONLY_FIELDS = ['contact_email']

/**
 * Fields that approval COPIES into the `markets` row (`event-actions.ts:126-131`),
 * with `event_date` additionally deriving `market_schedules.day_of_week` (`:150-159`).
 *
 * Editing them on `catering_requests` after a market exists changes NOTHING that
 * vendors or buyers actually see, and for the date it would leave the market
 * running on the old weekday. So they are editable only while there is no
 * market — which is exactly the window this whole fix is about.
 *
 * ⚠ `address` and `event_end_date` are the same shape of risk and are NOT in
 * this list, because they were already freely editable before today and
 * restricting them is a separate decision. That pre-existing desync is logged
 * in backlog.md — do not "fix" it here by quietly adding them.
 */
const PRE_APPROVAL_ONLY_FIELDS = [
  // Mig-219 follow-up (2026-08-15, trigger applied ALL THREE envs 2026-08-13):
  // city/state/zip/event_date/headcount came OFF this list — the
  // trg_sync_event_request_to_market trigger now propagates them into
  // `markets` (and recomputes the schedule weekday on a date change), so a
  // post-approval edit reaches everything vendors and buyers actually see.
  // The consequence gate treats city/state/zip as place changes (same as the
  // street address), so live-event edits still notify vendors (B1) and put
  // pre-orders through re-confirmation (B3).
  //
  // company_name is the ONLY remaining freeze: the market NAME is built from
  // it via per-locale app config that a database trigger cannot resolve.
  'company_name',
]

// Fields that, when changed, may produce different vendor matches.
// PATCH response sets `matchingChanged: true` so the dashboard can surface a
// "Refresh matches" banner. Non-matching fields (notes, budget, etc.) save silently.
const MATCHING_AFFECTING_FIELDS = new Set([
  'event_type',
  'event_start_time',
  'event_end_time',
  'event_setting',
  'children_present',
  'preferred_vendor_categories',
  'cuisine_preferences',
  'expected_meal_count',
  'vendor_count',
])

// Statuses where organizer can still update details
const EDITABLE_STATUSES = ['new', 'reviewing', 'approved', 'ready']

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/details', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-details:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token } = await context.params
    const serviceClient = createServiceClient()

    const { data: event } = await observed(serviceClient
      .from('catering_requests')
      .select(`
        id, status, company_name, contact_name, contact_email, contact_phone,
        organizer_user_id,
        market_id,
        event_type, event_setting,
        event_date, event_end_date, event_start_time, event_end_time,
        headcount, vendor_count, service_level, payment_model,
        access_code, company_max_per_attendee_cents,
        address, city, state, zip,
        cuisine_preferences, dietary_notes, preferred_vendor_categories,
        total_food_budget_cents, per_meal_budget_cents, estimated_spend_per_attendee_cents,
        expected_meal_count, budget_notes,
        beverages_provided, dessert_provided, competing_food_options,
        setup_instructions, additional_notes,
        vendor_stay_policy, estimated_dwell_hours,
        is_themed, theme_description, children_present, has_competing_vendors, is_ticketed,
        is_recurring, recurring_frequency
      `)
      .eq(eventRefColumn(token), token)
      .maybeSingle(), { table: 'catering_requests' })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Verify organizer identity — match PATCH's two-way auth: id OR email.
    // Without the id check, an organizer who signed up with a different email
    // than contact_email could PATCH (which links organizer_user_id) but be
    // 403'd from GET on the next page load.
    const isOrganizerById = event.organizer_user_id === user.id
    const isOrganizerByEmail = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
    if (!isOrganizerById && !isOrganizerByEmail) {
      return NextResponse.json({ error: 'Only the event organizer can view these details' }, { status: 403 })
    }

    // ── What a change would actually cost, right now ──
    //
    // The editor's warning used to be abstract. Abstract warnings get ignored;
    // "14 people have pre-ordered" does not. These are also what decides whether
    // an acknowledgment is required at all: no pre-orders, nobody to disturb,
    // no friction (owner, 2026-08-09).
    let preorderCount = 0
    let preorderValueCents = 0
    let committedVendorCount = 0
    let changeWindow = evaluateChangeWindow({
      eventDate: event.event_date as string | null,
      eventStartTime: event.event_start_time as string | null,
      timezone: null,
      cutoffHours: null,
    })

    if (event.market_id) {
      const [orderRes, vendorRes, marketRes] = await Promise.all([
        // DISTINCT ORDERS for the count — the copy says "people", and
        // re-confirmation is per combined order, so one person answers once.
        // SUM of items for the value — what is actually at stake in money.
        serviceClient
          .from('order_items')
          .select('order_id, subtotal_cents')
          .eq('market_id', event.market_id)
          .not('status', 'in', '("cancelled","refunded")'),
        serviceClient
          .from('market_vendors')
          .select('id')
          .eq('market_id', event.market_id)
          .eq('response_status', 'accepted'),
        serviceClient
          .from('markets')
          .select('timezone, cutoff_hours')
          .eq('id', event.market_id)
          .maybeSingle(),
      ])

      preorderCount = new Set(
        (orderRes.data || []).map(r => r.order_id as string)
      ).size
      preorderValueCents = (orderRes.data || []).reduce(
        (sum, r) => sum + ((r.subtotal_cents as number) || 0),
        0
      )
      committedVendorCount = (vendorRes.data || []).length

      changeWindow = evaluateChangeWindow({
        eventDate: event.event_date as string | null,
        eventStartTime: event.event_start_time as string | null,
        timezone: (marketRes.data?.timezone as string | null) ?? null,
        cutoffHours: (marketRes.data?.cutoff_hours as number | null) ?? null,
      })
    }

    return NextResponse.json({
      event,
      change_cost: {
        preorder_count: preorderCount,
        // What is actually at stake in money. A count alone does not tell
        // anyone whether they are deciding about $80 or $4,000.
        preorder_value_cents: preorderValueCents,
        committed_vendor_count: committedVendorCount,
        // 'open' | 'blocked' | 'past' | 'unknown'
        window: changeWindow.state,
        hours_until_event: changeWindow.hoursUntil,
        block_at_hours: changeWindow.blockAtHours,
      },
    })
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/details', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-details:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token } = await context.params
    const body = await request.json()
    // Proof the organizer saw what this change costs the people who already
    // ordered. Only demanded when there ARE such people — see the gate below.
    const change_acknowledged = body?.change_acknowledged === true
    const serviceClient = createServiceClient()

    // Fetch event and verify organizer
    crumb.supabase('select', 'catering_requests')
    const { data: event } = await observed(serviceClient
      .from('catering_requests')
      .select('id, status, organizer_user_id, contact_email, market_id, event_date, address, city, state, zip, event_start_time, vertical_id')
      .eq(eventRefColumn(token), token)
      .maybeSingle(), { table: 'catering_requests' })

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Auth: organizer_user_id or email match
    const isOrganizerById = event.organizer_user_id === user.id
    const isOrganizerByEmail = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
    if (!isOrganizerById && !isOrganizerByEmail) {
      return NextResponse.json({ error: 'Only the event organizer can update these details' }, { status: 403 })
    }

    // Status gate
    if (!EDITABLE_STATUSES.includes(event.status)) {
      return NextResponse.json(
        { error: `Event details cannot be updated in "${event.status}" status` },
        { status: 400 }
      )
    }

    // Filter to allowed fields only
    const updateData: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        updateData[key] = body[key]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Server-side enforcement of the market-copy rule. The UI also hides these
    // once a market exists, but the UI is not a security boundary.
    if (event.market_id) {
      const blocked = PRE_APPROVAL_ONLY_FIELDS.filter(f => f in updateData)
      if (blocked.length > 0) {
        return NextResponse.json(
          {
            error: `Once an event is approved, ${blocked.join(', ')} cannot be changed — it names your public event page. Contact us if it must change.`,
          },
          { status: 400 }
        )
      }
    }

    // The email is the access key until the account is linked — see the note on
    // ACCOUNT_LINKED_ONLY_FIELDS. Server-enforced; the UI also hides it.
    if (!event.organizer_user_id) {
      const blockedKey = ACCOUNT_LINKED_ONLY_FIELDS.filter(f => f in updateData)
      if (blockedKey.length > 0) {
        return NextResponse.json(
          {
            error: 'Your contact email can only be changed once your account is linked to this event — right now it is what identifies you as the organizer. Contact us and we can update it for you.',
          },
          { status: 400 }
        )
      }
    }
    if (updateData.contact_email !== undefined) {
      const em = String(updateData.contact_email ?? '').trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        throw traced.validation('ERR_EVENT_DETAIL_011', 'Invalid email format')
      }
      updateData.contact_email = em
    }

    // Validate specific fields
    if (updateData.state !== undefined && updateData.state !== null) {
      const st = String(updateData.state).trim().toUpperCase()
      if (st.length !== 2) {
        throw traced.validation('ERR_EVENT_DETAIL_007', 'state must be a 2-letter code')
      }
      updateData.state = st
    }
    if (updateData.zip !== undefined && updateData.zip !== null) {
      const z = String(updateData.zip).trim()
      if (!/^\d{5}(-\d{4})?$/.test(z)) {
        throw traced.validation('ERR_EVENT_DETAIL_008', 'zip must be 5 digits, or 5+4')
      }
      updateData.zip = z
    }
    if (updateData.city !== undefined) {
      const c = String(updateData.city ?? '').trim()
      if (!c) {
        throw traced.validation('ERR_EVENT_DETAIL_009', 'city cannot be blank')
      }
      updateData.city = c.slice(0, 100)
    }
    if (updateData.headcount !== undefined) {
      // Same 10–5000 bounds the intake form enforces — a headcount outside them
      // produces a viability score nobody should act on.
      const hc = Number(updateData.headcount)
      if (!Number.isFinite(hc) || hc < 10 || hc > 5000) {
        throw traced.validation('ERR_EVENT_DETAIL_012', 'Headcount must be between 10 and 5000')
      }
      updateData.headcount = Math.round(hc)
    }
    for (const f of ['company_name', 'contact_name'] as const) {
      if (updateData[f] !== undefined) {
        const v = String(updateData[f] ?? '').trim()
        if (!v) {
          throw traced.validation('ERR_EVENT_DETAIL_013', `${f} cannot be blank`)
        }
        updateData[f] = v.slice(0, 200)
      }
    }
    if (updateData.event_date !== undefined) {
      // Same floor the intake form enforces — a past date would produce an
      // event that can never run and vendor invitations for a dead day.
      const d = String(updateData.event_date ?? '')
      const parsed = new Date(d + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (isNaN(parsed.getTime()) || parsed < today) {
        throw traced.validation('ERR_EVENT_DETAIL_010', 'event_date must be today or in the future')
      }
    }
    if (updateData.vendor_count !== undefined) {
      const vc = updateData.vendor_count as number
      if (typeof vc !== 'number' || vc < 1 || vc > 20) {
        throw traced.validation('ERR_EVENT_DETAIL_001', 'vendor_count must be between 1 and 20')
      }
    }
    if (updateData.vendor_stay_policy !== undefined) {
      const valid = ['may_leave_when_sold_out', 'stay_full_event', 'vendor_discretion', null]
      if (!valid.includes(updateData.vendor_stay_policy as string | null)) {
        throw traced.validation('ERR_EVENT_DETAIL_002', 'Invalid vendor_stay_policy')
      }
    }
    if (updateData.event_type !== undefined && updateData.event_type !== null) {
      const valid = ['corporate_lunch', 'team_building', 'grand_opening', 'festival', 'private_party', 'other']
      if (!valid.includes(updateData.event_type as string)) {
        throw traced.validation('ERR_EVENT_DETAIL_003', 'Invalid event_type')
      }
    }
    if (updateData.event_setting !== undefined && updateData.event_setting !== null) {
      const valid = ['indoor', 'outdoor', 'either']
      if (!valid.includes(updateData.event_setting as string)) {
        throw traced.validation('ERR_EVENT_DETAIL_004', 'Invalid event_setting')
      }
    }
    // Once a market exists the event has a schedule row, and
    // market_schedules.start_time / .end_time are both NOT NULL. So after
    // approval the times may be CHANGED but not CLEARED — a blank would either
    // violate the constraint or silently leave the schedule on the old hours,
    // which is the desync this route now syncs away (see the sync block below).
    if (event.market_id) {
      for (const f of ['event_start_time', 'event_end_time'] as const) {
        if (f in updateData && !updateData[f]) {
          throw traced.validation(
            'ERR_EVENT_DETAIL_014',
            'Event times can be changed but not removed once your event is live'
          )
        }
      }
    }

    // If both times provided in this update OR being changed alongside an existing time, validate end > start
    if (updateData.event_start_time !== undefined || updateData.event_end_time !== undefined) {
      // Need current values for cross-field validation
      const { data: current } = await observed(serviceClient
        .from('catering_requests')
        .select('event_start_time, event_end_time')
        .eq('id', event.id)
        .single(), { table: 'catering_requests' })
      const newStart = (updateData.event_start_time ?? current?.event_start_time) as string | null
      const newEnd = (updateData.event_end_time ?? current?.event_end_time) as string | null
      if (newStart && newEnd) {
        const sParts = String(newStart).split(':').map(Number)
        const eParts = String(newEnd).split(':').map(Number)
        if (sParts.length >= 2 && eParts.length >= 2 && !sParts.some(isNaN) && !eParts.some(isNaN)) {
          if (eParts[0] * 60 + eParts[1] <= sParts[0] * 60 + sParts[1]) {
            throw traced.validation('ERR_EVENT_DETAIL_006', 'event_end_time must be after event_start_time')
          }
        }
      }
    }

    // ── The consequence gate ──
    //
    // Only fires for a change an ATTENDEE agreed to when they ordered — the day,
    // the place, or the time by more than half an hour. Budget notes and dietary
    // preferences are none of their business.
    //
    // The trigger is CONSEQUENCE, not time (owner, 2026-08-09). A time-based
    // band was specced and abandoned: once the block starts at 72 hours, a band
    // "from 72 hours to the cutoff" has zero width. Worse, it would have waved
    // through a date change three weeks out that forced twenty people to
    // re-confirm, because three weeks reads as "far out". What deserves an
    // acknowledgment is the cost, and time was only ever a proxy for it.
    // B1 (2026-08-15): computed once — gates the attendee consequence ladder
    // here AND the post-save vendor notification below.
    const consequentialChange = !!event.market_id && changeRequiresReconfirmation(event, updateData)

    if (consequentialChange) {
      const [orderRes, marketRes] = await Promise.all([
        serviceClient
          .from('order_items')
          .select('order_id, subtotal_cents')
          .eq('market_id', event.market_id)
          .not('status', 'in', '("cancelled","refunded")'),
        serviceClient
          .from('markets')
          .select('timezone, cutoff_hours')
          .eq('id', event.market_id)
          .maybeSingle(),
      ])

      const affectedOrders = new Set(
        (orderRes.data || []).map(r => r.order_id as string)
      ).size
      const affectedValueCents = (orderRes.data || []).reduce(
        (sum, r) => sum + ((r.subtotal_cents as number) || 0),
        0
      )
      const affectedValue = `$${(affectedValueCents / 100).toFixed(2)}`

      // No pre-orders → nobody to re-confirm → no friction at all (owner).
      if (affectedOrders > 0) {
        const window = evaluateChangeWindow({
          eventDate: event.event_date as string | null,
          eventStartTime: event.event_start_time as string | null,
          timezone: (marketRes.data?.timezone as string | null) ?? null,
          cutoffHours: (marketRes.data?.cutoff_hours as number | null) ?? null,
        })

        if (window.state === 'blocked' || window.state === 'past') {
          // ⚠ The copy names WHY a person is involved, and the reason is money,
          // not oversight (owner, 2026-08-09). Self-service is sold as having
          // no human in it, so appearing here without explaining ourselves reads
          // as a bait-and-switch. "Refunds are involved, so a person looks" is
          // true, specific, and the same line the owner drew when excluding
          // self-service from the paid backup bench: less automation where the
          // platform carries the money risk, not more.
          return NextResponse.json(
            {
              error:
                window.state === 'past'
                  ? 'This event has already started, so its date, address and times can no longer be changed.'
                  : `Your event is ${describeTimeUntil(window.hoursUntil ?? 0)} away, and ${affectedOrders} ${affectedOrders === 1 ? 'person has' : 'people have'} already pre-ordered — ${affectedValue} worth. There is no longer time for them to confirm they can still come, so changing this now means refunding people and telling ${affectedOrders === 1 ? 'them' : 'them all'}. Because real money moves, one of our team handles this one with you rather than it happening automatically.`,
              change_blocked: true,
              preorder_count: affectedOrders,
              preorder_value_cents: affectedValueCents,
              hours_until_event: window.hoursUntil,
            },
            { status: 400 }
          )
        }

        if (change_acknowledged !== true) {
          return NextResponse.json(
            {
              error: 'Please confirm you understand what this change means for the people who have already ordered.',
              change_acknowledgment_required: true,
              preorder_count: affectedOrders,
              preorder_value_cents: affectedValueCents,
            },
            { status: 400 }
          )
        }
      }
    }

    // Also link organizer_user_id if not set
    if (!event.organizer_user_id && isOrganizerByEmail) {
      updateData.organizer_user_id = user.id
    }

    crumb.supabase('update', 'catering_requests')
    const { error } = await serviceClient
      .from('catering_requests')
      .update(updateData)
      .eq('id', event.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── Schedule/market sync: migration 219's trigger owns it now ──
    //
    // The app-side stopgap that used to live here (writing times through to
    // market_schedules) was deleted 2026-08-15, per its own retirement
    // condition: trg_sync_event_request_to_market is applied to ALL THREE
    // environments (Prod 2026-08-13). The trigger propagates address, city,
    // state, zip, date, end date, headcount and the times — including the
    // recomputed schedule weekday on a date change — and, unlike a route,
    // cannot be bypassed by the next writer somebody adds.

    // ── B1 (owner-approved 2026-08-15): tell ACCEPTED vendors about the change ──
    // A-audit part 4: mig 219 syncs the DATA into markets/schedules, but nobody
    // was ever TOLD. The change-request path notifies vendors only when an admin
    // approves a BLOCKED change; a direct acknowledged save reached this point
    // silently — and a vendor staffs and buys stock against these facts. Same
    // consequence test as the attendee gate (day, place, or start >30min);
    // email + in-app via the standard-urgency event_changed_vendor template.
    if (consequentialChange) {
      const { data: acceptedVendors } = await observed(serviceClient
        .from('market_vendors')
        .select('vendor_profile_id, vendor_profiles:vendor_profile_id(user_id)')
        .eq('market_id', event.market_id)
        .eq('response_status', 'accepted'), { table: 'market_vendors' })

      const changeSummary = describeChanges({
        ...('event_date' in updateData ? { event_date: updateData.event_date } : {}),
        ...('address' in updateData ? { address: updateData.address } : {}),
        ...('city' in updateData ? { city: updateData.city } : {}),
        ...('state' in updateData ? { state: updateData.state } : {}),
        ...('zip' in updateData ? { zip: updateData.zip } : {}),
        ...('event_start_time' in updateData ? { event_start_time: updateData.event_start_time } : {}),
        ...('event_end_time' in updateData ? { event_end_time: updateData.event_end_time } : {}),
      })

      for (const mv of acceptedVendors || []) {
        const vp = mv.vendor_profiles as unknown as { user_id: string | null } | null
        if (vp?.user_id) {
          await sendNotification(vp.user_id, 'event_changed_vendor', {
            changeSummary,
            eventDate: (updateData.event_date as string) || (event.event_date as string) || '',
            marketId: event.market_id,
          }, { vertical: event.vertical_id as string })
        }
      }

      // B3 (mig 230): the same change stamps every live order as awaiting
      // re-confirmation and sends the buyers their one-click confirm link.
      // The gate above already made the organizer acknowledge this cost.
      await requestEventReconfirmation(serviceClient, {
        marketId: event.market_id as string,
        changeSummary,
        eventDate: (updateData.event_date as string) || (event.event_date as string) || '',
        vertical: event.vertical_id as string,
      })
    }

    // Tell the caller whether their changes affected vendor matching, so the
    // dashboard can offer a "Refresh matches" banner. Notes-only edits won't
    // produce a banner; type/time/categories changes will.
    const matchingChanged = Object.keys(updateData).some(k => MATCHING_AFFECTING_FIELDS.has(k))

    return NextResponse.json({ ok: true, updated: Object.keys(updateData), matchingChanged })
  })
}
