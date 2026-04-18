import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

import type { UserRole } from '@/lib/auth/roles'

export interface AdminUser {
  user_id: string
  email: string
  role: UserRole
  roles?: string[]
  display_name: string | null
}

/**
 * Check if current user is an admin with MFA verified
 * Returns admin user data if authorized, redirects if not
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // Get current domain to determine redirect
    const headersList = await headers()
    const host = headersList.get('host') || ''

    // For umbrella domain, redirect to admin login page
    if (host.includes('815enterprises.com')) {
      redirect('/admin/login')
    }

    // For other domains, redirect to general login
    redirect('/login?error=unauthorized')
  }

  // Get user profile with role (select BOTH columns for compatibility)
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, email, role, roles, display_name')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    redirect('/login?error=no_profile')
  }

  // Check admin role - check BOTH columns during transition
  const isAdmin = profile.role === 'admin' ||
                  profile.role === 'platform_admin' ||
                  profile.roles?.includes('admin') ||
                  profile.roles?.includes('platform_admin')
  if (!isAdmin) {
    redirect('/dashboard?error=not_admin')
  }

  // Check MFA status for admin users (only if REQUIRE_ADMIN_MFA is enabled)
  if (process.env.REQUIRE_ADMIN_MFA === 'true') {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    // If user has MFA enrolled but hasn't verified this session, redirect to verify
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
      redirect('/admin/mfa/verify')
    }

    // If user doesn't have MFA set up at all, redirect to setup
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasMFA = factors?.totp?.some(f => f.status === 'verified')

    if (!hasMFA) {
      redirect('/admin/mfa/setup')
    }
  }

  return profile as AdminUser
}

/**
 * Check if user is admin (returns boolean, no redirect)
 */
export async function isAdminCheck(): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  // Check BOTH columns during transition — include platform_admin (matches requireAdmin + hasAdminRole)
  return hasAdminRole(profile || {})
}

/**
 * Check if user is a platform admin (has access to platform-level admin dashboard)
 * Platform admins can manage the platform across all verticals
 * Vertical admins (regular 'admin' role) can only manage their specific vertical
 */
export async function isPlatformAdminCheck(): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  // Platform admin is a distinct role - check both role columns
  return profile?.role === 'platform_admin' || profile?.roles?.includes('platform_admin') || false
}

/**
 * Check if user has any admin privileges (vertical or platform level)
 */
export function hasAdminRole(profile: { role?: string | null; roles?: string[] | null }): boolean {
  return profile?.role === 'admin' ||
    profile?.role === 'platform_admin' ||
    profile?.roles?.includes('admin') ||
    profile?.roles?.includes('platform_admin') ||
    false
}

/**
 * Check if user is specifically a platform admin (sync version for use with profile data)
 */
export function hasPlatformAdminRole(profile: { role?: string | null; roles?: string[] | null }): boolean {
  return profile?.role === 'platform_admin' ||
    profile?.role === 'admin' ||
    profile?.roles?.includes('platform_admin') ||
    profile?.roles?.includes('admin') ||
    false
}

/**
 * Verify admin role for API routes
 * Returns { isAdmin, userId } - does not redirect
 * Use this BEFORE using createServiceClient() in API routes
 */
export async function verifyAdminForApi(): Promise<{ isAdmin: boolean; userId: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { isAdmin: false, userId: null }
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = hasAdminRole(profile || {})
  return { isAdmin, userId: user.id }
}

/**
 * H-7: Verify admin scope for vertical-filtered API routes.
 * Platform admins see all verticals. Vertical admins see only their assigned vertical(s).
 * Returns scope info or null if unauthorized.
 */
export async function verifyAdminScope(
  requestedVerticalId?: string | null
): Promise<{
  authorized: boolean
  isPlatformAdmin: boolean
  userId: string
  effectiveVerticalId: string | null
} | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!profile) return null

  const isPlatformAdmin = hasPlatformAdminRole(profile)

  // Platform admins can access everything
  if (isPlatformAdmin) {
    return {
      authorized: true,
      isPlatformAdmin: true,
      userId: user.id,
      effectiveVerticalId: requestedVerticalId || null,
    }
  }

  // Check if user has admin role or is in vertical_admins
  const isAdmin = hasAdminRole(profile)

  if (isAdmin && requestedVerticalId) {
    // User has admin role — verify they manage the requested vertical
    const { data: verticalAdmin } = await supabase
      .from('vertical_admins')
      .select('id')
      .eq('user_id', user.id)
      .eq('vertical_id', requestedVerticalId)
      .maybeSingle()

    if (verticalAdmin) {
      return {
        authorized: true,
        isPlatformAdmin: false,
        userId: user.id,
        effectiveVerticalId: requestedVerticalId,
      }
    }
  }

  // Check vertical_admins table as fallback (for users not in user_profiles as admin)
  if (!isAdmin) {
    const { data: verticalAdmins } = await supabase
      .from('vertical_admins')
      .select('vertical_id')
      .eq('user_id', user.id)

    if (verticalAdmins && verticalAdmins.length > 0) {
      const allowedVerticals = verticalAdmins.map(va => va.vertical_id)
      if (requestedVerticalId && allowedVerticals.includes(requestedVerticalId)) {
        return {
          authorized: true,
          isPlatformAdmin: false,
          userId: user.id,
          effectiveVerticalId: requestedVerticalId,
        }
      }
      // If no vertical requested but they have exactly one, use it
      if (!requestedVerticalId && allowedVerticals.length === 1) {
        return {
          authorized: true,
          isPlatformAdmin: false,
          userId: user.id,
          effectiveVerticalId: allowedVerticals[0],
        }
      }
    }
  }

  // Not authorized
  return isAdmin
    ? { authorized: false, isPlatformAdmin: false, userId: user.id, effectiveVerticalId: null }
    : null
}
