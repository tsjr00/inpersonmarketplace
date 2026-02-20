import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { generatePaymentLink, ExternalPaymentMethod } from '@/lib/payments/external-links'
import {
  calculateExternalBuyerFee,
  calculateExternalPaymentTotal,
  canUseExternalPayments
} from '@/lib/payments/vendor-fees'

/**
 * POST /api/checkout/external
 *
 * Creates an order for external payment (Venmo, Cash App, PayPal, Cash).
 * Returns payment link for the buyer.
 *
 * Requirements:
 * - Single vendor cart only (multi-vendor must use Stripe)
 * - Vendor must have Stripe connected
 * - Vendor must have the requested payment method configured
 */
export async function POST(request: NextRequest) {
  // Rate limit
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`checkout:${clientIp}`, { limit: 5, windowSeconds: 60 })

  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  return withErrorTracing('/api/checkout/external', 'POST', async () => {
    const supabase = await createClient()
    const { payment_method, vertical } = await request.json() as {
      payment_method: ExternalPaymentMethod
      vertical: string
    }

    if (!payment_method || !vertical) {
      throw traced.validation('ERR_CHECKOUT_001', 'payment_method and vertical are required')
    }

    if (!['venmo', 'cashapp', 'paypal', 'cash'].includes(payment_method)) {
      throw traced.validation('ERR_CHECKOUT_001', 'Invalid payment method')
    }

    // Auth
    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Get cart
    crumb.supabase('rpc', 'get_or_create_cart')
    const { data: verticalData } = await supabase
      .from('verticals')
      .select('id')
      .eq('vertical_id', vertical)
      .single()

    if (!verticalData) {
      throw traced.validation('ERR_CHECKOUT_001', 'Invalid vertical')
    }

    const { data: cartId } = await supabase.rpc('get_or_create_cart', {
      p_user_id: user.id,
      p_vertical_id: vertical
    })

    if (!cartId) {
      throw traced.validation('ERR_CHECKOUT_001', 'No cart found')
    }

    // Get cart items with listings and vendor info
    crumb.supabase('select', 'cart_items')
    const { data: cartItems, error: cartError } = await supabase
      .from('cart_items')
      .select(`
        id,
        listing_id,
        quantity,
        market_id,
        schedule_id,
        pickup_date,
        preferred_pickup_time,
        listings (
          id,
          title,
          price_cents,
          vendor_profile_id,
          vendor_profiles (
            id,
            profile_data,
            stripe_account_id,
            venmo_username,
            cashapp_cashtag,
            paypal_username,
            accepts_cash_at_pickup
          )
        ),
        markets (
          id,
          name,
          city,
          state
        )
      `)
      .eq('cart_id', cartId)

    if (cartError) {
      throw traced.fromSupabase(cartError, { table: 'cart_items', operation: 'select' })
    }

    if (!cartItems || cartItems.length === 0) {
      throw traced.validation('ERR_CHECKOUT_001', 'Cart is empty')
    }

    // Check single vendor requirement
    crumb.logic('Validating single vendor requirement')
    const vendorIds = new Set(
      cartItems.map(item => {
        const listing = item.listings as unknown as { vendor_profile_id: string }
        return listing.vendor_profile_id
      })
    )

    if (vendorIds.size > 1) {
      throw traced.validation('ERR_CHECKOUT_001',
        'External payment methods only work with single-vendor orders. Please use card payment or remove items from different vendors.')
    }

    // Get vendor info
    const firstListing = cartItems[0].listings as unknown as {
      vendor_profile_id: string
      vendor_profiles: {
        id: string
        profile_data: Record<string, unknown> | null
        stripe_account_id: string | null
        venmo_username: string | null
        cashapp_cashtag: string | null
        paypal_username: string | null
        accepts_cash_at_pickup: boolean | null
      }
    }

    const vendor = firstListing.vendor_profiles
    const vendorProfileId = vendor.id
    const vendorName = (vendor.profile_data?.business_name as string) ||
                       (vendor.profile_data?.farm_name as string) ||
                       'Vendor'

    // Check if vendor can use external payments
    crumb.logic('Checking vendor eligibility for external payments')
    const eligibility = await canUseExternalPayments(supabase, vendorProfileId)

    if (!eligibility.allowed) {
      throw traced.validation('ERR_CHECKOUT_001', eligibility.reason || 'Vendor cannot accept external payments')
    }

    // Check if vendor has this payment method configured
    crumb.logic('Validating payment method availability')
    let paymentMethodAvailable = false

    switch (payment_method) {
      case 'venmo':
        paymentMethodAvailable = !!vendor.venmo_username
        break
      case 'cashapp':
        paymentMethodAvailable = !!vendor.cashapp_cashtag
        break
      case 'paypal':
        paymentMethodAvailable = !!vendor.paypal_username
        break
      case 'cash':
        paymentMethodAvailable = !!vendor.accepts_cash_at_pickup
        break
    }

    if (!paymentMethodAvailable) {
      throw traced.validation('ERR_CHECKOUT_001', `Vendor does not accept ${payment_method} payments`)
    }

    // H3 FIX: Validate cutoff times + inventory before creating order
    crumb.logic('Checking cutoff times and inventory')
    const listingIds = cartItems.map(item => {
      const listing = item.listings as unknown as { id: string }
      return listing.id
    })

    // Parallel: cutoff check for each listing + inventory batch query
    const [cutoffResults, inventoryResult] = await Promise.all([
      Promise.all(
        listingIds.map(listingId =>
          supabase
            .rpc('is_listing_accepting_orders', { p_listing_id: listingId })
            .then(result => ({ listingId, ...result }))
        )
      ),
      supabase.from('listings').select('id, quantity').in('id', listingIds)
    ])

    // Check cutoff
    for (const { listingId, data: isAccepting, error: cutoffError } of cutoffResults) {
      if (cutoffError) {
        crumb.logic('Cutoff check unavailable (migration may not be applied)')
      } else if (isAccepting === false) {
        const listing = cartItems.find(ci => {
          const l = ci.listings as unknown as { id: string; title: string }
          return l.id === listingId
        })
        const title = (listing?.listings as unknown as { title: string })?.title || 'Item'
        throw traced.validation('ERR_CHECKOUT_001', `Orders for "${title}" are now closed. Please try again later.`, { code: 'CUTOFF_PASSED' })
      }
    }

    // Check inventory
    const inventoryMap = new Map<string, number | null>()
    for (const inv of inventoryResult.data || []) {
      inventoryMap.set(inv.id, inv.quantity)
    }

    for (const cartItem of cartItems) {
      const listing = cartItem.listings as unknown as { id: string; title: string }
      const currentQuantity = inventoryMap.get(listing.id)
      if (currentQuantity !== null && currentQuantity !== undefined && currentQuantity < cartItem.quantity) {
        if (currentQuantity === 0) {
          throw traced.validation('ERR_CHECKOUT_001', `"${listing.title}" is now out of stock.`, { code: 'OUT_OF_STOCK' })
        }
        throw traced.validation('ERR_CHECKOUT_001', `Only ${currentQuantity} of "${listing.title}" available (you requested ${cartItem.quantity}).`, { code: 'INSUFFICIENT_STOCK' })
      }
    }

    // Calculate totals
    crumb.logic('Calculating order totals')
    let subtotalCents = 0

    const orderItems = cartItems.map(item => {
      const listing = item.listings as unknown as {
        id: string
        title: string
        price_cents: number
        vendor_profile_id: string
      }

      const itemSubtotal = listing.price_cents * item.quantity
      subtotalCents += itemSubtotal

      const buyerFee = calculateExternalBuyerFee(itemSubtotal)

      return {
        listing_id: listing.id,
        vendor_profile_id: listing.vendor_profile_id,
        quantity: item.quantity,
        unit_price_cents: listing.price_cents,
        subtotal_cents: itemSubtotal,
        platform_fee_cents: buyerFee, // For external, we track buyer fee here
        vendor_payout_cents: itemSubtotal, // Vendor gets full subtotal (we invoice fees later)
        market_id: item.market_id,
        schedule_id: item.schedule_id || null,
        pickup_date: item.pickup_date || null,
        preferred_pickup_time: item.preferred_pickup_time || null
      }
    })

    // Total including buyer fee (external: 6.5% flat, no $0.15)
    const buyerFeeCents = calculateExternalBuyerFee(subtotalCents)
    const totalCents = calculateExternalPaymentTotal(subtotalCents)

    // Create order
    crumb.supabase('insert', 'orders')
    const orderNumber = `${vertical.toUpperCase().slice(0, 2)}-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_user_id: user.id,
        vertical_id: vertical,
        order_number: orderNumber,
        status: 'pending',
        subtotal_cents: subtotalCents,
        platform_fee_cents: buyerFeeCents,
        total_cents: totalCents,
        payment_method: payment_method
      })
      .select()
      .single()

    if (orderError) {
      throw traced.fromSupabase(orderError, { table: 'orders', operation: 'insert' })
    }

    // Create order items
    crumb.supabase('insert', 'order_items')
    const { error: itemsError } = await supabase.from('order_items').insert(
      orderItems.map(item => ({
        ...item,
        order_id: order.id
      }))
    )

    if (itemsError) {
      throw traced.fromSupabase(itemsError, { table: 'order_items', operation: 'insert' })
    }

    // H2 FIX: Decrement inventory at order creation (prevents overselling)
    // Inventory is restored if order expires/is cancelled via cron
    crumb.logic('Decrementing inventory at checkout')
    const serviceClient = createServiceClient()
    for (const item of orderItems) {
      const currentQuantity = inventoryMap.get(item.listing_id)
      if (currentQuantity !== null && currentQuantity !== undefined) {
        await serviceClient
          .rpc('atomic_decrement_inventory' as string, {
            p_listing_id: item.listing_id,
            p_quantity: item.quantity
          })
      }
    }

    // Clear the buyer's cart now that order is created
    crumb.supabase('delete', 'cart_items')
    await supabase.from('cart_items').delete().eq('cart_id', cartId)

    // Generate payment link
    const paymentLink = generatePaymentLink(
      payment_method,
      vendor,
      totalCents / 100, // Convert to dollars
      orderNumber
    )

    return NextResponse.json({
      order_id: order.id,
      order_number: orderNumber,
      payment_method,
      payment_link: paymentLink, // null for cash
      subtotal_cents: subtotalCents,
      buyer_fee_cents: buyerFeeCents,
      total_cents: totalCents,
      vendor_name: vendorName
    })
  })
}
