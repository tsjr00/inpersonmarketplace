import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import SearchFilter from './SearchFilter'
import { formatDisplayPrice } from '@/lib/constants'

interface BrowsePageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ category?: string; search?: string }>
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
  vendor_profiles: {
    id: string
    profile_data: Record<string, unknown>
    status: string
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
  const { category, search } = await searchParams
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

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
      vendor_profiles!inner (
        id,
        profile_data,
        status
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

  // Get categories from vertical config (not from listings)
  const { data: verticalData } = await supabase
    .from('verticals')
    .select('config')
    .eq('vertical_id', vertical)
    .single()

  // Extract categories from listing_fields config
  const listingFields = (verticalData?.config as Record<string, unknown>)?.listing_fields as Array<Record<string, unknown>> || []
  const categoryField = listingFields.find(
    (f) => f.key === 'product_categories' || f.key === 'category'
  )
  const configCategories = (categoryField?.options as string[]) || []

  // Use config categories, not listing-derived categories
  const uniqueCategories = configCategories

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
            Browse Products
          </h1>
          <p style={{ color: branding.colors.secondary, fontSize: 16, margin: 0 }}>
            Discover products from verified vendors
          </p>
        </div>

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
        marginBottom: 8
      }}>
        {formatDisplayPrice(listing.price_cents)}
      </div>

      {/* Vendor Name */}
      <div style={{
        fontSize: 12,
        color: '#888',
        borderTop: '1px solid #f3f4f6',
        paddingTop: 8
      }}>
        by {vendorName}
      </div>
    </Link>
  )
}
