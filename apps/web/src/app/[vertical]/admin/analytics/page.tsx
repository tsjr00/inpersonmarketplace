import AnalyticsAdminPage from '@/components/admin/AnalyticsAdminPage'

/**
 * Vertical analytics route — thin wrapper over the shared AnalyticsAdminPage
 * (admin UI rebuild phase 3, merge 8/11, owner 2026-08-31). ⚠ money-adjacent:
 * no API or figure changed in the merge; every metric label matches the
 * pre-merge vertical page. Auth unchanged (client-side check + API gates).
 */
export default async function VerticalAdminAnalyticsPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <AnalyticsAdminPage vertical={vertical} />
}
