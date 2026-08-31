import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ListingsAdminPage, { type ListingsSearchParams } from '@/components/admin/ListingsAdminPage'

// Cache for 2 minutes
export const revalidate = 120

/**
 * Vertical listings route — thin wrapper over the merged ListingsAdminPage
 * (admin UI rebuild phase 3, merge 2/11, owner 2026-08-30). Access gate
 * unchanged from the pre-merge page: any admin or platform admin may view,
 * with redirects (not inline error text) on failure, exactly as before.
 */
export default async function AdminListingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ vertical: string }>
  searchParams: Promise<ListingsSearchParams>
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
  return <ListingsAdminPage scope={vertical} basePath={`/${vertical}/admin/listings`} searchParams={sp} />
}
