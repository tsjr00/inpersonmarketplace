import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferToVendor } from '@/lib/stripe/payments'
import { getAccountStatus } from '@/lib/stripe/connect'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/vendor/orders/[id]/confirm-handoff
// Vendor counter-confirms that they handed off items to the buyer.
// This triggers the Stripe transfer to the vendor.
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderItemId } = await context.params

  return withErrorTracing('/api/vendor/orders/[id]/confirm-handoff', 'POST', async () => {
    const supabase = await createClient()

    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get vendor profile with Stripe account status
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', user.id)
      .single()

    if (!vendorProfile) {
      throw traced.notFound('ERR_ORDER_001', 'Vendor not found')
    }

    // Verify Stripe account is ready for payouts before proceeding
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd && vendorProfile.stripe_account_id && !vendorProfile.stripe_payouts_enabled) {
      // Cached value may be stale/null — do a live check before blocking
      crumb.logic('Cached stripe_payouts_enabled is falsy, checking live status')
      try {
        const liveStatus = await getAccountStatus(vendorProfile.stripe_account_id)
        // Update DB with fresh values
        await supabase
          .from('vendor_profiles')
          .update({
            stripe_charges_enabled: liveStatus.chargesEnabled,
            stripe_payouts_enabled: liveStatus.payoutsEnabled,
            stripe_onboarding_complete: liveStatus.detailsSubmitted,
          })
          .eq('user_id', user.id)

        if (!liveStatus.payoutsEnabled) {
          throw traced.validation('ERR_ORDER_005', 'Your Stripe account is not yet enabled for payouts. Please complete your Stripe verification before confirming handoffs.')
        }
      } catch (err) {
        // Re-throw if it's our traced validation error
        if (err && typeof err === 'object' && 'code' in err) throw err
        // Stripe API error — log but don't block handoff
        console.error('Stripe live status check failed:', err)
      }
    }

    // Get order item with buyer/order info for notification
    crumb.supabase('select', 'order_items')
    const { data: orderItem, error: fetchError } = await supabase
      .from('order_items')
      .select(`
        id, status, vendor_payout_cents, order_id,
        buyer_confirmed_at, vendor_confirmed_at, vendor_profile_id,
        order:orders!inner(id, order_number, buyer_user_id),
        listing:listings(title, vendor_profiles(profile_data))
      `)
      .eq('id', orderItemId)
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (fetchError || !orderItem) {
      throw traced.notFound('ERR_ORDER_001', 'Order item not found', { orderItemId })
    }

    // Buyer must have confirmed first
    crumb.logic('Checking buyer confirmation status')
    if (!orderItem.buyer_confirmed_at) {
      throw traced.validation('ERR_ORDER_004', 'Buyer has not acknowledged receipt yet. Wait for buyer to acknowledge first.')
    }

    // Already confirmed
    if (orderItem.vendor_confirmed_at) {
      throw traced.validation('ERR_ORDER_004', 'Already confirmed', { vendor_confirmed_at: orderItem.vendor_confirmed_at })
    }

    const now = new Date()

    // Set vendor confirmation and clear lockdown
    crumb.supabase('update', 'order_items')
    await supabase
      .from('order_items')
      .update({
        vendor_confirmed_at: now.toISOString(),
        lockdown_active: false,
        lockdown_initiated_at: null,
        status: 'fulfilled' // Ensure status is fulfilled
      })
      .eq('id', orderItemId)

    // Trigger Stripe transfer to vendor
    crumb.logic('Processing vendor payout')
    const isDev = process.env.NODE_ENV !== 'production'
    const hasStripe = !!vendorProfile.stripe_account_id

    if (hasStripe) {
      try {
        const transfer = await transferToVendor({
          amount: orderItem.vendor_payout_cents,
          destination: vendorProfile.stripe_account_id,
          orderId: orderItem.order_id,
          orderItemId: orderItem.id,
        })

        crumb.supabase('insert', 'vendor_payouts')
        await supabase.from('vendor_payouts').insert({
          order_item_id: orderItem.id,
          vendor_profile_id: vendorProfile.id,
          amount_cents: orderItem.vendor_payout_cents,
          stripe_transfer_id: transfer.id,
          status: 'processing',
        })
      } catch (transferError) {
        console.error('Stripe transfer failed:', transferError)
        throw traced.external('ERR_ORDER_004', 'Failed to process vendor payout', { orderItemId })
      }
    } else if (isDev) {
      // Dev mode without Stripe
      console.log(`[DEV] Skipping Stripe payout for order item ${orderItemId}`)
      crumb.supabase('insert', 'vendor_payouts')
      await supabase.from('vendor_payouts').insert({
        order_item_id: orderItem.id,
        vendor_profile_id: vendorProfile.id,
        amount_cents: orderItem.vendor_payout_cents,
        stripe_transfer_id: `dev_skip_${orderItemId}`,
        status: 'skipped_dev',
      })
    } else {
      throw traced.validation('ERR_ORDER_004', 'Stripe account not connected')
    }

    // Atomically mark order completed if all items are fully confirmed
    crumb.logic('Checking atomic order completion')
    await supabase.rpc('atomic_complete_order_if_ready', { p_order_id: orderItem.order_id })

    // Notify buyer that order is fulfilled
    const handoffOrderData = (orderItem as any).order as any
    const handoffListing = (orderItem as any).listing as any
    const handoffVendorName = handoffListing?.vendor_profiles?.profile_data?.business_name || 'Vendor'
    await sendNotification(handoffOrderData.buyer_user_id, 'order_fulfilled', {
      orderNumber: handoffOrderData.order_number,
      vendorName: handoffVendorName,
      itemTitle: handoffListing?.title,
    })

    return NextResponse.json({
      success: true,
      message: 'Handoff confirmed. Payment is being transferred to your account.',
      vendor_confirmed_at: now.toISOString()
    })
  })
}
