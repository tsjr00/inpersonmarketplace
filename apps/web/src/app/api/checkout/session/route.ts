import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateFees, createCheckoutSession } from '@/lib/stripe/payments'
import { STRIPE_CONFIG } from '@/lib/stripe/config'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface CartItem {
  listingId: string
  quantity: number
  marketId?: string
}

interface Listing {
  id: string
  title: string
  description: string | null
  price_cents: number
  vertical_id: string
  vendor_profile_id: string
}

interface CartItemFromDB {
  id: string
  listing_id: string
  quantity: number
  market_id: string | null
  markets: { id: string; name: string; market_type: string; city: string; state: string } | null
}

export async function POST(request: NextRequest) {
  // Rate limit checkout requests - stricter limit to prevent abuse
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`checkout:${clientIp}`, { limit: 5, windowSeconds: 60 })

  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  return withErrorTracing('/api/checkout/session', 'POST', async () => {
    const supabase = await createClient()
    const { items, vertical } = await request.json() as { items: CartItem[]; vertical?: string }

    crumb.auth('Checking user authentication')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // OPTIMIZATION: Parallel fetch - listings query doesn't depend on cart/vertical
    crumb.supabase('select', 'listings + verticals (parallel)')
    const listingIds = items.map((i) => i.listingId)

    const [listingsResult, verticalResult] = await Promise.all([
      // Fetch listings with vendor info
      supabase
        .from('listings')
        .select(`
          id, title, description, price_cents, vertical_id, vendor_profile_id,
          listing_markets (
            market_id,
            markets (
              id,
              name,
              market_type
            )
          )
        `)
        .in('id', listingIds),
      // Fetch vertical ID (if provided)
      vertical
        ? supabase.from('verticals').select('id').eq('vertical_id', vertical).single()
        : Promise.resolve({ data: null })
    ])

    const listings = listingsResult.data
    const verticalData = verticalResult.data

    if (!listings || listings.length !== items.length) {
      throw traced.validation('ERR_CHECKOUT_001', 'Invalid items in checkout', { expected: items.length, got: listings?.length ?? 0 })
    }

    // Get cart items with market selections (sequential - depends on vertical)
    let cartItemsFromDB: CartItemFromDB[] = []

    if (verticalData) {
      crumb.supabase('rpc', 'get_or_create_cart')
      const { data: cartId } = await supabase
        .rpc('get_or_create_cart', {
          p_user_id: user.id,
          p_vertical_id: verticalData.id
        })

      if (cartId) {
        crumb.supabase('select', 'cart_items')
        const { data: dbItems } = await supabase
          .from('cart_items')
          .select(`
            id,
            listing_id,
            quantity,
            market_id,
            markets!market_id (
              id,
              name,
              market_type,
              city,
              state
            )
          `)
          .eq('cart_id', cartId)

        cartItemsFromDB = (dbItems || []) as unknown as CartItemFromDB[]
      }
    }

    // Build a map of listing -> market from cart items
    const listingMarketMap = new Map<string, { marketId: string; marketName: string; marketType: string }>()
    for (const cartItem of cartItemsFromDB) {
      if (cartItem.market_id && cartItem.markets) {
        listingMarketMap.set(cartItem.listing_id, {
          marketId: cartItem.market_id,
          marketName: cartItem.markets.name,
          marketType: cartItem.markets.market_type
        })
      }
    }

    // Also check items passed in request (fallback for backwards compatibility)
    for (const item of items) {
      if (item.marketId && !listingMarketMap.has(item.listingId)) {
        listingMarketMap.set(item.listingId, {
          marketId: item.marketId,
          marketName: 'Selected Location',
          marketType: 'unknown'
        })
      }
    }

    // Validate that all items have market selections
    crumb.logic('Validating market selections for all items')
    for (const listing of listings) {
      if (!listingMarketMap.has(listing.id)) {
        // Check if listing has available markets
        const listingMarkets = listing.listing_markets as unknown as Array<{
          market_id: string
          markets: { id: string; name: string; market_type: string }
        }> | null

        if (!listingMarkets || listingMarkets.length === 0) {
          throw traced.validation('ERR_CHECKOUT_001', `"${listing.title}" is not available at any pickup locations`)
        }

        // For backwards compatibility, use the first market if not specified
        const market = listingMarkets[0].markets
        listingMarketMap.set(listing.id, {
          marketId: market.id,
          marketName: market.name,
          marketType: market.market_type
        })
      }
    }

    // Collect market info for validation and display
    const selectedMarkets = new Map<string, { name: string; type: string }>()
    for (const [listingId, marketInfo] of listingMarketMap) {
      if (!selectedMarkets.has(marketInfo.marketId)) {
        selectedMarkets.set(marketInfo.marketId, {
          name: marketInfo.marketName,
          type: marketInfo.marketType
        })
      }
    }

    // OPTIMIZATION: Parallel cutoff checks for all listings at once
    crumb.logic('Checking cutoff times for listings (parallel)')
    const cutoffResults = await Promise.all(
      listings.map(listing =>
        supabase
          .rpc('is_listing_accepting_orders', { p_listing_id: listing.id })
          .then(result => ({ listing, ...result }))
      )
    )

    // Check for any closed listings
    for (const { listing, data: isAccepting, error: cutoffError } of cutoffResults) {
      if (cutoffError) {
        console.error('Cutoff check error:', cutoffError)
        // Continue if function doesn't exist yet (migration not applied)
      } else if (isAccepting === false) {
        // Get detailed availability info for better error message (only for the failed one)
        const { data: availability } = await supabase
          .rpc('get_listing_market_availability', { p_listing_id: listing.id })

        const closedMarket = (availability as Array<{ market_name: string; next_market_at: string; is_accepting: boolean; market_type: string }> | null)
          ?.find(m => !m.is_accepting)

        const prepMessage = closedMarket?.market_type === 'private_pickup'
          ? 'Vendor needs time to prepare for pickup.'
          : 'Vendors need time to prepare for market day.'

        const marketInfo = closedMarket?.next_market_at
          ? ` for ${closedMarket.market_name} on ${new Date(closedMarket.next_market_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
          : ''

        throw traced.validation('ERR_CHECKOUT_001', `Orders for "${listing.title}" are now closed${marketInfo}. ${prepMessage}`, { code: 'CUTOFF_PASSED' })
      }
    }

    // Calculate totals
    crumb.logic('Calculating order totals and fees')
    let subtotalCents = 0
    let buyerFeeCents = 0
    let platformFeeCents = 0

    const orderItems = items.map((item) => {
      const listing = listings.find((l) => l.id === item.listingId) as Listing
      const itemSubtotal = listing.price_cents * item.quantity
      const fees = calculateFees(itemSubtotal)

      subtotalCents += fees.basePriceCents
      buyerFeeCents += fees.buyerFeeCents
      platformFeeCents += fees.platformFeeCents

      // Get the market_id from the cart selection
      const marketInfo = listingMarketMap.get(listing.id)

      return {
        listing_id: listing.id,
        vendor_profile_id: listing.vendor_profile_id,
        quantity: item.quantity,
        unit_price_cents: listing.price_cents,
        subtotal_cents: fees.basePriceCents,
        platform_fee_cents: fees.platformFeeCents,
        vendor_payout_cents: fees.vendorGetsCents,
        market_id: marketInfo?.marketId || null,
      }
    })

    // Enforce minimum order total (before fees)
    if (subtotalCents < STRIPE_CONFIG.minimumOrderCents) {
      const remaining = ((STRIPE_CONFIG.minimumOrderCents - subtotalCents) / 100).toFixed(2)
      throw traced.validation('ERR_CHECKOUT_001', `Minimum order is $${(STRIPE_CONFIG.minimumOrderCents / 100).toFixed(2)}. Add $${remaining} more to your cart.`, { code: 'BELOW_MINIMUM' })
    }

    // Buyer pays: base price + buyer fee only (vendor fee is deducted from vendor payout)
    const totalCents = subtotalCents + buyerFeeCents

    // Calculate pickup dates for each order item
    crumb.logic('Calculating pickup dates for order items')
    const pickupDatePromises = orderItems.map(async (item) => {
      if (!item.market_id) return { ...item, pickup_date: null }

      const { data: pickupDate, error } = await supabase.rpc('get_vendor_next_pickup_date', {
        p_vendor_profile_id: item.vendor_profile_id,
        p_market_id: item.market_id
      })

      if (error) {
        // Log but don't fail - pickup date is nice-to-have
        console.warn('[checkout] Could not calculate pickup date:', error)
        return { ...item, pickup_date: null }
      }

      return { ...item, pickup_date: pickupDate }
    })

    const orderItemsWithPickupDates = await Promise.all(pickupDatePromises)

    // Create order record
    crumb.supabase('insert', 'orders')
    const orderNumber = `FW-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_user_id: user.id,
        vertical_id: (listings[0] as Listing).vertical_id,
        order_number: orderNumber,
        status: 'pending',
        subtotal_cents: subtotalCents,
        platform_fee_cents: platformFeeCents,
        total_cents: totalCents,
      })
      .select()
      .single()

    if (orderError) throw traced.fromSupabase(orderError, { table: 'orders', operation: 'insert' })

    // Create order items with pickup dates
    crumb.supabase('insert', 'order_items')
    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItemsWithPickupDates.map((item) => ({
        ...item,
        order_id: order.id,
      }))
    )

    if (itemsError) throw traced.fromSupabase(itemsError, { table: 'order_items', operation: 'insert' })

    // Create Stripe checkout session
    crumb.logic('Creating Stripe checkout session')
    const baseUrl = request.nextUrl.origin
    const verticalPrefix = vertical ? `/${vertical}` : ''
    const successUrl = `${baseUrl}${verticalPrefix}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}${verticalPrefix}/checkout`

    const checkoutItems = listings.map((listing) => {
      const item = items.find((i) => i.listingId === listing.id)!
      const fees = calculateFees(listing.price_cents)

      return {
        name: listing.title,
        description: listing.description || '',
        amount: fees.buyerPaysCents,
        quantity: item.quantity,
      }
    })

    const session = await createCheckoutSession({
      orderId: order.id,
      orderNumber: order.order_number,
      items: checkoutItems,
      successUrl,
      cancelUrl,
    })

    if (!session) {
      throw traced.external('ERR_CHECKOUT_002', 'Stripe checkout session creation failed')
    }

    // Save session ID
    crumb.supabase('update', 'orders')
    await supabase
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', order.id)

    return NextResponse.json({ sessionId: session.id, url: session.url })
  })
}
