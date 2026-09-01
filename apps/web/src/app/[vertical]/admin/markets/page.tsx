import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MarketsAdminPage from '@/components/admin/MarketsAdminPage'

/**
 * Vertical markets route — thin wrapper over the merged MarketsAdminPage
 * (admin UI rebuild phase 5, owner 2026-08-31). Auth mirrors the phase-4
 * vertical wrappers (redirect-based inline admin check; the pre-merge page
 * was a client page relying on the API's 403s). Suspense boundary because
 * MarketsAdminPage reads useSearchParams (?edit deep link).
 */
export default async function AdminMarketsRoute({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
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
    <Suspense fallback={null}>
      <MarketsAdminPage vertical={vertical} />
    </Suspense>
  )
}
