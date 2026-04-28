import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import AdminResponsiveStyles from '@/components/admin/AdminResponsiveStyles'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Redirect to generic login - page will handle vertical-specific redirect
    redirect('/login')
  }

  // Verify admin role using centralized check (covers admin + platform_admin)
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  if (!hasAdminRole(userProfile || {})) {
    // Redirect to home - can't determine vertical here
    redirect('/')
  }

  return (
    <>
      {/* Overflow safety net: any inline-styled child that exceeds container
          width is clipped instead of pushing the page horizontally past the
          viewport. Inner scroll wrappers (.admin-table-wrap) still scroll
          within their own bounds. */}
      <div style={{ overflowX: 'hidden', minWidth: 0, width: '100%' }}>
        {children}
      </div>
      <AdminResponsiveStyles />
    </>
  )
}
