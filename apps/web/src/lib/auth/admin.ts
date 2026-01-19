import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export type UserRole = 'buyer' | 'vendor' | 'admin' | 'verifier' | 'platform_admin'

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

  // Check BOTH columns during transition
  return profile?.role === 'admin' || profile?.roles?.includes('admin') || false
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
    profile?.roles?.includes('platform_admin') ||
    false
}
