export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import EditProfileButton from './EditProfileButton'

import PaymentMethodsCard from './PaymentMethodsCard'
import PromoteCard from './PromoteCard'
import TutorialWrapper from '@/components/onboarding/TutorialWrapper'
import OnboardingChecklist from '@/components/vendor/OnboardingChecklist'
import { DashboardNotifications } from '@/components/notifications/DashboardNotifications'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getTierLimits } from '@/lib/vendor-limits'
import UpcomingPickupItem from './UpcomingPickupItem'

interface VendorDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function VendorDashboardPage({ params }: VendorDashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Fetch vendor profile + user profile in parallel (both depend only on user.id)
  const [vendorResult, userProfileResult] = await Promise.all([
    supabase
      .from('vendor_profiles')
      .select('*')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single(),
    supabase
      .from('user_profiles')
      .select('display_name, email, vendor_tutorial_completed_at, vendor_tutorial_skipped_at')
      .eq('user_id', user.id)
      .single()
  ])

  const vendorProfile = vendorResult.data
  const userProfile = userProfileResult.data

  // If no vendor profile, redirect to vendor signup
  if (vendorResult.error || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Check if vendor tutorial should be shown
  const hasSeenVendorTutorial = !!(userProfile?.vendor_tutorial_completed_at || userProfile?.vendor_tutorial_skipped_at)
  const showVendorTutorial = !hasSeenVendorTutorial

  // Parse profile_data JSON
  const profileData = vendorProfile.profile_data as Record<string, unknown>

  // Cancellation rate warning level
  const vpConfirmed = (vendorProfile as any).orders_confirmed_count || 0
  const vpCancelled = (vendorProfile as any).orders_cancelled_after_confirm_count || 0
  const vpCancellationRate = vpConfirmed >= 10 ? Math.round((vpCancelled / vpConfirmed) * 100) : 0
  const cancellationWarningLevel: 'red' | 'orange' | null =
    vpCancellationRate >= 20 ? 'red' : vpCancellationRate >= 10 ? 'orange' : null

  // Types for dashboard data
  interface ActiveMarket {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
    day_of_week: number | null
    start_time: string | null
    end_time: string | null
  }
  interface UpcomingPickup {
    pickup_date: string
    market_id: string
    market_name: string
    item_count: number
  }

  // Default values for non-approved vendors
  let draftCount = 0
  let outOfStockCount = 0
  let lowStockCount = 0
  let activeMarkets: ActiveMarket[] = []
  let pendingOrdersToConfirm = 0
  let needsFulfillment = 0
  let upcomingPickups: UpcomingPickup[] = []

  // Run all dashboard queries in parallel for approved vendors
  if (vendorProfile.status === 'approved') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const [
      draftResult,
      outOfStockResult,
      lowStockResult,
      privatePickupsResult,
      vendorSchedulesResult,
      homeMarketResult,
      pendingResult,
      fulfillResult,
      upcomingResult
    ] = await Promise.all([
      // Draft listings
      supabase
        .from('listings')
        .select('id')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'draft')
        .is('deleted_at', null),
      // Out of stock
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'published')
        .eq('quantity', 0)
        .is('deleted_at', null),
      // Low stock
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'published')
        .gt('quantity', 0)
        .lte('quantity', LOW_STOCK_THRESHOLD)
        .is('deleted_at', null),
      // Private pickup locations
      supabase
        .from('markets')
        .select('id, name, market_type, address, city, state, day_of_week, start_time, end_time')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('market_type', 'private_pickup')
        .eq('status', 'active'),
      // Vendor market schedules (traditional markets)
      supabase
        .from('vendor_market_schedules')
        .select(`
          market_id,
          markets (
            id, name, market_type, address, city, state, day_of_week, start_time, end_time
          )
        `)
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('is_active', true),
      // Home market (conditional — returns null data if no home_market_id)
      vendorProfile.home_market_id
        ? supabase
            .from('markets')
            .select('id, name, market_type, address, city, state, day_of_week, start_time, end_time')
            .eq('id', vendorProfile.home_market_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      // Pending orders to confirm
      supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'pending')
        .is('cancelled_at', null),
      // Orders needing fulfillment
      supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_profile_id', vendorProfile.id)
        .not('buyer_confirmed_at', 'is', null)
        .is('vendor_confirmed_at', null)
        .is('cancelled_at', null)
        .gt('confirmation_window_expires_at', new Date().toISOString()),
      // Upcoming pickups (next 7 days)
      supabase
        .from('order_items')
        .select(`pickup_date, market_id, markets!market_id(name)`)
        .eq('vendor_profile_id', vendorProfile.id)
        .not('pickup_date', 'is', null)
        .gte('pickup_date', today.toISOString().split('T')[0])
        .lte('pickup_date', nextWeek.toISOString().split('T')[0])
        .not('status', 'in', '("fulfilled","cancelled")')
        .is('cancelled_at', null)
    ])

    // Extract results
    draftCount = draftResult.data?.length || 0
    outOfStockCount = outOfStockResult.count || 0
    lowStockCount = lowStockResult.count || 0
    pendingOrdersToConfirm = pendingResult.count || 0
    needsFulfillment = fulfillResult.count || 0

    // Build active markets from 3 sources (home market + private pickups + vendor schedules)
    const marketMap = new Map<string, ActiveMarket>()
    const homeMarket = homeMarketResult.data as ActiveMarket | null
    if (homeMarket) marketMap.set(homeMarket.id, homeMarket)
    privatePickupsResult.data?.forEach(market => {
      if (!marketMap.has(market.id)) marketMap.set(market.id, market)
    })
    vendorSchedulesResult.data?.forEach(vms => {
      const market = vms.markets as unknown as ActiveMarket | null
      if (market && !marketMap.has(market.id)) marketMap.set(market.id, market)
    })
    activeMarkets = Array.from(marketMap.values())

    // Group upcoming items by pickup_date + market_id
    const pickupMap = new Map<string, UpcomingPickup>()
    for (const item of upcomingResult.data || []) {
      if (item.pickup_date && item.market_id) {
        const key = `${item.pickup_date}|${item.market_id}`
        const market = item.markets as unknown as { name: string } | null
        const existing = pickupMap.get(key)
        if (existing) {
          existing.item_count++
        } else {
          pickupMap.set(key, {
            pickup_date: item.pickup_date,
            market_id: item.market_id,
            market_name: market?.name || 'Pickup Location',
            item_count: 1
          })
        }
      }
    }
    upcomingPickups = Array.from(pickupMap.values()).sort((a, b) => a.pickup_date.localeCompare(b.pickup_date))
  }

  // Derived values
  const stockWarningLevel: 'red' | 'orange' | null =
    outOfStockCount > 0 ? 'red' : lowStockCount > 0 ? 'orange' : null
  const ordersNeedingAttention = pendingOrdersToConfirm + needsFulfillment

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary
    }}
    className="vendor-dashboard"
    >
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Header */}
        <div style={{
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          <h1 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold
          }}>
            {term(vertical, 'vendor_dashboard_nav')}
          </h1>
        </div>

        {/* Onboarding Checklist — shown until vendor can publish listings */}
        {vendorProfile.status !== 'approved' && (
          <div style={{ marginBottom: spacing.md }}>
            <OnboardingChecklist vertical={vertical} vendorStatus={vendorProfile.status} />
          </div>
        )}

        {/* ============================================= */}
        {/* ROW 1: Operational - Pickup Mode, Upcoming Pickups, Manage Locations */}
        {/* ============================================= */}
        <div className="row-1-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Pickup Mode - Quick mobile-friendly order lookup */}
          <Link
            href={`/${vertical}/vendor/pickup`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.primaryLight,
              color: colors.textPrimary,
              border: `1px solid ${colors.primary}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              boxShadow: shadows.sm
            }}>
              <h3 style={{
                color: colors.primaryDark,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Pickup Mode
              </h3>
              <p style={{ color: colors.primaryDark, margin: 0, fontSize: typography.sizes.sm }}>
                Mobile-friendly view for market day fulfillment
              </p>
            </div>
          </Link>

          {/* Upcoming Pickups - shows orders by date */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: upcomingPickups.length > 0 ? colors.primaryLight : colors.surfaceElevated,
            color: colors.textPrimary,
            border: upcomingPickups.length > 0 ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <h3 style={{
                color: upcomingPickups.length > 0 ? colors.primaryDark : colors.primary,
                margin: 0,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Upcoming Pickups
              </h3>
              <Link
                href={`/${vertical}/vendor/orders`}
                style={{
                  fontSize: typography.sizes.xs,
                  color: colors.primary,
                  textDecoration: 'none',
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm
                }}
              >
                All Orders
              </Link>
            </div>

            {vendorProfile.status !== 'approved' ? (
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                Available after approval
              </p>
            ) : upcomingPickups.length === 0 ? (
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                No upcoming orders this week
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                {upcomingPickups.slice(0, 5).map(pickup => (
                  <UpcomingPickupItem
                    key={`${pickup.pickup_date}-${pickup.market_id}`}
                    vertical={vertical}
                    pickup_date={pickup.pickup_date}
                    market_id={pickup.market_id}
                    market_name={pickup.market_name}
                    item_count={pickup.item_count}
                  />
                ))}
                {upcomingPickups.length > 5 && (
                  <Link
                    href={`/${vertical}/vendor/orders`}
                    style={{ fontSize: typography.sizes.xs, color: colors.primary, textDecoration: 'none', textAlign: 'center' }}
                  >
                    +{upcomingPickups.length - 5} more pickup dates
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Manage Locations - shows list of locations */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <h3 style={{
                color: colors.primary,
                margin: 0,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Manage Locations
              </h3>
              <Link
                href={`/${vertical}/vendor/markets`}
                style={{
                  fontSize: typography.sizes.xs,
                  color: colors.primary,
                  textDecoration: 'none',
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm
                }}
              >
                Edit
              </Link>
            </div>

            {vendorProfile.status !== 'approved' ? (
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                Available after approval
              </p>
            ) : activeMarkets.length === 0 ? (
              <Link
                href={`/${vertical}/vendor/markets`}
                style={{
                  display: 'block',
                  padding: spacing.xs,
                  backgroundColor: colors.primaryLight,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  textDecoration: 'none',
                  color: colors.primaryDark,
                  textAlign: 'center'
                }}
              >
                + Add your first location
              </Link>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activeMarkets.slice(0, 8).map(market => (
                  <Link
                    key={market.id}
                    href={`/${vertical}/vendor/markets`}
                    style={{
                      fontSize: typography.sizes.sm,
                      textDecoration: 'none',
                      color: colors.textPrimary,
                      display: 'block',
                      lineHeight: 1.4
                    }}
                  >
                    {market.market_type === 'event' ? '🎪 ' : market.market_type === 'private_pickup' ? '🏠 ' : `${term(vertical, 'market_icon_emoji')} `}{market.name}
                  </Link>
                ))}
                {activeMarkets.length > 8 && (
                  <Link
                    href={`/${vertical}/vendor/markets`}
                    style={{ fontSize: typography.sizes.xs, color: colors.primary, textDecoration: 'none' }}
                  >
                    +{activeMarkets.length - 8} more
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================= */}
        {/* ROW 2: Daily Ops - Orders, Listings, Market Boxes */}
        {/* ============================================= */}
        <div className="row-2-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Orders - highlight if there are unconfirmed handoffs */}
          <Link
            href={`/${vertical}/vendor/orders`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: ordersNeedingAttention > 0 ? '#fff7ed' : colors.surfaceElevated,
              color: colors.textPrimary,
              border: ordersNeedingAttention > 0 ? '3px solid #ea580c' : `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: ordersNeedingAttention > 0 ? '0 0 0 3px rgba(234, 88, 12, 0.2)' : shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>🧾</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Orders
                {ordersNeedingAttention > 0 && (
                  <span style={{
                    marginLeft: spacing.xs,
                    backgroundColor: '#ea580c',
                    color: 'white',
                    padding: `2px ${spacing.xs}`,
                    borderRadius: radius.full,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.bold,
                    verticalAlign: 'middle'
                  }}>
                    {ordersNeedingAttention}
                  </span>
                )}
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                {ordersNeedingAttention > 0 ? (
                  <>
                    {pendingOrdersToConfirm > 0 && `${pendingOrdersToConfirm} to confirm`}
                    {pendingOrdersToConfirm > 0 && needsFulfillment > 0 && ' • '}
                    {needsFulfillment > 0 && `${needsFulfillment} to fulfill`}
                  </>
                ) : 'Manage incoming orders from customers'}
              </p>
            </div>
          </Link>

          {/* Your Listings - with stock warnings on the card */}
          <Link
            href={`/${vertical}/vendor/listings`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: stockWarningLevel === 'red' ? '#fef2f2' : stockWarningLevel === 'orange' ? '#fffbeb' : colors.surfaceElevated,
              color: colors.textPrimary,
              border: `${stockWarningLevel ? '2px' : '1px'} solid ${stockWarningLevel === 'red' ? '#fecaca' : stockWarningLevel === 'orange' ? '#fde68a' : colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>🏷️</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Your Listings
                {draftCount > 0 && (
                  <span style={{
                    marginLeft: spacing.xs,
                    backgroundColor: colors.primary,
                    color: 'white',
                    padding: `2px ${spacing.xs}`,
                    borderRadius: radius.full,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.bold,
                    verticalAlign: 'middle'
                  }}>
                    {draftCount} draft{draftCount > 1 ? 's' : ''}
                  </span>
                )}
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                {outOfStockCount > 0
                  ? <span style={{ color: '#dc2626', fontWeight: typography.weights.medium }}>{outOfStockCount} out of stock{lowStockCount > 0 ? ` · ${lowStockCount} low` : ''}</span>
                  : lowStockCount > 0
                    ? <span style={{ color: '#d97706', fontWeight: typography.weights.medium }}>{lowStockCount} low on stock</span>
                    : `Create and manage your ${term(vertical, 'listings').toLowerCase()}`}
              </p>
            </div>
          </Link>

          {/* Market Boxes */}
          {(() => {
            const mbLimit = getTierLimits(vendorProfile.tier || 'standard', vertical).totalMarketBoxes
            const isLocked = mbLimit === 0
            return (
              <Link
                href={`/${vertical}/vendor/market-boxes`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: isLocked ? '#f9fafb' : colors.surfaceElevated,
                  color: colors.textPrimary,
                  border: `1px solid ${isLocked ? '#d1d5db' : colors.border}`,
                  borderRadius: radius.md,
                  cursor: 'pointer',
                  height: '100%',
                  minHeight: 120,
                  boxShadow: shadows.sm
                }}>
                  <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>{term(vertical, 'market_icon_emoji')}</div>
                  <h3 style={{
                    color: isLocked ? colors.textSecondary : colors.primary,
                    margin: `0 0 ${spacing['2xs']} 0`,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold
                  }}>
                    {term(vertical, 'market_boxes')}
                  </h3>
                  {isLocked ? (
                    <p style={{ color: '#d97706', margin: 0, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium }}>
                      Upgrade to Basic or higher to offer {term(vertical, 'market_boxes')}
                    </p>
                  ) : (
                    <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                      Offer four or eight week pre-paid {term(vertical, 'market_boxes').toLowerCase()}
                    </p>
                  )}
                </div>
              </Link>
            )
          })()}
        </div>

        {/* ============================================= */}
        {/* ROW 3: Business - Business Profile, Payment Methods, Analytics */}
        {/* ============================================= */}
        <div className="row-3-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Business Profile */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: cancellationWarningLevel === 'red' ? '#fef2f2' : cancellationWarningLevel === 'orange' ? '#fff7ed' : colors.surfaceElevated,
            color: colors.textPrimary,
            border: `${cancellationWarningLevel ? '2px' : '1px'} solid ${cancellationWarningLevel === 'red' ? '#dc2626' : cancellationWarningLevel === 'orange' ? '#ea580c' : colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: spacing.xs,
              gap: spacing['2xs']
            }}>
              <h3 style={{
                color: colors.primary,
                margin: 0,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Business Profile
              </h3>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                <Link
                  href={`/${vertical}/vendor/${vendorProfile.id}/profile`}
                  target="_blank"
                  style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textSecondary,
                    textDecoration: 'none',
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: radius.sm
                  }}
                  title="Preview your public profile"
                >
                  Preview
                </Link>
                <EditProfileButton vertical={vertical} />
              </div>
            </div>

            <div style={{ fontSize: typography.sizes.sm }}>
              <p style={{ margin: 0, fontWeight: typography.weights.medium }}>
                {(profileData.business_name as string) || (profileData.farm_name as string) || 'Not provided'}
              </p>
              <p style={{ margin: `${spacing['3xs']} 0 0 0`, color: colors.textMuted, fontSize: typography.sizes.xs }}>
                {(profileData.phone as string) || 'No phone'} · {(profileData.email as string) || userProfile?.email || 'No email'}
              </p>
            </div>

            {/* Tier */}
            <p style={{
              margin: `${spacing.xs} 0 0 0`,
              fontSize: typography.sizes.xs,
              color: (vendorProfile.tier && vendorProfile.tier !== 'standard' && vendorProfile.tier !== 'basic') ? colors.accent : colors.textMuted
            }}>
              {(() => {
                const tier = vendorProfile.tier || 'standard'
                const labels: Record<string, string> = {
                  boss: 'Boss',
                  pro: 'Pro',
                  premium: 'Premium',
                  featured: 'Featured',
                  basic: 'Basic',
                  standard: 'Standard',
                }
                return labels[tier] || tier.charAt(0).toUpperCase() + tier.slice(1)
              })()} Plan
            </p>

            {/* Cancellation rate warning */}
            {cancellationWarningLevel && (
              <p style={{
                margin: `${spacing.xs} 0 0 0`,
                fontSize: typography.sizes.xs,
                color: cancellationWarningLevel === 'red' ? '#991b1b' : '#9a3412',
                fontWeight: typography.weights.medium,
                lineHeight: 1.4
              }}>
                Cancellation rate: {vpCancellationRate}% ({vpCancelled} of {vpConfirmed} confirmed orders).
                {cancellationWarningLevel === 'red'
                  ? ' Your account may be subject to review. Please contact support if you need assistance.'
                  : ' Confirming an order is a commitment to fulfill it.'}
              </p>
            )}
          </div>

          {/* Payment Methods (with fee balance collapsed in) */}
          <PaymentMethodsCard
            vendorId={vendorProfile.id}
            vertical={vertical}
            stripeConnected={!!vendorProfile.stripe_account_id}
            initialValues={{
              venmo_username: vendorProfile.venmo_username,
              cashapp_cashtag: vendorProfile.cashapp_cashtag,
              paypal_username: vendorProfile.paypal_username,
              accepts_cash_at_pickup: vendorProfile.accepts_cash_at_pickup || false
            }}
          />

          {/* Analytics */}
          <Link
            href={`/${vertical}/vendor/analytics`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>📊</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Analytics
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                View sales trends, top products, and insights
              </p>
            </div>
          </Link>
        </div>

        {/* ============================================= */}
        {/* ROW 4: Info - Notifications, Reviews */}
        {/* ============================================= */}
        {vendorProfile.status === 'approved' && (
          <div className="row-4-grid" style={{
            display: 'grid',
            gap: spacing.sm,
            marginBottom: spacing.md
          }}>
            <DashboardNotifications vertical={vertical} limit={5} />

            {/* Reviews */}
            <Link
              href={`/${vertical}/vendor/reviews`}
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceElevated,
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.md,
                cursor: 'pointer',
                height: '100%',
                minHeight: 120,
                boxShadow: shadows.sm
              }}>
                <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>⭐</div>
                <h3 style={{
                  color: colors.primary,
                  margin: `0 0 ${spacing['2xs']} 0`,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold
                }}>
                  Reviews
                </h3>
                <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                  See feedback from your customers
                </p>
              </div>
            </Link>
          </div>
        )}

        {/* ============================================= */}
        {/* Promote & Grow Section */}
        {/* ============================================= */}
        {vendorProfile.status === 'approved' && (
          <div className="promote-grow-grid" style={{
            display: 'grid',
            gap: spacing.sm,
            marginBottom: spacing.md
          }}>
            {/* Promote Your Business Card */}
            <PromoteCard
              vendorId={vendorProfile.id}
              vendorName={(profileData.business_name as string) || (profileData.farm_name as string) || 'My Business'}
              vertical={vertical}
            />
          </div>
        )}
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-dashboard .row-1-grid,
        .vendor-dashboard .row-2-grid,
        .vendor-dashboard .row-3-grid {
          grid-template-columns: 1fr;
        }
        .vendor-dashboard .row-4-grid {
          grid-template-columns: 1fr;
        }
        .vendor-dashboard .promote-grow-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-dashboard .row-1-grid,
          .vendor-dashboard .row-2-grid,
          .vendor-dashboard .row-3-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .row-4-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .promote-grow-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendor-dashboard .row-1-grid,
          .vendor-dashboard .row-2-grid,
          .vendor-dashboard .row-3-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>

      {/* Vendor Onboarding Tutorial */}
      <TutorialWrapper vertical={vertical} mode="vendor" showTutorial={showVendorTutorial} />
    </div>
  )
}
