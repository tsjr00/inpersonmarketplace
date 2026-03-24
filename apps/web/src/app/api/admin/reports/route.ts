import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { verifyAdminScope } from '@/lib/auth/admin'

interface ReportRequest {
  reportId: string
  dateFrom: string
  dateTo: string
  verticalId?: string // Optional vertical filter for platform admin
}

// Helper to convert data to CSV
function toCSV(data: Record<string, unknown>[], headers: { key: string; label: string }[]): string {
  if (data.length === 0) {
    return headers.map(h => h.label).join(',') + '\n'
  }

  const headerRow = headers.map(h => `"${h.label}"`).join(',')
  const rows = data.map(row =>
    headers.map(h => {
      const value = row[h.key]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`
      if (typeof value === 'number') return value.toString()
      if (value instanceof Date) return `"${value.toISOString()}"`
      return `"${String(value).replace(/"/g, '""')}"`
    }).join(',')
  )

  return [headerRow, ...rows].join('\n')
}

// Format cents to dollars for display
function formatCents(cents: number | null): string {
  if (cents === null || cents === undefined) return '$0.00'
  return `$${(cents / 100).toFixed(2)}`
}

// Format date for reports
function formatDate(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/admin/reports', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const body: ReportRequest = await request.json()
    const { reportId, dateFrom, dateTo, verticalId } = body

    // H-7: Verify admin scope (platform admin sees all, vertical admin sees only their vertical)
    const scope = await verifyAdminScope(verticalId)
    if (!scope) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!scope.authorized) {
      return NextResponse.json({ error: 'Vertical ID required for vertical admins' }, { status: 403 })
    }

    const supabaseService = createServiceClient()

    // Extend dateTo to end of day
    const dateToEnd = `${dateTo}T23:59:59.999Z`
    const dateFromStart = `${dateFrom}T00:00:00.000Z`

    // For filename prefix
    const verticalPrefix = verticalId ? `${verticalId}_` : ''

    let csvContent: string
    let filename: string

    try {
      switch (reportId) {
        case 'sales_summary':
          csvContent = await generateSalesSummary(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}sales_summary_${dateFrom}_to_${dateTo}.csv`
          break

        case 'revenue_fees':
          csvContent = await generateRevenueFees(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}revenue_fees_${dateFrom}_to_${dateTo}.csv`
          break

        case 'sales_by_category':
          csvContent = await generateSalesByCategory(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}sales_by_category_${dateFrom}_to_${dateTo}.csv`
          break

        case 'order_details':
          csvContent = await generateOrderDetails(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}order_details_${dateFrom}_to_${dateTo}.csv`
          break

        case 'order_status':
          csvContent = await generateOrderStatus(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}order_status_${dateFrom}_to_${dateTo}.csv`
          break

        case 'cancellations':
          csvContent = await generateCancellations(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}cancellations_${dateFrom}_to_${dateTo}.csv`
          break

        case 'market_performance':
          csvContent = await generateMarketPerformance(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}market_performance_${dateFrom}_to_${dateTo}.csv`
          break

        case 'vendor_performance':
          csvContent = await generateVendorPerformance(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}vendor_performance_${dateFrom}_to_${dateTo}.csv`
          break

        case 'vendor_payouts':
          csvContent = await generateVendorPayouts(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}vendor_payouts_${dateFrom}_to_${dateTo}.csv`
          break

        case 'vendor_roster':
          csvContent = await generateVendorRoster(supabaseService, verticalId)
          filename = `${verticalPrefix}vendor_roster_${dateTo}.csv`
          break

        case 'customer_summary':
          csvContent = await generateCustomerSummary(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}customer_summary_${dateFrom}_to_${dateTo}.csv`
          break

        case 'top_customers':
          csvContent = await generateTopCustomers(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}top_customers_${dateFrom}_to_${dateTo}.csv`
          break

        case 'customer_retention':
          csvContent = await generateCustomerRetention(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}customer_retention_${dateFrom}_to_${dateTo}.csv`
          break

        case 'listing_inventory':
          csvContent = await generateListingInventory(supabaseService, verticalId)
          filename = `${verticalPrefix}listing_inventory_${dateTo}.csv`
          break

        case 'product_performance':
          csvContent = await generateProductPerformance(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}product_performance_${dateFrom}_to_${dateTo}.csv`
          break

        // Accounting reports (platform admin)
        case 'transaction_reconciliation':
          csvContent = await generateTransactionReconciliation(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}transaction_reconciliation_${dateFrom}_to_${dateTo}.csv`
          break

        case 'refund_detail':
          csvContent = await generateRefundDetail(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}refund_detail_${dateFrom}_to_${dateTo}.csv`
          break

        case 'external_fee_ledger':
          csvContent = await generateExternalFeeLedger(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}external_fee_ledger_${dateFrom}_to_${dateTo}.csv`
          break

        case 'subscription_revenue':
          csvContent = await generateSubscriptionRevenue(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}subscription_revenue_${dateFrom}_to_${dateTo}.csv`
          break

        case 'tax_summary':
          csvContent = await generateTaxSummary(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}tax_summary_${dateFrom}_to_${dateTo}.csv`
          break

        case 'monthly_pnl':
          csvContent = await generateMonthlyPnl(supabaseService, dateFromStart, dateToEnd, verticalId)
          filename = `${verticalPrefix}monthly_pnl_${dateFrom}_to_${dateTo}.csv`
          break

        default:
          return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
      }

      // Return CSV as downloadable file
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    } catch (error) {
      console.error(`[Reports] Error generating ${reportId}:`, error)
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Failed to generate report'
      }, { status: 500 })
    }
  })
}

// ============================================================================
// SALES & REVENUE REPORTS
// ============================================================================

async function generateSalesSummary(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  // Get orders in date range
  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      total_cents,
      status,
      created_at,
      vertical_id,
      order_items (
        subtotal_cents,
        platform_fee_cents,
        market_id,
        markets (name)
      )
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data: orders } = await query

  // Aggregate by day
  const byDay = new Map<string, { orders: number; revenue: number }>()
  const byMarket = new Map<string, { orders: number; revenue: number }>()

  let totalOrders = 0
  let totalRevenue = 0

  orders?.forEach((order: any) => {
    const day = order.created_at.split('T')[0]
    const orderRevenue = order.order_items?.reduce((sum: number, item: any) => sum + (item.subtotal_cents || 0), 0) || 0

    totalOrders++
    totalRevenue += orderRevenue

    // By day
    if (!byDay.has(day)) byDay.set(day, { orders: 0, revenue: 0 })
    byDay.get(day)!.orders++
    byDay.get(day)!.revenue += orderRevenue

    // By market
    order.order_items?.forEach((item: any) => {
      const marketName = item.markets?.name || 'Unknown'
      if (!byMarket.has(marketName)) byMarket.set(marketName, { orders: 0, revenue: 0 })
      byMarket.get(marketName)!.revenue += item.subtotal_cents || 0
    })
  })

  // Build CSV with summary section and detailed breakdowns
  const lines: string[] = []

  // Summary section
  lines.push('SALES SUMMARY REPORT')
  lines.push(`"Date Range","${dateFrom.split('T')[0]} to ${dateTo.split('T')[0]}"`)
  lines.push('')
  lines.push('OVERALL SUMMARY')
  lines.push(`"Total Orders",${totalOrders}`)
  lines.push(`"Total Revenue","${formatCents(totalRevenue)}"`)
  lines.push(`"Average Order Value","${formatCents(totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0)}"`)
  lines.push('')

  // By day breakdown
  lines.push('DAILY BREAKDOWN')
  lines.push('"Date","Orders","Revenue"')
  Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([day, data]) => {
      lines.push(`"${day}",${data.orders},"${formatCents(data.revenue)}"`)
    })
  lines.push('')

  // By market breakdown
  lines.push('BY MARKET')
  lines.push('"Market","Revenue"')
  Array.from(byMarket.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .forEach(([market, data]) => {
      lines.push(`"${market}","${formatCents(data.revenue)}"`)
    })

  return lines.join('\n')
}

async function generateRevenueFees(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      subtotal_cents,
      platform_fee_cents,
      vendor_payout_cents,
      status,
      created_at,
      order:orders!inner (created_at, status, vertical_id)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  let grossSales = 0
  let platformFees = 0
  let vendorPayouts = 0
  let cancelledAmount = 0

  items?.forEach((item: any) => {
    if (item.status === 'cancelled' || item.order?.status === 'cancelled') {
      cancelledAmount += item.subtotal_cents || 0
    } else {
      grossSales += item.subtotal_cents || 0
      platformFees += item.platform_fee_cents || 0
      vendorPayouts += item.vendor_payout_cents || 0
    }
  })

  const data = [
    { metric: 'Gross Sales', amount: formatCents(grossSales) },
    { metric: 'Platform Fees Collected', amount: formatCents(platformFees) },
    { metric: 'Vendor Payouts (Owed)', amount: formatCents(vendorPayouts) },
    { metric: 'Net Platform Revenue', amount: formatCents(platformFees) },
    { metric: 'Cancelled/Refunded', amount: formatCents(cancelledAmount) },
  ]

  return toCSV(data, [
    { key: 'metric', label: 'Metric' },
    { key: 'amount', label: 'Amount' }
  ])
}

async function generateSalesByCategory(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      subtotal_cents,
      quantity,
      listing:listings (category, vertical_id),
      order:orders!inner (created_at, status, vertical_id)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  const byCategory = new Map<string, { orders: number; quantity: number; revenue: number }>()

  items?.forEach((item: any) => {
    if (item.order?.status === 'cancelled') return
    const category = item.listing?.category || 'Uncategorized'
    if (!byCategory.has(category)) byCategory.set(category, { orders: 0, quantity: 0, revenue: 0 })
    byCategory.get(category)!.orders++
    byCategory.get(category)!.quantity += item.quantity || 0
    byCategory.get(category)!.revenue += item.subtotal_cents || 0
  })

  const data = Array.from(byCategory.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([category, stats]) => ({
      category,
      order_count: stats.orders,
      units_sold: stats.quantity,
      revenue: formatCents(stats.revenue),
      avg_order_value: formatCents(stats.orders > 0 ? Math.round(stats.revenue / stats.orders) : 0)
    }))

  return toCSV(data, [
    { key: 'category', label: 'Category' },
    { key: 'order_count', label: 'Order Count' },
    { key: 'units_sold', label: 'Units Sold' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'avg_order_value', label: 'Avg Order Value' }
  ])
}

// ============================================================================
// OPERATIONS REPORTS
// ============================================================================

async function generateOrderDetails(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_cents,
      created_at,
      buyer_user_id,
      vertical_id,
      order_items (
        id,
        quantity,
        unit_price_cents,
        subtotal_cents,
        platform_fee_cents,
        vendor_payout_cents,
        status,
        pickup_date,
        cancelled_at,
        cancelled_by,
        listing:listings (
          title,
          category,
          vendor_profile_id,
          vendor_profiles (profile_data)
        ),
        market:markets (name, city, state)
      )
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .order('created_at', { ascending: false })

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data: orders } = await query

  // Get buyer info
  const buyerIds = [...new Set(orders?.map((o: any) => o.buyer_user_id).filter(Boolean) || [])]
  const { data: buyers } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, email')
    .in('user_id', buyerIds)

  const buyerMap = new Map(buyers?.map((b: any) => [b.user_id, b]) || [])

  const rows: Record<string, unknown>[] = []

  orders?.forEach((order: any) => {
    const buyer = buyerMap.get(order.buyer_user_id) as any
    order.order_items?.forEach((item: any) => {
      const vendor = item.listing?.vendor_profiles?.profile_data as any
      rows.push({
        order_number: order.order_number,
        order_date: formatDate(order.created_at),
        order_status: order.status,
        customer_name: buyer?.display_name || 'Unknown',
        customer_email: buyer?.email || '',
        item_title: item.listing?.title || 'Unknown',
        category: item.listing?.category || '',
        vendor_name: vendor?.business_name || vendor?.farm_name || 'Unknown',
        market: item.market?.name || '',
        market_location: item.market ? `${item.market.city}, ${item.market.state}` : '',
        quantity: item.quantity,
        unit_price: formatCents(item.unit_price_cents),
        subtotal: formatCents(item.subtotal_cents),
        platform_fee: formatCents(item.platform_fee_cents),
        vendor_payout: formatCents(item.vendor_payout_cents),
        item_status: item.status,
        pickup_date: formatDate(item.pickup_date),
        cancelled: item.cancelled_at ? 'Yes' : 'No',
        cancelled_by: item.cancelled_by || ''
      })
    })
  })

  return toCSV(rows, [
    { key: 'order_number', label: 'Order Number' },
    { key: 'order_date', label: 'Order Date' },
    { key: 'order_status', label: 'Order Status' },
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'customer_email', label: 'Customer Email' },
    { key: 'item_title', label: 'Item' },
    { key: 'category', label: 'Category' },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'market', label: 'Market' },
    { key: 'market_location', label: 'Market Location' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unit_price', label: 'Unit Price' },
    { key: 'subtotal', label: 'Subtotal' },
    { key: 'platform_fee', label: 'Platform Fee' },
    { key: 'vendor_payout', label: 'Vendor Payout' },
    { key: 'item_status', label: 'Item Status' },
    { key: 'pickup_date', label: 'Pickup Date' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'cancelled_by', label: 'Cancelled By' }
  ])
}

async function generateOrderStatus(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('orders')
    .select('status, vertical_id')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data: orders } = await query

  const statusCounts = new Map<string, number>()
  orders?.forEach((o: any) => {
    statusCounts.set(o.status, (statusCounts.get(o.status) || 0) + 1)
  })

  const total = orders?.length || 0
  const data = Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '0%'
    }))

  return toCSV(data, [
    { key: 'status', label: 'Status' },
    { key: 'count', label: 'Count' },
    { key: 'percentage', label: 'Percentage' }
  ])
}

async function generateCancellations(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  const query = supabase
    .from('order_items')
    .select(`
      id,
      quantity,
      subtotal_cents,
      cancelled_at,
      cancelled_by,
      cancellation_reason,
      refund_amount_cents,
      listing:listings (title, vertical_id, vendor_profiles (profile_data)),
      order:orders (order_number, buyer_user_id, vertical_id)
    `)
    .not('cancelled_at', 'is', null)
    .gte('cancelled_at', dateFrom)
    .lte('cancelled_at', dateTo)

  // Note: vertical filter applied via listing or order
  const { data: items } = await query

  // Filter by vertical if specified (post-query since nested filter is complex)
  const filteredItems = verticalId
    ? items?.filter((item: any) => item.order?.vertical_id === verticalId || item.listing?.vertical_id === verticalId)
    : items

  // Get buyer names
  const buyerIds = [...new Set(filteredItems?.map((i: any) => i.order?.buyer_user_id).filter(Boolean) || [])]
  const { data: buyers } = await supabase
    .from('user_profiles')
    .select('user_id, display_name')
    .in('user_id', buyerIds.length > 0 ? buyerIds : ['none'])

  const buyerMap = new Map(buyers?.map((b: any) => [b.user_id, b.display_name]) || [])

  const data = filteredItems?.map((item: any) => {
    const vendor = item.listing?.vendor_profiles?.profile_data as any
    return {
      order_number: item.order?.order_number || '',
      cancelled_date: formatDate(item.cancelled_at),
      cancelled_by: item.cancelled_by || 'Unknown',
      item: item.listing?.title || 'Unknown',
      vendor: vendor?.business_name || vendor?.farm_name || 'Unknown',
      customer: buyerMap.get(item.order?.buyer_user_id) || 'Unknown',
      quantity: item.quantity,
      original_amount: formatCents(item.subtotal_cents),
      refund_amount: formatCents(item.refund_amount_cents),
      reason: item.cancellation_reason || ''
    }
  }) || []

  return toCSV(data, [
    { key: 'order_number', label: 'Order Number' },
    { key: 'cancelled_date', label: 'Cancelled Date' },
    { key: 'cancelled_by', label: 'Cancelled By' },
    { key: 'item', label: 'Item' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'customer', label: 'Customer' },
    { key: 'quantity', label: 'Qty' },
    { key: 'original_amount', label: 'Original Amount' },
    { key: 'refund_amount', label: 'Refund Amount' },
    { key: 'reason', label: 'Reason' }
  ])
}

async function generateMarketPerformance(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      subtotal_cents,
      vendor_profile_id,
      market:markets (id, name, city, state, market_type, vertical_id),
      order:orders!inner (buyer_user_id, created_at, status, vertical_id)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  const marketStats = new Map<string, {
    name: string
    location: string
    type: string
    revenue: number
    orderCount: number
    customers: Set<string>
    vendors: Set<string>
  }>()

  items?.forEach((item: any) => {
    if (item.order?.status === 'cancelled') return
    const market = item.market
    if (!market) return

    const marketId = market.id
    if (!marketStats.has(marketId)) {
      marketStats.set(marketId, {
        name: market.name,
        location: `${market.city}, ${market.state}`,
        type: market.market_type,
        revenue: 0,
        orderCount: 0,
        customers: new Set(),
        vendors: new Set()
      })
    }

    const stats = marketStats.get(marketId)!
    stats.revenue += item.subtotal_cents || 0
    stats.orderCount++
    if (item.order?.buyer_user_id) stats.customers.add(item.order.buyer_user_id)
    if (item.vendor_profile_id) stats.vendors.add(item.vendor_profile_id)
  })

  const data = Array.from(marketStats.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map(stats => ({
      market_name: stats.name,
      location: stats.location,
      market_type: stats.type,
      total_revenue: formatCents(stats.revenue),
      order_count: stats.orderCount,
      unique_customers: stats.customers.size,
      unique_vendors: stats.vendors.size,
      avg_order_value: formatCents(stats.orderCount > 0 ? Math.round(stats.revenue / stats.orderCount) : 0)
    }))

  return toCSV(data, [
    { key: 'market_name', label: 'Market' },
    { key: 'location', label: 'Location' },
    { key: 'market_type', label: 'Type' },
    { key: 'total_revenue', label: 'Total Revenue' },
    { key: 'order_count', label: 'Order Count' },
    { key: 'unique_customers', label: 'Unique Customers' },
    { key: 'unique_vendors', label: 'Unique Vendors' },
    { key: 'avg_order_value', label: 'Avg Order Value' }
  ])
}

// ============================================================================
// VENDOR REPORTS
// ============================================================================

async function generateVendorPerformance(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      subtotal_cents,
      platform_fee_cents,
      vendor_payout_cents,
      status,
      cancelled_at,
      created_at,
      pickup_confirmed_at,
      vendor_profile_id,
      vendor_profiles (
        id,
        profile_data,
        tier,
        vertical_id
      ),
      order:orders!inner (created_at, status, vertical_id)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  const vendorStats = new Map<string, {
    name: string
    tier: string
    totalSales: number
    orderCount: number
    cancelledCount: number
    fulfilledCount: number
    totalFulfillmentTime: number
  }>()

  items?.forEach((item: any) => {
    const vendor = item.vendor_profiles
    if (!vendor) return

    const vendorId = vendor.id
    const profileData = vendor.profile_data as any

    if (!vendorStats.has(vendorId)) {
      vendorStats.set(vendorId, {
        name: profileData?.business_name || profileData?.farm_name || 'Unknown',
        tier: vendor.tier || 'free',
        totalSales: 0,
        orderCount: 0,
        cancelledCount: 0,
        fulfilledCount: 0,
        totalFulfillmentTime: 0
      })
    }

    const stats = vendorStats.get(vendorId)!
    stats.orderCount++

    if (item.cancelled_at) {
      stats.cancelledCount++
    } else {
      stats.totalSales += item.subtotal_cents || 0
      if (item.status === 'fulfilled' && item.pickup_confirmed_at && item.created_at) {
        stats.fulfilledCount++
        const created = new Date(item.created_at).getTime()
        const fulfilled = new Date(item.pickup_confirmed_at).getTime()
        stats.totalFulfillmentTime += (fulfilled - created) / (1000 * 60 * 60) // hours
      }
    }
  })

  const data = Array.from(vendorStats.values())
    .sort((a, b) => b.totalSales - a.totalSales)
    .map(stats => ({
      vendor_name: stats.name,
      tier: stats.tier,
      total_sales: formatCents(stats.totalSales),
      order_count: stats.orderCount,
      fulfilled_count: stats.fulfilledCount,
      cancelled_count: stats.cancelledCount,
      cancellation_rate: stats.orderCount > 0 ? `${((stats.cancelledCount / stats.orderCount) * 100).toFixed(1)}%` : '0%',
      avg_fulfillment_hours: stats.fulfilledCount > 0 ? (stats.totalFulfillmentTime / stats.fulfilledCount).toFixed(1) : 'N/A'
    }))

  return toCSV(data, [
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'tier', label: 'Tier' },
    { key: 'total_sales', label: 'Total Sales' },
    { key: 'order_count', label: 'Total Orders' },
    { key: 'fulfilled_count', label: 'Fulfilled' },
    { key: 'cancelled_count', label: 'Cancelled' },
    { key: 'cancellation_rate', label: 'Cancellation Rate' },
    { key: 'avg_fulfillment_hours', label: 'Avg Fulfillment (hrs)' }
  ])
}

async function generateVendorPayouts(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      subtotal_cents,
      platform_fee_cents,
      vendor_payout_cents,
      status,
      created_at,
      vendor_profiles (
        id,
        profile_data,
        vertical_id
      ),
      order:orders!inner (order_number, created_at, status, vertical_id)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  const data = items?.filter((item: any) => item.order?.status !== 'cancelled')
    .map((item: any) => {
      const vendor = item.vendor_profiles?.profile_data as any
      return {
        order_number: item.order?.order_number || '',
        order_date: formatDate(item.order?.created_at),
        vendor: vendor?.business_name || vendor?.farm_name || 'Unknown',
        gross_sales: formatCents(item.subtotal_cents),
        platform_fee: formatCents(item.platform_fee_cents),
        vendor_payout: formatCents(item.vendor_payout_cents),
        status: item.status
      }
    }) || []

  return toCSV(data, [
    { key: 'order_number', label: 'Order Number' },
    { key: 'order_date', label: 'Order Date' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'gross_sales', label: 'Gross Sales' },
    { key: 'platform_fee', label: 'Platform Fee' },
    { key: 'vendor_payout', label: 'Vendor Payout' },
    { key: 'status', label: 'Status' }
  ])
}

async function generateVendorRoster(supabase: ReturnType<typeof createServiceClient>, verticalId?: string) {
  let query = supabase
    .from('vendor_profiles')
    .select(`
      id,
      tier,
      status,
      profile_data,
      created_at,
      user_id,
      vertical_id,
      market_vendors (
        markets (name)
      ),
      listings (id)
    `)
    .order('created_at', { ascending: false })

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data: vendors } = await query

  // Get user emails
  const userIds = vendors?.map((v: any) => v.user_id).filter(Boolean) || []
  const { data: users } = await supabase
    .from('user_profiles')
    .select('user_id, email, phone')
    .in('user_id', userIds)

  const userMap = new Map(users?.map((u: any) => [u.user_id, u]) || [])

  const data = vendors?.map((vendor: any) => {
    const profile = vendor.profile_data as any
    const user = userMap.get(vendor.user_id) as any
    const markets = vendor.market_vendors?.map((mv: any) => mv.markets?.name).filter(Boolean).join(', ')

    return {
      vendor_name: profile?.business_name || profile?.farm_name || 'Unknown',
      tier: vendor.tier || 'free',
      status: vendor.status || 'active',
      vertical: vendor.vertical_id,
      email: user?.email || profile?.email || '',
      phone: user?.phone || profile?.phone || '',
      markets: markets || 'None',
      listing_count: vendor.listings?.length || 0,
      joined: formatDate(vendor.created_at)
    }
  }) || []

  return toCSV(data, [
    { key: 'vendor_name', label: 'Vendor Name' },
    { key: 'tier', label: 'Tier' },
    { key: 'status', label: 'Status' },
    { key: 'vertical', label: 'Vertical' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'markets', label: 'Markets' },
    { key: 'listing_count', label: 'Listings' },
    { key: 'joined', label: 'Joined' }
  ])
}

// ============================================================================
// CUSTOMER REPORTS
// ============================================================================

async function generateCustomerSummary(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('orders')
    .select(`
      buyer_user_id,
      total_cents,
      created_at,
      status,
      vertical_id,
      order_items (
        market:markets (name)
      )
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data: orders } = await query

  // Get customer profiles
  const buyerIds = [...new Set(orders?.map((o: any) => o.buyer_user_id).filter(Boolean) || [])]
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, email, created_at')
    .in('user_id', buyerIds)

  const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || [])

  // Aggregate by customer
  const customerStats = new Map<string, {
    orderCount: number
    totalSpent: number
    lastOrder: string
    markets: Set<string>
  }>()

  orders?.forEach((order: any) => {
    const buyerId = order.buyer_user_id
    if (!buyerId) return

    if (!customerStats.has(buyerId)) {
      customerStats.set(buyerId, {
        orderCount: 0,
        totalSpent: 0,
        lastOrder: order.created_at,
        markets: new Set()
      })
    }

    const stats = customerStats.get(buyerId)!
    stats.orderCount++
    stats.totalSpent += order.total_cents || 0
    if (order.created_at > stats.lastOrder) stats.lastOrder = order.created_at

    order.order_items?.forEach((item: any) => {
      if (item.market?.name) stats.markets.add(item.market.name)
    })
  })

  const data = Array.from(customerStats.entries())
    .sort((a, b) => b[1].totalSpent - a[1].totalSpent)
    .map(([buyerId, stats]) => {
      const profile = profileMap.get(buyerId) as any
      return {
        customer_name: profile?.display_name || 'Unknown',
        email: profile?.email || '',
        order_count: stats.orderCount,
        total_spent: formatCents(stats.totalSpent),
        avg_order_value: formatCents(stats.orderCount > 0 ? Math.round(stats.totalSpent / stats.orderCount) : 0),
        last_order: formatDate(stats.lastOrder),
        preferred_markets: Array.from(stats.markets).join(', ') || 'N/A',
        customer_since: formatDate(profile?.created_at)
      }
    })

  return toCSV(data, [
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'email', label: 'Email' },
    { key: 'order_count', label: 'Orders' },
    { key: 'total_spent', label: 'Total Spent' },
    { key: 'avg_order_value', label: 'Avg Order' },
    { key: 'last_order', label: 'Last Order' },
    { key: 'preferred_markets', label: 'Markets Shopped' },
    { key: 'customer_since', label: 'Customer Since' }
  ])
}

async function generateTopCustomers(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  // Same as customer summary but limited to top 50
  let query = supabase
    .from('orders')
    .select('buyer_user_id, total_cents, created_at, status, vertical_id')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data: orders } = await query

  const buyerIds = [...new Set(orders?.map((o: any) => o.buyer_user_id).filter(Boolean) || [])]
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, email')
    .in('user_id', buyerIds)

  const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) || [])

  const customerTotals = new Map<string, { orders: number; total: number }>()

  orders?.forEach((order: any) => {
    const buyerId = order.buyer_user_id
    if (!buyerId) return

    if (!customerTotals.has(buyerId)) {
      customerTotals.set(buyerId, { orders: 0, total: 0 })
    }
    customerTotals.get(buyerId)!.orders++
    customerTotals.get(buyerId)!.total += order.total_cents || 0
  })

  const data = Array.from(customerTotals.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 50)
    .map(([buyerId, stats], index) => {
      const profile = profileMap.get(buyerId) as any
      return {
        rank: index + 1,
        customer_name: profile?.display_name || 'Unknown',
        email: profile?.email || '',
        order_count: stats.orders,
        total_spent: formatCents(stats.total)
      }
    })

  return toCSV(data, [
    { key: 'rank', label: 'Rank' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'email', label: 'Email' },
    { key: 'order_count', label: 'Orders' },
    { key: 'total_spent', label: 'Total Spent' }
  ])
}

async function generateCustomerRetention(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  // Get all customers and their first order date
  let allOrdersQuery = supabase
    .from('orders')
    .select('buyer_user_id, created_at, vertical_id')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })

  if (verticalId) {
    allOrdersQuery = allOrdersQuery.eq('vertical_id', verticalId)
  }

  const { data: allOrders } = await allOrdersQuery

  // Track first purchase per customer
  const customerFirstPurchase = new Map<string, string>()
  allOrders?.forEach((order: any) => {
    if (!customerFirstPurchase.has(order.buyer_user_id)) {
      customerFirstPurchase.set(order.buyer_user_id, order.created_at)
    }
  })

  // Get orders in date range
  let periodQuery = supabase
    .from('orders')
    .select('buyer_user_id, created_at, vertical_id')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    periodQuery = periodQuery.eq('vertical_id', verticalId)
  }

  const { data: periodOrders } = await periodQuery

  // Count orders per customer in period
  const customerOrderCounts = new Map<string, number>()
  periodOrders?.forEach((order: any) => {
    customerOrderCounts.set(order.buyer_user_id, (customerOrderCounts.get(order.buyer_user_id) || 0) + 1)
  })

  let newCustomers = 0
  let returningCustomers = 0
  let repeatPurchasers = 0

  customerOrderCounts.forEach((count, buyerId) => {
    const firstPurchase = customerFirstPurchase.get(buyerId)
    if (firstPurchase && firstPurchase >= dateFrom && firstPurchase <= dateTo) {
      newCustomers++
    } else {
      returningCustomers++
    }
    if (count > 1) {
      repeatPurchasers++
    }
  })

  const totalCustomers = customerOrderCounts.size
  const data = [
    { metric: 'Total Unique Customers', value: totalCustomers, percentage: '100%' },
    { metric: 'New Customers (First Purchase in Period)', value: newCustomers, percentage: totalCustomers > 0 ? `${((newCustomers / totalCustomers) * 100).toFixed(1)}%` : '0%' },
    { metric: 'Returning Customers', value: returningCustomers, percentage: totalCustomers > 0 ? `${((returningCustomers / totalCustomers) * 100).toFixed(1)}%` : '0%' },
    { metric: 'Repeat Purchasers (2+ Orders in Period)', value: repeatPurchasers, percentage: totalCustomers > 0 ? `${((repeatPurchasers / totalCustomers) * 100).toFixed(1)}%` : '0%' },
  ]

  return toCSV(data, [
    { key: 'metric', label: 'Metric' },
    { key: 'value', label: 'Count' },
    { key: 'percentage', label: 'Percentage' }
  ])
}

// ============================================================================
// INVENTORY REPORTS
// ============================================================================

async function generateListingInventory(supabase: ReturnType<typeof createServiceClient>, verticalId?: string) {
  let query = supabase
    .from('listings')
    .select(`
      id,
      title,
      status,
      price_cents,
      category,
      stock_quantity,
      created_at,
      updated_at,
      vertical_id,
      vendor_profiles (
        profile_data,
        tier
      ),
      listing_markets (
        markets (name)
      )
    `)
    .order('title', { ascending: true })

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data: listings } = await query

  const data = listings?.map((listing: any) => {
    const vendor = listing.vendor_profiles?.profile_data as any
    const markets = listing.listing_markets?.map((lm: any) => lm.markets?.name).filter(Boolean).join(', ')

    return {
      title: listing.title,
      status: listing.status,
      category: listing.category || 'Uncategorized',
      price: formatCents(listing.price_cents),
      stock: listing.stock_quantity ?? 'Unlimited',
      vendor: vendor?.business_name || vendor?.farm_name || 'Unknown',
      vendor_tier: listing.vendor_profiles?.tier || 'free',
      markets: markets || 'None',
      created: formatDate(listing.created_at),
      last_updated: formatDate(listing.updated_at)
    }
  }) || []

  return toCSV(data, [
    { key: 'title', label: 'Title' },
    { key: 'status', label: 'Status' },
    { key: 'category', label: 'Category' },
    { key: 'price', label: 'Price' },
    { key: 'stock', label: 'Stock' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'vendor_tier', label: 'Vendor Tier' },
    { key: 'markets', label: 'Available Markets' },
    { key: 'created', label: 'Created' },
    { key: 'last_updated', label: 'Last Updated' }
  ])
}

async function generateProductPerformance(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      quantity,
      subtotal_cents,
      listing:listings (
        id,
        title,
        category,
        price_cents,
        vertical_id,
        vendor_profiles (profile_data)
      ),
      order:orders!inner (created_at, status, vertical_id)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  const productStats = new Map<string, {
    title: string
    category: string
    vendor: string
    price: number
    orderCount: number
    unitsSold: number
    revenue: number
  }>()

  items?.forEach((item: any) => {
    if (item.order?.status === 'cancelled') return
    const listing = item.listing
    if (!listing) return

    const listingId = listing.id
    const vendor = listing.vendor_profiles?.profile_data as any

    if (!productStats.has(listingId)) {
      productStats.set(listingId, {
        title: listing.title,
        category: listing.category || 'Uncategorized',
        vendor: vendor?.business_name || vendor?.farm_name || 'Unknown',
        price: listing.price_cents,
        orderCount: 0,
        unitsSold: 0,
        revenue: 0
      })
    }

    const stats = productStats.get(listingId)!
    stats.orderCount++
    stats.unitsSold += item.quantity || 0
    stats.revenue += item.subtotal_cents || 0
  })

  const data = Array.from(productStats.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((stats, index) => ({
      rank: index + 1,
      title: stats.title,
      category: stats.category,
      vendor: stats.vendor,
      unit_price: formatCents(stats.price),
      times_ordered: stats.orderCount,
      units_sold: stats.unitsSold,
      total_revenue: formatCents(stats.revenue)
    }))

  return toCSV(data, [
    { key: 'rank', label: 'Rank' },
    { key: 'title', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'unit_price', label: 'Unit Price' },
    { key: 'times_ordered', label: 'Times Ordered' },
    { key: 'units_sold', label: 'Units Sold' },
    { key: 'total_revenue', label: 'Total Revenue' }
  ])
}

// ============================================================================
// ACCOUNTING REPORTS (Platform Admin)
// ============================================================================

async function generateTransactionReconciliation(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  // Every payment with Stripe IDs for bank reconciliation
  let query = supabase
    .from('payments')
    .select(`
      id,
      order_id,
      stripe_payment_intent_id,
      amount_cents,
      status,
      created_at,
      order:orders!inner (
        order_number,
        total_cents,
        vertical_id,
        payment_method,
        tip_amount,
        tip_on_platform_fee_cents,
        buyer_user_id,
        order_items (
          id,
          subtotal_cents,
          platform_fee_cents,
          vendor_payout_cents,
          status,
          refund_amount_cents,
          listing:listings (title, vendor_profile_id)
        )
      )
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: payments } = await query

  // Also get vendor payouts for transfer IDs
  const payoutQuery = supabase
    .from('vendor_payouts')
    .select(`
      id,
      order_item_id,
      vendor_profile_id,
      amount_cents,
      stripe_transfer_id,
      status,
      created_at
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)

  const { data: payouts } = await payoutQuery

  // Build payout lookup by order_item_id
  const payoutMap = new Map<string, typeof payouts extends (infer T)[] | null ? T : never>()
  payouts?.forEach(p => {
    if (p.order_item_id) payoutMap.set(p.order_item_id, p)
  })

  const rows: Record<string, unknown>[] = []

  payments?.forEach((payment: any) => {
    const order = payment.order
    if (!order) return

    order.order_items?.forEach((item: any) => {
      const payout = payoutMap.get(item.id)
      rows.push({
        date: formatDate(payment.created_at),
        order_number: order.order_number,
        vertical: order.vertical_id,
        payment_method: order.payment_method || 'stripe',
        stripe_payment_id: payment.stripe_payment_intent_id || '',
        item: item.listing?.title || 'Unknown',
        item_subtotal: formatCents(item.subtotal_cents),
        buyer_fee: formatCents(item.platform_fee_cents),
        buyer_total: formatCents((item.subtotal_cents || 0) + (item.platform_fee_cents || 0)),
        vendor_payout: formatCents(item.vendor_payout_cents),
        platform_fee_kept: formatCents((item.platform_fee_cents || 0) + ((item.subtotal_cents || 0) - (item.vendor_payout_cents || 0) - (item.platform_fee_cents || 0))),
        tip: formatCents(order.tip_amount || 0),
        tip_platform_portion: formatCents(order.tip_on_platform_fee_cents || 0),
        refund_amount: formatCents(item.refund_amount_cents || 0),
        item_status: item.status,
        stripe_transfer_id: payout?.stripe_transfer_id || '',
        transfer_status: payout?.status || 'pending',
        transfer_amount: payout ? formatCents(payout.amount_cents) : '',
      })
    })
  })

  return toCSV(rows, [
    { key: 'date', label: 'Date' },
    { key: 'order_number', label: 'Order #' },
    { key: 'vertical', label: 'Vertical' },
    { key: 'payment_method', label: 'Payment Method' },
    { key: 'stripe_payment_id', label: 'Stripe Payment ID' },
    { key: 'item', label: 'Item' },
    { key: 'item_subtotal', label: 'Item Subtotal' },
    { key: 'buyer_fee', label: 'Buyer Fee' },
    { key: 'buyer_total', label: 'Buyer Paid' },
    { key: 'vendor_payout', label: 'Vendor Payout' },
    { key: 'platform_fee_kept', label: 'Platform Revenue' },
    { key: 'tip', label: 'Tip Total' },
    { key: 'tip_platform_portion', label: 'Tip (Platform Portion)' },
    { key: 'refund_amount', label: 'Refund Amount' },
    { key: 'item_status', label: 'Item Status' },
    { key: 'stripe_transfer_id', label: 'Stripe Transfer ID' },
    { key: 'transfer_status', label: 'Transfer Status' },
    { key: 'transfer_amount', label: 'Transfer Amount' },
  ])
}

async function generateRefundDetail(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      id,
      subtotal_cents,
      refund_amount_cents,
      cancellation_fee_cents,
      status,
      cancelled_at,
      cancelled_by,
      cancellation_reason,
      order:orders!inner (
        order_number,
        total_cents,
        vertical_id,
        payment_method,
        buyer_user_id
      ),
      listing:listings (title)
    `)
    .not('cancelled_at', 'is', null)
    .gte('cancelled_at', dateFrom)
    .lte('cancelled_at', dateTo)

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  const rows = (items || []).map((item: any) => ({
    date: formatDate(item.cancelled_at),
    order_number: item.order?.order_number || '',
    vertical: item.order?.vertical_id || '',
    payment_method: item.order?.payment_method || '',
    item: item.listing?.title || 'Unknown',
    item_subtotal: formatCents(item.subtotal_cents),
    refund_amount: formatCents(item.refund_amount_cents || 0),
    cancellation_fee: formatCents(item.cancellation_fee_cents || 0),
    cancelled_by: item.cancelled_by || '',
    reason: item.cancellation_reason || '',
    item_status: item.status,
  }))

  return toCSV(rows, [
    { key: 'date', label: 'Cancellation Date' },
    { key: 'order_number', label: 'Order #' },
    { key: 'vertical', label: 'Vertical' },
    { key: 'payment_method', label: 'Payment Method' },
    { key: 'item', label: 'Item' },
    { key: 'item_subtotal', label: 'Original Subtotal' },
    { key: 'refund_amount', label: 'Refund Amount' },
    { key: 'cancellation_fee', label: 'Cancellation Fee Kept' },
    { key: 'cancelled_by', label: 'Cancelled By' },
    { key: 'reason', label: 'Reason' },
    { key: 'item_status', label: 'Final Status' },
  ])
}

async function generateExternalFeeLedger(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  const query = supabase
    .from('vendor_fee_ledger')
    .select(`
      id,
      vendor_profile_id,
      order_item_id,
      fee_cents,
      fee_type,
      created_at,
      vendor_profiles (
        profile_data,
        vertical_id
      )
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)

  const { data: entries } = await query

  // Filter by vertical if needed (join filter)
  const filtered = verticalId
    ? (entries || []).filter((e: any) => e.vendor_profiles?.vertical_id === verticalId)
    : (entries || [])

  // Also get current balances
  const { data: balances } = await supabase
    .from('vendor_fee_balance')
    .select('vendor_profile_id, total_owed_cents, total_collected_cents, balance_cents')

  const balanceMap = new Map<string, any>()
  balances?.forEach((b: any) => balanceMap.set(b.vendor_profile_id, b))

  const rows = filtered.map((entry: any) => {
    const vendorName = (entry.vendor_profiles?.profile_data as any)?.business_name ||
                       (entry.vendor_profiles?.profile_data as any)?.farm_name || 'Unknown'
    const balance = balanceMap.get(entry.vendor_profile_id)
    return {
      date: formatDate(entry.created_at),
      vendor: vendorName,
      vertical: entry.vendor_profiles?.vertical_id || '',
      fee_type: entry.fee_type || 'external_payment',
      fee_amount: formatCents(entry.fee_cents),
      outstanding_balance: balance ? formatCents(balance.balance_cents) : '',
      total_owed: balance ? formatCents(balance.total_owed_cents) : '',
      total_collected: balance ? formatCents(balance.total_collected_cents) : '',
    }
  })

  return toCSV(rows, [
    { key: 'date', label: 'Date' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'vertical', label: 'Vertical' },
    { key: 'fee_type', label: 'Fee Type' },
    { key: 'fee_amount', label: 'Fee Amount' },
    { key: 'outstanding_balance', label: 'Outstanding Balance' },
    { key: 'total_owed', label: 'Total Owed (All Time)' },
    { key: 'total_collected', label: 'Total Collected (All Time)' },
  ])
}

async function generateSubscriptionRevenue(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  // Vendor subscriptions
  let vendorQuery = supabase
    .from('vendor_profiles')
    .select('id, tier, subscription_status, subscription_cycle, tier_started_at, tier_expires_at, stripe_subscription_id, vertical_id, profile_data')
    .not('tier', 'eq', 'free')
    .not('subscription_status', 'is', null)

  if (verticalId) {
    vendorQuery = vendorQuery.eq('vertical_id', verticalId)
  }

  const { data: vendors } = await vendorQuery

  // Buyer premium subscriptions
  const { data: buyers } = await supabase
    .from('user_profiles')
    .select('id, buyer_tier, subscription_status, subscription_cycle, tier_started_at, tier_expires_at, stripe_subscription_id, display_name, email')
    .eq('buyer_tier', 'premium')

  const rows: Record<string, unknown>[] = []

  vendors?.forEach((v: any) => {
    const name = (v.profile_data as any)?.business_name || (v.profile_data as any)?.farm_name || 'Unknown'
    rows.push({
      type: 'Vendor',
      name,
      vertical: v.vertical_id,
      tier: v.tier,
      cycle: v.subscription_cycle || 'monthly',
      status: v.subscription_status || 'active',
      started: formatDate(v.tier_started_at),
      expires: formatDate(v.tier_expires_at),
      stripe_sub_id: v.stripe_subscription_id || '',
      monthly_revenue: v.tier === 'pro' ? '$25.00' : v.tier === 'boss' ? '$50.00' : '$0.00',
    })
  })

  buyers?.forEach((b: any) => {
    rows.push({
      type: 'Buyer Premium',
      name: b.display_name || b.email || 'Unknown',
      vertical: 'all',
      tier: 'premium',
      cycle: b.subscription_cycle || 'monthly',
      status: b.subscription_status || 'active',
      started: formatDate(b.tier_started_at),
      expires: formatDate(b.tier_expires_at),
      stripe_sub_id: b.stripe_subscription_id || '',
      monthly_revenue: '$9.99',
    })
  })

  return toCSV(rows, [
    { key: 'type', label: 'Type' },
    { key: 'name', label: 'Name' },
    { key: 'vertical', label: 'Vertical' },
    { key: 'tier', label: 'Tier' },
    { key: 'cycle', label: 'Billing Cycle' },
    { key: 'status', label: 'Status' },
    { key: 'started', label: 'Started' },
    { key: 'expires', label: 'Expires' },
    { key: 'stripe_sub_id', label: 'Stripe Subscription ID' },
    { key: 'monthly_revenue', label: 'Monthly Revenue' },
  ])
}

async function generateTaxSummary(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  let query = supabase
    .from('order_items')
    .select(`
      subtotal_cents,
      platform_fee_cents,
      vendor_payout_cents,
      status,
      market:markets (state, city, zip),
      order:orders!inner (vertical_id, created_at, status, payment_method)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .neq('status', 'cancelled')

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  // Group by state
  const byState = new Map<string, { gross: number; fees: number; orders: number; stripe: number; external: number }>()

  items?.forEach((item: any) => {
    if (item.order?.status === 'cancelled') return
    const state = (item.market as any)?.state || 'Unknown'
    if (!byState.has(state)) byState.set(state, { gross: 0, fees: 0, orders: 0, stripe: 0, external: 0 })
    const s = byState.get(state)!
    s.gross += item.subtotal_cents || 0
    s.fees += item.platform_fee_cents || 0
    s.orders++
    if (item.order?.payment_method === 'stripe') {
      s.stripe += item.subtotal_cents || 0
    } else {
      s.external += item.subtotal_cents || 0
    }
  })

  const rows = Array.from(byState.entries())
    .sort((a, b) => b[1].gross - a[1].gross)
    .map(([state, data]) => ({
      state,
      order_count: data.orders,
      gross_sales: formatCents(data.gross),
      stripe_sales: formatCents(data.stripe),
      external_sales: formatCents(data.external),
      platform_fees: formatCents(data.fees),
    }))

  // Add totals row
  const totals = Array.from(byState.values()).reduce((acc, d) => ({
    gross: acc.gross + d.gross,
    fees: acc.fees + d.fees,
    orders: acc.orders + d.orders,
    stripe: acc.stripe + d.stripe,
    external: acc.external + d.external,
  }), { gross: 0, fees: 0, orders: 0, stripe: 0, external: 0 })

  rows.push({
    state: 'TOTAL',
    order_count: totals.orders,
    gross_sales: formatCents(totals.gross),
    stripe_sales: formatCents(totals.stripe),
    external_sales: formatCents(totals.external),
    platform_fees: formatCents(totals.fees),
  })

  return toCSV(rows, [
    { key: 'state', label: 'State' },
    { key: 'order_count', label: 'Orders' },
    { key: 'gross_sales', label: 'Gross Sales' },
    { key: 'stripe_sales', label: 'Stripe Sales' },
    { key: 'external_sales', label: 'External Sales' },
    { key: 'platform_fees', label: 'Platform Fee Revenue' },
  ])
}

async function generateMonthlyPnl(supabase: ReturnType<typeof createServiceClient>, dateFrom: string, dateTo: string, verticalId?: string) {
  // Get all order items in range
  let query = supabase
    .from('order_items')
    .select(`
      subtotal_cents,
      platform_fee_cents,
      vendor_payout_cents,
      refund_amount_cents,
      status,
      created_at,
      order:orders!inner (vertical_id, status, tip_amount, tip_on_platform_fee_cents, payment_method)
    `)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)

  if (verticalId) {
    query = query.eq('order.vertical_id', verticalId)
  }

  const { data: items } = await query

  // Group by month
  const byMonth = new Map<string, {
    grossSales: number
    platformFees: number
    vendorPayouts: number
    refunds: number
    tipRevenue: number
    stripeOrders: number
    externalOrders: number
    cancelledItems: number
  }>()

  items?.forEach((item: any) => {
    const month = item.created_at.substring(0, 7) // YYYY-MM
    if (!byMonth.has(month)) {
      byMonth.set(month, { grossSales: 0, platformFees: 0, vendorPayouts: 0, refunds: 0, tipRevenue: 0, stripeOrders: 0, externalOrders: 0, cancelledItems: 0 })
    }
    const m = byMonth.get(month)!

    if (item.status === 'cancelled' || item.order?.status === 'cancelled') {
      m.cancelledItems++
      m.refunds += item.refund_amount_cents || 0
    } else {
      m.grossSales += item.subtotal_cents || 0
      m.platformFees += item.platform_fee_cents || 0
      m.vendorPayouts += item.vendor_payout_cents || 0
      m.tipRevenue += item.order?.tip_on_platform_fee_cents || 0
      if (item.order?.payment_method === 'stripe') {
        m.stripeOrders++
      } else {
        m.externalOrders++
      }
    }
  })

  const rows = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => {
      const netRevenue = data.platformFees + data.tipRevenue
      // Estimate Stripe processing cost: ~2.9% + $0.30 per Stripe transaction
      const estimatedStripeCost = Math.round(data.grossSales * 0.029) + (data.stripeOrders * 30)
      const estimatedNetAfterStripe = netRevenue - estimatedStripeCost - data.refunds

      return {
        month,
        gross_sales: formatCents(data.grossSales),
        platform_fee_revenue: formatCents(data.platformFees),
        tip_platform_revenue: formatCents(data.tipRevenue),
        total_revenue: formatCents(netRevenue),
        vendor_payouts: formatCents(data.vendorPayouts),
        refunds_absorbed: formatCents(data.refunds),
        est_stripe_processing: formatCents(estimatedStripeCost),
        est_net_income: formatCents(estimatedNetAfterStripe),
        stripe_transactions: data.stripeOrders,
        external_transactions: data.externalOrders,
        cancelled_items: data.cancelledItems,
      }
    })

  return toCSV(rows, [
    { key: 'month', label: 'Month' },
    { key: 'gross_sales', label: 'Gross Sales' },
    { key: 'platform_fee_revenue', label: 'Platform Fee Revenue' },
    { key: 'tip_platform_revenue', label: 'Tip Revenue (Platform Portion)' },
    { key: 'total_revenue', label: 'Total Platform Revenue' },
    { key: 'vendor_payouts', label: 'Vendor Payouts' },
    { key: 'refunds_absorbed', label: 'Refunds Absorbed' },
    { key: 'est_stripe_processing', label: 'Est. Stripe Processing Cost' },
    { key: 'est_net_income', label: 'Est. Net Income' },
    { key: 'stripe_transactions', label: 'Stripe Transactions' },
    { key: 'external_transactions', label: 'External Transactions' },
    { key: 'cancelled_items', label: 'Cancelled Items' },
  ])
}
