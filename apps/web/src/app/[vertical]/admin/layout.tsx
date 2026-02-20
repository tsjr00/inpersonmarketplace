import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'

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

  return <>{children}</>
}
