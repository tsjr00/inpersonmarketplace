import ErrorLogsAdminPage from '@/components/admin/ErrorLogsAdminPage'

/**
 * Platform error-logs route — thin wrapper over the shared ErrorLogsAdminPage
 * (admin UI rebuild phase 3, merge 4/11, owner 2026-08-31). Auth unchanged:
 * the layout runs requireAdmin and GET /api/admin/error-logs enforces
 * verifyAdminScope — the page adds no gate, exactly as before. No vertical
 * prop = platform-wide view (all verticals + untagged errors).
 */
export default function ErrorLogsDashboard() {
  return <ErrorLogsAdminPage />
}
