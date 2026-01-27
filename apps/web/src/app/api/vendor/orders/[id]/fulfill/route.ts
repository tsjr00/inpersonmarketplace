import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: orderItemId } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  // Check for unresolved pickup confirmations (lockdown check)
  const { data: unresolvedItems } = await supabase
    .from('order_items')
    .select('id')
    .eq('vendor_profile_id', vendorProfile.id)
    .not('buyer_confirmed_at', 'is', null)
    .is('vendor_confirmed_at', null)
    .is('issue_reported_at', null)

  if (unresolvedItems && unresolvedItems.length > 0) {
    // Check if any have been pending over 5 minutes (hard lockdown)
    const { data: hardLockedItems } = await supabase
      .from('order_items')
      .select('id, confirmation_window_expires_at')
      .eq('vendor_profile_id', vendorProfile.id)
      .not('buyer_confirmed_at', 'is', null)
      .is('vendor_confirmed_at', null)
      .is('issue_reported_at', null)
      .lt('confirmation_window_expires_at', new Date(Date.now() - 4.5 * 60 * 1000).toISOString())

    if (hardLockedItems && hardLockedItems.length > 0) {
      return NextResponse.json({
        error: 'You have unresolved pickup confirmations. Please confirm or report an issue for pending handoffs before fulfilling other orders.',
        code: 'LOCKDOWN_ACTIVE',
        unresolved_count: hardLockedItems.length
      }, { status: 403 })
    }
  }

  // Get order item
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('*, order:orders(*)')
    .eq('id', orderItemId)
    .eq('vendor_profile_id', vendorProfile.id)
    .single()

  if (!orderItem) {
    return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
  }

  try {
    // Mark as fulfilled - transfer happens later when both parties confirm pickup
    await supabase
      .from('order_items')
      .update({
        status: 'fulfilled',
        pickup_confirmed_at: new Date().toISOString(),
      })
      .eq('id', orderItemId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Fulfill error:', error)
    return NextResponse.json({ error: 'Failed to fulfill order' }, { status: 500 })
  }
}
