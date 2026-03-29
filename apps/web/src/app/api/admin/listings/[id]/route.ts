import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications'

// PATCH - Admin moderation: suspend (pause) or unsuspend (republish) a listing
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/listings/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()
    const { id: listingId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin role
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    let isAdmin = hasAdminRole(userProfile || {})

    const serviceClient = createServiceClient()

    // Fetch the listing to get its vertical for vertical admin check
    const { data: listing, error: fetchError } = await serviceClient
      .from('listings')
      .select('id, title, status, vertical_id, vendor_profile_id')
      .eq('id', listingId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // If not platform admin, check vertical admin
    if (!isAdmin) {
      const { data: verticalAdmin } = await supabase
        .from('vertical_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', listing.vertical_id)
        .single()
      isAdmin = !!verticalAdmin
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { action, reason } = body

    if (!action || !['suspend', 'unsuspend'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "suspend" or "unsuspend"' }, { status: 400 })
    }

    if (action === 'suspend') {
      // Pause the listing
      const { error: updateError } = await serviceClient
        .from('listings')
        .update({
          status: 'paused',
          updated_at: new Date().toISOString(),
        })
        .eq('id', listingId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to suspend listing' }, { status: 500 })
      }

      // Get vendor user_id for notification
      const { data: vendor } = await serviceClient
        .from('vendor_profiles')
        .select('user_id')
        .eq('id', listing.vendor_profile_id)
        .single()

      if (vendor) {
        await sendNotification(vendor.user_id, 'listing_suspended', {
          listingTitle: listing.title,
          reason: reason || 'Suspended by admin for review.',
        }, { vertical: listing.vertical_id })
      }

      return NextResponse.json({ success: true, action: 'suspended', listing_id: listingId })
    }

    if (action === 'unsuspend') {
      // Republish the listing
      const { error: updateError } = await serviceClient
        .from('listings')
        .update({
          status: 'published',
          updated_at: new Date().toISOString(),
        })
        .eq('id', listingId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to unsuspend listing' }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'unsuspended', listing_id: listingId })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  })
}
