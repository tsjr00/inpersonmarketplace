import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'
import { calculateBoothRentalFees } from '@/lib/pricing'

// O5: after-start self-cancel penalty (product-order default; plan §8 TBC).
const POST_START_PENALTY_PCT = 25

/**
 * POST /api/vendor/booth-groups/[groupId]/cancel
 *
 * Phase E (O5) — vendor self-cancels a PAID season/partial booth purchase.
 * Credit-first, no Stripe (the manager already holds the money from the
 * destination charge):
 *   - BEFORE the season starts → full credit (total_vendor_cents), no penalty.
 *   - AFTER it starts → credit for the REMAINING (not-yet-elapsed) weeks minus
 *     a 25% penalty; elapsed weeks stay as-is.
 * Writes a booth_credits row, cancels the group + the affected child rentals.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  return withErrorTracing('/api/vendor/booth-groups/[groupId]/cancel', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`booth-group-cancel:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const { groupId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    const service = createServiceClient()

    crumb.supabase('select', 'booth_booking_groups')
    const { data: group } = await service
      .from('booth_booking_groups')
      .select('id, vendor_profile_id, market_id, season_id, status, total_vendor_cents')
      .eq('id', groupId)
      .maybeSingle()
    if (!group) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (group.status !== 'paid') {
      return NextResponse.json({ error: 'Only a paid season booking can be cancelled.' }, { status: 409 })
    }

    const { data: market } = await service
      .from('markets')
      .select('vertical_id, timezone')
      .eq('id', group.market_id as string)
      .maybeSingle()
    if (!market) throw traced.notFound('ERR_MARKET_001', 'Market not found')

    // Ownership: the caller's vendor profile in this market's vertical must own the group.
    const { profile } = await getVendorProfileForVertical<{ id: string }>(
      supabase, user.id, market.vertical_id as string, 'id'
    )
    if (!profile || profile.id !== group.vendor_profile_id) {
      throw traced.auth('ERR_AUTH_002', 'Not your booking')
    }

    // "Today" (market tz) + the season-start reference (season start, or the
    // group's earliest week when it's an ad-hoc partial with no season).
    const tz = (market.timezone as string | null) || 'America/Chicago'
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    const pad = (n: number) => String(n).padStart(2, '0')
    const today = `${localNow.getFullYear()}-${pad(localNow.getMonth() + 1)}-${pad(localNow.getDate())}`

    const { data: children } = await service
      .from('weekly_booth_rentals')
      .select('id, week_start_date, price_cents')
      .eq('group_id', groupId)
      .eq('status', 'paid')
    const rows = (children ?? []) as Array<{ id: string; week_start_date: string; price_cents: number }>

    let referenceStart: string | null = null
    if (group.season_id) {
      const { data: season } = await service
        .from('market_seasons').select('start_date').eq('id', group.season_id as string).maybeSingle()
      referenceStart = (season?.start_date as string | null) ?? null
    }
    if (!referenceStart) {
      referenceStart = rows.reduce<string | null>((min, r) => (!min || r.week_start_date < min ? r.week_start_date : min), null)
    }

    const beforeStart = !referenceStart || today < referenceStart

    let creditCents: number
    let source: 'vendor_cancel_pre' | 'vendor_cancel_post'
    let idsToCancel: string[]

    if (beforeStart) {
      creditCents = group.total_vendor_cents as number
      source = 'vendor_cancel_pre'
      idsToCancel = rows.map((r) => r.id)
    } else {
      // Remaining (not-yet-elapsed) weeks → value minus penalty.
      const remaining = rows.filter((r) => r.week_start_date >= today)
      const remainingValue = remaining.reduce((sum, r) => sum + calculateBoothRentalFees(r.price_cents).vendorPaysCents, 0)
      creditCents = Math.round(remainingValue * (1 - POST_START_PENALTY_PCT / 100))
      source = 'vendor_cancel_post'
      idsToCancel = remaining.map((r) => r.id)
    }

    // Grant the credit (positive ledger row).
    if (creditCents > 0) {
      crumb.supabase('insert', 'booth_credits')
      const { error: credErr } = await service.from('booth_credits').insert({
        vendor_profile_id: group.vendor_profile_id,
        market_id: group.market_id,
        amount_cents: creditCents,
        source,
        related_group_id: groupId,
        note: beforeStart ? 'Season cancelled before start — full credit' : `Season cancelled after start — ${POST_START_PENALTY_PCT}% penalty applied`,
      })
      if (credErr) throw traced.fromSupabase(credErr, { table: 'booth_credits', operation: 'insert' })
    }

    // Cancel the affected child rentals + the group.
    if (idsToCancel.length > 0) {
      crumb.supabase('update', 'weekly_booth_rentals')
      const { error: childErr } = await service
        .from('weekly_booth_rentals')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .in('id', idsToCancel)
      if (childErr) throw traced.fromSupabase(childErr, { table: 'weekly_booth_rentals', operation: 'update' })
    }
    crumb.supabase('update', 'booth_booking_groups')
    const { error: grpErr } = await service
      .from('booth_booking_groups').update({ status: 'cancelled' }).eq('id', groupId)
    if (grpErr) throw traced.fromSupabase(grpErr, { table: 'booth_booking_groups', operation: 'update' })

    return NextResponse.json({
      cancelled: true,
      before_start: beforeStart,
      credit_cents: creditCents,
      penalty_pct: beforeStart ? 0 : POST_START_PENALTY_PCT,
    })
  })
}
