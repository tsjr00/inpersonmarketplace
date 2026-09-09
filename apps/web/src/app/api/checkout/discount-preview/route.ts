import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, observed } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { computeCartDiscounts } from '@/lib/loyalty/offers-checkout'
import { computeCheckoutTax } from '@/lib/tax/checkout-tax'

/**
 * POST /api/checkout/discount-preview  { vertical, items: [{listingId, quantity, marketId?}] }
 *
 * The checkout PAGE's mirror of the VIP perk discounts the session route will
 * apply — SAME function (`computeCartDiscounts`), so the page total and the
 * Stripe total cannot disagree (display-price-integrity pair; the P-2 class
 * bug is exactly a page rendering a different total than Stripe charges).
 * Display-only: the session route re-computes authoritatively at checkout.
 *
 * Tax Batch 2: the response also mirrors the sales-tax line via the SAME
 * engine the session route uses (`computeCheckoutTax` — flag-gated, 0 while
 * TAX_STREAM1_ENABLED is false). `tax_total_cents` is null when tax could not
 * be computed (a market not tax-ready) — the page hides the line and the
 * session route is the one that refuses loudly.
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/checkout/discount-preview', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`discount-preview:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const vertical = typeof body.vertical === 'string' ? body.vertical : null
    const items = Array.isArray(body.items) ? body.items as Array<{ listingId?: string; quantity?: number; marketId?: string }> : []
    if (!vertical || items.length === 0) {
      return NextResponse.json({ discounts: [], total_cents: 0, tax_total_cents: 0 })
    }

    const listingIds = [...new Set(items.map((i) => i.listingId).filter((id): id is string => typeof id === 'string'))]
    if (listingIds.length === 0) {
      return NextResponse.json({ discounts: [], total_cents: 0, tax_total_cents: 0 })
    }

    const serviceClient = createServiceClient()
    const { data: listings } = await observed(serviceClient
      .from('listings')
      .select('id, price_cents, vendor_profile_id')
      .in('id', listingIds)
      .eq('status', 'published')
      .is('deleted_at', null), { table: 'listings' })
    const listingById = new Map((listings ?? []).map((l) => [l.id as string, l]))

    const cartItems = items
      .map((item, index) => {
        const l = item.listingId ? listingById.get(item.listingId) : undefined
        if (!l) return null
        const qty = Math.max(1, Math.round(item.quantity ?? 1))
        return {
          index,
          listingId: l.id as string,
          vendorProfileId: l.vendor_profile_id as string,
          subtotalCents: ((l.price_cents as number) || 0) * qty,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const result = await computeCartDiscounts(serviceClient, user.id, cartItems, vertical)

    // Tax mirror — runs on the NET (post-discount) subtotals, exactly the
    // inputs the session route hands the same engine. Display-only: any
    // failure here degrades to a hidden line, never a broken checkout page.
    let taxTotalCents: number | null = 0
    try {
      const taxResult = await computeCheckoutTax(
        serviceClient,
        cartItems.map((c) => {
          const requested = items[c.index]
          return {
            ref: String(c.index),
            listingId: c.listingId,
            marketId: typeof requested?.marketId === 'string' ? requested.marketId : null,
            netSubtotalCents: c.subtotalCents - (result.byIndex.get(c.index)?.cents ?? 0),
          }
        })
      )
      taxTotalCents = !taxResult.enabled
        ? 0
        : taxResult.ok ? taxResult.totalTaxCents : null
    } catch {
      taxTotalCents = null
    }

    return NextResponse.json({
      discounts: cartItems
        .filter((c) => result.byIndex.has(c.index))
        .map((c) => ({ listing_id: c.listingId, cents: result.byIndex.get(c.index)!.cents })),
      total_cents: result.totalCents,
      tax_total_cents: taxTotalCents,
    })
  })
}
