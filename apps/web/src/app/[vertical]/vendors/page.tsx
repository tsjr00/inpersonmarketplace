import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import VendorFilters from './VendorFilters'
import VendorAvatar from '@/components/shared/VendorAvatar'
import TierBadge from '@/components/shared/TierBadge'
import { VendorTierType } from '@/lib/constants'
import { colors, spacing, typography, containers, radius } from '@/lib/design-tokens'

// Cache page for 10 minutes - vendor data changes infrequently
export const revalidate = 600

interface VendorsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{
    market?: string
    category?: string
    search?: string
    sort?: string
  }>
}

export default async function VendorsPage({ params, searchParams }: VendorsPageProps) {
  const { vertical } = await params
  const { market, category, search, sort = 'rating' } = await searchParams
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get all approved vendors for this vertical with ratings
  let query = supabase
    .from('vendor_profiles')
    .select(`
      id,
      profile_data,
      description,
      profile_image_url,
      tier,
      created_at,
      average_rating,
      rating_count
    `)
    .eq('vertical_id', vertical)
    .eq('status', 'approved')

  const { data: vendors, error } = await query

  if (error) {
    console.error('Error fetching vendors:', error)
  }

  // Get vendor listings count and categories
  const vendorIds = (vendors || []).map(v => v.id)

  let listingsData: { vendor_profile_id: string; category: string | null }[] = []
  let marketVendorsData: { vendor_profile_id: string; market_id: string; market: { id: string; name: string } | null }[] = []

  if (vendorIds.length > 0) {
    // Get listings for these vendors (to get categories and counts)
    const { data: listings } = await supabase
      .from('listings')
      .select('vendor_profile_id, category')
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'published')
      .is('deleted_at', null)

    listingsData = listings || []

    // Get market associations for these vendors
    const { data: marketVendors } = await supabase
      .from('market_vendors')
      .select(`
        vendor_profile_id,
        market_id,
        markets (
          id,
          name
        )
      `)
      .in('vendor_profile_id', vendorIds)
      .eq('status', 'approved')

    // Transform the data to match expected shape
    // Note: markets is a single related record but Supabase types it as potentially an array
    marketVendorsData = (marketVendors || []).map(mv => {
      const marketData = mv.markets as unknown as { id: string; name: string } | null
      return {
        vendor_profile_id: mv.vendor_profile_id as string,
        market_id: mv.market_id as string,
        market: marketData
      }
    })
  }

  // Build vendor data with enriched info
  const enrichedVendors = (vendors || []).map(vendor => {
    const profileData = vendor.profile_data as Record<string, unknown>
    const vendorName = (profileData?.business_name as string) ||
                       (profileData?.farm_name as string) ||
                       'Vendor'

    // Get listing count and categories for this vendor
    const vendorListings = listingsData.filter(l => l.vendor_profile_id === vendor.id)
    const listingCount = vendorListings.length
    const categories = [...new Set(vendorListings.map(l => l.category).filter(Boolean))] as string[]

    // Get markets for this vendor
    const vendorMarkets = marketVendorsData
      .filter(mv => mv.vendor_profile_id === vendor.id && mv.market)
      .map(mv => mv.market!)

    return {
      id: vendor.id,
      name: vendorName,
      description: vendor.description as string | null,
      imageUrl: vendor.profile_image_url as string | null,
      tier: (vendor.tier || 'standard') as VendorTierType,
      createdAt: vendor.created_at,
      averageRating: vendor.average_rating as number | null,
      ratingCount: vendor.rating_count as number | null,
      listingCount,
      categories,
      markets: vendorMarkets
    }
  })

  // Apply filters
  let filteredVendors = enrichedVendors

  // Filter by market
  if (market) {
    filteredVendors = filteredVendors.filter(v =>
      v.markets.some(m => m.id === market)
    )
  }

  // Filter by category
  if (category) {
    filteredVendors = filteredVendors.filter(v =>
      v.categories.includes(category)
    )
  }

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase()
    filteredVendors = filteredVendors.filter(v =>
      v.name.toLowerCase().includes(searchLower) ||
      (v.description?.toLowerCase().includes(searchLower))
    )
  }

  // Apply sorting - premium vendors always shown first
  filteredVendors.sort((a, b) => {
    // Premium/featured vendors first (featured > premium > standard)
    const tierOrder: Record<string, number> = { featured: 0, premium: 1, standard: 2 }
    const aTier = tierOrder[a.tier] ?? 2
    const bTier = tierOrder[b.tier] ?? 2
    if (aTier !== bTier) return aTier - bTier

    // Then apply secondary sort
    switch (sort) {
      case 'rating':
        // Vendors with ratings first, then by rating desc
        if (a.averageRating && !b.averageRating) return -1
        if (!a.averageRating && b.averageRating) return 1
        if (a.averageRating && b.averageRating) return b.averageRating - a.averageRating
        return a.name.localeCompare(b.name)
      case 'name':
        return a.name.localeCompare(b.name)
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case 'listings':
        return b.listingCount - a.listingCount
      default:
        return 0
    }
  })

  // Get unique markets for filter dropdown
  const allMarkets = [...new Map(
    marketVendorsData
      .filter(mv => mv.market)
      .map(mv => [mv.market!.id, mv.market!])
  ).values()].sort((a, b) => a.name.localeCompare(b.name))

  // Get unique categories for filter dropdown
  const allCategories = [...new Set(
    listingsData.map(l => l.category).filter(Boolean)
  )].sort() as string[]

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      padding: `${spacing.md} ${spacing.sm}`,
      backgroundColor: colors.surfaceBase,
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.md }}>
        <h1 style={{
          color: branding.colors.primary,
          marginBottom: spacing['2xs'],
          marginTop: 0,
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold
        }}>
          Local Vendors
        </h1>
        <p style={{
          color: colors.textSecondary,
          margin: 0,
          fontSize: typography.sizes.base
        }}>
          Discover and connect with local farmers, artisans, and producers
        </p>
      </div>

      {/* Filters */}
      <VendorFilters
        currentMarket={market}
        currentCategory={category}
        currentSearch={search}
        currentSort={sort}
        markets={allMarkets}
        categories={allCategories}
      />

      {/* Results count */}
      <div style={{
        marginBottom: spacing.md,
        color: colors.textMuted,
        fontSize: typography.sizes.sm
      }}>
        {filteredVendors.length} vendor{filteredVendors.length !== 1 ? 's' : ''} found
      </div>

      {/* Vendor Grid */}
      {filteredVendors.length > 0 ? (
        <div
          className="vendors-grid"
          style={{
            display: 'grid',
            gap: spacing.md
          }}
        >
          {filteredVendors.map(vendor => (
            <Link
              key={vendor.id}
              href={`/${vertical}/vendor/${vendor.id}/profile`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: spacing.md,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.lg,
                textDecoration: 'none',
                transition: 'box-shadow 0.2s, transform 0.2s',
                height: '100%'
              }}
              className="vendor-card"
            >
              {/* Vendor Header */}
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.sm,
                marginBottom: spacing.sm
              }}>
                <VendorAvatar
                  imageUrl={vendor.imageUrl}
                  name={vendor.name}
                  size={64}
                  tier={vendor.tier}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['2xs'],
                    marginBottom: spacing['3xs'],
                    flexWrap: 'wrap'
                  }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: typography.sizes.lg,
                      fontWeight: typography.weights.semibold,
                      color: colors.textPrimary,
                      lineHeight: 1.3
                    }}>
                      {vendor.name}
                    </h3>
                    {vendor.tier !== 'standard' && (
                      <TierBadge tier={vendor.tier} size="sm" />
                    )}
                  </div>

                  {/* Rating */}
                  {vendor.averageRating && vendor.ratingCount && vendor.ratingCount > 0 ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['3xs'],
                      marginBottom: spacing['2xs']
                    }}>
                      <span style={{ color: '#f59e0b', fontSize: typography.sizes.sm }}>★</span>
                      <span style={{
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.semibold,
                        color: colors.textPrimary
                      }}>
                        {vendor.averageRating.toFixed(1)}
                      </span>
                      <span style={{
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted
                      }}>
                        ({vendor.ratingCount} review{vendor.ratingCount !== 1 ? 's' : ''})
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      marginBottom: spacing['2xs']
                    }}>
                      New vendor
                    </div>
                  )}

                  {/* Stats */}
                  <div style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted
                  }}>
                    {vendor.listingCount} listing{vendor.listingCount !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Description */}
              {vendor.description && (
                <p style={{
                  margin: `0 0 ${spacing.sm} 0`,
                  fontSize: typography.sizes.sm,
                  color: colors.textSecondary,
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {vendor.description}
                </p>
              )}

              {/* Categories */}
              {vendor.categories.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: spacing['2xs'],
                  marginBottom: spacing.sm
                }}>
                  {vendor.categories.slice(0, 3).map(cat => (
                    <span
                      key={cat}
                      style={{
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        borderRadius: radius.full,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.medium
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                  {vendor.categories.length > 3 && (
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: colors.surfaceMuted,
                      color: colors.textMuted,
                      borderRadius: radius.full,
                      fontSize: typography.sizes.xs
                    }}>
                      +{vendor.categories.length - 3} more
                    </span>
                  )}
                </div>
              )}

              {/* Markets */}
              {vendor.markets.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing['2xs'],
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {vendor.markets.slice(0, 2).map(m => m.name).join(', ')}
                    {vendor.markets.length > 2 && ` +${vendor.markets.length - 2}`}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div style={{
          padding: spacing['3xl'],
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          border: `1px dashed ${colors.border}`,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: spacing.sm, opacity: 0.5 }}>🧑‍🌾</div>
          <h3 style={{
            margin: `0 0 ${spacing['2xs']} 0`,
            color: colors.textSecondary,
            fontSize: typography.sizes.lg
          }}>
            No vendors found
          </h3>
          <p style={{
            margin: 0,
            color: colors.textMuted,
            fontSize: typography.sizes.base
          }}>
            {search || market || category
              ? 'Try adjusting your filters to see more vendors'
              : 'Check back soon for local vendors in your area'}
          </p>
        </div>
      )}

      {/* Responsive grid and hover styles */}
      <style>{`
        .vendors-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendors-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendors-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1280px) {
          .vendors-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        .vendor-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  )
}
