import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

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
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

    if (!vendorId) {
      return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
    }

    // Verify the user owns this vendor profile
    const { data: vendorProfile } = await supabase
      .from('vendor_profiles')
      .select('id, user_id')
      .eq('id', vendorId)
      .single()

    if (!vendorProfile || vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized to view this vendor analytics' }, { status: 403 })
    }

    // Get all transactions for this vendor in date range
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, buyer_user_id, created_at')
      .eq('vendor_profile_id', vendorId)
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get transactions before the start date to identify returning customers
    const { data: previousTransactions } = await supabase
      .from('transactions')
      .select('buyer_user_id')
      .eq('vendor_profile_id', vendorId)
      .lt('created_at', `${startDate}T00:00:00`)

    const previousCustomers = new Set(
      (previousTransactions || []).map(tx => tx.buyer_user_id)
    )

    // Calculate customer metrics
    const customerOrders: Record<string, number> = {}
    const newCustomerIds = new Set<string>()
    const returningCustomerIds = new Set<string>()

    for (const tx of transactions || []) {
      const buyerId = tx.buyer_user_id

      // Count orders per customer
      customerOrders[buyerId] = (customerOrders[buyerId] || 0) + 1

      // Determine if new or returning
      if (previousCustomers.has(buyerId)) {
        returningCustomerIds.add(buyerId)
      } else {
        // Check if they made multiple orders in this period (first order makes them new, subsequent don't)
        if (!newCustomerIds.has(buyerId) && !returningCustomerIds.has(buyerId)) {
          newCustomerIds.add(buyerId)
        }
      }
    }

    const totalCustomers = Object.keys(customerOrders).length
    const returningCustomers = returningCustomerIds.size
    const newCustomers = newCustomerIds.size
    const totalOrders = transactions?.length || 0
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
