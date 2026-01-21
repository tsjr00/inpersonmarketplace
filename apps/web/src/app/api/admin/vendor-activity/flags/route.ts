import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/vendor-activity/flags
 *
 * List flagged vendors for admin review
 *
 * Query params:
 * - vertical: Filter by vertical ID
 * - status: Filter by flag status (pending, dismissed, actioned, resolved)
 * - reason: Filter by flag reason
 * - limit: Number of results (default 50)
 * - offset: Pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is admin
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const verticalId = searchParams.get('vertical')
  const status = searchParams.get('status') || 'pending'
  const reason = searchParams.get('reason')
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  try {
    // Build query for flags with vendor info
    let query = supabase
      .from('vendor_activity_flags')
      .select(`
        id,
        vendor_profile_id,
        vertical_id,
        reason,
        status,
        details,
        created_at,
        resolved_at,
        resolution_notes,
        action_taken,
        vendor:vendor_profiles (
          id,
          status,
          profile_data,
          last_active_at,
          last_login_at,
          first_listing_at,
          created_at,
          approved_at
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (verticalId) {
      query = query.eq('vertical_id', verticalId)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (reason) {
      query = query.eq('reason', reason)
    }

    const { data: flags, error, count } = await query

    if (error) {
      console.error('[VENDOR-ACTIVITY-FLAGS] Error fetching flags:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform the response to include vendor display info
    const transformedFlags = flags?.map(flag => {
      const vendor = flag.vendor as any
      const profileData = vendor?.profile_data as Record<string, unknown> | null

      return {
        id: flag.id,
        vendorProfileId: flag.vendor_profile_id,
        verticalId: flag.vertical_id,
        reason: flag.reason,
        status: flag.status,
        details: flag.details,
        createdAt: flag.created_at,
        resolvedAt: flag.resolved_at,
        resolutionNotes: flag.resolution_notes,
        actionTaken: flag.action_taken,
        vendor: vendor ? {
          id: vendor.id,
          status: vendor.status,
          businessName: (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown',
          email: profileData?.email as string,
          phone: profileData?.phone as string,
          lastActiveAt: vendor.last_active_at,
          lastLoginAt: vendor.last_login_at,
          firstListingAt: vendor.first_listing_at,
          createdAt: vendor.created_at,
          approvedAt: vendor.approved_at,
        } : null
      }
    })

    // Get summary counts by status
    const { data: statusCounts } = await supabase
      .from('vendor_activity_flags')
      .select('status')
      .then(({ data }) => {
        if (!data) return { data: {} }
        const counts: Record<string, number> = {}
        data.forEach(item => {
          counts[item.status] = (counts[item.status] || 0) + 1
        })
        return { data: counts }
      })

    return NextResponse.json({
      flags: transformedFlags,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      },
      summary: statusCounts
    })

  } catch (error) {
    console.error('[VENDOR-ACTIVITY-FLAGS] Error:', error)
    return NextResponse.json({
      error: 'Failed to fetch flags',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
