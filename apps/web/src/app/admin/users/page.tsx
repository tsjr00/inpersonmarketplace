import { requireAdmin } from '@/lib/auth/admin'
import UsersAdminPage, { type UsersSearchParams } from '@/components/admin/UsersAdminPage'

// Cache for 2 minutes
export const revalidate = 120

/**
 * Platform users route — thin wrapper over the merged UsersAdminPage
 * (admin UI rebuild phase 3, first merge, owner 2026-08-30). scope = null
 * means all verticals; access gate unchanged (requireAdmin).
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<UsersSearchParams> }) {
  await requireAdmin()
  const params = await searchParams
  return <UsersAdminPage scope={null} basePath="/admin/users" searchParams={params} />
}
