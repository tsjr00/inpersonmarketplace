import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import ListingPurchaseSection from '@/components/listings/ListingPurchaseSection'
import ListingImageGallery from '@/components/listings/ListingImageGallery'
import PickupLocationsCard from '@/components/listings/PickupLocationsCard'
import BackLink from '@/components/shared/BackLink'
import ShareButton from '@/components/marketing/ShareButton'
import { listingJsonLd } from '@/lib/marketing/json-ld'
import { formatDisplayPrice } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { groupPickupDatesByMarket, type AvailablePickupDate } from '@/types/pickup'
import type { Metadata } from 'next'

/*
 * PICKUP SCHEDULING CONTEXT
 *
 * This page uses the get_available_pickup_dates() SQL function for server-side
 * availability calculation. This replaces the JavaScript calculation for:
 * - Consistent timezone handling
 * - Per-date cutoffs (not just per-market)
 * - Better performance (single SQL call vs JS processing)
 *
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 */

interface ListingDetailPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

// Generate Open Graph metadata for social sharing
export async function generateMetadata({ params }: ListingDetailPageProps): Promise<Metadata> {
  const { vertical, listingId } = await params
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Fetch listing with vendor info and images
  const { data: listing } = await supabase
    .from('listings')
    .select(`
      title,
      description,
      price_cents,
      vendor_profiles!inner (
        profile_data
      ),
      listing_images (
        url,
        is_primary,
        display_order
      )
    `)
    .eq('id', listingId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .single()

  if (!listing) {
    return {
      title: 'Listing Not Found',
    }
  }

  // vendor_profiles comes back as an object from the inner join
  const vendorProfile = listing.vendor_profiles as unknown as { profile_data: Record<string, unknown> } | null
  const vendorData = vendorProfile?.profile_data
  const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'

  const listingImages = listing.listing_images as { url: string; is_primary: boolean; display_order: number }[] || []
  const primaryImage = listingImages.find(img => img.is_primary) || listingImages[0]

  const price = listing.price_cents ? `$${(listing.price_cents / 100).toFixed(2)}` : ''
  const title = `${listing.title}${price ? ` - ${price}` : ''}`
  const description = listing.description
    ? listing.description.slice(0, 160)
    : `Available from ${vendorName} on ${branding.brand_name}`

  return {
    title: `${listing.title} - ${branding.brand_name}`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: primaryImage?.url ? [{ url: primaryImage.url, alt: listing.title }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: primaryImage?.url ? [primaryImage.url] : [],
    },
  }
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { vertical, listingId } = await params
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Phase 1: Run independent queries in parallel
  const [listingResult, availableDatesResult, userResult] = await Promise.all([
    // Query 1: Get listing with vendor info and images
    supabase
      .from('listings')
      .select(`
        *,
        premium_window_ends_at,
        vendor_profiles!inner (
          id,
          profile_data,
          status,
          created_at
        ),
        listing_images (
          id,
          url,
          is_primary,
          display_order
        )
      `)
      .eq('id', listingId)
      .eq('status', 'published')
      .eq('vendor_profiles.status', 'approved')
      .is('deleted_at', null)
      .single(),
    // Query 2: Get available pickup dates using SQL function (handles timezone & cutoff correctly)
    supabase.rpc('get_available_pickup_dates', { p_listing_id: listingId }),
    // Query 3: Check if user is logged in
    supabase.auth.getUser()
  ])

  const { data: listing, error } = listingResult
  const { data: availablePickupDates, error: datesError } = availableDatesResult
  const { data: { user } } = userResult

  // Group pickup dates by market for display
  // SQL function returns flat list; we group for UI presentation
  const marketPickupDates = groupPickupDatesByMarket(
    (availablePickupDates as AvailablePickupDate[] | null) || []
  )

  if (error || !listing) {
    notFound()
  }

  const vendorProfile = listing.vendor_profiles as Record<string, unknown>
  const vendorData = vendorProfile?.profile_data as Record<string, unknown>
  const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
  const vendorId = vendorProfile?.id as string

  // Get listing images
  const listingImages = (listing.listing_images as { id: string; url: string; is_primary: boolean; display_order: number }[] || [])

  // Phase 2: Run dependent queries in parallel
  const [otherListingsResult, userProfileResult] = await Promise.all([
    // Query 4: Get other listings from same vendor (needs listing.vendor_profile_id)
    supabase
      .from('listings')
      .select('id, title, price_cents')
      .eq('vendor_profile_id', listing.vendor_profile_id)
      .eq('status', 'published')
      .is('deleted_at', null)
      .neq('id', listingId)
      .limit(4),
    // Query 5: Get user profile for premium check (needs user.id)
    user
      ? supabase
          .from('user_profiles')
          .select('buyer_tier')
          .eq('user_id', user.id)
          .single()
      : Promise.resolve({ data: null })
  ])

  const { data: otherListings } = otherListingsResult
  const isLoggedIn = !!user

  // Check if user is premium buyer (for premium window logic)
  const isPremiumBuyer = userProfileResult.data?.buyer_tier === 'premium'

  // Check if listing is in premium window
  const premiumWindowEndsAt = listing.premium_window_ends_at as string | null
  const now = new Date().toISOString()
  const isInPremiumWindow = !!(premiumWindowEndsAt && premiumWindowEndsAt > now)
  const isPremiumRestricted = isInPremiumWindow && !isPremiumBuyer

  const primaryImage = listingImages.find(img => img.is_primary) || listingImages[0]
  const jsonLd = listingJsonLd({
    name: listing.title,
    description: listing.description,
    imageUrl: primaryImage?.url || null,
    url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/${vertical}/listing/${listingId}`,
    priceCents: listing.price_cents || 0,
    quantity: listing.quantity,
    category: listing.category,
    vendorName,
  })

  return (
    <div
      style={{
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary,
        minHeight: '100vh'
      }}
      className="listing-detail-page"
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Back Link - uses browser history to go back to previous page */}
      <div style={{
        padding: spacing.sm,
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: containers.xl, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BackLink
            fallbackHref={`/${vertical}/browse`}
            fallbackLabel="Back to Browse"
            style={{
              color: colors.primary,
              fontSize: typography.sizes.sm
            }}
          />
          <ShareButton
            url={`${process.env.NEXT_PUBLIC_APP_URL || ''}/${vertical}/listing/${listingId}`}
            title={listing.title}
            text={`${listing.title} from ${vendorName}`}
            variant="compact"
          />
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Main Content - single col mobile, two col desktop */}
        <div className="main-grid" style={{
          display: 'grid',
          gap: spacing.md
        }}>
          {/* Left: Image Gallery */}
          <div>
            <ListingImageGallery
              images={listingImages}
              title={listing.title}
            />
          </div>

          {/* Right: Details */}
          <div>
            {/* Description - Moved up for better mobile UX */}
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              marginBottom: spacing.sm
            }}>
              <h2 style={{
                color: colors.textPrimary,
                margin: `0 0 ${spacing.xs} 0`,
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.semibold
              }}>
                Description
              </h2>
              <p style={{
                color: colors.textSecondary,
                lineHeight: typography.leading.relaxed,
                fontSize: typography.sizes.base,
                whiteSpace: 'pre-wrap',
                margin: 0
              }}>
                {listing.description || 'No description provided.'}
              </p>

              {/* Allergen Warning */}
              {listing.listing_data?.contains_allergens && (
                <div style={{
                  marginTop: spacing.sm,
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceSubtle,
                  border: `1px solid ${colors.accent}`,
                  borderRadius: radius.md
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['2xs'],
                    marginBottom: spacing['2xs']
                  }}>
                    <span style={{ fontSize: 18 }}>⚠️</span>
                    <strong style={{ color: colors.accent }}>Allergen Warning</strong>
                  </div>
                  <p style={{
                    margin: 0,
                    color: colors.textSecondary,
                    fontSize: typography.sizes.sm,
                    lineHeight: typography.leading.normal
                  }}>
                    {listing.listing_data?.ingredients || 'This product may contain allergens. Contact the vendor for details.'}
                  </p>
                </div>
              )}
            </div>

            {/* Listing Info Card */}
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              marginBottom: spacing.sm
            }}>
              {/* Title - Category pill removed since user already clicked on item */}
              <h1 style={{
                color: colors.textPrimary,
                margin: `0 0 ${spacing.xs} 0`,
                fontSize: typography.sizes.xl,
                lineHeight: typography.leading.snug
              }}>
                {listing.title}
              </h1>

              {/* Price and Quantity - Combined on mobile */}
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: spacing.sm,
                marginBottom: spacing.xs,
                flexWrap: 'wrap'
              }}>
                <div style={{
                  fontSize: typography.sizes['2xl'],
                  fontWeight: typography.weights.bold,
                  color: colors.primary
                }}>
                  {formatDisplayPrice(listing.price_cents || 0)}
                </div>
                <div style={{
                  fontSize: typography.sizes.base,
                  color: listing.quantity === 0 ? '#dc2626' : colors.textSecondary,
                  fontWeight: typography.weights.medium
                }}>
                  {listing.quantity === null
                    ? 'In Stock'
                    : listing.quantity > 0
                      ? `Qty: ${listing.quantity}`
                      : 'Sold Out'
                  }
                </div>
              </div>

              {/* Pickup Locations Status - shows which locations are open/closed */}
              {marketPickupDates.length > 0 && (
                <div style={{ marginBottom: spacing.xs }}>
                  <PickupLocationsCard
                    marketPickupDates={marketPickupDates}
                    primaryColor={branding.colors.primary}
                  />
                </div>
              )}

              {/* Market Selector + Warning + Quantity + Add to Cart */}
              <ListingPurchaseSection
                listingId={listingId}
                maxQuantity={listing.quantity}
                primaryColor={branding.colors.primary}
                vertical={vertical}
                isPremiumRestricted={isPremiumRestricted}
                availablePickupDates={(availablePickupDates as AvailablePickupDate[] | null) || []}
              />
            </div>

            {/* Vendor Card */}
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`
            }}>
              <h3 style={{
                color: colors.textPrimary,
                margin: `0 0 ${spacing.xs} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Sold by
              </h3>

              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  textDecoration: 'none',
                  color: colors.textPrimary
                }}
              >
                <div style={{
                  fontSize: typography.sizes.lg,
                  fontWeight: typography.weights.semibold,
                  marginBottom: spacing['2xs'],
                  color: colors.primary
                }}>
                  {vendorName}
                </div>
              </Link>

              <div style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
                Member since {new Date(vendorProfile.created_at as string).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric'
                })}
              </div>

              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: colors.primaryDark,
                  color: colors.textInverse,
                  textDecoration: 'none',
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  minHeight: 44
                }}
              >
                View Vendor Profile
              </Link>
            </div>

            {/* More from Vendor - now inside info column for better desktop layout */}
            {otherListings && otherListings.length > 0 && (
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                marginTop: spacing.sm
              }}>
                <h3 style={{
                  color: colors.textPrimary,
                  margin: `0 0 ${spacing.sm} 0`,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold
                }}>
                  More from {vendorName}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                  {otherListings.map((item: Record<string, unknown>) => (
                    <Link
                      key={item.id as string}
                      href={`/${vertical}/listing/${item.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: `${spacing.xs} ${spacing.sm}`,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.sm,
                        textDecoration: 'none',
                        color: colors.textPrimary,
                        minHeight: 44
                      }}
                    >
                      <span style={{ fontSize: typography.sizes.sm }}>{item.title as string}</span>
                      <span style={{
                        fontWeight: typography.weights.semibold,
                        color: colors.primary
                      }}>
                        {formatDisplayPrice((item.price_cents as number) || 0)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .listing-detail-page .main-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .listing-detail-page .main-grid {
            grid-template-columns: 1fr 400px;
          }
        }
      `}</style>
    </div>
  )
}
