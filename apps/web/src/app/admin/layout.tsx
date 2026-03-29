import { requireAdmin } from '@/lib/auth/admin'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminResponsiveStyles from '@/components/admin/AdminResponsiveStyles'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await requireAdmin()

  return (
    <>
      <AdminSidebar adminEmail={admin.email}>
        {children}
      </AdminSidebar>
      <AdminResponsiveStyles />
    </>
  )
}
