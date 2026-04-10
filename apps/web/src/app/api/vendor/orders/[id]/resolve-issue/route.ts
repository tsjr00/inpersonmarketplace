import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createRefund } from '@/lib/stripe/payments'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'
import { restoreInventory } from '@/lib/inventory'
import { shouldRestoreInventory } from '@/lib/inventory-rules'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { FEES, proratedFlatFeeSimple } from '@/lib/pricing'
import { getVendorProfileForVertical } from '@/lib/vendor/getVendorProfile'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/vendor/orders/[id]/resolve-issue
// Vendor resolves a buyer-reported issue on an order item.
// Actions: "confirm_delivery" (vendor says they did deliver) or "issue_refund" (vendor agrees to refund)
// If vendor disputes buyer (confirm_delivery), admin gets notified.
export const maxDuration = 30

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/vendor/orders/[id]/resolve-issue', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-resolve-issue:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    crumb.auth('Checking vendor authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const body = await request.json()
    const { action, notes } = body as { action: string; notes?: string }

    if (!action || !['confirm_delivery', 'issue_refund'].includes(action)) {
      throw traced.validation('ERR_ORDER_001', 'Invalid action. Must be "confirm_delivery" or "issue_refund".')
    }

    // Fetch order item first — the joined order row provides vertical_id for multi-vertical vendor lookup
    crumb.supabase('select', 'order_items')
    const { data: orderItem } = await supabase
      .from('order_items')
      .select(`
        id, status, order_id, vendor_profile_id, listing_id, quantity,
        subtotal_cents, issue_reported_at, issue_status,
        order:orders!inner(id, order_number, buyer_user_id, vertical_id, payment_method)
      `)
      .eq('id', orderItemId)
      .single()

    if (!orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    const orderVerticalIdForProfile = (orderItem.order as unknown as { vertical_id: string }).vertical_id

    // Get vendor profile scoped to this order's vertical
    crumb.supabase('select', 'vendor_profiles')
    const { profile: vendorProfile } = await getVendorProfileForVertical<{
      id: string
      profile_data: Record<string, unknown> | null
      user_id: string
    }>(supabase, user.id, orderVerticalIdForProfile, 'id, profile_data, user_id')

    if (!vendorProfile) {
      throw traced.notFound('ERR_AUTH_002', 'Vendor profile not found')
    }

    // Defense in depth — verify ownership
    if (orderItem.vendor_profile_id !== vendorProfile.id) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    if (!orderItem.issue_reported_at) {
      throw traced.validation('ERR_ORDER_001', 'No issue reported on this item')
    }

    if (orderItem.issue_status === 'resolved' || orderItem.issue_status === 'closed') {
      throw traced.validation('ERR_ORDER_001', 'Issue already resolved')
    }

    const order = orderItem.order as unknown as {
      id: string; order_number: string; buyer_user_id: string; vertical_id: string; payment_method: string
    }
    const vendorName = (vendorProfile.profile_data as Record<string, unknown>)?.business_name as string
      || (vendorProfile.profile_data as Record<string, unknown>)?.farm_name as string
      || 'Vendor'

    if (action === 'confirm_delivery') {
      // Vendor says they DID deliver — dispute buyer's claim
      crumb.supabase('update', 'order_items')
      await supabase
        .from('order_items')
        .update({
          issue_status: 'resolved',
          issue_resolved_at: new Date().toISOString(),
          issue_resolved_by: user.id,
          issue_admin_notes: `Vendor confirmed delivery.${notes ? ` Notes: ${notes}` : ''}`,
        })
        .eq('id', orderItemId)

      // Notify buyer that issue was resolved
      await sendNotification(order.buyer_user_id, 'issue_resolved', {
        orderNumber: order.order_number,
        orderId: order.id,
        resolution: 'Vendor confirmed the item was delivered. If you disagree, please contact support.',
      }, { vertical: order.vertical_id })

      // Notify admin that vendor disputed buyer's claim
      const serviceClient = createServiceClient()
      const { data: adminProfiles } = await serviceClient
        .from('user_profiles')
        .select('user_id')
        .contains('roles', ['admin'])
        .is('deleted_at', null)
        .limit(5)

      if (adminProfiles) {
        for (const admin of adminProfiles) {
          await sendNotification(admin.user_id, 'issue_disputed', {
            orderNumber: order.order_number,
            vendorName,
          }, { vertical: order.vertical_id })
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Delivery confirmed. Admin has been notified for review.',
        action: 'confirm_delivery',
      })
    }

    if (action === 'issue_refund') {
      // Vendor agrees buyer didn't receive — cancel item + refund
      // Calculate full buyer-paid amount (not just subtotal)
      // Buyer paid: subtotal + 6.5% buyer fee + prorated flat fee
      const { count: totalItemsInOrder } = await supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', orderItem.order_id)

      const buyerPercentFee = Math.round(orderItem.subtotal_cents * (FEES.buyerFeePercent / 100))
      const itemFlatFee = totalItemsInOrder ? proratedFlatFeeSimple(FEES.buyerFlatFeeCents, totalItemsInOrder) : 0
      const buyerPaidForItem = orderItem.subtotal_cents + buyerPercentFee + itemFlatFee

      crumb.supabase('update', 'order_items')
      await supabase
        .from('order_items')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'vendor',
          cancellation_reason: `Vendor-initiated refund for reported issue.${notes ? ` Notes: ${notes}` : ''}`,
          refund_amount_cents: buyerPaidForItem,
          issue_status: 'resolved',
          issue_resolved_at: new Date().toISOString(),
          issue_resolved_by: user.id,
        })
        .eq('id', orderItemId)

      // Restore inventory — but NOT for food truck fulfilled items (cooked food can't be resold)
      if (orderItem.listing_id && shouldRestoreInventory(orderItem.status, order.vertical_id)) {
        const serviceClient = createServiceClient()
        await restoreInventory(serviceClient, orderItem.listing_id, orderItem.quantity || 1)
      }

      // Process Stripe refund if applicable (platform absorbs Stripe processing fee)
      if (order.payment_method === 'stripe') {
        const serviceClient = createServiceClient()
        const { data: payment } = await serviceClient
          .from('payments')
          .select('stripe_payment_intent_id, status')
          .eq('order_id', order.id)
          .eq('status', 'succeeded')
          .single()

        if (payment?.stripe_payment_intent_id) {
          try {
            await createRefund(payment.stripe_payment_intent_id, buyerPaidForItem)
            await supabase
              .from('order_items')
              .update({ status: 'refunded' })
              .eq('id', orderItemId)
          } catch (refundError) {
            console.error('[resolve-issue] Stripe refund failed:', refundError)
          }
        }
      }

      // Check if all items in the order are now cancelled — update order status
      const { data: remainingItems } = await supabase
        .from('order_items')
        .select('id')
        .eq('order_id', orderItem.order_id)
        .is('cancelled_at', null)

      if (!remainingItems || remainingItems.length === 0) {
        await supabase
          .from('orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', orderItem.order_id)
      }

      // Notify buyer
      await sendNotification(order.buyer_user_id, 'issue_resolved', {
        orderNumber: order.order_number,
        orderId: order.id,
        resolution: 'Vendor has issued a refund for this item.',
      }, { vertical: order.vertical_id })

      return NextResponse.json({
        success: true,
        message: 'Refund issued and issue resolved.',
        action: 'issue_refund',
      })
    }
  })
}
