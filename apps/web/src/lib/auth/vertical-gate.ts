import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { hasAdminRole } from './admin'

/**
 * Enforce vertical access for protected pages (server components only).
 *
 * Access rules:
 *   - Unauthenticated → redirect to login
 *   - Platform admin / admin → bypass (cross-vertical by design)
 *   - user_profiles.verticals includes this vertical → allow
 *   - vendor_profiles exists for this vertical → allow (fallback)
 *   - User has verticals but NOT this one → redirect to their home vertical
 *   - User has NO verticals at all → allow (new user, will get added on first action)
 *
 * Call from protected server pages:
 *   await enforceVerticalAccess(vertical)
 */
export async function enforceVerticalAccess(vertical: string): Promise<void> {
  const supabase = await createClient()

  // 1. Check authentication
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // 2. Fetch user profile (role + verticals array)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles, verticals')
    .eq('user_id', user.id)
    .single()

  // 3. Platform admins bypass vertical checks
  if (profile && hasAdminRole(profile)) {
    return
  }

  const userVerticals = (profile?.verticals as string[] | null) || []

  // 4. Check verticals array
  if (userVerticals.includes(vertical)) {
    return
  }

  // 5. Fallback: check vendor_profiles for this vertical
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .maybeSingle()

  if (vendorProfile) {
    return
  }

  // 6. If user has NO verticals at all, allow (first-time buyer browsing)
  if (userVerticals.length === 0) {
    return
  }

  // 7. User has verticals but doesn't belong to this one — redirect to home vertical
  const homeVertical = userVerticals[0]
  redirect(`/${homeVertical}/dashboard`)
}
