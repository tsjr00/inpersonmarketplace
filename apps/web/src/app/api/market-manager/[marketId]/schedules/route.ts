import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, logError } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

/**
 * GET /api/market-manager/[marketId]/schedules
 *   Returns current schedule rows + the market's season window
 *   (season_start, season_end on the markets table itself).
 *
 * PUT /api/market-manager/[marketId]/schedules
 *   Atomic replace of the schedule + season fields. Manager-driven.
 *
 *   Body:
 *     {
 *       schedules: Array<{
 *         day_of_week: 0..6,
 *         start_time: 'HH:MM' | 'HH:MM:SS',
 *         end_time:   'HH:MM' | 'HH:MM:SS',
 *         active: boolean,
 *       }>,
 *       season_start: 'YYYY-MM-DD' | null,
 *       season_end:   'YYYY-MM-DD' | null,
 *       acknowledged: true,    // hard gate
 *     }
 *
 *   Rules locked 2026-05-19:
 *   - One slot per day_of_week (server rejects duplicates; the
 *     market_schedules table lacks a UNIQUE so this is enforced here).
 *   - acknowledged=true is required — the manager has confirmed they
 *     understand they're responsible for direct vendor outreach +
 *     refunds, and that the platform does NOT issue refunds.
 *   - **Soft-delete via `active` flag — NEVER DELETE rows.** (Revised
 *     2026-05-19 per the new Schema Intent Gate in
 *     verification-discipline.md Rule 5.) The `market_schedules.active`
 *     column is the designed soft-delete signal. Three FKs reference
 *     `market_schedules(id)` — `vendor_market_schedules.schedule_id`
 *     (CASCADE), `cart_items.schedule_id` (SET NULL), and
 *     `order_items.schedule_id` (SET NULL). Deleting a row would
 *     silently destroy vendor attendance records and orphan cart /
 *     order references. Instead, the PUT toggles `active` per-day.
 *     The existing trigger `handle_market_schedule_deactivation`
 *     (mig 20260128_001:151-172) automatically sets
 *     `vendor_market_schedules.is_active=false` when a row flips
 *     active=true→false — so vendor attendance gets deactivated, not
 *     destroyed, without the API touching that table directly.
 *   - After successful save, fires `market_schedule_changed` notification
 *     to every approved vendor at the market (market_vendors.approved=true).
 *
 * Auth: assigned manager of the market (dual-key via isMarketManager).
 *
 * Per-day soft-upsert pattern: SELECT existing rows once, map by
 * day_of_week, then for each input row UPDATE the existing row (preserves
 * id, fires the deactivation trigger when active flips) or INSERT a new
 * row (only when active=true; never insert an inactive row from scratch).
 * No DELETE operations.
 */

interface ScheduleInput {
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface ScheduleRow {
  id: string
  market_id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-sched:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) {
    return { ok: false, response: rateLimitResponse(rateLimitResult) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }),
    }
  }
  return { ok: true }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/schedules', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()

    // markets has RLS but is publicly readable; service client is consistent
    // with the rest of the manager API.
    crumb.supabase('select', 'markets')
    const { data: market, error: marketErr } = await serviceClient
      .from('markets')
      .select('season_start, season_end')
      .eq('id', marketId)
      .maybeSingle()

    if (marketErr) {
      throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
    }

    crumb.supabase('select', 'market_schedules')
    const { data: schedules, error: schedErr } = await serviceClient
      .from('market_schedules')
      .select('id, market_id, day_of_week, start_time, end_time, active')
      .eq('market_id', marketId)
      .order('day_of_week', { ascending: true })

    if (schedErr) {
      throw traced.fromSupabase(schedErr, { table: 'market_schedules', operation: 'select' })
    }

    return NextResponse.json({
      schedules: (schedules || []) as ScheduleRow[],
      season_start: (market?.season_start as string | null) ?? null,
      season_end: (market?.season_end as string | null) ?? null,
    })
  })
}

function isValidTimeStr(t: unknown): t is string {
  return typeof t === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(t)
}

function isValidDateStr(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/schedules', 'PUT', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))

    // Hard gate: server enforces acknowledgment even though the UI also
    // gates it client-side. Belt-and-suspender — the acknowledgment is
    // legally meaningful (manager takes responsibility for vendor outreach
    // and refunds; platform takes none).
    if (body?.acknowledged !== true) {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'acknowledged must be true — you must confirm responsibility for vendor outreach and refunds before saving schedule changes'
      )
    }

    // Validate schedule rows
    const rawSchedules = Array.isArray(body?.schedules) ? body.schedules : null
    if (rawSchedules === null) {
      throw traced.validation('ERR_VALIDATION_002', 'schedules must be an array')
    }
    const cleaned: ScheduleInput[] = []
    const seenDays = new Set<number>()
    for (const s of rawSchedules) {
      if (!s || typeof s !== 'object') continue
      const day = Number(s.day_of_week)
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        throw traced.validation('ERR_VALIDATION_003', `Invalid day_of_week: ${s.day_of_week} (must be 0-6)`)
      }
      if (seenDays.has(day)) {
        throw traced.validation(
          'ERR_VALIDATION_004',
          `Duplicate day_of_week ${day} — one slot per day of week is the v1 rule`
        )
      }
      seenDays.add(day)
      if (!isValidTimeStr(s.start_time) || !isValidTimeStr(s.end_time)) {
        throw traced.validation(
          'ERR_VALIDATION_005',
          `Invalid time format for day ${day} — use HH:MM (24-hour)`
        )
      }
      if (s.start_time >= s.end_time) {
        throw traced.validation(
          'ERR_VALIDATION_006',
          `Start time must be before end time for day ${day}`
        )
      }
      cleaned.push({
        day_of_week: day,
        start_time: s.start_time,
        end_time: s.end_time,
        active: s.active !== false, // default true if not explicitly false
      })
    }

    // Validate season window
    let seasonStart: string | null = null
    let seasonEnd: string | null = null
    if (body?.season_start !== undefined && body?.season_start !== null) {
      if (!isValidDateStr(body.season_start)) {
        throw traced.validation('ERR_VALIDATION_007', 'season_start must be YYYY-MM-DD or null')
      }
      seasonStart = body.season_start
    }
    if (body?.season_end !== undefined && body?.season_end !== null) {
      if (!isValidDateStr(body.season_end)) {
        throw traced.validation('ERR_VALIDATION_008', 'season_end must be YYYY-MM-DD or null')
      }
      seasonEnd = body.season_end
    }
    if (seasonStart && seasonEnd && seasonStart > seasonEnd) {
      throw traced.validation(
        'ERR_VALIDATION_009',
        'season_start must be on or before season_end'
      )
    }

    const serviceClient = createServiceClient()

    // 1) Update markets.season_start + season_end (single row update)
    crumb.supabase('update', 'markets')
    const { error: marketUpdateErr } = await serviceClient
      .from('markets')
      .update({ season_start: seasonStart, season_end: seasonEnd })
      .eq('id', marketId)
    if (marketUpdateErr) {
      throw traced.fromSupabase(marketUpdateErr, { table: 'markets', operation: 'update' })
    }

    // 2) Per-day soft-upsert. NEVER DELETE — see file header for full
    //    rationale. Load existing rows once, then UPDATE in place or
    //    INSERT new. The deactivation trigger handles vendor-attendance
    //    cascade when active flips true→false.
    crumb.supabase('select', 'market_schedules')
    const { data: existingRows, error: existingErr } = await serviceClient
      .from('market_schedules')
      .select('id, day_of_week, active')
      .eq('market_id', marketId)
    if (existingErr) {
      throw traced.fromSupabase(existingErr, {
        table: 'market_schedules',
        operation: 'select',
      })
    }

    const existingByDay = new Map<number, { id: string; active: boolean | null }>()
    for (const row of existingRows ?? []) {
      existingByDay.set(row.day_of_week as number, {
        id: row.id as string,
        active: row.active as boolean | null,
      })
    }

    const upsertedRows: ScheduleRow[] = []
    for (const s of cleaned) {
      const existing = existingByDay.get(s.day_of_week)
      if (existing) {
        // UPDATE in place. Triggers handle_market_schedule_deactivation
        // if active flips true→false (cascades is_active=false to
        // vendor_market_schedules without deleting those rows).
        crumb.supabase('update', 'market_schedules')
        const { data: updated, error: updateErr } = await serviceClient
          .from('market_schedules')
          .update({
            start_time: s.start_time,
            end_time: s.end_time,
            active: s.active,
          })
          .eq('id', existing.id)
          .select('id, market_id, day_of_week, start_time, end_time, active')
          .single()
        if (updateErr) {
          logError(traced.fromSupabase(updateErr, {
            table: 'market_schedules',
            operation: 'update',
          }))
          throw traced.fromSupabase(updateErr, {
            table: 'market_schedules',
            operation: 'update',
          })
        }
        upsertedRows.push(updated as ScheduleRow)
      } else if (s.active) {
        // No existing row + want it active → INSERT.
        // No-INSERT-when-inactive: we never create a fresh row in the
        // inactive state. The client-side filter shouldn't send
        // inactive-no-times anyway, but the API guards against it too.
        crumb.supabase('insert', 'market_schedules')
        const { data: inserted, error: insertErr } = await serviceClient
          .from('market_schedules')
          .insert({
            market_id: marketId,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            active: true,
          })
          .select('id, market_id, day_of_week, start_time, end_time, active')
          .single()
        if (insertErr) {
          logError(traced.fromSupabase(insertErr, {
            table: 'market_schedules',
            operation: 'insert',
          }))
          throw traced.fromSupabase(insertErr, {
            table: 'market_schedules',
            operation: 'insert',
          })
        }
        upsertedRows.push(inserted as ScheduleRow)
      }
      // else: no existing + inactive input → no-op (nothing to track).
    }

    // 3) Notify all approved vendors at the market. Best-effort —
    //    sendNotification is non-throwing by contract, but wrap in
    //    try/catch as belt-and-suspender so a single bad notification
    //    can't fail the save response.
    try {
      crumb.supabase('select', 'markets')
      const { data: marketInfo } = await serviceClient
        .from('markets')
        .select('name, vertical_id')
        .eq('id', marketId)
        .maybeSingle()

      const marketName = (marketInfo?.name as string | undefined) || 'the market'
      const vertical =
        (marketInfo?.vertical_id as string | undefined) || 'farmers_market'

      // FK hint REQUIRED: market_vendors has two FKs to vendor_profiles
      // (vendor_profile_id + replaced_vendor_id). A bare embed is ambiguous
      // and errors → null → zero recipients (silently). This had been
      // sending schedule-change notifications to nobody. (Session 92 fix.)
      crumb.supabase('select', 'market_vendors')
      const { data: approvedVendors, error: approvedErr } = await serviceClient
        .from('market_vendors')
        .select(`
          vendor_profile_id,
          vendor_profiles!market_vendors_vendor_profile_id_fkey ( user_id )
        `)
        .eq('market_id', marketId)
        .eq('approved', true)
      if (approvedErr) {
        console.error('[schedules] approved-vendors recipient query failed:', approvedErr.message)
      }

      type VendorRow = {
        vendor_profile_id: string
        vendor_profiles: { user_id: string | null } | { user_id: string | null }[] | null
      }
      const recipientUserIds = new Set<string>()
      for (const v of (approvedVendors ?? []) as VendorRow[]) {
        const vp = Array.isArray(v.vendor_profiles) ? v.vendor_profiles[0] : v.vendor_profiles
        if (vp?.user_id) recipientUserIds.add(vp.user_id)
      }

      // Also fan out to booth renters for the current or upcoming weeks.
      // The schedule editor is recurring per day-of-week, so any save
      // potentially affects every upcoming booth renter at this market.
      // week_start_date is a Sunday — we filter on "this week's Sunday"
      // so an in-progress renter (their week isn't over yet) is still
      // included. The recipientUserIds Set dedups when a vendor is both
      // an approved market_vendor AND a paid booth renter.
      const localNow = new Date()
      const dayIdx = localNow.getDay() // 0 = Sun
      const thisWeekStart = new Date(localNow)
      thisWeekStart.setDate(localNow.getDate() - dayIdx)
      const thisWeekStartStr = thisWeekStart.toISOString().slice(0, 10)

      crumb.supabase('select', 'weekly_booth_rentals')
      const { data: paidRenters } = await serviceClient
        .from('weekly_booth_rentals')
        .select(`
          vendor_profile_id,
          vendor_profiles!inner ( user_id )
        `)
        .eq('market_id', marketId)
        .eq('status', 'paid')
        .gte('week_start_date', thisWeekStartStr)

      for (const r of (paidRenters ?? []) as VendorRow[]) {
        const vp = Array.isArray(r.vendor_profiles) ? r.vendor_profiles[0] : r.vendor_profiles
        if (vp?.user_id) recipientUserIds.add(vp.user_id)
      }

      // Fire notifications in parallel, but bounded — for a typical FM
      // market this is 5-20 vendors. No backpressure needed at that scale.
      await Promise.all(
        Array.from(recipientUserIds).map(async (userId) => {
          // Look up vendor's auth email for the email channel.
          let vendorEmail: string | null = null
          try {
            const { data: authUser } = await serviceClient.auth.admin.getUserById(userId)
            vendorEmail = authUser?.user?.email ?? null
          } catch {
            // Email lookup failure → in-app channel still fires.
          }
          await sendNotification(
            userId,
            'market_schedule_changed',
            { marketName, marketId },
            {
              vertical,
              ...(vendorEmail ? { userEmail: vendorEmail } : {}),
            }
          )
        })
      )
    } catch (notifErr) {
      // Save already succeeded — never let notification failure surface
      // as a 5xx to the manager.
      console.error('[schedules PUT] notification block failed:', notifErr instanceof Error ? notifErr.message : 'Unknown')
    }

    return NextResponse.json({
      schedules: upsertedRows,
      season_start: seasonStart,
      season_end: seasonEnd,
    })
  })
}
