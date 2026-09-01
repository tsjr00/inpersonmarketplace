import ErrorReportsAdminPage from '@/components/admin/ErrorReportsAdminPage'

/**
 * Vertical error-reports route — thin wrapper over the shared
 * ErrorReportsAdminPage (admin UI rebuild phase 3, merge 5/11, owner
 * 2026-08-31). Auth unchanged: vertical layout hasAdminRole; the
 * /api/admin/errors routes force vertical admins to their own vertical and
 * the vertical_admin escalation level — the page adds no gate, as before.
 */
export default async function VerticalAdminErrorsPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <ErrorReportsAdminPage vertical={vertical} />
}
