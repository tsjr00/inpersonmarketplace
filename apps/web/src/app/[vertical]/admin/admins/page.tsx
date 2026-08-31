import AdminsManager from '@/components/admin/AdminsManager'

/**
 * Vertical admins route — thin wrapper over the shared AdminsManager (admin
 * UI rebuild phase 3, merge 3/11, owner 2026-08-31). Auth unchanged from the
 * pre-merge page: the vertical admin layout gates on hasAdminRole, and the
 * /api/admin/verticals/[vertical]/admins routes enforce the per-vertical
 * permission model (S4-2) — the page adds no gate, exactly as before.
 */
export default async function VerticalAdminManagementPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <AdminsManager mode="vertical" vertical={vertical} />
}
