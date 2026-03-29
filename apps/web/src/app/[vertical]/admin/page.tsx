import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import AdminResponsiveStyles from '@/components/admin/AdminResponsiveStyles'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface AdminDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function AdminDashboardPage({ params }: AdminDashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Verify admin role - check BOTH columns during transition
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin') ||
    userProfile?.role === 'platform_admin' || userProfile?.roles?.includes('platform_admin')
  if (!isAdmin) {
    redirect(`/${vertical}/dashboard`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Use service client for data queries (RLS restricts counts to own rows)
  const serviceClient = createServiceClient()

  // ============ Fetch all dashboard data ============

  // Markets data
  const [
    { count: totalMarkets },
    { count: pendingMarkets },
    { count: activeMarkets }
  ] = await Promise.all([
    serviceClient.from('markets').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical),
    serviceClient.from('markets').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'pending'),
    serviceClient.from('markets').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('active', true)
  ])

  // Vendors data
  const [
    { count: totalVendors },
    { count: pendingVendors },
    { count: approvedVendors },
    { count: proVendors },
    { count: bossVendors }
  ] = await Promise.all([
    serviceClient.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical),
    serviceClient.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'submitted'),
    serviceClient.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'approved'),
    serviceClient.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'approved').eq('tier', 'pro'),
    serviceClient.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'approved').eq('tier', 'boss')
  ])

  // Users/Buyers data
  const [
    { count: standardBuyers },
    { count: premiumBuyers }
  ] = await Promise.all([
    serviceClient.from('user_profiles').select('*', { count: 'exact', head: true }).or('buyer_tier.is.null,buyer_tier.eq.standard'),
    serviceClient.from('user_profiles').select('*', { count: 'exact', head: true }).eq('buyer_tier', 'premium')
  ])

  // Listings data - products/bundles + active market boxes
  const [
    { count: publishedListings },
    { count: activeMarketBoxes }
  ] = await Promise.all([
    serviceClient.from('listings').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'published').is('deleted_at', null),
    serviceClient.from('market_box_offerings').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('active', true)
  ])

  // Calculate stale vendors (pending 2+ days)
  const { data: pendingVendorsList } = await serviceClient
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('vertical_id', vertical)
    .eq('status', 'submitted')

  const now = new Date()
  const staleCount = pendingVendorsList?.filter(v => {
    const daysPending = Math.floor(
      (now.getTime() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysPending >= 2
  }).length || 0

  // Urgency data: stuck orders + open issues (scoped to vertical via listings join)
  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  const [
    { count: stuckOrdersCount },
    { count: openIssuesCount },
    { count: pendingEventCount }
  ] = await Promise.all([
    serviceClient
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('vertical_id', vertical)
      .in('status', ['paid', 'confirmed'])
      .lt('created_at', oneDayAgo.toISOString()),
    serviceClient
      .from('order_items')
      .select('*, listings!inner(vertical_id)', { count: 'exact', head: true })
      .eq('listings.vertical_id', vertical)
      .not('issue_reported_at', 'is', null)
      .or('issue_status.is.null,issue_status.eq.new'),
    serviceClient
      .from('catering_requests')
      .select('*', { count: 'exact', head: true })
      .eq('vertical_id', vertical)
      .in('status', ['new', 'reviewing'])
  ])

  // Vendor Activity Flags data
  const { data: activityFlags } = await serviceClient
    .from('vendor_activity_flags')
    .select('id, reason, status')
    .eq('vertical_id', vertical)

  const pendingFlags = activityFlags?.filter(f => f.status === 'pending') || []
  const pendingFlagsByReason: Record<string, number> = {}
  pendingFlags.forEach(flag => {
    pendingFlagsByReason[flag.reason] = (pendingFlagsByReason[flag.reason] || 0) + 1
  })

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary,
      padding: spacing.lg
    }}>
      <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          <div>
            <h1 style={{ color: colors.primary, margin: 0, fontSize: typography.sizes['2xl'] }}>
              Admin Panel
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `${spacing['3xs']} 0 0 0` }}>
              {branding.brand_name} - Management Dashboard
            </p>
          </div>
          <Link
            href={`/${vertical}/dashboard`}
            style={{
              color: colors.primary,
              textDecoration: 'none',
              fontWeight: typography.weights.medium,
              fontSize: typography.sizes.sm
            }}
          >
            ← Main Menu
          </Link>
        </div>

        {/* Admin Navigation */}
        <AdminNav type="vertical" vertical={vertical} />

        {/* Stale Vendor Warning */}
        {staleCount > 0 && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderLeft: '4px solid #f59e0b',
            borderRadius: radius.sm,
            padding: spacing.sm,
            marginBottom: spacing.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ fontSize: typography.sizes.lg }}>⚠️</span>
              <span style={{ color: '#92400e', fontWeight: typography.weights.semibold }}>
                {staleCount} vendor{staleCount > 1 ? 's' : ''} pending approval for 2+ days
              </span>
            </div>
            <Link
              href={`/${vertical}/admin/vendors`}
              style={{
                color: '#92400e',
                textDecoration: 'none',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm
              }}
            >
              Review now →
            </Link>
          </div>
        )}

        {/* Stuck Orders Warning */}
        {(stuckOrdersCount || 0) > 0 && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderLeft: '4px solid #ef4444',
            borderRadius: radius.sm,
            padding: spacing.sm,
            marginBottom: spacing.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ fontSize: typography.sizes.lg }}>🚨</span>
              <span style={{ color: '#991b1b', fontWeight: typography.weights.semibold }}>
                {stuckOrdersCount} order{(stuckOrdersCount || 0) > 1 ? 's' : ''} stuck for 24+ hours (paid/confirmed but not fulfilled)
              </span>
            </div>
          </div>
        )}

        {/* Open Issues Warning */}
        {(openIssuesCount || 0) > 0 && (
          <div style={{
            backgroundColor: '#dbeafe',
            border: '1px solid #3b82f6',
            borderLeft: '4px solid #3b82f6',
            borderRadius: radius.sm,
            padding: spacing.sm,
            marginBottom: spacing.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ fontSize: typography.sizes.lg }}>📋</span>
              <span style={{ color: '#1e40af', fontWeight: typography.weights.semibold }}>
                {openIssuesCount} open buyer issue{(openIssuesCount || 0) > 1 ? 's' : ''} need attention
              </span>
            </div>
            <Link
              href={`/${vertical}/admin/order-issues`}
              style={{
                color: '#1e40af',
                textDecoration: 'none',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm
              }}
            >
              Review →
            </Link>
          </div>
        )}

        {/* Pending Events Warning */}
        {(pendingEventCount || 0) > 0 && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderLeft: '4px solid #f59e0b',
            borderRadius: radius.sm,
            padding: spacing.sm,
            marginBottom: spacing.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              <span style={{ fontSize: typography.sizes.lg }}>🎪</span>
              <span style={{ color: '#92400e', fontWeight: typography.weights.semibold }}>
                {pendingEventCount} event request{(pendingEventCount || 0) > 1 ? 's' : ''} awaiting review
              </span>
            </div>
            <Link
              href={`/${vertical}/admin/events`}
              style={{
                color: '#92400e',
                textDecoration: 'none',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm
              }}
            >
              Review →
            </Link>
          </div>
        )}

        {/* 2x2 Management Cards Grid */}
        <div className="admin-grid-2" style={{
          gap: spacing.md
        }}>
          {/* Manage Markets Card */}
          <Link
            href={`/${vertical}/admin/markets`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>{term(vertical, 'market_icon_emoji')}</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Manage Markets
              </h3>
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.sm} 0` }}>
              Create and manage {term(vertical, 'traditional_markets').toLowerCase()} and pickup locations
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.xs }}>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                  {activeMarkets || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Active</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: (pendingMarkets || 0) > 0 ? '#fef3c7' : colors.surfaceSubtle, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: (pendingMarkets || 0) > 0 ? '#92400e' : colors.textPrimary }}>
                  {pendingMarkets || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: (pendingMarkets || 0) > 0 ? '#92400e' : colors.textMuted }}>Pending</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                  {totalMarkets || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Total</div>
              </div>
            </div>
          </Link>

          {/* Manage Vendors Card */}
          <Link
            href={`/${vertical}/admin/vendors`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: (pendingVendors || 0) > 0 ? '2px solid #f59e0b' : `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>{term(vertical, 'vendor_icon_emoji')}</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Manage Vendors
              </h3>
              {(pendingVendors || 0) > 0 && (
                <span style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  borderRadius: radius.full,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.bold
                }}>
                  {pendingVendors} pending
                </span>
              )}
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.sm} 0` }}>
              Review applications, manage vendor tiers and status
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.xs }}>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                  {totalVendors || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Total</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: '#dcfce7', borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: '#166534' }}>
                  {approvedVendors || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: '#166534' }}>Approved</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: (pendingVendors || 0) > 0 ? '#fef3c7' : colors.surfaceSubtle, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: (pendingVendors || 0) > 0 ? '#92400e' : colors.textPrimary }}>
                  {pendingVendors || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: (pendingVendors || 0) > 0 ? '#92400e' : colors.textMuted }}>Pending</div>
              </div>
            </div>
          </Link>

          {/* Manage Users Card */}
          <Link
            href={`/${vertical}/admin/users`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>👥</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Manage Users
              </h3>
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.sm} 0` }}>
              View all users, buyer tiers, and account status
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing.xs }}>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                  {standardBuyers || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Free Buyers</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: '#dbeafe', borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: '#1e40af' }}>
                  {premiumBuyers || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: '#1e40af' }}>Premium</div>
              </div>
            </div>
          </Link>

          {/* Manage Listings Card */}
          <Link
            href={`/${vertical}/admin/listings`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>📦</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Manage Listings
              </h3>
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.sm} 0` }}>
              Browse and moderate vendor product listings
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing.xs }}>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: colors.primaryLight, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.primaryDark }}>
                  {publishedListings || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.primaryDark }}>Products/Bundles</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: colors.primaryLight, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.primaryDark }}>
                  {activeMarketBoxes || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.primaryDark }}>{term(vertical, 'market_boxes')}</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Bottom Row: Activity + Admins + Errors + Reports */}
        <div className="admin-grid-4" style={{
          gap: spacing.md,
          marginTop: spacing.md
        }}>
          {/* Vendor Activity Card */}
          <Link
            href={`/${vertical}/admin/vendor-activity`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: pendingFlags.length > 0 ? '2px solid #ef4444' : `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>🚩</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Vendor Activity
              </h3>
              {pendingFlags.length > 0 && (
                <span style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: '#ef4444',
                  color: 'white',
                  borderRadius: radius.full,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.bold
                }}>
                  {pendingFlags.length} needs attention
                </span>
              )}
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.sm} 0` }}>
              Monitor inactive vendors and referral program
            </p>
            {pendingFlags.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                {pendingFlagsByReason['no_recent_login'] && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    padding: spacing.xs,
                    backgroundColor: '#fef3c7',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs
                  }}>
                    <span style={{ color: '#92400e' }}>⏰</span>
                    <span style={{ color: '#92400e' }}>{pendingFlagsByReason['no_recent_login']} not logged in recently</span>
                  </div>
                )}
                {pendingFlagsByReason['no_published_listings'] && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    padding: spacing.xs,
                    backgroundColor: '#fef2f2',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs
                  }}>
                    <span style={{ color: '#991b1b' }}>📭</span>
                    <span style={{ color: '#991b1b' }}>{pendingFlagsByReason['no_published_listings']} with no listings</span>
                  </div>
                )}
                {pendingFlagsByReason['incomplete_onboarding'] && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    padding: spacing.xs,
                    backgroundColor: '#ffedd5',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs
                  }}>
                    <span style={{ color: '#c2410c' }}>🚧</span>
                    <span style={{ color: '#c2410c' }}>{pendingFlagsByReason['incomplete_onboarding']} incomplete onboarding</span>
                  </div>
                )}
                {pendingFlagsByReason['no_recent_orders'] && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    padding: spacing.xs,
                    backgroundColor: '#f3e8ff',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs
                  }}>
                    <span style={{ color: '#7c3aed' }}>📉</span>
                    <span style={{ color: '#7c3aed' }}>{pendingFlagsByReason['no_recent_orders']} no recent orders</span>
                  </div>
                )}
                {pendingFlagsByReason['no_recent_listing_activity'] && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    padding: spacing.xs,
                    backgroundColor: '#dbeafe',
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs
                  }}>
                    <span style={{ color: '#1e40af' }}>📝</span>
                    <span style={{ color: '#1e40af' }}>{pendingFlagsByReason['no_recent_listing_activity']} no listing updates</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.primaryLight,
                borderRadius: radius.sm,
                textAlign: 'center'
              }}>
                <span style={{ color: colors.primaryDark, fontSize: typography.sizes.sm }}>
                  ✓ All vendors active
                </span>
              </div>
            )}
          </Link>

          {/* Manage Vertical Admins Card */}
          <Link
            href={`/${vertical}/admin/admins`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>🔐</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Manage Admins
              </h3>
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: 0 }}>
              Add or remove vertical administrators
            </p>
          </Link>

          {/* Error Reports Card */}
          <Link
            href={`/${vertical}/admin/errors`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>🐛</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Error Reports
              </h3>
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: 0 }}>
              Review user-reported errors and issues
            </p>
          </Link>

          {/* Reports & Quality Checks Card */}
          <Link
            href={`/${vertical}/admin/reports`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: 'inherit',
              boxShadow: shadows.sm
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
              <span style={{ fontSize: typography.sizes['2xl'] }}>📋</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Reports
              </h3>
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: 0 }}>
              CSV exports and vendor quality checks
            </p>
          </Link>
        </div>

        {/* Link to Platform Admin - visible to all admins, platform page handles auth */}
        {isAdmin && (
          <div style={{
            borderTop: `1px solid ${colors.border}`,
            paddingTop: spacing.md,
            marginTop: spacing.lg
          }}>
            <Link
              href="/admin"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.sm} ${spacing.md}`,
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: radius.md,
                textDecoration: 'none',
                color: '#374151',
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium
              }}
            >
              <span>🌐</span>
              <span>Platform Admin Dashboard</span>
            </Link>
          </div>
        )}
      </div>
      <AdminResponsiveStyles />
    </div>
  )
}
