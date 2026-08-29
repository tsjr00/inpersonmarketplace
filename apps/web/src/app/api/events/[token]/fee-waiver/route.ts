import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, logError, TracedError, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { eventRefColumn } from '@/lib/events/event-ref'
import { refundEventFeePayment } from '@/lib/stripe/event-fee-payments'
import { isWaivable, waivableUntil } from '@/lib/events/fee-cancellation'
import { sendNotification } from '@/lib/notifications/service'

/**
 * Organizer waiver lever for forfeited Event Vendor Fees (Backup bench
 * Phase 3, 2026-08-16 — decisions.md "Backup vendors — model decided" #6).
 *
 * A vendor who cancels inside the 72h window forfeits their fee instantly
 * (default = enforce; no money moves). This route is the organizer's UNDO:
 *
 * GET  → forfeited rows for the event (vendor name, amount, reason, deadline)
 *        for the dashboard card.
 * POST → { payment_id } — waive ONE forfeit: full refund WITH transfer
 *        reversal (the organizer's own ~93.5% goes back first — waiving is
 *        the organizer giving up money they hold). Available until event
 *        date + 14 days (owner, 2026-08-16). The card carries the required
 *        warning: "waiving refunds the fee that currently covers your
 *        replacement vendor's spot" — the refund is allowed even after a
 *        covered backup stepped in, because it is the organizer's money and
 *        their informed call.
 *
 * Auth: organizer_user_id match only (same posture as vendor-fee route).
 */

interface EventRow {
  id: string
  organizer_user_id: string | null
  market_id: string | null
  vertical_id: string
  event_date: string | null
}

async function loadOrganizerEvent(ref: string, userId: string): Promise<EventRow | null> {
  const serviceClient = createServiceClient()
  crumb.supabase('select', 'catering_requests')
  const { data: event } = await observed(serviceClient
    .from('catering_requests')
    .select('id, organizer_user_id, market_id, vertical_id, event_date')
    .eq(eventRefColumn(ref), ref)
    .maybeSingle(), { table: 'catering_requests' })

  if (!event || (event as EventRow).organizer_user_id !== userId) return null
  return event as EventRow
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/fee-waiver', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-fee-waiver:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { token } = await params
    const event = await loadOrganizerEvent(token, user.id)
    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'event_vendor_fee_payments')
    const { data: forfeits } = await observed(serviceClient
      .from('event_vendor_fee_payments')
      .select('id, vendor_profile_id, vendor_pays_cents, cancel_reason, forfeited_at, vendor_profiles:vendor_profile_id(profile_data)')
      .eq('market_id', event.market_id)
      .eq('status', 'forfeited')
      .order('forfeited_at', { ascending: false }), { table: 'event_vendor_fee_payments' })

    const stillWaivable = event.event_date ? isWaivable(event.event_date) : false
    const deadline = event.event_date ? waivableUntil(event.event_date) : null

    return NextResponse.json({
      waivable: stillWaivable,
      waivable_until: deadline ? deadline.toISOString() : null,
      forfeits: (forfeits || []).map(f => {
        const pd = (f.vendor_profiles as unknown as { profile_data?: Record<string, unknown> } | null)?.profile_data
        return {
          payment_id: f.id,
          vendor_name: (pd?.business_name as string) || (pd?.farm_name as string) || 'A vendor',
          amount_cents: f.vendor_pays_cents,
          cancel_reason: f.cancel_reason,
          forfeited_at: f.forfeited_at,
        }
      }),
    })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  return withErrorTracing('/api/events/[token]/fee-waiver', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`event-fee-waiver:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const { token } = await params
    const event = await loadOrganizerEvent(token, user.id)
    if (!event?.market_id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (!event.event_date || !isWaivable(event.event_date)) {
      return NextResponse.json(
        { error: 'The waive window has closed — forfeits can be waived until 14 days after the event date.' },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const paymentId = body.payment_id
    if (!paymentId || typeof paymentId !== 'string') {
      return NextResponse.json({ error: 'payment_id is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'event_vendor_fee_payments')
    const { data: row } = await observed(serviceClient
      .from('event_vendor_fee_payments')
      .select('id, market_id, vendor_profile_id, vendor_pays_cents, status, stripe_payment_intent_id, vendor_profiles:vendor_profile_id(user_id)')
      .eq('id', paymentId)
      .eq('market_id', event.market_id)
      .maybeSingle(), { table: 'event_vendor_fee_payments' })

    if (!row) {
      return NextResponse.json({ error: 'Payment not found for this event' }, { status: 404 })
    }
    if (row.status !== 'forfeited') {
      return NextResponse.json(
        { error: row.status === 'refunded' ? 'This fee has already been refunded.' : 'This fee is not forfeited — nothing to waive.' },
        { status: 409 }
      )
    }
    if (!row.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'This payment has no refundable charge on record — contact support.' }, { status: 409 })
    }

    // Claim first (guarded), refund second: a double-click cannot double-refund
    // (the second claim matches 0 rows), and the deterministic refund key
    // makes the Stripe call itself idempotent besides.
    crumb.supabase('update', 'event_vendor_fee_payments')
    const { data: claimed } = await observed(serviceClient
      .from('event_vendor_fee_payments')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        refund_reason: 'organizer_waived',
        waiver_decided_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('status', 'forfeited')
      .select('id'), { table: 'event_vendor_fee_payments', operation: 'update' })

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'This forfeit was already handled.' }, { status: 409 })
    }

    try {
      await refundEventFeePayment({
        paymentIntentId: row.stripe_payment_intent_id as string,
        paymentId: row.id as string,
        reason: 'organizer_waived',
      })
    } catch (refundErr) {
      // Un-claim so the money state stays truthful and the button can retry.
      await serviceClient
        .from('event_vendor_fee_payments')
        .update({
          status: 'forfeited',
          refunded_at: null,
          refund_reason: null,
          waiver_decided_at: null,
        })
        .eq('id', row.id)
        .eq('status', 'refunded')
      await logError(new TracedError('ERR_REFUND_001', `[fee-waiver] Waive refund failed for payment ${row.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
        route: '/api/events/[token]/fee-waiver', method: 'POST',
        amountCents: row.vendor_pays_cents as number,
      }))
      return NextResponse.json(
        { error: 'The refund could not be processed — nothing was changed. Try again in a moment.' },
        { status: 502 }
      )
    }

    const vendorUserId = (row.vendor_profiles as unknown as { user_id?: string } | null)?.user_id
    if (vendorUserId) {
      const { data: marketRow } = await observed(serviceClient
        .from('markets')
        .select('name')
        .eq('id', event.market_id)
        .maybeSingle(), { table: 'markets' })
      await sendNotification(vendorUserId, 'event_fee_refunded_vendor', {
        marketName: (marketRow?.name as string) || 'the event',
        marketId: event.market_id,
        amountCents: row.vendor_pays_cents as number,
        feeRefundReason: 'organizer_waived',
        dedupRef: `${row.id}-waived`,
      }, { vertical: event.vertical_id })
    }

    return NextResponse.json({ ok: true })
  })
}
