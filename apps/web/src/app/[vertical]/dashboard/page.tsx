import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { hasAdminRole } from '@/lib/auth/admin'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface DashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding from defaults
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for THIS vertical (if exists)
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  const isVendor = !!vendorProfile
  const isApprovedVendor = vendorProfile?.status === 'approved'

  // Get user profile to check for admin role and buyer tier
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles, buyer_tier, buyer_tier_expires_at')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile ? hasAdminRole(userProfile) : false
  const buyerTier = (userProfile?.buyer_tier as string) || 'free'
  const isPremiumBuyer = buyerTier === 'premium'

  // Get recent orders count (as buyer)
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_user_id', user.id)

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      backgroundColor: colors.surfaceBase,
      color: colors.textSecondary,
      padding: spacing.xl
    }}>
      {/* Page Title */}
      <h1 style={{
        color: colors.primary,
        margin: 0,
        marginBottom: spacing.lg,
        paddingBottom: spacing.md,
        borderBottom: `2px solid ${colors.primary}`,
        fontSize: typography.sizes['2xl']
      }}>
        {branding.brand_name} Dashboard
      </h1>

      {/* Welcome Section */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        color: colors.textPrimary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.lg
      }}>
        <h2 style={{ marginTop: 0, marginBottom: spacing['3xs'], fontSize: typography.sizes.xl }}>
          Welcome back, {user.user_metadata?.full_name || user.email?.split('@')[0]}!
        </h2>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>{user.email}</p>
      </div>

      {/* ========== SHOPPER SECTION ========== */}
      <section style={{ marginBottom: spacing.lg }}>
        <h2 style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.semibold,
          marginBottom: spacing.sm,
          color: colors.primary,
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs']
        }}>
          <span>🛒</span> Shopper
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: spacing.sm
        }}>
          {/* Browse Products Card */}
          <Link
            href={`/${vertical}/browse`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
              Browse Products
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              Discover fresh products from local vendors
            </p>
          </Link>

          {/* My Orders Card */}
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
              My Orders
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {orderCount || 0} order{orderCount !== 1 ? 's' : ''} placed
            </p>
          </Link>
        </div>

        {/* Upgrade to Premium Card - only show for free tier */}
        {!isPremiumBuyer && (
          <div style={{
            marginTop: spacing.md,
            padding: spacing.md,
            backgroundColor: colors.primaryLight,
            background: `linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.surfaceSubtle} 100%)`,
            border: `1px solid ${colors.primary}`,
            borderRadius: radius.lg
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: spacing.md
            }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing['2xs'],
                  marginBottom: spacing['2xs']
                }}>
                  <span style={{ fontSize: typography.sizes['2xl'] }}>⭐</span>
                  <h3 style={{
                    margin: 0,
                    fontSize: typography.sizes.xl,
                    fontWeight: typography.weights.bold,
                    color: colors.primaryDark
                  }}>
                    Upgrade Your Shopper Account
                  </h3>
                </div>
                <p style={{
                  margin: `0 0 ${spacing.sm} 0`,
                  color: colors.textSecondary,
                  fontSize: typography.sizes.base
                }}>
                  Become a Premium Shopper for just <strong>$9.99/month</strong> or <strong>$81.50/year</strong>{' '}
                  <span style={{
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    padding: `2px ${spacing['2xs']}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold
                  }}>
                    Save 32%
                  </span>
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: spacing.xs
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>Access to Market Box subscriptions</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>Early access to new listings</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>Priority customer support</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>Premium shopper badge</span>
                  </div>
                </div>
              </div>

              <Link
                href={`/${vertical}/buyer/upgrade`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${spacing.sm} ${spacing.lg}`,
                  backgroundColor: colors.primary,
                  color: colors.textInverse,
                  textDecoration: 'none',
                  borderRadius: radius.md,
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.base,
                  minHeight: 48,
                  whiteSpace: 'nowrap',
                  boxShadow: shadows.primary
                }}
              >
                Upgrade Now →
              </Link>
            </div>
          </div>
        )}

        {/* Premium Member Badge - show for premium buyers */}
        {isPremiumBuyer && (
          <div style={{
            marginTop: spacing.md,
            padding: spacing.sm,
            backgroundColor: colors.primaryLight,
            border: `1px solid ${colors.primary}`,
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs
          }}>
            <span style={{ fontSize: typography.sizes['2xl'] }}>⭐</span>
            <div>
              <div style={{
                fontWeight: typography.weights.semibold,
                color: colors.primaryDark,
                fontSize: typography.sizes.base
              }}>
                Premium Member
              </div>
              <div style={{ fontSize: typography.sizes.sm, color: colors.primaryDark }}>
                Enjoying early access, priority support, and exclusive benefits
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========== VENDOR SECTION ========== */}
      {isVendor && (
        <>
          {/* Separator between Shopper and Vendor sections */}
          <div style={{
            borderTop: `1px solid ${colors.border}`,
            marginBottom: spacing.lg
          }} />

          <section style={{ marginBottom: spacing.lg }}>
            <h2 style={{
              fontSize: typography.sizes.xl,
              fontWeight: typography.weights.semibold,
              marginBottom: spacing.sm,
              color: colors.accent,
              display: 'flex',
              alignItems: 'center',
              gap: spacing['2xs']
            }}>
              <span>🏪</span> Vendor
            </h2>

          {isApprovedVendor ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: spacing.sm
            }}>
              {/* Vendor Dashboard Card */}
              <Link
                href={`/${vertical}/vendor/dashboard`}
                style={{
                  display: 'block',
                  padding: spacing.md,
                  backgroundColor: colors.primaryLight,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.primary}`,
                  borderRadius: radius.md,
                  textDecoration: 'none'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
                  Vendor Dashboard
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  Manage listings, orders, and payments
                </p>
              </Link>

              {/* My Listings Card */}
              <Link
                href={`/${vertical}/vendor/listings`}
                style={{
                  display: 'block',
                  padding: spacing.md,
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.md,
                  textDecoration: 'none'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
                  My Listings
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  View and manage your products
                </p>
              </Link>

              {/* My Market Boxes Card */}
              <Link
                href={`/${vertical}/vendor/market-boxes`}
                style={{
                  display: 'block',
                  padding: spacing.md,
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.primary}`,
                  borderRadius: radius.md,
                  textDecoration: 'none'
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
                  My Market Boxes
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  Create subscription bundles for premium buyers
                </p>
              </Link>
            </div>
          ) : (
            <div>
              {/* Pending Approval Notice */}
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceSubtle,
                color: colors.textPrimary,
                border: `1px solid ${colors.accent}`,
                borderRadius: radius.md,
                marginBottom: spacing.sm
              }}>
                <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.accent }}>
                  ⏳ Pending Approval
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  Your vendor application is being reviewed. We&apos;ll notify you once approved.
                </p>
              </div>

              {/* Draft Listings Section */}
              <p style={{ margin: `0 0 ${spacing.xs} 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                While you wait, you can prepare your listings:
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: spacing.sm
              }}>
                {/* Create Draft Listings Card */}
                <Link
                  href={`/${vertical}/vendor/listings/new`}
                  style={{
                    display: 'block',
                    padding: spacing.md,
                    backgroundColor: colors.surfaceElevated,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.accent}`,
                    borderRadius: radius.md,
                    textDecoration: 'none'
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
                    Create Draft Listings
                  </h3>
                  <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                    Start adding your products now
                  </p>
                </Link>

                {/* My Listings Card */}
                <Link
                  href={`/${vertical}/vendor/listings`}
                  style={{
                    display: 'block',
                    padding: spacing.md,
                    backgroundColor: colors.surfaceElevated,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.accent}`,
                    borderRadius: radius.md,
                    textDecoration: 'none'
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
                    My Listings
                  </h3>
                  <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                    View and edit your draft listings
                  </p>
                </Link>

                {/* My Market Boxes Card - greyed out for pending vendors */}
                <div
                  style={{
                    display: 'block',
                    padding: spacing.md,
                    backgroundColor: colors.surfaceMuted,
                    color: colors.textMuted,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    opacity: 0.7
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textMuted }}>
                    My Market Boxes
                  </h3>
                  <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                    Available after approval - create subscription bundles
                  </p>
                </div>
              </div>

              <p style={{ margin: `${spacing.xs} 0 0 0`, color: colors.accent, fontSize: typography.sizes.sm, fontStyle: 'italic' }}>
                Listings will be saved as drafts and can be published once your account is approved.
              </p>
            </div>
          )}
          </section>
        </>
      )}

      {/* ========== ADMIN SECTION ========== */}
      {isAdmin && (
        <section style={{ marginBottom: spacing.lg }}>
          <h2 style={{
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold,
            marginBottom: spacing.sm,
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            gap: spacing['2xs']
          }}>
            <span>🔧</span> Admin
          </h2>

          <Link
            href={`/${vertical}/admin`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: '#f5f3ff',
              color: colors.textPrimary,
              border: '1px solid #c4b5fd',
              borderRadius: radius.md,
              textDecoration: 'none',
              maxWidth: 300
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
              Admin Panel
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              Manage vendors, listings, and users
            </p>
          </Link>
        </section>
      )}

      {/* ========== BECOME A VENDOR (small, at bottom) ========== */}
      {!isVendor && (
        <section style={{
          borderTop: `1px solid ${colors.border}`,
          paddingTop: spacing.md,
          marginTop: spacing.md
        }}>
          <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
            Interested in selling?{' '}
            <Link
              href={`/${vertical}/vendor-signup`}
              style={{
                color: colors.primary,
                textDecoration: 'none',
                fontWeight: typography.weights.medium
              }}
            >
              Become a vendor →
            </Link>
          </p>
        </section>
      )}
    </div>
  )
}
