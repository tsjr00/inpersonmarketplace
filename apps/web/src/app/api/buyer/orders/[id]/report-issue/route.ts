import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/buyer/orders/[id]/report-issue
// Buyer reports they did NOT receive the item (alternative to confirming receipt)
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/buyer/orders/[id]/report-issue', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`buyer-order-report-issue:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
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
    crumb.supabase('select', 'order_items')
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
          order_number,
          buyer_user_id
        )
      `)
      .eq('id', orderItemId)
      .single()

    if (fetchError || !orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Verify ownership
    crumb.auth('Verifying order ownership')
    const orderData = orderItem.order as unknown
    const order = Array.isArray(orderData) ? orderData[0] : orderData
    if (!order || (order as { buyer_user_id: string }).buyer_user_id !== user.id) {
      throw traced.auth('ERR_AUTH_002', 'Not authorized to report issue on this order item')
    }

    // Can only report issue on items that are ready/fulfilled and not yet resolved
    crumb.logic('Checking issue report eligibility')
    if (!['ready', 'fulfilled'].includes(orderItem.status)) {
      throw traced.validation('ERR_ORDER_001', 'Cannot report issue for this item status', { status: orderItem.status })
    }

    if (orderItem.issue_reported_at) {
      throw traced.validation('ERR_ORDER_001', 'Issue already reported for this item')
    }

    // Mark the issue
    crumb.supabase('update', 'order_items')
    const { error: updateError } = await supabase
      .from('order_items')
      .update({
        issue_reported_at: new Date().toISOString(),
        issue_reported_by: 'buyer',
        issue_description: description,
        issue_status: 'new'
      })
      .eq('id', orderItemId)

    if (updateError) {
      throw traced.fromSupabase(updateError, { table: 'order_items', operation: 'update' })
    }

    // Notify vendor
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('user_id')
      .eq('id', orderItem.vendor_profile_id)
      .single()

    if (vendorProfile?.user_id) {
      crumb.logic('Sending pickup issue notification to vendor')
      await sendNotification(vendorProfile.user_id, 'pickup_issue_reported', {
        orderNumber: (order as { order_number?: string }).order_number || orderItemId.slice(0, 8),
        reason: description,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Issue reported. For fastest resolution, contact the vendor directly. If unresolved, our team will review.',
      issue_reported_at: new Date().toISOString()
    })
  })
}
