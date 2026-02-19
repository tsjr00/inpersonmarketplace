import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasAdminRole } from '@/lib/auth/admin'

// GET - Get all order issues (admin only)
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/order-issues', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
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
        .is('deleted_at', null)
        .single()

      if (profileError || !userProfile || !hasAdminRole(userProfile || {})) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }

      // Use service client to bypass RLS for admin queries
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[/api/admin/order-issues] SUPABASE_SERVICE_ROLE_KEY not configured')
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
      }
      const serviceClient = createServiceClient()

      const { searchParams } = new URL(request.url)
      const vertical = searchParams.get('vertical')
      const status = searchParams.get('status')

      // Query order_items where issue_reported_at is not null
      // Use !inner join on listings when filtering by vertical so PostgREST filters at DB level
      const listingJoin = vertical
        ? 'listing:listings!inner(id, title, vertical_id)'
        : 'listing:listings(id, title, vertical_id)'

      let query = serviceClient
        .from('order_items')
        .select(`
          id,
          order_id,
          quantity,
          unit_price_cents,
          subtotal_cents,
          status,
          issue_reported_at,
          issue_reported_by,
          issue_description,
          issue_status,
          issue_admin_notes,
          issue_resolved_at,
          issue_resolved_by,
          created_at,
          vendor_profile_id,
          ${listingJoin},
          market:markets(
            id,
            name
          )
        `)
        .not('issue_reported_at', 'is', null)
        .order('issue_reported_at', { ascending: false })

      // Filter by vertical at DB level (via inner join)
      if (vertical) {
        query = query.eq('listing.vertical_id', vertical)
      }

      // Filter by issue_status if provided
      if (status && status !== 'all') {
        query = query.eq('issue_status', status)
      }

      const { data: issues, error: fetchError } = await query

      if (fetchError) {
        console.error('[/api/admin/order-issues] Error fetching order issues:', fetchError.message)
        return NextResponse.json({ error: 'Failed to fetch order issues' }, { status: 500 })
      }

      const filteredIssues = issues || []

      // Get order data for each issue
      const orderIds = [...new Set(filteredIssues.map((i: any) => i.order_id).filter(Boolean))]
      const ordersMap: Record<string, any> = {}

      if (orderIds.length > 0) {
        const { data: orders } = await serviceClient
          .from('orders')
          .select('id, order_number, buyer_user_id, created_at')
          .in('id', orderIds)

        if (orders) {
          orders.forEach((o: any) => {
            ordersMap[o.id] = o
          })
        }
      }

      // Get buyer info
      const buyerIds = [...new Set(Object.values(ordersMap).map((o: any) => o.buyer_user_id).filter(Boolean))]
      const buyersMap: Record<string, any> = {}

      if (buyerIds.length > 0) {
        const { data: buyers } = await serviceClient
          .from('user_profiles')
          .select('user_id, email, display_name')
          .in('user_id', buyerIds)
          .is('deleted_at', null)

        if (buyers) {
          buyers.forEach((b: any) => {
            buyersMap[b.user_id] = b
          })
        }
      }

      // Get vendor info
      const vendorProfileIds = [...new Set(filteredIssues.map((i: any) => i.vendor_profile_id).filter(Boolean))]
      const vendorsMap: Record<string, any> = {}

      if (vendorProfileIds.length > 0) {
        const { data: vendors } = await serviceClient
          .from('vendor_profiles')
          .select('id, profile_data')
          .in('id', vendorProfileIds)

        if (vendors) {
          vendors.forEach((v: any) => {
            const profileData = v.profile_data as Record<string, unknown> | null
            vendorsMap[v.id] = {
              name: (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
            }
          })
        }
      }

      // Transform issues with enriched data
      const transformedIssues = filteredIssues.map((issue: any) => {
        const order = ordersMap[issue.order_id] || {}
        const buyer = buyersMap[order.buyer_user_id] || {}
        const vendor = vendorsMap[issue.vendor_profile_id] || {}

        return {
          id: issue.id,
          order_id: issue.order_id,
          order_number: order.order_number || issue.order_id?.slice(0, 8) || 'N/A',
          listing_title: issue.listing?.title || 'Unknown Item',
          listing_id: issue.listing?.id,
          vertical_id: issue.listing?.vertical_id,
          market_name: issue.market?.name || 'Unknown Market',
          quantity: issue.quantity,
          subtotal_cents: issue.subtotal_cents,
          order_item_status: issue.status,
          issue_reported_at: issue.issue_reported_at,
          issue_reported_by: issue.issue_reported_by,
          issue_description: issue.issue_description || 'No description provided',
          issue_status: issue.issue_status || 'new',
          issue_admin_notes: issue.issue_admin_notes,
          issue_resolved_at: issue.issue_resolved_at,
          buyer_email: buyer.email || 'Unknown',
          buyer_name: buyer.display_name || 'Customer',
          vendor_name: vendor.name || 'Unknown Vendor',
          order_created_at: order.created_at || issue.created_at
        }
      })

      // Get counts by issue_status
      const counts = {
        new: transformedIssues.filter((i: any) => !i.issue_status || i.issue_status === 'new').length,
        in_review: transformedIssues.filter((i: any) => i.issue_status === 'in_review').length,
        resolved: transformedIssues.filter((i: any) => i.issue_status === 'resolved').length,
        closed: transformedIssues.filter((i: any) => i.issue_status === 'closed').length,
        total: transformedIssues.length
      }

      return NextResponse.json({ issues: transformedIssues, counts })

    } catch (error) {
      console.error('[/api/admin/order-issues] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}

// PATCH - Update order issue status/notes (admin only)
export async function PATCH(request: NextRequest) {
  return withErrorTracing('/api/admin/order-issues', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
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
        .is('deleted_at', null)
        .single()

      if (profileError || !userProfile || !hasAdminRole(userProfile || {})) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }

      // Use service client to bypass RLS for admin operations
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[/api/admin/order-issues] SUPABASE_SERVICE_ROLE_KEY not configured')
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
      }
      const serviceClient = createServiceClient()

      const body = await request.json()
      const { id, issue_status, issue_admin_notes } = body

      if (!id) {
        return NextResponse.json({ error: 'Order item ID required' }, { status: 400 })
      }

      const updateData: Record<string, unknown> = {}

      if (issue_status) {
        const validStatuses = ['new', 'in_review', 'resolved', 'closed']
        if (!validStatuses.includes(issue_status)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
        }
        updateData.issue_status = issue_status
        if (issue_status === 'resolved' || issue_status === 'closed') {
          updateData.issue_resolved_at = new Date().toISOString()
          updateData.issue_resolved_by = user.id
        }
      }

      if (issue_admin_notes !== undefined) {
        updateData.issue_admin_notes = issue_admin_notes
      }

      const { data: orderItem, error: updateError } = await serviceClient
        .from('order_items')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) {
        console.error('[/api/admin/order-issues] Error updating order issue:', updateError.message)
        return NextResponse.json({ error: 'Failed to update order issue' }, { status: 500 })
      }

      return NextResponse.json({ success: true, orderItem })

    } catch (error) {
      console.error('[/api/admin/order-issues] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
