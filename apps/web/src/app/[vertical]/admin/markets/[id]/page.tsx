import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MarketDetailAdminPage from '@/components/admin/MarketDetailAdminPage'

/**
 * Vertical market detail route — thin wrapper over the shared
 * MarketDetailAdminPage (admin UI rebuild phase 5, owner 2026-08-31). Auth
 * mirrors the phase-4 vertical wrappers (redirect-based inline admin check);
 * the vertical constraint on the lookup 404s markets outside this vertical.
 */
export default async function VerticalAdminMarketDetailPage({
  params,
}: {
  params: Promise<{ vertical: string; id: string }>
}) {
  const { vertical, id } = await params
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
  return (
    <MarketDetailAdminPage
      marketId={id}
      vertical={vertical}
      backHref={`/${vertical}/admin/markets`}
    />
  )
}
