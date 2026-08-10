import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
// Availability checked via get_listings_accepting_status() RPC (single SQL source of truth)

interface CartItem {
  listingId: string
  quantity: number
}

// GET: Validate market compatibility
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/cart/validate', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`cart-validate-get:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // S1-7: scope to the requested vertical's cart. RLS scopes cart_items to the
    // user, but a user holds ONE cart PER vertical — without this an FM cart and
    // an FT cart merge into one marketTypes set and cross-block BOTH checkouts
    // ("different pickup types"). Resolve the vertical's cart id first.
    const vertical = request.nextUrl.searchParams.get('vertical')
    let scopedCartId: string | null = null
    if (vertical) {
      const { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', vertical)
        .maybeSingle()
      if (!cart) {
        // No cart for this vertical yet — nothing to validate.
        return NextResponse.json({ valid: true, warnings: [], marketType: null, marketIds: [] })
      }
      scopedCartId = cart.id
    }

    // Get user's cart with market info (S1-6: market_id added so we validate
    // against the buyer's chosen market, not listing_markets[0]).
    let cartQuery = supabase
      .from('cart_items')
      .select(`
        id,
        quantity,
        listing_id,
        market_id,
        listings (
          id,
          title,
          price_cents,
          listing_markets (
            market_id,
            markets (
              id,
              name,
              market_type
            )
          )
        )
      `)
    if (scopedCartId) cartQuery = cartQuery.eq('cart_id', scopedCartId)
    const { data: cartItems, error: cartError } = await cartQuery
    // Ownership is enforced by RLS (cart_items.cart_id -> carts.user_id); the
    // prior .eq('user_id', ...) referenced a non-existent column, which errored
    // and was silently discarded -> validation always passed (fail-open).
    // Fail CLOSED on a real query error so checkout can't proceed unvalidated.
    if (cartError) {
      return NextResponse.json({ valid: false, warnings: ["We couldn't validate your cart. Please refresh and try again."], marketType: null, marketIds: [] })
    }

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({
        valid: true,
        warnings: [],
        marketType: null,
        marketIds: []
      })
    }

    const warnings: string[] = []
    const marketTypes = new Set<string>()
    const marketIds = new Set<string>()

    // Track cutoff info
    const cutoffWarnings: string[] = []

    // First pass: collect market info and identify items needing cutoff check
    const itemsForCutoffCheck: Array<{ id: string; title: string; marketType: string }> = []

    for (const item of cartItems) {
      const listing = item.listings as unknown as {
        id: string
        title: string
        listing_markets: Array<{
          market_id: string
          markets: { id: string; name: string; market_type: string }
        }>
      } | null

      if (!listing || !listing.listing_markets || listing.listing_markets.length === 0) {
        warnings.push(`"${listing?.title || 'Unknown item'}" is not available at any markets`)
        continue
      }

      // S1-6: validate against the market the buyer actually chose for this cart
      // item (cart_items.market_id), not an arbitrary listing_markets[0]. A
      // listing attached to multiple markets (e.g. traditional + event) would
      // otherwise false-pass/false-block the mixed-type and same-market checks.
      // Fall back to the first market when market_id is null (legacy rows).
      const chosenMarket = (item.market_id
        ? listing.listing_markets.find(lm => lm.market_id === item.market_id)?.markets
        : undefined) || listing.listing_markets[0].markets
      marketTypes.add(chosenMarket.market_type)
      marketIds.add(chosenMarket.id)

      // Check cutoff for ALL market types (traditional and private pickup)
      itemsForCutoffCheck.push({ id: listing.id, title: listing.title, marketType: chosenMarket.market_type })
    }

    // Check availability via SQL source of truth (handles vendor attendance, timezone, cutoffs)
    if (itemsForCutoffCheck.length > 0) {
      const listingIds = itemsForCutoffCheck.map(i => i.id)
      const { data: availData } = await supabase.rpc('get_listings_accepting_status', {
        p_listing_ids: listingIds
      })
      const availMap = new Map((availData || []).map((a: { listing_id: string; is_accepting: boolean }) => [a.listing_id, a]))

      for (const item of itemsForCutoffCheck) {
        const avail = availMap.get(item.id) as { is_accepting: boolean } | undefined
        if (avail && !avail.is_accepting) {
          const prepMessage = item.marketType === 'private_pickup'
            ? 'Vendor needs time to prepare for pickup'
            : 'Vendors are preparing for market day'
          cutoffWarnings.push(`Orders for "${item.title}" are closed - ${prepMessage}`)
        }
      }
    }

    // Validation checks
    let valid = warnings.length === 0

    // ONE RULE: an event may not share a cart with any other market. Everything
    // else combines freely — two traditional markets, or a market plus a
    // vendor's private pickup. (Owner, 2026-08-09.)
    //
    // Per-item pickup is built for this: order_items carries its own market_id,
    // schedule_id and pickup_date; the checkout page makes the buyer acknowledge
    // each location BY NAME (useCart hasMultiplePickupLocations -> the
    // multi-location notice) and CheckoutPickupGroup shows vendor/time/place per
    // group. That acknowledgment IS the gate for multi-location carts.
    //
    // Events are isolated because api/events/[token]/cancel:212 refunds the WHOLE
    // payment intent — one order holding two events would refund both. The same
    // rule is enforced earlier and harder at add-to-cart (cart/items ERR_CART_010);
    // this is the pre-checkout backstop for a cart assembled before that guard.
    //
    // HISTORY — do not "restore" the old checks. Until 2026-07-20 this block also
    // refused two traditional markets and any mixed pickup types: a day-eleven
    // assumption (c585da5c, 2026-01-14) that sat inert behind a fail-open bug,
    // then began firing when S1-6 taught the validator to read the buyer's chosen
    // market — silently killing the multi-location checkout built ten days after
    // it (bb865e30, 2026-01-24).
    const marketType = marketTypes.size === 1 ? Array.from(marketTypes)[0] : null

    if (marketTypes.has('event') && marketIds.size > 1) {
      warnings.push('Event items must be ordered on their own. Please check out your event items separately.')
      valid = false
    }

    // Add cutoff warnings (these make checkout invalid)
    if (cutoffWarnings.length > 0) {
      warnings.push(...cutoffWarnings)
      valid = false
    }

    return NextResponse.json({
      valid,
      warnings,
      marketType,
      marketIds: Array.from(marketIds),
      itemCount: cartItems.length,
      hasCutoffIssues: cutoffWarnings.length > 0
    })
  })
}

// POST: Validate item availability
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/cart/validate', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`cart-validate-post:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const { items } = await request.json() as { items: CartItem[] }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ items: [] })
      }

      const supabase = await createClient()

      // Fetch all listings at once
      const listingIds = items.map(item => item.listingId)
      const { data: listings, error } = await supabase
        .from('listings')
        .select(`
          id,
          title,
          price_cents,
          quantity,
          status,
          advance_order_days,
          vendor_profiles (
            id,
            profile_data,
            status
          )
        `)
        .in('id', listingIds)
        .eq('status', 'published')
        .is('deleted_at', null)

      if (error) {
        return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
      }

      // Batch availability check via SQL source of truth (handles vendor attendance, timezone, cutoffs)
      const { data: availData } = await supabase.rpc('get_listings_accepting_status', {
        p_listing_ids: listingIds
      })
      const availMap = new Map((availData || []).map((a: { listing_id: string; is_accepting: boolean }) => [a.listing_id, a]))

      // Build response with availability info
      const validatedItems = items.map((cartItem) => {
        const listing = listings?.find(l => l.id === cartItem.listingId)

        if (!listing) {
          return {
            listingId: cartItem.listingId,
            quantity: cartItem.quantity,
            title: 'Unknown Item',
            price_cents: 0,
            vendor_name: 'Unknown',
            available: false,
            available_quantity: 0,
            cutoff_passed: false,
          }
        }

        const vendorProfile = listing.vendor_profiles as unknown as Record<string, unknown> | null
        const vendorData = vendorProfile?.profile_data as Record<string, unknown> | null
        const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
        const isVendorApproved = vendorProfile?.status === 'approved'

        const avail = availMap.get(listing.id) as { is_accepting: boolean } | undefined
        const cutoffPassed = avail ? !avail.is_accepting : false

        // Check availability
        const availableQty = listing.quantity === null ? 999 : listing.quantity
        const isAvailable = isVendorApproved && availableQty >= cartItem.quantity && !cutoffPassed

        return {
          listingId: cartItem.listingId,
          quantity: cartItem.quantity,
          title: listing.title,
          price_cents: listing.price_cents,
          vendor_name: vendorName,
          vendor_profile_id: vendorProfile?.id as string | undefined,
          available: isAvailable,
          available_quantity: listing.quantity,
          cutoff_passed: cutoffPassed,
          advance_order_days: listing.advance_order_days || 0,
        }
      })

      return NextResponse.json({ items: validatedItems })
    } catch {
      return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
    }
  })
}
