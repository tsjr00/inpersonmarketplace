import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getGroupCancelledDays } from '@/lib/markets/cancelled-days'
import { owedForGroup, isSeasonFullyResolved } from '@/lib/markets/settlement-math'
import { sendNotification } from '@/lib/notifications'

/**
 * Phase E — manager season-end SETTLEMENT (O4).
 *
 * When a season's cancelled operating days exceed its refund_cap_days, the
 * manager owes each affected paid group offsetting VALUE (credit-first; no Stripe
 * money moves backward). The owed value is the manager-held base of the cancelled
 * days BEYOND the cap, prorated per-day:
 *   perDayBase = group.total_manager_cents / (week_count * activeDaysPerWeek)
 *   owedDays   = max(0, cancelledDays - refund_cap_days)
 *   owedCents  = round(owedDays * perDayBase)
 *
 * Resolution (v1, migration-free) — both 0-amount markers that resolve a group:
 *   'off_platform' — manager settles the vendor directly off-platform.
 *   'made_up'      — the cancelled days were covered by scheduled make-up days
 *                    (Phase E make-up feature); the vendor is notified accordingly.
 * When every shortfall group is resolved the season flips to status='settled'.
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

interface PaidGroup {
  id: string
  vendor_profile_id: string
  week_count: number
  total_manager_cents: number
}

async function loadContext(service: ReturnType<typeof createServiceClient>, marketId: string, seasonId: string) {
  const { data: season } = await service
    .from('market_seasons')
    .select('id, market_id, name, start_date, end_date, refund_cap_days, status')
    .eq('id', seasonId)
    .maybeSingle()
  if (!season || season.market_id !== marketId) return null

  const { data: groupsRaw } = await service
    .from('booth_booking_groups')
    .select('id, vendor_profile_id, week_count, total_manager_cents')
    .eq('season_id', seasonId)
    .eq('status', 'paid')
  const groups: PaidGroup[] = (groupsRaw ?? []).map((g) => ({
    id: g.id as string,
    vendor_profile_id: g.vendor_profile_id as string,
    week_count: g.week_count as number,
    total_manager_cents: g.total_manager_cents as number,
  }))

  const { count: activeDaysPerWeek } = await service
    .from('market_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('market_id', marketId)
    .eq('active', true)

  return { season, groups, activeDaysPerWeek: activeDaysPerWeek ?? 0 }
}

/** GET — settlement view: each paid group's cancelled days vs cap + owed value + resolved state. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ marketId: string; seasonId: string }> }) {
  return withErrorTracing('/api/market-manager/[marketId]/seasons/[seasonId]/settlement', 'GET', async () => {
    const { marketId, seasonId } = await params
    await authManager(request, marketId)

    const service = createServiceClient()
    const ctx = await loadContext(service, marketId, seasonId)
    if (!ctx) return NextResponse.json({ error: 'Season not found for this market' }, { status: 404 })
    const { season, groups, activeDaysPerWeek } = ctx
    const refundCapDays = (season.refund_cap_days as number) ?? 0

    const groupIds = groups.map((g) => g.id)
    const vendorIds = Array.from(new Set(groups.map((g) => g.vendor_profile_id)))

    // Resolved = a season_settlement booth_credits row already references the group.
    const resolved = new Set<string>()
    if (groupIds.length > 0) {
      const { data: settled } = await service
        .from('booth_credits')
        .select('related_group_id')
        .eq('source', 'season_settlement')
        .in('related_group_id', groupIds)
      for (const r of settled ?? []) {
        if (r.related_group_id) resolved.add(r.related_group_id as string)
      }
    }

    const nameByVendor = new Map<string, string>()
    if (vendorIds.length > 0) {
      const { data: vps } = await service
        .from('vendor_profiles')
        .select('id, profile_data')
        .in('id', vendorIds)
      for (const vp of vps ?? []) {
        const pd = (vp.profile_data as { business_name?: string } | null) ?? null
        nameByVendor.set(vp.id as string, pd?.business_name || 'Vendor')
      }
    }

    const groupViews = await Promise.all(groups.map(async (g) => {
      const cd = await getGroupCancelledDays(service, g.id)
      const cancelledDays = cd?.cancelledDays ?? 0
      const { owedDays, owedCents } = owedForGroup(
        g.total_manager_cents, g.week_count, activeDaysPerWeek, cancelledDays, refundCapDays,
      )
      return {
        groupId: g.id,
        vendorName: nameByVendor.get(g.vendor_profile_id) ?? 'Vendor',
        weekCount: g.week_count,
        cancelledDays,
        refundCapDays,
        owedDays,
        owedCents,
        resolved: resolved.has(g.id),
      }
    }))

    return NextResponse.json({
      season: {
        id: season.id,
        name: season.name,
        start_date: season.start_date,
        end_date: season.end_date,
        refund_cap_days: refundCapDays,
        status: season.status,
      },
      groups: groupViews,
    })
  })
}

/** POST — resolve a group's shortfall. Body: { groupId, resolution }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ marketId: string; seasonId: string }> }) {
  return withErrorTracing('/api/market-manager/[marketId]/seasons/[seasonId]/settlement', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`season-settlement:${clientIp}`, rateLimits.submit)
    if (!rl.success) return rateLimitResponse(rl)

    const { marketId, seasonId } = await params
    await authManager(request, marketId)

    const body = await request.json().catch(() => ({}))
    const groupId = typeof body?.groupId === 'string' ? body.groupId : ''
    const resolution = typeof body?.resolution === 'string' ? body.resolution : ''
    if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })
    // v1 resolutions: 'off_platform' (manager settles the vendor directly) or
    // 'made_up' (the cancelled days were covered by scheduled make-up days — the
    // Phase E make-up feature). Both write a 0-amount marker that resolves the
    // group; no in-platform credit and no Stripe money moves.
    if (resolution !== 'off_platform' && resolution !== 'made_up') {
      return NextResponse.json({ error: "resolution must be 'off_platform' or 'made_up'" }, { status: 400 })
    }

    const service = createServiceClient()
    const ctx = await loadContext(service, marketId, seasonId)
    if (!ctx) return NextResponse.json({ error: 'Season not found for this market' }, { status: 404 })
    const { season, groups, activeDaysPerWeek } = ctx
    const refundCapDays = (season.refund_cap_days as number) ?? 0

    const group = groups.find((g) => g.id === groupId)
    if (!group) return NextResponse.json({ error: 'Paid group not found for this season' }, { status: 404 })

    // Already resolved? (idempotency / double-click guard)
    const { data: existing } = await service
      .from('booth_credits')
      .select('id')
      .eq('source', 'season_settlement')
      .eq('related_group_id', groupId)
      .limit(1)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'This group has already been settled.' }, { status: 409 })

    const cd = await getGroupCancelledDays(service, groupId)
    const cancelledDays = cd?.cancelledDays ?? 0
    const { owedDays, owedCents } = owedForGroup(
      group.total_manager_cents, group.week_count, activeDaysPerWeek, cancelledDays, refundCapDays,
    )
    if (owedDays === 0) {
      return NextResponse.json({ error: 'Cancelled days are within the refund cap — nothing is owed for this group.' }, { status: 400 })
    }

    // A 0-amount marker row (no balance change) records the group as resolved
    // and drives the clean-close gate; the note distinguishes how it was settled.
    const note = resolution === 'made_up'
      ? `Made up with scheduled make-up days: ${owedDays} day(s) beyond the ${refundCapDays}-day cap`
      : `Settled off-platform by manager: ${owedDays} day(s) beyond the ${refundCapDays}-day cap`

    const { error: insErr } = await service.from('booth_credits').insert({
      vendor_profile_id: group.vendor_profile_id,
      market_id: marketId,
      amount_cents: 0,
      source: 'season_settlement',
      related_group_id: groupId,
      note,
    })
    if (insErr) throw traced.fromSupabase(insErr, { table: 'booth_credits', operation: 'insert' })

    // Notify the vendor (best-effort; sendNotification never throws).
    const { data: marketRow } = await service.from('markets').select('name, vertical_id').eq('id', marketId).maybeSingle()
    const { data: vp } = await service.from('vendor_profiles').select('user_id').eq('id', group.vendor_profile_id).maybeSingle()
    const vendorUserId = vp?.user_id as string | undefined
    if (vendorUserId) {
      await sendNotification(
        vendorUserId,
        resolution === 'made_up' ? 'booth_makeup_settled_vendor' : 'booth_season_settled_vendor',
        {
          marketName: (marketRow?.name as string | undefined) || 'the market',
        },
        { vertical: (marketRow?.vertical_id as string | undefined) || 'farmers_market' },
      )
    }

    // Clean close: if every paid group with a shortfall is now resolved, settle the season.
    const { data: settledRows } = await service
      .from('booth_credits')
      .select('related_group_id')
      .eq('source', 'season_settlement')
      .in('related_group_id', groups.map((g) => g.id))
    const resolvedIds = new Set((settledRows ?? []).map((r) => r.related_group_id as string))

    let seasonSettled = false
    const shortfallGroups = await Promise.all(groups.map(async (g) => {
      const c = await getGroupCancelledDays(service, g.id)
      const { owedDays: od } = owedForGroup(
        g.total_manager_cents, g.week_count, activeDaysPerWeek, c?.cancelledDays ?? 0, refundCapDays,
      )
      return { id: g.id, hasShortfall: od > 0 }
    }))
    const allResolved = isSeasonFullyResolved(shortfallGroups, resolvedIds)
    if (allResolved && season.status !== 'settled') {
      const { error: updErr } = await service
        .from('market_seasons')
        .update({ status: 'settled' })
        .eq('id', seasonId)
      if (!updErr) seasonSettled = true
    }

    return NextResponse.json({ ok: true, owed_cents: owedCents, resolution, season_settled: seasonSettled })
  })
}
