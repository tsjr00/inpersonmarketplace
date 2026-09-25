import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, logError, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { getCheckoutSessionResumeState } from '@/lib/stripe/session-status'
import { precheckPendingRental, decideFromSession } from '@/lib/markets/pending-booth-rental'

/**
 * POST /api/vendor/booth-rentals/[rentalId]/resume — "Continue payment" for a
 * pending one-off booth week (OB-030 D1; owner 2026-09-25). The decision lives
 * in lib/markets/pending-booth-rental.ts:
 *   open Stripe page  → { state: 'resume', checkout_url }  (the SAME session)
 *   paid in Stripe    → { state: 'confirming' }            (webhook confirms)
 *   page expired      → release the booking + its reserved credit
 *                       → { state: 'released' }            (book again)
 * No new Stripe session is ever created here, so no double charge is possible.
 *
 * The release is the ONLY vendor-side write of status 'cancelled' on a one-off
 * week (BR-10 pin, flow-integrity): guarded on status = pending_payment AND the
 * same expired session id, so a paid week — or a booking that just got a fresh
 * session — can never be cancelled by it. Mirrors the Phase 16 sweep's release
 * (cron/expire-orders): flip first, then return any credit redeemed against it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ rentalId: string }> }) {
  return withErrorTracing('/api/vendor/booth-rentals/[rentalId]/resume', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`booth-rental-resume:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const { rentalId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const service = createServiceClient()
    crumb.supabase('select', 'weekly_booth_rentals')
    const { data: rental } = await observed(service
      .from('weekly_booth_rentals')
      .select('id, vendor_profile_id, market_id, status, group_id, stripe_checkout_session_id')
      .eq('id', rentalId)
      .maybeSingle(), { table: 'weekly_booth_rentals' })
    if (!rental) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const { data: market } = await observed(service
      .from('markets')
      .select('vertical_id')
      .eq('id', rental.market_id as string)
      .maybeSingle(), { table: 'markets' })
    if (!market) throw traced.notFound('ERR_MARKET_001', 'Market not found')

    // Ownership: the caller's vendor profile in this market's vertical owns the row.
    const { profile } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, market.vertical_id as string, 'id'
    )
    if (!profile || profile.id !== rental.vendor_profile_id) {
      throw traced.auth('ERR_AUTH_002', 'Not your booking')
    }

    const sessionId = (rental.stripe_checkout_session_id as string | null) ?? null
    const pre = precheckPendingRental({
      status: rental.status as string,
      groupId: (rental.group_id as string | null) ?? null,
      sessionId,
    })
    if (pre?.action === 'already_paid') return NextResponse.json({ state: 'paid' })
    if (pre?.action === 'refuse') return NextResponse.json({ error: pre.message }, { status: pre.status })

    let decision
    try {
      decision = decideFromSession(await getCheckoutSessionResumeState(sessionId as string))
    } catch (stripeErr) {
      await logError(traced.external('ERR_CHECKOUT_003', `resume: could not read session ${sessionId}: ${stripeErr instanceof Error ? stripeErr.message : String(stripeErr)}`, { route: '/api/vendor/booth-rentals/[rentalId]/resume', method: 'POST' }))
      return NextResponse.json({ error: 'We could not reach Stripe. Please try again in a minute.' }, { status: 502 })
    }

    if (decision.action === 'resume') return NextResponse.json({ state: 'resume', checkout_url: decision.checkoutUrl })
    if (decision.action === 'confirming') return NextResponse.json({ state: 'confirming' })
    if (decision.action !== 'release') {
      return NextResponse.json({ error: decision.action === 'refuse' ? decision.message : 'Please try again.' }, { status: 409 })
    }

    // Expired page → release. Claim-first: only a row still pending on THIS
    // expired session flips; 0 rows = it changed underneath us (paid, swept).
    crumb.supabase('update', 'weekly_booth_rentals')
    const { data: flipped, error: flipErr } = await service
      .from('weekly_booth_rentals')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', rentalId)
      .eq('status', 'pending_payment')
      .eq('stripe_checkout_session_id', sessionId as string)
      .is('group_id', null)
      .select('id')
    if (flipErr) throw traced.fromSupabase(flipErr, { table: 'weekly_booth_rentals', operation: 'update' })
    if (!flipped || flipped.length === 0) {
      return NextResponse.json({ error: 'This booking changed while we checked it. Reload the page to see where it stands.' }, { status: 409 })
    }

    // Return any booth credit reserved against it (Item 4b; same shape as the sweep).
    const { data: redeemed } = await observed(service
      .from('booth_credits')
      .select('vendor_profile_id, market_id, amount_cents')
      .eq('related_rental_id', rentalId)
      .eq('source', 'redeemed')
      .lt('amount_cents', 0), { table: 'booth_credits' })
    for (const r of redeemed ?? []) {
      const { error: releaseErr } = await service.from('booth_credits').insert({
        vendor_profile_id: r.vendor_profile_id,
        market_id: r.market_id,
        amount_cents: -(r.amount_cents as number),
        source: 'redeemed',
        related_rental_id: rentalId,
        note: 'Released — payment page expired, vendor booking again',
      })
      // MGR-7: a failed release strands the vendor's credit — loud, for an admin re-mint.
      if (releaseErr) await logError(traced.fromSupabase(releaseErr, { table: 'booth_credits', operation: 'insert' }))
    }

    return NextResponse.json({ state: 'released' })
  })
}
