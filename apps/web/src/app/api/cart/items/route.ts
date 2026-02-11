import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/*
 * CART ITEMS API
 *
 * Supports two item types:
 * - 'listing' (default): Regular marketplace listings with pickup scheduling
 * - 'market_box': Market box offering subscriptions (Stripe-only, qty always 1)
 *
 * See: docs/Build_Instructions/Market_Box_Checkout_Integration_Plan.md
 */

// POST - Add item to cart (listing or market box)
export async function POST(request: Request) {
  return withErrorTracing('/api/cart/items', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Unauthorized')
    }

    const body = await request.json()
    const itemType = body.type || 'listing'

    if (itemType === 'market_box') {
      return handleMarketBoxAdd(supabase, user, body)
    }
    return handleListingAdd(supabase, user, body)
  })
}

// ── Listing add (existing flow) ──────────────────────────────────────────

async function handleListingAdd(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string },
  body: Record<string, unknown>
) {
  const { vertical, listingId, quantity = 1, marketId, scheduleId, pickupDate } = body as {
    vertical: string
    listingId: string
    quantity?: number
    marketId?: string
    scheduleId?: string
    pickupDate?: string
  }

  crumb.logic('Validating listing request', { vertical, listingId, quantity, marketId, scheduleId, pickupDate })

  if (!vertical || !listingId) {
    throw traced.validation('ERR_CART_005', 'Missing required fields: vertical and listingId are required')
  }

  if (!marketId) {
    throw traced.validation('ERR_CART_005', 'Please select a pickup location')
  }

  if (!scheduleId || !pickupDate) {
    throw traced.validation('ERR_CART_005', 'Please select a pickup date')
  }

  if ((quantity as number) < 1) {
    throw traced.validation('ERR_CART_005', 'Quantity must be positive')
  }

  // Get vertical
  crumb.supabase('select', 'verticals')
  const { data: verticalData, error: vertError } = await supabase
    .from('verticals')
    .select('id')
    .eq('vertical_id', vertical)
    .single()

  if (vertError || !verticalData) {
    throw traced.notFound('ERR_CART_005', `Vertical not found: ${vertical}`, {
      table: 'verticals',
      originalError: vertError,
    })
  }

  // Validate listing and inventory
  crumb.logic('Validating inventory', { listingId, quantity })
  const { data: canAdd, error: validateError } = await supabase
    .rpc('validate_cart_item_inventory', {
      p_listing_id: listingId,
      p_quantity: quantity
    })

  if (validateError) {
    throw traced.fromSupabase(validateError, {
      table: 'listings',
      operation: 'select',
      additionalContext: { listingId, quantity, rpc: 'validate_cart_item_inventory' },
    })
  }

  if (!canAdd) {
    throw traced.validation('ERR_CART_002', 'Item not available or insufficient inventory', {
      additionalContext: { listingId, quantity },
    })
  }

  // Validate market selection
  crumb.supabase('select', 'listing_markets', { listingId, marketId })
  const { data: marketValid, error: marketError } = await supabase
    .from('listing_markets')
    .select('market_id')
    .eq('listing_id', listingId)
    .eq('market_id', marketId)
    .single()

  if (marketError && marketError.code !== 'PGRST116') {
    throw traced.fromSupabase(marketError, {
      table: 'listing_markets',
      operation: 'select',
      additionalContext: { listingId, marketId },
    })
  }

  if (!marketValid) {
    throw traced.validation('ERR_CART_001', 'This item is not available at the selected pickup location', {
      additionalContext: { listingId, marketId },
    })
  }

  // Validate schedule/date
  crumb.logic('Validating schedule selection', { listingId, scheduleId, pickupDate })
  const { data: scheduleValid, error: scheduleError } = await supabase
    .rpc('validate_cart_item_schedule', {
      p_listing_id: listingId,
      p_schedule_id: scheduleId,
      p_pickup_date: pickupDate
    })

  if (scheduleError) {
    throw traced.fromSupabase(scheduleError, {
      additionalContext: { listingId, scheduleId, pickupDate, rpc: 'validate_cart_item_schedule' },
    })
  }

  if (scheduleValid === false) {
    throw traced.validation('ERR_CART_003', 'This pickup date is no longer accepting orders. Please select a different date.', {
      additionalContext: { listingId, scheduleId, pickupDate },
    })
  }

  // Get or create cart
  crumb.supabase('rpc', 'carts', { rpc: 'get_or_create_cart' })
  const { data: cartId, error: cartError } = await supabase
    .rpc('get_or_create_cart', {
      p_user_id: user.id,
      p_vertical_id: verticalData.id
    })

  if (cartError) {
    throw traced.fromSupabase(cartError, {
      table: 'carts',
      operation: 'insert',
      userId: user.id,
      additionalContext: { rpc: 'get_or_create_cart' },
    })
  }

  // Check for existing item (same listing + schedule + date)
  crumb.supabase('select', 'cart_items', { cartId, listingId, scheduleId, pickupDate })
  const { data: existingItem, error: checkError } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('cart_id', cartId)
    .eq('listing_id', listingId)
    .eq('schedule_id', scheduleId)
    .eq('pickup_date', pickupDate)
    .single()

  if (checkError && checkError.code !== 'PGRST116') {
    throw traced.fromSupabase(checkError, {
      table: 'cart_items',
      operation: 'select',
      additionalContext: { cartId, listingId, scheduleId, pickupDate },
    })
  }

  if (existingItem) {
    const newQuantity = existingItem.quantity + (quantity as number)

    crumb.logic('Updating existing cart item', { existingId: existingItem.id, newQuantity })

    const { data: canUpdate } = await supabase
      .rpc('validate_cart_item_inventory', {
        p_listing_id: listingId,
        p_quantity: newQuantity
      })

    if (!canUpdate) {
      throw traced.validation('ERR_CART_002', 'Insufficient inventory for requested quantity', {
        additionalContext: { listingId, requestedQuantity: newQuantity },
      })
    }

    const { error: updateError } = await supabase
      .from('cart_items')
      .update({ quantity: newQuantity })
      .eq('id', existingItem.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, {
        table: 'cart_items',
        operation: 'update',
        additionalContext: { cartItemId: existingItem.id, newQuantity },
      })
    }
  } else {
    crumb.supabase('insert', 'cart_items')
    const { error: insertError } = await supabase
      .from('cart_items')
      .insert({
        cart_id: cartId,
        listing_id: listingId,
        quantity: quantity as number,
        market_id: marketId,
        schedule_id: scheduleId,
        pickup_date: pickupDate,
        item_type: 'listing'
      })

    if (insertError) {
      throw traced.fromSupabase(insertError, {
        table: 'cart_items',
        operation: 'insert',
        additionalContext: { cartId, listingId, quantity, marketId, scheduleId, pickupDate },
      })
    }
  }

  crumb.logic('Listing item added to cart successfully')
  return NextResponse.json({ success: true })
}

// ── Market box add ───────────────────────────────────────────────────────

async function handleMarketBoxAdd(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string },
  body: Record<string, unknown>
) {
  const { vertical, offeringId, termWeeks = 4, startDate } = body as {
    vertical: string
    offeringId: string
    termWeeks?: number
    startDate?: string
  }

  crumb.logic('Validating market box request', { vertical, offeringId, termWeeks, startDate })

  if (!vertical || !offeringId) {
    throw traced.validation('ERR_CART_005', 'Missing required fields: vertical and offeringId are required')
  }

  if (![4, 8].includes(termWeeks as number)) {
    throw traced.validation('ERR_CART_005', 'term_weeks must be 4 or 8')
  }

  // Get vertical
  crumb.supabase('select', 'verticals')
  const { data: verticalData, error: vertError } = await supabase
    .from('verticals')
    .select('id')
    .eq('vertical_id', vertical)
    .single()

  if (vertError || !verticalData) {
    throw traced.notFound('ERR_CART_005', `Vertical not found: ${vertical}`)
  }

  // Validate offering exists and is active
  crumb.supabase('select', 'market_box_offerings')
  const { data: offering, error: offeringError } = await supabase
    .from('market_box_offerings')
    .select(`
      id,
      name,
      price_4week_cents,
      price_8week_cents,
      max_subscribers,
      active,
      pickup_market_id,
      pickup_day_of_week,
      vendor:vendor_profiles (
        id,
        tier
      )
    `)
    .eq('id', offeringId)
    .single()

  if (offeringError) {
    throw traced.fromSupabase(offeringError, { table: 'market_box_offerings', operation: 'select' })
  }

  if (!offering || !offering.active) {
    throw traced.notFound('ERR_CART_006', 'Market box offering not found or not available')
  }

  // Validate 8-week option exists if requested
  if (termWeeks === 8 && !offering.price_8week_cents) {
    throw traced.validation('ERR_CART_006', 'This market box does not offer an 8-week option')
  }

  // Check capacity
  crumb.supabase('select', 'market_box_subscriptions (count)')
  const { count: activeCount, error: countError } = await supabase
    .from('market_box_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('offering_id', offeringId)
    .eq('status', 'active')

  if (countError) {
    throw traced.fromSupabase(countError, { table: 'market_box_subscriptions', operation: 'select' })
  }

  if (offering.max_subscribers !== null && (activeCount || 0) >= offering.max_subscribers) {
    throw traced.validation('ERR_CART_007', 'This market box is at capacity. Please try again later.')
  }

  // Check for existing active subscription to same offering
  crumb.supabase('select', 'market_box_subscriptions (existing)')
  const { count: existingSub, error: existingError } = await supabase
    .from('market_box_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('offering_id', offeringId)
    .eq('buyer_user_id', user.id)
    .eq('status', 'active')

  if (existingError) {
    throw traced.fromSupabase(existingError, { table: 'market_box_subscriptions', operation: 'select' })
  }

  if ((existingSub || 0) > 0) {
    throw traced.validation('ERR_CART_008', 'You already have an active subscription to this market box')
  }

  // Calculate start date if not provided
  let subscriptionStartDate = startDate
  if (!subscriptionStartDate) {
    const today = new Date()
    const currentDay = today.getDay()
    const pickupDay = offering.pickup_day_of_week
    let daysUntilPickup = pickupDay - currentDay
    if (daysUntilPickup <= 0) daysUntilPickup += 7
    const nextStart = new Date(today)
    nextStart.setDate(today.getDate() + daysUntilPickup)
    subscriptionStartDate = nextStart.toISOString().split('T')[0]
  }

  // Get or create cart
  crumb.supabase('rpc', 'carts', { rpc: 'get_or_create_cart' })
  const { data: cartId, error: cartError } = await supabase
    .rpc('get_or_create_cart', {
      p_user_id: user.id,
      p_vertical_id: verticalData.id
    })

  if (cartError) {
    throw traced.fromSupabase(cartError, {
      table: 'carts',
      operation: 'insert',
      userId: user.id,
    })
  }

  // Check if this offering is already in cart (unique index will also enforce)
  crumb.supabase('select', 'cart_items (market_box existing)')
  const { data: existingCartItem, error: cartCheckError } = await supabase
    .from('cart_items')
    .select('id')
    .eq('cart_id', cartId)
    .eq('offering_id', offeringId)
    .eq('item_type', 'market_box')
    .single()

  if (cartCheckError && cartCheckError.code !== 'PGRST116') {
    throw traced.fromSupabase(cartCheckError, {
      table: 'cart_items',
      operation: 'select',
    })
  }

  if (existingCartItem) {
    // Update term/start date if already in cart
    crumb.supabase('update', 'cart_items')
    const { error: updateError } = await supabase
      .from('cart_items')
      .update({
        term_weeks: termWeeks,
        start_date: subscriptionStartDate
      })
      .eq('id', existingCartItem.id)

    if (updateError) {
      throw traced.fromSupabase(updateError, {
        table: 'cart_items',
        operation: 'update',
      })
    }
  } else {
    // Insert new market box cart item
    crumb.supabase('insert', 'cart_items (market_box)')
    const { error: insertError } = await supabase
      .from('cart_items')
      .insert({
        cart_id: cartId,
        item_type: 'market_box',
        offering_id: offeringId,
        term_weeks: termWeeks,
        start_date: subscriptionStartDate,
        quantity: 1,
        market_id: offering.pickup_market_id
      })

    if (insertError) {
      throw traced.fromSupabase(insertError, {
        table: 'cart_items',
        operation: 'insert',
        additionalContext: { cartId, offeringId, termWeeks, startDate: subscriptionStartDate },
      })
    }
  }

  crumb.logic('Market box added to cart successfully')
  return NextResponse.json({ success: true })
}
