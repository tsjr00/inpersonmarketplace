import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VendorDetailAdminPage from '@/components/admin/VendorDetailAdminPage'

/**
 * Vertical vendor detail route — thin wrapper over the merged
 * VendorDetailAdminPage (admin UI rebuild phase 4, owner 2026-08-31). Auth
 * unchanged from the pre-merge page (redirect-based inline admin check);
 * the vertical constraint on the lookup is kept (404 outside), as before.
 */
export default async function VerticalAdminVendorDetailPage({
  params,
}: {
  params: Promise<{ vertical: string; vendorId: string }>
}) {
  const { vertical, vendorId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()
  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin') ||
    userProfile?.role === 'platform_admin' || userProfile?.roles?.includes('platform_admin')
  if (!isAdmin) redirect(`/${vertical}/dashboard`)
  return <VendorDetailAdminPage vendorId={vendorId} vertical={vertical} />
}
