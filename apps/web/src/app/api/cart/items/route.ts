import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST - Add item to cart
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { vertical, listingId, quantity = 1 } = body

  if (!vertical || !listingId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (quantity < 1) {
    return NextResponse.json({ error: 'Quantity must be positive' }, { status: 400 })
  }

  // Get vertical
  const { data: verticalData, error: vertError } = await supabase
    .from('verticals')
    .select('id')
    .eq('vertical_id', vertical)
    .single()

  if (vertError || !verticalData) {
    return NextResponse.json({ error: 'Vertical not found' }, { status: 404 })
  }

  // Validate listing and inventory
  const { data: canAdd, error: validateError } = await supabase
    .rpc('validate_cart_item_inventory', {
      p_listing_id: listingId,
      p_quantity: quantity
    })

  if (validateError) {
    console.error('Error validating inventory:', validateError)
    return NextResponse.json({ error: 'Failed to validate inventory' }, { status: 500 })
  }

  if (!canAdd) {
    return NextResponse.json({
      error: 'Item not available or insufficient inventory'
    }, { status: 400 })
  }

  // Get or create cart
  const { data: cartId, error: cartError } = await supabase
    .rpc('get_or_create_cart', {
      p_user_id: user.id,
      p_vertical_id: verticalData.id
    })

  if (cartError) {
    console.error('Error getting cart:', cartError)
    return NextResponse.json({ error: 'Failed to get cart' }, { status: 500 })
  }

  // Check if item already in cart
  const { data: existingItem, error: checkError } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('cart_id', cartId)
    .eq('listing_id', listingId)
    .single()

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('Error checking existing item:', checkError)
    return NextResponse.json({ error: 'Failed to check cart' }, { status: 500 })
  }

  if (existingItem) {
    // Update quantity
    const newQuantity = existingItem.quantity + quantity

    // Re-validate with new quantity
    const { data: canUpdate } = await supabase
      .rpc('validate_cart_item_inventory', {
        p_listing_id: listingId,
        p_quantity: newQuantity
      })

    if (!canUpdate) {
      return NextResponse.json({
        error: 'Insufficient inventory for requested quantity'
      }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('cart_items')
      .update({ quantity: newQuantity })
      .eq('id', existingItem.id)

    if (updateError) {
      console.error('Error updating cart item:', updateError)
      return NextResponse.json({ error: 'Failed to update cart item' }, { status: 500 })
    }
  } else {
    // Insert new item
    const { error: insertError } = await supabase
      .from('cart_items')
      .insert({
        cart_id: cartId,
        listing_id: listingId,
        quantity: quantity
      })

    if (insertError) {
      console.error('Error adding cart item:', insertError)
      return NextResponse.json({ error: 'Failed to add item to cart' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
