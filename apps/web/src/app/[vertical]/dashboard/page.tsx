export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { hasAdminRole } from '@/lib/auth/admin'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import Link from 'next/link'
import Image from 'next/image'
import { colors, spacing, typography, radius, shadows, containers, statusColors } from '@/lib/design-tokens'
import DashboardCard from '@/components/dashboard/DashboardCard'
import DashboardTile, { TileBadge } from '@/components/dashboard/DashboardTile'
import TutorialWrapper from '@/components/onboarding/TutorialWrapper'
import FeedbackCard from '@/components/buyer/FeedbackCard'
import VendorFeedbackCard from '@/components/vendor/VendorFeedbackCard'
import ReferralCard from '@/app/[vertical]/vendor/dashboard/ReferralCard'
import RateOrderCard from '@/components/buyer/RateOrderCard'
import ExternalOrderFollowUp from '@/components/buyer/ExternalOrderFollowUp'
import { DashboardNotifications } from '@/components/notifications/DashboardNotifications'
import { term, isBuyerPremiumEnabled } from '@/lib/vertical'
import { SUBSCRIPTION_PRICES } from '@/lib/stripe/config'
import HelpSearchWidget from '@/components/help/HelpSearchWidget'
import OrganizerEventActions from '@/components/events/OrganizerEventActions'
import OrganizerEventDetails from '@/components/events/OrganizerEventDetails'
import EventBroadcastCard from '@/components/events/EventBroadcastCard'
import EventAgreementPickerCard from '@/components/events/EventAgreementPickerCard'
import EventRatingsCard from '@/components/events/EventRatingsCard'
import ScrollToSection from '@/components/dashboard/ScrollToSection'
import MarketManagerCard from '@/components/market-manager/MarketManagerCard'
import PendingSurveysCard from '@/components/surveys/PendingSurveysCard'
import { getMarketsManagedBy } from '@/lib/markets/manager-queries'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'

interface DashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { vertical } = await params
  const locale = await getLocale()
  const supabase = await createClient()

  // Check auth + vertical membership
  await enforceVerticalAccess(vertical)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding from defaults
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Phase 2: Parallel data queries — all need user.id + vertical, none depend on each other
  const [
    { data: vendorProfile },
    { data: userProfile },
    { count: orderCount },
    { data: readyOrders },
    { data: ordersNeedingConfirmation },
    managedMarkets,
  ] = await Promise.all([
    // Get vendor profile for THIS vertical (if exists) — only need status + tier
    supabase
      .from('vendor_profiles')
      .select('id, status, tier')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single(),
    // Get user profile to check for admin role, buyer tier, and tutorial status
    supabase
      .from('user_profiles')
      .select('role, roles, buyer_tier, notification_preferences, phone, tutorial_completed_at, tutorial_skipped_at')
      .eq('user_id', user.id)
      .single(),
    // Get active orders count (as buyer) — only current/in-progress orders
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_user_id', user.id)
      .eq('vertical_id', vertical)
      .in('status', ['pending', 'paid', 'confirmed', 'ready']),
    // Get orders with items ready for pickup (up to 3)
    supabase
      .from('orders')
      .select(`
        id,
        order_number,
        created_at,
        order_items!inner (
          id,
          status,
          pickup_date,
          pickup_snapshot,
          market:markets (
            id,
            name,
            market_type,
            city,
            state
          ),
          listing:listings (
            id,
            title,
            vendor_profiles (
              id,
              profile_data
            )
          )
        )
      `)
      .eq('buyer_user_id', user.id)
      .eq('vertical_id', vertical)
      .eq('order_items.status', 'ready')
      .is('order_items.cancelled_at', null)
      .is('order_items.issue_reported_at', null)
      .is('order_items.buyer_confirmed_at', null)
      .order('created_at', { ascending: false })
      .limit(3),
    // Get orders needing buyer confirmation (vendor handed off but buyer hasn't confirmed)
    supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_items!inner (
          id,
          status,
          buyer_confirmed_at
        )
      `)
      .eq('buyer_user_id', user.id)
      .eq('vertical_id', vertical)
      .eq('order_items.status', 'fulfilled')
      .is('order_items.buyer_confirmed_at', null)
      .is('order_items.cancelled_at', null)
      .is('order_items.issue_reported_at', null)
      .limit(10),
    // Markets where this user is the assigned manager (vertical-scoped)
    getMarketsManagedBy(supabase, user, vertical),
  ])

  const isVendor = !!vendorProfile
  const isApprovedVendor = vendorProfile?.status === 'approved'

  // ── Organizer Events: link account + fetch events ──
  const serviceClient = createServiceClient()

  // Auto-link: if this user's email matches an event's contact_email, set organizer_user_id
  await serviceClient
    .from('catering_requests')
    .update({ organizer_user_id: user.id })
    .eq('contact_email', user.email!.toLowerCase())
    .eq('vertical_id', vertical)
    .is('organizer_user_id', null)

  // Auto-link: same pattern for market managers — if admin assigned by email
  // before the user signed up, backfill manager_user_id + manager_accepted_at.
  // Case-insensitive match via ilike (functional index on LOWER(manager_email)
  // supports this). FM-only since v1 manager scope is farmers_market.
  if (user.email && vertical === 'farmers_market') {
    await serviceClient
      .from('markets')
      .update({
        manager_user_id: user.id,
        manager_accepted_at: new Date().toISOString(),
      })
      .ilike('manager_email', user.email)
      .is('manager_user_id', null)
  }

  // Fetch organizer's events
  const { data: organizerEvents } = await serviceClient
    .from('catering_requests')
    .select('id, company_name, event_date, event_end_date, status, market_id, event_token, vendor_count, headcount, service_level, payment_model, access_code')
    .eq('organizer_user_id', user.id)
    .eq('vertical_id', vertical)
    .order('event_date', { ascending: false })
    .limit(10)

  // Get vendor counts for organizer's events that have markets
  const organizerMarketIds = (organizerEvents || []).filter(e => e.market_id).map(e => e.market_id as string)
  const organizerVendorCounts: Record<string, number> = {}
  const organizerOrderCounts: Record<string, number> = {}
  const organizerOrderValues: Record<string, number> = {}
  const organizerWaveData: Record<string, Array<{ wave_number: number; capacity: number; reserved: number; status: string }>> = {}
  if (organizerMarketIds.length > 0) {
    const { data: vendorRows } = await serviceClient
      .from('market_vendors')
      .select('market_id')
      .in('market_id', organizerMarketIds)
      .eq('response_status', 'accepted')

    for (const row of vendorRows || []) {
      const mid = row.market_id as string
      organizerVendorCounts[mid] = (organizerVendorCounts[mid] || 0) + 1
    }

    const { data: orderRows } = await serviceClient
      .from('order_items')
      .select('market_id')
      .in('market_id', organizerMarketIds)
      .not('status', 'in', '("cancelled")')

    for (const row of orderRows || []) {
      const mid = row.market_id as string
      organizerOrderCounts[mid] = (organizerOrderCounts[mid] || 0) + 1
    }

    // Get order value totals per market
    const { data: valueRows } = await serviceClient
      .from('order_items')
      .select('market_id, subtotal_cents')
      .in('market_id', organizerMarketIds)
      .not('status', 'in', '("cancelled")')

    for (const row of valueRows || []) {
      const mid = row.market_id as string
      organizerOrderValues[mid] = (organizerOrderValues[mid] || 0) + (row.subtotal_cents as number)
    }

    // Get wave data for markets with wave ordering
    const { data: waveRows } = await serviceClient
      .from('event_waves')
      .select('market_id, wave_number, capacity, reserved_count, status')
      .in('market_id', organizerMarketIds)
      .order('wave_number')

    for (const row of waveRows || []) {
      const mid = row.market_id as string
      if (!organizerWaveData[mid]) organizerWaveData[mid] = []
      organizerWaveData[mid].push({
        wave_number: row.wave_number as number,
        capacity: row.capacity as number,
        reserved: row.reserved_count as number,
        status: row.status as string,
      })
    }
  }

  const hasOrganizerEvents = (organizerEvents || []).length > 0

  const isAdmin = userProfile ? hasAdminRole(userProfile) : false
  const buyerTier = (userProfile?.buyer_tier as string) || 'free'
  const isPremiumBuyer = buyerTier === 'premium'

  // Check if user has opted into SMS notifications
  const notifPrefs = (userProfile?.notification_preferences as Record<string, unknown>) || {}
  const hasSmsOptIn = Boolean(userProfile?.phone) && Boolean(notifPrefs.sms_order_updates)

  // Show tutorial for new users who haven't completed or skipped it
  const hasSeenTutorial = !!(userProfile?.tutorial_completed_at || userProfile?.tutorial_skipped_at)
  const showTutorial = !hasSeenTutorial

  const confirmationNeededCount = ordersNeedingConfirmation?.length || 0

  // Get total active (non-cancelled) item counts for ready orders
  // This lets us show "X of Y items ready" for partial readiness
  const readyOrderIds = (readyOrders || []).map(o => o.id)
  const { data: activeItemCounts } = readyOrderIds.length > 0
    ? await supabase
        .from('order_items')
        .select('order_id')
        .in('order_id', readyOrderIds)
        .is('cancelled_at', null)
    : { data: null }

  // Count total active items per order
  const activeCountByOrder = (activeItemCounts || []).reduce((acc: Record<string, number>, item: { order_id: string }) => {
    acc[item.order_id] = (acc[item.order_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Transform ready orders to get unique orders with their ready items grouped by vendor+market
  const ordersReadyForPickup = (readyOrders || []).map(order => {
    const readyItems = (order.order_items || []).filter((item: any) => item.status === 'ready')
    // Group by vendor+market combination for clear pickup grouping
    const pickupGroups = readyItems.reduce((acc: any, item: any) => {
      const vendorProfile = item.listing?.vendor_profiles
      const profileData = vendorProfile?.profile_data as Record<string, unknown> | null
      const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
      const vendorId = vendorProfile?.id || 'unknown'
      const marketId = item.market?.id || 'unknown'
      const groupKey = `${vendorId}-${marketId}`

      if (!acc[groupKey]) {
        const snapshot = item.pickup_snapshot as Record<string, unknown> | null
        acc[groupKey] = {
          vendor_name: vendorName,
          market: item.market,
          pickup_date: item.pickup_date,
          pickup_start_time: (snapshot?.start_time as string) || null,
          pickup_end_time: (snapshot?.end_time as string) || null,
          items: []
        }
      }
      acc[groupKey].items.push({
        id: item.id,
        title: item.listing?.title || 'Item'
      })
      return acc
    }, {})
    const totalActiveItems = activeCountByOrder[order.id] || readyItems.length
    return {
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      ready_item_count: readyItems.length,
      total_active_count: totalActiveItems,
      pickups: Object.values(pickupGroups)
    }
  })

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      backgroundColor: colors.surfaceBase,
      color: colors.textSecondary,
      padding: spacing.xl
    }}>
      <ScrollToSection />
      {/* Page Title + Welcome */}
      <div className="dashboard-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: spacing['2xs'],
        margin: 0,
        marginBottom: spacing.lg,
        paddingBottom: spacing.md,
        borderBottom: `2px solid ${colors.primary}`,
      }}>
        <h1 style={{
          color: colors.primary,
          margin: 0,
          fontSize: typography.sizes['2xl'],
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs
        }}>
          <Image
            src={branding.logo_path}
            alt=""
            width={0}
            height={0}
            sizes="40px"
            style={{ width: 'auto', height: 32 }}
          />
          {t('dash.title', locale)}
        </h1>
        <span style={{
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
        }}>
          {t('dash.welcome', locale, { name: user.user_metadata?.full_name || user.email?.split('@')[0] || '' })}
          {isBuyerPremiumEnabled(vertical) && isPremiumBuyer && (
            <span style={{ marginLeft: spacing.xs, color: colors.accent }}>
              • {t('dash.premium_badge', locale)}
            </span>
          )}
        </span>
      </div>

      {/* SMS Opt-In Nudge — hidden once user has phone + consent */}
      {!hasSmsOptIn && (
        <Link
          href={`/${vertical}/settings`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.sm,
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            border: `2px solid ${colors.primary}`,
            borderRadius: radius.md,
            marginBottom: spacing.lg,
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          <span style={{ fontSize: typography.sizes.xl, flexShrink: 0, lineHeight: 1 }}>📱</span>
          <div>
            <p style={{
              margin: 0,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base,
              color: colors.primaryDark
            }}>
              {t('dash.sms_title', locale)}
            </p>
            <p style={{
              margin: `${spacing['3xs']} 0 0`,
              fontSize: typography.sizes.sm,
              color: colors.textSecondary
            }}>
              {t('dash.sms_desc', locale)}
            </p>
          </div>
        </Link>
      )}

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
          <span>🛒</span> {t('dash.shopper', locale)}
        </h2>

        {/* Ready for Pickup Alert - show prominently if there are orders ready */}
        {ordersReadyForPickup.length > 0 && (
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.primaryLight,
            border: `2px solid ${colors.primary}`,
            borderRadius: radius.lg,
            marginBottom: spacing.md
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              marginBottom: spacing.sm,
              flexWrap: 'nowrap'
            }}>
              <span style={{ fontSize: typography.sizes.xl, flexShrink: 0 }}>📦</span>
              <h3 style={{
                margin: 0,
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.bold,
                color: colors.primaryDark,
                whiteSpace: 'nowrap'
              }}>
                {t('dash.ready_for_pickup', locale)}
              </h3>
              <span style={{
                backgroundColor: colors.primary,
                color: 'white',
                padding: `${spacing['3xs']} ${spacing['2xs']}`,
                borderRadius: radius.full,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.bold,
                flexShrink: 0,
                minWidth: '20px',
                textAlign: 'center'
              }}>
                {ordersReadyForPickup.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {ordersReadyForPickup.map((order: any) => (
                <Link
                  key={order.id}
                  href={`/${vertical}/buyer/orders/${order.id}`}
                  style={{
                    display: 'block',
                    padding: spacing.sm,
                    backgroundColor: 'white',
                    borderRadius: radius.md,
                    textDecoration: 'none',
                    border: `1px solid ${colors.border}`
                  }}
                >
                  {/* Order number */}
                  <div style={{
                    fontWeight: typography.weights.bold,
                    color: colors.textPrimary,
                    fontSize: typography.sizes.base,
                    fontFamily: 'monospace'
                  }}>
                    {order.order_number}
                  </div>
                  {/* Item readiness count */}
                  <div style={{
                    color: colors.primaryDark,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    marginBottom: spacing.xs,
                    paddingBottom: spacing.xs,
                    borderBottom: `1px solid ${colors.primary}`
                  }}>
                    {order.ready_item_count < order.total_active_count
                      ? t('dash.x_of_y_ready', locale, { ready: String(order.ready_item_count), total: String(order.total_active_count) })
                      : order.ready_item_count !== 1
                        ? t('dash.x_items_ready', locale, { count: String(order.ready_item_count) })
                        : t('dash.one_item_ready', locale)
                    }
                  </div>

                  {/* Pickup details by vendor — stacked single-column for mobile */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    {order.pickups.map((pickup: any, idx: number) => (
                      <div key={idx} style={{ fontSize: typography.sizes.sm }}>
                        {/* Vendor name */}
                        <div style={{
                          fontWeight: typography.weights.semibold,
                          color: colors.textPrimary,
                          marginBottom: spacing['3xs']
                        }}>
                          {pickup.vendor_name}
                        </div>
                        {/* Item names — each on own line */}
                        {pickup.items.map((item: any, itemIdx: number) => (
                          <div key={itemIdx} style={{
                            color: colors.textMuted,
                            fontSize: typography.sizes.xs,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {item.title}
                          </div>
                        ))}
                        {/* Market / pickup location */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing['3xs'],
                          color: colors.textSecondary,
                          marginTop: spacing['3xs']
                        }}>
                          <span style={{ fontSize: typography.sizes.xs }}>
                            {pickup.market?.market_type === 'event' ? '🎪' : pickup.market?.market_type === 'private_pickup' ? '🏠' : term(vertical, 'market_icon_emoji', locale)}
                          </span>
                          <span style={{
                            fontWeight: typography.weights.medium,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {pickup.market?.name || 'Pickup'}
                          </span>
                        </div>
                        {/* Day, date, and time window */}
                        {pickup.pickup_date && (
                          <div style={{
                            color: colors.textMuted,
                            fontSize: typography.sizes.xs,
                            marginTop: spacing['3xs']
                          }}>
                            {new Date(pickup.pickup_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            {pickup.pickup_start_time && pickup.pickup_end_time && (
                              <span>
                                {' · '}
                                {pickup.pickup_start_time.replace(/:00$/, '')}
                                {' – '}
                                {pickup.pickup_end_time.replace(/:00$/, '')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>

            <Link
              href={`/${vertical}/buyer/orders?status=ready`}
              style={{
                display: 'inline-block',
                marginTop: spacing.sm,
                color: colors.primaryDark,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                textDecoration: 'none'
              }}
            >
              {t('dash.view_ready', locale)}
            </Link>
          </div>
        )}

        {/* External Order Follow-Up — hidden when external payments disabled */}

        {/* Rate Recent Order Card */}
        <RateOrderCard vertical={vertical} />

        {/* Columns live in the .shopper-grid rule below, NOT inline. An inline
            gridTemplateColumns outranks a stylesheet rule, which is why the old
            version needed `!important` to collapse on small screens. Mobile-first
            in CSS matches the vendor dashboard and needs no override. */}
        <div className="shopper-grid" style={{
          display: 'grid',
          gap: spacing.sm
        }}>
          {/* Browse Products */}
          <DashboardTile
            href={`/${vertical}/browse`}
            icon="browse"
            title={term(vertical, 'browse_products_cta', locale)}
          >
            {t('dash.explore', locale, { products: term(vertical, 'products', locale).toLowerCase(), vendors: term(vertical, 'vendors', locale).toLowerCase() })}
          </DashboardTile>

          {/* My Orders — `attention` when the buyer must confirm something,
              `active` when an order is simply ready to collect. */}
          <DashboardTile
            href={`/${vertical}/buyer/orders`}
            icon="orders"
            title={t('dash.my_orders', locale)}
            state={confirmationNeededCount > 0 ? 'attention' : ordersReadyForPickup.length > 0 ? 'active' : 'neutral'}
            badge={confirmationNeededCount > 0 ? <TileBadge>{t('dash.action_needed', locale)}</TileBadge> : undefined}
          >
            {orderCount !== 1
              ? t('dash.active_orders', locale, { count: String(orderCount || 0) })
              : t('dash.active_order', locale, { count: String(orderCount || 0) })
            }
            {confirmationNeededCount > 0 && (
              <span style={{ marginLeft: spacing.xs, color: statusColors.attentionDark, fontWeight: typography.weights.bold }}>
                • {t('dash.to_confirm', locale, { count: String(confirmationNeededCount) })}
              </span>
            )}
            {ordersReadyForPickup.length > 0 && (
              <span style={{ marginLeft: spacing.xs, color: colors.primary, fontWeight: typography.weights.semibold }}>
                • {t('dash.count_ready', locale, { count: String(ordersReadyForPickup.length) })}
              </span>
            )}
          </DashboardTile>

          {/* My Favorites */}
          <DashboardTile
            href={`/${vertical}/favorites`}
            icon="favorites"
            title={t('dash.my_favorites', locale)}
          >
            {t('dash.saved_vendors', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}
          </DashboardTile>

          {/* Where Are Trucks Today / What Markets Are Open — `active` (who is
              out RIGHT NOW), not `warning`. It previously used an off-palette
              amber, which read as a caution about nothing. */}
          <DashboardTile
            href={`/${vertical}/where-today`}
            icon="whereToday"
            title={vertical === 'food_trucks' ? 'Where Are Trucks Today?' : 'What Markets Are Open?'}
            state="active"
          >
            {vertical === 'food_trucks'
              ? 'See which food trucks are serving near you right now'
              : 'Find open markets and vendors near you today'}
          </DashboardTile>

          {/* My Markets Card — only renders if user is assigned manager of any market (FM v1) */}
          <MarketManagerCard vertical={vertical} markets={managedMarkets} />

          {/* Notifications Card */}
          <DashboardNotifications vertical={vertical} limit={3} />

          {/* Help & FAQ Search Widget */}
          <HelpSearchWidget vertical={vertical} />

          {/* Share Feedback Card */}
          <FeedbackCard vertical={vertical} />
        </div>

        {/* Upgrade to Premium — `promo` (outlined accent, no gradient fill).
            Only shows for free tier on verticals with premium enabled. */}
        {isBuyerPremiumEnabled(vertical) && !isPremiumBuyer && (
          <DashboardCard title={t('dash.upgrade_shopper', locale)} state="promo">
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: spacing.md
            }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <p style={{
                  margin: `0 0 ${spacing.sm} 0`,
                  color: colors.textSecondary,
                  fontSize: typography.sizes.base
                }}>
                  {t('dash.premium_pitch', locale)} <strong>${(SUBSCRIPTION_PRICES.buyer.monthly.amountCents / 100).toFixed(2)}/month</strong> or <strong>${(SUBSCRIPTION_PRICES.buyer.annual.amountCents / 100).toFixed(2)}/year</strong>{' '}
                  <span style={{
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    padding: `2px ${spacing['2xs']}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold
                  }}>
                    {t('dash.save_percent', locale, { percent: '32' })}
                  </span>
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: spacing.xs
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>{t('dash.benefit_mbox', locale, { market_box: term(vertical, 'market_box', locale) })}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>{t('dash.benefit_early', locale)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>{t('dash.benefit_support', locale)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                    <span style={{ color: colors.primaryDark, fontWeight: typography.weights.bold }}>✓</span>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>{t('dash.benefit_badge', locale)}</span>
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
                  backgroundColor: 'transparent',
                  color: colors.primary,
                  textDecoration: 'none',
                  borderRadius: radius.md,
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.base,
                  minHeight: 48,
                  whiteSpace: 'nowrap',
                  border: `2px solid ${colors.primary}`
                }}
              >
                {t('dash.upgrade_now', locale)} →
              </Link>
            </div>
          </DashboardCard>
        )}

      </section>

      {/* ========== MY EVENTS SECTION (for event organizers) ========== */}
      {hasOrganizerEvents && (
        <>
          <div style={{ borderTop: `1px solid ${colors.border}`, marginBottom: spacing.lg }} />
          <section id="events-section" style={{ marginBottom: spacing.lg }}>
            <h2 style={{
              fontSize: typography.sizes.xl,
              fontWeight: typography.weights.semibold,
              marginBottom: spacing.sm,
              color: colors.textSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: spacing['2xs']
            }}>
              My Events
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {(organizerEvents || []).map(evt => {
                const vendorAccepted = evt.market_id ? (organizerVendorCounts[evt.market_id] || 0) : 0
                const preOrderCount = evt.market_id ? (organizerOrderCounts[evt.market_id] || 0) : 0
                const eventDate = evt.event_date
                  ? new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Date TBD'
                const statusLabels: Record<string, string> = {
                  new: 'Submitted',
                  reviewing: 'Under Review',
                  approved: 'Approved — Inviting Vendors',
                  ready: 'Vendors Confirmed — Pre-Orders Open',
                  active: 'Event Day',
                  review: 'Event Ended — Collecting Feedback',
                  completed: 'Completed',
                  cancelled: 'Cancelled',
                  declined: 'Declined',
                }
                const statusColors2: Record<string, { bg: string; text: string }> = {
                  // Mapped onto the shared palette 2026-08-07 — no raw hex.
                  // NOTE: `review` uses the selection* (indigo) tokens, which are
                  // the closest purple the palette has. The token name says
                  // "selection" but this is the admin/review accent — worth a
                  // properly named token if the admin surfaces stay put (3b).
                  new: { bg: statusColors.infoLight, text: statusColors.infoDark },
                  reviewing: { bg: statusColors.warningLight, text: statusColors.warningDark },
                  approved: { bg: statusColors.successLight, text: statusColors.successDark },
                  ready: { bg: statusColors.successLight, text: statusColors.successDark },
                  active: { bg: statusColors.successLight, text: statusColors.successDark },
                  review: { bg: statusColors.selectionBg, text: statusColors.selectionText },
                  completed: { bg: statusColors.neutral100, text: statusColors.neutral700 },
                  cancelled: { bg: statusColors.dangerLight, text: statusColors.dangerDark },
                  declined: { bg: statusColors.dangerLight, text: statusColors.dangerDark },
                }
                const sc = statusColors2[evt.status] || statusColors2.new

                return (
                  <div key={evt.id} style={{
                    padding: spacing.sm,
                    backgroundColor: 'white',
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.lg,
                    boxShadow: shadows.sm,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing['2xs'] }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>
                          {evt.company_name}
                        </h3>
                        <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.sm, color: statusColors.neutral500 }}>
                          {eventDate}
                        </p>
                      </div>
                      <span style={{
                        padding: `2px ${spacing.xs}`,
                        backgroundColor: sc.bg,
                        color: sc.text,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
                        whiteSpace: 'nowrap',
                      }}>
                        {statusLabels[evt.status] || evt.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: spacing.md, fontSize: typography.sizes.sm, color: statusColors.neutral500, marginBottom: spacing.xs, flexWrap: 'wrap' }}>
                      <span>{vendorAccepted} of {evt.vendor_count} vendors confirmed</span>
                      {preOrderCount > 0 && <span>{preOrderCount} pre-order{preOrderCount !== 1 ? 's' : ''}</span>}
                      {preOrderCount > 0 && evt.headcount > 0 && (
                        <span>{Math.round((preOrderCount / evt.headcount) * 100)}% participation</span>
                      )}
                    </div>

                    {/* Wave utilization (company-paid events with waves) */}
                    {evt.market_id && organizerWaveData[evt.market_id] && organizerWaveData[evt.market_id].length > 0 && (
                      <div style={{ marginBottom: spacing.xs }}>
                        <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginBottom: spacing['3xs'] }}>
                          Time slot availability
                        </div>
                        <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
                          {organizerWaveData[evt.market_id].map(w => {
                            const pct = w.capacity > 0 ? Math.round((w.reserved / w.capacity) * 100) : 0
                            const isFull = w.status === 'full' || pct >= 100
                            return (
                              <div key={w.wave_number} style={{
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                backgroundColor: isFull ? statusColors.dangerLight : pct > 75 ? statusColors.warningLight : statusColors.successLight,
                                border: `1px solid ${isFull ? statusColors.dangerBorder : pct > 75 ? statusColors.warningBorder : statusColors.successBorder}`,
                                borderRadius: radius.sm,
                                fontSize: 11,
                                color: isFull ? statusColors.dangerDark : pct > 75 ? statusColors.warningDark : statusColors.successDark,
                              }}>
                                W{w.wave_number}: {w.reserved}/{w.capacity} {isFull ? '(full)' : ''}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Order value summary (company-paid) */}
                    {evt.market_id && (organizerOrderValues[evt.market_id] || 0) > 0 && evt.payment_model === 'company_paid' && (
                      <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral600, marginBottom: spacing.xs }}>
                        Total order value: <strong>${((organizerOrderValues[evt.market_id] || 0) / 100).toFixed(2)}</strong>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                      {evt.event_token && ['approved', 'ready', 'active', 'review', 'completed'].includes(evt.status) && (
                        <Link
                          href={`/${vertical}/events/${evt.event_token}`}
                          style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: colors.primary,
                            color: 'white',
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.semibold,
                            textDecoration: 'none',
                          }}
                        >
                          View Event Page
                        </Link>
                      )}
                      {evt.event_token && evt.service_level === 'self_service' && ['approved', 'ready'].includes(evt.status) && (
                        <Link
                          href={`/${vertical}/events/${evt.event_token}/select`}
                          style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: statusColors.infoLight,
                            color: statusColors.infoDark,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.semibold,
                            textDecoration: 'none',
                          }}
                        >
                          Select Vendors
                        </Link>
                      )}
                      {evt.event_token && ['ready', 'active'].includes(evt.status) && (
                        <Link
                          href={`/${vertical}/events/${evt.event_token}/shop`}
                          style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: statusColors.successLight,
                            color: statusColors.successDark,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.semibold,
                            textDecoration: 'none',
                          }}
                        >
                          Shop Page
                        </Link>
                      )}
                    </div>

                    {/* Access code display for company-paid events */}
                    {evt.access_code && (evt.payment_model === 'company_paid' || evt.payment_model === 'hybrid') && (
                      <div style={{
                        marginTop: spacing.xs,
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: statusColors.warningLight,
                        border: `1px solid ${statusColors.warningBorder}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        color: statusColors.warningDark,
                      }}>
                        Access code: <strong style={{ letterSpacing: 2, fontFamily: 'monospace' }}>{evt.access_code}</strong>
                        <span style={{ marginLeft: spacing.xs, color: statusColors.warningDark }}> — share with attendees</span>
                      </div>
                    )}

                    {/* Progressive detail collection */}
                    {evt.event_token && (
                      <OrganizerEventDetails
                        eventToken={evt.event_token}
                        status={evt.status}
                        vertical={vertical}
                        primaryColor={colors.primary}
                      />
                    )}

                    {/* Organizer picks the vendor agreement for this event.
                        Available once the event has a market (post-approval),
                        so it can be set before/while vendors are invited. */}
                    {evt.event_token && ['approved', 'ready', 'active', 'review'].includes(evt.status) && (
                      <EventAgreementPickerCard eventToken={evt.event_token} primaryColor={colors.primary} />
                    )}

                    {/* Organizer → vendors/attendees announcements (once the
                        lineup is confirmed / attendees can order). */}
                    {evt.event_token && ['approved', 'ready', 'active', 'review'].includes(evt.status) && (
                      <EventBroadcastCard eventToken={evt.event_token} primaryColor={colors.primary} />
                    )}

                    {/* Read-only attendee ratings — only exist once the event
                        is ratable (active/review/completed). Approved-only. */}
                    {evt.event_token && ['active', 'review', 'completed'].includes(evt.status) && (
                      <EventRatingsCard eventToken={evt.event_token} primaryColor={colors.primary} />
                    )}

                    {/* Client-side actions: copy link, cancel */}
                    <OrganizerEventActions
                      eventId={evt.id}
                      eventName={evt.company_name}
                      eventToken={evt.event_token}
                      status={evt.status}
                      vertical={vertical}
                    />
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      {/* ========== VENDOR SECTION PLACEHOLDER (for non-vendors) ========== */}
      {!isVendor && (
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
              color: colors.textMuted,
              display: 'flex',
              alignItems: 'center',
              gap: spacing['2xs']
            }}>
              <span>{term(vertical, 'vendor_section_emoji', locale)}</span> {term(vertical, 'vendor', locale)}
            </h2>

            {/* Vendor Signup Card - Encouraging */}
            <div style={{
              padding: spacing.lg,
              backgroundColor: colors.surfaceElevated,
              border: `2px dashed ${colors.primary}`,
              borderRadius: radius.lg,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.md,
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1, minWidth: 250 }}>
                  <h3 style={{
                    margin: `0 0 ${spacing.xs}`,
                    fontSize: typography.sizes.xl,
                    fontWeight: typography.weights.bold,
                    color: colors.primary
                  }}>
                    {t('dash.passion_profit', locale)}
                  </h3>
                  <p style={{
                    margin: `0 0 ${spacing.sm}`,
                    fontSize: typography.sizes.base,
                    color: colors.textSecondary
                  }}>
                    {t('dash.vendor_pitch', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })} {t('dash.vendor_pitch2', locale)}
                  </p>

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing['2xs'],
                    marginBottom: spacing.md
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.primary }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {t('dash.sell_your', locale, { product_examples: term(vertical, 'product_examples', locale) })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.primary }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {t('dash.set_prices', locale)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.primary }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {t('dash.get_paid', locale)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.primary }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {t('dash.reach_customers', locale)}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/${vertical}/vendor-signup`}
                    style={{
                      display: 'inline-block',
                      padding: `${spacing.sm} ${spacing.lg}`,
                      backgroundColor: 'transparent',
                      color: colors.primary,
                      textDecoration: 'none',
                      borderRadius: radius.md,
                      fontWeight: typography.weights.semibold,
                      fontSize: typography.sizes.base,
                      border: `2px solid ${colors.primary}`
                    }}
                  >
                    {term(vertical, 'vendor_signup_cta', locale)} →
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

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
              <span>{term(vertical, 'vendor_section_emoji', locale)}</span> {term(vertical, 'vendor', locale)}
            </h2>

          {isApprovedVendor ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: spacing.sm
            }}>
              {/* Vendor Dashboard */}
              <DashboardTile
                href={`/${vertical}/vendor/dashboard`}
                icon="vendorDashboard"
                title={term(vertical, 'vendor_dashboard_nav', locale)}
                state="active"
              >
                {t('dash.manage_vendor', locale)}
              </DashboardTile>

              {/* Help & FAQ deliberately NOT repeated here (2026-08-07). It
                  already renders once in the Shopper grid above, and it is
                  generic help — nothing about it is vendor-specific. Having it
                  twice on one page is what made this section look like it held
                  misplaced buyer content. */}

              {/* Pending market surveys (Phase E Stage 3) — always
                  shows; muted state when zero pending. Links to the
                  /vendor/surveys list. */}
              <PendingSurveysCard
                vendorProfileId={vendorProfile.id as string}
                vertical={vertical}
              />

              {/* Vendor Feedback Card */}
              <VendorFeedbackCard vertical={vertical} />

              {/* Upgrade Prompt - Show for non-premium vendors */}
              {(() => {
                const tier = vendorProfile.tier || 'free'
                const showUpgrade = tier === 'free'
                if (!showUpgrade) return null
                return (
                  <DashboardCard title={t('dash.grow_business', locale)} state="promo">
                    <p style={{
                      margin: `0 0 ${spacing.sm} 0`,
                      fontSize: typography.sizes.sm,
                      color: colors.textSecondary,
                      fontWeight: typography.weights.medium
                    }}>
                      {vertical === 'food_trucks'
                        ? <>{t('dash.upgrade_basic', locale)} <strong>${(SUBSCRIPTION_PRICES.food_truck_vendor.basic_monthly.amountCents / 100).toFixed(0)}/month</strong></>
                        : <>{t('dash.upgrade_premium_vendor', locale)} <strong>${(SUBSCRIPTION_PRICES.fm_premium.monthly.amountCents / 100).toFixed(2)}/month</strong></>
                      }
                    </p>

                    <ul style={{
                      margin: `0 0 ${spacing.sm} 0`,
                      paddingLeft: 20,
                      fontSize: typography.sizes.sm,
                      color: colors.textSecondary,
                      lineHeight: 1.6
                    }}>
                      {vertical === 'food_trucks' ? (
                        <>
                          <li><strong>{t('dash.ft_benefit_items', locale, { count: '8' })}</strong> (vs 4)</li>
                          <li><strong>{t('dash.ft_benefit_locations', locale, { markets: '3', service: '3' })}</strong></li>
                          <li><strong>{t('dash.ft_benefit_mbox', locale, { count: '2', market_boxes: term(vertical, 'market_boxes', locale) })}</strong> {t('dash.ft_benefit_mbox_subs', locale, { count: '10' })}</li>
                          <li><strong>{t('dash.ft_benefit_analytics', locale, { days: '30' })}</strong></li>
                        </>
                      ) : (
                        <>
                          <li><strong>{t('dash.fm_benefit_listings', locale, { count: '15' })}</strong> (vs 5)</li>
                          <li><strong>{t('dash.fm_benefit_locations', locale, { markets: '4', private: '5' })}</strong></li>
                          <li><strong>{t('dash.ft_benefit_mbox', locale, { count: '4', market_boxes: term(vertical, 'market_boxes', locale) })}</strong> {t('dash.ft_benefit_mbox_subs', locale, { count: '20' })}</li>
                          <li><strong>{t('dash.fm_benefit_priority', locale)}</strong></li>
                          <li><strong>{t('dash.fm_benefit_badge', locale)}</strong></li>
                        </>
                      )}
                    </ul>

                    <Link
                      href={`/${vertical}/vendor/dashboard/upgrade`}
                      style={{
                        display: 'inline-block',
                        padding: `${spacing.xs} ${spacing.md}`,
                        backgroundColor: colors.accentGold,
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: radius.md,
                        fontWeight: typography.weights.bold,
                        fontSize: typography.sizes.base,
                        boxShadow: shadows.sm
                      }}
                    >
                      {t('dash.upgrade_now', locale)}
                    </Link>
                  </DashboardCard>
                )
              })()}

              {/* Referral Card */}
              <ReferralCard vertical={vertical} />
            </div>
          ) : (
            <div>
              {/* Pending Approval — the textbook `pending` case: the vendor has
                  done their part and is waiting on US. Blue, deliberately not
                  orange: "waiting on us" must not read as "waiting on you". */}
              <DashboardCard title={t('dash.pending_approval', locale)} state="pending">
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  {t('dash.pending_msg', locale)}
                </p>
              </DashboardCard>

              {/* Draft Listings Section */}
              <p style={{ margin: `0 0 ${spacing.xs} 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                {t('dash.prepare_listings', locale)}
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: spacing.sm
              }}>
                {/* Create Draft Listings */}
                <DashboardTile
                  href={`/${vertical}/vendor/listings/new`}
                  icon="createDrafts"
                  title={t('dash.create_drafts', locale)}
                >
                  {t('dash.start_adding', locale)}
                </DashboardTile>

                {/* Help & FAQ deliberately NOT repeated here — see the note in
                    the approved-vendor branch above. */}

                {/* Vendor Feedback Card */}
                <VendorFeedbackCard vertical={vertical} />
              </div>

              <p style={{ margin: `${spacing.xs} 0 0 0`, color: colors.accent, fontSize: typography.sizes.sm, fontStyle: 'italic' }}>
                {t('dash.drafts_note', locale)}
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
            color: statusColors.selectionBorder,
            display: 'flex',
            alignItems: 'center',
            gap: spacing['2xs']
          }}>
            <span>🔧</span> {t('dash.admin', locale)}
          </h2>

          {/* Admin panel entry. NOTE: the owner has said this band does not have
              to live on the dashboard at all and could move to settings —
              decided in Slice 3b (the Partner reorg). For now it only gets
              standardized chrome; nothing is moved. */}
          <div style={{ maxWidth: 300 }}>
            <DashboardTile
              href={`/${vertical}/admin`}
              icon="adminPanel"
              title={t('dash.admin_panel', locale)}
            >
              {t('dash.manage_admin', locale)}
            </DashboardTile>
          </div>
        </section>
      )}

      {/* ========== ONBOARDING TUTORIAL ========== */}
      <TutorialWrapper vertical={vertical} showTutorial={showTutorial} />

      {/* Responsive Styles */}
      <style>{`
        /* MOBILE-FIRST — one column by default, widening at the same breakpoints
           the vendor dashboard uses (640 / 1024), so both surfaces reflow
           identically. Most users are on a phone, so the phone case is the
           default rather than the exception. Replaces a desktop-first
           "2 columns, collapse under 540px with !important" rule. */
        /* minmax(0, ...) not plain 1fr: a bare 1fr track refuses to shrink
           below its content's minimum, so one non-wrapping string (a long
           notification title, a URL, a long market name) widens its column and
           squeezes every sibling. Paired with minWidth:0 on the card and tile
           wrappers — the track side alone is not enough, the grid ITEM has to
           be allowed to shrink too. Fixed 2026-08-07 after the FT shopper
           dashboard showed one wide notifications column and two narrow ones.
           NOTE: no backticks in this comment — the whole block is a JS
           template literal, so a stray backtick ends it early. */
        .shopper-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        @media (min-width: 640px) {
          .shopper-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .shopper-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 540px) {
          .dashboard-header {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </div>
  )
}
