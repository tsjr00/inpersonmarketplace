import { requireAdmin } from '@/lib/auth/admin'
import VendorsAdminPage, { type VendorsSearchParams } from '@/components/admin/VendorsAdminPage'

// Cache for 2 minutes
export const revalidate = 120

/**
 * Platform vendors route — thin wrapper over the merged VendorsAdminPage
 * (admin UI rebuild phase 4, owner 2026-08-31). scope = null means all
 * verticals; access gate unchanged (requireAdmin).
 */
export default async function VendorsPage({ searchParams }: { searchParams: Promise<VendorsSearchParams> }) {
  await requireAdmin()
  const params = await searchParams
  return <VendorsAdminPage scope={null} basePath="/admin/vendors" searchParams={params} />
}
