import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export type UserRole = 'buyer' | 'vendor' | 'admin' | 'verifier'

export interface AdminUser {
  user_id: string
  email: string
  role: UserRole
  roles?: string[]
  display_name: string | null
}

/**
 * Check if current user is an admin
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
  const hasAdminRole = profile.role === 'admin' || profile.roles?.includes('admin')
  if (!hasAdminRole) {
    redirect('/dashboard?error=not_admin')
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
