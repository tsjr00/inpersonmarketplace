import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'

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
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  const supabase = await createClient()
  const supabaseService = createServiceClient()

  // Verify admin authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('roles')
    .eq('user_id', user.id)
    .single()

  if (!profile?.roles?.includes('admin')) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body: ReportRequest = await request.json()
  const { reportId, dateFrom, dateTo, verticalId } = body

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
  let query = supabase
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
        tier: vendor.tier || 'standard',
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
      tier: vendor.tier || 'standard',
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
      vendor_tier: listing.vendor_profiles?.tier || 'standard',
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
