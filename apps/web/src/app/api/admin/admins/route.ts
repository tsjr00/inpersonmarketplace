import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

// GET - List all platform admins
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/admins', 'GET', async () => {
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

      // Use service client to get all admins
      const serviceClient = createServiceClient()

      const { data: admins, error } = await serviceClient
        .from('user_profiles')
        .select('user_id, email, display_name, role, roles, is_chief_platform_admin, created_at')
        .or('role.eq.admin,roles.cs.{admin}')
        .order('is_chief_platform_admin', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[/api/admin/admins] Error fetching admins:', error instanceof Error ? error.message : 'Unknown error')
        return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 })
      }

      return NextResponse.json({
        admins: admins || [],
        currentUserId: user.id,
        isChiefAdmin: callerProfile?.is_chief_platform_admin || false
      })
    } catch (error) {
      console.error('[/api/admin/admins] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}

// POST - Add a new platform admin
export async function POST(request: Request) {
  return withErrorTracing('/api/admin/admins', 'POST', async () => {
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

      // Verify caller is platform admin (only platform admins can add other platform admins)
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

      const body = await request.json()
      const { email, makeChief } = body

      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 })
      }

      // Only chief admin can make another chief admin
      if (makeChief && !callerProfile?.is_chief_platform_admin) {
        return NextResponse.json({ error: 'Only chief admin can promote to chief admin' }, { status: 403 })
      }

      // Use service client to update user
      const serviceClient = createServiceClient()

      // Find user by email
      const { data: targetUser, error: findError } = await serviceClient
        .from('user_profiles')
        .select('user_id, email, role, roles, is_chief_platform_admin')
        .eq('email', email.toLowerCase().trim())
        .single()

      if (findError || !targetUser) {
        return NextResponse.json({ error: 'User not found with that email' }, { status: 404 })
      }

      // Check if already admin
      const alreadyAdmin = targetUser.role === 'admin' || targetUser.roles?.includes('admin')
      if (alreadyAdmin && !makeChief) {
        return NextResponse.json({ error: 'User is already a platform admin' }, { status: 400 })
      }

      // Update user to admin
      const newRoles = targetUser.roles || []
      if (!newRoles.includes('admin')) {
        newRoles.push('admin')
      }

      const { error: updateError } = await serviceClient
        .from('user_profiles')
        .update({
          role: 'admin',
          roles: newRoles,
          is_chief_platform_admin: makeChief || false
        })
        .eq('user_id', targetUser.user_id)

      if (updateError) {
        console.error('[/api/admin/admins] Error updating user:', updateError instanceof Error ? updateError.message : 'Unknown error')
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
      }

      // Log the action
      await serviceClient
        .from('admin_activity_log')
        .insert({
          action: makeChief ? 'set_chief_platform_admin' : 'grant_platform_admin',
          target_user_id: targetUser.user_id,
          performed_by: user.id,
          details: { email: targetUser.email }
        })

      return NextResponse.json({
        success: true,
        message: makeChief
          ? `${email} is now a chief platform admin`
          : `${email} is now a platform admin`
      })
    } catch (error) {
      console.error('[/api/admin/admins] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
