import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type UserRole = 'buyer' | 'vendor' | 'admin' | 'verifier'

export interface AdminUser {
  user_id: string
  email: string
  role: UserRole
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
    redirect('/login?error=unauthorized')
  }

  // Get user profile with role
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, email, role, display_name')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile) {
    redirect('/login?error=no_profile')
  }

  // Check admin role
  if (profile.role !== 'admin') {
    redirect('/dashboard?error=not_admin')
  }

  return profile as AdminUser
}

/**
 * Check if user is admin (returns boolean, no redirect)
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return profile?.role === 'admin'
}
