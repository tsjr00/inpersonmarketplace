import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/*
 * PICKUP SCHEDULING CONTEXT
 *
 * Cart items now require schedule_id and pickup_date for specific pickup selection.
 * Validation uses validate_cart_item_schedule() SQL function for server-side checks.
 *
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 */

// POST - Add item to cart
export async function POST(request: Request) {
  return withErrorTracing('/api/cart/items', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking authentication')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      throw traced.auth('ERR_AUTH_001', 'Unauthorized')
    }

    const body = await request.json()
    const { vertical, listingId, quantity = 1, marketId, scheduleId, pickupDate } = body

    crumb.logic('Validating request', { vertical, listingId, quantity, marketId, scheduleId, pickupDate })

    if (!vertical || !listingId) {
      throw traced.validation('ERR_CART_005', 'Missing required fields: vertical and listingId are required')
    }

    if (!marketId) {
      throw traced.validation('ERR_CART_005', 'Please select a pickup location')
    }

    // Require schedule_id and pickup_date for new pickup scheduling system
    if (!scheduleId || !pickupDate) {
      throw traced.validation('ERR_CART_005', 'Please select a pickup date')
    }

    if (quantity < 1) {
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

    // Validate market selection - ensure listing is available at this market
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

    // Validate schedule/date selection using SQL function
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

    // Check if item already in cart (same listing AND same schedule AND same date)
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
      // Update quantity
      const newQuantity = existingItem.quantity + quantity

      crumb.logic('Updating existing cart item', { existingId: existingItem.id, newQuantity })

      // Re-validate with new quantity
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
      // Insert new item with schedule and pickup date
      crumb.supabase('insert', 'cart_items')
      const { error: insertError } = await supabase
        .from('cart_items')
        .insert({
          cart_id: cartId,
          listing_id: listingId,
          quantity: quantity,
          market_id: marketId,
          schedule_id: scheduleId,
          pickup_date: pickupDate
        })

      if (insertError) {
        throw traced.fromSupabase(insertError, {
          table: 'cart_items',
          operation: 'insert',
          additionalContext: { cartId, listingId, quantity, marketId, scheduleId, pickupDate },
        })
      }
    }

    crumb.logic('Item added to cart successfully')
    return NextResponse.json({ success: true })
  })
}
