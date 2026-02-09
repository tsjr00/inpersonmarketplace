import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

interface RouteParams {
  params: Promise<{ verticalId: string; adminId: string }>
}

// DELETE - Remove vertical admin
export async function DELETE(request: Request, { params }: RouteParams) {
  return withErrorTracing('/api/admin/verticals/[verticalId]/admins/[adminId]', 'DELETE', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    try {
      const { verticalId, adminId } = await params
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Verify caller permissions
      const { data: callerProfile } = await supabase
        .from('user_profiles')
        .select('role, roles, is_chief_platform_admin')
        .eq('user_id', user.id)
        .single()

      const isPlatformAdmin = callerProfile?.role === 'admin' ||
                              callerProfile?.role === 'platform_admin' ||
                              callerProfile?.roles?.includes('admin') ||
                              callerProfile?.roles?.includes('platform_admin')

      const { data: callerVerticalAdmin } = await supabase
        .from('vertical_admins')
        .select('is_chief')
        .eq('user_id', user.id)
        .eq('vertical_id', verticalId)
        .single()

      const serviceClient = createServiceClient()

      // Get the admin record to delete
      const { data: targetAdmin, error: findError } = await serviceClient
        .from('vertical_admins')
        .select('id, user_id, is_chief, vertical_id')
        .eq('id', adminId)
        .eq('vertical_id', verticalId)
        .single()

      if (findError || !targetAdmin) {
        return NextResponse.json({ error: 'Vertical admin not found' }, { status: 404 })
      }

      // Cannot remove yourself
      if (targetAdmin.user_id === user.id) {
        return NextResponse.json({ error: 'Cannot remove your own admin access' }, { status: 400 })
      }

      // Permission checks
      const canRemove = isPlatformAdmin ||
        (callerVerticalAdmin?.is_chief && !targetAdmin.is_chief)

      if (!canRemove) {
        return NextResponse.json({
          error: targetAdmin.is_chief
            ? 'Only platform admins can remove chief vertical admins'
            : 'Only platform admins or chief vertical admins can remove vertical admins'
        }, { status: 403 })
      }

      // If removing chief, check there's at least one chief left
      if (targetAdmin.is_chief) {
        const { count } = await serviceClient
          .from('vertical_admins')
          .select('*', { count: 'exact', head: true })
          .eq('vertical_id', verticalId)
          .eq('is_chief', true)

        if ((count || 0) <= 1) {
          return NextResponse.json({ error: 'Cannot remove the last chief admin for this vertical' }, { status: 400 })
        }
      }

      // Get user email for logging
      const { data: targetUser } = await serviceClient
        .from('user_profiles')
        .select('email')
        .eq('user_id', targetAdmin.user_id)
        .single()

      // Delete the admin record
      const { error: deleteError } = await serviceClient
        .from('vertical_admins')
        .delete()
        .eq('id', adminId)

      if (deleteError) {
        console.error('[/api/admin/verticals/[verticalId]/admins/[adminId]] Delete error:', deleteError instanceof Error ? deleteError.message : 'Delete failed')
        return NextResponse.json({ error: 'Failed to remove vertical admin' }, { status: 500 })
      }

      // Log the action
      await serviceClient
        .from('admin_activity_log')
        .insert({
          action: 'revoke_vertical_admin',
          target_user_id: targetAdmin.user_id,
          performed_by: user.id,
          vertical_id: verticalId,
          details: { email: targetUser?.email }
        })

      return NextResponse.json({
        success: true,
        message: `Admin access removed for ${targetUser?.email || 'user'}`
      })
    } catch (error) {
      console.error('[/api/admin/verticals/[verticalId]/admins/[adminId]] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
