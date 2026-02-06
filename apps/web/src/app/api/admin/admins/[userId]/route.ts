import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ userId: string }>
}

// DELETE - Remove platform admin status from a user
export async function DELETE(request: Request, { params }: RouteParams) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult)
  }

  try {
    const { userId: targetUserId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify caller is platform admin
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('role, roles, is_chief_platform_admin')
      .eq('user_id', user.id)
      .single()

    const isAdmin = callerProfile?.role === 'admin' ||
                    callerProfile?.role === 'platform_admin' ||
                    callerProfile?.roles?.includes('admin') ||
                    callerProfile?.roles?.includes('platform_admin')
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // Use service client
    const serviceClient = createServiceClient()

    // Get target user
    const { data: targetUser, error: findError } = await serviceClient
      .from('user_profiles')
      .select('user_id, email, role, roles, is_chief_platform_admin')
      .eq('user_id', targetUserId)
      .single()

    if (findError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Cannot remove yourself
    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'Cannot remove your own admin access' }, { status: 400 })
    }

    // Cannot remove chief admin unless you are chief admin
    if (targetUser.is_chief_platform_admin && !callerProfile?.is_chief_platform_admin) {
      return NextResponse.json({ error: 'Only chief admin can remove another chief admin' }, { status: 403 })
    }

    // Prevent removing the last chief admin
    if (targetUser.is_chief_platform_admin) {
      const { count } = await serviceClient
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_chief_platform_admin', true)

      if ((count || 0) <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last chief platform admin' }, { status: 400 })
      }
    }

    // Remove admin role
    const newRoles = (targetUser.roles || []).filter((r: string) => r !== 'admin')

    const { error: updateError } = await serviceClient
      .from('user_profiles')
      .update({
        role: newRoles.length > 0 ? newRoles[0] : 'buyer',
        roles: newRoles.length > 0 ? newRoles : ['buyer'],
        is_chief_platform_admin: false
      })
      .eq('user_id', targetUserId)

    if (updateError) {
      console.error('[/api/admin/admins/[userId]] Error updating user:', updateError instanceof Error ? updateError.message : 'Update failed')
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    // Log the action
    await serviceClient
      .from('admin_activity_log')
      .insert({
        action: 'revoke_platform_admin',
        target_user_id: targetUserId,
        performed_by: user.id,
        details: { email: targetUser.email }
      })

    return NextResponse.json({
      success: true,
      message: `Admin access removed from ${targetUser.email}`
    })
  } catch (error) {
    console.error('[/api/admin/admins/[userId]] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
