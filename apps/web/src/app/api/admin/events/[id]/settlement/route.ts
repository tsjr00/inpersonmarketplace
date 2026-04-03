import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { FEES } from '@/lib/pricing'
import { SELLER_FEE_PERCENT, EXTERNAL_BUYER_FEE_FIXED_CENTS } from '@/lib/payments/vendor-fees'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET - Generate event settlement report for a catering request
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/events/[id]/settlement', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `admin:${clientIp}`,
      rateLimits.admin
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { id } = await context.params
    const serviceClient = createServiceClient()

    // Fetch catering request
    const { data: cateringReq, error: reqError } = await serviceClient
      .from('catering_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (reqError || !cateringReq) {
      return NextResponse.json(
        { error: 'Catering request not found' },
        { status: 404 }
      )
    }

    if (!cateringReq.market_id) {
      return NextResponse.json(
        { error: 'No event market linked to this request — approve the request first' },
        { status: 400 }
      )
    }

    // Fetch event market
    const { data: market } = await serviceClient
      .from('markets')
      .select('id, name, address, city, state, zip, event_start_date, event_end_date, headcount, wave_ordering_enabled')
      .eq('id', cateringReq.market_id)
      .single()

    // Fetch wave data if wave ordering is enabled
    let waveStats: Array<{ wave_number: number; start_time: string; end_time: string; capacity: number; reserved_count: number }> = []
    if (market?.wave_ordering_enabled) {
      const { data: waves } = await serviceClient
        .from('event_waves')
        .select('wave_number, start_time, end_time, capacity, reserved_count')
        .eq('market_id', cateringReq.market_id)
        .order('wave_number')
      waveStats = waves || []
    }

    // Fetch company payments
    const { data: companyPayments } = await serviceClient
      .from('event_company_payments')
      .select('id, payment_type, amount_cents, payment_method, status, paid_at')
      .eq('market_id', cateringReq.market_id)
      .order('created_at')

    // Fetch all order items for this market, joined with order + buyer + listing + vendor
    const { data: orderItems, error: itemsError } = await serviceClient
      .from('order_items')
      .select(`
        id,
        order_id,
        listing_id,
        vendor_profile_id,
        quantity,
        unit_price_cents,
        subtotal_cents,
        platform_fee_cents,
        vendor_payout_cents,
        status,
        pickup_date,
        preferred_pickup_time,
        pickup_confirmed_at,
        created_at,
        orders!inner (
          id,
          order_number,
          buyer_user_id,
          payment_method,
          payment_model,
          status,
          tip_amount,
          tip_on_platform_fee_cents,
          created_at
        ),
        listings!inner (
          title
        )
      `)
      .eq('market_id', cateringReq.market_id)
      .not('status', 'in', '("cancelled")')

    if (itemsError) {
      console.error('[settlement] Failed to fetch order items:', itemsError)
      return NextResponse.json(
        { error: 'Failed to fetch order data' },
        { status: 500 }
      )
    }

    // Collect unique buyer IDs and vendor IDs
    const buyerIds = new Set<string>()
    const vendorIds = new Set<string>()
    for (const item of orderItems || []) {
      const order = item.orders as unknown as { buyer_user_id: string }
      buyerIds.add(order.buyer_user_id)
      vendorIds.add(item.vendor_profile_id)
    }

    // Fetch buyer profiles
    const { data: buyerProfiles } = buyerIds.size > 0
      ? await serviceClient
          .from('user_profiles')
          .select('user_id, display_name, email')
          .in('user_id', Array.from(buyerIds))
      : { data: [] }

    const buyerMap = new Map(
      (buyerProfiles || []).map(b => [b.user_id, { name: b.display_name || 'Unknown', email: b.email || '' }])
    )

    // Fetch vendor profiles
    const { data: vendorProfiles } = vendorIds.size > 0
      ? await serviceClient
          .from('vendor_profiles')
          .select('id, business_name')
          .in('id', Array.from(vendorIds))
      : { data: [] }

    const vendorMap = new Map(
      (vendorProfiles || []).map(v => [v.id, v.business_name || 'Unknown Vendor'])
    )

    // Fetch market_vendors for response status
    const { data: marketVendors } = await serviceClient
      .from('market_vendors')
      .select('vendor_profile_id, response_status')
      .eq('market_id', cateringReq.market_id)

    const acceptedVendorCount = (marketVendors || []).filter(
      mv => mv.response_status === 'accepted'
    ).length

    // Group order items by vendor
    // Fee rules differ by payment method:
    //   Stripe:   buyer fee = 6.5% + $0.15/order | vendor fee = 6.5% + $0.15/order
    //   External: buyer fee = 6.5% (no $0.15)   | vendor fee = 3.5% (no $0.15)
    // For settlement we compute ALL fees from subtotal so the math is transparent.
    const vendorBreakdowns: Record<string, {
      vendorId: string
      vendorName: string
      orders: Array<{
        orderNumber: string
        buyerName: string
        buyerEmail: string
        items: string
        mealPriceCents: number
        pickupTime: string | null
        pickupDate: string | null
        status: string
        fulfilled: boolean
        paymentMethod: string
      }>
      totalOrders: number
      stripeOrders: number
      externalOrders: number
      grossRevenueCents: number
      buyerFeeCents: number
      buyerFlatFeeCents: number
      vendorFeeCents: number
      vendorFlatFeeCents: number
      netPayoutCents: number
    }> = {}

    // Track unique orders per vendor, split by payment method
    const vendorStripeOrderSets: Record<string, Set<string>> = {}
    const vendorExternalOrderSets: Record<string, Set<string>> = {}

    for (const item of orderItems || []) {
      const order = item.orders as unknown as {
        order_number: string
        buyer_user_id: string
        payment_method: string
        status: string
        tip_amount: number
        tip_on_platform_fee_cents: number
      }
      const listing = item.listings as unknown as { title: string }
      const vid = item.vendor_profile_id
      const isExternal = order.payment_method !== 'stripe'

      if (!vendorBreakdowns[vid]) {
        vendorBreakdowns[vid] = {
          vendorId: vid,
          vendorName: vendorMap.get(vid) || 'Unknown Vendor',
          orders: [],
          totalOrders: 0,
          stripeOrders: 0,
          externalOrders: 0,
          grossRevenueCents: 0,
          buyerFeeCents: 0,
          buyerFlatFeeCents: 0,
          vendorFeeCents: 0,
          vendorFlatFeeCents: 0,
          netPayoutCents: 0,
        }
        vendorStripeOrderSets[vid] = new Set()
        vendorExternalOrderSets[vid] = new Set()
      }

      const breakdown = vendorBreakdowns[vid]
      breakdown.grossRevenueCents += item.subtotal_cents

      // Buyer fee: 6.5% for both payment types (per item)
      const buyerPercentFee = Math.round(item.subtotal_cents * (FEES.buyerFeePercent / 100))
      breakdown.buyerFeeCents += buyerPercentFee

      if (isExternal) {
        // External: vendor fee = 3.5%, no flat fees from either side
        const sellerFee = Math.round(item.subtotal_cents * (SELLER_FEE_PERCENT / 100))
        breakdown.vendorFeeCents += sellerFee
        vendorExternalOrderSets[vid].add(item.order_id)
      } else {
        // Stripe: vendor fee = 6.5%, flat fees ($0.15 buyer + $0.15 vendor) added in second pass
        const vendorPercentFee = Math.round(item.subtotal_cents * (FEES.vendorFeePercent / 100))
        breakdown.vendorFeeCents += vendorPercentFee
        vendorStripeOrderSets[vid].add(item.order_id)
      }

      const buyer = buyerMap.get(order.buyer_user_id)

      breakdown.orders.push({
        orderNumber: order.order_number,
        buyerName: buyer?.name || 'Unknown',
        buyerEmail: buyer?.email || '',
        items: `${item.quantity}x ${listing.title}`,
        mealPriceCents: item.subtotal_cents,
        pickupTime: item.preferred_pickup_time,
        pickupDate: item.pickup_date,
        status: item.status,
        fulfilled: !!item.pickup_confirmed_at,
        paymentMethod: order.payment_method || 'stripe',
      })
    }

    // Flat fees + net payout: calculated from scratch
    // Stripe: $0.15/order from buyer + $0.15/order from vendor
    // External: $0 flat fees (no card involved)
    for (const vid of Object.keys(vendorBreakdowns)) {
      const stripeCount = vendorStripeOrderSets[vid].size
      const externalCount = vendorExternalOrderSets[vid].size
      const vendorFlat = stripeCount * FEES.vendorFlatFeeCents
      const buyerFlat = stripeCount * FEES.buyerFlatFeeCents + externalCount * EXTERNAL_BUYER_FEE_FIXED_CENTS
      vendorBreakdowns[vid].stripeOrders = stripeCount
      vendorBreakdowns[vid].externalOrders = externalCount
      vendorBreakdowns[vid].totalOrders = stripeCount + externalCount
      vendorBreakdowns[vid].vendorFlatFeeCents = vendorFlat
      vendorBreakdowns[vid].buyerFlatFeeCents = buyerFlat
      // Net vendor payout = gross - vendor % fee - vendor flat fee
      vendorBreakdowns[vid].netPayoutCents =
        vendorBreakdowns[vid].grossRevenueCents -
        vendorBreakdowns[vid].vendorFeeCents -
        vendorFlat
    }

    const vendorList = Object.values(vendorBreakdowns)

    // Grand totals
    const totalOrders = new Set((orderItems || []).map(i => i.order_id)).size
    const totalItems = (orderItems || []).length
    const totalGrossRevenueCents = vendorList.reduce((s, v) => s + v.grossRevenueCents, 0)
    const totalBuyerFeeCents = vendorList.reduce((s, v) => s + v.buyerFeeCents, 0)
    const totalBuyerFlatFeeCents = vendorList.reduce((s, v) => s + v.buyerFlatFeeCents, 0)
    const totalVendorFeeCents = vendorList.reduce((s, v) => s + v.vendorFeeCents, 0)
    const totalVendorFlatFeeCents = vendorList.reduce((s, v) => s + v.vendorFlatFeeCents, 0)
    const totalVendorPayoutCents = vendorList.reduce((s, v) => s + v.netPayoutCents, 0)
    const totalPlatformRevenueCents =
      totalBuyerFeeCents + totalBuyerFlatFeeCents +
      totalVendorFeeCents + totalVendorFlatFeeCents
    const totalFulfilledOrders = (orderItems || []).filter(i => !!i.pickup_confirmed_at).length

    // Orders paid by employee (stripe) vs external vs company-paid
    const employeePaidItems = (orderItems || []).filter(i => {
      const o = i.orders as unknown as { payment_method: string; payment_model?: string }
      return o.payment_method === 'stripe' && o.payment_model !== 'company_paid'
    })
    const externalPaidItems = (orderItems || []).filter(i => {
      const o = i.orders as unknown as { payment_method: string; payment_model?: string }
      return o.payment_method !== 'stripe' && o.payment_model !== 'company_paid'
    })
    const companyPaidItems = (orderItems || []).filter(i => {
      const o = i.orders as unknown as { payment_model?: string }
      return o.payment_model === 'company_paid'
    })

    const employeePaidCents = employeePaidItems.reduce((s, i) => s + i.subtotal_cents, 0)
    const companyOwedCents = externalPaidItems.reduce((s, i) => s + i.subtotal_cents, 0)
    const companyPaidCents = companyPaidItems.reduce((s, i) => s + i.subtotal_cents, 0)

    const totalStripeOrders = new Set(employeePaidItems.map(i => i.order_id)).size
    const totalExternalOrders = new Set(externalPaidItems.map(i => i.order_id)).size
    const totalCompanyPaidOrders = new Set(companyPaidItems.map(i => i.order_id)).size

    // Company payment totals
    const totalCompanyPaymentsCents = (companyPayments || [])
      .filter(p => p.status === 'paid')
      .reduce((s, p) => s + p.amount_cents, 0)

    return NextResponse.json({
      cateringRequest: {
        id: cateringReq.id,
        companyName: cateringReq.company_name,
        contactName: cateringReq.contact_name,
        contactEmail: cateringReq.contact_email,
        eventDate: cateringReq.event_date,
        eventEndDate: cateringReq.event_end_date,
        eventStartTime: cateringReq.event_start_time,
        eventEndTime: cateringReq.event_end_time,
        headcount: cateringReq.headcount,
        address: cateringReq.address,
        city: cateringReq.city,
        state: cateringReq.state,
        zip: cateringReq.zip,
        status: cateringReq.status,
      },
      market: market ? {
        id: market.id,
        name: market.name,
        address: market.address,
        city: market.city,
        state: market.state,
        zip: market.zip,
      } : null,
      vendors: vendorList,
      acceptedVendorCount,
      waveStats,
      companyPayments: companyPayments || [],
      paymentModel: cateringReq.payment_model || 'attendee_paid',
      summary: {
        totalOrders,
        totalItems,
        totalFulfilledOrders,
        totalStripeOrders,
        totalExternalOrders,
        totalGrossRevenueCents,
        totalBuyerFeeCents,
        totalBuyerFlatFeeCents,
        totalVendorFeeCents,
        totalVendorFlatFeeCents,
        totalPlatformRevenueCents,
        totalVendorPayoutCents,
        employeePaidCents,
        companyOwedCents,
        companyPaidCents,
        totalCompanyPaidOrders,
        totalCompanyPaymentsCents,
        companyPaymentBalance: totalCompanyPaymentsCents - companyPaidCents,
        headcount: cateringReq.headcount,
        participationRate: cateringReq.headcount > 0
          ? Math.round((totalOrders / cateringReq.headcount) * 100)
          : 0,
        feeStructure: {
          buyerFeePercent: FEES.buyerFeePercent,
          stripeVendorFeePercent: FEES.vendorFeePercent,
          externalVendorFeePercent: SELLER_FEE_PERCENT,
          stripeBuyerFlatFeeCents: FEES.buyerFlatFeeCents,
          stripeVendorFlatFeeCents: FEES.vendorFlatFeeCents,
        },
      },
    })
  })
}
