import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import PublishButton from './PublishButton'
import DeleteListingButton from './DeleteListingButton'
import ListingCutoffStatus from '@/components/vendor/ListingCutoffStatus'
import { formatPrice, getListingLimit } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface ListingsPageProps {
  params: Promise<{ vertical: string }>
}

interface VendorListing {
  id: string
  title: string
  description: string | null
  price_cents: number
  quantity: number | null
  status: string
  listing_markets?: Array<{
    market_id: string
    markets: {
      id: string
      name: string
      market_type: string
    } | null
  }>
}

export default async function ListingsPage({ params }: ListingsPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

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

  // Get vendor's listings with market associations
  const { data: listings } = await supabase
    .from('listings')
    .select(`
      *,
      listing_markets (
        market_id,
        markets (
          id,
          name,
          market_type
        )
      )
    `)
    .eq('vendor_profile_id', vendorProfile.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Calculate listing count and limit
  const tier = (vendorProfile as Record<string, unknown>).tier as string || 'standard'
  const limit = getListingLimit(tier)
  const listingCount = listings?.length || 0
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
            My Listings
          </h1>
          <p style={{
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
            margin: `${spacing['3xs']} 0 ${spacing.sm} 0`
          }}>
            {branding.brand_name}
          </p>

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
                + New Listing
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
                + New Listing
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
                {/* Status Badge */}
                <div style={{ marginBottom: spacing['2xs'] }}>
                  <span style={{
                    padding: `${spacing['3xs']} ${spacing['2xs']}`,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
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
                  </span>
                </div>

                {/* Cutoff Status (for published listings at traditional markets) */}
                <ListingCutoffStatus
                  listingId={listing.id}
                  status={listing.status}
                />

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
                      backgroundColor: colors.primary,
                      color: colors.textInverse,
                      textDecoration: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      minHeight: 44
                    }}
                  >
                    Edit
                  </Link>
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
