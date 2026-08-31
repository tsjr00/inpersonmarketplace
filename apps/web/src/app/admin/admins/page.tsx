import AdminsManager from '@/components/admin/AdminsManager'

/**
 * Platform admins route — thin wrapper over the shared AdminsManager (admin
 * UI rebuild phase 3, merge 3/11, owner 2026-08-31). Auth unchanged from the
 * pre-merge page: the layout runs requireAdmin, and the /api/admin/admins
 * routes themselves enforce platform-admin (S4-2) — the page adds no gate,
 * exactly as before.
 */
export default function AdminManagementPage() {
  return <AdminsManager mode="platform" />
}
