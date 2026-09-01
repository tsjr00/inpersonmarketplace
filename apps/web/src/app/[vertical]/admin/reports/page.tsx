import ReportsAdminPage from '@/components/admin/ReportsAdminPage'

/**
 * Vertical reports route — thin wrapper over the shared ReportsAdminPage
 * (admin UI rebuild phase 3, merge 10/11, owner 2026-08-31). ⚠ money: no
 * report generator or request semantics changed; the API's ADM-1 fallback
 * scopes vertical admins server-side. Vertical mode = CSV | Quality Checks
 * tabs, no accounting category, no vertical selector — exactly as before.
 */
export default async function VerticalAdminReportsPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <ReportsAdminPage vertical={vertical} />
}
