import { requireAdmin } from '@/lib/auth/admin'
import { createClient } from '@/lib/supabase/server'
import AdminShell from '@/components/admin/AdminShell'
import AdminResponsiveStyles from '@/components/admin/AdminResponsiveStyles'
import { resolveAdminShell } from '@/lib/admin/shell-data'

/**
 * Platform admin layout — phase 1 of the admin UI rebuild (owner 2026-08-30).
 * AdminSidebar replaced by the shared AdminShell (complete grouped nav + live
 * queue badges + scope switcher). Access rules unchanged: requireAdmin as
 * before; the shell only changes chrome.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await requireAdmin()
  const supabase = await createClient()
  const shell = await resolveAdminShell(supabase, admin, 'platform', null)

  return (
    <>
      <AdminShell scopes={shell.scopes} groups={shell.groups} adminEmail={shell.adminEmail}>
        {children}
      </AdminShell>
      <AdminResponsiveStyles />
    </>
  )
}
