import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getSeasonBookableWeeks } from '@/lib/markets/season-weeks'

// Phase E (O6) presale constants.
const MAX_PRESALE_LEAD_DAYS = 60   // can't open a season's prepay earlier than this before start
const PRESALE_GRACE_DAYS = 14      // window auto-closes start_date + 14d (catch late buyers)
const REFUND_CAP_PCT = 0.10        // default cap = 10% of declared market days (floor, min 1)
const REFUND_CAP_CEILING_PCT = 0.15 // manager can't set the cap above 15% of declared days

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseUtc(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
function addDaysUtc(d: Date, days: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + days)
  return r
}

/** Today (date-only, UTC-anchored) in the market's timezone. */
function marketTodayUtc(timezone: string | null): Date {
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone || 'America/Chicago' }))
  return new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate()))
}

async function authManager(request: NextRequest, marketId: string) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')
  if (!(await isMarketManager(supabase, marketId, user))) {
    throw traced.auth('ERR_AUTH_002', 'Not the manager of this market')
  }
  return { supabase, user }
}

/** GET — list this market's seasons (newest first). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  return withErrorTracing('/api/market-manager/[marketId]/seasons', 'GET', async () => {
    const { marketId } = await params
    await authManager(request, marketId)

    const service = createServiceClient()
    const { data: seasons, error } = await service
      .from('market_seasons')
      .select('id, name, start_date, end_date, declared_market_days, refund_cap_days, prepay_open, prepay_opened_at, prepay_closes_at, status, created_at')
      .eq('market_id', marketId)
      .order('start_date', { ascending: false })
    if (error) throw traced.fromSupabase(error, { table: 'market_seasons', operation: 'select' })

    return NextResponse.json({ seasons: seasons ?? [] })
  })
}

/**
 * POST — create a season. Derives declared_market_days from the schedule
 * (minus cancelled overrides) and the default refund_cap_days. O1: requires the
 * market schedule to be confirmed — pass scheduleConfirmed:true to stamp it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  return withErrorTracing('/api/market-manager/[marketId]/seasons', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`seasons-create:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const { marketId } = await params
    await authManager(request, marketId)

    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : ''
    const startDate = typeof body?.start_date === 'string' ? body.start_date.trim() : ''
    const endDate = typeof body?.end_date === 'string' ? body.end_date.trim() : ''
    const scheduleConfirmed = body?.scheduleConfirmed === true

    if (!name) return NextResponse.json({ error: 'A season name is required', field: 'name' }, { status: 400 })
    if (!DATE_RE.test(startDate) || Number.isNaN(Date.parse(startDate))) {
      return NextResponse.json({ error: 'start_date must be a valid YYYY-MM-DD', field: 'start_date' }, { status: 400 })
    }
    if (!DATE_RE.test(endDate) || Number.isNaN(Date.parse(endDate))) {
      return NextResponse.json({ error: 'end_date must be a valid YYYY-MM-DD', field: 'end_date' }, { status: 400 })
    }
    if (parseUtc(endDate) < parseUtc(startDate)) {
      return NextResponse.json({ error: 'end_date must be on or after start_date', field: 'end_date' }, { status: 400 })
    }

    const service = createServiceClient()
    const { data: market } = await service
      .from('markets')
      .select('schedule_confirmed_at')
      .eq('id', marketId)
      .maybeSingle()
    if (!market) throw traced.notFound('ERR_MARKET_001', 'Market not found')

    // O1 gate: the schedule must be confirmed accurate before a season can rely
    // on it for day enumeration. Stamp it now if the manager confirmed.
    if (!market.schedule_confirmed_at && !scheduleConfirmed) {
      return NextResponse.json(
        { error: 'Confirm your market schedule is accurate before creating a season.', field: 'scheduleConfirmed', needsScheduleConfirm: true },
        { status: 409 }
      )
    }
    if (scheduleConfirmed) {
      await service.from('markets').update({ schedule_confirmed_at: new Date().toISOString() }).eq('id', marketId)
    }

    // Derive declared market DAYS (operating dates, not weeks) in the window.
    const weeks = await getSeasonBookableWeeks(service, marketId, startDate, endDate)
    const declaredMarketDays = weeks.reduce((sum, w) => sum + w.operatingDates.length, 0)
    if (declaredMarketDays === 0) {
      return NextResponse.json(
        { error: 'No market days fall in this date range — check your schedule and dates.', field: 'start_date' },
        { status: 400 }
      )
    }
    const refundCapDays = Math.max(1, Math.floor(declaredMarketDays * REFUND_CAP_PCT))

    const { data: season, error: insErr } = await service
      .from('market_seasons')
      .insert({
        market_id: marketId,
        name,
        start_date: startDate,
        end_date: endDate,
        declared_market_days: declaredMarketDays,
        refund_cap_days: refundCapDays,
        status: 'draft',
      })
      .select('id, name, start_date, end_date, declared_market_days, refund_cap_days, prepay_open, status')
      .single()
    if (insErr) throw traced.fromSupabase(insErr, { table: 'market_seasons', operation: 'insert' })

    return NextResponse.json({ season })
  })
}

/**
 * PATCH — act on a season. Body: { seasonId, action }.
 *   action='open_prepay'  — enforce the 60-day lead cap + one-season-ahead;
 *                           set prepay_closes_at = start_date + 14 days.
 *   action='close_prepay' — manual early close.
 *   action='set_cap'      — body.refund_cap_days, clamped to the 15% ceiling.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  return withErrorTracing('/api/market-manager/[marketId]/seasons', 'PATCH', async () => {
    const { marketId } = await params
    await authManager(request, marketId)

    const body = await request.json().catch(() => ({}))
    const seasonId = typeof body?.seasonId === 'string' ? body.seasonId : ''
    const action = typeof body?.action === 'string' ? body.action : ''
    if (!seasonId) return NextResponse.json({ error: 'seasonId is required' }, { status: 400 })

    const service = createServiceClient()
    const { data: season } = await service
      .from('market_seasons')
      .select('id, market_id, start_date, declared_market_days, prepay_open')
      .eq('id', seasonId)
      .maybeSingle()
    if (!season || season.market_id !== marketId) {
      return NextResponse.json({ error: 'Season not found for this market' }, { status: 404 })
    }

    const { data: market } = await service.from('markets').select('timezone').eq('id', marketId).maybeSingle()
    const today = marketTodayUtc((market?.timezone as string | null) ?? null)
    const start = parseUtc(season.start_date as string)

    if (action === 'open_prepay') {
      // 60-day lead cap: can't open earlier than start - 60 days.
      if (today < addDaysUtc(start, -MAX_PRESALE_LEAD_DAYS)) {
        return NextResponse.json(
          { error: `Pre-sales can't open more than ${MAX_PRESALE_LEAD_DAYS} days before the season starts.` },
          { status: 409 }
        )
      }
      // Window already past (start + grace)?
      if (today >= addDaysUtc(start, PRESALE_GRACE_DAYS + 1)) {
        return NextResponse.json({ error: 'This season is too far underway to open pre-sales.' }, { status: 409 })
      }
      const closesAt = addDaysUtc(start, PRESALE_GRACE_DAYS + 1) // start..start+14 inclusive
      const { error: updErr } = await service
        .from('market_seasons')
        .update({
          prepay_open: true,
          prepay_opened_at: new Date().toISOString(),
          prepay_closes_at: closesAt.toISOString(),
          status: 'open',
        })
        .eq('id', seasonId)
      if (updErr) {
        // uq_market_seasons_one_open partial unique index: another open season exists.
        if (updErr.code === '23505') {
          return NextResponse.json(
            { error: 'Another season is already open for pre-sales at this market. Close it before opening a new one.' },
            { status: 409 }
          )
        }
        throw traced.fromSupabase(updErr, { table: 'market_seasons', operation: 'update' })
      }
      return NextResponse.json({ ok: true, prepay_closes_at: closesAt.toISOString() })
    }

    if (action === 'close_prepay') {
      const status = today >= start ? 'active' : 'draft'
      const { error: updErr } = await service
        .from('market_seasons')
        .update({ prepay_open: false, status })
        .eq('id', seasonId)
      if (updErr) throw traced.fromSupabase(updErr, { table: 'market_seasons', operation: 'update' })
      return NextResponse.json({ ok: true })
    }

    if (action === 'set_cap') {
      const requested = Number(body?.refund_cap_days)
      if (!Number.isInteger(requested) || requested < 0) {
        return NextResponse.json({ error: 'refund_cap_days must be a non-negative integer' }, { status: 400 })
      }
      const ceiling = Math.floor((season.declared_market_days as number) * REFUND_CAP_CEILING_PCT)
      if (requested > ceiling) {
        return NextResponse.json(
          { error: `The cap can't exceed ${ceiling} days (15% of this season's ${season.declared_market_days} market days).` },
          { status: 400 }
        )
      }
      const { error: updErr } = await service
        .from('market_seasons')
        .update({ refund_cap_days: requested })
        .eq('id', seasonId)
      if (updErr) throw traced.fromSupabase(updErr, { table: 'market_seasons', operation: 'update' })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  })
}
