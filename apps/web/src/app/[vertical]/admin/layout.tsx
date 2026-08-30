import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import AdminShell from '@/components/admin/AdminShell'
import AdminResponsiveStyles from '@/components/admin/AdminResponsiveStyles'
import { resolveAdminShell } from '@/lib/admin/shell-data'

/**
 * Vertical admin layout — phase 1 of the admin UI rebuild (owner 2026-08-30).
 * This tree previously had NO persistent navigation (pages dead-ended); the
 * shared AdminShell adds the complete grouped nav + live queue badges + the
 * scope switcher. Access rules unchanged: same hasAdminRole gate as before.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles, verticals, email')
    .eq('user_id', user.id)
    .single()

  if (!hasAdminRole(userProfile || {})) {
    redirect('/')
  }

  const shell = await resolveAdminShell(supabase, userProfile || {}, 'vertical', vertical)

  return (
    <>
      <AdminShell scopes={shell.scopes} groups={shell.groups} adminEmail={shell.adminEmail}>
        {children}
      </AdminShell>
      <AdminResponsiveStyles />
    </>
  )
}
