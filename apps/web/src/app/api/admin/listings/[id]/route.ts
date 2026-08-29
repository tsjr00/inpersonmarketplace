import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasPlatformAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
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
    const { data: userProfile } = await observed(supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single(), { table: 'user_profiles' })

    // S4-2: platform_admin bypasses; vertical admin falls through to the
    // vertical_admins check below (was hasAdminRole → dead check, cross-vertical).
    let isAdmin = hasPlatformAdminRole(userProfile || {})

    const serviceClient = createServiceClient()

    // Fetch the listing to get its vertical for vertical admin check
    const { data: listing, error: fetchError } = await serviceClient
      .from('listings')
      .select('id, title, status, vertical_id, vendor_profile_id, listing_data')
      .eq('id', listingId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // If not platform admin, check vertical admin
    if (!isAdmin) {
      const { data: verticalAdmin } = await observed(supabase
        .from('vertical_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', listing.vertical_id)
        .single(), { table: 'vertical_admins' })
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
      // ADM-7: stash the pre-suspension status so unsuspend can restore it —
      // otherwise unsuspend force-publishes a listing that was draft/archived
      // when suspended. Only capture a real prior status (not 'paused', in case
      // of a double-suspend) so the stash isn't clobbered to 'paused'.
      const priorStatus = listing.status !== 'paused' ? listing.status : undefined
      const suspendData: Record<string, unknown> = {
        status: 'paused',
        updated_at: new Date().toISOString(),
      }
      if (priorStatus) {
        suspendData.listing_data = {
          ...((listing.listing_data as Record<string, unknown> | null) || {}),
          status_before_suspension: priorStatus,
        }
      }
      const { error: updateError } = await serviceClient
        .from('listings')
        .update(suspendData)
        .eq('id', listingId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to suspend listing' }, { status: 500 })
      }

      // Get vendor user_id for notification
      const { data: vendor } = await observed(serviceClient
        .from('vendor_profiles')
        .select('user_id')
        .eq('id', listing.vendor_profile_id)
        .single(), { table: 'vendor_profiles' })

      if (vendor) {
        await sendNotification(vendor.user_id, 'listing_suspended', {
          listingTitle: listing.title,
          reason: reason || 'Suspended by admin for review.',
        }, { vertical: listing.vertical_id })
      }

      return NextResponse.json({ success: true, action: 'suspended', listing_id: listingId })
    }

    if (action === 'unsuspend') {
      // ADM-7: restore the status the listing had before suspension (stashed in
      // listing_data). Legacy rows suspended before this fix have no stash →
      // default to 'published' (the prior behavior). Clear the stash key.
      const ld = (listing.listing_data as Record<string, unknown> | null) || {}
      const restored = (ld.status_before_suspension as string | undefined) || 'published'
      const { status_before_suspension: _drop, ...ldRest } = ld
      const { error: updateError } = await serviceClient
        .from('listings')
        .update({
          status: restored,
          listing_data: ldRest,
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
