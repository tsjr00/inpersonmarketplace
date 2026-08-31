import { requireAdmin } from '@/lib/auth/admin'
import ListingsAdminPage, { type ListingsSearchParams } from '@/components/admin/ListingsAdminPage'

// Cache for 2 minutes
export const revalidate = 120

/**
 * Platform listings route — thin wrapper over the merged ListingsAdminPage
 * (admin UI rebuild phase 3, merge 2/11, owner 2026-08-30). scope = null
 * means all verticals; access gate unchanged (requireAdmin).
 */
export default async function AdminListingsPage({ searchParams }: { searchParams: Promise<ListingsSearchParams> }) {
  await requireAdmin()
  const params = await searchParams
  return <ListingsAdminPage scope={null} basePath="/admin/listings" searchParams={params} />
}
