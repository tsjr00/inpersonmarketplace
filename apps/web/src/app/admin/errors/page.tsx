import ErrorReportsAdminPage from '@/components/admin/ErrorReportsAdminPage'

/**
 * Platform error-reports route — thin wrapper over the shared
 * ErrorReportsAdminPage (admin UI rebuild phase 3, merge 5/11, owner
 * 2026-08-31). Auth unchanged: layout requireAdmin; the /api/admin/errors
 * routes + error_reports RLS enforce access — the page adds no gate,
 * exactly as before. No vertical prop = platform view (Level filter,
 * escalated reports, all verticals).
 */
export default function PlatformAdminErrorsPage() {
  return <ErrorReportsAdminPage />
}
