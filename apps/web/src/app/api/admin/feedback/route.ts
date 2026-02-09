import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

// GET - Get all feedback (admin only)
// Supports both shopper and vendor feedback via 'source' param
export async function GET(request: Request) {
  return withErrorTracing('/api/admin/feedback', 'GET', async () => {
    // Rate limit admin feedback requests
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin-feedback:${clientIp}`, { limit: 60, windowSeconds: 60 })

    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (profileError || !userProfile || (userProfile.role !== 'admin' && !userProfile.roles?.includes('admin'))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Use service client to bypass RLS for admin queries
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[/api/admin/feedback] SUPABASE_SERVICE_ROLE_KEY not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const serviceClient = createServiceClient()

    const { searchParams } = new URL(request.url)
    const vertical = searchParams.get('vertical')
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const source = searchParams.get('source') || 'shopper' // 'shopper' or 'vendor'

    // Choose table based on source
    const tableName = source === 'vendor' ? 'vendor_feedback' : 'shopper_feedback'

    // Use service client to bypass RLS - we've already verified admin access above
    let query = serviceClient
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false })

    if (vertical) {
      query = query.eq('vertical_id', vertical)
    }
    if (category) {
      query = query.eq('category', category)
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data: feedback, error: fetchError } = await query

    if (fetchError) {
      console.error('[/api/admin/feedback] Error fetching feedback:', fetchError.message)
      return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 })
    }

    // Get user emails for feedback items
    const userIds = [...new Set((feedback || []).map(f => f.user_id))]
    let userMap: Record<string, string> = {}

    if (userIds.length > 0) {
      const { data: users } = await serviceClient
        .from('user_profiles')
        .select('user_id, email')
        .in('user_id', userIds)

      if (users) {
        users.forEach(u => {
          userMap[u.user_id] = u.email || 'Unknown'
        })
      }
    }

    // For vendor feedback, also get vendor business names
    let vendorMap: Record<string, string> = {}
    if (source === 'vendor') {
      const vendorProfileIds = [...new Set((feedback || []).map(f => f.vendor_profile_id).filter(Boolean))]
      if (vendorProfileIds.length > 0) {
        const { data: vendors } = await serviceClient
          .from('vendor_profiles')
          .select('id, profile_data')
          .in('id', vendorProfileIds)

        if (vendors) {
          vendors.forEach(v => {
            const profileData = v.profile_data as Record<string, unknown> | null
            vendorMap[v.id] = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
          })
        }
      }
    }

    // Transform to include user email and vendor name (for vendor feedback)
    const transformedFeedback = (feedback || []).map(f => ({
      ...f,
      user_email: userMap[f.user_id] || 'Unknown',
      vendor_name: source === 'vendor' ? (vendorMap[f.vendor_profile_id] || 'Unknown Vendor') : undefined
    }))

    // Get counts by status
    const counts = {
      new: (feedback || []).filter(f => f.status === 'new').length,
      in_review: (feedback || []).filter(f => f.status === 'in_review').length,
      resolved: (feedback || []).filter(f => f.status === 'resolved').length,
      closed: (feedback || []).filter(f => f.status === 'closed').length,
      total: (feedback || []).length
    }

    return NextResponse.json({ feedback: transformedFeedback, counts, source })

    } catch (error) {
      console.error('[/api/admin/feedback] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}

// PATCH - Update feedback status/notes (admin only)
// Supports both shopper and vendor feedback via 'source' param
export async function PATCH(request: Request) {
  return withErrorTracing('/api/admin/feedback', 'PATCH', async () => {
    // Rate limit admin feedback updates
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin-feedback-update:${clientIp}`, { limit: 30, windowSeconds: 60 })

    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .single()

    if (profileError || !userProfile || (userProfile.role !== 'admin' && !userProfile.roles?.includes('admin'))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Use service client to bypass RLS for admin operations
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[/api/admin/feedback] SUPABASE_SERVICE_ROLE_KEY not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const serviceClient = createServiceClient()

    const body = await request.json()
    const { id, status, admin_notes, source } = body

    if (!id) {
      return NextResponse.json({ error: 'Feedback ID required' }, { status: 400 })
    }

    // Choose table based on source
    const tableName = source === 'vendor' ? 'vendor_feedback' : 'shopper_feedback'

    const updateData: Record<string, unknown> = {}
    if (status) {
      const validStatuses = ['new', 'in_review', 'resolved', 'closed']
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = status
      if (status === 'resolved' || status === 'closed') {
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = user.id
      }
    }
    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes
    }

    const { data: feedback, error: updateError } = await serviceClient
      .from(tableName)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[/api/admin/feedback] Error updating feedback:', updateError.message)
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true, feedback })

    } catch (error) {
      console.error('[/api/admin/feedback] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
