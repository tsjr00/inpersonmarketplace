import OrderIssuesAdminPage from '@/components/admin/OrderIssuesAdminPage'

/**
 * Platform order-issues route — thin wrapper over the shared
 * OrderIssuesAdminPage (admin UI rebuild phase 3, merge 7/11, owner
 * 2026-08-31). Auth unchanged: layout requireAdmin; the API gates on
 * hasAdminRole + verifyAdminScope (S4-2). No vertical prop = all verticals.
 */
export default function AdminOrderIssuesPage() {
  return <OrderIssuesAdminPage />
}
