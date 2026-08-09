import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { eventRefColumn } from '@/lib/events/event-ref'
import { evaluateChangeWindow } from '@/lib/events/change-window'
import { validateChangeRequest, describeChanges, reasonLabel } from '@/lib/events/change-requests'
import { sendNotification } from '@/lib/notifications/service'
import { adminRecipientsForVertical } from '@/lib/notifications/admin-recipients'

interface RouteContext {
  params: Promise<{ token: string }>
}

/**
 * GET  /api/events/[token]/change-request — the organizer's own requests
 * POST /api/events/[token]/change-request — raise one
 *
 * The way out of the hard block. An organizer whose event is too close to
 * change is refused by `details` PATCH and sent here instead of into a dead end.
 *
 * An admin always reviews. Nothing here approves anything.
 */

/** Shared organizer auth — id match, or email match before the account links. */
async function loadEventForOrganizer(token: string, userId: string, userEmail: string | undefined) {
  const serviceClient = createServiceClient()
  const { data: event } = await serviceClient
    .from('catering_requests')
    .select('id, status, organizer_user_id, contact_email, market_id, event_date, event_start_time, service_level, vertical_id, company_name')
    .eq(eventRefColumn(token), token)
    .maybeSingle()

  if (!event) return { event: null, serviceClient, authorized: false as const }

  const byId = event.organizer_user_id === userId
  const byEmail = event.contact_email?.toLowerCase() === userEmail?.toLowerCase()
  return { event, serviceClient, authorized: byId || byEmail }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/change-request', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`event-change-req:${clientIp}`, rateLimits.api)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { token } = await context.params
    const { event, serviceClient, authorized } = await loadEventForOrganizer(
      token, user.id, user.email
    )
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (!authorized) {
      return NextResponse.json({ error: 'Only the event organizer can view this' }, { status: 403 })
    }

    crumb.supabase('select', 'event_change_requests')
    const { data: requests } = await serviceClient
      .from('event_change_requests')
      .select('id, reason_category, explanation, requested_changes, applied_changes, status, review_note, created_at, reviewed_at')
      .eq('catering_request_id', event.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ requests: requests || [] })
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/events/[token]/change-request', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`event-change-req-submit:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { token } = await context.params
    const body = await request.json()

    const { event, serviceClient, authorized } = await loadEventForOrganizer(
      token, user.id, user.email
    )
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (!authorized) {
      return NextResponse.json({ error: 'Only the event organizer can request a change' }, { status: 403 })
    }

    const validation = validateChangeRequest(body)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { reason_category, explanation, requested_changes } = validation.value

    // Same moderation as intake. This text is emailed to vendors verbatim and
    // attributed to the organizer, so it is the last place we would want an
    // unfiltered string to pass through.
    const { checkFields } = await import('@/lib/content-moderation')
    const mod = checkFields({ explanation })
    if (!mod.passed) {
      return NextResponse.json({ error: mod.reason }, { status: 400 })
    }

    // ── Only accept a request for a change they cannot simply make ──
    //
    // Without this the queue fills with requests for edits the organizer could
    // have done themselves, and an admin's time is the scarcest thing here.
    if (!event.market_id) {
      return NextResponse.json(
        { error: 'This event has not been approved yet — you can still edit it directly.' },
        { status: 400 }
      )
    }

    const { data: market } = await serviceClient
      .from('markets')
      .select('timezone, cutoff_hours')
      .eq('id', event.market_id)
      .maybeSingle()

    const window = evaluateChangeWindow({
      eventDate: event.event_date as string | null,
      eventStartTime: event.event_start_time as string | null,
      timezone: (market?.timezone as string | null) ?? null,
      cutoffHours: (market?.cutoff_hours as number | null) ?? null,
    })

    if (window.state === 'past') {
      return NextResponse.json(
        { error: 'This event has already started, so it can no longer be changed.' },
        { status: 400 }
      )
    }
    if (window.state === 'open') {
      return NextResponse.json(
        {
          error: 'There is still time to make this change yourself — open your event details and edit it there.',
          not_blocked: true,
        },
        { status: 400 }
      )
    }

    // Snapshot the cost AS IT STANDS NOW. Recomputed at review time it would be
    // a different number, and the admin should judge what was actually asked.
    const { data: orderRows } = await serviceClient
      .from('order_items')
      .select('order_id, subtotal_cents')
      .eq('market_id', event.market_id)
      .not('status', 'in', '("cancelled","refunded")')
    const preorderCount = new Set((orderRows || []).map(r => r.order_id as string)).size
    // The money at stake is what justifies a person being in the loop at all,
    // so it is the substance of the admin's decision rather than a nicety.
    const preorderValueCents = (orderRows || []).reduce(
      (sum, r) => sum + ((r.subtotal_cents as number) || 0),
      0
    )

    crumb.supabase('insert', 'event_change_requests')
    const { data: inserted, error: insertError } = await serviceClient
      .from('event_change_requests')
      .insert({
        catering_request_id: event.id,
        requested_by: user.id,
        reason_category,
        explanation,
        requested_changes,
        preorder_count_at_request: preorderCount,
        preorder_value_cents_at_request: preorderValueCents,
      })
      .select('id, status, created_at')
      .single()

    if (insertError) {
      // 23505 is the one-pending-per-event index doing its job — an organizer
      // hammering a failed page must not bury the admin in duplicates.
      if (insertError.code === '23505') {
        return NextResponse.json(
          {
            error: 'You already have a change request waiting with us. We will come back to you on that one rather than start a second.',
            duplicate: true,
          },
          { status: 409 }
        )
      }
      console.error('[events/change-request] insert failed:', insertError.message)
      return NextResponse.json(
        { error: 'We could not record your request. Please contact us directly.' },
        { status: 500 }
      )
    }

    // ── Tell the admins, now ──
    //
    // Owner, 2026-08-09: this message needs top priority and should elicit an
    // immediate response. `standard` urgency = email + in_app, which is the
    // strongest channel available without collecting admin phone numbers.
    // Nothing happens on this event until someone acts, so a missed message
    // means an organizer sits blocked in front of their own deadline.
    //
    // Recipients come from the shared helper, NOT the .limit(5) pattern the
    // three older admin fan-outs use — see admin-recipients.ts.
    const admins = await adminRecipientsForVertical(
      serviceClient,
      event.vertical_id as string
    )
    for (const adminId of admins) {
      await sendNotification(adminId, 'event_change_requested', {
        companyName: (event.company_name as string) || 'An organizer',
        eventDate: (event.event_date as string) || '',
        changeSummary: describeChanges(requested_changes),
        changeReason: reasonLabel(reason_category),
        organizerExplanation: explanation,
        atStakeAmount: `$${(preorderValueCents / 100).toFixed(2)}`,
        vertical: event.vertical_id as string,
        eventId: event.id as string,
      }, { vertical: event.vertical_id as string })
    }

    return NextResponse.json({
      ok: true,
      request: inserted,
      preorder_count: preorderCount,
      preorder_value_cents: preorderValueCents,
      admins_notified: admins.length,
    })
  })
}
