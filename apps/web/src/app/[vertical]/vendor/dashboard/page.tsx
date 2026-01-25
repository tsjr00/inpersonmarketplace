import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import EditProfileButton from './EditProfileButton'
import ReferralCard from './ReferralCard'
import TutorialWrapper from '@/components/onboarding/TutorialWrapper'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface VendorDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function VendorDashboardPage({ params }: VendorDashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for THIS vertical
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  // If no vendor profile, redirect to vendor signup
  if (vendorError || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get user profile for display name and tutorial status
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('display_name, email, vendor_tutorial_completed_at, vendor_tutorial_skipped_at')
    .eq('user_id', user.id)
    .single()

  // Check if vendor tutorial should be shown
  const hasSeenVendorTutorial = !!(userProfile?.vendor_tutorial_completed_at || userProfile?.vendor_tutorial_skipped_at)
  const showVendorTutorial = !hasSeenVendorTutorial

  // Parse profile_data JSON
  const profileData = vendorProfile.profile_data as Record<string, unknown>

  // Get draft listings count for approved vendors
  let draftCount = 0
  if (vendorProfile.status === 'approved') {
    const { data: draftListings } = await supabase
      .from('listings')
      .select('id')
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'draft')
      .is('deleted_at', null)

    draftCount = draftListings?.length || 0
  }

  // Get active markets/pickup locations from published listings
  interface ActiveMarket {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
    day_of_week: number | null
    start_time: string | null
    end_time: string | null
  }

  let activeMarkets: ActiveMarket[] = []
  if (vendorProfile.status === 'approved') {
    // Get published listings with their markets
    const { data: listingsWithMarkets } = await supabase
      .from('listings')
      .select(`
        id,
        listing_markets (
          market_id,
          markets (
            id,
            name,
            market_type,
            address,
            city,
            state,
            day_of_week,
            start_time,
            end_time
          )
        )
      `)
      .eq('vendor_profile_id', vendorProfile.id)
      .eq('status', 'published')
      .is('deleted_at', null)

    // Extract unique markets
    const marketMap = new Map<string, ActiveMarket>()
    listingsWithMarkets?.forEach(listing => {
      const listingMarkets = listing.listing_markets as unknown as Array<{
        market_id: string
        markets: ActiveMarket | null
      }> | null
      listingMarkets?.forEach(lm => {
        if (lm.markets && !marketMap.has(lm.markets.id)) {
          marketMap.set(lm.markets.id, lm.markets)
        }
      })
    })
    activeMarkets = Array.from(marketMap.values())
  }

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const traditionalMarkets = activeMarkets.filter(m => m.market_type === 'traditional')
  const privatePickups = activeMarkets.filter(m => m.market_type === 'private_pickup')

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary
    }}
    className="vendor-dashboard"
    >
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Header */}
        <div style={{
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          <h1 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold
          }}>
            Vendor Dashboard
          </h1>
        </div>

        {/* Draft Listings Notice - for approved vendors with drafts */}
        {draftCount > 0 && vendorProfile.status === 'approved' && (
          <div style={{
            padding: spacing.sm,
            marginBottom: spacing.md,
            backgroundColor: colors.primaryLight,
            border: `1px solid ${colors.primary}`,
            borderRadius: radius.md,
            color: colors.textPrimary
          }}>
            <strong style={{ fontSize: typography.sizes.base }}>
              You have {draftCount} draft listing{draftCount > 1 ? 's' : ''}!
            </strong>
            <p style={{ margin: `${spacing['2xs']} 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm }}>
              Your account is approved. Visit your listings to publish them and make them visible to buyers.
            </p>
            <Link
              href={`/${vertical}/vendor/listings`}
              style={{
                display: 'inline-block',
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.primary,
                color: colors.textInverse,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
                minHeight: 44
              }}
            >
              View My Listings
            </Link>
          </div>
        )}

        {/* TOP ROW - Market Day Focus: Manage Locations, Prep for Market, Pickup Mode */}
        <div className="info-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Manage Locations - shows list of locations */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <h3 style={{
                color: colors.primary,
                margin: 0,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Manage Locations
              </h3>
              <Link
                href={`/${vertical}/vendor/markets`}
                style={{
                  fontSize: typography.sizes.xs,
                  color: colors.primary,
                  textDecoration: 'none',
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.sm
                }}
              >
                Edit →
              </Link>
            </div>

            {vendorProfile.status !== 'approved' ? (
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                Available after approval
              </p>
            ) : activeMarkets.length === 0 ? (
              <Link
                href={`/${vertical}/vendor/markets`}
                style={{
                  display: 'block',
                  padding: spacing.xs,
                  backgroundColor: colors.primaryLight,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  textDecoration: 'none',
                  color: colors.primaryDark,
                  textAlign: 'center'
                }}
              >
                + Add your first location
              </Link>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activeMarkets.slice(0, 8).map(market => (
                  <Link
                    key={market.id}
                    href={`/${vertical}/vendor/markets`}
                    style={{
                      fontSize: typography.sizes.sm,
                      textDecoration: 'none',
                      color: colors.textPrimary,
                      display: 'block',
                      lineHeight: 1.4
                    }}
                  >
                    {market.market_type === 'private_pickup' ? '🏠 ' : '🛒 '}{market.name}
                  </Link>
                ))}
                {activeMarkets.length > 8 && (
                  <Link
                    href={`/${vertical}/vendor/markets`}
                    style={{ fontSize: typography.sizes.xs, color: colors.primary, textDecoration: 'none' }}
                  >
                    +{activeMarkets.length - 8} more →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Prep for Market / Pickup - segmented by type */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <h3 style={{
              color: colors.primary,
              margin: `0 0 ${spacing['3xs']} 0`,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold
            }}>
              Prep for Market / Pickup
            </h3>

            {vendorProfile.status !== 'approved' ? (
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                Available after approval
              </p>
            ) : activeMarkets.length === 0 ? (
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                No active locations yet
              </p>
            ) : (
              <>
                {/* Summary counts */}
                <p style={{ margin: `0 0 ${spacing['2xs']} 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
                  {traditionalMarkets.length > 0 && `${traditionalMarkets.length} Market${traditionalMarkets.length !== 1 ? 's' : ''}`}
                  {traditionalMarkets.length > 0 && privatePickups.length > 0 && ' · '}
                  {privatePickups.length > 0 && `${privatePickups.length} Private`}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
                  {/* Traditional Markets Section */}
                  {traditionalMarkets.length > 0 && (
                    <div>
                      <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, fontWeight: typography.weights.semibold }}>
                        Markets
                      </p>
                      {traditionalMarkets.slice(0, 4).map(market => (
                        <Link
                          key={market.id}
                          href={`/${vertical}/vendor/markets/${market.id}/prep`}
                          style={{
                            fontSize: typography.sizes.sm,
                            textDecoration: 'none',
                            color: colors.textPrimary,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            lineHeight: 1.5
                          }}
                        >
                          <span>{market.name}</span>
                          <span style={{ color: colors.primary, fontSize: typography.sizes.xs }}>→</span>
                        </Link>
                      ))}
                      {traditionalMarkets.length > 4 && (
                        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          +{traditionalMarkets.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Private Pickup Section */}
                  {privatePickups.length > 0 && (
                    <div>
                      <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, fontWeight: typography.weights.semibold }}>
                        Private
                      </p>
                      {privatePickups.slice(0, 4).map(market => (
                        <Link
                          key={market.id}
                          href={`/${vertical}/vendor/markets/${market.id}/prep`}
                          style={{
                            fontSize: typography.sizes.sm,
                            textDecoration: 'none',
                            color: colors.textPrimary,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            lineHeight: 1.5
                          }}
                        >
                          <span>{market.name}</span>
                          <span style={{ color: colors.primary, fontSize: typography.sizes.xs }}>→</span>
                        </Link>
                      ))}
                      {privatePickups.length > 4 && (
                        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                          +{privatePickups.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Pickup Mode - Quick mobile-friendly order lookup */}
          <Link
            href={`/${vertical}/vendor/pickup`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.primaryLight,
              color: colors.textPrimary,
              border: `1px solid ${colors.primary}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              boxShadow: shadows.sm
            }}>
              <h3 style={{
                color: colors.primaryDark,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Pickup Mode
              </h3>
              <p style={{ color: colors.primaryDark, margin: 0, fontSize: typography.sizes.sm }}>
                Mobile-friendly view for market day fulfillment
              </p>
            </div>
          </Link>
        </div>

        {/* MIDDLE ROW - Action Cards: Business Profile, Listings, Market Boxes, Orders, etc */}
        <div className="action-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Business Profile */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: spacing.xs,
              gap: spacing['2xs']
            }}>
              <h3 style={{
                color: colors.primary,
                margin: 0,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Business Profile
              </h3>
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                <Link
                  href={`/${vertical}/vendor/${vendorProfile.id}/profile`}
                  target="_blank"
                  style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textSecondary,
                    textDecoration: 'none',
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: radius.sm
                  }}
                  title="Preview your public profile"
                >
                  👁
                </Link>
                <EditProfileButton vertical={vertical} />
              </div>
            </div>

            <div style={{ fontSize: typography.sizes.sm }}>
              <p style={{ margin: 0, fontWeight: typography.weights.medium }}>
                {(profileData.business_name as string) || (profileData.farm_name as string) || 'Not provided'}
              </p>
              <p style={{ margin: `${spacing['3xs']} 0 0 0`, color: colors.textMuted, fontSize: typography.sizes.xs }}>
                {(profileData.phone as string) || 'No phone'} · {(profileData.email as string) || userProfile?.email || 'No email'}
              </p>
            </div>
          </div>

          {/* Your Listings */}
          <Link
            href={`/${vertical}/vendor/listings`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>📦</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Your Listings
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                Create and manage your product listings
              </p>
            </div>
          </Link>

          {/* Market Boxes - 4-week subscription bundles */}
          <Link
            href={`/${vertical}/vendor/market-boxes`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>📦</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Market Boxes
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                Offer 4-week subscription bundles to premium buyers
              </p>
            </div>
          </Link>

          {/* Orders */}
          <Link
            href={`/${vertical}/vendor/orders`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>🧾</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Orders
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                Manage incoming orders from customers
              </p>
            </div>
          </Link>

          {/* Analytics */}
          <Link
            href={`/${vertical}/vendor/analytics`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>📊</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Analytics
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                View sales trends, top products, and insights
              </p>
            </div>
          </Link>

          {/* Reviews */}
          <Link
            href={`/${vertical}/vendor/reviews`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>⭐</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Reviews
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                See feedback from your customers
              </p>
            </div>
          </Link>

          {/* Payment Settings */}
          <Link
            href={`/${vertical}/vendor/dashboard/stripe`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              height: '100%',
              minHeight: 120,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>💳</div>
              <h3 style={{
                color: colors.primary,
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Payment Settings
              </h3>
              <p style={{ color: colors.textSecondary, margin: 0, fontSize: typography.sizes.sm }}>
                Connect your bank account to receive payments
              </p>
            </div>
          </Link>
        </div>

        {/* Referral Card - Compact row */}
        {vendorProfile.status === 'approved' && (
          <div style={{ marginBottom: spacing.md }}>
            <ReferralCard vertical={vertical} />
          </div>
        )}

        {/* Your Plan - Full width, compact */}
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          backgroundColor: vendorProfile.tier === 'premium' ? colors.surfaceSubtle : vendorProfile.tier === 'featured' ? colors.primaryLight : colors.surfaceElevated,
          color: colors.textPrimary,
          border: `1px solid ${vendorProfile.tier === 'premium' ? colors.accent : vendorProfile.tier === 'featured' ? colors.primary : colors.border}`,
          borderRadius: radius.md,
          boxShadow: shadows.sm
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
            {/* Left: Tier info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
              <div>
                <h3 style={{
                  color: colors.primary,
                  margin: 0,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold
                }}>
                  Your Plan
                </h3>
                <p style={{
                  margin: '2px 0 0 0',
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  color: vendorProfile.tier === 'premium' ? colors.accent : vendorProfile.tier === 'featured' ? colors.primary : colors.textPrimary
                }}>
                  {vendorProfile.tier === 'premium' ? 'Premium' : vendorProfile.tier === 'featured' ? 'Featured' : 'Standard'}
                </p>
              </div>
              <div style={{
                padding: `${spacing['3xs']} ${spacing.xs}`,
                backgroundColor: vendorProfile.status === 'approved' ? colors.primaryLight : colors.surfaceSubtle,
                color: vendorProfile.status === 'approved' ? colors.primaryDark : colors.accent,
                borderRadius: radius.full,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold
              }}>
                {vendorProfile.status.charAt(0).toUpperCase() + vendorProfile.status.slice(1)}
              </div>
            </div>

            {/* Middle: Plan features summary */}
            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
              <span>{vendorProfile.tier === 'premium' || vendorProfile.tier === 'featured' ? '10' : '3'} listings</span>
              <span>{vendorProfile.tier === 'premium' || vendorProfile.tier === 'featured' ? 'Multiple markets' : 'Home market'}</span>
              {(vendorProfile.tier === 'premium' || vendorProfile.tier === 'featured') && (
                <>
                  <span style={{ color: colors.primary }}>Market Boxes</span>
                  <span style={{ color: colors.primary }}>Priority search</span>
                </>
              )}
            </div>

            {/* Right: Upgrade button or status */}
            {(!vendorProfile.tier || vendorProfile.tier === 'standard') ? (
              <Link
                href={`/${vertical}/vendor/dashboard/upgrade`}
                style={{
                  padding: `${spacing['2xs']} ${spacing.sm}`,
                  backgroundColor: colors.primary,
                  color: colors.textInverse,
                  textDecoration: 'none',
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.sm
                }}
              >
                Upgrade to Premium
              </Link>
            ) : (
              <span style={{ fontSize: typography.sizes.xs, color: vendorProfile.tier === 'premium' ? colors.accent : colors.primary }}>
                {vendorProfile.tier === 'premium' ? 'Full premium access' : 'Featured vendor'}
              </span>
            )}
          </div>
        </div>

        {/* Coming Soon */}
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceMuted,
          color: colors.textPrimary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md
        }}>
          <h3 style={{
            margin: `0 0 ${spacing.xs} 0`,
            color: colors.textMuted,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold
          }}>
            Coming Soon
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20, color: colors.textMuted, fontSize: typography.sizes.sm }}>
            <li>Customer messages</li>
          </ul>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-dashboard .info-grid {
          grid-template-columns: 1fr;
        }
        .vendor-dashboard .action-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-dashboard .info-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .action-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendor-dashboard .info-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .vendor-dashboard .action-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>

      {/* Vendor Onboarding Tutorial */}
      <TutorialWrapper vertical={vertical} mode="vendor" showTutorial={showVendorTutorial} />
    </div>
  )
}
