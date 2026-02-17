export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { hasAdminRole } from '@/lib/auth/admin'
import Link from 'next/link'
import Image from 'next/image'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import TutorialWrapper from '@/components/onboarding/TutorialWrapper'
import FeedbackCard from '@/components/buyer/FeedbackCard'
import VendorFeedbackCard from '@/components/vendor/VendorFeedbackCard'
import ReferralCard from '@/app/[vertical]/vendor/dashboard/ReferralCard'
import RateOrderCard from '@/components/buyer/RateOrderCard'
import { DashboardNotifications } from '@/components/notifications/DashboardNotifications'
import { term } from '@/lib/vertical'

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
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get vendor profile for THIS vertical (if exists)
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  const isVendor = !!vendorProfile
  const isApprovedVendor = vendorProfile?.status === 'approved'

  // Get user profile to check for admin role, buyer tier, and tutorial status
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile ? hasAdminRole(userProfile) : false
  const buyerTier = (userProfile?.buyer_tier as string) || 'free'
  const isPremiumBuyer = buyerTier === 'premium'

  // Check if user has opted into SMS notifications
  const notifPrefs = (userProfile?.notification_preferences as Record<string, unknown>) || {}
  const hasSmsOptIn = Boolean(userProfile?.phone) && Boolean(notifPrefs.sms_order_updates)

  // Show tutorial for new users who haven't completed or skipped it
  const hasSeenTutorial = !!(userProfile?.tutorial_completed_at || userProfile?.tutorial_skipped_at)
  const showTutorial = !hasSeenTutorial

  // Get recent orders count (as buyer) — scoped to this vertical
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_user_id', user.id)
    .eq('vertical_id', vertical)

  // Get orders with items ready for pickup (up to 3)
  const { data: readyOrders } = await supabase
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
    .order('created_at', { ascending: false })
    .limit(3)

  // Get orders needing buyer confirmation (vendor handed off but buyer hasn't confirmed)
  const { data: ordersNeedingConfirmation } = await supabase
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
    .limit(10)

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
            src="/logos/logo-icon-color.png"
            alt=""
            width={0}
            height={0}
            sizes="40px"
            style={{ width: 'auto', height: 32 }}
          />
          Dashboard
        </h1>
        <span style={{
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
        }}>
          Welcome back, {user.user_metadata?.full_name || user.email?.split('@')[0]}
          {isPremiumBuyer && (
            <span style={{ marginLeft: spacing.xs, color: colors.accent }}>
              • Premium
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
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
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
              color: '#1e40af'
            }}>
              Never miss a pickup — turn on text alerts
            </p>
            <p style={{
              margin: `${spacing['3xs']} 0 0`,
              fontSize: typography.sizes.sm,
              color: '#3b82f6'
            }}>
              Get a text the moment your order is ready so you can head to the market with confidence. Quick setup in Settings.
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
          <span>🛒</span> Shopper
        </h2>

        {/* Ready for Pickup Alert - show prominently if there are orders ready */}
        {ordersReadyForPickup.length > 0 && (
          <div style={{
            padding: spacing.md,
            backgroundColor: '#dcfce7',
            border: '2px solid #16a34a',
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
                color: '#166534',
                whiteSpace: 'nowrap'
              }}>
                Ready for Pickup!
              </h3>
              <span style={{
                backgroundColor: '#16a34a',
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
                    border: '1px solid #bbf7d0'
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
                    color: '#166534',
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    marginBottom: spacing.xs,
                    paddingBottom: spacing.xs,
                    borderBottom: `1px solid ${colors.primary}`
                  }}>
                    {order.ready_item_count < order.total_active_count
                      ? `${order.ready_item_count} of ${order.total_active_count} items ready`
                      : `${order.ready_item_count} item${order.ready_item_count !== 1 ? 's' : ''} ready`
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
                            {pickup.market?.market_type === 'private_pickup' ? '🏠' : '🧺'}
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
                color: '#166534',
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                textDecoration: 'none'
              }}
            >
              View all ready orders →
            </Link>
          </div>
        )}

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
              {term(vertical, 'browse_products_cta')}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {`Discover fresh ${term(vertical, 'products').toLowerCase()} from local ${term(vertical, 'vendors').toLowerCase()}`}
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
                  ? `2px solid #16a34a`
                  : `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              boxShadow: confirmationNeededCount > 0 ? '0 0 0 3px rgba(234, 88, 12, 0.2)' : 'none'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: spacing['2xs'], fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold }}>
              My Orders
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
                  Action Needed
                </span>
              )}
            </h3>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              {orderCount || 0} order{orderCount !== 1 ? 's' : ''} placed
              {confirmationNeededCount > 0 && (
                <span style={{
                  marginLeft: spacing.xs,
                  color: '#ea580c',
                  fontWeight: typography.weights.bold
                }}>
                  • {confirmationNeededCount} to confirm
                </span>
              )}
              {ordersReadyForPickup.length > 0 && (
                <span style={{
                  marginLeft: spacing.xs,
                  color: '#16a34a',
                  fontWeight: typography.weights.semibold
                }}>
                  • {ordersReadyForPickup.length} ready
                </span>
              )}
            </p>
          </Link>

          {/* Notifications Card */}
          <DashboardNotifications vertical={vertical} limit={3} />

          {/* Share Feedback Card */}
          <FeedbackCard vertical={vertical} />
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
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>{`Access to ${term(vertical, 'market_box')} subscriptions`}</span>
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

      </section>

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
              <span>{term(vertical, 'vendor_section_emoji')}</span> {term(vertical, 'vendor')}
            </h2>

            {/* Vendor Signup Card - Encouraging */}
            <div style={{
              padding: spacing.lg,
              backgroundColor: colors.surfaceElevated,
              border: `2px dashed ${colors.accent}`,
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
                    color: colors.accent
                  }}>
                    Turn Your Passion Into Profit
                  </h3>
                  <p style={{
                    margin: `0 0 ${spacing.sm}`,
                    fontSize: typography.sizes.base,
                    color: colors.textSecondary
                  }}>
                    {`Join local ${term(vertical, 'vendors').toLowerCase()} already selling on our platform.`} Easy setup, flexible schedule, direct connection to customers.
                  </p>

                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: spacing['2xs'],
                    marginBottom: spacing.md
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.accent }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        {`Sell your ${term(vertical, 'product_examples')}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.accent }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        Set your own prices and availability
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.accent }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        Get paid directly - no complicated setup
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <span style={{ color: colors.accent }}>✓</span>
                      <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                        Start selling in minutes
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/${vertical}/vendor-signup`}
                    style={{
                      display: 'inline-block',
                      padding: `${spacing.sm} ${spacing.lg}`,
                      backgroundColor: colors.accent,
                      color: colors.textInverse,
                      textDecoration: 'none',
                      borderRadius: radius.md,
                      fontWeight: typography.weights.semibold,
                      fontSize: typography.sizes.base
                    }}
                  >
                    {term(vertical, 'vendor_signup_cta')} →
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
              <span>{term(vertical, 'vendor_section_emoji')}</span> {term(vertical, 'vendor')}
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
                  {term(vertical, 'vendor_dashboard_nav')}
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  Manage listings, orders, and payments
                </p>
              </Link>

              {/* Help & FAQ Card */}
              <Link
                href={`/${vertical}/help`}
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
                  Help & FAQ
                </h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  Guides, tips, and answers to common questions
                </p>
              </Link>

              {/* Vendor Feedback Card */}
              <VendorFeedbackCard vertical={vertical} />

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
                    <li><strong>15 listings</strong> (vs 5)</li>
                    <li><strong>4 markets + 5 private locations</strong></li>
                    <li><strong>{`4 active ${term(vertical, 'market_boxes')}`}</strong> with up to 20 subscribers each</li>
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
                    Upgrade Now
                  </Link>
                </div>
              )}

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

                {/* Help & FAQ Card */}
                <Link
                  href={`/${vertical}/help`}
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
                    Help & FAQ
                  </h3>
                  <p style={{ margin: 0, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                    Guides, tips, and answers to common questions
                  </p>
                </Link>

                {/* Vendor Feedback Card */}
                <VendorFeedbackCard vertical={vertical} />
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
