import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, verifyAdminScope } from '@/lib/auth/admin'
import { withErrorTracing, crumb, logError, TracedError, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { refundEventFeePayment } from '@/lib/stripe/event-fee-payments'
import { sendNotification } from '@/lib/notifications/service'

/**
 * Admin view + manual refund for EVENT VENDOR FEE payments (refund-matrix
 * completion, 2026-08-16). Distinct from `[id]/payments`, which is the
 * company-paid deposit/settlement machinery.
 *
 * GET  → every event_vendor_fee_payments row for the event (all statuses),
 *        with vendor names — the admin's ground truth for "who paid what."
 * POST → { payment_id } — manual full refund WITH transfer reversal.
 *        Allowed on 'paid' (ordinary manual intervention) and 'forfeited'
 *        (platform override of a forfeit — the organizer's waiver lever has
 *        a 14-day window; admins don't, because support cases outlive it).
 *        Claim-first guarded flip; un-claims if Stripe fails.
 *
 * Auth: admin + vertical scope (S4-2 pattern from the [id] route).
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

const REFUNDABLE_STATUSES = ['paid', 'forfeited']

interface ScopedEvent {
  id: string
  market_id: string
  vertical_id: string
  company_name: string | null
  event_date: string | null
}

type ScopedEventResult =
  | { ok: false; error: string; status: 403 | 404 }
  | { ok: true; event: ScopedEvent; serviceClient: ReturnType<typeof createServiceClient> }

async function loadScopedEvent(userId: string, eventId: string): Promise<ScopedEventResult> {
  const supabase = await createClient()
  const { data: profile } = await observed(supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', userId)
    .single(), { table: 'user_profiles' })
  if (!profile || !hasAdminRole(profile)) return { ok: false, error: 'Forbidden', status: 403 }

  const serviceClient = createServiceClient()
  crumb.supabase('select', 'catering_requests')
  const { data: event } = await observed(serviceClient
    .from('catering_requests')
    .select('id, market_id, vertical_id, company_name, event_date')
    .eq('id', eventId)
    .maybeSingle(), { table: 'catering_requests' })
  if (!event?.market_id) return { ok: false, error: 'Event not found or not yet approved', status: 404 }

  const scope = await verifyAdminScope(event.vertical_id as string)
  if (!scope?.authorized) return { ok: false, error: "Not authorized for this event's vertical", status: 403 }

  return { ok: true, event: event as unknown as ScopedEvent, serviceClient }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/fee-payments', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-event-fee-payments:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const loaded = await loadScopedEvent(user.id, id)
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    const { event, serviceClient } = loaded

    crumb.supabase('select', 'event_vendor_fee_payments')
    const { data: rows } = await observed(serviceClient
      .from('event_vendor_fee_payments')
      .select('id, vendor_profile_id, status, fee_cents, vendor_pays_cents, organizer_receives_cents, paid_at, refunded_at, refund_reason, forfeited_at, cancel_reason, covering_payment_id, created_at, vendor_profiles:vendor_profile_id(profile_data)')
      .eq('market_id', event.market_id)
      .order('created_at', { ascending: false }), { table: 'event_vendor_fee_payments' })

    return NextResponse.json({
      event: { id: event.id, name: event.company_name, date: event.event_date },
      payments: (rows || []).map(r => {
        const pd = (r.vendor_profiles as unknown as { profile_data?: Record<string, unknown> } | null)?.profile_data
        return {
          payment_id: r.id,
          vendor_name: (pd?.business_name as string) || (pd?.farm_name as string) || 'Unknown vendor',
          status: r.status,
          vendor_pays_cents: r.vendor_pays_cents,
          organizer_receives_cents: r.organizer_receives_cents,
          paid_at: r.paid_at,
          refunded_at: r.refunded_at,
          refund_reason: r.refund_reason,
          forfeited_at: r.forfeited_at,
          cancel_reason: r.cancel_reason,
          covered: r.status === 'covered' || !!r.covering_payment_id,
          refundable: REFUNDABLE_STATUSES.includes(r.status as string),
        }
      }),
    })
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/fee-payments', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin-event-fee-refund:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const loaded = await loadScopedEvent(user.id, id)
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
    const { event, serviceClient } = loaded

    const body = await request.json().catch(() => ({}))
    const paymentId = body.payment_id
    if (!paymentId || typeof paymentId !== 'string') {
      return NextResponse.json({ error: 'payment_id is required' }, { status: 400 })
    }

    crumb.supabase('select', 'event_vendor_fee_payments')
    const { data: row } = await observed(serviceClient
      .from('event_vendor_fee_payments')
      .select('id, status, vendor_pays_cents, stripe_payment_intent_id, vendor_profiles:vendor_profile_id(user_id)')
      .eq('id', paymentId)
      .eq('market_id', event.market_id)
      .maybeSingle(), { table: 'event_vendor_fee_payments' })

    if (!row) return NextResponse.json({ error: 'Payment not found for this event' }, { status: 404 })
    if (!REFUNDABLE_STATUSES.includes(row.status as string)) {
      return NextResponse.json(
        { error: `Only paid or forfeited fees can be refunded — this one is '${row.status}'.` },
        { status: 409 }
      )
    }
    if (!row.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'This payment has no refundable charge on record.' }, { status: 409 })
    }

    // Claim first (guarded), refund second — double-click safe, and the
    // deterministic refund key makes the Stripe call idempotent besides.
    const priorStatus = row.status as string
    crumb.supabase('update', 'event_vendor_fee_payments')
    const { data: claimed } = await observed(serviceClient
      .from('event_vendor_fee_payments')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        refund_reason: 'admin_manual',
      })
      .eq('id', row.id)
      .eq('status', priorStatus)
      .select('id'), { table: 'event_vendor_fee_payments', operation: 'update' })

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'This payment was already handled.' }, { status: 409 })
    }

    try {
      await refundEventFeePayment({
        paymentIntentId: row.stripe_payment_intent_id as string,
        paymentId: row.id as string,
        reason: 'admin_manual',
      })
    } catch (refundErr) {
      await serviceClient
        .from('event_vendor_fee_payments')
        .update({ status: priorStatus, refunded_at: null, refund_reason: null })
        .eq('id', row.id)
        .eq('status', 'refunded')
      await logError(new TracedError('ERR_REFUND_001', `[admin/fee-payments] Manual refund failed for payment ${row.id}: ${refundErr instanceof Error ? refundErr.message : String(refundErr)}`, {
        route: '/api/admin/events/[id]/fee-payments', method: 'POST',
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
        marketName: (marketRow?.name as string) || (event.company_name as string) || 'the event',
        marketId: event.market_id as string,
        amountCents: row.vendor_pays_cents as number,
        feeRefundReason: 'admin_refund',
        dedupRef: `${row.id}-admin-refund`,
      }, { vertical: event.vertical_id as string })
    }

    return NextResponse.json({ ok: true })
  })
}
