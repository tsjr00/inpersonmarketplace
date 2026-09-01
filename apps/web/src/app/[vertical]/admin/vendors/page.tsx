import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VendorsAdminPage, { type VendorsSearchParams } from '@/components/admin/VendorsAdminPage'

// Cache for 2 minutes
export const revalidate = 120

/**
 * Vertical vendors route — thin wrapper over the merged VendorsAdminPage
 * (admin UI rebuild phase 4, owner 2026-08-31). Auth unchanged from the
 * pre-merge page (redirect-based inline admin check).
 */
export default async function AdminVendorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ vertical: string }>
  searchParams: Promise<VendorsSearchParams>
}) {
  const { vertical } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()
  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin') ||
    userProfile?.role === 'platform_admin' || userProfile?.roles?.includes('platform_admin')
  if (!isAdmin) {
    redirect(`/${vertical}/dashboard`)
  }
  const sp = await searchParams
  return <VendorsAdminPage scope={vertical} basePath={`/${vertical}/admin/vendors`} searchParams={sp} />
}
