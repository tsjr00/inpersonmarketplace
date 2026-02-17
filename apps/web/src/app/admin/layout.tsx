import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await requireAdmin()

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 250,
        backgroundColor: '#1a1a2e',
        color: 'white',
        padding: spacing.md
      }}>
        <div style={{ marginBottom: spacing.lg }}>
          <h2 style={{ fontSize: typography.sizes.lg, marginBottom: spacing['3xs'] }}>Admin Panel</h2>
          <p style={{ fontSize: typography.sizes.xs, color: '#888' }}>{admin.email}</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <Link
            href="/admin"
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm,
              backgroundColor: 'rgba(255,255,255,0.1)'
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/admin/vendors"
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm
            }}
          >
            Vendors
          </Link>
          <Link
            href="/admin/vendors/pending"
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm
            }}
          >
            Pending Approval
          </Link>
          <Link
            href="/admin/listings"
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm
            }}
          >
            Listings
          </Link>
          <Link
            href="/admin/users"
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm
            }}
          >
            Users
          </Link>
          <Link
            href="/admin/markets"
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.sm
            }}
          >
            Markets
          </Link>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.2)',
            margin: `${spacing.md} 0`,
            paddingTop: spacing.md
          }}>
            <Link
              href="/farmers_market/admin"
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                color: colors.primary,
                textDecoration: 'none',
                borderRadius: radius.sm,
                display: 'block',
                backgroundColor: colors.primaryLight
              }}
            >
              Vertical Admin
            </Link>
            <Link
              href="/"
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                color: '#888',
                textDecoration: 'none',
                borderRadius: radius.sm,
                display: 'block'
              }}
            >
              Back to Site
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{
        flex: 1,
        backgroundColor: '#f5f5f5',
        padding: spacing.lg
      }}>
        {children}
      </main>
    </div>
  )
}
