import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { marketLocalDate } from '@/lib/markets/checkin-eligibility'
import { runCancelDateCascade } from '@/lib/markets/cancel-date-cascade'
import { sendNotification } from '@/lib/notifications'

export const maxDuration = 60

/** How far ahead a date may be cancelled — matches the 8-week booth booking horizon. */
const CANCEL_WINDOW_DAYS = 56

/**
 * POST /api/market-manager/[marketId]/cancel-date
 * Body: { date: 'YYYY-MM-DD', reason, boothDisposition?: 'credit'|'reschedule',
 *         rescheduleDate?: 'YYYY-MM-DD', acknowledged: true }
 *
 * Manager-gated. Records a market_date_overrides (status='cancelled') row and runs
 * the 3-path cascade: auto-refund buyer orders, flag paid booth renters
 * (credit/reschedule on the override row), credit market-box pickups (skip+extend).
 * One-way in v1 (no un-cancel).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> },
) {
  return withErrorTracing('/api/market-manager/[marketId]/cancel-date', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`cancel-date:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const { marketId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

    if (!(await isMarketManager(supabase, marketId, user))) {
      throw traced.auth('ERR_AUTH_002', 'Not the manager of this market')
    }

    const body = await request.json().catch(() => ({}))

    // Hard gate — manager confirms responsibility before any money moves.
    if (body?.acknowledged !== true) {
      throw traced.validation('ERR_VALIDATION_001',
        'acknowledged must be true — confirm the cancellation effects (buyer refunds, booth credit/reschedule) before cancelling the date')
    }

    const date = typeof body?.date === 'string' ? body.date.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      throw traced.validation('ERR_CANCELDATE_001', 'date must be a valid YYYY-MM-DD')
    }
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

    const boothDisposition =
      body?.boothDisposition === 'credit' || body?.boothDisposition === 'reschedule'
        ? body.boothDisposition
        : null
    const rescheduleDate =
      boothDisposition === 'reschedule' && typeof body?.rescheduleDate === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(body.rescheduleDate)
        ? body.rescheduleDate
        : null

    const service = createServiceClient()

    const { data: market } = await service
      .from('markets')
      .select('name, vertical_id, timezone')
      .eq('id', marketId)
      .maybeSingle()
    if (!market) throw traced.notFound('ERR_MARKET_001', 'Market not found')

    const timezone = (market.timezone as string | null) ?? null
    const vertical = (market.vertical_id as string | undefined) || 'farmers_market'
    const marketName = (market.name as string | undefined) || 'the market'

    // Window: future (market-local) + within 8 weeks.
    const today = marketLocalDate(timezone)
    const maxDate = (() => {
      const [y, m, d] = today.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d + CANCEL_WINDOW_DAYS))
      return dt.toISOString().slice(0, 10)
    })()
    if (date <= today) throw traced.validation('ERR_CANCELDATE_002', 'date must be in the future')
    if (date > maxDate) throw traced.validation('ERR_CANCELDATE_003', `date must be within ${CANCEL_WINDOW_DAYS} days`)

    // Record the override (status='cancelled'). One per (market, date).
    crumb.supabase('insert', 'market_date_overrides')
    const { error: insErr } = await service
      .from('market_date_overrides')
      .insert({
        market_id: marketId,
        override_date: date,
        status: 'cancelled',
        booth_disposition: boothDisposition,
        reschedule_date: rescheduleDate,
        reason: reason || null,
        created_by: user.id,
      })
    if (insErr) {
      if (insErr.code === '23505') {
        return NextResponse.json({ error: 'This date is already cancelled.' }, { status: 409 })
      }
      throw traced.fromSupabase(insErr, { table: 'market_date_overrides', operation: 'insert' })
    }

    // Cascade: refunds + booth flagging + MB credit.
    const result = await runCancelDateCascade(service, { marketId, overrideDate: date, reason: reason || 'Market day cancelled by manager' })

    // Notifications — never let a failure here surface as a 5xx (override already saved).
    try {
      const dateLabel = (() => {
        try {
          const [y, m, d] = date.split('-').map(Number)
          return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
          })
        } catch { return date }
      })()

      const emailFor = async (uid: string): Promise<string | undefined> => {
        try {
          const { data } = await service.auth.admin.getUserById(uid)
          return data?.user?.email ?? undefined
        } catch { return undefined }
      }

      await Promise.all([
        ...result.buyerUserIds.map(async (uid) => {
          const email = await emailFor(uid)
          return sendNotification(uid, 'market_date_cancelled_buyer',
            { marketName, marketId, marketDate: dateLabel },
            { vertical, ...(email ? { userEmail: email } : {}) })
        }),
        ...result.boothRenterUserIds.map(async (uid) => {
          const email = await emailFor(uid)
          return sendNotification(uid, 'market_date_cancelled_vendor',
            { marketName, marketId, marketDate: dateLabel, boothDisposition: boothDisposition || undefined, rescheduleDate: rescheduleDate || undefined },
            { vertical, ...(email ? { userEmail: email } : {}) })
        }),
        // Vendors whose product orders were cancelled by the closure — every
        // other cancellation path tells the counterparty, so this one does too.
        ...result.orderVendorUserIds.map(async (uid) => {
          const email = await emailFor(uid)
          return sendNotification(uid, 'market_date_cancelled_order_vendor',
            { marketName, marketId, marketDate: dateLabel },
            { vertical, ...(email ? { userEmail: email } : {}) })
        }),
      ])
    } catch (notifErr) {
      console.error('[cancel-date] notification block failed:', notifErr instanceof Error ? notifErr.message : 'Unknown')
    }

    return NextResponse.json({
      ok: true,
      date,
      refundedItems: result.refundedItemCount,
      refundFailures: result.refundFailures,
      orderVendorsNotified: result.orderVendorUserIds.length,
      boothRentersNotified: result.boothRenterUserIds.length,
      marketBoxCredited: result.marketBoxCredited,
    })
  })
}
