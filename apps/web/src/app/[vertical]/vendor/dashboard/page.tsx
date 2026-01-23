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

        {/* TOP ROW - Info Cards: Business Info, Pickup Locations, Pickup Mode */}
        <div className="info-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Combined Business & Contact Information */}
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
              marginBottom: spacing.sm,
              gap: spacing['2xs']
            }}>
              <h2 style={{
                color: colors.primary,
                margin: 0,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Vendor Business Profile
              </h2>
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
                    borderRadius: radius.sm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['3xs']
                  }}
                  title="Preview your public profile"
                >
                  👁 Preview
                </Link>
                <EditProfileButton vertical={vertical} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs }}>
              <div>
                <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>Business Name</p>
                <p style={{ margin: '2px 0 0 0', fontSize: typography.sizes.sm }}>
                  {(profileData.business_name as string) || (profileData.farm_name as string) || 'Not provided'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>Legal Name</p>
                <p style={{ margin: '2px 0 0 0', fontSize: typography.sizes.sm }}>
                  {(profileData.legal_name as string) || 'Not provided'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>Phone</p>
                <p style={{ margin: '2px 0 0 0', fontSize: typography.sizes.sm }}>
                  {(profileData.phone as string) || 'Not provided'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>Email</p>
                <p style={{ margin: '2px 0 0 0', fontSize: typography.sizes.sm }}>
                  {(profileData.email as string) || userProfile?.email || 'Not provided'}
                </p>
              </div>
            </div>
          </div>

          {/* Active Pickup Locations Card */}
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
              marginBottom: spacing.sm,
              gap: spacing['2xs']
            }}>
              <h2 style={{
                color: colors.primary,
                margin: 0,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold
              }}>
                Active Pickup Locations
              </h2>
              <Link
                href={`/${vertical}/vendor/markets`}
                style={{
                  fontSize: typography.sizes.xs,
                  color: colors.primary,
                  textDecoration: 'none',
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: colors.primaryLight,
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold
                }}
              >
                Manage
              </Link>
            </div>

            {vendorProfile.status !== 'approved' ? (
              <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                Available after approval
              </p>
            ) : activeMarkets.length === 0 ? (
              <div>
                <p style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                  No active listings with pickup locations yet.
                </p>
                <Link
                  href={`/${vertical}/vendor/markets`}
                  style={{
                    fontSize: typography.sizes.sm,
                    color: colors.primary,
                    textDecoration: 'underline'
                  }}
                >
                  Set up markets
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                {/* Traditional Markets */}
                {traditionalMarkets.length > 0 && (
                  <div>
                    <p style={{ margin: `0 0 ${spacing['3xs']} 0`, fontSize: typography.sizes.xs, color: colors.textMuted, fontWeight: typography.weights.semibold, textTransform: 'uppercase' }}>
                      Markets ({traditionalMarkets.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
                      {traditionalMarkets.map(market => (
                        <div key={market.id} style={{
                          padding: spacing['2xs'],
                          backgroundColor: colors.surfaceMuted,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm
                        }}>
                          <div style={{ fontWeight: typography.weights.medium, marginBottom: 2 }}>{market.name}</div>
                          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                            {market.day_of_week !== null && `${DAYS[market.day_of_week]} `}
                            {market.start_time && market.end_time && `${market.start_time}-${market.end_time}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Private Pickups */}
                {privatePickups.length > 0 && (
                  <div>
                    <p style={{ margin: `0 0 ${spacing['3xs']} 0`, fontSize: typography.sizes.xs, color: colors.textMuted, fontWeight: typography.weights.semibold, textTransform: 'uppercase' }}>
                      Private Pickup ({privatePickups.length})
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
                      {privatePickups.map(pickup => (
                        <div key={pickup.id} style={{
                          padding: spacing['2xs'],
                          backgroundColor: colors.surfaceMuted,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm
                        }}>
                          <div style={{ fontWeight: typography.weights.medium, marginBottom: 2 }}>{pickup.name}</div>
                          <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}>
                            {pickup.city}, {pickup.state}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
              minHeight: 140,
              boxShadow: shadows.sm
            }}>
              <div style={{ fontSize: typography.sizes['2xl'], marginBottom: spacing['2xs'] }}>📲</div>
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

        {/* MIDDLE ROW - Action Cards: Your Listings, Market Boxes, Orders */}
        <div className="action-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
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
              backgroundColor: vendorProfile.tier === 'premium' ? colors.surfaceSubtle : colors.surfaceElevated,
              color: colors.textPrimary,
              border: `1px solid ${vendorProfile.tier === 'premium' ? colors.accent : colors.border}`,
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
        </div>

        {/* Referral Card - Full width above bottom grid */}
        {vendorProfile.status === 'approved' && (
          <div style={{ marginBottom: spacing.md }}>
            <ReferralCard vertical={vertical} />
          </div>
        )}

        {/* BOTTOM ROW - Your Plan + Payment Settings */}
        <div className="bottom-grid" style={{
          display: 'grid',
          gap: spacing.sm,
          marginBottom: spacing.md
        }}>
          {/* Your Plan / Tier Card - includes status */}
          <div style={{
            padding: spacing.sm,
            backgroundColor: vendorProfile.tier === 'premium' ? colors.surfaceSubtle : vendorProfile.tier === 'featured' ? colors.primaryLight : colors.surfaceElevated,
            color: colors.textPrimary,
            border: `1px solid ${vendorProfile.tier === 'premium' ? colors.accent : vendorProfile.tier === 'featured' ? colors.primary : colors.border}`,
            borderRadius: radius.md,
            boxShadow: shadows.sm
          }}>
            <h2 style={{
              color: colors.primary,
              margin: `0 0 ${spacing.sm} 0`,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold
            }}>
              Your Plan
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted }}>Current Tier</p>
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

              {/* Current Plan Features */}
              <div style={{
                padding: spacing.xs,
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs
              }}>
                <p style={{ margin: 0, fontWeight: typography.weights.semibold, color: colors.textSecondary, marginBottom: spacing['3xs'] }}>
                  Your Plan Includes:
                </p>
                <ul style={{ margin: 0, paddingLeft: 16, color: colors.textMuted }}>
                  <li>Up to {vendorProfile.tier === 'premium' || vendorProfile.tier === 'featured' ? '10' : '3'} product listings</li>
                  <li>{vendorProfile.tier === 'premium' || vendorProfile.tier === 'featured' ? 'Multiple' : 'Home'} market locations</li>
                  <li>Order management tools</li>
                  {(vendorProfile.tier === 'premium' || vendorProfile.tier === 'featured') && (
                    <>
                      <li style={{ color: colors.primary }}>Priority search placement</li>
                      <li style={{ color: colors.primary }}>Market Box subscriptions</li>
                      <li style={{ color: colors.primary }}>Social links on profile</li>
                      <li style={{ color: colors.primary }}>Profile image upload</li>
                    </>
                  )}
                </ul>
              </div>

              {(!vendorProfile.tier || vendorProfile.tier === 'standard') && (
                <div style={{
                  padding: spacing.xs,
                  backgroundColor: colors.primaryLight,
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.primary}`
                }}>
                  <p style={{ margin: 0, fontWeight: typography.weights.semibold, color: colors.primaryDark, marginBottom: spacing['3xs'], fontSize: typography.sizes.sm }}>
                    Upgrade to Premium
                  </p>
                  <ul style={{ margin: `0 0 ${spacing.xs} 0`, paddingLeft: 16, color: colors.primaryDark, fontSize: typography.sizes.xs }}>
                    <li>10 listings instead of 3</li>
                    <li>Sell at multiple markets</li>
                    <li>Priority placement in search</li>
                    <li>Market Box subscriptions</li>
                    <li>Custom profile with social links</li>
                  </ul>
                  <Link
                    href={`/${vertical}/vendor/dashboard/upgrade`}
                    style={{
                      display: 'inline-block',
                      padding: `${spacing['2xs']} ${spacing.sm}`,
                      backgroundColor: colors.primary,
                      color: colors.textInverse,
                      textDecoration: 'none',
                      borderRadius: radius.sm,
                      fontWeight: typography.weights.semibold,
                      fontSize: typography.sizes.sm
                    }}
                  >
                    Upgrade Now
                  </Link>
                </div>
              )}

              {vendorProfile.tier === 'premium' && (
                <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.accent }}>
                  You have full access to all premium vendor features.
                </p>
              )}

              {vendorProfile.tier === 'featured' && (
                <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.primary }}>
                  Your listings are featured prominently across the marketplace.
                </p>
              )}
            </div>
          </div>

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
        .vendor-dashboard .bottom-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-dashboard .info-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .action-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .vendor-dashboard .bottom-grid {
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
          .vendor-dashboard .bottom-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>

      {/* Vendor Onboarding Tutorial */}
      <TutorialWrapper vertical={vertical} mode="vendor" showTutorial={showVendorTutorial} />
    </div>
  )
}
