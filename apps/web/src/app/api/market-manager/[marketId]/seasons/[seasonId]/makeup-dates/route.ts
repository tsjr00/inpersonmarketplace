import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { marketLocalDate } from '@/lib/markets/checkin-eligibility'
import { sendNotification } from '@/lib/notifications'

export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Phase E — season MAKE-UP DAYS (booth-only fulfillment, v1).
 *
 * While a season is in the make-up window (status='ended'), the manager schedules
 * post-close make-up market days so vendors get back booth days that were
 * cancelled. A make-up day is a market_date_overrides row (status='special'),
 * market-wide, ANY day of week, capped by market_seasons.potential_makeup_days.
 * Fulfillment only — no money/credit moves; the cancelled-day shortfall is
 * resolved at settlement (Step 4, 'made_up' resolution).
 *
 * Only one season per market can be 'ended' at a time (the open_prepay gate
 * blocks a new season's pre-sales while a prior season is unsettled), so the
 * market's post-close 'special' overrides scope cleanly to THIS season.
 */

async function authManager(request: NextRequest, marketId: string) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
  if (!(await isMarketManager(supabase, marketId, user))) {
    throw traced.auth('ERR_AUTH_002', 'Not the manager of this market')
  }
  return { supabase, user }
}

interface EndedSeason {
  id: string
  market_id: string
  name: string
  end_date: string
  status: string
  potential_makeup_days: number
}

async function loadSeason(
  service: ReturnType<typeof createServiceClient>, marketId: string, seasonId: string,
): Promise<EndedSeason | null> {
  const { data } = await service
    .from('market_seasons')
    .select('id, market_id, name, end_date, status, potential_makeup_days')
    .eq('id', seasonId)
    .maybeSingle()
  if (!data || data.market_id !== marketId) return null
  return data as EndedSeason
}

/** Count make-up days already scheduled for this season (post-close 'special' rows). */
async function scheduledMakeups(
  service: ReturnType<typeof createServiceClient>, marketId: string, endDate: string,
): Promise<string[]> {
  const { data } = await service
    .from('market_date_overrides')
    .select('override_date')
    .eq('market_id', marketId)
    .eq('status', 'special')
    .gt('override_date', endDate)
    .order('override_date', { ascending: true })
  return (data ?? []).map((r) => r.override_date as string)
}

/** GET — list this season's scheduled make-up dates + remaining capacity. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ marketId: string; seasonId: string }> }) {
  return withErrorTracing('/api/market-manager/[marketId]/seasons/[seasonId]/makeup-dates', 'GET', async () => {
    const { marketId, seasonId } = await params
    await authManager(request, marketId)

    const service = createServiceClient()
    const season = await loadSeason(service, marketId, seasonId)
    if (!season) return NextResponse.json({ error: 'Season not found for this market' }, { status: 404 })

    const dates = await scheduledMakeups(service, marketId, season.end_date)
    const cap = season.potential_makeup_days ?? 0
    return NextResponse.json({
      season: { id: season.id, name: season.name, status: season.status, end_date: season.end_date },
      potentialMakeupDays: cap,
      scheduledDates: dates,
      remaining: Math.max(0, cap - dates.length),
    })
  })
}

/** POST — schedule a make-up day. Body: { date: 'YYYY-MM-DD', reason? }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ marketId: string; seasonId: string }> }) {
  return withErrorTracing('/api/market-manager/[marketId]/seasons/[seasonId]/makeup-dates', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`makeup-date:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const { marketId, seasonId } = await params
    const { user } = await authManager(request, marketId)

    const body = await request.json().catch(() => ({}))
    const date = typeof body?.date === 'string' ? body.date.trim() : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
      return NextResponse.json({ error: 'date must be a valid YYYY-MM-DD' }, { status: 400 })
    }

    const service = createServiceClient()
    const season = await loadSeason(service, marketId, seasonId)
    if (!season) return NextResponse.json({ error: 'Season not found for this market' }, { status: 404 })

    // Make-up days are scheduled only while the season is in the make-up window.
    if (season.status !== 'ended') {
      return NextResponse.json(
        { error: season.status === 'settled' ? 'This season is already settled.' : 'End the season first to open its make-up window.' },
        { status: 409 },
      )
    }
    const cap = season.potential_makeup_days ?? 0
    if (cap <= 0) {
      return NextResponse.json({ error: 'This season did not set a make-up buffer.' }, { status: 409 })
    }

    const { data: market } = await service
      .from('markets')
      .select('name, vertical_id, timezone')
      .eq('id', marketId)
      .maybeSingle()
    if (!market) throw traced.notFound('ERR_MARKET_001', 'Market not found')
    const timezone = (market.timezone as string | null) ?? null
    const vertical = (market.vertical_id as string | undefined) || 'farmers_market'
    const marketName = (market.name as string | undefined) || 'the market'

    // Post-close + in the future (vendors need notice). Any day of week is allowed.
    if (date <= season.end_date) {
      return NextResponse.json({ error: "A make-up day must be after the season's end date." }, { status: 400 })
    }
    const today = marketLocalDate(timezone)
    if (date <= today) {
      return NextResponse.json({ error: 'A make-up day must be in the future.' }, { status: 400 })
    }

    // Capacity cap.
    const existing = await scheduledMakeups(service, marketId, season.end_date)
    if (existing.length >= cap) {
      return NextResponse.json({ error: `You've already scheduled all ${cap} make-up day(s) for this season.` }, { status: 409 })
    }

    // Insert the 'special' override. One per (market, date).
    crumb.supabase('insert', 'market_date_overrides')
    const { error: insErr } = await service
      .from('market_date_overrides')
      .insert({
        market_id: marketId,
        override_date: date,
        status: 'special',
        reason: reason || null,
        created_by: user.id,
      })
    if (insErr) {
      if (insErr.code === '23505') {
        return NextResponse.json({ error: 'That date already has an override (cancelled or make-up).' }, { status: 409 })
      }
      throw traced.fromSupabase(insErr, { table: 'market_date_overrides', operation: 'insert' })
    }

    // Notify the season's paid-booth vendors (best-effort; never surface as 5xx).
    try {
      const dateLabel = (() => {
        try {
          const [y, m, d] = date.split('-').map(Number)
          return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
          })
        } catch { return date }
      })()

      const { data: paidGroups } = await service
        .from('booth_booking_groups')
        .select('vendor_profile_id')
        .eq('season_id', seasonId)
        .eq('status', 'paid')
      const vendorIds = Array.from(new Set((paidGroups ?? []).map((g) => g.vendor_profile_id as string)))
      if (vendorIds.length > 0) {
        const { data: vps } = await service
          .from('vendor_profiles')
          .select('user_id')
          .in('id', vendorIds)
        const userIds = Array.from(new Set((vps ?? []).map((v) => v.user_id as string).filter(Boolean)))
        await Promise.all(userIds.map((uid) =>
          sendNotification(uid, 'booth_makeup_scheduled_vendor',
            { marketName, marketId, marketDate: dateLabel },
            { vertical }),
        ))
      }
    } catch (notifErr) {
      console.error('[makeup-dates] notification block failed:', notifErr instanceof Error ? notifErr.message : 'Unknown')
    }

    return NextResponse.json({
      ok: true,
      date,
      scheduledCount: existing.length + 1,
      remaining: Math.max(0, cap - (existing.length + 1)),
    })
  })
}
