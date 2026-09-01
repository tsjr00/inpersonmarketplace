import OrderIssuesAdminPage from '@/components/admin/OrderIssuesAdminPage'

/**
 * Vertical order-issues route — thin wrapper over the shared
 * OrderIssuesAdminPage (admin UI rebuild phase 3, merge 7/11, owner
 * 2026-08-31). Auth unchanged: vertical layout hasAdminRole; the API forces
 * vertical admins to their own vertical (S4-2) — the page adds no gate.
 */
export default async function VerticalAdminOrderIssuesPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <OrderIssuesAdminPage vertical={vertical} />
}
