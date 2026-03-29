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

  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  const [
    { count: stalePendingCount },
    { count: stuckOrdersCount },
    { count: openIssuesCount },
    { count: fmPendingVendors },
    { count: fmOpenIssues },
    { count: fmPendingEvents },
    { count: ftPendingVendors },
    { count: ftOpenIssues },
    { count: ftPendingEvents }
  ] = await Promise.all([
    supabase
      .from('vendor_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'submitted')
      .lt('created_at', twoDaysAgo.toISOString()),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['paid', 'confirmed'])
      .lt('created_at', oneDayAgo.toISOString()),
    supabase
      .from('order_items')
      .select('*', { count: 'exact', head: true })
      .not('issue_reported_at', 'is', null)
      .or('issue_status.is.null,issue_status.eq.new'),
    // Per-vertical urgency counts
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', 'farmers_market').eq('status', 'submitted'),
    supabase.from('order_items').select('*, listings!inner(vertical_id)', { count: 'exact', head: true }).eq('listings.vertical_id', 'farmers_market').not('issue_reported_at', 'is', null).or('issue_status.is.null,issue_status.eq.new'),
    supabase.from('catering_requests').select('*', { count: 'exact', head: true }).eq('vertical_id', 'farmers_market').in('status', ['new', 'reviewing']),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', 'food_trucks').eq('status', 'submitted'),
    supabase.from('order_items').select('*, listings!inner(vertical_id)', { count: 'exact', head: true }).eq('listings.vertical_id', 'food_trucks').not('issue_reported_at', 'is', null).or('issue_status.is.null,issue_status.eq.new'),
    supabase.from('catering_requests').select('*', { count: 'exact', head: true }).eq('vertical_id', 'food_trucks').in('status', ['new', 'reviewing']),
  ])

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

      {/* Stuck Orders Warning */}
      {stuckOrdersCount && stuckOrdersCount > 0 && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fca5a5',
          borderLeft: '4px solid #ef4444',
          borderRadius: radius.sm,
          padding: spacing.sm,
          marginBottom: spacing.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#991b1b', fontWeight: typography.weights.semibold }}>
            {stuckOrdersCount} order{stuckOrdersCount > 1 ? 's' : ''} stuck in paid/confirmed for 24+ hours
          </span>
        </div>
      )}

      {/* Open Issues Warning */}
      {openIssuesCount && openIssuesCount > 0 && (
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #93c5fd',
          borderLeft: '4px solid #3b82f6',
          borderRadius: radius.sm,
          padding: spacing.sm,
          marginBottom: spacing.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ color: '#1e40af', fontWeight: typography.weights.semibold }}>
            {openIssuesCount} unresolved order issue{openIssuesCount > 1 ? 's' : ''}
          </span>
          <Link
            href="/admin/order-issues"
            style={{
              color: '#1e40af',
              textDecoration: 'none',
              fontWeight: typography.weights.semibold,
            }}
          >
            Review →
          </Link>
        </div>
      )}

      {/* Vertical Command Center */}
      <div className="admin-grid-2" style={{ gap: spacing.md, marginBottom: spacing.md }}>
        {[
          { id: 'farmers_market', name: 'Farmers Marketing', color: '#2d5016', pending: fmPendingVendors || 0, issues: fmOpenIssues || 0, events: fmPendingEvents || 0 },
          { id: 'food_trucks', name: "Food Truck'n", color: '#ff5757', pending: ftPendingVendors || 0, issues: ftOpenIssues || 0, events: ftPendingEvents || 0 },
        ].map(v => {
          const totalUrgent = v.pending + v.issues + v.events
          return (
            <Link
              key={v.id}
              href={`/${v.id}/admin`}
              style={{
                display: 'block',
                padding: spacing.md,
                backgroundColor: 'white',
                border: totalUrgent > 0 ? `2px solid ${v.color}` : '1px solid #d1d5db',
                borderRadius: radius.md,
                textDecoration: 'none',
                boxShadow: shadows.sm,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                <h3 style={{ margin: 0, color: v.color, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                  {v.name}
                </h3>
                {totalUrgent > 0 && (
                  <span style={{
                    backgroundColor: v.color,
                    color: 'white',
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.bold,
                    padding: `2px ${spacing['2xs']}`,
                    borderRadius: radius.full,
                    minWidth: 20,
                    textAlign: 'center',
                  }}>
                    {totalUrgent}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: spacing.md, fontSize: typography.sizes.sm }}>
                {v.pending > 0 && (
                  <span style={{ color: '#92400e' }}>⏳ {v.pending} pending vendor{v.pending !== 1 ? 's' : ''}</span>
                )}
                {v.issues > 0 && (
                  <span style={{ color: '#1e40af' }}>⚠️ {v.issues} open issue{v.issues !== 1 ? 's' : ''}</span>
                )}
                {v.events > 0 && (
                  <span style={{ color: '#92400e' }}>🎪 {v.events} event request{v.events !== 1 ? 's' : ''}</span>
                )}
                {totalUrgent === 0 && (
                  <span style={{ color: '#6b7280' }}>All clear</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      <h1 style={{ marginBottom: spacing.lg, color: '#333', fontSize: typography.sizes['2xl'] }}>Admin Dashboard</h1>

      {/* Stats Grid */}
      <div className="admin-grid-3" style={{
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

          <div className="admin-table-wrap">
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
        </div>
      )}

      {/* Quick Actions */}
      <div className="admin-grid-3" style={{
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
