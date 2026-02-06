import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import EditProfileButton from './EditProfileButton'
import ReferralCard from './ReferralCard'
import PaymentMethodsCard from './PaymentMethodsCard'
import FeeBalanceCard from './FeeBalanceCard'
import PromoteCard from './PromoteCard'
import TutorialWrapper from '@/components/onboarding/TutorialWrapper'
import { DashboardNotifications } from '@/components/notifications/DashboardNotifications'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for THIS vertical
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  // If no vendor profile, redirect to vendor signup
  if (vendorError || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get user profile for display name and tutorial status
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('display_name, email, vendor_tutorial_completed_at, vendor_tutorial_skipped_at')
    .eq('user_id', user.id)
    .single()

  // Check if vendor tutorial should be shown
  const hasSeenVendorTutorial = !!(userProfile?.vendor_tutorial_completed_at || userProfile?.vendor_tutorial_skipped_at)
  const showVendorTutorial = !hasSeenVendorTutorial

  // Parse profile_data JSON
  const profileData = vendorProfile.profile_data as Record<string, unknown>

  // Get draft listings count for approved vendors
  let draftCount = 0
  // Low stock threshold (from centralized constants)
  let outOfStockCount = 0
  let lowStockCount = 0

  if (vendorProfile.status === 'approved') {
    const { data: draftListings } = await supabase
      .from('listings')
      .select('id')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'draft')
      .is('deleted_at', null)

    draftCount = draftListings?.length || 0

    // Check for out of stock listings
    const { count: outOfStock } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'published')
      .eq('quantity', 0)
      .is('deleted_at', null)

    outOfStockCount = outOfStock || 0

    // Check for low stock listings (quantity > 0 and <= threshold)
    const { count: lowStock } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'published')
      .gt('quantity', 0)
      .lte('quantity', LOW_STOCK_THRESHOLD)
      .is('deleted_at', null)

    lowStockCount = lowStock || 0
  }

  // Get all configured markets/pickup locations for this vendor
  // This includes: private pickup locations they own + traditional markets they're associated with
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

  let activeMarkets: ActiveMarket[] = []
  if (vendorProfile.status === 'approved') {
    // Get vendor's private pickup locations (markets they own)
    const { data: privatePickups } = await supabase
      .from('markets')
      .select('id, name, market_type, address, city, state, day_of_week, start_time, end_time')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('market_type', 'private_pickup')
      .eq('status', 'active')

    // Get traditional markets where vendor has set up their schedule
    const { data: vendorMarketSchedules } = await supabase
      .from('vendor_market_schedules')
      .select(`
        market_id,
        markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          day_of_week,
          start_time,
          end_time
        )
      `)
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('is_active', true)

    // Also get the vendor's home market if set
    let homeMarket: ActiveMarket | null = null
    if (vendorProfile.home_market_id) {
      const { data: hm } = await supabase
        .from('markets')
        .select('id, name, market_type, address, city, state, day_of_week, start_time, end_time')
        .eq('id', vendorProfile.home_market_id)
        .single()
      homeMarket = hm
    }

    // Combine all sources into activeMarkets
    const marketMap = new Map<string, ActiveMarket>()

    // Add home market first (if set)
    if (homeMarket) {
      marketMap.set(homeMarket.id, homeMarket)
    }

    // Add private pickup locations
    privatePickups?.forEach(market => {
      if (!marketMap.has(market.id)) {
        marketMap.set(market.id, market)
      }
    })

    // Add traditional markets from vendor schedules
    vendorMarketSchedules?.forEach(vms => {
      const market = vms.markets as unknown as ActiveMarket | null
      if (market && !marketMap.has(market.id)) {
        marketMap.set(market.id, market)
      }
    })

    activeMarkets = Array.from(marketMap.values())
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const traditionalMarkets = activeMarkets.filter(m => m.market_type === 'traditional')
  const privatePickups = activeMarkets.filter(m => m.market_type === 'private_pickup')

  // Check for orders needing vendor action
  let pendingOrdersToConfirm = 0  // Pending orders waiting for vendor to confirm they can fulfill
  let needsFulfillment = 0        // Buyer acknowledged but vendor hasn't fulfilled yet

  if (vendorProfile.status === 'approved') {
    // Count pending orders that need initial confirmation
    const { count: pendingCount } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'pending')
      .is('cancelled_at', null)

    pendingOrdersToConfirm = pendingCount || 0

    // Count orders where buyer acknowledged but vendor hasn't fulfilled yet
    // Only count if confirmation window hasn't expired (30-second window)
    const { count: needsFulfillCount } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_profile_id', vendorProfile.id)
      .not('buyer_confirmed_at', 'is', null)
      .is('vendor_confirmed_at', null)
      .is('cancelled_at', null)
      .gt('confirmation_window_expires_at', new Date().toISOString()) // Only active windows

    needsFulfillment = needsFulfillCount || 0
  }

  // Total alerts for the Orders card
  const ordersNeedingAttention = pendingOrdersToConfirm + needsFulfillment

  // Get upcoming pickup dates with order counts (next 7 days)
  interface UpcomingPickup {
    pickup_date: string
    market_id: string
    market_name: string
    item_count: number
  }
  let upcomingPickups: UpcomingPickup[] = []

  if (vendorProfile.status === 'approved') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const { data: upcomingItems } = await supabase
      .from('order_items')
      .select(`
        pickup_date,
        market_id,
        markets!market_id(name)
      `)
      .eq('vendor_profile_id', vendorProfile.id)
      .not('pickup_date', 'is', null)
      .gte('pickup_date', today.toISOString().split('T')[0])
      .lte('pickup_date', nextWeek.toISOString().split('T')[0])
      .not('status', 'in', '("fulfilled","cancelled")')
      .is('cancelled_at', null)

    // Group by pickup_date + market_id
    const pickupMap = new Map<string, UpcomingPickup>()
    for (const item of upcomingItems || []) {
      if (item.pickup_date && item.market_id) {
        const key = `${item.pickup_date}|${item.market_id}`
        // markets is returned as a single object from the FK relationship
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
            Vendor Dashboard
          </h1>
        </div>

        {/* Draft Listings Notice - for approved vendors with drafts */}
        {draftCount > 0 && vendorProfile.status === 'approved' && (
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.md,
            backgroundColor: colors.primaryLight,
            border: `1px solid ${colors.primary}`,
            borderRadius: radius.md,
            color: colors.textPrimary
          }}>
            <strong style={{ fontSize: typography.sizes.base }}>
              You have {draftCount} draft listing{draftCount > 1 ? 's' : ''}!
            </strong>
            <p style={{ margin: `${spacing['2xs']} 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm }}>
              Your account is approved. Visit your listings to publish them and make them visible to buyers.
            </p>
            <Link
              href={`/${vertical}/vendor/listings`}
              style={{
                display: 'inline-block',
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.primary,
                color: colors.textInverse,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
                minHeight: 44
              }}
            >
              View My Listings
            </Link>
          </div>
        )}

        {/* Low Stock / Out of Stock Warning */}
        {(outOfStockCount > 0 || lowStockCount > 0) && vendorProfile.status === 'approved' && (
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.md,
            backgroundColor: outOfStockCount > 0 ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${outOfStockCount > 0 ? '#fecaca' : '#fde68a'}`,
            borderRadius: radius.md,
            color: colors.textPrimary
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
              <span style={{ fontSize: typography.sizes.lg }}>{outOfStockCount > 0 ? '⚠️' : '📦'}</span>
              <strong style={{ fontSize: typography.sizes.base, color: outOfStockCount > 0 ? '#dc2626' : '#d97706' }}>
                {outOfStockCount > 0 && `${outOfStockCount} listing${outOfStockCount > 1 ? 's' : ''} out of stock`}
                {outOfStockCount > 0 && lowStockCount > 0 && ' · '}
                {lowStockCount > 0 && `${lowStockCount} listing${lowStockCount > 1 ? 's' : ''} low on stock`}
              </strong>
            </div>
            <p style={{ margin: `${spacing['2xs']} 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, color: outOfStockCount > 0 ? '#991b1b' : '#92400e' }}>
              {outOfStockCount > 0
                ? 'Buyers cannot order out-of-stock items. Update your inventory to continue selling.'
                : 'Consider restocking soon to avoid missing orders.'}
            </p>
            <Link
              href={`/${vertical}/vendor/listings`}
              style={{
                display: 'inline-block',
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: outOfStockCount > 0 ? '#dc2626' : '#d97706',
                color: 'white',
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
                minHeight: 44
              }}
            >
              Update Inventory
            </Link>
          </div>
        )}

        {/* TOP ROW - Market Day Focus: Manage Locations, Prep for Market, Pickup Mode */}
        <div className="info-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
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
                Edit →
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
                    {market.market_type === 'private_pickup' ? '🏠 ' : '🛒 '}{market.name}
                  </Link>
                ))}
                {activeMarkets.length > 8 && (
                  <Link
                    href={`/${vertical}/vendor/markets`}
                    style={{ fontSize: typography.sizes.xs, color: colors.primary, textDecoration: 'none' }}
                  >
                    +{activeMarkets.length - 8} more →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Upcoming Pickups - shows orders by date */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: upcomingPickups.length > 0 ? '#f0fdf4' : colors.surfaceElevated,
            color: colors.textPrimary,
            border: upcomingPickups.length > 0 ? `2px solid #16a34a` : `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <h3 style={{
                color: upcomingPickups.length > 0 ? '#166534' : colors.primary,
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
                All Orders →
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
                {upcomingPickups.slice(0, 5).map(pickup => {
                  const pickupDate = new Date(pickup.pickup_date + 'T00:00:00')
                  const isToday = pickupDate.toDateString() === new Date().toDateString()
                  const isTomorrow = pickupDate.toDateString() === new Date(Date.now() + 86400000).toDateString()
                  const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : pickupDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

                  return (
                    <Link
                      key={`${pickup.pickup_date}-${pickup.market_id}`}
                      href={`/${vertical}/vendor/orders?pickup_date=${pickup.pickup_date}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${spacing['2xs']} ${spacing.xs}`,
                        backgroundColor: isToday ? '#dcfce7' : 'white',
                        borderRadius: radius.sm,
                        border: isToday ? '1px solid #16a34a' : `1px solid ${colors.borderMuted}`,
                        textDecoration: 'none'
                      }}
                    >
                      <div>
                        <span style={{
                          fontSize: typography.sizes.sm,
                          fontWeight: isToday ? typography.weights.bold : typography.weights.medium,
                          color: isToday ? '#166534' : colors.textPrimary
                        }}>
                          {dateLabel}
                        </span>
                        <span style={{
                          fontSize: typography.sizes.sm,
                          color: colors.textMuted,
                          marginLeft: spacing['2xs']
                        }}>
                          · {pickup.market_name}
                        </span>
                      </div>
                      <span style={{
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.semibold,
                        color: isToday ? '#166534' : colors.primary,
                        backgroundColor: isToday ? '#bbf7d0' : colors.primaryLight,
                        padding: `2px ${spacing.xs}`,
                        borderRadius: radius.full
                      }}>
                        {pickup.item_count} item{pickup.item_count !== 1 ? 's' : ''}
                      </span>
                    </Link>
                  )
                })}
                {upcomingPickups.length > 5 && (
                  <Link
                    href={`/${vertical}/vendor/orders`}
                    style={{ fontSize: typography.sizes.xs, color: colors.primary, textDecoration: 'none', textAlign: 'center' }}
                  >
                    +{upcomingPickups.length - 5} more pickup dates →
                  </Link>
                )}
              </div>
            )}
          </div>

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
        </div>

        {/* MIDDLE ROW - Action Cards: Business Profile, Listings, Market Boxes, Orders, etc */}
        <div className="action-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Business Profile */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
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
                  👁
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
              color: vendorProfile.tier === 'premium' ? colors.accent : colors.textMuted
            }}>
              {vendorProfile.tier === 'premium' ? 'Premium' : vendorProfile.tier === 'featured' ? 'Featured' : 'Standard'} Plan
            </p>
          </div>

          {/* Payment Methods */}
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

          {/* Fee Balance (only shows if balance > 0) */}
          <FeeBalanceCard
            vendorId={vendorProfile.id}
            vertical={vertical}
          />

          {/* Your Listings */}
          <Link
            href={`/${vertical}/vendor/listings`}
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
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>📦</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Your Listings
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                Create and manage your product listings
              </p>
            </div>
          </Link>

          {/* Market Boxes - 4-week subscription bundles */}
          <Link
            href={`/${vertical}/vendor/market-boxes`}
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
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>📦</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Market Boxes
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                Offer 4-week subscription bundles to premium buyers
              </p>
            </div>
          </Link>

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

        {/* Notifications & Referral - Side by side on desktop */}
        {vendorProfile.status === 'approved' && (
          <div className="promote-grow-grid" style={{
            display: 'grid',
            gap: spacing.sm,
            marginBottom: spacing.md
          }}>
            <DashboardNotifications vertical={vertical} limit={5} />
            <ReferralCard vertical={vertical} />
          </div>
        )}

        {/* Promote & Grow Section - Side by side on desktop */}
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

            {/* Upgrade Prompt - Only show for standard vendors */}
            {(!vendorProfile.tier || vendorProfile.tier === 'standard') && (
              <div style={{
                padding: spacing.md,
                background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
                border: '2px solid #fcd34d',
                borderRadius: radius.md,
                boxShadow: shadows.md
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  marginBottom: spacing.xs
                }}>
                  <span style={{ fontSize: typography.sizes['2xl'] }}>🚀</span>
                  <h3 style={{
                    color: '#92400e',
                    margin: 0,
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.bold
                  }}>
                    Grow Your Business
                  </h3>
                </div>

                <p style={{
                  margin: `0 0 ${spacing.sm} 0`,
                  fontSize: typography.sizes.sm,
                  color: '#78350f',
                  fontWeight: typography.weights.medium
                }}>
                  Upgrade to Premium for just <strong>$24.99/month</strong>
                </p>

                <ul style={{
                  margin: `0 0 ${spacing.sm} 0`,
                  paddingLeft: 20,
                  fontSize: typography.sizes.sm,
                  color: '#78350f',
                  lineHeight: 1.6
                }}>
                  <li><strong>10 listings</strong> (vs 5)</li>
                  <li><strong>4 markets + 5 private locations</strong></li>
                  <li><strong>6 Market Boxes</strong> with unlimited subscribers</li>
                  <li><strong>Priority placement</strong> in search & featured sections</li>
                  <li><strong>Premium badge</strong> & advanced analytics</li>
                </ul>

                <Link
                  href={`/${vertical}/vendor/dashboard/upgrade`}
                  style={{
                    display: 'inline-block',
                    padding: `${spacing.xs} ${spacing.md}`,
                    backgroundColor: '#d97706',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: radius.md,
                    fontWeight: typography.weights.bold,
                    fontSize: typography.sizes.base,
                    boxShadow: shadows.sm
                  }}
                >
                  Upgrade Now →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-dashboard .info-grid {
          grid-template-columns: 1fr;
        }
        .vendor-dashboard .action-grid {
          grid-template-columns: 1fr;
        }
        .vendor-dashboard .promote-grow-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-dashboard .info-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .action-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .promote-grow-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendor-dashboard .info-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .vendor-dashboard .action-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>

      {/* Vendor Onboarding Tutorial */}
      <TutorialWrapper vertical={vertical} mode="vendor" showTutorial={showVendorTutorial} />
    </div>
  )
}
