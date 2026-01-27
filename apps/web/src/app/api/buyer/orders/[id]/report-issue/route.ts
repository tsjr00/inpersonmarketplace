import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/buyer/orders/[id]/report-issue
// Buyer reports they did NOT receive the item (alternative to confirming receipt)
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse issue description
  let description = ''
  try {
    const body = await request.json()
    description = body.description || 'Buyer reported not receiving item'
  } catch {
    description = 'Buyer reported not receiving item'
  }

  // Get the order item
  const { data: orderItem, error: fetchError } = await supabase
    .from('order_items')
    .select(`
      id,
      status,
      buyer_confirmed_at,
      issue_reported_at,
      vendor_profile_id,
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

  // Verify ownership
  const orderData = orderItem.order as unknown
  const order = Array.isArray(orderData) ? orderData[0] : orderData
  if (!order || (order as { buyer_user_id: string }).buyer_user_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Can only report issue on items that are ready/fulfilled and not yet resolved
  if (!['ready', 'fulfilled'].includes(orderItem.status)) {
    return NextResponse.json(
      { error: 'Cannot report issue for this item status' },
      { status: 400 }
    )
  }

  if (orderItem.issue_reported_at) {
    return NextResponse.json(
      { error: 'Issue already reported for this item' },
      { status: 400 }
    )
  }

  // Mark the issue
  const { error: updateError } = await supabase
    .from('order_items')
    .update({
      issue_reported_at: new Date().toISOString(),
      issue_reported_by: 'buyer',
      issue_description: description
    })
    .eq('id', orderItemId)

  if (updateError) {
    console.error('Error reporting issue:', updateError)
    return NextResponse.json({ error: 'Failed to report issue' }, { status: 500 })
  }

  // Notify vendor
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('user_id')
    .eq('id', orderItem.vendor_profile_id)
    .single()

  if (vendorProfile?.user_id) {
    await supabase.from('notifications').insert({
      user_id: vendorProfile.user_id,
      type: 'pickup_issue_reported',
      title: 'Issue Reported by Buyer',
      message: `A buyer reported an issue with their order: ${description}`,
      data: { order_item_id: orderItemId, issue_description: description }
    })
  }

  // Notify admins (if error_logs or admin notification table exists)
  // For now, log it
  console.warn(`[PICKUP ISSUE] Order item ${orderItemId}: ${description}`)

  return NextResponse.json({
    success: true,
    message: 'Issue reported. Platform support will review and contact you.',
    issue_reported_at: new Date().toISOString()
  })
}
