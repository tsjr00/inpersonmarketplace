import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

// PATCH - Admin: suspend or reactivate a user account
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/admin/users/[id]', 'PATCH', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    const supabase = await createClient()
    const { id: userId } = await params

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Prevent self-suspension
    if (user.id === userId) {
      return NextResponse.json({ error: 'Cannot suspend your own account' }, { status: 400 })
    }

    // Verify admin role
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role, roles')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single()

    if (!hasAdminRole(userProfile || {})) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    if (!action || !['suspend', 'reactivate'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "suspend" or "reactivate"' }, { status: 400 })
    }

    const serviceClient = createServiceClient()

    // Verify target user exists
    const { data: targetUser, error: fetchError } = await serviceClient
      .from('user_profiles')
      .select('user_id, email, display_name, role, roles, deleted_at')
      .eq('user_id', userId)
      .single()

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Prevent suspending other admins (only platform admin can do this)
    const targetRoles = (targetUser.roles as string[]) || []
    const targetIsAdmin = targetRoles.includes('admin') || targetRoles.includes('platform_admin') || targetUser.role === 'admin' || targetUser.role === 'platform_admin'
    if (targetIsAdmin) {
      return NextResponse.json({ error: 'Cannot suspend admin accounts. Remove admin role first.' }, { status: 400 })
    }

    if (action === 'suspend') {
      if (targetUser.deleted_at) {
        return NextResponse.json({ error: 'User is already suspended' }, { status: 400 })
      }

      const { error: updateError } = await serviceClient
        .from('user_profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to suspend user' }, { status: 500 })
      }

      // Also suspend any vendor profiles for this user
      await serviceClient
        .from('vendor_profiles')
        .update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'approved')

      return NextResponse.json({ success: true, action: 'suspended' })
    }

    if (action === 'reactivate') {
      if (!targetUser.deleted_at) {
        return NextResponse.json({ error: 'User is not suspended' }, { status: 400 })
      }

      const { error: updateError } = await serviceClient
        .from('user_profiles')
        .update({ deleted_at: null })
        .eq('user_id', userId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to reactivate user' }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'reactivated' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  })
}
