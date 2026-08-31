import ErrorLogsAdminPage from '@/components/admin/ErrorLogsAdminPage'

/**
 * Vertical error-logs route — thin wrapper over the shared ErrorLogsAdminPage
 * (admin UI rebuild phase 3, merge 4/11, owner 2026-08-31). Auth unchanged:
 * the vertical admin layout gates on hasAdminRole and the API enforces
 * verifyAdminScope for the requested vertical — the page adds no gate,
 * exactly as before.
 */
export default async function VerticalErrorLogsDashboard({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <ErrorLogsAdminPage vertical={vertical} />
}
