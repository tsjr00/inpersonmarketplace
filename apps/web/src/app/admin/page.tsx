import { requireAdmin } from '@/lib/auth/admin'
import { createServiceClient } from '@/lib/supabase/server'
import { spacing, typography, containers } from '@/lib/design-tokens'
import { getAdminHubData } from '@/lib/admin/hub-data'
import { PLATFORM_ADMIN_NAV } from '@/lib/admin/nav'
import AdminHubZones from '@/components/admin/AdminHubZones'

/**
 * Platform admin hub — queues-first mission control (admin UI rebuild phase 2,
 * owner 2026-08-30). Every count the old dashboard displayed is preserved
 * (capability inventory: .claude/admin_ui_redesign_research.md); the inline
 * 5-row pending-vendor table moved behind the pending-vendors queue tile
 * (/admin/vendors/pending lists them all).
 */
export default async function AdminDashboardPage() {
  await requireAdmin()
  const service = createServiceClient()
  const hub = await getAdminHubData(service, null)

  return (
    <div style={{ maxWidth: containers.wide, margin: '0 auto', padding: spacing.md }}>
      <h1 style={{ margin: `0 0 ${spacing.md}`, fontSize: typography.sizes['2xl'], color: '#333' }}>Platform Admin</h1>
      <AdminHubZones hub={hub} base="/admin" navGroups={PLATFORM_ADMIN_NAV} staleHref="/admin/vendors/pending" />
    </div>
  )
}
