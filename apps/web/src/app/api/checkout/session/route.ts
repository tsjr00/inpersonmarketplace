import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/lib/stripe/payments'
import { stripe } from '@/lib/stripe/config'
import { calculateOrderPricing, FEES } from '@/lib/pricing'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { restoreOrderInventory } from '@/lib/inventory'
import { randomUUID } from 'crypto'

interface CartItem {
  listingId: string
  quantity: number
  marketId?: string
  scheduleId?: string
  pickupDate?: string
}

interface MarketBoxCheckoutItem {
  offeringId: string
  termWeeks: number
  startDate?: string
  priceCents: number
}

interface Listing {
  id: string
  title: string
  description: string | null
  price_cents: number
  vertical_id: string
  vendor_profile_id: string
  listing_markets?: Array<{
    market_id: string
    markets: { id: string; name: string; market_type: string }
  }>
}

interface CartItemFromDB {
  id: string
  listing_id: string
  quantity: number
  market_id: string | null
  schedule_id: string | null
  pickup_date: string | null
  preferred_pickup_time: string | null
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
    const { items, marketBoxItems, vertical, tipAmountCents = 0, tipPercentage = 0 } = await request.json() as {
      items: CartItem[]
      marketBoxItems?: MarketBoxCheckoutItem[]
      vertical?: string
      tipAmountCents?: number
      tipPercentage?: number
    }
    const hasMarketBoxes = marketBoxItems && marketBoxItems.length > 0

    // Validate tip
    const validTipAmount = Math.max(0, Math.round(tipAmountCents as number))
    const validTipPercentage = Math.max(0, Math.round(tipPercentage as number))

    crumb.auth('Checking user authentication')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // ============================================================
    // EXPIRED ORDER CLEANUP
    // Cancel pending Stripe orders older than 10 minutes where
    // payment was never completed. Restores inventory.
    // ============================================================
    const serviceClient = createServiceClient()
    crumb.logic('Cleaning up expired pending orders')
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const { data: expiredPendingOrders } = await serviceClient
      .from('orders')
      .select('id')
      .eq('buyer_user_id', user.id)
      .eq('status', 'pending')
      .lte('created_at', tenMinutesAgo)
      .not('stripe_checkout_session_id', 'is', null) // Only Stripe orders (not external)

    if (expiredPendingOrders && expiredPendingOrders.length > 0) {
      for (const expired of expiredPendingOrders) {
        // Restore inventory for expired order
        await restoreOrderInventory(serviceClient, expired.id)
        // Cancel the order and its items
        await serviceClient
          .from('order_items')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: 'system',
            cancellation_reason: 'Payment not completed within 10 minutes'
          })
          .eq('order_id', expired.id)
          .is('cancelled_at', null)
        await serviceClient
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', expired.id)
      }
      crumb.logic(`Cleaned up ${expiredPendingOrders.length} expired pending order(s)`)
    }

    // ============================================================
    // DUPLICATE ORDER PREVENTION
    // Check for existing pending orders with matching items/quantities
    // before creating a new one. This handles users pressing "back"
    // from Stripe and trying to checkout again.
    // ============================================================
    crumb.logic('Checking for existing pending orders')
    const tenMinFromNow = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    const { data: pendingOrders } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        stripe_checkout_session_id,
        created_at,
        order_items (
          listing_id,
          quantity,
          schedule_id,
          pickup_date
        )
      `)
      .eq('buyer_user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', tenMinFromNow)
      .order('created_at', { ascending: false })

    if (pendingOrders && pendingOrders.length > 0) {
      // Check if any pending order matches current cart items and quantities
      for (const pendingOrder of pendingOrders) {
        const pendingItems = pendingOrder.order_items as Array<{
          listing_id: string
          quantity: number
          schedule_id: string | null
          pickup_date: string | null
        }>

        // Sort both arrays for comparison
        const sortedPending = [...pendingItems].sort((a, b) =>
          `${a.listing_id}|${a.schedule_id}|${a.pickup_date}`.localeCompare(
            `${b.listing_id}|${b.schedule_id}|${b.pickup_date}`
          )
        )
        const sortedCurrent = [...items].sort((a, b) =>
          `${a.listingId}|${a.scheduleId}|${a.pickupDate}`.localeCompare(
            `${b.listingId}|${b.scheduleId}|${b.pickupDate}`
          )
        )

        // Check if items match (same listing, schedule, pickup date, and quantity)
        const itemsMatch = sortedPending.length === sortedCurrent.length &&
          sortedPending.every((pending, idx) => {
            const current = sortedCurrent[idx]
            return pending.listing_id === current.listingId &&
                   pending.quantity === current.quantity &&
                   (pending.schedule_id || null) === (current.scheduleId || null) &&
                   (pending.pickup_date || null) === (current.pickupDate || null)
          })

        if (itemsMatch && pendingOrder.stripe_checkout_session_id) {
          crumb.logic('Found matching pending order, checking Stripe session')

          // Verify the Stripe session is still valid
          try {
            const existingSession = await stripe.checkout.sessions.retrieve(
              pendingOrder.stripe_checkout_session_id
            )

            if (existingSession.status === 'open') {
              // Reuse existing session - prevents duplicate orders
              crumb.logic('Reusing existing Stripe session')
              return NextResponse.json({
                sessionId: existingSession.id,
                url: existingSession.url,
                reused: true
              })
            }
          } catch {
            // Session expired or invalid, continue to create new order
            crumb.logic('Existing Stripe session expired, creating new order')
          }
        }
      }
    }

    // OPTIMIZATION: Parallel fetch - listings query doesn't depend on cart/vertical
    crumb.supabase('select', 'listings + verticals (parallel)')
    const listingIds = items.map((i) => i.listingId)

    const [listingsResult, verticalResult, marketBoxOfferingsResult] = await Promise.all([
      // Fetch listings with vendor info (skip if no listing items)
      listingIds.length > 0
        ? supabase
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
            .in('id', listingIds)
        : Promise.resolve({ data: [] as Listing[], error: null }),
      // Fetch vertical ID (if provided)
      vertical
        ? supabase.from('verticals').select('id').eq('vertical_id', vertical).single()
        : Promise.resolve({ data: null }),
      // Fetch market box offerings (if any)
      hasMarketBoxes
        ? supabase
            .from('market_box_offerings')
            .select('id, name, description, price_4week_cents, price_8week_cents, vendor_profile_id, vertical_id, pickup_market_id, active')
            .in('id', marketBoxItems!.map(i => i.offeringId))
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; description: string | null; price_4week_cents: number; price_8week_cents: number | null; vendor_profile_id: string; vertical_id: string; pickup_market_id: string | null; active: boolean }>, error: null })
    ])

    const listings = listingsResult.data || []
    const verticalData = verticalResult.data
    const marketBoxOfferings = marketBoxOfferingsResult.data || []

    if (listingIds.length > 0 && listings.length !== items.length) {
      throw traced.validation('ERR_CHECKOUT_001', 'Invalid items in checkout', { expected: items.length, got: listings.length })
    }

    // Validate market box offerings
    if (hasMarketBoxes) {
      for (const mbItem of marketBoxItems!) {
        const offering = marketBoxOfferings.find(o => o.id === mbItem.offeringId)
        if (!offering) {
          throw traced.validation('ERR_CHECKOUT_001', 'Market box offering not found')
        }
        if (!offering.active) {
          throw traced.validation('ERR_CHECKOUT_001', `Market box "${offering.name}" is no longer available`)
        }
      }
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
            schedule_id,
            pickup_date,
            preferred_pickup_time,
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

    // Build a map of cart item key -> pickup info
    // Key is listing_id + schedule_id + pickup_date to handle same item for different dates
    interface PickupInfo {
      marketId: string
      marketName: string
      marketType: string
      scheduleId: string | null
      pickupDate: string | null
      preferredPickupTime: string | null
    }
    const cartItemPickupMap = new Map<string, PickupInfo>()
    for (const cartItem of cartItemsFromDB) {
      if (cartItem.market_id && cartItem.markets) {
        const key = `${cartItem.listing_id}|${cartItem.schedule_id || ''}|${cartItem.pickup_date || ''}`
        cartItemPickupMap.set(key, {
          marketId: cartItem.market_id,
          marketName: cartItem.markets.name,
          marketType: cartItem.markets.market_type,
          scheduleId: cartItem.schedule_id,
          pickupDate: cartItem.pickup_date,
          preferredPickupTime: cartItem.preferred_pickup_time
        })
      }
    }

    // Also build a simple listing -> market map for backwards compatibility
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

    // Also check items passed in request
    for (const item of items) {
      const key = `${item.listingId}|${item.scheduleId || ''}|${item.pickupDate || ''}`
      if (item.marketId && !cartItemPickupMap.has(key)) {
        cartItemPickupMap.set(key, {
          marketId: item.marketId,
          marketName: 'Selected Location',
          marketType: 'unknown',
          scheduleId: item.scheduleId || null,
          pickupDate: item.pickupDate || null,
          preferredPickupTime: null
        })
      }
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

    // OPTIMIZATION: Parallel cutoff + inventory checks for all listings at once
    crumb.logic('Checking cutoff times and inventory for listings (parallel)')
    const cutoffResults = await Promise.all(
      listings.map(listing => {
        const requestedItem = items.find(i => i.listingId === listing.id)
        return supabase
          .rpc('is_listing_accepting_orders', { p_listing_id: listing.id })
          .then(result => ({ listing, requestedQuantity: requestedItem?.quantity || 0, ...result }))
      })
    )

    // Also fetch current inventory for all listings (single batch query)
    crumb.supabase('select', 'listings (inventory check)')
    const { data: inventoryData } = await supabase
      .from('listings')
      .select('id, quantity')
      .in('id', listingIds)

    const inventoryMap = new Map<string, number | null>()
    for (const inv of inventoryData || []) {
      inventoryMap.set(inv.id, inv.quantity)
    }

    // Check for inventory issues
    for (const item of items) {
      const currentQuantity = inventoryMap.get(item.listingId)
      const listing = listings.find(l => l.id === item.listingId)
      // null = unlimited stock, skip check
      if (currentQuantity !== null && currentQuantity !== undefined && currentQuantity < item.quantity) {
        const itemName = listing?.title || 'Item'
        if (currentQuantity === 0) {
          throw traced.validation('ERR_CHECKOUT_001', `"${itemName}" is now out of stock.`, { code: 'OUT_OF_STOCK' })
        }
        throw traced.validation('ERR_CHECKOUT_001', `Only ${currentQuantity} of "${itemName}" available (you requested ${item.quantity}).`, { code: 'INSUFFICIENT_STOCK' })
      }
    }

    // Check for any closed listings
    for (const { listing, data: isAccepting, error: cutoffError } of cutoffResults) {
      if (cutoffError) {
        crumb.logic('Cutoff check unavailable (migration may not be applied)')
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

    // Calculate totals using unified pricing module
    crumb.logic('Calculating order totals and fees')

    // Build items for pricing calculation (listings + market boxes)
    const pricingItems = items.map((item) => {
      const listing = listings.find((l) => l.id === item.listingId) as Listing
      return { price_cents: listing.price_cents, quantity: item.quantity }
    })

    // Add market box items to pricing
    if (hasMarketBoxes) {
      for (const mbItem of marketBoxItems!) {
        const offering = marketBoxOfferings.find(o => o.id === mbItem.offeringId)!
        const termPrice = mbItem.termWeeks === 8
          ? (offering.price_8week_cents || offering.price_4week_cents)
          : offering.price_4week_cents
        pricingItems.push({ price_cents: termPrice, quantity: 1 })
      }
    }

    // Calculate order-level pricing (handles flat fee correctly - once per order)
    const orderPricing = calculateOrderPricing(pricingItems)

    // Enforce minimum order total (before fees)
    if (orderPricing.subtotalCents < FEES.minimumOrderCents) {
      const remaining = ((FEES.minimumOrderCents - orderPricing.subtotalCents) / 100).toFixed(2)
      throw traced.validation('ERR_CHECKOUT_001', `Minimum order is $${(FEES.minimumOrderCents / 100).toFixed(2)}. Add $${remaining} more to your cart.`, { code: 'BELOW_MINIMUM' })
    }

    // Build order items with per-item fee breakdown
    // Note: flat fee is at order level, so per-item fees are percentage-only
    const orderItems = items.map((item) => {
      const listing = listings.find((l) => l.id === item.listingId) as Listing
      const itemSubtotal = listing.price_cents * item.quantity

      // Per-item fees (percentage only - flat fee handled at order level)
      const itemPercentFee = Math.round(itemSubtotal * (FEES.buyerFeePercent + FEES.vendorFeePercent) / 100)
      const vendorPercentFee = Math.round(itemSubtotal * FEES.vendorFeePercent / 100)

      // Get the pickup info from request or cart
      const key = `${item.listingId}|${item.scheduleId || ''}|${item.pickupDate || ''}`
      const pickupInfo = cartItemPickupMap.get(key) || listingMarketMap.get(listing.id)

      return {
        listing_id: listing.id,
        vendor_profile_id: listing.vendor_profile_id,
        quantity: item.quantity,
        unit_price_cents: listing.price_cents,
        subtotal_cents: itemSubtotal,
        platform_fee_cents: itemPercentFee,
        vendor_payout_cents: itemSubtotal - vendorPercentFee,
        market_id: pickupInfo?.marketId || null,
        schedule_id: item.scheduleId || ('scheduleId' in (pickupInfo || {}) ? (pickupInfo as PickupInfo).scheduleId : null),
        pickup_date: item.pickupDate || ('pickupDate' in (pickupInfo || {}) ? (pickupInfo as PickupInfo).pickupDate : null),
        preferred_pickup_time: (pickupInfo as PickupInfo)?.preferredPickupTime || null,
      }
    })

    // Use order-level totals from unified pricing (tip is additive on top)
    const subtotalCents = orderPricing.subtotalCents
    const platformFeeCents = orderPricing.platformFeeCents
    const totalCents = orderPricing.buyerTotalCents + validTipAmount

    // Build pickup snapshots for each order item
    crumb.logic('Building pickup snapshots for order items')
    const pickupSnapshotPromises = orderItems.map(async (item) => {
      // Only build snapshot if we have schedule_id and pickup_date
      if (!item.schedule_id || !item.pickup_date) {
        return { ...item, pickup_snapshot: null }
      }

      const { data: snapshot, error } = await supabase.rpc('build_pickup_snapshot', {
        p_schedule_id: item.schedule_id,
        p_pickup_date: item.pickup_date
      })

      if (error) {
        // Log but don't fail - snapshot is important but shouldn't block checkout
        crumb.logic('Could not build pickup snapshot for schedule')
        return { ...item, pickup_snapshot: null }
      }

      // Append preferred_pickup_time to snapshot if present
      const enrichedSnapshot = item.preferred_pickup_time && snapshot
        ? { ...snapshot, preferred_pickup_time: item.preferred_pickup_time }
        : snapshot
      return { ...item, pickup_snapshot: enrichedSnapshot }
    })

    const orderItemsWithSnapshots = await Promise.all(pickupSnapshotPromises)

    // ============================================================
    // STRIPE SESSION FIRST, THEN ORDER
    // Pre-generate order ID and number, create Stripe session first.
    // If Stripe fails, nothing is in our DB (clean failure).
    // If DB insert fails after Stripe, session just expires unused.
    // ============================================================

    // Pre-generate order ID and number
    const orderId = randomUUID()
    const orderNumber = `FW-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`

    // Build Stripe line items
    crumb.logic('Creating Stripe checkout session (before order)')
    const baseUrl = request.nextUrl.origin
    // Resolve vertical_id from listings or market box offerings
    const verticalId = vertical
      || (listings.length > 0 ? (listings[0] as Listing).vertical_id : null)
      || (marketBoxOfferings.length > 0 ? marketBoxOfferings[0].vertical_id : null)

    if (!verticalId) {
      throw traced.validation('ERR_CHECKOUT_001', 'Could not determine vertical for checkout')
    }
    const successUrl = `${baseUrl}/${verticalId}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${baseUrl}/${verticalId}/checkout`

    const checkoutItems: Array<{ name: string; description: string; amount: number; quantity: number }> = []

    for (const listing of listings) {
      const item = items.find((i) => i.listingId === listing.id)!
      const priceWithPercentFee = Math.round(listing.price_cents * (1 + FEES.buyerFeePercent / 100))

      checkoutItems.push({
        name: listing.title,
        description: listing.description || '',
        amount: priceWithPercentFee,
        quantity: item.quantity,
      })
    }

    // Add market box line items
    if (hasMarketBoxes) {
      for (const mbItem of marketBoxItems!) {
        const offering = marketBoxOfferings.find(o => o.id === mbItem.offeringId)!
        const termPrice = mbItem.termWeeks === 8
          ? (offering.price_8week_cents || offering.price_4week_cents)
          : offering.price_4week_cents
        const priceWithPercentFee = Math.round(termPrice * (1 + FEES.buyerFeePercent / 100))

        checkoutItems.push({
          name: `${offering.name} - ${mbItem.termWeeks} Week Market Box`,
          description: `Prepaid ${mbItem.termWeeks}-week subscription`,
          amount: priceWithPercentFee,
          quantity: 1,
        })
      }
    }

    // Add service fee as separate line item (flat fee once per order)
    checkoutItems.push({
      name: 'Service Fee',
      description: 'Platform fee',
      amount: FEES.buyerFlatFeeCents,
      quantity: 1,
    })

    // Add tip as Stripe line item (food trucks)
    if (validTipAmount > 0) {
      checkoutItems.push({
        name: 'Tip',
        description: validTipPercentage > 0 ? `${validTipPercentage}% tip` : 'Tip',
        amount: validTipAmount,
        quantity: 1,
      })
    }

    // Create Stripe session FIRST — if this fails, nothing touches our DB
    const session = await createCheckoutSession({
      orderId,
      orderNumber,
      items: checkoutItems,
      successUrl,
      cancelUrl,
      metadata: hasMarketBoxes ? {
        has_market_boxes: 'true',
        market_box_items: JSON.stringify(marketBoxItems!.map(mb => ({
          offeringId: mb.offeringId,
          termWeeks: mb.termWeeks,
          startDate: mb.startDate,
          priceCents: mb.priceCents,
        }))),
      } : undefined,
    })

    if (!session) {
      throw traced.external('ERR_CHECKOUT_002', 'Stripe checkout session creation failed')
    }

    // Create order record (with session ID already populated — no orphan risk)
    // orders.vertical_id is TEXT referencing verticals.vertical_id (the slug, not the UUID)
    const orderVerticalId = (listings.length > 0 ? (listings[0] as Listing).vertical_id : null)
      || (marketBoxOfferings.length > 0 ? marketBoxOfferings[0].vertical_id : null)
      || vertical

    crumb.supabase('insert', 'orders')
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        buyer_user_id: user.id,
        vertical_id: orderVerticalId!,
        order_number: orderNumber,
        status: 'pending',
        subtotal_cents: subtotalCents,
        platform_fee_cents: platformFeeCents,
        total_cents: totalCents,
        tip_percentage: validTipPercentage,
        tip_amount: validTipAmount,
        stripe_checkout_session_id: session.id,
      })

    if (orderError) throw traced.fromSupabase(orderError, { table: 'orders', operation: 'insert' })

    // Create order items with pickup snapshots (listing items only)
    // Market box subscriptions are created after payment succeeds (webhook/success handler)
    if (orderItemsWithSnapshots.length > 0) {
      crumb.supabase('insert', 'order_items')
      const { error: itemsError } = await supabase.from('order_items').insert(
        orderItemsWithSnapshots.map((item) => ({
          ...item,
          order_id: orderId,
        }))
      )

      if (itemsError) throw traced.fromSupabase(itemsError, { table: 'order_items', operation: 'insert' })

      // Decrement inventory at checkout time (not at payment success)
      // This reserves the items — inventory is restored if order is cancelled/expires
      crumb.logic('Decrementing inventory at checkout')
      for (const item of items) {
        const currentQuantity = inventoryMap.get(item.listingId)
        // Only decrement if listing has managed inventory (not null/unlimited)
        if (currentQuantity !== null && currentQuantity !== undefined) {
          await serviceClient
            .rpc('atomic_decrement_inventory' as string, {
              p_listing_id: item.listingId,
              p_quantity: item.quantity
            })
        }
      }
    }

    return NextResponse.json({ sessionId: session.id, url: session.url })
  })
}
