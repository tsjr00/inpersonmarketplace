import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { bundleDisplayPriceCents, bundleOrderingOpen, BUNDLE_LIMITS } from '@/lib/bundles/core'
import { componentIsLive, vendorDisplayName } from '@/lib/bundles/public'
import { todayInTimezone, DEFAULT_TIMEZONE } from '@/lib/time/market-dates'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/bundles/[bundleId] — public bundle detail for the checkout page
 * (mig 244). ACTIVE bundles only; returns live component prices so the page
 * shows exactly what checkout will charge (bundleDisplayPriceCents is the
 * same function the Stripe line uses — the page/Stripe agreement is by
 * construction). Availability mirrors the checkout expansion gates so the
 * buy button and the server can't disagree: quantity remaining, ordering
 * window, components published, vendors opted in.
 *
 * Service client: market_bundles is RLS-no-policies (service-only); this
 * endpoint exposes only active bundles' display fields — the same data the
 * market page renders publicly.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bundleId: string }> }
) {
  return withErrorTracing('/api/bundles/[bundleId]', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`bundle-detail:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const { bundleId } = await params
    const serviceClient = createServiceClient()

    const { data: bundle } = await observed(serviceClient
      .from('market_bundles')
      .select('id, market_id, name, description, margin_cents, quantity_limit, quantity_sold, status, pickup_market_date, pickup_notes, cause_beneficiary_id, cause_pct, market_bundle_components (listing_id, quantity)')
      .eq('id', bundleId)
      .maybeSingle(), { table: 'market_bundles' })
    if (!bundle || bundle.status !== 'active') {
      return NextResponse.json({ error: 'Bundle not available' }, { status: 404 })
    }

    const { data: market } = await observed(serviceClient
      .from('markets')
      .select('id, name, vertical_id, timezone, city, state')
      .eq('id', bundle.market_id)
      .maybeSingle(), { table: 'markets' })
    if (!market) return NextResponse.json({ error: 'Bundle not available' }, { status: 404 })

    const components = (bundle.market_bundle_components ?? []) as Array<{ listing_id: string; quantity: number }>
    const { data: listings } = await observed(serviceClient
      .from('listings')
      .select('id, title, price_cents, quantity, status, deleted_at, vendor_profile_id, vendor_profiles (bundles_opt_out, profile_data)')
      .in('id', components.map(c => c.listing_id)), { table: 'listings' })
    const byId = new Map((listings ?? []).map(l => [l.id as string, l]))

    // Availability mirrors checkout via the ONE shared display-side check.
    let componentSumCents = 0
    let allAvailable = components.length > 0
    const componentView = components.map(c => {
      const l = byId.get(c.listing_id) as Parameters<typeof componentIsLive>[0]
      if (!componentIsLive(l, c.quantity)) allAvailable = false
      const priceCents = (l?.price_cents as number) ?? 0
      componentSumCents += priceCents * c.quantity
      return {
        listingId: c.listing_id,
        quantity: c.quantity,
        title: (l?.title as string) || 'Item',
        priceCents,
        vendorProfileId: (l?.vendor_profile_id as string) || null,
        vendorName: vendorDisplayName(l),
      }
    })

    const remaining = Math.max(0, (bundle.quantity_limit as number) - (bundle.quantity_sold as number))
    const orderingOpen = bundle.pickup_market_date
      ? bundleOrderingOpen(todayInTimezone((market.timezone as string) || DEFAULT_TIMEZONE), bundle.pickup_market_date as string)
      : false

    let causeName: string | null = null
    if (bundle.cause_beneficiary_id) {
      const { data: beneficiary } = await observed(serviceClient
        .from('cause_beneficiaries')
        .select('id, name')
        .eq('id', bundle.cause_beneficiary_id)
        .maybeSingle(), { table: 'cause_beneficiaries' })
      causeName = (beneficiary?.name as string) || null
    }

    return NextResponse.json({
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      market: { id: market.id, name: market.name, vertical: market.vertical_id, city: market.city, state: market.state },
      pickupMarketDate: bundle.pickup_market_date,
      pickupNotes: bundle.pickup_notes,
      components: componentView,
      componentSumCents,
      marginCents: bundle.margin_cents,
      displayPriceCents: bundleDisplayPriceCents(componentSumCents, bundle.margin_cents as number),
      remaining,
      quantityLimit: bundle.quantity_limit,
      available: allAvailable && remaining > 0 && orderingOpen,
      orderingOpen,
      assemblyBufferDays: BUNDLE_LIMITS.assemblyBufferDays,
      cause: causeName && bundle.cause_pct ? { name: causeName, pct: bundle.cause_pct } : null,
    })
  })
}
