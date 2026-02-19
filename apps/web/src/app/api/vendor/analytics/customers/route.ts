import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import { getFtTierExtras } from '@/lib/vendor-limits'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/analytics/customers', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-analytics-customers:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendor_id')
    let startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    if (!vendorId) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    // Verify the user owns this vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, tier, vertical_id')
      .eq('id', vendorId)
      .single()

    if (!vendorProfile || vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to view this vendor analytics' }, { status: 403 })
    }

    // FT tier-based analytics day clamping
    if (vendorProfile.vertical_id === 'food_trucks') {
      const extras = getFtTierExtras(vendorProfile.tier || 'free')
      if (extras.analyticsDays === 0) {
        return NextResponse.json({ totalCustomers: 0, returningCustomers: 0, newCustomers: 0, averageOrdersPerCustomer: 0 })
      }
      const earliest = new Date(Date.now() - extras.analyticsDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (startDate < earliest) startDate = earliest
    }

    // C7 FIX: Query order_items joined with orders for buyer_user_id
    const { data: currentItems, error } = await supabase
      .from('order_items')
      .select('id, order:orders!inner(buyer_user_id)')
      .eq('vendor_profile_id', vendorId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get order items before the start date to identify returning customers
    const { data: previousItems } = await supabase
      .from('order_items')
      .select('order:orders!inner(buyer_user_id)')
      .eq('vendor_profile_id', vendorId)
      .lt('created_at', `${startDate}T00:00:00`)

    const previousCustomers = new Set(
      (previousItems || []).map((item: any) => {
        const order = Array.isArray(item.order) ? item.order[0] : item.order
        return order?.buyer_user_id
      }).filter(Boolean)
    )

    // Calculate customer metrics
    const customerOrders: Record<string, number> = {}
    const newCustomerIds = new Set<string>()
    const returningCustomerIds = new Set<string>()

    for (const item of currentItems || []) {
      const orderData = (item as any).order
      const order = Array.isArray(orderData) ? orderData[0] : orderData
      const buyerId = order?.buyer_user_id
      if (!buyerId) continue

      // Count orders per customer
      customerOrders[buyerId] = (customerOrders[buyerId] || 0) + 1

      // Determine if new or returning
      if (previousCustomers.has(buyerId)) {
        returningCustomerIds.add(buyerId)
      } else {
        if (!newCustomerIds.has(buyerId) && !returningCustomerIds.has(buyerId)) {
          newCustomerIds.add(buyerId)
        }
      }
    }

    const totalCustomers = Object.keys(customerOrders).length
    const returningCustomers = returningCustomerIds.size
    const newCustomers = newCustomerIds.size
    const totalOrders = currentItems?.length || 0
    const averageOrdersPerCustomer = totalCustomers > 0
      ? Math.round((totalOrders / totalCustomers) * 100) / 100
      : 0

    return NextResponse.json({
      totalCustomers,
      returningCustomers,
      newCustomers,
      averageOrdersPerCustomer
    })
  })
}
