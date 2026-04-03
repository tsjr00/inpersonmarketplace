export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { hasAdminRole } from '@/lib/auth/admin'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import Link from 'next/link'
import Image from 'next/image'
import { colors, spacing, typography, radius, shadows, containers, statusColors } from '@/lib/design-tokens'
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

  // Fetch organizer's events
  const { data: organizerEvents } = await serviceClient
    .from('catering_requests')
    .select('id, company_name, event_date, event_end_date, status, market_id, event_token, vendor_count, headcount, service_level')
    .eq('organizer_user_id', user.id)
    .eq('vertical_id', vertical)
    .order('event_date', { ascending: false })
    .limit(10)

  // Get vendor counts for organizer's events that have markets
  const organizerMarketIds = (organizerEvents || []).filter(e => e.market_id).map(e => e.market_id as string)
  const organizerVendorCounts: Record<string, number> = {}
  const organizerOrderCounts: Record<string, number> = {}
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
                            {new Date(pickup.pickup_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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

        <div className="shopper-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
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
              {term(vertical, 'browse_products_cta', locale)}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {t('dash.explore', locale, { products: term(vertical, 'products', locale).toLowerCase(), vendors: term(vertical, 'vendors', locale).toLowerCase() })}
            </p>
          </Link>

          {/* My Orders Card - enhanced to show status summary */}
          {/* Priority: orange border for confirmation needed > green border for ready > default */}
          <Link
            href={`/${vertical}/buyer/orders`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: confirmationNeededCount > 0 ? '#fff7ed' : colors.surfaceElevated,
              color: colors.textPrimary,
              border: confirmationNeededCount > 0
                ? '3px solid #ea580c'
                : ordersReadyForPickup.length > 0
                  ? `2px solid ${colors.primary}`
                  : `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              boxShadow: confirmationNeededCount > 0 ? '0 0 0 3px rgba(234, 88, 12, 0.2)' : 'none'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
              {t('dash.my_orders', locale)}
              {confirmationNeededCount > 0 && (
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
                  {t('dash.action_needed', locale)}
                </span>
              )}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {orderCount !== 1
                ? t('dash.active_orders', locale, { count: String(orderCount || 0) })
                : t('dash.active_order', locale, { count: String(orderCount || 0) })
              }
              {confirmationNeededCount > 0 && (
                <span style={{
                  marginLeft: spacing.xs,
                  color: '#ea580c',
                  fontWeight: typography.weights.bold
                }}>
                  • {t('dash.to_confirm', locale, { count: String(confirmationNeededCount) })}
                </span>
              )}
              {ordersReadyForPickup.length > 0 && (
                <span style={{
                  marginLeft: spacing.xs,
                  color: colors.primary,
                  fontWeight: typography.weights.semibold
                }}>
                  • {t('dash.count_ready', locale, { count: String(ordersReadyForPickup.length) })}
                </span>
              )}
            </p>
          </Link>

          {/* My Favorites Card */}
          <Link
            href={`/${vertical}/favorites`}
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
              ❤️ {t('dash.my_favorites', locale)}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {t('dash.saved_vendors', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}
            </p>
          </Link>

          {/* Where Are Trucks Today Card */}
          <Link
            href={`/${vertical}/where-today`}
            style={{
              display: 'block',
              padding: spacing.md,
              backgroundColor: '#fffbeb',
              color: colors.textPrimary,
              border: `2px solid #fbbf24`,
              borderRadius: radius.md,
              textDecoration: 'none'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
              📍 {vertical === 'food_trucks' ? 'Where Are Trucks Today?' : 'What Markets Are Open?'}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {vertical === 'food_trucks'
                ? 'See which food trucks are serving near you right now'
                : 'Find open markets and vendors near you today'}
            </p>
          </Link>

          {/* Notifications Card */}
          <DashboardNotifications vertical={vertical} limit={3} />

          {/* Help & FAQ Search Widget */}
          <HelpSearchWidget vertical={vertical} />

          {/* Share Feedback Card */}
          <FeedbackCard vertical={vertical} />
        </div>

        {/* Upgrade to Premium Card - only show for free tier on verticals with premium enabled */}
        {isBuyerPremiumEnabled(vertical) && !isPremiumBuyer && (
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
                    {t('dash.upgrade_shopper', locale)}
                  </h3>
                </div>
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
          </div>
        )}

      </section>

      {/* ========== MY EVENTS SECTION (for event organizers) ========== */}
      {hasOrganizerEvents && (
        <>
          <div style={{ borderTop: `1px solid ${colors.border}`, marginBottom: spacing.lg }} />
          <section style={{ marginBottom: spacing.lg }}>
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
                  new: { bg: '#eff6ff', text: '#1e40af' },
                  reviewing: { bg: '#fef3c7', text: '#92400e' },
                  approved: { bg: '#f0fdf4', text: '#166534' },
                  ready: { bg: '#f0fdf4', text: '#166534' },
                  active: { bg: '#dcfce7', text: '#14532d' },
                  review: { bg: '#f3e8ff', text: '#7e22ce' },
                  completed: { bg: '#f3f4f6', text: '#374151' },
                  cancelled: { bg: '#fef2f2', text: '#991b1b' },
                  declined: { bg: '#fef2f2', text: '#991b1b' },
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

                    <div style={{ display: 'flex', gap: spacing.md, fontSize: typography.sizes.sm, color: statusColors.neutral500, marginBottom: spacing.xs }}>
                      <span>{vendorAccepted} of {evt.vendor_count} vendors confirmed</span>
                      {preOrderCount > 0 && <span>{preOrderCount} pre-order{preOrderCount !== 1 ? 's' : ''}</span>}
                    </div>

                    <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
                      {evt.event_token && ['approved', 'ready', 'active'].includes(evt.status) && (
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
                            backgroundColor: '#eff6ff',
                            color: '#1e40af',
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
                            backgroundColor: '#f0fdf4',
                            color: '#166534',
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
                  {term(vertical, 'vendor_dashboard_nav', locale)}
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  {t('dash.manage_vendor', locale)}
                </p>
              </Link>

              {/* Help & FAQ Search Widget */}
              <HelpSearchWidget vertical={vertical} />

              {/* Vendor Feedback Card */}
              <VendorFeedbackCard vertical={vertical} />

              {/* Upgrade Prompt - Show for non-premium vendors */}
              {(() => {
                const tier = vendorProfile.tier || 'free'
                const showUpgrade = tier === 'free'
                if (!showUpgrade) return null
                return (
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
                        {t('dash.grow_business', locale)}
                      </h3>
                    </div>

                    <p style={{
                      margin: `0 0 ${spacing.sm} 0`,
                      fontSize: typography.sizes.sm,
                      color: '#78350f',
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
                      color: '#78350f',
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
                        backgroundColor: '#d97706',
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
                  </div>
                )
              })()}

              {/* Referral Card */}
              <ReferralCard vertical={vertical} />
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
                  ⏳ {t('dash.pending_approval', locale)}
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  {t('dash.pending_msg', locale)}
                </p>
              </div>

              {/* Draft Listings Section */}
              <p style={{ margin: `0 0 ${spacing.xs} 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                {t('dash.prepare_listings', locale)}
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
                    {t('dash.create_drafts', locale)}
                  </h3>
                  <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                    {t('dash.start_adding', locale)}
                  </p>
                </Link>

                {/* Help & FAQ Search Widget */}
                <HelpSearchWidget vertical={vertical} />

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
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            gap: spacing['2xs']
          }}>
            <span>🔧</span> {t('dash.admin', locale)}
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
              {t('dash.admin_panel', locale)}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {t('dash.manage_admin', locale)}
            </p>
          </Link>
        </section>
      )}

      {/* ========== ONBOARDING TUTORIAL ========== */}
      <TutorialWrapper vertical={vertical} showTutorial={showTutorial} />

      {/* Responsive Styles */}
      <style>{`
        @media (max-width: 540px) {
          .shopper-grid {
            grid-template-columns: 1fr !important;
          }
          .dashboard-header {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </div>
  )
}
