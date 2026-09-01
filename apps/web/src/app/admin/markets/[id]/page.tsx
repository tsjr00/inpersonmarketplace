import { requireAdmin } from '@/lib/auth/admin'
import MarketDetailAdminPage from '@/components/admin/MarketDetailAdminPage'

/**
 * Platform market detail route — thin wrapper over the shared
 * MarketDetailAdminPage (admin UI rebuild phase 5, owner 2026-08-31).
 * Auth unchanged (requireAdmin).
 */
export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  return <MarketDetailAdminPage marketId={id} backHref="/admin/markets" />
}
