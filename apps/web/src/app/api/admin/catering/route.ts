import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  rateLimits,
} from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

// GET - List catering requests (admin only)
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/catering', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `admin:${clientIp}`,
      rateLimits.admin
    )
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const serviceClient = createServiceClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const vertical = searchParams.get('vertical') || 'food_trucks'

    let query = serviceClient
      .from('catering_requests')
      .select('*')
      .eq('vertical_id', vertical)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: requests, error: fetchError } = await query

    if (fetchError) {
      console.error('[admin/catering] Fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch catering requests' },
        { status: 500 }
      )
    }

    // Also fetch approved vendors for the invite UI
    const { data: vendorProfiles } = await serviceClient
      .from('vendor_profiles')
      .select('id, user_id, profile_data')
      .eq('vertical_id', vertical)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })

    const vendors = (vendorProfiles || []).map((v) => ({
      id: v.id,
      business_name:
        (v.profile_data as Record<string, unknown>)?.business_name as string ||
        (v.profile_data as Record<string, unknown>)?.farm_name as string ||
        'Unknown',
    }))

    // Fetch market_vendors for any approved requests
    const marketIds = (requests || [])
      .filter((r) => r.market_id)
      .map((r) => r.market_id)

    const marketVendorsMap: Record<string, Array<{
      vendor_profile_id: string
      response_status: string | null
      response_notes: string | null
      invited_at: string | null
    }>> = {}

    if (marketIds.length > 0) {
      const { data: mvData } = await serviceClient
        .from('market_vendors')
        .select('market_id, vendor_profile_id, response_status, response_notes, invited_at')
        .in('market_id', marketIds)

      if (mvData) {
        for (const mv of mvData) {
          const mid = mv.market_id as string
          if (!marketVendorsMap[mid]) marketVendorsMap[mid] = []
          marketVendorsMap[mid].push({
            vendor_profile_id: mv.vendor_profile_id as string,
            response_status: mv.response_status as string | null,
            response_notes: mv.response_notes as string | null,
            invited_at: mv.invited_at as string | null,
          })
        }
      }
    }

    return NextResponse.json({
      requests: requests || [],
      vendors,
      marketVendorsMap,
    })
  })
}
