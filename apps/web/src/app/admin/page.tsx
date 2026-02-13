import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

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
    <div style={{ maxWidth: containers.wide, margin: '0 auto' }}>
      {/* Stale Pending Vendors Warning */}
      {stalePendingCount && stalePendingCount > 0 && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderLeft: '4px solid #f59e0b',
          borderRadius: radius.sm,
          padding: spacing.sm,
          marginBottom: spacing.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
            <span style={{ fontSize: typography.sizes.lg }}>⚠️</span>
            <span style={{ color: '#92400e', fontWeight: typography.weights.semibold }}>
              {stalePendingCount} vendor{stalePendingCount > 1 ? 's' : ''} pending approval for 2+ days
            </span>
          </div>
          <Link
            href="/admin/vendors/pending"
            style={{
              color: '#92400e',
              textDecoration: 'none',
              fontWeight: typography.weights.semibold,
              display: 'flex',
              alignItems: 'center',
              gap: spacing['3xs']
            }}
          >
            Review now →
          </Link>
        </div>
      )}

      {/* Navigation back to Vertical Admin */}
      <div style={{ marginBottom: spacing.sm }}>
        <Link
          href="/farmers_market/admin"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing['2xs'],
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: radius.sm,
            textDecoration: 'none',
            color: '#374151',
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium
          }}
        >
          ← Back to {term('farmers_market', 'display_name')} Admin
        </Link>
      </div>

      <h1 style={{ marginBottom: spacing.lg, color: '#333', fontSize: typography.sizes['2xl'] }}>Admin Dashboard</h1>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: spacing.md,
        marginBottom: spacing.xl
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
          borderRadius: radius.md,
          padding: spacing.md,
          boxShadow: shadows.sm
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing.md
          }}>
            <h2 style={{ color: '#333', fontSize: typography.sizes.xl }}>Pending Vendor Approvals</h2>
            <Link
              href="/admin/vendors/pending"
              style={{
                color: '#0070f3',
                textDecoration: 'none',
                fontWeight: typography.weights.semibold
              }}
            >
              View All
            </Link>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: `${spacing['2xs']} 0`, color: '#666', fontSize: typography.sizes.sm }}>Business</th>
                <th style={{ textAlign: 'left', padding: `${spacing['2xs']} 0`, color: '#666', fontSize: typography.sizes.sm }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: `${spacing['2xs']} 0`, color: '#666', fontSize: typography.sizes.sm }}>Applied</th>
                <th style={{ textAlign: 'right', padding: `${spacing['2xs']} 0`, color: '#666', fontSize: typography.sizes.sm }}>Action</th>
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
                    <td style={{ padding: `${spacing.sm} 0`, color: '#333' }}>{businessName}</td>
                    <td style={{ padding: `${spacing.sm} 0`, color: '#666' }}>{verticalId}</td>
                    <td style={{ padding: `${spacing.sm} 0`, color: '#666' }}>
                      {new Date(createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: `${spacing.sm} 0`, textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendorId}`}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm
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
        gap: spacing.md,
        marginTop: spacing.lg
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
        <QuickAction
          title="Manage Platform Admins"
          description="Add or remove platform administrators"
          href="/admin/admins"
          color="#dc2626"
        />
        <QuickAction
          title="Error Reports"
          description="Review escalated errors across all verticals"
          href="/admin/errors"
          color="#ef4444"
        />
        <QuickAction
          title="CSV Reports"
          description="Export sales, vendors, and customer data"
          href="/admin/reports"
          color="#3b82f6"
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
      borderRadius: radius.md,
      padding: spacing.md,
      boxShadow: shadows.sm,
      borderLeft: `4px solid ${color}`
    }}>
      <div style={{ color: '#666', fontSize: typography.sizes.sm, marginBottom: spacing['3xs'] }}>{title}</div>
      <div style={{ color: '#333', fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold }}>{value}</div>
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
        borderRadius: radius.md,
        padding: spacing.md,
        textDecoration: 'none',
        boxShadow: shadows.sm,
        borderTop: `3px solid ${color}`
      }}
    >
      <h3 style={{ color: '#333', marginBottom: spacing['3xs'], fontSize: typography.sizes.lg }}>{title}</h3>
      <p style={{ color: '#666', fontSize: typography.sizes.sm }}>{description}</p>
    </Link>
  )
}
