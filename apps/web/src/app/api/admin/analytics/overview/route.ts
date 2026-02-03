import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'

export async function GET(request: NextRequest) {
  // Verify admin role using centralized utility
  const { isAdmin } = await verifyAdminForApi()

  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams
  const verticalId = searchParams.get('vertical_id') // Optional - filter by vertical
  const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]

  // Use service client for full access
  const serviceClient = createServiceClient()

  // Build queries - all independent, run in parallel
  const txQuery = serviceClient
    .from('transactions')
    .select(`
      id,
      status,
      created_at,
      listing:listings(price_cents, vertical_id)
    `)
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`)

  // Apply vertical filter to transactions if specified
  const txQueryFinal = verticalId ? txQuery.eq('listing.vertical_id', verticalId) : txQuery

  // Run all queries in parallel
  const [
    txResult,
    usersResult,
    vendorsResult,
    listingsResult,
    newUsersResult
  ] = await Promise.all([
    // Query 1: Transactions
    txQueryFinal,
    // Query 2: Total user count
    serviceClient
      .from('user_profiles')
      .select('id', { count: 'exact', head: true }),
    // Query 3: Vendor count (with optional vertical filter)
    verticalId
      ? serviceClient
          .from('vendor_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('vertical_id', verticalId)
      : serviceClient
          .from('vendor_profiles')
          .select('id', { count: 'exact', head: true }),
    // Query 4: Listings (with optional vertical filter)
    verticalId
      ? serviceClient
          .from('listings')
          .select('id, status', { count: 'exact' })
          .is('deleted_at', null)
          .eq('vertical_id', verticalId)
      : serviceClient
          .from('listings')
          .select('id, status', { count: 'exact' })
          .is('deleted_at', null),
    // Query 5: New signups in date range
    serviceClient
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)
  ])

  const { data: transactions, error: txError } = txResult
  const { count: totalUsers } = usersResult
  const { count: totalVendors } = vendorsResult
  const { data: listingsData, count: totalListings } = listingsResult
  const { count: newUsers } = newUsersResult

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 })
  }

  // Calculate transaction metrics
  let totalRevenue = 0
  let completedOrders = 0
  let pendingOrders = 0
  let cancelledOrders = 0

  for (const tx of transactions || []) {
    const listingData = tx.listing as unknown
    const listing = Array.isArray(listingData) ? listingData[0] : listingData
    const priceCents = (listing as { price_cents?: number })?.price_cents || 0

    if (tx.status === 'fulfilled') {
      completedOrders++
      totalRevenue += priceCents
    } else if (tx.status === 'accepted' || tx.status === 'initiated') {
      pendingOrders++
    } else if (tx.status === 'canceled' || tx.status === 'declined') {
      cancelledOrders++
    }
  }

  const totalOrders = (transactions || []).length
  const averageOrderValue = completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0
  const publishedListings = listingsData?.filter(l => l.status === 'published').length || 0

  return NextResponse.json({
    // Transaction metrics
    totalRevenue,
    totalOrders,
    averageOrderValue,
    completedOrders,
    pendingOrders,
    cancelledOrders,
    // Platform metrics
    totalUsers: totalUsers || 0,
    totalVendors: totalVendors || 0,
    totalListings: totalListings || 0,
    publishedListings,
    newUsers: newUsers || 0
  })
}
