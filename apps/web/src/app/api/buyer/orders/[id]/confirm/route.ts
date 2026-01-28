import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Vendor has 30 seconds to counter-confirm after buyer confirms
const CONFIRMATION_WINDOW_SECONDS = 30

// POST /api/buyer/orders/[id]/confirm - Buyer confirms they received an item
// This starts the 30-second window for vendor to counter-confirm
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/buyer/orders/[id]/confirm', 'POST', async () => {
    const supabase = await createClient()

    // Verify authentication
    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get the order item and verify it belongs to this buyer's order
    crumb.supabase('select', 'order_items')
    const { data: orderItem, error: fetchError } = await supabase
      .from('order_items')
      .select(`
        id,
        status,
        buyer_confirmed_at,
        vendor_profile_id,
        order:orders!inner (
          id,
          buyer_user_id
        )
      `)
      .eq('id', orderItemId)
      .single()

    if (fetchError || !orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Verify this order belongs to the current user
    crumb.auth('Verifying order ownership')
    const orderData = orderItem.order as unknown
    const order = Array.isArray(orderData) ? orderData[0] : orderData
    if (!order || (order as { buyer_user_id: string }).buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized to confirm this order item')
    }

    // Check if item is in a confirmable state (ready or fulfilled by vendor)
    crumb.logic('Checking confirmation eligibility')
    if (!['ready', 'fulfilled'].includes(orderItem.status)) {
      throw traced.validation('ERR_ORDER_003', 'Item is not ready for pickup confirmation', { status: orderItem.status })
    }

    // Check if already confirmed by buyer
    if (orderItem.buyer_confirmed_at) {
      throw traced.validation('ERR_ORDER_003', 'Already confirmed', { buyer_confirmed_at: orderItem.buyer_confirmed_at })
    }

    const now = new Date()
    const windowExpires = new Date(now.getTime() + CONFIRMATION_WINDOW_SECONDS * 1000)

    // Update the order item with buyer confirmation and start confirmation window
    crumb.supabase('update', 'order_items')
    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        buyer_confirmed_at: now.toISOString(),
        confirmation_window_expires_at: windowExpires.toISOString()
      })
      .eq('id', orderItemId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'order_items', operation: 'update' })
    }

    // Create notification for vendor to counter-confirm
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('user_id')
      .eq('id', orderItem.vendor_profile_id)
      .single()

    if (vendorProfile?.user_id) {
      crumb.supabase('insert', 'notifications')
      await supabase.from('notifications').insert({
        user_id: vendorProfile.user_id,
        type: 'pickup_confirmation_needed',
        title: 'Buyer Confirmed Pickup',
        message: 'A buyer confirmed they received their order. Please confirm the handoff within 30 seconds.',
        data: {
          order_item_id: orderItemId,
          confirmation_window_expires_at: windowExpires.toISOString()
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Receipt confirmed. Waiting for vendor to confirm handoff.',
      buyer_confirmed_at: now.toISOString(),
      confirmation_window_expires_at: windowExpires.toISOString()
    })
  })
}
