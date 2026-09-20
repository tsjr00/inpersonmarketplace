import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb, observed } from '@/lib/errors'
import {
  tierLabels, describeTierLabels,
  type BoothInventoryRow, type BoothNumberingScheme, type BoothLabelStateRow,
} from '@/lib/markets/booth-types'
import { sundayOf } from '@/lib/markets/manager-week-strip'

/**
 * Booth labels — mig 258 (Option U: numbers belong to sizes). Replaces the
 * mig-144 market-wide range this route used to hold.
 *
 * GET  /api/market-manager/[marketId]/booth-labels
 *   No params → the market's numbering scheme + one line per tier
 *   ("A1–A4" · "Pavilion, Corner" · "" when not yet numbered). The inventory
 *   card's map + the vendor-facing help paragraph read this.
 *
 * GET  …/booth-labels?inventory_id=<tier>&week_start_date=<Sunday>&vendor_profile_id=<vendor>
 *   The picker feed (design §3.2): every label of that size with its state
 *   for that week — free · placeholder · booked · assigned (another vendor's
 *   pin backed by a paid current/upcoming week) · pinned (another vendor's
 *   soft hold) · own (the named vendor's pin). Same arms as the mig-256
 *   trigger, so what the picker offers is what the trigger accepts.
 *
 * PUT  /api/market-manager/[marketId]/booth-labels  { booth_numbering_scheme: 'lettered' | 'existing' }
 *   Answers the one-time question (N-10). Changeable later; the DB trigger
 *   re-validates existing tiers against the new scheme on their next save.
 *
 * Auth: assigned manager of the market (isMarketManager); service client for reads.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-booth-labels:${clientIp}`, rateLimits.api)
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

function nameOf(pd: unknown): string {
  const d = (pd ?? {}) as { business_name?: string; farm_name?: string }
  return d.business_name || d.farm_name || 'a vendor'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-labels', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    const url = new URL(request.url)
    const inventoryId = url.searchParams.get('inventory_id')

    crumb.supabase('select', 'markets')
    const { data: market, error } = await serviceClient
      .from('markets')
      .select('booth_numbering_scheme, timezone')
      .eq('id', marketId)
      .maybeSingle()
    if (error) throw traced.fromSupabase(error, { table: 'markets', operation: 'select' })
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    const scheme = (market.booth_numbering_scheme as BoothNumberingScheme | null) ?? null

    // ── Map mode ────────────────────────────────────────────────────────────
    if (!inventoryId) {
      const { data: tiers } = await observed(serviceClient
        .from('market_booth_inventory')
        .select('id, size_label, count, label_prefix, label_start, label_end, labels')
        .eq('market_id', marketId)
        .order('size_label', { ascending: true }), { table: 'market_booth_inventory' })
      const rows = (tiers ?? []) as unknown as BoothInventoryRow[]
      return NextResponse.json({
        booth_numbering_scheme: scheme,
        tiers: rows.map((t) => ({
          id: t.id,
          size_label: t.size_label,
          count: t.count,
          labels: tierLabels(t),
          description: describeTierLabels(t),
        })),
      })
    }

    // ── Picker mode ─────────────────────────────────────────────────────────
    const { data: tier } = await observed(serviceClient
      .from('market_booth_inventory')
      .select('id, market_id, size_label, label_prefix, label_start, label_end, labels')
      .eq('id', inventoryId)
      .eq('market_id', marketId)
      .maybeSingle(), { table: 'market_booth_inventory' })
    if (!tier) return NextResponse.json({ error: 'Booth size not found at this market' }, { status: 404 })

    const labels = tierLabels(tier as unknown as BoothInventoryRow)
    const tz = (market.timezone as string | null) || 'America/Chicago'
    const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
    const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`
    const weekParam = url.searchParams.get('week_start_date')
    const week = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : sundayOf(today)
    const vendorProfileId = url.searchParams.get('vendor_profile_id')
    // "Current or upcoming" for the assignment test — same +6 arm as the trigger.
    const weekAgo = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate() - 6)).toISOString().slice(0, 10)

    const [placeholdersRes, bookedRes, pinsRes, paidRes] = await Promise.all([
      observed(serviceClient
        .from('market_booth_placeholders')
        .select('booth_number, notes')
        .eq('market_id', marketId), { table: 'market_booth_placeholders' }),
      observed(serviceClient
        .from('weekly_booth_rentals')
        .select('booth_number, vendor_profile_id, vendor_profiles!weekly_booth_rentals_vendor_profile_id_fkey ( profile_data )')
        .eq('market_id', marketId)
        .eq('week_start_date', week)
        .in('status', ['pending_payment', 'paid', 'completed'])
        .not('booth_number', 'is', null), { table: 'weekly_booth_rentals' }),
      observed(serviceClient
        .from('market_vendors')
        .select('booth_number, vendor_profile_id, vendor_profiles!market_vendors_vendor_profile_id_fkey ( profile_data )')
        .eq('market_id', marketId)
        .not('booth_number', 'is', null), { table: 'market_vendors' }),
      observed(serviceClient
        .from('weekly_booth_rentals')
        .select('booth_number, vendor_profile_id, week_start_date')
        .eq('market_id', marketId)
        .eq('status', 'paid')
        .gte('week_start_date', weekAgo)
        .not('booth_number', 'is', null), { table: 'weekly_booth_rentals' }),
    ])

    const placeholderBy = new Map<string, string>()
    for (const p of placeholdersRes.data ?? []) {
      placeholderBy.set(p.booth_number as string, ((p.notes as string | null) || '').trim() || 'off-platform vendor')
    }
    const bookedBy = new Map<string, string>()
    for (const r of bookedRes.data ?? []) {
      const vp = r.vendor_profiles as unknown as { profile_data: unknown } | { profile_data: unknown }[] | null
      bookedBy.set(r.booth_number as string, nameOf((Array.isArray(vp) ? vp[0] : vp)?.profile_data))
    }
    // label → latest paid Sunday for each holder under it
    const paidThroughBy = new Map<string, string>()
    for (const r of paidRes.data ?? []) {
      const key = `${r.vendor_profile_id}|${r.booth_number}`
      const cur = paidThroughBy.get(key)
      const wsd = r.week_start_date as string
      if (!cur || wsd > cur) paidThroughBy.set(key, wsd)
    }
    const pinBy = new Map<string, { vendorId: string; name: string }>()
    for (const p of pinsRes.data ?? []) {
      const vp = p.vendor_profiles as unknown as { profile_data: unknown } | { profile_data: unknown }[] | null
      pinBy.set(p.booth_number as string, { vendorId: p.vendor_profile_id as string, name: nameOf((Array.isArray(vp) ? vp[0] : vp)?.profile_data) })
    }

    const rows: BoothLabelStateRow[] = labels.map((label) => {
      const ph = placeholderBy.get(label)
      if (ph) return { label, state: 'placeholder', holder: ph }
      const bk = bookedBy.get(label)
      if (bk) return { label, state: 'booked', holder: bk }
      const pin = pinBy.get(label)
      if (pin) {
        if (vendorProfileId && pin.vendorId === vendorProfileId) return { label, state: 'own' }
        const paidSunday = paidThroughBy.get(`${pin.vendorId}|${label}`)
        if (paidSunday) {
          const [y, m, d] = paidSunday.split('-').map(Number)
          const sat = new Date(Date.UTC(y!, m! - 1, d! + 6)).toISOString().slice(0, 10)
          return { label, state: 'assigned', holder: pin.name, paidThrough: sat }
        }
        return { label, state: 'pinned', holder: pin.name }
      }
      return { label, state: 'free' }
    })

    return NextResponse.json({
      booth_numbering_scheme: scheme,
      inventory_id: inventoryId,
      size_label: tier.size_label,
      week_start_date: week,
      labels: rows,
    })
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-labels', 'PUT', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    const scheme = body?.booth_numbering_scheme
    if (scheme !== 'lettered' && scheme !== 'existing') {
      throw traced.validation('ERR_VALIDATION_001', 'Choose "new market" (lettered) or "existing numbers".')
    }

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { error } = await serviceClient
      .from('markets')
      .update({ booth_numbering_scheme: scheme })
      .eq('id', marketId)
    if (error) throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })

    return NextResponse.json({ booth_numbering_scheme: scheme as BoothNumberingScheme })
  })
}
