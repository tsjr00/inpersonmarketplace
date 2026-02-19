import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import DeleteListingButton from './DeleteListingButton'
import ListingShareButton from '../ListingShareButton'
import ListingImageGallery from '@/components/listings/ListingImageGallery'
import { formatDisplayPrice } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface ViewListingPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function ViewListingPage({ params }: ViewListingPageProps) {
  const { vertical, listingId } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, profile_data')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  const vendorData = vendorProfile.profile_data as Record<string, unknown>
  const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Your Business'

  // Get listing with images and market associations
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select(`
      *,
      listing_images (
        id,
        url,
        is_primary,
        display_order
      ),
      listing_markets (
        market_id,
        markets (
          id,
          name,
          market_type,
          address,
          city,
          state
        )
      )
    `)
    .eq('id', listingId)
    .eq('vendor_profile_id', vendorProfile.id)
    .is('deleted_at', null)
    .single()

  if (listingError || !listing) {
    notFound()
  }

  // Get listing images
  const listingImages = (listing.listing_images as { id: string; url: string; is_primary: boolean; display_order: number }[] || [])

  // Get listing markets
  const listingMarkets = (listing.listing_markets as {
    market_id: string
    markets: { id: string; name: string; market_type: string; address: string; city: string; state: string } | null
  }[] || [])

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary
      }}
      className="vendor-listing-view"
    >
      {/* Header */}
      <div style={{
        padding: spacing.sm,
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{
          maxWidth: containers.xl,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing.sm
        }}>
          <h1 style={{
            margin: 0,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary
          }}>
            Listing Preview
          </h1>
          <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Link
              href={`/${vertical}/vendor/listings/${listing.id}/edit`}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: 'transparent',
                color: colors.primary,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                border: `2px solid ${colors.primary}`
              }}
            >
              Edit Listing
            </Link>
            <Link
              href={`/${vertical}/vendor/listings`}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: colors.primaryDark,
                color: colors.textInverse,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              Back to Listings
            </Link>
          </div>
        </div>
      </div>

      {/* Preview Notice */}
      <div style={{
        backgroundColor: colors.surfaceSubtle,
        borderBottom: `1px solid ${colors.accent}`,
        padding: `${spacing.xs} ${spacing.sm}`
      }}>
        <div style={{
          maxWidth: containers.xl,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: spacing.sm
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            fontSize: typography.sizes.sm,
            color: colors.accent
          }}>
            <span style={{ fontSize: 16 }}>👁️</span>
            <span>This is how buyers will see your listing when shared on social media</span>
          </div>
          {listing.status === 'published' && (
            <ListingShareButton
              listingId={listing.id}
              listingTitle={listing.title}
              vertical={vertical}
            />
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.sm} ${spacing.sm} 0`
      }}>
        <span style={{
          display: 'inline-block',
          padding: `${spacing['3xs']} ${spacing.xs}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          backgroundColor:
            listing.status === 'published' ? colors.primaryLight :
            listing.status === 'draft' ? colors.surfaceMuted :
            listing.status === 'paused' ? colors.surfaceSubtle :
            listing.status === 'archived' ? '#f8d7da' : colors.surfaceMuted,
          color:
            listing.status === 'published' ? colors.primaryDark :
            listing.status === 'draft' ? colors.textMuted :
            listing.status === 'paused' ? colors.accent :
            listing.status === 'archived' ? '#721c24' : colors.textMuted
        }}>
          {listing.status.toUpperCase()}
          {listing.status !== 'published' && ' - Not visible to buyers'}
        </span>
      </div>

      {/* Preview Content - mimics buyer view */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.sm} ${spacing.sm} ${spacing.xl}`
      }}>
        <div className="preview-grid" style={{
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

              {/* Price - shows what buyers will pay */}
              <div style={{
                fontSize: typography.sizes['2xl'],
                fontWeight: typography.weights.bold,
                color: colors.primary,
                marginBottom: spacing.sm
              }}>
                {formatDisplayPrice(listing.price_cents || 0)}
                <span style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                  color: colors.textMuted,
                  marginLeft: spacing.xs
                }}>
                  (includes platform fee)
                </span>
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

              {/* Available At - Markets */}
              {listingMarkets.length > 0 && (
                <div style={{
                  marginBottom: spacing.sm,
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
                    {listingMarkets.map((lm) => {
                      if (!lm.markets) return null
                      const isPrivate = lm.markets.market_type === 'private_pickup'
                      const prefix = isPrivate ? 'Private Pickup: ' : 'Market: '
                      return (
                        <div key={lm.market_id} style={{ fontSize: typography.sizes.sm }}>
                          <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                            <span style={{ color: colors.textMuted, fontWeight: typography.weights.medium }}>{prefix}</span>
                            {lm.markets.name}
                          </div>
                          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                            {lm.markets.address}, {lm.markets.city}, {lm.markets.state}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Mock Add to Cart Button */}
              <button
                disabled
                style={{
                  width: '100%',
                  padding: `${spacing.sm} ${spacing.md}`,
                  backgroundColor: colors.borderMuted,
                  color: colors.textMuted,
                  border: 'none',
                  borderRadius: radius.md,
                  fontSize: typography.sizes.lg,
                  fontWeight: typography.weights.semibold,
                  cursor: 'not-allowed',
                  minHeight: 56
                }}
              >
                Add to Cart (Preview)
              </button>
            </div>

            {/* Vendor Card Preview */}
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
              <div style={{
                fontSize: typography.sizes.lg,
                fontWeight: typography.weights.semibold,
                marginBottom: spacing['2xs'],
                color: colors.primary
              }}>
                {vendorName}
              </div>
              <button
                disabled
                style={{
                  width: '100%',
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: colors.borderMuted,
                  color: colors.textMuted,
                  border: 'none',
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: 'not-allowed',
                  minHeight: 44
                }}
              >
                View Vendor Profile (Preview)
              </button>
            </div>
          </div>
        </div>

        {/* Description Section */}
        <div style={{
          marginTop: spacing.md,
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
        </div>

        {/* Admin Actions */}
        <div style={{
          marginTop: spacing.lg,
          padding: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          border: `1px dashed ${colors.border}`
        }}>
          <h3 style={{
            color: colors.textSecondary,
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Listing Management
          </h3>
          <div style={{
            display: 'flex',
            gap: spacing.sm,
            flexWrap: 'wrap'
          }}>
            <Link
              href={`/${vertical}/vendor/listings/${listing.id}/edit`}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: 'transparent',
                color: colors.primary,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                border: `2px solid ${colors.primary}`
              }}
            >
              Edit Listing
            </Link>
            {listing.status === 'published' && (
              <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
                <ListingShareButton
                  listingId={listing.id}
                  listingTitle={listing.title}
                  vertical={vertical}
                />
              </div>
            )}
            <DeleteListingButton
              vertical={vertical}
              listingId={listing.id}
              listingTitle={listing.title}
            />
          </div>
          <div style={{
            marginTop: spacing.sm,
            fontSize: typography.sizes.xs,
            color: colors.textMuted
          }}>
            Listing ID: <code style={{ backgroundColor: colors.surfaceElevated, padding: '2px 4px', borderRadius: radius.sm }}>{listing.id}</code>
          </div>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-listing-view .preview-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .vendor-listing-view .preview-grid {
            grid-template-columns: 1fr 400px;
          }
        }
      `}</style>
    </div>
  )
}
