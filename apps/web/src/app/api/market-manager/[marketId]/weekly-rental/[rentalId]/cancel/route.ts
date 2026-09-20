import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed, logError, TracedError } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import {
  declaredDatesForWeek,
  vendorPaidCents,
  perDayShareCents,
  cancellationCreditsGranted,
  capCredit,
} from '@/lib/markets/booth-cancel-credit'

/**
 * POST /api/market-manager/[marketId]/weekly-rental/[rentalId]/cancel
 *
 * BR-10 (owner 2026-09-19, booth review C11 = B — design booth_model_design.md):
 * a vendor bears the risk on a paid one-off week — there is NO vendor cancel and
 * no refund. The MANAGER may cancel one (booth unusable, vendor barred, …):
 *   - the booking flips paid → cancelled (slot freed; counts as a missed week,
 *     so the vendor's booth number becomes a soft hold again — BR-7);
 *   - any credit the vendor redeemed on it is released back to them;
 *   - the vendor is CREDITED at this market for the remaining declared days of
 *     the week (full vendor-paid amount if the week has not started; a day
 *     already attended is not credited — §6-3), never above what they paid;
 *   - the vendor is told (booth_week_cancelled_by_manager) with the amount and
 *     the manager's reason.
 * Credit, never cash — the manager already holds the money (mig 166 rationale).
 * Season/partial children are refused: they settle at season end (cap rule).
 *
 * Body: { reason: string }   (required — it is what the vendor reads)
 * Claim-first (MGR-1 pattern): the guarded flip runs BEFORE any credit mint so a
 * double-click can never credit twice; mig 257's partial unique on
 * (related_rental_id) WHERE source='manager_week_cancel' is the backstop.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; rentalId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/weekly-rental/[rentalId]/cancel', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`mm-rental-cancel:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const supabase = await createClient()
    const { marketId, rentalId } = await params

    crumb.auth('Checking market manager auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    if (!(await isMarketManager(supabase, marketId, user))) {
      return NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    if (!reason) {
      throw traced.validation('ERR_VALIDATION_001', 'A reason is required — the vendor reads it.')
    }

    const service = createServiceClient()

    crumb.supabase('select', 'weekly_booth_rentals')
    const { data: rental } = await observed(service
      .from('weekly_booth_rentals')
      .select('id, vendor_profile_id, market_id, week_start_date, booth_number, price_cents, status, group_id, vendor_profiles!weekly_booth_rentals_vendor_profile_id_fkey ( user_id, profile_data )')
      .eq('id', rentalId)
      .eq('market_id', marketId)
      .maybeSingle(), { table: 'weekly_booth_rentals' })
    if (!rental) {
      return NextResponse.json({ error: 'Booking not found at this market' }, { status: 404 })
    }
    if (rental.group_id) {
      return NextResponse.json(
        { error: 'This week is part of a season purchase. Season bookings settle at season end under the refund cap — cancel a market day instead, or settle the season.' },
        { status: 409 }
      )
    }
    if (rental.status !== 'paid') {
      return NextResponse.json({ error: 'Only a PAID week can be cancelled here. Unpaid weeks expire on their own.' }, { status: 409 })
    }

    const { data: market } = await observed(service
      .from('markets')
      .select('name, vertical_id, timezone')
      .eq('id', marketId)
      .maybeSingle(), { table: 'markets' })
    const tz = (market?.timezone as string | null) || 'America/Chicago'
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    const pad = (n: number) => String(n).padStart(2, '0')
    const today = `${localNow.getFullYear()}-${pad(localNow.getMonth() + 1)}-${pad(localNow.getDate())}`

    const weekStart = rental.week_start_date as string
    const [y, m, d] = weekStart.split('-').map(Number)
    const weekEnd = new Date(Date.UTC(y, m - 1, d + 6)).toISOString().slice(0, 10)
    if (weekEnd < today) {
      return NextResponse.json({ error: 'That week is over — nothing to cancel.' }, { status: 409 })
    }

    // Credit math (§6-3): remaining declared days ÷ declared days of the week,
    // of what the vendor paid; the whole amount when the week has not started.
    const declared = await declaredDatesForWeek(service, {
      marketId, vendorProfileId: rental.vendor_profile_id as string, weekStartSunday: weekStart,
    })
    const remaining = declared.filter((date) => date >= today)
    const paid = vendorPaidCents(rental.price_cents as number)
    const requested = weekStart > today
      ? paid
      : perDayShareCents(paid, declared.length) * remaining.length
    const already = await cancellationCreditsGranted(service, rentalId)
    const creditCents = capCredit(requested, paid, already)

    // Claim first: the guarded flip. 0 rows = someone else got here first.
    crumb.supabase('update', 'weekly_booth_rentals')
    const { data: flipped, error: flipErr } = await service
      .from('weekly_booth_rentals')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', rentalId)
      .eq('status', 'paid')
      .select('id')
    if (flipErr) throw traced.fromSupabase(flipErr, { table: 'weekly_booth_rentals', operation: 'update' })
    if (!flipped || flipped.length === 0) {
      return NextResponse.json({ error: 'This week was already cancelled.' }, { status: 409 })
    }

    // Release any credit the vendor redeemed on this booking (compensating +row).
    const { data: redeemedRows } = await observed(service
      .from('booth_credits')
      .select('amount_cents')
      .eq('related_rental_id', rentalId)
      .eq('source', 'redeemed')
      .lt('amount_cents', 0), { table: 'booth_credits' })
    const releaseCents = -((redeemedRows ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0))
    if (releaseCents > 0) {
      const { error: relErr } = await service.from('booth_credits').insert({
        vendor_profile_id: rental.vendor_profile_id,
        market_id: marketId,
        amount_cents: releaseCents,
        source: 'redeemed',
        related_rental_id: rentalId,
        note: 'Released — week cancelled by the market manager',
      })
      if (relErr) {
        await logError(new TracedError('ERR_REFUND_001',
          `Manager week-cancel: credit release failed for rental ${rentalId} (${releaseCents}¢ owed back to vendor ${rental.vendor_profile_id}): ${relErr.message}`,
          { route: '/api/market-manager/[marketId]/weekly-rental/[rentalId]/cancel', method: 'POST', amountCents: releaseCents }))
      }
    }

    // Grant the cancellation credit (BR-10). 23505 = already granted (mig 257 backstop).
    let granted = 0
    if (creditCents > 0) {
      crumb.supabase('insert', 'booth_credits')
      const { error: grantErr } = await service.from('booth_credits').insert({
        vendor_profile_id: rental.vendor_profile_id,
        market_id: marketId,
        amount_cents: creditCents,
        source: 'manager_week_cancel',
        related_rental_id: rentalId,
        note: `Week of ${weekStart} cancelled by the market manager — ${reason}`,
      })
      if (grantErr) {
        if (grantErr.code !== '23505') {
          await logError(new TracedError('ERR_REFUND_001',
            `Manager week-cancel: credit grant failed for rental ${rentalId} (${creditCents}¢ owed to vendor ${rental.vendor_profile_id}): ${grantErr.message}`,
            { route: '/api/market-manager/[marketId]/weekly-rental/[rentalId]/cancel', method: 'POST', amountCents: creditCents }))
        }
      } else {
        granted = creditCents
      }
    }

    // Tell the vendor (money moved). Best-effort; the cancel already stands.
    const vpRel = rental.vendor_profiles as unknown as { user_id?: string | null } | { user_id?: string | null }[] | null
    const vp = Array.isArray(vpRel) ? vpRel[0] : vpRel
    if (vp?.user_id) {
      const weekLabel = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      let vendorEmail: string | undefined
      try {
        const { data: authUser } = await service.auth.admin.getUserById(vp.user_id)
        vendorEmail = authUser?.user?.email ?? undefined
      } catch { /* email channel skipped */ }
      await sendNotification(vp.user_id, 'booth_week_cancelled_by_manager', {
        marketName: (market?.name as string | undefined) || 'the market',
        marketId,
        weekStartDate: weekLabel,
        reason,
        ...(rental.booth_number ? { boothNumber: rental.booth_number as string } : {}),
        ...(granted + releaseCents > 0 ? { amountCents: granted + releaseCents } : {}),
      }, {
        vertical: (market?.vertical_id as string | undefined) || 'farmers_market',
        ...(vendorEmail ? { userEmail: vendorEmail } : {}),
      })
    }

    return NextResponse.json({
      ok: true,
      rental_id: rentalId,
      credit_cents: granted,
      released_cents: releaseCents,
      remaining_declared_days: remaining.length,
      declared_days: declared.length,
    })
  })
}
