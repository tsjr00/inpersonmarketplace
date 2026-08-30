import { createClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import UsersAdminPage, { type UsersSearchParams } from '@/components/admin/UsersAdminPage'

// Cache for 2 minutes - admin data doesn't need real-time updates
export const revalidate = 120

/**
 * Vertical users route — thin wrapper over the merged UsersAdminPage
 * (admin UI rebuild phase 3, first merge, owner 2026-08-30). Access gate
 * unchanged: hasAdminRole (the shared helper — see the 2026-08-06 incident
 * where a hand-rolled check locked platform admins out of this page).
 */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ vertical: string }>
  searchParams: Promise<UsersSearchParams>
}) {
  const { vertical } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return <div style={{ padding: 40, textAlign: 'center' }}><p>Please log in to access this page.</p></div>
  }
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()
  if (!hasAdminRole(userProfile || {})) {
    return <div style={{ padding: 40, textAlign: 'center' }}><p>Admin access required.</p></div>
  }
  const sp = await searchParams
  return <UsersAdminPage scope={vertical} basePath={`/${vertical}/admin/users`} searchParams={sp} />
}
