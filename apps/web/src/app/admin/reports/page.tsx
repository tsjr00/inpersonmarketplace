import ReportsAdminPage from '@/components/admin/ReportsAdminPage'

/**
 * Platform reports route — thin wrapper over the shared ReportsAdminPage
 * (admin UI rebuild phase 3, merge 10/11, owner 2026-08-31). ⚠ money: no
 * report generator or request semantics changed. Auth unchanged: layout
 * requireAdmin; the reports API enforces verifyAdminScope + ADM-1. No
 * vertical prop = vertical selector + accounting reports.
 */
export default function AdminReportsPage() {
  return <ReportsAdminPage />
}
