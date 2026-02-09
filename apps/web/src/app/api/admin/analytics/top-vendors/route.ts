import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/analytics/top-vendors', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    // Verify admin role using centralized utility
    const { isAdmin } = await verifyAdminForApi()

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const verticalId = searchParams.get('vertical_id')
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = searchParams.get('end_date') || new Date().toISOString().split('T')[0]
    const limit = parseInt(searchParams.get('limit') || '10')

    // Use service client for full access
    const serviceClient = createServiceClient()

    // Build transactions query - get fulfilled transactions
    let txQuery = serviceClient
      .from('transactions')
      .select(`
        id,
        vendor_profile_id,
        listing:listings(price_cents, vertical_id)
      `)
      .eq('status', 'fulfilled')
      .gte('created_at', `${startDate}T00:00:00`)
      .lte('created_at', `${endDate}T23:59:59`)

    if (verticalId) {
      txQuery = txQuery.eq('listing.vertical_id', verticalId)
    }

    const { data: transactions, error: txError } = await txQuery

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    // Aggregate by vendor
    const vendorStats: Record<string, {
      vendor_id: string
      total_sales: number
      revenue: number
    }> = {}

    for (const tx of transactions || []) {
      const vendorId = tx.vendor_profile_id
      if (!vendorId) continue

      const listingData = tx.listing as unknown
      const listing = Array.isArray(listingData) ? listingData[0] : listingData
      const priceCents = (listing as { price_cents?: number })?.price_cents || 0

      if (!vendorStats[vendorId]) {
        vendorStats[vendorId] = {
          vendor_id: vendorId,
          total_sales: 0,
          revenue: 0
        }
      }

      vendorStats[vendorId].total_sales++
      vendorStats[vendorId].revenue += priceCents
    }

    // Get vendor details for top vendors
    const topVendorIds = Object.values(vendorStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map(v => v.vendor_id)

    if (topVendorIds.length === 0) {
      return NextResponse.json([])
    }

    // Fetch vendor profile data
    const { data: vendorProfiles } = await serviceClient
      .from('vendor_profiles')
      .select('id, vertical_id, tier, profile_data')
      .in('id', topVendorIds)

    // Build result with vendor details
    const topVendors = topVendorIds.map(vendorId => {
      const stats = vendorStats[vendorId]
      const profile = vendorProfiles?.find(p => p.id === vendorId)
      const profileData = profile?.profile_data as { business_name?: string; farm_name?: string } | null

      return {
        vendor_id: vendorId,
        name: profileData?.business_name || profileData?.farm_name || 'Unknown Vendor',
        vertical_id: profile?.vertical_id || null,
        tier: profile?.tier || 'standard',
        total_sales: stats.total_sales,
        revenue: stats.revenue
      }
    })

    return NextResponse.json(topVendors)
  })
}
