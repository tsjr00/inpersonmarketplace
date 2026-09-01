import { requireAdmin } from '@/lib/auth/admin'
import VendorDetailAdminPage from '@/components/admin/VendorDetailAdminPage'

/**
 * Platform vendor detail route — thin wrapper over the merged
 * VendorDetailAdminPage (admin UI rebuild phase 4, owner 2026-08-31). Auth
 * unchanged (requireAdmin); no vertical constraint on the lookup, as before.
 */
export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>
}) {
  const { vendorId } = await params
  await requireAdmin()
  return <VendorDetailAdminPage vendorId={vendorId} />
}
