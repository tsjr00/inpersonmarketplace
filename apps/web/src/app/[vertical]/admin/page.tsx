import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import { hasPlatformAdminRole } from '@/lib/auth/admin'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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

  // Check if user has platform admin privileges (can access global admin)
  const isPlatformAdmin = hasPlatformAdminRole(userProfile || {})

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // ============ Fetch all dashboard data ============

  // Markets data
  const [
    { count: totalMarkets },
    { count: pendingMarkets },
    { count: activeMarkets }
  ] = await Promise.all([
    supabase.from('markets').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical),
    supabase.from('markets').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'pending'),
    supabase.from('markets').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('active', true)
  ])

  // Vendors data
  const [
    { count: totalVendors },
    { count: pendingVendors },
    { count: approvedVendors },
    { count: standardVendors },
    { count: premiumVendors }
  ] = await Promise.all([
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'submitted'),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'approved'),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'approved').eq('tier', 'standard'),
    supabase.from('vendor_profiles').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'approved').eq('tier', 'premium')
  ])

  // Users/Buyers data
  const [
    { count: standardBuyers },
    { count: premiumBuyers }
  ] = await Promise.all([
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).or('buyer_tier.is.null,buyer_tier.eq.standard'),
    supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('buyer_tier', 'premium')
  ])

  // Listings data - products/bundles + active market boxes
  const [
    { count: publishedListings },
    { count: activeMarketBoxes }
  ] = await Promise.all([
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('status', 'published').is('deleted_at', null),
    supabase.from('market_box_offerings').select('*', { count: 'exact', head: true }).eq('vertical_id', vertical).eq('active', true)
  ])

  // Calculate stale vendors (pending 2+ days)
  const { data: pendingVendorsList } = await supabase
    .from('vendor_profiles')
    .select('id, created_at')
    .eq('vertical_id', vertical)
    .eq('status', 'submitted')

  const staleCount = pendingVendorsList?.filter(v => {
    const daysPending = Math.floor(
      (Date.now() - new Date(v.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysPending >= 2
  }).length || 0

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

        {/* 2x2 Management Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
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
              <span style={{ fontSize: typography.sizes['2xl'] }}>🏪</span>
              <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.primary }}>
                Manage Markets
              </h3>
            </div>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `0 0 ${spacing.sm} 0` }}>
              Create and manage farmers markets and pickup locations
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
              <span style={{ fontSize: typography.sizes['2xl'] }}>🧑‍🌾</span>
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
                  {standardVendors || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Standard</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: '#dbeafe', borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: '#1e40af' }}>
                  {premiumVendors || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: '#1e40af' }}>Premium</div>
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
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Standard Buyers</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: '#dbeafe', borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: '#1e40af' }}>
                  {premiumBuyers || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: '#1e40af' }}>Premium Buyers</div>
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
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: '#d1fae5', borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: '#065f46' }}>
                  {publishedListings || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: '#065f46' }}>Products/Bundles</div>
              </div>
              <div style={{ textAlign: 'center', padding: spacing.xs, backgroundColor: colors.primaryLight, borderRadius: radius.sm }}>
                <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.primaryDark }}>
                  {activeMarketBoxes || 0}
                </div>
                <div style={{ fontSize: typography.sizes.xs, color: colors.primaryDark }}>Market Boxes</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Link to Platform Admin - only visible to platform admins */}
        {isPlatformAdmin && (
          <div style={{
            borderTop: `1px solid ${colors.border}`,
            paddingTop: spacing.md,
            marginTop: spacing.lg
          }}>
            <Link
              href="/admin"
              style={{
                color: '#7c3aed',
                textDecoration: 'none',
                fontWeight: typography.weights.medium,
                fontSize: typography.sizes.sm
              }}
            >
              Go to Platform Admin Dashboard →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
