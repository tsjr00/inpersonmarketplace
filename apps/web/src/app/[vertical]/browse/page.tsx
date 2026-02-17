import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import Image from 'next/image'
import SearchFilter from './SearchFilter'
import BrowseToggle from './BrowseToggle'
import { formatDisplayPrice, formatQuantityDisplay, CATEGORIES, FOOD_TRUCK_CATEGORIES } from '@/lib/constants'
import { term, isBuyerPremiumEnabled } from '@/lib/vertical'
import TierBadge from '@/components/shared/TierBadge'
import CutoffBadge from '@/components/listings/CutoffBadge'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { calculateMarketAvailability, type MarketWithSchedules } from '@/lib/utils/listing-availability'
import SocialProofToast from '@/components/marketing/SocialProofToast'

// Cache page for 5 minutes - listings don't change every second
export const revalidate = 300

interface BrowsePageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ category?: string; search?: string; view?: string; zip?: string }>
}

interface MarketSchedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface ListingMarket {
  market_id: string
  markets: {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
    cutoff_hours: number | null
    timezone: string | null
    active: boolean
    market_schedules: MarketSchedule[]
  } | null
}

interface Listing {
  id: string
  title: string
  description: string | null
  price_cents: number
  quantity: number
  quantity_amount: number | null
  quantity_unit: string | null
  category: string | null
  created_at: string
  vendor_profile_id: string
  premium_window_ends_at: string | null
  listing_data?: {
    contains_allergens?: boolean
    ingredients?: string
  }
  vendor_profiles: {
    id: string
    profile_data: Record<string, unknown>
    status: string
    tier?: 'standard' | 'premium' | 'featured'
  }
  listing_markets?: ListingMarket[]
  listing_images?: {
    id: string
    url: string
    is_primary: boolean
    display_order: number
  }[]
}

// Calculate availability status for a listing based on its markets
function calculateListingAvailability(listing: Listing): {
  status: 'open' | 'closing-soon' | 'closed'
  hoursUntilCutoff: number | null
} {
  const markets = listing.listing_markets || []
  if (markets.length === 0) {
    return { status: 'closed', hoursUntilCutoff: null }
  }

  let hasOpenMarket = false
  let earliestCutoff: Date | null = null
  let earliestCutoffHours: number | null = null

  for (const lm of markets) {
    if (!lm.markets || !lm.markets.active) continue

    const processed = calculateMarketAvailability(lm.markets as MarketWithSchedules)
    if (!processed) continue

    if (processed.is_accepting) {
      hasOpenMarket = true
      if (processed.cutoff_at) {
        const cutoffDate = new Date(processed.cutoff_at)
        if (!earliestCutoff || cutoffDate < earliestCutoff) {
          earliestCutoff = cutoffDate
          earliestCutoffHours = processed.cutoff_hours
        }
      }
    }
  }

  if (!hasOpenMarket) {
    return { status: 'closed', hoursUntilCutoff: null }
  }

  // Check if closing soon (using market's actual cutoff policy, not hardcoded 24)
  if (earliestCutoff && earliestCutoffHours !== null) {
    const hoursLeft = (earliestCutoff.getTime() - Date.now()) / (1000 * 60 * 60)
    // Only show "closing soon" when within the market's cutoff window
    if (hoursLeft <= earliestCutoffHours && hoursLeft > 0) {
      return { status: 'closing-soon', hoursUntilCutoff: Math.round(hoursLeft * 10) / 10 }
    }
  }

  return { status: 'open', hoursUntilCutoff: null }
}

interface MarketBoxOffering {
  id: string
  name: string
  description: string | null
  image_urls: string[] | null
  price_cents: number
  quantity_amount: number | null
  quantity_unit: string | null
  pickup_day_of_week: number
  pickup_start_time: string
  pickup_end_time: string
  active: boolean
  active_subscribers: number
  max_subscribers: number | null
  is_at_capacity: boolean
  spots_remaining: number | null
  premium_window_ends_at: string | null
  market: {
    id: string
    name: string
    market_type: string
    city: string
    state: string
  } | null
  vendor_profiles: {
    id: string
    profile_data: Record<string, unknown>
    tier?: 'standard' | 'premium' | 'featured'
  }
}

// Group listings by category, then by vendor
function groupListingsByCategory(listings: Listing[]): Record<string, Listing[]> {
  const grouped: Record<string, Listing[]> = {}

  listings.forEach(listing => {
    const category = listing.category || 'Other'

    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(listing)
  })

  // Sort listings within each category by vendor name, then by newest
  Object.keys(grouped).forEach(category => {
    grouped[category].sort((a, b) => {
      const vendorA = (a.vendor_profiles?.profile_data?.business_name as string) ||
                      (a.vendor_profiles?.profile_data?.farm_name as string) || 'Unknown'
      const vendorB = (b.vendor_profiles?.profile_data?.business_name as string) ||
                      (b.vendor_profiles?.profile_data?.farm_name as string) || 'Unknown'

      // First sort by vendor name
      const vendorCompare = vendorA.localeCompare(vendorB)
      if (vendorCompare !== 0) return vendorCompare

      // Then by newest first within same vendor
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  })

  return grouped
}

export default async function BrowsePage({ params, searchParams }: BrowsePageProps) {
  const { vertical } = await params
  const { category, search, view, zip } = await searchParams
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Check if user is premium buyer
  const { data: { user } } = await supabase.auth.getUser()
  let isPremiumBuyer = false
  if (user) {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('buyer_tier')
      .eq('user_id', user.id)
      .single()
    isPremiumBuyer = userProfile?.buyer_tier === 'premium'
  }

  // Determine current view
  const currentView = view === 'market-boxes' ? 'market-boxes' : 'listings'

  // If viewing market boxes, fetch those instead
  if (currentView === 'market-boxes') {
    const { data: marketBoxes } = await supabase
      .from('market_box_offerings')
      .select(`
        id,
        name,
        description,
        image_urls,
        price_cents,
        quantity_amount,
        quantity_unit,
        pickup_day_of_week,
        pickup_start_time,
        pickup_end_time,
        active,
        max_subscribers,
        premium_window_ends_at,
        vendor_profiles!inner (
          id,
          profile_data,
          tier
        ),
        market:markets!market_box_offerings_pickup_market_id_fkey (
          id,
          name,
          market_type,
          city,
          state
        )
      `)
      .eq('vertical_id', vertical)
      .eq('active', true)

    // Get all subscription counts in ONE query instead of N queries (N+1 fix)
    const offeringIds = (marketBoxes || []).map(o => o.id)
    const subscriptionCounts = new Map<string, number>()

    if (offeringIds.length > 0) {
      const { data: subCounts } = await supabase
        .from('market_box_subscriptions')
        .select('offering_id')
        .in('offering_id', offeringIds)
        .eq('status', 'active')

      // Count subscriptions per offering
      for (const sub of subCounts || []) {
        const current = subscriptionCounts.get(sub.offering_id) || 0
        subscriptionCounts.set(sub.offering_id, current + 1)
      }
    }

    // Build offerings with subscriber counts
    const allOfferingsWithSubs: MarketBoxOffering[] = (marketBoxes || []).map(offering => {
      const activeSubscribers = subscriptionCounts.get(offering.id) || 0
      const maxSubs = offering.max_subscribers

      // Handle the vendor_profiles and market - Supabase may return as single object or array
      const vendorProfile = Array.isArray(offering.vendor_profiles)
        ? offering.vendor_profiles[0]
        : offering.vendor_profiles
      const market = Array.isArray(offering.market)
        ? offering.market[0]
        : offering.market

      return {
        ...offering,
        active_subscribers: activeSubscribers,
        is_at_capacity: maxSubs !== null && activeSubscribers >= maxSubs,
        spots_remaining: maxSubs !== null ? Math.max(0, maxSubs - activeSubscribers) : null,
        vendor_profiles: vendorProfile as MarketBoxOffering['vendor_profiles'],
        market: market as MarketBoxOffering['market'],
      }
    })

    // Filter out offerings in premium window for standard buyers
    // Skip premium filtering entirely for verticals with premium disabled
    const now = new Date().toISOString()
    let offeringsWithSubs = allOfferingsWithSubs
    let marketBoxPremiumWindowCount = 0
    const premiumEnabled = isBuyerPremiumEnabled(vertical)

    if (premiumEnabled && !isPremiumBuyer) {
      marketBoxPremiumWindowCount = allOfferingsWithSubs.filter(
        offering => offering.premium_window_ends_at && offering.premium_window_ends_at > now
      ).length
      offeringsWithSubs = allOfferingsWithSubs.filter(
        offering => !offering.premium_window_ends_at || offering.premium_window_ends_at <= now
      )
    }

    return (
      <div
        style={{
          backgroundColor: colors.surfaceBase,
          color: colors.textPrimary,
          minHeight: '100vh'
        }}
        className="browse-page"
      >
        <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: `${spacing.md} ${spacing.sm}` }}>
          {/* Header */}
          <div style={{ marginBottom: spacing.md }}>
            <h1 style={{
              color: colors.textPrimary,
              marginBottom: spacing['2xs'],
              marginTop: 0,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold
            }}>
              Browse
            </h1>
            <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base, margin: 0 }}>
              {term(vertical, 'browse_page_subtitle')}
            </p>
          </div>

          {/* View Toggle */}
          <BrowseToggle vertical={vertical} currentView={currentView} branding={branding} />

          {/* Market Boxes Info */}
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.md,
            backgroundColor: colors.primaryLight,
            border: `1px solid ${colors.primary}`,
            borderRadius: radius.md
          }}>
            <h4 style={{ margin: `0 0 ${spacing['2xs']} 0`, color: colors.primaryDark, fontSize: typography.sizes.sm }}>{`What are ${term(vertical, 'market_boxes')}?`}</h4>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.primaryDark }}>
              {term(vertical, 'subscription_description')}
            </p>
          </div>

          {/* Results Count */}
          <div style={{ marginBottom: spacing.sm }}>
            <p style={{ color: colors.textSecondary, margin: 0 }}>
              {offeringsWithSubs.length} {term(vertical, offeringsWithSubs.length !== 1 ? 'market_boxes' : 'market_box').toLowerCase()} available
            </p>
          </div>

          {/* Premium Window Info Box - show for standard buyers when items are in window */}
          {premiumEnabled && !isPremiumBuyer && marketBoxPremiumWindowCount > 0 && (
            <div style={{
              padding: spacing.sm,
              marginBottom: spacing.md,
              backgroundColor: colors.surfaceSubtle,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
              flexWrap: 'wrap'
            }}>
              <p style={{
                margin: 0,
                fontSize: typography.sizes.sm,
                color: colors.textSecondary,
                flex: 1,
                minWidth: 200
              }}>
                {marketBoxPremiumWindowCount} {term(vertical, marketBoxPremiumWindowCount !== 1 ? 'market_boxes' : 'market_box').toLowerCase()} {marketBoxPremiumWindowCount !== 1 ? 'are' : 'is'} in the premium early-bird window.
                More will be visible soon.
              </p>
              <Link
                href={`/${vertical}/buyer/upgrade`}
                style={{
                  fontSize: typography.sizes.sm,
                  color: colors.primary,
                  textDecoration: 'none',
                  fontWeight: typography.weights.medium,
                  whiteSpace: 'nowrap'
                }}
              >
                Upgrade to Premium →
              </Link>
            </div>
          )}

          {/* Market Boxes Grid */}
          {offeringsWithSubs.length > 0 ? (
            <div className="listings-grid" style={{ display: 'grid', gap: spacing.sm }}>
              {offeringsWithSubs.map((offering) => (
                <MarketBoxCard
                  key={offering.id}
                  offering={offering}
                  vertical={vertical}
                  branding={branding}
                />
              ))}
            </div>
          ) : (
            <div style={{
              padding: spacing['3xl'],
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              borderRadius: radius.md,
              textAlign: 'center'
            }}>
              <h3 style={{ marginBottom: spacing.sm, marginTop: 0, color: colors.textSecondary }}>{`No ${term(vertical, 'market_boxes')} Available`}</h3>
              <p style={{ color: colors.textMuted, marginBottom: spacing.sm }}>
                {`Check back later for subscription offerings from local ${term(vertical, 'vendors').toLowerCase()}.`}
              </p>
            </div>
          )}
        </div>

        {/* Responsive Grid - cards fill available space with minimum width */}
        <style>{`
          .browse-page .listings-grid {
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          }
        `}</style>
      </div>
    )
  }

  // Build query for published listings from approved vendors
  // Sort by category first, then by created_at for within-category ordering
  // Include market schedules for server-side availability calculation
  let query = supabase
    .from('listings')
    .select(`
      id,
      title,
      description,
      price_cents,
      quantity,
      quantity_amount,
      quantity_unit,
      category,
      created_at,
      vendor_profile_id,
      listing_data,
      premium_window_ends_at,
      vendor_profiles!inner (
        id,
        profile_data,
        status,
        tier
      ),
      listing_markets (
        market_id,
        markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          cutoff_hours,
          timezone,
          active,
          market_schedules (
            id,
            day_of_week,
            start_time,
            end_time,
            active
          )
        )
      ),
      listing_images (
        id,
        url,
        is_primary,
        display_order
      )
    `)
    .eq('vertical_id', vertical)
    .eq('status', 'published')
    .eq('vendor_profiles.status', 'approved')
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('created_at', { ascending: false })

  // Apply category filter
  if (category) {
    query = query.eq('category', category)
  }

  // Apply search filter
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data: rawListings } = await query

  // Type assertion for listings
  const allListings = rawListings as unknown as Listing[] | null

  // Filter out listings in premium window for standard buyers
  // Skip premium filtering entirely for verticals with premium disabled
  const now = new Date().toISOString()
  let listings: Listing[] | null = allListings
  let premiumWindowCount = 0
  const premiumEnabled = isBuyerPremiumEnabled(vertical)

  if (premiumEnabled && allListings && !isPremiumBuyer) {
    // Count listings in premium window
    premiumWindowCount = allListings.filter(
      listing => listing.premium_window_ends_at && listing.premium_window_ends_at > now
    ).length

    // Filter to only show listings NOT in premium window
    listings = allListings.filter(
      listing => !listing.premium_window_ends_at || listing.premium_window_ends_at <= now
    )
  }

  // Get categories - use CATEGORIES constant for farmers_market, or fall back to config
  let uniqueCategories: readonly string[] | string[] = []
  if (vertical === 'farmers_market') {
    // Use centralized CATEGORIES constant
    uniqueCategories = CATEGORIES
  } else if (vertical === 'food_trucks') {
    uniqueCategories = FOOD_TRUCK_CATEGORIES
  } else {
    // Fall back to database config for other verticals
    const { data: verticalData } = await supabase
      .from('verticals')
      .select('config')
      .eq('vertical_id', vertical)
      .single()

    const listingFields = (verticalData?.config as Record<string, unknown>)?.listing_fields as Array<Record<string, unknown>> || []
    const categoryField = listingFields.find(
      (f) => f.key === 'product_categories' || f.key === 'category'
    )
    uniqueCategories = (categoryField?.options as string[]) || []
  }

  // Group listings by category when no search/filter is applied
  const isFiltered = !!(search || category)
  const groupedListings = !isFiltered && listings ? groupListingsByCategory(listings) : {}
  const sortedCategories = Object.keys(groupedListings).sort()

  return (
    <div
      style={{
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary,
        minHeight: '100vh'
      }}
      className="browse-page"
    >
      {/* Page Content */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Header */}
        <div style={{ marginBottom: spacing.md }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs }}>
            <h1 style={{
              color: colors.textPrimary,
              marginBottom: spacing['2xs'],
              marginTop: 0,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold
            }}>
              Browse
            </h1>
            {zip && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.primaryLight,
                color: colors.primaryDark,
                borderRadius: radius.full,
                fontSize: typography.sizes.sm,
              }}>
                <span>📍</span>
                <span>Near {zip}</span>
                <Link
                  href={`/${vertical}/browse${category ? `?category=${category}` : ''}${search ? `${category ? '&' : '?'}search=${search}` : ''}`}
                  style={{
                    color: colors.primaryDark,
                    fontSize: typography.sizes.xs,
                    marginLeft: spacing['2xs'],
                  }}
                >
                  ✕
                </Link>
              </div>
            )}
          </div>
          <p style={{ color: colors.textSecondary, fontSize: typography.sizes.base, margin: 0 }}>
            {term(vertical, 'browse_page_subtitle')}
          </p>
        </div>

        {/* View Toggle */}
        <BrowseToggle vertical={vertical} currentView={currentView} branding={branding} />

        {/* Search & Filter */}
        <SearchFilter
          vertical={vertical}
          categories={uniqueCategories as string[]}
          currentCategory={category}
          currentSearch={search}
          currentZip={zip}
          branding={branding}
        />

        {/* Results Count */}
        <div style={{ marginBottom: spacing.sm }}>
          <p style={{ color: colors.textSecondary, margin: 0 }}>
            {listings?.length || 0} listing{listings?.length !== 1 ? 's' : ''} found
            {category && ` in ${category}`}
            {search && ` matching "${search}"`}
          </p>
        </div>

        {/* Premium Window Info Box - show for standard buyers when items are in window */}
        {premiumEnabled && !isPremiumBuyer && premiumWindowCount > 0 && (
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.md,
            backgroundColor: colors.surfaceSubtle,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
            flexWrap: 'wrap'
          }}>
            <p style={{
              margin: 0,
              fontSize: typography.sizes.sm,
              color: colors.textSecondary,
              flex: 1,
              minWidth: 200
            }}>
              {premiumWindowCount} listing{premiumWindowCount !== 1 ? 's are' : ' is'} in the premium early-bird window.
              More items will be visible soon.
            </p>
            <Link
              href={`/${vertical}/buyer/upgrade`}
              style={{
                fontSize: typography.sizes.sm,
                color: colors.primary,
                textDecoration: 'none',
                fontWeight: typography.weights.medium,
                whiteSpace: 'nowrap'
              }}
            >
              Upgrade to Premium →
            </Link>
          </div>
        )}

        {/* Listings Display */}
        {listings && listings.length > 0 ? (
          <>
            {/* When NOT searching/filtering: Show grouped by category with headers */}
            {!isFiltered && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
                {sortedCategories.map(cat => (
                  <div key={cat}>
                    {/* Category Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                      marginBottom: spacing.sm
                    }}>
                      <div style={{
                        height: 1,
                        backgroundColor: colors.border,
                        flex: 1
                      }} />
                      <h2 style={{
                        margin: 0,
                        padding: `${spacing['2xs']} ${spacing.sm}`,
                        backgroundColor: colors.surfaceSubtle,
                        color: colors.textPrimary,
                        borderRadius: radius.full,
                        fontSize: typography.sizes.base,
                        fontWeight: typography.weights.semibold,
                        whiteSpace: 'nowrap'
                      }}>
                        {cat}
                      </h2>
                      <div style={{
                        height: 1,
                        backgroundColor: colors.border,
                        flex: 1
                      }} />
                    </div>

                    {/* Listings Grid for this category */}
                    <div className="listings-grid" style={{
                      display: 'grid',
                      gap: spacing.sm
                    }}>
                      {groupedListings[cat].map((listing) => (
                        <ListingCard
                          key={listing.id}
                          listing={listing}
                          vertical={vertical}
                          branding={branding}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* When searching/filtering: Show flat grid */}
            {isFiltered && (
              <div className="listings-grid" style={{
                display: 'grid',
                gap: spacing.sm
              }}>
                {listings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    vertical={vertical}
                    branding={branding}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{
            padding: spacing['3xl'],
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            borderRadius: radius.md,
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: spacing.sm, marginTop: 0, color: colors.textSecondary }}>No Listings Found</h3>
            <p style={{ color: colors.textMuted, marginBottom: spacing.sm }}>
              {search || category
                ? 'Try adjusting your search or filters'
                : `Be the first to list on ${branding.brand_name}!`
              }
            </p>
            {(search || category) && (
              <Link
                href={`/${vertical}/browse`}
                style={{
                  display: 'inline-block',
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: colors.primary,
                  color: colors.textInverse,
                  textDecoration: 'none',
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  minHeight: 44
                }}
              >
                Clear Filters
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Social Proof Toast — shows anonymized recent activity */}
      <SocialProofToast vertical={vertical} />

      {/* Responsive Grid - cards fill available space with minimum width */}
      <style>{`
        .browse-page .listings-grid {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }
      `}</style>
    </div>
  )
}

// Listing Card Component
function ListingCard({
  listing,
  vertical,
  branding
}: {
  listing: Listing
  vertical: string
  branding: { colors: { primary: string; secondary: string } }
}) {
  const vendorData = listing.vendor_profiles?.profile_data
  const vendorName = (vendorData?.business_name as string) ||
                     (vendorData?.farm_name as string) || 'Vendor'
  const listingDesc = listing.description || 'No description'

  // Get primary image or first image
  const primaryImage = listing.listing_images?.find(img => img.is_primary)
    || listing.listing_images?.[0]

  // Calculate availability status server-side
  const availability = calculateListingAvailability(listing)

  return (
    <Link
      href={`/${vertical}/listing/${listing.id}`}
      style={{
        display: 'block',
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        color: colors.textPrimary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        textDecoration: 'none',
        height: '100%'
      }}
    >
      {/* Image Placeholder with Category Badge */}
      <div style={{ position: 'relative', marginBottom: spacing.xs }}>
        {/* Category Badge */}
        {listing.category && (
          <span style={{
            position: 'absolute',
            top: spacing['2xs'],
            left: spacing['2xs'],
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: colors.primaryLight,
            color: colors.primaryDark,
            borderRadius: radius.lg,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            zIndex: 1
          }}>
            {listing.category}
          </span>
        )}

        {/* Allergen Warning Badge */}
        {listing.listing_data?.contains_allergens && (
          <span
            style={{
              position: 'absolute',
              top: spacing['2xs'],
              right: spacing['2xs'],
              padding: `${spacing['3xs']} ${spacing.xs}`,
              backgroundColor: colors.surfaceSubtle,
              color: colors.accent,
              borderRadius: radius.lg,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: spacing['3xs']
            }}
            title={listing.listing_data?.ingredients || 'Contains allergens'}
          >
            <span>⚠️</span> Allergens
          </span>
        )}

        {/* Product Image or Placeholder */}
        {primaryImage?.url ? (
          <div style={{
            position: 'relative',
            width: '100%',
            height: 140,
            borderRadius: radius.sm,
            overflow: 'hidden',
            backgroundColor: colors.surfaceMuted
          }}>
            <Image
              src={primaryImage.url}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
              style={{ objectFit: 'cover' }}
              loading="lazy"
            />
          </div>
        ) : (
          <div style={{
            height: 140,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.textMuted
          }}>
            <span style={{ fontSize: 36 }}>📦</span>
          </div>
        )}
      </div>

      {/* Title */}
      <h3 style={{
        marginBottom: spacing['3xs'],
        marginTop: 0,
        color: colors.textPrimary,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        lineHeight: typography.leading.snug
      }}>
        {listing.title}
      </h3>

      {/* Description */}
      <p style={{
        fontSize: typography.sizes.xs,
        color: colors.textSecondary,
        marginBottom: spacing.xs,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        lineHeight: typography.leading.normal,
        minHeight: 36
      }}>
        {listingDesc}
      </p>

      {/* Price (includes platform fee) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        marginBottom: spacing['3xs']
      }}>
        <span style={{
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.bold,
          color: colors.primary
        }}>
          {formatDisplayPrice(listing.price_cents)}
          {formatQuantityDisplay(listing.quantity_amount, listing.quantity_unit) && (
            <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.normal, color: colors.textMuted }}>
              {' / '}{formatQuantityDisplay(listing.quantity_amount, listing.quantity_unit)}
            </span>
          )}
        </span>
        {/* Cutoff/Closed Status Badge - pre-calculated server-side */}
        <CutoffBadge
          preCalculatedStatus={availability.status}
          hoursUntilCutoff={availability.hoursUntilCutoff}
        />
      </div>

      {/* Market/Location - above the separator */}
      {listing.listing_markets && listing.listing_markets.length > 0 && (
        <div style={{
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          marginBottom: spacing['2xs']
        }}>
          {listing.listing_markets.length === 1
            ? (() => {
                const market = listing.listing_markets[0].markets
                const prefix = market?.market_type === 'private_pickup' ? term(vertical, 'private_pickup') + ': ' : term(vertical, 'traditional_market') + ': '
                return prefix + (market?.name || 'Location')
              })()
            : `${listing.listing_markets.length} pickup locations`
          }
        </div>
      )}

      {/* Vendor Name & Premium Badge */}
      <div style={{
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        borderTop: `1px solid ${colors.borderMuted}`,
        paddingTop: spacing['2xs'],
        display: 'flex',
        alignItems: 'center',
        gap: spacing['3xs']
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>by {vendorName}</span>
        {listing.vendor_profiles.tier && listing.vendor_profiles.tier !== 'standard' && (
          <TierBadge tier={listing.vendor_profiles.tier} size="sm" />
        )}
      </div>
    </Link>
  )
}

// Market Box Card Component
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function MarketBoxCard({
  offering,
  vertical,
  branding
}: {
  offering: MarketBoxOffering
  vertical: string
  branding: { colors: { primary: string; secondary: string } }
}) {
  const vendorData = offering.vendor_profiles?.profile_data
  const vendorName = (vendorData?.business_name as string) ||
                     (vendorData?.farm_name as string) || 'Vendor'
  const boxDesc = offering.description || 'A 4-week subscription box'

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  return (
    <Link
      href={`/${vertical}/market-box/${offering.id}`}
      style={{
        display: 'block',
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        color: colors.textPrimary,
        border: offering.is_at_capacity ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
        borderRadius: radius.md,
        textDecoration: 'none',
        height: '100%',
        opacity: offering.is_at_capacity ? 0.7 : 1
      }}
    >
      {/* Image Placeholder with Badges */}
      <div style={{ position: 'relative', marginBottom: spacing.xs }}>
        {/* Subscription Badge */}
        <span style={{
          position: 'absolute',
          top: spacing['2xs'],
          left: spacing['2xs'],
          padding: `${spacing['3xs']} ${spacing.xs}`,
          backgroundColor: colors.primaryLight,
          color: colors.primaryDark,
          borderRadius: radius.lg,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          zIndex: 1
        }}>
          4-Week Box
        </span>

        {/* Availability Badge */}
        {offering.spots_remaining !== null && (
          <span style={{
            position: 'absolute',
            top: spacing['2xs'],
            right: spacing['2xs'],
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: offering.is_at_capacity ? colors.surfaceSubtle : colors.primaryLight,
            color: offering.is_at_capacity ? colors.accent : colors.primaryDark,
            borderRadius: radius.lg,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
            zIndex: 1
          }}>
            {offering.is_at_capacity ? 'Full' : `${offering.spots_remaining} spot${offering.spots_remaining !== 1 ? 's' : ''} left`}
          </span>
        )}

        {/* Image */}
        {offering.image_urls && offering.image_urls.length > 0 ? (
          <div style={{
            position: 'relative',
            width: '100%',
            height: 140,
            borderRadius: radius.sm,
            overflow: 'hidden',
            backgroundColor: colors.surfaceSubtle
          }}>
            <Image
              src={offering.image_urls[0]}
              alt={offering.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
              style={{ objectFit: 'cover' }}
              loading="lazy"
            />
          </div>
        ) : (
          <div style={{
            height: 140,
            backgroundColor: colors.primaryLight,
            borderRadius: radius.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.primary
          }}>
            <span style={{ fontSize: 36 }}>📦</span>
          </div>
        )}
      </div>

      {/* Title */}
      <h3 style={{
        marginBottom: spacing['3xs'],
        marginTop: 0,
        color: colors.textPrimary,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        lineHeight: typography.leading.snug
      }}>
        {offering.name}
      </h3>

      {/* Description */}
      <p style={{
        fontSize: typography.sizes.xs,
        color: colors.textSecondary,
        marginBottom: spacing.xs,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        lineHeight: typography.leading.normal,
        minHeight: 36
      }}>
        {boxDesc}
      </p>

      {/* Price */}
      <div style={{
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        color: colors.primary,
        marginBottom: spacing['3xs']
      }}>
        {formatDisplayPrice(offering.price_cents)}
        {formatQuantityDisplay(offering.quantity_amount, offering.quantity_unit) && (
          <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.normal, color: colors.textMuted }}>
            {' / '}{formatQuantityDisplay(offering.quantity_amount, offering.quantity_unit)}
          </span>
        )}
      </div>
      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing['2xs'] }}>
        for 4 weeks ({formatDisplayPrice(offering.price_cents / 4)}/week)
      </div>

      {/* Pickup Info */}
      <div style={{
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        marginBottom: spacing['2xs']
      }}>
        {DAYS[offering.pickup_day_of_week]}s {formatTime(offering.pickup_start_time)}-{formatTime(offering.pickup_end_time)}
        {offering.market && (
          <> at {offering.market.name}</>
        )}
      </div>

      {/* Vendor Name & Tier Badge */}
      <div style={{
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        borderTop: `1px solid ${colors.borderMuted}`,
        paddingTop: spacing['2xs'],
        display: 'flex',
        alignItems: 'center',
        gap: spacing['3xs']
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>by {vendorName}</span>
        {offering.vendor_profiles.tier && offering.vendor_profiles.tier !== 'standard' && (
          <TierBadge tier={offering.vendor_profiles.tier} size="sm" />
        )}
      </div>
    </Link>
  )
}
