import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/buyer/orders/[id]/confirm - Buyer confirms they received an item
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the order item and verify it belongs to this buyer's order
  const { data: orderItem, error: fetchError } = await supabase
    .from('order_items')
    .select(`
      id,
      status,
      buyer_confirmed_at,
      order:orders!inner (
        id,
        buyer_user_id
      )
    `)
    .eq('id', orderItemId)
    .single()

  if (fetchError || !orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  // Verify this order belongs to the current user
  // Note: Supabase join returns array, so we need to handle both cases
  const orderData = orderItem.order as unknown
  const order = Array.isArray(orderData) ? orderData[0] : orderData
  if (!order || (order as { buyer_user_id: string }).buyer_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Check if item is in a confirmable state (ready or fulfilled by vendor)
  if (!['ready', 'fulfilled'].includes(orderItem.status)) {
    return NextResponse.json(
      { error: 'Item is not ready for pickup confirmation' },
      { status: 400 }
    )
  }

  // Check if already confirmed by buyer
  if (orderItem.buyer_confirmed_at) {
    return NextResponse.json(
      { error: 'Already confirmed', buyer_confirmed_at: orderItem.buyer_confirmed_at },
      { status: 400 }
    )
  }

  // Update the order item with buyer confirmation
  const { error: updateError } = await supabase
    .from('order_items')
    .update({
      buyer_confirmed_at: new Date().toISOString()
    })
    .eq('id', orderItemId)

  if (updateError) {
    console.error('Error confirming pickup:', updateError)
    return NextResponse.json({ error: 'Failed to confirm pickup' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Pickup confirmed',
    buyer_confirmed_at: new Date().toISOString()
  })
}
