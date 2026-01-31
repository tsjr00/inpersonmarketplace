import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderItemId } = await params

  return withErrorTracing('/api/vendor/orders/[id]/fulfill', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      throw traced.notFound('ERR_ORDER_001', 'Vendor not found')
    }

    // Check for unresolved pickup confirmations (lockdown check)
    crumb.logic('Checking for unresolved pickup confirmations')
    const { data: unresolvedItems } = await supabase
      .from('order_items')
      .select('id')
      .eq('vendor_profile_id', vendorProfile.id)
      .not('buyer_confirmed_at', 'is', null)
      .is('vendor_confirmed_at', null)
      .is('issue_reported_at', null)

    if (unresolvedItems && unresolvedItems.length > 0) {
      // Check if any have been pending over 8 hours (hard lockdown)
      // This gives vendor time to call/find the customer and have them confirm
      const LOCKDOWN_HOURS = 8
      const { data: hardLockedItems } = await supabase
        .from('order_items')
        .select('id, confirmation_window_expires_at')
        .eq('vendor_profile_id', vendorProfile.id)
        .not('buyer_confirmed_at', 'is', null)
        .is('vendor_confirmed_at', null)
        .is('issue_reported_at', null)
        .lt('confirmation_window_expires_at', new Date(Date.now() - LOCKDOWN_HOURS * 60 * 60 * 1000).toISOString())

      if (hardLockedItems && hardLockedItems.length > 0) {
        throw traced.auth('ERR_ORDER_005', 'You have unresolved pickup confirmations. Please confirm or report an issue for pending handoffs before fulfilling other orders.', {
          code: 'LOCKDOWN_ACTIVE',
          unresolved_count: hardLockedItems.length
        })
      }
    }

    // Get order item
    crumb.supabase('select', 'order_items')
    const { data: orderItem } = await supabase
      .from('order_items')
      .select('*, order:orders(*)')
      .eq('id', orderItemId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (!orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Mark as fulfilled - transfer happens later when both parties confirm pickup
    crumb.supabase('update', 'order_items')
    await supabase
      .from('order_items')
      .update({
        status: 'fulfilled',
        pickup_confirmed_at: new Date().toISOString(),
      })
      .eq('id', orderItemId)

    return NextResponse.json({ success: true })
  })
}
