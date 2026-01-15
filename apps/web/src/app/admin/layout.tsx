import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

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
        padding: 20
      }}>
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 20, marginBottom: 5 }}>Admin Panel</h2>
          <p style={{ fontSize: 12, color: '#888' }}>{admin.email}</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Link
            href="/admin"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              backgroundColor: 'rgba(255,255,255,0.1)'
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/admin/vendors"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            Vendors
          </Link>
          <Link
            href="/admin/vendors/pending"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            Pending Approval
          </Link>
          <Link
            href="/admin/listings"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            Listings
          </Link>
          <Link
            href="/admin/users"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            Users
          </Link>
          <Link
            href="/admin/markets"
            style={{
              padding: '12px 15px',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
            }}
          >
            Markets
          </Link>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.2)',
            margin: '20px 0',
            paddingTop: 20
          }}>
            <Link
              href="/farmers_market/admin"
              style={{
                padding: '12px 15px',
                color: '#22c55e',
                textDecoration: 'none',
                borderRadius: 6,
                display: 'block',
                backgroundColor: 'rgba(34, 197, 94, 0.1)'
              }}
            >
              Vertical Admin
            </Link>
            <Link
              href="/"
              style={{
                padding: '12px 15px',
                color: '#888',
                textDecoration: 'none',
                borderRadius: 6,
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
        padding: 30
      }}>
        {children}
      </main>
    </div>
  )
}
