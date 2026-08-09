import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { verifyAdminScope } from '@/lib/auth/admin'
import { CHANGEABLE_FIELDS } from '@/lib/events/change-requests'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ORDER_ACTIONS = ['refund_all', 'keep_all', 'handled_manually'] as const

/**
 * PATCH /api/admin/events/change-requests/[id]
 *
 * Approve or decline an organizer's request to change a locked event.
 *
 * Owner decisions enforced here (2026-08-09):
 *   · A DECLINE REQUIRES A REASON. The database also refuses one without a
 *     note; this returns a sentence instead of a constraint violation.
 *   · PRE-ORDERS ARE JUDGED CASE BY CASE — `order_action` is required on
 *     approval and has no default. Recording "the admin decided" is the point;
 *     the actual refunding is the re-confirmation slice's job, not this one.
 *   · An admin may EDIT the change before approving on ADMIN-ASSISTED events
 *     only. On self-service they approve exactly what was asked.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/change-requests/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin-change-req:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const body = await request.json()
    const action = String(body?.action ?? '')
    const serviceClient = createServiceClient()

    crumb.supabase('select', 'event_change_requests')
    const { data: changeRequest } = await serviceClient
      .from('event_change_requests')
      .select('id, catering_request_id, requested_changes, status, explanation, reason_category')
      .eq('id', id)
      .maybeSingle()

    if (!changeRequest) {
      return NextResponse.json({ error: 'Change request not found' }, { status: 404 })
    }
    if (changeRequest.status !== 'pending') {
      // Two admins opening the same queue is normal; both acting on it is not.
      return NextResponse.json(
        { error: `This request was already ${changeRequest.status}.` },
        { status: 409 }
      )
    }

    const { data: event } = await serviceClient
      .from('catering_requests')
      .select('id, vertical_id, service_level, event_start_time, event_end_time, market_id')
      .eq('id', changeRequest.catering_request_id as string)
      .maybeSingle()

    if (!event) {
      return NextResponse.json({ error: 'The event for this request no longer exists' }, { status: 404 })
    }

    // Scope on the EVENT's vertical, not on anything the caller supplied.
    const scope = await verifyAdminScope(event.vertical_id as string)
    if (!scope?.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Decline ──
    if (action === 'decline') {
      const note = String(body?.review_note ?? '').trim()
      if (!note) {
        return NextResponse.json(
          {
            error: 'Please tell the organizer why. A silent refusal this close to their event is how we lose them.',
            review_note_required: true,
          },
          { status: 400 }
        )
      }

      crumb.supabase('update', 'event_change_requests')
      const { error: declineError } = await serviceClient
        .from('event_change_requests')
        .update({
          status: 'declined',
          review_note: note.slice(0, 2000),
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending') // lost race → 0 rows, never a double-resolve

      if (declineError) {
        console.error('[admin/change-requests] decline failed:', declineError.message)
        return NextResponse.json({ error: 'Failed to record the decline' }, { status: 500 })
      }

      // TODO(notifications slice): tell the organizer, with the note.
      return NextResponse.json({ ok: true, status: 'declined' })
    }

    // ── Approve ──
    if (action !== 'approve') {
      return NextResponse.json({ error: 'action must be "approve" or "decline"' }, { status: 400 })
    }

    const orderAction = String(body?.order_action ?? '')
    if (!(ORDER_ACTIONS as readonly string[]).includes(orderAction)) {
      return NextResponse.json(
        {
          error: 'Choose what happens to the existing pre-orders before approving.',
          order_action_required: true,
          options: ORDER_ACTIONS,
        },
        { status: 400 }
      )
    }

    const requested = (changeRequest.requested_changes ?? {}) as Record<string, string>
    const isSelfService = event.service_level === 'self_service'

    // On self-service the admin is a gatekeeper, not a co-organizer: they
    // approve or decline what was asked. On admin-assisted they are already in
    // dialogue with the organizer, so an edit avoids a decline-and-resubmit
    // cycle inside a time-critical window. (Owner, 2026-08-09.)
    let finalChanges: Record<string, string> = requested
    if (body?.applied_changes && typeof body.applied_changes === 'object') {
      if (isSelfService) {
        return NextResponse.json(
          {
            error: 'This is a self-service event, so the change can only be approved exactly as the organizer asked, or declined.',
          },
          { status: 400 }
        )
      }
      const edited: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.applied_changes as Record<string, unknown>)) {
        if (!(CHANGEABLE_FIELDS as readonly string[]).includes(k)) {
          return NextResponse.json({ error: `"${k}" cannot be changed this way.` }, { status: 400 })
        }
        const s = String(v ?? '').trim()
        if (!s) return NextResponse.json({ error: `${k.replace(/_/g, ' ')} cannot be blank.` }, { status: 400 })
        if (k === 'event_date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          return NextResponse.json({ error: 'The date must be a real date.' }, { status: 400 })
        }
        if ((k === 'event_start_time' || k === 'event_end_time') && !/^\d{2}:\d{2}(:\d{2})?$/.test(s)) {
          return NextResponse.json({ error: 'Times must look like 14:30.' }, { status: 400 })
        }
        edited[k] = k === 'address' ? s.slice(0, 500) : s
      }
      finalChanges = edited
    }

    // Normalise times and check end > start against the row's FINAL state, not
    // just against whatever this request happens to carry.
    const writeable: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(finalChanges)) {
      writeable[k] = (k === 'event_start_time' || k === 'event_end_time') && v.length === 5
        ? `${v}:00`
        : v
    }
    const finalStart = (writeable.event_start_time as string | undefined) ?? (event.event_start_time as string | null)
    const finalEnd = (writeable.event_end_time as string | undefined) ?? (event.event_end_time as string | null)
    if (finalStart && finalEnd && String(finalEnd) <= String(finalStart)) {
      return NextResponse.json({ error: 'The end time must be after the start time.' }, { status: 400 })
    }

    // Claim the request FIRST. If applying the change then fails we have a row
    // marked approved with nothing applied — visible and fixable. The reverse
    // (applied but still pending) invites a second admin to apply it again.
    crumb.supabase('update', 'event_change_requests')
    const { data: claimed } = await serviceClient
      .from('event_change_requests')
      .update({
        status: 'approved',
        applied_changes: writeable,
        order_action: orderAction,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        ...(body?.review_note ? { review_note: String(body.review_note).slice(0, 2000) } : {}),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')

    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { error: 'Someone else just actioned this request.' },
        { status: 409 }
      )
    }

    // Apply it. mig 219's trigger carries date/address/times through to the
    // market and the schedule buyers order against, so this one write reaches
    // everybody rather than desyncing.
    crumb.supabase('update', 'catering_requests')
    const { error: applyError } = await serviceClient
      .from('catering_requests')
      .update(writeable)
      .eq('id', event.id)

    if (applyError) {
      console.error('[admin/change-requests] approved but apply FAILED:', applyError.message)
      return NextResponse.json(
        {
          error: 'The request was approved but the change could not be written. Please apply it manually on the event and check the times.',
          approved_but_not_applied: true,
        },
        { status: 500 }
      )
    }

    // TODO(notifications slice): tell the organizer it was approved, and fan out
    // to every committed vendor carrying the organizer's own explanation,
    // attributed — "the organizer has reported…" — so vendors know the change
    // came from them and not from us. `order_action` records what the admin
    // decided about pre-orders; acting on it belongs to the re-confirmation
    // slice, which owns refunds.
    return NextResponse.json({
      ok: true,
      status: 'approved',
      applied: writeable,
      order_action: orderAction,
    })
  })
}
