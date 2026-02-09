import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/admin/vendor-activity/flags/[id]
 *
 * Get details of a specific flag
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendor-activity/flags/[id]', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()
    const { id: flagId } = await params

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

    const { data: flag, error } = await supabase
      .from('vendor_activity_flags')
      .select(`
        *,
        vendor:vendor_profiles (
          id,
          user_id,
          status,
          profile_data,
          last_active_at,
          last_login_at,
          first_listing_at,
          created_at,
          approved_at,
          vertical_id
        )
      `)
      .eq('id', flagId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ flag })
  })
}

/**
 * PATCH /api/admin/vendor-activity/flags/[id]
 *
 * Take action on a flag
 *
 * Body:
 * - action: 'dismiss' | 'suspend' | 'revert_to_applied' | 'contact'
 * - notes: Optional resolution notes
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/vendor-activity/flags/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()
    const { id: flagId } = await params

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

    const body = await request.json()
    const { action, notes } = body

    if (!action || !['dismiss', 'suspend', 'revert_to_applied', 'contact'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be: dismiss, suspend, revert_to_applied, or contact' }, { status: 400 })
    }

    try {
      // Get the flag with vendor info
      const { data: flag, error: flagError } = await supabase
        .from('vendor_activity_flags')
        .select(`
          *,
          vendor:vendor_profiles (
            id,
            user_id,
            status,
            profile_data
          )
        `)
        .eq('id', flagId)
        .single()

      if (flagError || !flag) {
        return NextResponse.json({ error: 'Flag not found' }, { status: 404 })
      }

      if (flag.status !== 'pending') {
        return NextResponse.json({ error: 'Flag has already been resolved' }, { status: 400 })
      }

      const vendor = flag.vendor as any

      // Determine new flag status based on action
      let newStatus: 'dismissed' | 'actioned' = 'dismissed'
      let actionTaken = action

      if (action === 'dismiss') {
        newStatus = 'dismissed'
        actionTaken = 'dismissed'
      } else if (action === 'suspend') {
        newStatus = 'actioned'
        actionTaken = 'suspended'

        // Update vendor status to suspended
        const { error: vendorError } = await supabase
          .from('vendor_profiles')
          .update({
            status: 'suspended',
            updated_at: new Date().toISOString()
          })
          .eq('id', vendor.id)

        if (vendorError) {
          return NextResponse.json({ error: 'Failed to suspend vendor: ' + vendorError.message }, { status: 500 })
        }

        // Mark all other pending flags for this vendor as actioned too
        await supabase
          .from('vendor_activity_flags')
          .update({
            status: 'actioned',
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
            resolution_notes: 'Auto-resolved: vendor suspended',
            action_taken: 'suspended_bulk'
          })
          .eq('vendor_profile_id', vendor.id)
          .eq('status', 'pending')
          .neq('id', flagId)

      } else if (action === 'revert_to_applied') {
        newStatus = 'actioned'
        actionTaken = 'reverted_to_applied'

        // Update vendor status back to applied
        const { error: vendorError } = await supabase
          .from('vendor_profiles')
          .update({
            status: 'applied',
            updated_at: new Date().toISOString()
          })
          .eq('id', vendor.id)

        if (vendorError) {
          return NextResponse.json({ error: 'Failed to revert vendor status: ' + vendorError.message }, { status: 500 })
        }

        // Mark all other pending flags for this vendor as actioned too
        await supabase
          .from('vendor_activity_flags')
          .update({
            status: 'actioned',
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
            resolution_notes: 'Auto-resolved: vendor reverted to applied status',
            action_taken: 'reverted_bulk'
          })
          .eq('vendor_profile_id', vendor.id)
          .eq('status', 'pending')
          .neq('id', flagId)

      } else if (action === 'contact') {
        // Mark as actioned but don't change vendor status
        // This indicates admin has reached out to the vendor
        newStatus = 'actioned'
        actionTaken = 'contacted'
      }

      // Update the flag
      const { data: updatedFlag, error: updateError } = await supabase
        .from('vendor_activity_flags')
        .update({
          status: newStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: notes || null,
          action_taken: actionTaken,
          updated_at: new Date().toISOString()
        })
        .eq('id', flagId)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        flag: updatedFlag,
        action: actionTaken,
        message: `Flag ${actionTaken} successfully`
      })

    } catch (error) {
      console.error('[VENDOR-ACTIVITY-FLAG] Error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({
        error: 'Failed to process flag action',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
  })
}
