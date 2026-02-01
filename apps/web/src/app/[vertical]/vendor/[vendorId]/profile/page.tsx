import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import { formatDisplayPrice, VendorTierType } from '@/lib/constants'
import VendorAvatar from '@/components/shared/VendorAvatar'
import TierBadge from '@/components/shared/TierBadge'
import BackLink from '@/components/shared/BackLink'
import PickupScheduleGrid from '@/components/vendor/PickupScheduleGrid'
import type { Metadata } from 'next'

interface VendorProfilePageProps {
  params: Promise<{ vertical: string; vendorId: string }>
}

// Generate Open Graph metadata for social sharing
export async function generateMetadata({ params }: VendorProfilePageProps): Promise<Metadata> {
  const { vertical, vendorId } = await params
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Fetch vendor profile
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('profile_data, description, profile_image_url')
    .eq('id', vendorId)
    .eq('vertical_id', vertical)
    .eq('status', 'approved')
    .single()

  if (!vendor) {
    return {
      title: 'Vendor Not Found',
    }
  }

  const profileData = vendor.profile_data as Record<string, unknown>
  const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
  const vendorDescription = vendor.description as string | null
  const vendorImageUrl = vendor.profile_image_url as string | null

  const title = `${vendorName} - ${branding.brand_name}`
  const description = vendorDescription || `Shop fresh products from ${vendorName} on ${branding.brand_name}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      images: vendorImageUrl ? [{ url: vendorImageUrl, alt: vendorName }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: vendorImageUrl ? [vendorImageUrl] : [],
    },
  }
}

export default async function VendorProfilePage({ params }: VendorProfilePageProps) {
  const { vertical, vendorId } = await params
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Check if user is premium buyer (for premium window logic)
  const { data: { user } } = await supabase.auth.getUser()
  let isPremiumBuyer = false
  if (user) {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('buyer_tier')
      .eq('user_id', user.id)
      .single()
    isPremiumBuyer = userProfile?.buyer_tier === 'premium'
  }

  // Get vendor profile with rating info and certifications
  const { data: vendor, error } = await supabase
    .from('vendor_profiles')
    .select('*, average_rating, rating_count, certifications')
    .eq('id', vendorId)
    .eq('vertical_id', vertical)
    .eq('status', 'approved')
    .single()

  if (error || !vendor) {
    notFound()
  }

  const profileData = vendor.profile_data as Record<string, unknown>
  const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
  const vendorTier = (vendor.tier || 'standard') as VendorTierType
  const vendorDescription = vendor.description as string | null
  const vendorImageUrl = vendor.profile_image_url as string | null
  const socialLinks = vendor.social_links as Record<string, string> | null
  const averageRating = vendor.average_rating as number | null
  const ratingCount = vendor.rating_count as number | null
  const certifications = (vendor.certifications as {
    type: string
    label: string
    registration_number: string
    state: string
    verified?: boolean
  }[]) || []

  // Certification badge styling by type
  const certificationStyles: Record<string, { color: string; bg: string; icon: string }> = {
    cottage_goods: { color: '#d97706', bg: '#fef3c7', icon: '🏠' },
    organic: { color: '#059669', bg: '#d1fae5', icon: '🌱' },
    regenerative: { color: '#0284c7', bg: '#dbeafe', icon: '♻️' },
    gap_certified: { color: '#7c3aed', bg: '#ede9fe', icon: '✓' },
    other: { color: '#6b7280', bg: '#f3f4f6', icon: '📜' }
  }

  // Get vendor_type from profile (could be array or string)
  const profileTypes = profileData?.vendor_type
  const profileCategories: string[] = profileTypes
    ? (Array.isArray(profileTypes) ? profileTypes as string[] : [profileTypes as string])
    : []

  // Get vendor's published listings with images and markets
  const { data: listings } = await supabase
    .from('listings')
    .select(`
      *,
      premium_window_ends_at,
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
          market_type
        )
      )
    `)
    .eq('vendor_profile_id', vendorId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Current time for premium window comparison
  const now = new Date().toISOString()

  // Get all unique categories from vendor's listings
  const listingCategories = [...new Set(
    (listings || [])
      .map(l => l.category as string | null)
      .filter((c): c is string => c !== null)
  )]

  // Combine profile categories and listing categories (unique)
  const allCategories = [...new Set([...profileCategories, ...listingCategories])]

  // Get unique markets where this vendor has active listings
  const listingIds = (listings || []).map(l => l.id as string)
  let vendorMarkets: { id: string; name: string; market_type: string }[] = []
  let allPickupLocations: {
    id: string
    name: string
    address?: string
    city?: string
    state?: string
    description?: string
    market_type?: 'private_pickup' | 'traditional'
    schedules?: { day_of_week: number; start_time: string; end_time: string }[]
  }[] = []

  if (listingIds.length > 0) {
    const { data: listingMarketsData } = await supabase
      .from('listing_markets')
      .select(`
        market_id,
        markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          description,
          expires_at
        )
      `)
      .in('listing_id', listingIds)

    // Extract unique markets
    const marketsMap = new Map<string, { id: string; name: string; market_type: string }>()
    const pickupLocationsMap = new Map<string, typeof allPickupLocations[0]>()
    const nowIso = new Date().toISOString()
    if (listingMarketsData) {
      for (const lm of listingMarketsData) {
        const market = lm.markets as unknown as {
          id: string
          name: string
          market_type: string
          address?: string
          city?: string
          state?: string
          description?: string
          expires_at?: string | null
        } | null
        // Skip expired markets
        if (market?.expires_at && market.expires_at < nowIso) {
          continue
        }
        if (market && !marketsMap.has(market.id)) {
          marketsMap.set(market.id, {
            id: market.id,
            name: market.name,
            market_type: market.market_type
          })
          // Collect ALL pickup locations (both private and traditional)
          pickupLocationsMap.set(market.id, {
            id: market.id,
            name: market.name,
            address: market.address,
            city: market.city,
            state: market.state,
            description: market.description,
            market_type: market.market_type as 'private_pickup' | 'traditional'
          })
        }
      }
    }
    vendorMarkets = Array.from(marketsMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    // Fetch schedules for private pickup locations (directly from market_schedules)
    const privatePickupIds = Array.from(pickupLocationsMap.values())
      .filter(loc => loc.market_type === 'private_pickup')
      .map(loc => loc.id)

    if (privatePickupIds.length > 0) {
      const { data: privateSchedulesData } = await supabase
        .from('market_schedules')
        .select('market_id, day_of_week, start_time, end_time')
        .in('market_id', privatePickupIds)
        .eq('active', true)
        .order('day_of_week')

      if (privateSchedulesData) {
        for (const schedule of privateSchedulesData) {
          const marketId = schedule.market_id as string
          const location = pickupLocationsMap.get(marketId)
          if (location) {
            if (!location.schedules) location.schedules = []
            location.schedules.push({
              day_of_week: schedule.day_of_week as number,
              start_time: schedule.start_time as string,
              end_time: schedule.end_time as string
            })
          }
        }
      }
    }

    // Fetch schedules for traditional markets (via vendor_market_schedules)
    const traditionalMarketIds = Array.from(pickupLocationsMap.values())
      .filter(loc => loc.market_type === 'traditional')
      .map(loc => loc.id)

    if (traditionalMarketIds.length > 0) {
      // Get vendor's active schedules at these markets
      const { data: vendorSchedulesData } = await supabase
        .from('vendor_market_schedules')
        .select(`
          market_id,
          schedule_id,
          is_active,
          market_schedules (
            day_of_week,
            start_time,
            end_time
          )
        `)
        .eq('vendor_profile_id', vendorId)
        .in('market_id', traditionalMarketIds)
        .eq('is_active', true)

      if (vendorSchedulesData) {
        for (const vs of vendorSchedulesData) {
          const marketId = vs.market_id as string
          const scheduleInfo = vs.market_schedules as unknown as {
            day_of_week: number
            start_time: string
            end_time: string
          } | null

          if (scheduleInfo) {
            const location = pickupLocationsMap.get(marketId)
            if (location) {
              if (!location.schedules) location.schedules = []
              location.schedules.push({
                day_of_week: scheduleInfo.day_of_week,
                start_time: scheduleInfo.start_time,
                end_time: scheduleInfo.end_time
              })
            }
          }
        }
      }
    }

    // Convert map to array, sorted by name
    allPickupLocations = Array.from(pickupLocationsMap.values())
      .filter(loc => loc.schedules && loc.schedules.length > 0) // Only show locations with schedules
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // Get vendor's active market boxes with details
  const { data: marketBoxes } = await supabase
    .from('market_box_offerings')
    .select(`
      id,
      name,
      description,
      image_urls,
      price_cents,
      price_4week_cents,
      pickup_day_of_week,
      pickup_start_time,
      pickup_end_time,
      market:markets (
        id,
        name,
        city,
        state
      )
    `)
    .eq('vendor_profile_id', vendorId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  const hasActiveMarketBoxes = (marketBoxes?.length || 0) > 0

  return (
    <div
      style={{
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        minHeight: '100vh'
      }}
      className="vendor-profile-page"
    >
      {/* Back Link - uses browser history to go back to previous page */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #eee',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <BackLink
            fallbackHref={`/${vertical}/browse`}
            fallbackLabel="Back"
            style={{
              color: branding.colors.primary,
              fontSize: 14,
              fontWeight: 600
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px'
      }}>
        {/* Vendor Header */}
        <div style={{
          padding: 24,
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          marginBottom: 24
        }}>
          <div className="vendor-header" style={{
            display: 'flex',
            gap: 24,
            alignItems: 'flex-start'
          }}>
            {/* Vendor Avatar */}
            <VendorAvatar
              imageUrl={vendorImageUrl}
              name={vendorName}
              size={100}
              tier={vendorTier}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <h1 style={{
                  color: branding.colors.primary,
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 'bold',
                  lineHeight: 1.3
                }}>
                  {vendorName}
                </h1>
                {vendorTier !== 'standard' && (
                  <TierBadge tier={vendorTier} size="lg" />
                )}
                {/* Rating Display - Always show stars */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  backgroundColor: ratingCount && ratingCount > 0 ? '#fef3c7' : '#f3f4f6',
                  borderRadius: 16
                }}>
                  {/* 5 Star Display */}
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const rating = averageRating || 0
                      const filled = star <= Math.floor(rating)
                      const partial = star === Math.ceil(rating) && rating % 1 !== 0
                      const fillPercent = partial ? (rating % 1) * 100 : 0

                      return (
                        <span
                          key={star}
                          style={{
                            fontSize: 18,
                            position: 'relative',
                            color: filled ? '#f59e0b' : '#d1d5db'
                          }}
                        >
                          {filled ? '★' : partial ? (
                            <span style={{ position: 'relative' }}>
                              <span style={{ color: '#d1d5db' }}>★</span>
                              <span style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                overflow: 'hidden',
                                width: `${fillPercent}%`,
                                color: '#f59e0b'
                              }}>★</span>
                            </span>
                          ) : '★'}
                        </span>
                      )
                    })}
                  </div>
                  {ratingCount && ratingCount > 0 ? (
                    <>
                      <span style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#92400e',
                        marginLeft: 4
                      }}>
                        {(averageRating || 0).toFixed(1)}
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: '#b45309'
                      }}>
                        ({ratingCount} review{ratingCount !== 1 ? 's' : ''})
                      </span>
                    </>
                  ) : (
                    <span style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginLeft: 4
                    }}>
                      No reviews yet
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              {vendorDescription && (
                <p style={{
                  margin: '12px 0',
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: '#374151'
                }}>
                  {vendorDescription}
                </p>
              )}

              <div className="vendor-meta" style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                color: '#666',
                fontSize: 14,
                marginTop: 8
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  ✓ Verified Vendor
                </span>
                <span>
                  Member since {new Date(vendor.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
                <span>
                  {listings?.length || 0} listing{listings?.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Social Links (Premium only) */}
              {socialLinks && Object.keys(socialLinks).some(key => socialLinks[key]) && (
                <div style={{
                  display: 'flex',
                  gap: 12,
                  marginTop: 16,
                  flexWrap: 'wrap'
                }}>
                  {socialLinks.facebook && (
                    <a
                      href={socialLinks.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#1877f2',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      Facebook
                    </a>
                  )}
                  {socialLinks.instagram && (
                    <a
                      href={socialLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#e4405f',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      Instagram
                    </a>
                  )}
                  {socialLinks.website && (
                    <a
                      href={socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      Website
                    </a>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Categories - show ALL categories vendor sells */}
          {(allCategories.length > 0 || hasActiveMarketBoxes) && (
            <div style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #f3f4f6'
            }}>
              <h3 style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#374151',
                margin: '0 0 12px 0'
              }}>
                Listing Categories
              </h3>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8
              }}>
                {allCategories.sort().map(category => (
                  <span
                    key={category}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#d1fae5',
                      color: '#065f46',
                      borderRadius: 16,
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    {category}
                  </span>
                ))}
                {hasActiveMarketBoxes && (
                  <span
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: 16,
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    📦 Market Box
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Registrations & Certifications */}
          {certifications.length > 0 && (
            <div style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #f3f4f6'
            }}>
              <h3 style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#374151',
                margin: '0 0 12px 0'
              }}>
                Registrations & Certifications
              </h3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                {certifications.map((cert, index) => {
                  const style = certificationStyles[cert.type] || certificationStyles.other
                  return (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{style.icon}</span>
                      <span style={{ color: style.color, fontWeight: 600 }}>
                        {cert.label}
                      </span>
                      <span style={{ color: '#6b7280' }}>
                        #{cert.registration_number}
                      </span>
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>
                        ({cert.state})
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Vendor Availability Schedule - Calendar Grid */}
        {allPickupLocations.length > 0 && (
          <PickupScheduleGrid locations={allPickupLocations} />
        )}

        {/* Market Boxes Section */}
        {hasActiveMarketBoxes && marketBoxes && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              color: branding.colors.primary,
              margin: '0 0 20px 0',
              fontSize: 20,
              fontWeight: 600
            }}>
              📦 Market Box Subscriptions
            </h2>

            <div className="listings-grid" style={{
              display: 'grid',
              gap: 16
            }}>
              {marketBoxes.map((box) => {
                const boxId = box.id as string
                const boxName = box.name as string
                const boxDescription = box.description as string | null
                const boxImageUrls = box.image_urls as string[] | null
                const boxPriceCents = (box.price_4week_cents || box.price_cents) as number
                const boxDay = box.pickup_day_of_week as number
                const boxStartTime = box.pickup_start_time as string
                const rawMarket = box.market as { id: string; name: string; city: string; state: string } | { id: string; name: string; city: string; state: string }[] | null
                const boxMarket = Array.isArray(rawMarket) ? rawMarket[0] : rawMarket
                const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

                const formatTime = (time: string) => {
                  const [hours, minutes] = time.split(':')
                  const hour = parseInt(hours)
                  const ampm = hour >= 12 ? 'PM' : 'AM'
                  const displayHour = hour % 12 || 12
                  return `${displayHour}:${minutes} ${ampm}`
                }

                return (
                  <Link
                    key={boxId}
                    href={`/${vertical}/market-box/${boxId}`}
                    style={{
                      display: 'block',
                      padding: 16,
                      backgroundColor: 'white',
                      color: '#333',
                      border: '1px solid #dbeafe',
                      borderRadius: 8,
                      textDecoration: 'none'
                    }}
                  >
                    {/* Image with Market Box Badge */}
                    <div style={{ position: 'relative', marginBottom: 12 }}>
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
                        📦 Market Box
                      </span>

                      {boxImageUrls && boxImageUrls.length > 0 ? (
                        <img
                          src={boxImageUrls[0]}
                          alt={boxName}
                          style={{
                            width: '100%',
                            height: 140,
                            objectFit: 'cover',
                            borderRadius: 6,
                            backgroundColor: '#f3f4f6'
                          }}
                        />
                      ) : (
                        <div style={{
                          height: 140,
                          backgroundColor: '#eff6ff',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <span style={{ fontSize: 48 }}>📦</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h3 style={{
                      marginBottom: 8,
                      marginTop: 0,
                      color: branding.colors.primary,
                      fontSize: 16,
                      fontWeight: 600
                    }}>
                      {boxName}
                    </h3>

                    {/* Description */}
                    {boxDescription && (
                      <p style={{
                        margin: '0 0 8px 0',
                        fontSize: 13,
                        color: '#6b7280',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {boxDescription}
                      </p>
                    )}

                    {/* Pickup Info */}
                    <div style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 8
                    }}>
                      {DAYS[boxDay]}s at {formatTime(boxStartTime)}
                      {boxMarket && ` • ${boxMarket.name}`}
                    </div>

                    {/* Price */}
                    <div style={{
                      fontSize: 18,
                      fontWeight: 'bold',
                      color: branding.colors.primary
                    }}>
                      ${(boxPriceCents / 100).toFixed(2)}
                      <span style={{ fontSize: 12, fontWeight: 'normal', color: '#6b7280' }}> / 4 weeks</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Vendor Listings */}
        <div>
          <h2 style={{
            color: branding.colors.primary,
            margin: '0 0 20px 0',
            fontSize: 20,
            fontWeight: 600
          }}>
            Listings from {vendorName}
          </h2>

          {listings && listings.length > 0 ? (
            <div className="listings-grid" style={{
              display: 'grid',
              gap: 16
            }}>
              {listings.map((listing) => {
                const listingId = listing.id as string
                const listingTitle = listing.title as string
                const listingDescription = listing.description as string | null
                const listingCategory = listing.category as string | null
                const listingPriceCents = (listing.price_cents as number) || 0
                const listingImages = listing.listing_images as { id: string; url: string; is_primary: boolean; display_order: number }[] | null
                const listingMarkets = listing.listing_markets as { market_id: string; markets: { id: string; name: string; market_type: string } | null }[] | null
                const primaryImage = listingImages?.find(img => img.is_primary) || listingImages?.[0]
                const premiumWindowEndsAt = listing.premium_window_ends_at as string | null
                const isInPremiumWindow = premiumWindowEndsAt && premiumWindowEndsAt > now
                const showPremiumRestriction = isInPremiumWindow && !isPremiumBuyer

                return (
                  <Link
                    key={listingId}
                    href={`/${vertical}/listing/${listingId}`}
                    style={{
                      display: 'block',
                      padding: 16,
                      backgroundColor: 'white',
                      color: '#333',
                      border: showPremiumRestriction ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                      borderRadius: 8,
                      textDecoration: 'none',
                      height: '100%',
                      position: 'relative'
                    }}
                  >
                    {/* Premium Window Banner for standard buyers */}
                    {showPremiumRestriction && (
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        padding: '6px 12px',
                        fontSize: 11,
                        fontWeight: 600,
                        textAlign: 'center',
                        borderRadius: '6px 6px 0 0',
                        zIndex: 2
                      }}>
                        ⭐ Premium Early-Bird — Upgrade to Buy Now
                      </div>
                    )}

                    {/* Image with Category Badge */}
                    <div style={{ position: 'relative', marginBottom: 12, marginTop: showPremiumRestriction ? 28 : 0 }}>
                      {listingCategory && (
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
                          {listingCategory}
                        </span>
                      )}

                      {primaryImage?.url ? (
                        <img
                          src={primaryImage.url}
                          alt={listingTitle}
                          style={{
                            width: '100%',
                            height: 140,
                            objectFit: 'cover',
                            borderRadius: 6,
                            backgroundColor: '#f3f4f6'
                          }}
                        />
                      ) : (
                        <div style={{
                          height: 140,
                          backgroundColor: '#f3f4f6',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <span style={{ fontSize: 36, color: '#ccc' }}>📦</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h3 style={{
                      marginBottom: 4,
                      marginTop: 0,
                      color: branding.colors.primary,
                      fontSize: 16,
                      fontWeight: 600,
                      lineHeight: 1.3
                    }}>
                      {listingTitle}
                    </h3>

                    {/* Description */}
                    {listingDescription && (
                      <p style={{
                        fontSize: 13,
                        color: '#6b7280',
                        marginBottom: 8,
                        marginTop: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: 1.4,
                        minHeight: 36
                      }}>
                        {listingDescription}
                      </p>
                    )}

                    {/* Price (includes platform fee) */}
                    <div style={{
                      fontSize: 20,
                      fontWeight: 'bold',
                      color: branding.colors.primary,
                      marginBottom: 4
                    }}>
                      {formatDisplayPrice(listingPriceCents)}
                    </div>

                    {/* Market/Location */}
                    {listingMarkets && listingMarkets.length > 0 && (
                      <div style={{
                        fontSize: 12,
                        color: '#6b7280',
                        marginTop: 4
                      }}>
                        {listingMarkets.length === 1
                          ? (() => {
                              const market = listingMarkets[0].markets
                              const prefix = market?.market_type === 'private_pickup' ? 'Private Pickup: ' : 'Market: '
                              return prefix + (market?.name || 'Location')
                            })()
                          : `${listingMarkets.length} pickup locations`
                        }
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          ) : (
            <div style={{
              padding: 40,
              backgroundColor: 'white',
              borderRadius: 8,
              textAlign: 'center',
              color: '#666'
            }}>
              This vendor hasn&apos;t listed any products yet.
            </div>
          )}
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-profile-page .vendor-header {
          flex-direction: column;
          text-align: center;
        }
        .vendor-profile-page .vendor-meta {
          justify-content: center;
        }
        .vendor-profile-page .listings-grid {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }
        @media (min-width: 640px) {
          .vendor-profile-page .vendor-header {
            flex-direction: row;
            text-align: left;
          }
          .vendor-profile-page .vendor-meta {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  )
}
