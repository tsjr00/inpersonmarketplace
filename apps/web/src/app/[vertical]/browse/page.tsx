import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import SearchFilter from './SearchFilter'
import BrowseToggle from './BrowseToggle'
import { formatDisplayPrice, CATEGORIES } from '@/lib/constants'
import TierBadge from '@/components/shared/TierBadge'

interface BrowsePageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ category?: string; search?: string; view?: string }>
}

interface Listing {
  id: string
  title: string
  description: string | null
  price_cents: number
  quantity: number
  category: string | null
  image_urls: string[] | null
  created_at: string
  vendor_profile_id: string
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
  listing_markets?: {
    market_id: string
    markets: {
      id: string
      name: string
      market_type: string
    } | null
  }[]
}

interface MarketBoxOffering {
  id: string
  name: string
  description: string | null
  price_cents: number
  pickup_day_of_week: number
  pickup_start_time: string
  pickup_end_time: string
  active: boolean
  active_subscribers: number
  max_subscribers: number | null
  is_at_capacity: boolean
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
  const { category, search, view } = await searchParams
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

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
        price_cents,
        pickup_day_of_week,
        pickup_start_time,
        pickup_end_time,
        active,
        max_subscribers,
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

    // Calculate active subscribers and capacity for each offering
    const offeringsWithSubs: MarketBoxOffering[] = []
    for (const offering of marketBoxes || []) {
      const { count } = await supabase
        .from('market_box_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('offering_id', offering.id)
        .eq('status', 'active')

      const activeSubscribers = count || 0
      const maxSubs = offering.max_subscribers

      // Handle the vendor_profiles and market - Supabase may return as single object or array
      const vendorProfile = Array.isArray(offering.vendor_profiles)
        ? offering.vendor_profiles[0]
        : offering.vendor_profiles
      const market = Array.isArray(offering.market)
        ? offering.market[0]
        : offering.market

      offeringsWithSubs.push({
        ...offering,
        active_subscribers: activeSubscribers,
        is_at_capacity: maxSubs !== null && activeSubscribers >= maxSubs,
        vendor_profiles: vendorProfile as MarketBoxOffering['vendor_profiles'],
        market: market as MarketBoxOffering['market'],
      })
    }

    return (
      <div
        style={{
          backgroundColor: branding.colors.background,
          color: branding.colors.text,
          minHeight: '100vh'
        }}
        className="browse-page"
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{
              color: branding.colors.primary,
              marginBottom: 8,
              marginTop: 0,
              fontSize: 28,
              fontWeight: 'bold'
            }}>
              Browse
            </h1>
            <p style={{ color: branding.colors.secondary, fontSize: 16, margin: 0 }}>
              Discover products and subscriptions from verified vendors
            </p>
          </div>

          {/* View Toggle */}
          <BrowseToggle vertical={vertical} currentView={currentView} branding={branding} />

          {/* Market Boxes Info */}
          <div style={{
            padding: 16,
            marginBottom: 24,
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#1e40af', fontSize: 14 }}>What are Market Boxes?</h4>
            <p style={{ margin: 0, fontSize: 13, color: '#1e40af' }}>
              Market Boxes are 4-week subscription bundles. Pay once, pick up weekly at the same location.
              Premium membership required to purchase.
            </p>
          </div>

          {/* Results Count */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: branding.colors.secondary, margin: 0 }}>
              {offeringsWithSubs.length} market box{offeringsWithSubs.length !== 1 ? 'es' : ''} available
            </p>
          </div>

          {/* Market Boxes Grid */}
          {offeringsWithSubs.length > 0 ? (
            <div className="listings-grid" style={{ display: 'grid', gap: 16 }}>
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
              padding: 60,
              backgroundColor: 'white',
              color: '#333',
              borderRadius: 8,
              textAlign: 'center'
            }}>
              <h3 style={{ marginBottom: 15, marginTop: 0, color: '#666' }}>No Market Boxes Available</h3>
              <p style={{ color: '#999', marginBottom: 20 }}>
                Check back later for 4-week subscription offerings from local vendors.
              </p>
            </div>
          )}
        </div>

        {/* Responsive Grid Styles */}
        <style>{`
          .browse-page .listings-grid {
            grid-template-columns: 1fr;
          }
          @media (min-width: 640px) {
            .browse-page .listings-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          @media (min-width: 1024px) {
            .browse-page .listings-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
          @media (min-width: 1280px) {
            .browse-page .listings-grid {
              grid-template-columns: repeat(4, 1fr);
            }
          }
        `}</style>
      </div>
    )
  }

  // Build query for published listings from approved vendors
  // Sort by category first, then by created_at for within-category ordering
  let query = supabase
    .from('listings')
    .select(`
      id,
      title,
      description,
      price_cents,
      quantity,
      category,
      image_urls,
      created_at,
      vendor_profile_id,
      listing_data,
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
          market_type
        )
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
  const listings = rawListings as unknown as Listing[] | null

  // Get categories - use CATEGORIES constant for farmers_market, or fall back to config
  let uniqueCategories: readonly string[] | string[] = []
  if (vertical === 'farmers_market') {
    // Use centralized CATEGORIES constant
    uniqueCategories = CATEGORIES
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
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        minHeight: '100vh'
      }}
      className="browse-page"
    >
      {/* Page Content */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px'
      }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            color: branding.colors.primary,
            marginBottom: 8,
            marginTop: 0,
            fontSize: 28,
            fontWeight: 'bold'
          }}>
            Browse
          </h1>
          <p style={{ color: branding.colors.secondary, fontSize: 16, margin: 0 }}>
            Discover products and subscriptions from verified vendors
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
          branding={branding}
        />

        {/* Results Count */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: branding.colors.secondary, margin: 0 }}>
            {listings?.length || 0} listing{listings?.length !== 1 ? 's' : ''} found
            {category && ` in ${category}`}
            {search && ` matching "${search}"`}
          </p>
        </div>

        {/* Listings Display */}
        {listings && listings.length > 0 ? (
          <>
            {/* When NOT searching/filtering: Show grouped by category with headers */}
            {!isFiltered && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                {sortedCategories.map(cat => (
                  <div key={cat}>
                    {/* Category Header */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      marginBottom: 20
                    }}>
                      <div style={{
                        height: 1,
                        backgroundColor: branding.colors.secondary,
                        flex: 1,
                        opacity: 0.3
                      }} />
                      <h2 style={{
                        margin: 0,
                        padding: '8px 20px',
                        backgroundColor: branding.colors.secondary + '15',
                        color: branding.colors.primary,
                        borderRadius: 20,
                        fontSize: 16,
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                      }}>
                        {cat}
                      </h2>
                      <div style={{
                        height: 1,
                        backgroundColor: branding.colors.secondary,
                        flex: 1,
                        opacity: 0.3
                      }} />
                    </div>

                    {/* Listings Grid for this category */}
                    <div className="listings-grid" style={{
                      display: 'grid',
                      gap: 16
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
                gap: 16
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
            padding: 60,
            backgroundColor: 'white',
            color: '#333',
            borderRadius: 8,
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: 15, marginTop: 0, color: '#666' }}>No Listings Found</h3>
            <p style={{ color: '#999', marginBottom: 20 }}>
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
                  padding: '12px 24px',
                  backgroundColor: branding.colors.primary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  minHeight: 44
                }}
              >
                Clear Filters
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Responsive Grid Styles */}
      <style>{`
        .browse-page .listings-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .browse-page .listings-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .browse-page .listings-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1280px) {
          .browse-page .listings-grid {
            grid-template-columns: repeat(4, 1fr);
          }
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

  return (
    <Link
      href={`/${vertical}/listing/${listing.id}`}
      style={{
        display: 'block',
        padding: 16,
        backgroundColor: 'white',
        color: '#333',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        textDecoration: 'none',
        height: '100%'
      }}
    >
      {/* Image Placeholder with Category Badge */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        {/* Category Badge */}
        {listing.category && (
          <span style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '4px 10px',
            backgroundColor: '#d1fae5',
            color: '#065f46',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
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
              top: 8,
              right: 8,
              padding: '4px 10px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
            title={listing.listing_data?.ingredients || 'Contains allergens'}
          >
            <span>⚠️</span> Allergens
          </span>
        )}

        {/* Image placeholder */}
        <div style={{
          height: 140,
          backgroundColor: '#f3f4f6',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af'
        }}>
          <span style={{ fontSize: 36 }}>📦</span>
        </div>
      </div>

      {/* Title */}
      <h3 style={{
        marginBottom: 6,
        marginTop: 0,
        color: branding.colors.primary,
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.3
      }}>
        {listing.title}
      </h3>

      {/* Description */}
      <p style={{
        fontSize: 13,
        color: '#666',
        marginBottom: 12,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        lineHeight: 1.4,
        minHeight: 36
      }}>
        {listingDesc}
      </p>

      {/* Price (includes platform fee) */}
      <div style={{
        fontSize: 20,
        fontWeight: 'bold',
        color: branding.colors.primary,
        marginBottom: 6
      }}>
        {formatDisplayPrice(listing.price_cents)}
      </div>

      {/* Market/Location - above the separator */}
      {listing.listing_markets && listing.listing_markets.length > 0 && (
        <div style={{
          fontSize: 12,
          color: '#6b7280',
          marginBottom: 8
        }}>
          {listing.listing_markets.length === 1
            ? (() => {
                const market = listing.listing_markets[0].markets
                const prefix = market?.market_type === 'private_pickup' ? 'Private Pickup: ' : 'Market: '
                return prefix + (market?.name || 'Location')
              })()
            : `${listing.listing_markets.length} pickup locations`
          }
        </div>
      )}

      {/* Vendor Name & Premium Badge */}
      <div style={{
        fontSize: 12,
        color: '#888',
        borderTop: '1px solid #f3f4f6',
        paddingTop: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6
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
        padding: 16,
        backgroundColor: 'white',
        color: '#333',
        border: offering.is_at_capacity ? '1px solid #fecaca' : '1px solid #e5e7eb',
        borderRadius: 8,
        textDecoration: 'none',
        height: '100%',
        opacity: offering.is_at_capacity ? 0.7 : 1
      }}
    >
      {/* Image Placeholder with Badges */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        {/* Subscription Badge */}
        <span style={{
          position: 'absolute',
          top: 8,
          left: 8,
          padding: '4px 10px',
          backgroundColor: '#dbeafe',
          color: '#1e40af',
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          zIndex: 1
        }}>
          4-Week Box
        </span>

        {/* At Capacity Badge */}
        {offering.is_at_capacity && (
          <span style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '4px 10px',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
            zIndex: 1
          }}>
            Full
          </span>
        )}

        {/* Image placeholder */}
        <div style={{
          height: 140,
          backgroundColor: '#eff6ff',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#3b82f6'
        }}>
          <span style={{ fontSize: 36 }}>📦</span>
        </div>
      </div>

      {/* Title */}
      <h3 style={{
        marginBottom: 6,
        marginTop: 0,
        color: branding.colors.primary,
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.3
      }}>
        {offering.name}
      </h3>

      {/* Description */}
      <p style={{
        fontSize: 13,
        color: '#666',
        marginBottom: 12,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        lineHeight: 1.4,
        minHeight: 36
      }}>
        {boxDesc}
      </p>

      {/* Price */}
      <div style={{
        fontSize: 20,
        fontWeight: 'bold',
        color: branding.colors.primary,
        marginBottom: 4
      }}>
        {formatPrice(offering.price_cents)}
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
        for 4 weeks ({formatPrice(offering.price_cents / 4)}/week)
      </div>

      {/* Pickup Info */}
      <div style={{
        fontSize: 12,
        color: '#6b7280',
        marginBottom: 8
      }}>
        {DAYS[offering.pickup_day_of_week]}s {formatTime(offering.pickup_start_time)}-{formatTime(offering.pickup_end_time)}
        {offering.market && (
          <> at {offering.market.name}</>
        )}
      </div>

      {/* Vendor Name & Tier Badge */}
      <div style={{
        fontSize: 12,
        color: '#888',
        borderTop: '1px solid #f3f4f6',
        paddingTop: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>by {vendorName}</span>
        {offering.vendor_profiles.tier && offering.vendor_profiles.tier !== 'standard' && (
          <TierBadge tier={offering.vendor_profiles.tier} size="sm" />
        )}
      </div>
    </Link>
  )
}
