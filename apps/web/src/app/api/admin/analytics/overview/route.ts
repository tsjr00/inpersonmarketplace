import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin' ||
                  profile?.role === 'platform_admin' ||
                  profile?.roles?.includes('admin') ||
                  profile?.roles?.includes('platform_admin')

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

  // Build transactions query
  let txQuery = serviceClient
    .from('transactions')
    .select(`
      id,
      status,
      created_at,
      listing:listings(price_cents, vertical_id)
    `)
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`)

  // Filter by vertical if specified
  if (verticalId) {
    txQuery = txQuery.eq('listing.vertical_id', verticalId)
  }

  const { data: transactions, error: txError } = await txQuery

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

  // Get user counts
  let usersQuery = serviceClient
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })

  const { count: totalUsers } = await usersQuery

  // Get vendor counts
  let vendorsQuery = serviceClient
    .from('vendor_profiles')
    .select('id', { count: 'exact', head: true })

  if (verticalId) {
    vendorsQuery = vendorsQuery.eq('vertical_id', verticalId)
  }

  const { count: totalVendors } = await vendorsQuery

  // Get listings counts
  let listingsQuery = serviceClient
    .from('listings')
    .select('id, status', { count: 'exact' })
    .is('deleted_at', null)

  if (verticalId) {
    listingsQuery = listingsQuery.eq('vertical_id', verticalId)
  }

  const { data: listingsData, count: totalListings } = await listingsQuery

  const publishedListings = listingsData?.filter(l => l.status === 'published').length || 0

  // Get new signups in date range
  const { count: newUsers } = await serviceClient
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`)

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
