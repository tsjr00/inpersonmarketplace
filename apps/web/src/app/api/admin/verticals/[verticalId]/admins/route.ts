import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { hasAdminRole } from '@/lib/auth/admin'

interface RouteParams {
  params: Promise<{ verticalId: string }>
}

// GET - List all admins for a vertical
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorTracing('/api/admin/verticals/[verticalId]/admins', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    try {
      const { verticalId } = await params
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Verify caller is platform admin or vertical admin
      const { data: callerProfile } = await supabase
        .from('user_profiles')
        .select('role, roles, is_chief_platform_admin')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      const isPlatformAdmin = hasAdminRole(callerProfile || {})

      // Check if vertical admin for this vertical
      const { data: callerVerticalAdmin } = await supabase
        .from('vertical_admins')
        .select('is_chief')
        .eq('user_id', user.id)
        .eq('vertical_id', verticalId)
        .single()

      if (!isPlatformAdmin && !callerVerticalAdmin) {
        return NextResponse.json({ error: 'Admin access required for this vertical' }, { status: 403 })
      }

      // Use service client to get vertical admins with user details
      const serviceClient = createServiceClient()

      const { data: verticalAdmins, error } = await serviceClient
        .from('vertical_admins')
        .select(`
          id,
          user_id,
          vertical_id,
          is_chief,
          granted_at,
          granted_by
        `)
        .eq('vertical_id', verticalId)
        .order('is_chief', { ascending: false })
        .order('granted_at', { ascending: true })

      if (error) {
        console.error('[/api/admin/verticals/[verticalId]/admins] Error:', error instanceof Error ? error.message : 'Unknown error')
        return NextResponse.json({ error: 'Failed to fetch vertical admins' }, { status: 500 })
      }

      // Get user details for each admin
      const userIds = verticalAdmins?.map(va => va.user_id) || []
      const userDetails: Record<string, { email: string; display_name: string | null }> = {}

      if (userIds.length > 0) {
        const { data: users } = await serviceClient
          .from('user_profiles')
          .select('user_id, email, display_name')
          .in('user_id', userIds)

        users?.forEach(u => {
          userDetails[u.user_id] = { email: u.email, display_name: u.display_name }
        })
      }

      // Combine data
      const adminsWithDetails = (verticalAdmins || []).map(va => ({
        ...va,
        email: userDetails[va.user_id]?.email || 'Unknown',
        display_name: userDetails[va.user_id]?.display_name
      }))

      return NextResponse.json({
        admins: adminsWithDetails,
        currentUserId: user.id,
        isPlatformAdmin,
        isChiefVerticalAdmin: callerVerticalAdmin?.is_chief || false,
        isChiefPlatformAdmin: callerProfile?.is_chief_platform_admin || false
      })
    } catch (error) {
      console.error('[/api/admin/verticals/[verticalId]/admins] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}

// POST - Add a vertical admin
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withErrorTracing('/api/admin/verticals/[verticalId]/admins', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    try {
      const { verticalId } = await params
      const supabase = await createClient()

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Verify caller is platform admin or chief vertical admin
      const { data: callerProfile } = await supabase
        .from('user_profiles')
        .select('role, roles, is_chief_platform_admin')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .single()

      const isPlatformAdmin = hasAdminRole(callerProfile || {})

      const { data: callerVerticalAdmin } = await supabase
        .from('vertical_admins')
        .select('is_chief')
        .eq('user_id', user.id)
        .eq('vertical_id', verticalId)
        .single()

      const canAdd = isPlatformAdmin || callerVerticalAdmin?.is_chief

      if (!canAdd) {
        return NextResponse.json({ error: 'Only platform admins or chief vertical admins can add vertical admins' }, { status: 403 })
      }

      const body = await request.json()
      const { email, makeChief } = body

      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 })
      }

      // Only platform admin or chief platform admin can make chief vertical admin
      if (makeChief && !isPlatformAdmin) {
        return NextResponse.json({ error: 'Only platform admins can promote to chief vertical admin' }, { status: 403 })
      }

      const serviceClient = createServiceClient()

      // Find user by email
      const { data: targetUser, error: findError } = await serviceClient
        .from('user_profiles')
        .select('user_id, email')
        .eq('email', email.toLowerCase().trim())
        .single()

      if (findError || !targetUser) {
        return NextResponse.json({ error: 'User not found with that email' }, { status: 404 })
      }

      // Check if already vertical admin
      const { data: existing } = await serviceClient
        .from('vertical_admins')
        .select('id, is_chief')
        .eq('user_id', targetUser.user_id)
        .eq('vertical_id', verticalId)
        .single()

      if (existing) {
        if (makeChief && !existing.is_chief) {
          // Upgrade to chief
          const { error: updateError } = await serviceClient
            .from('vertical_admins')
            .update({ is_chief: true })
            .eq('id', existing.id)

          if (updateError) {
            return NextResponse.json({ error: 'Failed to update admin' }, { status: 500 })
          }

          await serviceClient
            .from('admin_activity_log')
            .insert({
              action: 'set_chief_vertical_admin',
              target_user_id: targetUser.user_id,
              performed_by: user.id,
              vertical_id: verticalId,
              details: { email: targetUser.email }
            })

          return NextResponse.json({
            success: true,
            message: `${email} is now chief admin for ${verticalId}`
          })
        }
        return NextResponse.json({ error: 'User is already an admin for this vertical' }, { status: 400 })
      }

      // Add vertical admin
      const { error: insertError } = await serviceClient
        .from('vertical_admins')
        .insert({
          user_id: targetUser.user_id,
          vertical_id: verticalId,
          is_chief: makeChief || false,
          granted_by: user.id
        })

      if (insertError) {
        console.error('[/api/admin/verticals/[verticalId]/admins] Insert error:', insertError instanceof Error ? insertError.message : 'Insert failed')
        return NextResponse.json({ error: 'Failed to add vertical admin' }, { status: 500 })
      }

      // Log the action
      await serviceClient
        .from('admin_activity_log')
        .insert({
          action: makeChief ? 'grant_chief_vertical_admin' : 'grant_vertical_admin',
          target_user_id: targetUser.user_id,
          performed_by: user.id,
          vertical_id: verticalId,
          details: { email: targetUser.email }
        })

      return NextResponse.json({
        success: true,
        message: makeChief
          ? `${email} is now chief admin for ${verticalId}`
          : `${email} is now an admin for ${verticalId}`
      })
    } catch (error) {
      console.error('[/api/admin/verticals/[verticalId]/admins] Unexpected error:', error instanceof Error ? error.message : 'Unknown error')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  })
}
