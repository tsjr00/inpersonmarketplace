import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { getMarketsManagedBy } from '@/lib/markets/manager-queries'
import type { DashboardIconName } from '@/components/dashboard/icons'

export interface NavDestination {
  key: 'shopper' | 'vendor' | 'market-manager' | 'event-manager'
  href: string
  label: string
  icon: DashboardIconName
}

/**
 * Which dashboards can THIS user reach?
 *
 * The model (owner, 2026-08-07): "everyone is a shopper, some people have other
 * roles as well… each person starts at the shopper dashboard… users should only
 * see dashboards that are relevant to their permissions, and they should easily
 * be able to switch between dashboards."
 *
 * ⚠ WHY THIS IS NOT IN THE GLOBAL HEADER.
 * The obvious home for a switcher is `layout/Header.tsx`. It is the wrong one.
 * The Header renders on EVERY page and only receives `userProfile`, so it can
 * derive `isAdmin` from an already-loaded field but knows nothing about managed
 * markets or organised events. Teaching it would mean running these queries on
 * every page load site-wide — three extra round trips to render a marketing
 * page — to serve a switcher that is only useful ON a dashboard.
 *
 * So the nav is a DASHBOARD component, resolved here, called by the dashboard
 * pages. They are already server components, and the shopper dashboard already
 * loads most of these signals. The cost lands exactly where the feature is.
 *
 * ⚠ Shopper is always first and always present — it is home for everyone.
 *
 * ⚠ Market manager points at the PICKER, not at a specific market. A person can
 * manage several, and the owner chose the picker model explicitly: "a picker
 * that only loads the data for one market at a time — I like the picker
 * better." The picker itself skips straight through when there is only one.
 */
export async function getNavDestinations(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'> | null,
  vertical: string,
  opts?: {
    /** Pass when the caller already knows, to avoid re-querying. */
    isVendor?: boolean
  }
): Promise<NavDestination[]> {
  if (!user) return []

  const destinations: NavDestination[] = [
    { key: 'shopper', href: `/${vertical}/dashboard`, label: 'Shopper', icon: 'browse' },
  ]

  const serviceClient = createServiceClient()

  // The three role checks run together — none depends on another. Keeping this
  // a single parallel block matters: performance-baseline.test.ts guards query
  // count and sequential depth on the dashboards that call this.
  const [vendorRes, managedMarkets, organizerRes] = await Promise.all([
    opts?.isVendor === undefined
      ? supabase
          .from('vendor_profiles')
          .select('id')
          .eq('user_id', user.id)
          .eq('vertical_id', vertical)
          .maybeSingle()
      : Promise.resolve({ data: opts.isVendor ? { id: 'known' } : null }),
    getMarketsManagedBy(supabase, user, vertical),
    // ⚠ No event_token filter. There used to be one, and it meant an organiser
    // whose only event was still pending got NO Events destination at all —
    // locking them out of the very event that needed fixing, since a token is
    // only minted at approval. Event dashboards are addressed by id.
    serviceClient
      .from('catering_requests')
      .select('id')
      .eq('organizer_user_id', user.id)
      .eq('vertical_id', vertical)
      .limit(1),
  ])

  if (vendorRes?.data) {
    destinations.push({
      key: 'vendor',
      href: `/${vertical}/vendor/dashboard`,
      label: 'Vendor',
      icon: 'vendorDashboard',
    })
  }

  if (managedMarkets.length > 0) {
    destinations.push({
      key: 'market-manager',
      href: `/${vertical}/market-manager`,
      label: 'Markets',
      icon: 'locations',
    })
  }

  if ((organizerRes?.data || []).length > 0) {
    destinations.push({
      key: 'event-manager',
      href: `/${vertical}/event-manager`,
      label: 'Events',
      icon: 'events',
    })
  }

  return destinations
}
