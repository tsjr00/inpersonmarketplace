import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

export default async function AdminDashboardPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Get stats
  const [
    { count: totalUsers },
    { count: totalVendors },
    { count: pendingVendors },
    { count: approvedVendors },
    { count: totalListings },
    { count: publishedListings }
  ] = await Promise.all([
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'published').is('deleted_at', null)
  ])

  // Get recent pending vendors (using id, not vendor_id)
  const { data: recentPending } = await supabase
    .from('vendor_profiles')
    .select('id, profile_data, vertical_id, created_at')
    .eq('status', 'submitted')
    .order('created_at', { ascending: false })
    .limit(5)

  // Get count of stale pending vendors (2+ days old)
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  const { count: stalePendingCount } = await supabase
    .from('vendor_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'submitted')
    .lt('created_at', twoDaysAgo.toISOString())

  return (
    <div>
      {/* Stale Pending Vendors Warning */}
      {stalePendingCount && stalePendingCount > 0 && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderLeft: '4px solid #f59e0b',
          borderRadius: 6,
          padding: 15,
          marginBottom: 25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span style={{ color: '#92400e', fontWeight: 600 }}>
              {stalePendingCount} vendor{stalePendingCount > 1 ? 's' : ''} pending approval for 2+ days
            </span>
          </div>
          <Link
            href="/admin/vendors/pending"
            style={{
              color: '#92400e',
              textDecoration: 'none',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            Review now →
          </Link>
        </div>
      )}

      <h1 style={{ marginBottom: 30, color: '#333' }}>Admin Dashboard</h1>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20,
        marginBottom: 40
      }}>
        <StatCard
          title="Total Users"
          value={totalUsers || 0}
          color="#0070f3"
        />
        <StatCard
          title="Total Vendors"
          value={totalVendors || 0}
          color="#10b981"
        />
        <StatCard
          title="Pending Approval"
          value={pendingVendors || 0}
          color="#f59e0b"
          href="/admin/vendors/pending"
        />
        <StatCard
          title="Approved Vendors"
          value={approvedVendors || 0}
          color="#10b981"
        />
        <StatCard
          title="Total Listings"
          value={totalListings || 0}
          color="#8b5cf6"
        />
        <StatCard
          title="Published Listings"
          value={publishedListings || 0}
          color="#8b5cf6"
        />
      </div>

      {/* Pending Approvals */}
      {pendingVendors && pendingVendors > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 25,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20
          }}>
            <h2 style={{ color: '#333' }}>Pending Vendor Approvals</h2>
            <Link
              href="/admin/vendors/pending"
              style={{
                color: '#0070f3',
                textDecoration: 'none',
                fontWeight: 600
              }}
            >
              View All
            </Link>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', color: '#666' }}>Business</th>
                <th style={{ textAlign: 'left', padding: '10px 0', color: '#666' }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: '10px 0', color: '#666' }}>Applied</th>
                <th style={{ textAlign: 'right', padding: '10px 0', color: '#666' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentPending?.map((vendor) => {
                const vendorId = vendor.id as string
                const profileData = vendor.profile_data as Record<string, unknown>
                const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown'
                const verticalId = vendor.vertical_id as string
                const createdAt = vendor.created_at as string

                return (
                  <tr key={vendorId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '15px 0', color: '#333' }}>{businessName}</td>
                    <td style={{ padding: '15px 0', color: '#666' }}>{verticalId}</td>
                    <td style={{ padding: '15px 0', color: '#666' }}>
                      {new Date(createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '15px 0', textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendorId}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: 4,
                          fontSize: 14
                        }}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 20,
        marginTop: 30
      }}>
        <QuickAction
          title="Review Pending Vendors"
          description="Approve or reject vendor applications"
          href="/admin/vendors/pending"
          color="#f59e0b"
        />
        <QuickAction
          title="Manage All Vendors"
          description="View, edit, or suspend vendors"
          href="/admin/vendors"
          color="#10b981"
        />
        <QuickAction
          title="View All Listings"
          description="Browse and moderate listings"
          href="/admin/listings"
          color="#8b5cf6"
        />
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  color,
  href
}: {
  title: string
  value: number
  color: string
  href?: string
}) {
  const content = (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ color: '#666', fontSize: 14, marginBottom: 5 }}>{title}</div>
      <div style={{ color: '#333', fontSize: 36, fontWeight: 'bold' }}>{value}</div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {content}
      </Link>
    )
  }

  return content
}

function QuickAction({
  title,
  description,
  href,
  color
}: {
  title: string
  description: string
  href: string
  color: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 20,
        textDecoration: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        borderTop: `3px solid ${color}`
      }}
    >
      <h3 style={{ color: '#333', marginBottom: 5 }}>{title}</h3>
      <p style={{ color: '#666', fontSize: 14 }}>{description}</p>
    </Link>
  )
}
