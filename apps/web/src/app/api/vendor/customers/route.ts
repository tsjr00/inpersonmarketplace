import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getFtTierExtras } from '@/lib/vendor-limits'
import { classifyCustomer, dedupeOrders, toDay } from '@/lib/loyalty/segments'
import type { CustomerSegment } from '@/lib/loyalty/config'

/**
 * GET /api/vendor/customers?vendor_id=X&vertical=Y
 *
 * "Your Customers" (A1, vip_loyalty_buildout_plan.md — owner 2026-09-04):
 * the vendor's LIFETIME customer distribution — one-timers → repeat →
 * Regulars → Local Legends — plus who favorited them. "Would help trucks
 * know who to appreciate, call by name" (owner 2026-08-25).
 *
 * ONE classifier (lib/loyalty/segments.ts) shared with the buyer's badges
 * and the order-card chip, so this report can never disagree with either.
 * Same auth + tier-gate shape as location-insights (this is lifetime and
 * vendor-level where that one is windowed and per-location — a sibling,
 * not an extension).
 *
 * Privacy: display names only (the same name order cards show) — never
 * email or phone (owner 2026-08-25).
 */

const MAX_ROWS = 100

const SEGMENT_RANK: Record<CustomerSegment, number> = {
  loyal: 4,
  regular: 3,
  repeat: 2,
  one_timer: 1,
  new: 0,
}

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/customers', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-customers:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendor_id')
    const vertical = searchParams.get('vertical')
    if (!vendorId || !vertical) {
      return NextResponse.json({ error: 'vendor_id and vertical are required' }, { status: 400 })
    }

    // Ownership — mirrors location-insights.
    const { data: vendorProfile } = await observed(supabase
      .from('vendor_profiles')
      .select('id, user_id, tier, vertical_id')
      .eq('id', vendorId)
      .single(), { table: 'vendor_profiles' })
    if (!vendorProfile || vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const extras = getFtTierExtras(vendorProfile.tier || 'free')
    const insightLevel = extras.locationInsights
    if (insightLevel !== 'basic' && insightLevel !== 'pro' && insightLevel !== 'boss') {
      return NextResponse.json({ blocked: true, tier: vendorProfile.tier || 'free' })
    }

    // Service client: orders is RLS-scoped to the buyer; the vendor filter on
    // every query keeps the read to this vendor's own customers (the same
    // pattern the vendor orders route uses for the order-card chip).
    const serviceClient = createServiceClient()

    const [{ data: fulfilledRows }, { data: favoriteRows }] = await Promise.all([
      observed(serviceClient
        .from('order_items')
        .select('order_id, pickup_date, pickup_confirmed_at, order:orders!inner(buyer_user_id)')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'fulfilled'), { table: 'order_items' }),
      observed(serviceClient
        .from('vendor_favorites')
        .select('user_id')
        .eq('vendor_profile_id', vendorProfile.id), { table: 'vendor_favorites' }),
    ])

    // Collapse item rows → one entry per (buyer, order), earliest day wins —
    // dedupeOrders keyed on buyer id in the vendor slot (one vendor here).
    type FulfilledRow = {
      order_id: string
      pickup_date: string | null
      pickup_confirmed_at: string | null
      order: { buyer_user_id: string } | { buyer_user_id: string }[] | null
    }
    const dedupInput: Array<{ order_id: string; vendor_profile_id: string; market_id: string | null; day: string | null }> = []
    for (const row of (fulfilledRows || []) as unknown as FulfilledRow[]) {
      const o = Array.isArray(row.order) ? row.order[0] : row.order
      const buyerId = o?.buyer_user_id
      if (!buyerId) continue
      dedupInput.push({
        order_id: row.order_id,
        vendor_profile_id: buyerId, // buyer in the group slot — grouping key
        market_id: null,
        day: toDay(row.pickup_date) ?? toDay(row.pickup_confirmed_at),
      })
    }
    const orders = dedupeOrders(dedupInput)

    const byBuyer = new Map<string, { count: number; days: string[]; lastDay: string }>()
    for (const o of orders) {
      const entry = byBuyer.get(o.vendorProfileId)
      if (entry) {
        entry.count += 1
        entry.days.push(o.day)
        if (o.day > entry.lastDay) entry.lastDay = o.day
      } else {
        byBuyer.set(o.vendorProfileId, { count: 1, days: [o.day], lastDay: o.day })
      }
    }

    const favoriteIds = new Set((favoriteRows || []).map(r => r.user_id as string))

    // Names: display_name only — the same source the order card shows.
    const nameIds = [...new Set([...byBuyer.keys()])]
    const names = new Map<string, string>()
    if (nameIds.length > 0) {
      const { data: profiles } = await observed(serviceClient
        .from('user_profiles')
        .select('user_id, display_name')
        .in('user_id', nameIds), { table: 'user_profiles' })
      for (const p of profiles || []) {
        names.set(p.user_id as string, (p.display_name as string | null) || 'Customer')
      }
    }

    const distribution: Record<Exclude<CustomerSegment, 'new'>, number> = {
      one_timer: 0,
      repeat: 0,
      regular: 0,
      loyal: 0,
    }
    const rows: Array<{
      user_id: string
      name: string
      orders: number
      segment: CustomerSegment
      last_order_day: string
      is_favorite: boolean
    }> = []
    for (const [buyerId, s] of byBuyer) {
      const segment = classifyCustomer(s.count, s.days)
      if (segment !== 'new') distribution[segment as Exclude<CustomerSegment, 'new'>] += 1
      rows.push({
        user_id: buyerId,
        name: names.get(buyerId) || 'Customer',
        orders: s.count,
        segment,
        last_order_day: s.lastDay,
        is_favorite: favoriteIds.has(buyerId),
      })
    }
    rows.sort((a, b) =>
      SEGMENT_RANK[b.segment] - SEGMENT_RANK[a.segment]
      || b.orders - a.orders
      || a.name.localeCompare(b.name)
    )

    return NextResponse.json({
      tier: vendorProfile.tier || 'free',
      distribution,
      totals: {
        customers: byBuyer.size,
        favorites: favoriteIds.size,
      },
      rows: rows.slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    })
  })
}
