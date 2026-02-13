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

    // Get aggregated top vendors from SQL function (GROUP BY instead of fetch-all)
    const { data: rpcData, error: txError } = await serviceClient.rpc('get_top_vendors', {
      p_start_date: startDate,
      p_end_date: endDate,
      p_vertical_id: verticalId || null,
      p_limit: limit,
    })

    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    if (!rpcData || rpcData.length === 0) {
      return NextResponse.json([])
    }

    // Fetch vendor profile details for the top vendor IDs
    const topVendorIds = rpcData.map((r: { vendor_profile_id: string }) => r.vendor_profile_id)

    const { data: vendorProfiles } = await serviceClient
      .from('vendor_profiles')
      .select('id, vertical_id, tier, profile_data')
      .in('id', topVendorIds)

    // Build result with vendor details, preserving SQL sort order
    const topVendors = rpcData.map((row: { vendor_profile_id: string; total_sales: number; revenue: number }) => {
      const profile = vendorProfiles?.find(p => p.id === row.vendor_profile_id)
      const profileData = profile?.profile_data as { business_name?: string; farm_name?: string } | null

      return {
        vendor_id: row.vendor_profile_id,
        name: profileData?.business_name || profileData?.farm_name || 'Unknown Vendor',
        vertical_id: profile?.vertical_id || null,
        tier: profile?.tier || 'standard',
        total_sales: Number(row.total_sales),
        revenue: Number(row.revenue)
      }
    })

    return NextResponse.json(topVendors)
  })
}
