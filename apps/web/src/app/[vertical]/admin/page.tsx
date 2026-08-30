import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'
import { spacing, typography, containers, colors } from '@/lib/design-tokens'

import { getAdminHubData } from '@/lib/admin/hub-data'
import { VERTICAL_ADMIN_NAV } from '@/lib/admin/nav'
import AdminHubZones from '@/components/admin/AdminHubZones'

/**
 * Vertical admin hub — queues-first mission control (admin UI rebuild phase 2,
 * owner 2026-08-30). Every count the old dashboard displayed is preserved:
 * markets/vendors/users/listings totals live in the Totals zone, urgency
 * banners + queues in "Needs you now" (capability inventory:
 * .claude/admin_ui_redesign_research.md).
 */
interface PageProps {
  params: Promise<{ vertical: string }>
}

export default async function VerticalAdminDashboard({ params }: PageProps) {
  const { vertical } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()
  if (!hasAdminRole(profile || {})) redirect(`/${vertical}`)

  const service = createServiceClient()
  const hub = await getAdminHubData(service, vertical)

  return (
    <div style={{ maxWidth: containers.wide, margin: '0 auto', padding: spacing.md }}>
      <h1 style={{ margin: `0 0 ${spacing.md}`, fontSize: typography.sizes['2xl'], color: colors.primary }}>
        {vertical === 'food_trucks' ? "Food Truck'n" : 'Farmers Marketing'} Admin
      </h1>
      <AdminHubZones
        hub={hub}
        base={`/${vertical}/admin`}
        navGroups={VERTICAL_ADMIN_NAV}
        staleHref={`/${vertical}/admin/vendors`}
      />
    </div>
  )
}
