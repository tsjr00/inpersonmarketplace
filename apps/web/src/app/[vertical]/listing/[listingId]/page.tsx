import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import ListingPurchaseSection from '@/components/listings/ListingPurchaseSection'
import { formatDisplayPrice } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface ListingDetailPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { vertical, listingId } = await params
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get listing with vendor info and images
  const { data: listing, error } = await supabase
    .from('listings')
    .select(`
      *,
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
    .single()

  if (error || !listing) {
    notFound()
  }

  const vendorProfile = listing.vendor_profiles as Record<string, unknown>
  const vendorData = vendorProfile?.profile_data as Record<string, unknown>
  const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
  const vendorId = vendorProfile?.id as string

  // Get listing images sorted by display order
  const listingImages = (listing.listing_images as { id: string; url: string; is_primary: boolean; display_order: number }[] || [])
    .sort((a, b) => {
      // Primary first, then by display order
      if (a.is_primary && !b.is_primary) return -1
      if (!a.is_primary && b.is_primary) return 1
      return a.display_order - b.display_order
    })
  const primaryImage = listingImages[0]

  // Get other listings from same vendor
  const { data: otherListings } = await supabase
    .from('listings')
    .select('id, title, price_cents')
    .eq('vendor_profile_id', listing.vendor_profile_id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .neq('id', listingId)
    .limit(4)

  // Get markets where this listing is available
  const { data: listingMarkets } = await supabase
    .rpc('get_listing_markets_summary', {
      p_listing_id: listingId
    })

  // Check if user is logged in (for private pickup address visibility)
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <div
      style={{
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary,
        minHeight: '100vh'
      }}
      className="listing-detail-page"
    >
      {/* Back Link */}
      <div style={{
        padding: spacing.sm,
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: colors.primary,
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              padding: `${spacing['2xs']} 0`
            }}
          >
            ← Back to Browse
          </Link>
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
          {/* Left: Image */}
          <div>
            {primaryImage?.url ? (
              <img
                src={primaryImage.url}
                alt={listing.title}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceMuted,
                  maxHeight: 500
                }}
              />
            ) : (
              <div style={{
                aspectRatio: '1',
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.md,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxHeight: 500
              }}>
                <span style={{ fontSize: 80, color: colors.textMuted }}>📦</span>
              </div>
            )}

            {/* Additional images thumbnail strip */}
            {listingImages.length > 1 && (
              <div style={{
                display: 'flex',
                gap: spacing.xs,
                marginTop: spacing.xs,
                overflowX: 'auto'
              }}>
                {listingImages.map((img, idx) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt={`${listing.title} - image ${idx + 1}`}
                    style={{
                      width: 60,
                      height: 60,
                      objectFit: 'cover',
                      borderRadius: radius.sm,
                      border: idx === 0 ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div>
            {/* Listing Info Card */}
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              marginBottom: spacing.sm
            }}>
              {/* Category */}
              {listing.category && (
                <span style={{
                  display: 'inline-block',
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.primaryLight,
                  color: colors.primaryDark,
                  borderRadius: radius.lg,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold,
                  marginBottom: spacing.xs
                }}>
                  {listing.category}
                </span>
              )}

              {/* Title */}
              <h1 style={{
                color: colors.textPrimary,
                margin: `0 0 ${spacing.xs} 0`,
                fontSize: typography.sizes.xl,
                lineHeight: typography.leading.snug
              }}>
                {listing.title}
              </h1>

              {/* Price (includes platform fee) */}
              <div style={{
                fontSize: typography.sizes['2xl'],
                fontWeight: typography.weights.bold,
                color: colors.primary,
                marginBottom: spacing.sm
              }}>
                {formatDisplayPrice(listing.price_cents || 0)}
              </div>

              {/* Availability */}
              <div style={{
                marginBottom: spacing.sm,
                padding: spacing.sm,
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.md
              }}>
                <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing['3xs'] }}>
                  Availability
                </div>
                <div style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  {listing.quantity === null
                    ? 'In Stock'
                    : listing.quantity > 0
                      ? `${listing.quantity} available`
                      : 'Sold Out'
                  }
                </div>
              </div>

              {/* Add to Cart with Cutoff Status */}
              <ListingPurchaseSection
                listingId={listingId}
                maxQuantity={listing.quantity}
                primaryColor={branding.colors.primary}
                vertical={vertical}
              />

              {/* Available At - Markets */}
              {listingMarkets && listingMarkets.length > 0 && (
                <div style={{
                  marginTop: spacing.sm,
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md
                }}>
                  <h3 style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    marginBottom: spacing.xs,
                    marginTop: 0,
                    color: colors.textSecondary
                  }}>
                    Available At
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    {listingMarkets.map((market: {
                      market_id: string
                      market_name: string
                      market_type: string
                      address: string
                      city: string
                      state: string
                      day_of_week: number | null
                      start_time: string | null
                      end_time: string | null
                    }) => {
                      const isPrivate = market.market_type === 'private_pickup'
                      const prefix = isPrivate ? 'Private Pickup: ' : 'Market: '
                      // Only show private pickup address if user is logged in
                      const showAddress = !isPrivate || isLoggedIn

                      return (
                        <div key={market.market_id} style={{ fontSize: typography.sizes.sm }}>
                          <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                            <span style={{ color: colors.textMuted, fontWeight: typography.weights.medium }}>{prefix}</span>
                            {market.market_name}
                          </div>
                          {showAddress ? (
                            <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                              {market.address}, {market.city}, {market.state}
                            </div>
                          ) : (
                            <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs, fontStyle: 'italic' }}>
                              <Link href={`/${vertical}/login`} style={{ color: colors.primary, textDecoration: 'none' }}>
                                Log in
                              </Link>
                              {' '}to see pickup address
                            </div>
                          )}
                          {market.market_type === 'traditional' && market.day_of_week !== null && (
                            <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][market.day_of_week]}
                              {market.start_time && market.end_time && ` ${market.start_time} - ${market.end_time}`}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
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
          </div>
        </div>

        {/* Description & More from Vendor - stack below on mobile */}
        <div className="bottom-grid" style={{
          display: 'grid',
          gap: spacing.md,
          marginTop: spacing.md
        }}>
          {/* Description */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`
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

          {/* Other Listings from Vendor */}
          {otherListings && otherListings.length > 0 && (
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`
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

      {/* Responsive Styles */}
      <style>{`
        .listing-detail-page .main-grid {
          grid-template-columns: 1fr;
        }
        .listing-detail-page .bottom-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .listing-detail-page .main-grid {
            grid-template-columns: 1fr 400px;
          }
          .listing-detail-page .bottom-grid {
            grid-template-columns: 1fr 400px;
          }
        }
      `}</style>
    </div>
  )
}
