import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import PublishButton from './PublishButton'
import DeleteListingButton from './DeleteListingButton'
import ListingShareButton from './ListingShareButton'
import { formatPrice, LOW_STOCK_THRESHOLD } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getTierLimits } from '@/lib/vendor-limits'
import { calculateMarketAvailability, type MarketWithSchedules } from '@/lib/utils/listing-availability'

interface ListingsPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ market?: string }>
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
    vertical_id: string | null
    cutoff_hours: number | null
    timezone: string | null
    active: boolean
    market_schedules: MarketSchedule[]
  } | null
}

interface VendorListing {
  id: string
  title: string
  description: string | null
  price_cents: number
  quantity: number | null
  status: string
  listing_markets?: ListingMarket[]
}

// Calculate availability status for a listing based on its markets
function calculateListingAvailability(listing: VendorListing): {
  status: 'open' | 'closing-soon' | 'closed'
  hoursUntilCutoff: number | null
} {
  // Only calculate for published listings
  if (listing.status !== 'published') {
    return { status: 'open', hoursUntilCutoff: null }
  }

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

// Low stock threshold (from centralized constants)

// Stock status badge component
function StockStatusBadge({ quantity }: { quantity: number | null }) {
  // Unlimited stock - no badge
  if (quantity === null) return null

  if (quantity === 0) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: `${spacing['3xs']} ${spacing['2xs']}`,
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
        color: '#dc2626',
      }}>
        OUT OF STOCK
      </span>
    )
  }

  if (quantity <= LOW_STOCK_THRESHOLD) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: `${spacing['3xs']} ${spacing['2xs']}`,
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
        color: '#d97706',
      }}>
        LOW STOCK ({quantity})
      </span>
    )
  }

  return null
}

// Server-side cutoff status component
function ListingCutoffStatusBadge({
  listingStatus,
  availabilityStatus,
  hoursUntilCutoff
}: {
  listingStatus: string
  availabilityStatus: 'open' | 'closing-soon' | 'closed'
  hoursUntilCutoff: number | null
}) {
  // Only show for published listings
  if (listingStatus !== 'published') {
    return null
  }

  // Format hours remaining
  const formatTime = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)}m`
    if (hours < 24) return `${Math.floor(hours)}h`
    return `${Math.floor(hours / 24)}d`
  }

  if (availabilityStatus === 'closed') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: `${spacing['3xs']} ${spacing['2xs']}`,
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        color: '#991b1b',
        marginBottom: spacing['2xs']
      }}>
        <span>🚫</span>
        <span>Orders closed for vendor prep</span>
      </div>
    )
  }

  if (availabilityStatus === 'closing-soon' && hoursUntilCutoff) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing['3xs'],
        padding: `${spacing['3xs']} ${spacing['2xs']}`,
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        color: '#92400e',
        marginBottom: spacing['2xs']
      }}>
        <span>⏰</span>
        <span>Orders close in {formatTime(hoursUntilCutoff)}</span>
      </div>
    )
  }

  // Open status
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing['3xs'],
      padding: `${spacing['3xs']} ${spacing['2xs']}`,
      backgroundColor: '#dcfce7',
      border: '1px solid #86efac',
      borderRadius: radius.sm,
      fontSize: typography.sizes.xs,
      color: '#166534',
      marginBottom: spacing['2xs']
    }}>
      <span>✓</span>
      <span>Accepting orders</span>
    </div>
  )
}

export default async function ListingsPage({ params, searchParams }: ListingsPageProps) {
  const { vertical } = await params
  const { market: filterMarketId } = await searchParams
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get vendor profile for this vertical
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status, tier')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get market name if filtering
  let filterMarketName: string | null = null
  if (filterMarketId) {
    const { data: marketData } = await supabase
      .from('markets')
      .select('name')
      .eq('id', filterMarketId)
      .single()
    filterMarketName = marketData?.name || null
  }

  // Get vendor's listings with market associations and schedules for availability calculation
  const { data: allListings } = await supabase
    .from('listings')
    .select(`
      *,
      listing_markets (
        market_id,
        markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          vertical_id,
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
      )
    `)
    .eq('vendor_profile_id', vendorProfile.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Filter by market if specified
  let listings = allListings
  if (filterMarketId && allListings) {
    listings = allListings.filter(listing => {
      const marketAssociations = listing.listing_markets as unknown as Array<{ market_id: string }> | null
      return marketAssociations?.some(lm => lm.market_id === filterMarketId)
    })
  }

  // Calculate listing count and limit (use all listings for limit calculation)
  const tier = (vendorProfile as Record<string, unknown>).tier as string || (vertical === 'food_trucks' ? 'free' : 'standard')
  const limit = getTierLimits(tier, vertical).productListings
  const listingCount = allListings?.length || 0
  const canCreateMore = listingCount < limit

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary
      }}
      className="vendor-listings-page"
    >
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Header - Mobile-first layout */}
        <div style={{
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          {/* Title */}
          <h1 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold
          }}>
            {term(vertical, 'my_listings_nav')}
          </h1>

          {/* Market Filter Indicator */}
          {filterMarketName && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              marginTop: spacing.xs,
              marginBottom: spacing.xs,
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: colors.primaryLight,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm
            }}>
              <span style={{ color: colors.primaryDark }}>
                Showing listings at: <strong>{filterMarketName}</strong>
              </span>
              <Link
                href={`/${vertical}/vendor/listings`}
                style={{
                  color: colors.primary,
                  textDecoration: 'none',
                  fontWeight: typography.weights.semibold
                }}
              >
                × Clear filter
              </Link>
            </div>
          )}

          {/* Buttons - stack on mobile, inline on desktop */}
          <div className="header-buttons" style={{
            display: 'flex',
            gap: spacing.xs,
            marginBottom: spacing.sm
          }}>
            {canCreateMore ? (
              <Link
                href={`/${vertical}/vendor/listings/new`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: colors.primary,
                  color: colors.textInverse,
                  textDecoration: 'none',
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  minHeight: 44,
                  flex: 1
                }}
              >
                + {term(vertical, 'listing')}
              </Link>
            ) : (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: colors.borderMuted,
                  color: colors.textMuted,
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: 'not-allowed',
                  minHeight: 44,
                  flex: 1
                }}
                title={`Limit of ${limit} listings reached`}
              >
                + {term(vertical, 'listing')}
              </span>
            )}
            <Link
              href={`/${vertical}/vendor/dashboard`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: colors.primaryDark,
                color: colors.textInverse,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                minHeight: 44,
                flex: 1
              }}
            >
              Vendor Dashboard
            </Link>
          </div>

          {/* Listing count */}
          <p style={{
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
            margin: 0
          }}>
            {listingCount} / {limit} listings
            {listingCount >= limit && (
              <span style={{ color: '#dc3545', fontWeight: typography.weights.semibold }}> (limit reached)</span>
            )}
            {listingCount === limit - 1 && (
              <span style={{ color: colors.accent, fontWeight: typography.weights.semibold }}> (1 remaining)</span>
            )}
          </p>
        </div>

        {/* Vendor Status Warning */}
        {vendorProfile.status !== 'approved' && (
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.sm,
            backgroundColor: colors.surfaceSubtle,
            border: `1px solid ${colors.accent}`,
            borderRadius: radius.md,
            color: colors.textPrimary
          }}>
            <strong>Note:</strong> Your vendor profile is pending approval.
            Listings you create will become visible once your profile is approved.
          </div>
        )}

        {/* Listings Grid */}
        {listings && listings.length > 0 ? (
          <div className="listings-grid" style={{
            display: 'grid',
            gap: spacing.sm
          }}>
            {(listings as VendorListing[]).map((listing) => (
              <div
                key={listing.id}
                style={{
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceElevated,
                  color: colors.textPrimary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.md,
                  boxShadow: shadows.sm
                }}
              >
                {/* Status Badge + Stock Status */}
                <div style={{ marginBottom: spacing['2xs'], display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    padding: `${spacing['3xs']} ${spacing['2xs']}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.semibold,
                    backgroundColor:
                      listing.status === 'published' ? '#dcfce7' :
                      listing.status === 'draft' ? colors.surfaceMuted :
                      listing.status === 'paused' ? colors.surfaceSubtle :
                      listing.status === 'archived' ? '#f8d7da' : colors.surfaceMuted,
                    color:
                      listing.status === 'published' ? '#166534' :
                      listing.status === 'draft' ? colors.textMuted :
                      listing.status === 'paused' ? colors.accent :
                      listing.status === 'archived' ? '#721c24' : colors.textMuted
                  }}>
                    {listing.status.toUpperCase()}
                  </span>
                  <StockStatusBadge quantity={listing.quantity} />
                </div>

                {/* Cutoff Status - calculated server-side */}
                {(() => {
                  const availability = calculateListingAvailability(listing)
                  return (
                    <ListingCutoffStatusBadge
                      listingStatus={listing.status}
                      availabilityStatus={availability.status}
                      hoursUntilCutoff={availability.hoursUntilCutoff}
                    />
                  )
                })()}

                {/* Title */}
                <h3 style={{
                  marginBottom: spacing['2xs'],
                  marginTop: 0,
                  color: colors.primary,
                  fontSize: typography.sizes.lg
                }}>
                  {listing.title}
                </h3>

                {/* Description */}
                <p style={{
                  fontSize: typography.sizes.sm,
                  color: colors.textSecondary,
                  marginBottom: spacing.sm,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {listing.description || 'No description'}
                </p>

                {/* Price & Quantity (shows base price for vendors) */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: spacing['2xs'],
                  fontSize: typography.sizes.sm
                }}>
                  <span>
                    <strong>Price:</strong> {formatPrice(listing.price_cents || 0)}
                  </span>
                  <span>
                    <strong>Qty:</strong> {listing.quantity ?? 'Unlimited'}
                  </span>
                </div>

                {/* Markets/Pickup Locations */}
                {listing.listing_markets && listing.listing_markets.length > 0 && (
                  <div style={{
                    marginBottom: spacing.sm,
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted
                  }}>
                    <strong>Available at:</strong>{' '}
                    {listing.listing_markets
                      .map(lm => {
                        if (!lm.markets) return null
                        const typeLabel = lm.markets.market_type === 'private_pickup' ? '(Private Pickup)' : '(Market)'
                        return `${lm.markets.name} ${typeLabel}`
                      })
                      .filter(Boolean)
                      .join(', ') || 'None'}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
                  {/* Publish button - only for approved vendors with draft listings */}
                  {vendorProfile.status === 'approved' && (
                    <PublishButton
                      listingId={listing.id}
                      currentStatus={listing.status}
                    />
                  )}
                  <Link
                    href={`/${vertical}/vendor/listings/${listing.id}/edit`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: `${spacing['2xs']} ${spacing.xs}`,
                      backgroundColor: 'transparent',
                      color: '#4A4A4A',
                      border: '1.5px solid #9E9E9E',
                      textDecoration: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      minHeight: 44
                    }}
                  >
                    Edit
                  </Link>
                  {/* Share button - only for published listings */}
                  {listing.status === 'published' && (
                    <ListingShareButton
                      listingId={listing.id}
                      listingTitle={listing.title}
                      vertical={vertical}
                    />
                  )}
                  <Link
                    href={`/${vertical}/vendor/listings/${listing.id}`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: `${spacing['2xs']} ${spacing.xs}`,
                      backgroundColor: colors.accentMuted,
                      color: colors.textInverse,
                      textDecoration: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      minHeight: 44
                    }}
                  >
                    View
                  </Link>
                  <DeleteListingButton
                    listingId={listing.id}
                    listingTitle={listing.title}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: spacing['3xl'],
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            borderRadius: radius.md,
            textAlign: 'center',
            boxShadow: shadows.sm
          }}>
            <h3 style={{ marginBottom: spacing.sm, marginTop: 0, color: colors.textSecondary }}>No Listings Yet</h3>
            <p style={{ marginBottom: spacing.sm, color: colors.textMuted }}>
              Create your first listing to start selling on {branding.brand_name}
            </p>
            <Link
              href={`/${vertical}/vendor/listings/new`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: colors.primary,
                color: colors.textInverse,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                minHeight: 44
              }}
            >
              + Create First Listing
            </Link>
          </div>
        )}
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-listings-page .header-buttons {
          flex-direction: column;
        }
        .vendor-listings-page .listings-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-listings-page .header-buttons {
            flex-direction: row;
          }
          .vendor-listings-page .header-buttons > * {
            flex: initial !important;
          }
          .vendor-listings-page .listings-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendor-listings-page .listings-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
