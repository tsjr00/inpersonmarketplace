import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface CartItemWithCart {
  listing_id: string
  cart_id: string
  carts: {
    user_id: string
  }
}

// PUT - Update cart item quantity
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: cartItemId } = await params
  const body = await request.json()
  const { quantity } = body

  if (!quantity || quantity < 1) {
    return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
  }

  // Get cart item with listing
  const { data: cartItem, error: itemError } = await supabase
    .from('cart_items')
    .select('listing_id, cart_id, carts!inner(user_id)')
    .eq('id', cartItemId)
    .single()

  if (itemError || !cartItem) {
    return NextResponse.json({ error: 'Cart item not found' }, { status: 404 })
  }

  // Verify ownership
  const typedCartItem = cartItem as unknown as CartItemWithCart
  if (typedCartItem.carts.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Validate inventory
  const { data: canUpdate, error: validateError } = await supabase
    .rpc('validate_cart_item_inventory', {
      p_listing_id: typedCartItem.listing_id,
      p_quantity: quantity
    })

  if (validateError) {
    console.error('Error validating inventory:', validateError)
    return NextResponse.json({ error: 'Failed to validate inventory' }, { status: 500 })
  }

  if (!canUpdate) {
    return NextResponse.json({
      error: 'Insufficient inventory for requested quantity'
    }, { status: 400 })
  }

  // Update quantity
  const { error: updateError } = await supabase
    .from('cart_items')
    .update({ quantity })
    .eq('id', cartItemId)

  if (updateError) {
    console.error('Error updating cart item:', updateError)
    return NextResponse.json({ error: 'Failed to update cart item' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE - Remove cart item
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: cartItemId } = await params

  // Verify ownership through RLS - the delete will fail if user doesn't own the cart
  const { error: deleteError } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)

  if (deleteError) {
    console.error('Error deleting cart item:', deleteError)
    return NextResponse.json({ error: 'Failed to delete cart item' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
