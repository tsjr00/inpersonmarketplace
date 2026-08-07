export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import Link from 'next/link'
import EditProfileButton from './EditProfileButton'

import PaymentMethodsCard from './PaymentMethodsCard'
import PromoteCard from './PromoteCard'
import TutorialWrapper from '@/components/onboarding/TutorialWrapper'
import OnboardingChecklist from '@/components/vendor/OnboardingChecklist'
import { DashboardNotifications } from '@/components/notifications/DashboardNotifications'
import { LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { formatPrice } from '@/lib/pricing'
import { colors, spacing, typography, radius, containers, statusColors } from '@/lib/design-tokens'
import DashboardCard from '@/components/dashboard/DashboardCard'
import DashboardTile, { TileBadge } from '@/components/dashboard/DashboardTile'
import { term } from '@/lib/vertical'
import { getTierLimits, getFtTierExtras } from '@/lib/vendor-limits'
import UpcomingPickupItem from './UpcomingPickupItem'
import ExternalPaymentBanner from '@/components/vendor/ExternalPaymentBanner'
import QualityAlertBanner from '@/components/vendor/QualityAlertBanner'
import MarketCheckInPrompt from '@/components/vendor/MarketCheckInPrompt'

interface VendorDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function VendorDashboardPage({ params }: VendorDashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth + vertical membership
  await enforceVerticalAccess(vertical)
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
      .select('display_name, email, vendor_tutorial_completed_at, vendor_tutorial_skipped_at, notification_preferences')
      .eq('user_id', user.id)
      .single()
  ])

  const vendorProfile = vendorResult.data
  const userProfile = userProfileResult.data

  // If no vendor profile, redirect to vendor signup
  if (vendorResult.error || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Check which vendor tutorial to show
  // Phase 1 ("Getting Approved"): shows pre-onboarding, tracked via dedicated columns
  // Phase 2 ("Your Dashboard"): shows post-onboarding, tracked via notification_preferences JSONB
  const hasSeenTutorial1 = !!(userProfile?.vendor_tutorial_completed_at || userProfile?.vendor_tutorial_skipped_at)
  const notifPrefs = (userProfile?.notification_preferences || {}) as Record<string, unknown>
  const hasSeenTutorial2 = !!(notifPrefs.dashboard_tutorial_completed_at || notifPrefs.dashboard_tutorial_skipped_at)

  // Tutorial 2 requires canPublishListings — check all gates directly via DB
  let canPublishListings = false
  if (hasSeenTutorial1 && !hasSeenTutorial2 && vendorProfile.status === 'approved' && vendorProfile.stripe_payouts_enabled) {
    const { data: verification } = await supabase
      .from('vendor_verifications')
      .select('status, category_verifications, onboarding_completed_at')
      .eq('vendor_profile_id', vendorProfile.id)
      .single()

    if (verification) {
      const { data: partnerAcceptance } = await supabase
        .from('user_agreement_acceptances')
        .select('id')
        .eq('user_id', user.id)
        .eq('agreement_type', 'vendor_partner')
        .limit(1)
        .maybeSingle()

      const isGrandfathered = !!verification.onboarding_completed_at
      const partnerAccepted = !!partnerAcceptance

      // Check Gate 2: all category docs approved
      const catVer = (verification.category_verifications || {}) as Record<string, { status: string }>
      const allCatsApproved = Object.values(catVer).every(
        v => v.status === 'approved' || v.status === 'not_required'
      )

      canPublishListings =
        verification.status === 'approved' &&
        allCatsApproved &&
        (isGrandfathered || partnerAccepted)
    }
  }

  // Priority: Tutorial 1 first, then Tutorial 2 after all gates passed
  const showTutorial1 = !hasSeenTutorial1
  const showTutorial2 = hasSeenTutorial1 && canPublishListings && !hasSeenTutorial2
  const tutorialPhase: 1 | 2 = showTutorial1 ? 1 : 2

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
  interface VendorEvent {
    id: string
    response_status: string
    invited_at: string | null
    is_backup: boolean
    markets: {
      id: string
      name: string
      city: string | null
      state: string | null
      headcount: number | null
      event_start_date: string | null
      event_end_date: string | null
    }
  }

  // Default values for non-approved vendors
  let draftCount = 0
  let outOfStockCount = 0
  let lowStockCount = 0
  let activeMarkets: ActiveMarket[] = []
  let pendingOrdersToConfirm = 0
  let needsFulfillment = 0
  let upcomingPickups: UpcomingPickup[] = []
  let monthlySalesCents = 0
  let pendingPayoutsCents = 0
  let completedPayoutsCents = 0
  let vendorEvents: VendorEvent[] = []

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
      vendorListingMarketsResult,
      homeMarketResult,
      pendingResult,
      fulfillResult,
      upcomingResult,
      monthlySalesResult,
      pendingPayoutsResult,
      completedPayoutsResult,
      vendorEventsResult
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
      // Markets where vendor has listings (only show where they actually sell)
      supabase
        .from('listing_markets')
        .select(`
          market_id,
          markets (
            id, name, market_type, address, city, state, day_of_week, start_time, end_time
          ),
          listings!inner (id)
        `)
        .eq('listings.vendor_profile_id', vendorProfile.id)
        .is('listings.deleted_at', null),
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
        .is('cancelled_at', null),
      // M-5: Monthly sales (fulfilled order items this month)
      supabase
        .from('order_items')
        .select('subtotal_cents')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'fulfilled')
        .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString())
        .is('cancelled_at', null),
      // M-5: Pending payouts
      supabase
        .from('vendor_payouts')
        .select('amount_cents')
        .eq('vendor_profile_id', vendorProfile.id)
        .in('status', ['pending', 'processing', 'pending_stripe_setup']),
      // M-5: Completed payouts this month
      supabase
        .from('vendor_payouts')
        .select('amount_cents')
        .eq('vendor_profile_id', vendorProfile.id)
        .eq('status', 'completed')
        .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString()),
      // Vendor events (only for event-approved vendors)
      vendorProfile.event_approved
        ? supabase
            .from('market_vendors')
            .select(`
              id, response_status, invited_at, is_backup,
              markets!inner (
                id, name, city, state, headcount, event_start_date, event_end_date
              )
            `)
            .eq('vendor_profile_id', vendorProfile.id)
            .eq('markets.market_type', 'event')
            .neq('response_status', 'declined')
        : Promise.resolve({ data: null, error: null }),
    ])

    // Extract results
    draftCount = draftResult.data?.length || 0
    outOfStockCount = outOfStockResult.count || 0
    lowStockCount = lowStockResult.count || 0
    pendingOrdersToConfirm = pendingResult.count || 0
    needsFulfillment = fulfillResult.count || 0

    // M-5: Earnings totals
    monthlySalesCents = (monthlySalesResult.data || []).reduce((sum: number, item: { subtotal_cents: number }) => sum + (item.subtotal_cents || 0), 0)
    pendingPayoutsCents = (pendingPayoutsResult.data || []).reduce((sum: number, item: { amount_cents: number }) => sum + (item.amount_cents || 0), 0)
    completedPayoutsCents = (completedPayoutsResult.data || []).reduce((sum: number, item: { amount_cents: number }) => sum + (item.amount_cents || 0), 0)

    // Vendor events
    if (vendorEventsResult.data) {
      vendorEvents = (vendorEventsResult.data as unknown as VendorEvent[]) || []
    }

    // Build active markets: home market + private pickups + markets with listings
    // Only shows locations where vendor actually sells (not auto-enrolled empty markets)
    const marketMap = new Map<string, ActiveMarket>()
    const homeMarket = homeMarketResult.data as ActiveMarket | null
    if (homeMarket) marketMap.set(homeMarket.id, homeMarket)
    privatePickupsResult.data?.forEach(market => {
      if (!marketMap.has(market.id)) marketMap.set(market.id, market)
    })
    vendorListingMarketsResult.data?.forEach((lm: { market_id: string; markets: unknown }) => {
      const market = lm.markets as ActiveMarket | null
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
          {/* Page title sits at `xl` per the 4-size scale (title xl · headers lg ·
              body sm · meta xs). The emoji inside tiles stay at 2xl — a single
              glyph cannot wrap, so the size ban applies to text, not artwork. */}
          <h1 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold
          }}>
            {term(vertical, 'vendor_dashboard_nav')}
          </h1>
        </div>

        {/* Onboarding Checklist — shown until vendor can publish listings.
            Component self-hides with a condensed "complete" banner once canPublishListings is true. */}
        <div style={{ marginBottom: spacing.md }}>
          <OnboardingChecklist vertical={vertical} vendorStatus={vendorProfile.status} />
        </div>

        {/* External Payment Banner — hidden when external payments disabled */}

        {/* Trial Status Banner removed 2026-07-18 — the 90-day vendor trial was
            retired (owner decision). TRIAL_SYSTEM_ENABLED has been false, so no
            new trials start; the banner's copy also advertised a retired tier
            ("Basic — $10/mo"; Basic is now free, entry paid tier is Pro).
            trial_ends_at / trial_grace_ends_at remain on vendor_profiles as
            historical data for legacy rows. */}

        {/* Quality Alert Banner — nightly scan findings */}
        {vendorProfile.status === 'approved' && (
          <QualityAlertBanner vertical={vertical} />
        )}

        {/* ============================================= */}
        {/* ROW 1: Operational - Pickup Mode, Upcoming Pickups, Manage Locations */}
        {/* ============================================= */}
        <div className="row-1-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Pickup Mode - Quick mobile-friendly order lookup (hidden pre-approval) */}
          {vendorProfile.status === 'approved' && (
            <DashboardTile
              href={`/${vertical}/vendor/pickup`}
              title="Pickup Mode"
              state="active"
            >
              Mobile-friendly view for market day fulfillment
            </DashboardTile>
          )}

          {/* Upcoming Pickups — compact tile (hidden pre-approval) */}
          {vendorProfile.status === 'approved' && (
            <DashboardTile
              href={`/${vertical}/vendor/upcoming`}
              title="Upcoming Pickups"
              state={upcomingPickups.length > 0 ? 'active' : 'neutral'}
            >
              {upcomingPickups.length === 0 ? (
                'Prep lists, pick tickets & order details for each pickup day'
              ) : (() => {
                const today = new Date().toISOString().split('T')[0]
                const todayCount = upcomingPickups.filter(p => p.pickup_date === today)
                const totalItems = upcomingPickups.reduce((sum, p) => sum + p.item_count, 0)
                const locationCount = new Set(upcomingPickups.map(p => p.market_id)).size
                return (
                  <>
                    {todayCount.length > 0 && (
                      <p style={{
                        margin: `0 0 ${spacing['3xs']} 0`,
                        fontWeight: typography.weights.bold,
                        color: colors.primaryDark,
                      }}>
                        Today: {todayCount.reduce((s, p) => s + p.item_count, 0)} item{todayCount.reduce((s, p) => s + p.item_count, 0) !== 1 ? 's' : ''} at {todayCount.length} location{todayCount.length !== 1 ? 's' : ''}
                      </p>
                    )}
                    <p style={{ margin: 0 }}>
                      {upcomingPickups.length} pickup{upcomingPickups.length !== 1 ? 's' : ''} · {locationCount} location{locationCount !== 1 ? 's' : ''} · {totalItems} item{totalItems !== 1 ? 's' : ''} this week
                    </p>
                  </>
                )
              })()}
            </DashboardTile>
          )}

          {/* Manage Locations — a CARD, not a tile: you act inside it (check in,
              open the log, jump to a specific location) rather than the whole
              surface being one door. See the tile/card taxonomy in
              docs/Codebase_Map/22_Components_UI.md. */}
          <DashboardCard
            title="Manage Locations"
            headerAccessory={
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
            }
          >
            <MarketCheckInPrompt vertical={vertical} />

            {/* FT compliance (P3b): link to the exportable location log. */}
            {vertical === 'food_trucks' && (
              <Link
                href={`/${vertical}/vendor/location-log`}
                style={{
                  display: 'block',
                  marginBottom: spacing.xs,
                  fontSize: typography.sizes.xs,
                  color: colors.primary,
                  textDecoration: 'none',
                }}
              >
                📄 My location log (attendance history) →
              </Link>
            )}

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
                {/* Service locations first, events last */}
                {[...activeMarkets].sort((a, b) => {
                  if (a.market_type === 'event' && b.market_type !== 'event') return 1
                  if (a.market_type !== 'event' && b.market_type === 'event') return -1
                  return 0
                }).slice(0, 8).map(market => (
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
          </DashboardCard>
        </div>

        {/* ============================================= */}
        {/* YOUR EVENTS — only for event-approved vendors  */}
        {/* Full-width CARD placed BELOW the tile grid, not inside it (2026-08-07).
            It was previously a grid cell, which is why five sections — Action
            Needed / Today / Upcoming / Backup / Past — were fighting over a
            third of a row. It is a card by definition (you respond to
            invitations inside it), and cards are full-width and stacked.
            Kept as a card rather than demoted to a tile because event
            invitations are time-sensitive and must not sit one click away
            behind a badge. Trimming which sections earn the front is a CONTENT
            decision, deferred to the events rebuild. */}
        {/* ============================================= */}
        {vendorProfile.event_approved && vendorProfile.status === 'approved' && (() => {
          const todayStr = new Date().toISOString().split('T')[0]
          const invitations = vendorEvents.filter(e => e.response_status === 'invited' && e.markets.event_start_date && e.markets.event_start_date >= todayStr)
          const todayEvents = vendorEvents.filter(e => e.response_status === 'accepted' && !e.is_backup && e.markets.event_start_date && e.markets.event_start_date <= todayStr && (!e.markets.event_end_date || e.markets.event_end_date >= todayStr))
          const upcoming = vendorEvents.filter(e => e.response_status === 'accepted' && !e.is_backup && e.markets.event_start_date && e.markets.event_start_date > todayStr)
          const backups = vendorEvents.filter(e => e.is_backup && e.markets.event_start_date && e.markets.event_start_date >= todayStr)
          const past = vendorEvents.filter(e => e.response_status === 'accepted' && e.markets.event_start_date && e.markets.event_start_date < todayStr && (!e.markets.event_end_date || e.markets.event_end_date < todayStr))
          const hasContent = invitations.length > 0 || todayEvents.length > 0 || upcoming.length > 0 || backups.length > 0 || past.length > 0

          const fmtEventDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const eventRowStyle = {
            display: 'flex' as const,
            justifyContent: 'space-between' as const,
            alignItems: 'center' as const,
            padding: `${spacing['2xs']} ${spacing.xs}`,
            borderRadius: radius.sm,
            textDecoration: 'none' as const,
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            lineHeight: 1.5,
          }

          return (
            <DashboardCard
              title="🎪 Your Events"
              state={invitations.length > 0 ? 'attention' : todayEvents.length > 0 ? 'active' : 'neutral'}
              headerAccessory={
                invitations.length > 0
                  ? <TileBadge>{invitations.length}</TileBadge>
                  : undefined
              }
            >
              {!hasContent ? (
                <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                  No event invitations yet. When organizers request food trucks, you&apos;ll see invitations here.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {/* Action Needed — invitations awaiting response */}
                  {invitations.length > 0 && (
                    <div>
                      <p style={{ margin: `0 0 ${spacing['3xs']}`, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Action Needed
                      </p>
                      {invitations
                        .sort((a, b) => (a.markets.event_start_date || '').localeCompare(b.markets.event_start_date || ''))
                        .map(ev => (
                          <Link key={ev.id} href={`/${vertical}/vendor/events/${ev.markets.id}`} style={{ ...eventRowStyle, backgroundColor: '#fff7ed' }}>
                            <span>
                              {fmtEventDate(ev.markets.event_start_date!)} · {ev.markets.city}{ev.markets.state ? `, ${ev.markets.state}` : ''} · ~{ev.markets.headcount || '?'} people
                            </span>
                            <span style={{ color: '#ea580c', fontWeight: typography.weights.semibold, fontSize: typography.sizes.xs, whiteSpace: 'nowrap' }}>
                              View &amp; Respond →
                            </span>
                          </Link>
                        ))}
                    </div>
                  )}

                  {/* Today — events happening now */}
                  {todayEvents.length > 0 && (
                    <div>
                      <p style={{ margin: `0 0 ${spacing['3xs']}`, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.primaryDark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Today
                      </p>
                      {todayEvents.map(ev => (
                        <Link key={ev.id} href={`/${vertical}/vendor/events/${ev.markets.id}`} style={{ ...eventRowStyle, backgroundColor: colors.primaryLight }}>
                          <span>
                            🎪 {ev.markets.name} · {ev.markets.city}{ev.markets.state ? `, ${ev.markets.state}` : ''} · ~{ev.markets.headcount || '?'} people
                          </span>
                          <span style={{ color: colors.primaryDark, fontWeight: typography.weights.semibold, fontSize: typography.sizes.xs, whiteSpace: 'nowrap' }}>
                            Details →
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Upcoming — accepted future events */}
                  {upcoming.length > 0 && (
                    <div>
                      <p style={{ margin: `0 0 ${spacing['3xs']}`, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Upcoming
                      </p>
                      {upcoming
                        .sort((a, b) => (a.markets.event_start_date || '').localeCompare(b.markets.event_start_date || ''))
                        .slice(0, 5)
                        .map(ev => (
                          <Link key={ev.id} href={`/${vertical}/vendor/events/${ev.markets.id}`} style={eventRowStyle}>
                            <span>
                              {fmtEventDate(ev.markets.event_start_date!)} · {ev.markets.city}{ev.markets.state ? `, ${ev.markets.state}` : ''} · ~{ev.markets.headcount || '?'} people
                            </span>
                            <span style={{ color: colors.primary, fontSize: typography.sizes.xs, whiteSpace: 'nowrap' }}>
                              Details →
                            </span>
                          </Link>
                        ))}
                      {upcoming.length > 5 && (
                        <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          +{upcoming.length - 5} more upcoming
                        </p>
                      )}
                    </div>
                  )}

                  {/* Backup — standby for escalation */}
                  {backups.length > 0 && (
                    <div>
                      <p style={{ margin: `0 0 ${spacing['3xs']}`, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Backup
                      </p>
                      {backups.map(ev => (
                        <div key={ev.id} style={{ ...eventRowStyle, color: colors.textMuted }}>
                          <span>
                            Standby for {fmtEventDate(ev.markets.event_start_date!)} event in {ev.markets.city || 'TBD'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Past — collapsed count */}
                  {past.length > 0 && (
                    <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                      {past.length} past event{past.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
            </DashboardCard>
          )
        })()}

        {/* ============================================= */}
        {/* ROW 2: Daily Ops - Orders, Listings, Market Boxes */}
        {/* ============================================= */}
        <div className="row-2-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Orders — `attention` when handoffs are unconfirmed: nothing is broken,
              there is simply a task only this vendor can do. (hidden pre-approval) */}
          {vendorProfile.status === 'approved' && (
            <DashboardTile
              href={`/${vertical}/vendor/orders`}
              icon="🧾"
              title="Orders"
              state={ordersNeedingAttention > 0 ? 'attention' : 'neutral'}
              badge={ordersNeedingAttention > 0 ? <TileBadge>{ordersNeedingAttention}</TileBadge> : undefined}
            >
              {ordersNeedingAttention > 0 ? (
                <>
                  {pendingOrdersToConfirm > 0 && `${pendingOrdersToConfirm} to confirm`}
                  {pendingOrdersToConfirm > 0 && needsFulfillment > 0 && ' • '}
                  {needsFulfillment > 0 && `${needsFulfillment} to fulfill`}
                </>
              ) : 'Manage incoming orders from customers'}
            </DashboardTile>
          )}

          {/* Your Listings — `danger` when something is unsellable (out of stock),
              `warning` when it is merely degrading (low stock). The distinction is
              the point: red must stay rare enough to mean something. */}
          <DashboardTile
            href={`/${vertical}/vendor/listings`}
            icon="📋"
            title="Your Listings"
            state={stockWarningLevel === 'red' ? 'danger' : stockWarningLevel === 'orange' ? 'warning' : 'neutral'}
            badge={draftCount > 0 ? <TileBadge tone="primary">{draftCount} draft{draftCount > 1 ? 's' : ''}</TileBadge> : undefined}
          >
            {outOfStockCount > 0
              ? <span style={{ color: statusColors.danger, fontWeight: typography.weights.medium }}>{outOfStockCount} out of stock{lowStockCount > 0 ? ` · ${lowStockCount} low` : ''}</span>
              : lowStockCount > 0
                ? <span style={{ color: statusColors.warning, fontWeight: typography.weights.medium }}>{lowStockCount} low on stock</span>
                : `Create and manage your ${term(vertical, 'listings').toLowerCase()}`}
          </DashboardTile>

          {/* Market Boxes (hidden pre-approval) */}
          {vendorProfile.status === 'approved' && (() => {
            const mbLimit = getTierLimits(vendorProfile.tier || 'free', vertical).marketBoxes
            const isLocked = mbLimit === 0
            return (
              <DashboardTile
                href={`/${vertical}/vendor/market-boxes`}
                icon="📦"
                title={term(vertical, 'market_boxes')}
                state={isLocked ? 'locked' : 'neutral'}
              >
                {isLocked ? (
                  <span style={{ color: statusColors.warning, fontWeight: typography.weights.medium }}>
                    Upgrade to Basic or higher to offer {term(vertical, 'market_boxes')}
                  </span>
                ) : (
                  `Offer four or eight week pre-paid ${term(vertical, 'market_boxes').toLowerCase()}`
                )}
              </DashboardTile>
            )
          })()}

          {/* Booth Bookings — FM-only (booth rentals only exist on FM markets
              per Phase C scope). Vendor-facing read of weekly_booth_rentals. */}
          {vertical === 'farmers_market' && (
            <DashboardTile
              href={`/${vertical}/vendor/bookings`}
              icon="🪑"
              title="My Booth Bookings"
            >
              Weekly booth rentals at managed markets
            </DashboardTile>
          )}

          {/* Park Bookings — FT-only sibling of the booth card (tester finding
              P9, 2026-07-15: trucks had NO surface listing their paid park
              spots with dates). Vendor-facing read of park_spot_bookings. */}
          {vertical === 'food_trucks' && (
            <DashboardTile
              href={`/${vertical}/vendor/park-bookings`}
              icon="🅿️"
              title="My Park Bookings"
            >
              Your booked park spots — dates, spot, and status
            </DashboardTile>
          )}
        </div>


        {/* ============================================= */}
        {/* ROW 3: Business - Business Profile, Payments & Earnings, Analytics */}
        {/* ============================================= */}
        <div className="row-3-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Business Profile — `danger` at the cancellation threshold, `warning`
              while the rate is merely climbing. A CARD: you edit and preview from
              inside it rather than the whole surface being one door. */}
          <DashboardCard
            title="Business Profile"
            state={cancellationWarningLevel === 'red' ? 'danger' : cancellationWarningLevel === 'orange' ? 'warning' : 'neutral'}
            headerAccessory={
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
            }
          >
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
                const tier = vendorProfile.tier || 'free'
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

            {/* Profile completeness nudge */}
            {(() => {
              const checks = [
                { done: !!(vendorProfile as Record<string, unknown>).profile_image_url, label: 'Profile photo' },
                { done: !!(vendorProfile as Record<string, unknown>).cover_image_url, label: 'Cover photo' },
                { done: !!(profileData.description as string)?.trim(), label: 'Description' },
              ]
              const completed = checks.filter(c => c.done).length
              if (completed >= checks.length) return null
              const missing = checks.filter(c => !c.done)
              return (
                <div style={{
                  margin: `${spacing.xs} 0 0 0`,
                  padding: spacing.xs,
                  backgroundColor: statusColors.warningLight,
                  border: `1px solid ${statusColors.warningBorder}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  color: statusColors.warningDark,
                }}>
                  <span style={{ fontWeight: typography.weights.semibold }}>
                    Profile {Math.round((completed / checks.length) * 100)}% complete
                  </span>
                  <span style={{ color: statusColors.warningDark }}>
                    {' — Add '}
                    {missing.map((m, i) => (
                      <span key={m.label}>
                        {i > 0 && (i === missing.length - 1 ? ' and ' : ', ')}
                        {m.label.toLowerCase()}
                      </span>
                    ))}
                    {' to stand out to buyers.'}
                  </span>
                </div>
              )
            })()}

            {/* Cancellation rate warning */}
            {cancellationWarningLevel && (
              <p style={{
                margin: `${spacing.xs} 0 0 0`,
                fontSize: typography.sizes.xs,
                color: cancellationWarningLevel === 'red' ? statusColors.dangerDark : statusColors.attentionDark,
                fontWeight: typography.weights.medium,
                lineHeight: 1.4
              }}>
                Cancellation rate: {vpCancellationRate}% ({vpCancelled} of {vpConfirmed} confirmed orders).
                {cancellationWarningLevel === 'red'
                  ? ' Your account may be subject to review. Please contact support if you need assistance.'
                  : ' Confirming an order is a commitment to fulfill it.'}
              </p>
            )}
          </DashboardCard>

          {/* Payments & Earnings (combined card) */}
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
            earnings={{
              monthlySalesCents,
              pendingPayoutsCents,
              completedPayoutsCents
            }}
          />

          {/* Analytics & Insights (hidden pre-approval) */}
          {vendorProfile.status === 'approved' && (() => {
            const insightsLevel = vertical === 'food_trucks'
              ? getFtTierExtras(vendorProfile.tier || 'free').locationInsights
              : 'basic' // FM vendors get basic by default
            const isInsightsLocked = false // All tiers get at least 'basic' insights
            return (
              /* A CARD, not a tile — it holds TWO destinations, so the whole
                 surface cannot be one door. Small enough to stay a grid peer
                 (inGrid), unlike Your Events which needed the full width. */
              <DashboardCard title="📊 Analytics & Insights" inGrid>
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                  <Link
                    href={`/${vertical}/vendor/analytics`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['2xs'],
                      textDecoration: 'none',
                      color: colors.textSecondary,
                      fontSize: typography.sizes.sm,
                      padding: `${spacing['2xs']} 0`,
                    }}
                  >
                    <span>📈</span>
                    <span>Sales trends &amp; top products</span>
                  </Link>
                  <Link
                    href={`/${vertical}/vendor/insights`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['2xs'],
                      textDecoration: 'none',
                      color: isInsightsLocked ? statusColors.warning : colors.textSecondary,
                      fontSize: typography.sizes.sm,
                      padding: `${spacing['2xs']} 0`,
                      borderTop: `1px solid ${colors.borderMuted}`,
                    }}
                  >
                    <span>📍</span>
                    <span>{isInsightsLocked ? 'Location Insights (upgrade to unlock)' : 'Location performance'}</span>
                  </Link>
                </div>
              </DashboardCard>
            )
          })()}
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
            <DashboardTile
              href={`/${vertical}/vendor/reviews`}
              icon="⭐"
              title="Reviews"
            >
              See feedback from your customers
            </DashboardTile>
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

        {/* ============================================= */}
        {/* Legal Agreements Section */}
        {/* ============================================= */}
        <DashboardCard title="Legal Agreements">
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            <Link
              href={`/${vertical}/terms`}
              target="_blank"
              style={{
                color: colors.primary,
                fontSize: typography.sizes.sm,
                textDecoration: 'none',
              }}
            >
              Platform User Agreement & Privacy Policy
            </Link>
            <Link
              href={`/${vertical}/terms/vendor`}
              target="_blank"
              style={{
                color: colors.primary,
                fontSize: typography.sizes.sm,
                textDecoration: 'none',
              }}
            >
              Vendor Service Agreement
            </Link>
            {vendorProfile.status === 'approved' && (
              <Link
                href={`/${vertical}/terms/partner`}
                target="_blank"
                style={{
                  color: colors.primary,
                  fontSize: typography.sizes.sm,
                  textDecoration: 'none',
                }}
              >
                Vendor Partner Agreement
              </Link>
            )}
          </div>
        </DashboardCard>
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
          .vendor-dashboard .row-2-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .vendor-dashboard .row-3-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>

      {/* Vendor Tutorials: Phase 1 (Getting Approved) or Phase 2 (Your Dashboard) */}
      <TutorialWrapper vertical={vertical} mode="vendor" phase={tutorialPhase} showTutorial={showTutorial1 || showTutorial2} />
    </div>
  )
}
