import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/listings', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`listings:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const searchParams = request.nextUrl.searchParams
    const vertical = searchParams.get('vertical')
    const adminRequested = searchParams.get('admin') === 'true'
    const status = searchParams.get('status')
    const vendorId = searchParams.get('vendor_id')

    if (!vertical) {
      return NextResponse.json({ error: 'vertical parameter is required' }, { status: 400 })
    }

    try {
      // Verify admin role BEFORE using service client
      // SECURITY: Query param alone is not sufficient - must verify actual admin role
      let isAdmin = false
      if (adminRequested) {
        const { isAdmin: verified } = await verifyAdminForApi()
        isAdmin = verified
        if (!verified) {
          // Silently fall back to regular client if not admin
          // This prevents information disclosure about admin status
        }
      }

      // Use service client only for verified admins
      const supabase = isAdmin ? createServiceClient() : await createClient()

      let query = supabase
        .from('listings')
        .select(`
          id,
          title,
          description,
          status,
          price_cents,
          category,
          created_at,
          updated_at,
          vertical_id,
          vendor_profile_id,
          vendor_profiles (
            id,
            tier,
            profile_data
          )
        `)
        .eq('vertical_id', vertical)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      // Apply status filter if provided
      if (status && status !== 'all') {
        query = query.eq('status', status)
      }

      // Filter by vendor if provided (for vendor's own listings view)
      if (vendorId) {
        query = query.eq('vendor_profile_id', vendorId)
      }

      // For non-admin queries, only show published listings
      if (!isAdmin) {
        query = query.eq('status', 'published')
      }

      const { data: listings, error } = await query

      if (error) {
        console.error('Error fetching listings:', error)
        return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
      }

      // Cache public listings for 5 minutes, admin queries are not cached
      const cacheHeaders = isAdmin
        ? { 'Cache-Control': 'private, no-store' }
        : { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }

      return NextResponse.json({ listings: listings || [] }, { headers: cacheHeaders })
    } catch (error) {
      console.error('Error in listings API:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
