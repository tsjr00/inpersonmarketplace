import { notFound } from 'next/navigation'
import Image from 'next/image'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import { formatDisplayPrice, VendorTierType } from '@/lib/constants'
import VendorAvatar from '@/components/shared/VendorAvatar'
import TierBadge from '@/components/shared/TierBadge'
import BackLink from '@/components/shared/BackLink'
import ShareButton from '@/components/marketing/ShareButton'
import { getAppUrl } from '@/lib/environment'
import { vendorProfileJsonLd } from '@/lib/marketing/json-ld'
import PickupScheduleGrid from '@/components/vendor/PickupScheduleGrid'
import { isBuyerPremiumEnabled, term } from '@/lib/vertical'
import PaymentMethodBadges from '@/components/vendor/PaymentMethodBadges'
import { colors } from '@/lib/design-tokens'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'
import type { Metadata } from 'next'

interface VendorProfilePageProps {
  params: Promise<{ vertical: string; vendorId: string }>
}

// Generate Open Graph metadata for social sharing
export async function generateMetadata({ params }: VendorProfilePageProps): Promise<Metadata> {
  const { vertical, vendorId } = await params
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Fetch vendor profile
  const { data: vendor } = await supabase
    .from('vendor_profiles')
    .select('profile_data, description, profile_image_url')
    .eq('id', vendorId)
    .eq('vertical_id', vertical)
    .eq('status', 'approved')
    .single()

  const locale = await getLocale()

  if (!vendor) {
    return {
      title: t('vp.not_found', locale),
    }
  }

  const profileData = vendor.profile_data as Record<string, unknown>
  const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || t('vp.vendor_fallback', locale)
  const vendorDescription = vendor.description as string | null
  const vendorImageUrl = vendor.profile_image_url as string | null

  const title = `${vendorName} - ${branding.brand_name}`
  const description = vendorDescription || t('vp.og_description', locale, { vendor: vendorName, brand: branding.brand_name })

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
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Check if user is premium buyer (for premium window logic) and if admin
  const { data: { user } } = await supabase.auth.getUser()
  let isPremiumBuyer = false
  let isAdmin = false
  if (user) {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('buyer_tier, role, roles')
      .eq('user_id', user.id)
      .single()
    isPremiumBuyer = userProfile?.buyer_tier === 'premium'
    // Check platform admin via role/roles columns
    isAdmin = userProfile?.role === 'admin' ||
              userProfile?.role === 'platform_admin' ||
              userProfile?.roles?.includes('admin') ||
              userProfile?.roles?.includes('platform_admin') ||
              false

    // Also check if they're a vertical admin for this specific vertical
    if (!isAdmin) {
      const { data: verticalAdmin } = await supabase
        .from('vertical_admins')
        .select('id')
        .eq('user_id', user.id)
        .eq('vertical_id', vertical)
        .single()
      isAdmin = !!verticalAdmin
    }
  }

  // Get vendor profile with rating info and certifications
  // Admins can view any status (using service client to bypass RLS)
  // Regular users can only see approved vendors (RLS enforces this)
  const queryClient = isAdmin ? createServiceClient() : supabase
  let vendorQuery = queryClient
    .from('vendor_profiles')
    .select('*, average_rating, rating_count, certifications')
    .eq('id', vendorId)
    .eq('vertical_id', vertical)

  if (!isAdmin) {
    // RLS already enforces this, but be explicit
    vendorQuery = vendorQuery.eq('status', 'approved')
  }

  const { data: vendor, error } = await vendorQuery.single()

  if (error || !vendor) {
    notFound()
  }

  const vendorStatus = vendor.status as string

  const locale = await getLocale()

  const profileData = vendor.profile_data as Record<string, unknown>
  const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || t('vp.vendor_fallback', locale)
  const vendorTier = (vendor.tier || 'free') as VendorTierType
  const vendorDescription = vendor.description as string | null
  const vendorImageUrl = vendor.profile_image_url as string | null
  const socialLinks = vendor.social_links as Record<string, string> | null
  // Ensure website URLs have a protocol so they don't become relative links
  const websiteUrl = socialLinks?.website
    ? (socialLinks.website.match(/^https?:\/\//) ? socialLinks.website : `https://${socialLinks.website}`)
    : null
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
  const premiumEnabled = isBuyerPremiumEnabled(vertical)

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
    market_type?: 'private_pickup' | 'traditional' | 'event'
    event_start_date?: string | null
    event_end_date?: string | null
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
          expires_at,
          event_start_date,
          event_end_date
        )
      `)
      .in('listing_id', listingIds)

    // Extract unique markets
    const marketsMap = new Map<string, { id: string; name: string; market_type: string }>()
    const pickupLocationsMap = new Map<string, typeof allPickupLocations[0]>()
    const nowIso = new Date().toISOString()
    const todayStr = new Date().toISOString().split('T')[0]
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
          event_start_date?: string | null
          event_end_date?: string | null
        } | null
        // Skip expired markets
        if (market?.expires_at && market.expires_at < nowIso) {
          continue
        }
        // Skip past events
        if (market?.market_type === 'event' && market.event_end_date && market.event_end_date < todayStr) {
          continue
        }
        if (market && !marketsMap.has(market.id)) {
          marketsMap.set(market.id, {
            id: market.id,
            name: market.name,
            market_type: market.market_type
          })
          // Collect ALL pickup locations (both private, traditional, and events)
          pickupLocationsMap.set(market.id, {
            id: market.id,
            name: market.name,
            address: market.address,
            city: market.city,
            state: market.state,
            description: market.description,
            market_type: market.market_type as 'private_pickup' | 'traditional' | 'event',
            event_start_date: market.event_start_date,
            event_end_date: market.event_end_date
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
          vendor_start_time,
          vendor_end_time,
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
                start_time: (vs.vendor_start_time as string) ?? scheduleInfo.start_time,
                end_time: (vs.vendor_end_time as string) ?? scheduleInfo.end_time
              })
            }
          }
        }
      }
    }

    // Convert map to array, sorted by name
    allPickupLocations = Array.from(pickupLocationsMap.values())
      .filter(loc =>
        // Show locations with schedules OR events with date ranges
        (loc.schedules && loc.schedules.length > 0) ||
        (loc.market_type === 'event' && loc.event_start_date)
      )
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
      premium_window_ends_at,
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

  const jsonLd = vendorProfileJsonLd({
    name: vendorName,
    url: `${getAppUrl(vertical)}/${vertical}/vendor/${vendorId}/profile`,
    description: vendorDescription,
    imageUrl: vendorImageUrl,
    averageRating,
    ratingCount,
    socialLinks,
  })

  return (
    <div
      style={{
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        minHeight: '100vh'
      }}
      className="vendor-profile-page"
    >
      {/* Safe: JSON-LD structured data — server-rendered, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Admin Status Banner for non-approved vendors */}
      {isAdmin && vendorStatus !== 'approved' && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: vendorStatus === 'rejected' ? '#fee2e2' : '#fef3c7',
          borderBottom: `2px solid ${vendorStatus === 'rejected' ? '#fca5a5' : '#fcd34d'}`,
          textAlign: 'center'
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <span style={{
              fontWeight: 600,
              color: vendorStatus === 'rejected' ? '#991b1b' : '#92400e'
            }}>
              {t('vp.admin_banner', locale, { status: vendorStatus.toUpperCase() })}
            </span>
            <span style={{
              marginLeft: 12,
              color: vendorStatus === 'rejected' ? '#b91c1c' : '#a16207',
              fontSize: 14
            }}>
              {vendorStatus === 'submitted' && t('vp.status_submitted', locale)}
              {vendorStatus === 'draft' && t('vp.status_draft', locale)}
              {vendorStatus === 'rejected' && t('vp.status_rejected', locale)}
            </span>
          </div>
        </div>
      )}

      {/* Back Link - uses browser history to go back to previous page */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #eee',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BackLink
            fallbackHref={`/${vertical}/browse`}
            fallbackLabel={t('vp.back', locale)}
            style={{
              color: branding.colors.primary,
              fontSize: 14,
              fontWeight: 600
            }}
          />
          <ShareButton
            url={`${getAppUrl(vertical)}/${vertical}/vendor/${vendorId}/profile`}
            title={vendorName}
            text={t('vp.share_text', locale, { vendor: vendorName, brand: branding.brand_name })}
            variant="compact"
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
          {/* MOBILE LAYOUT: Avatar + Stats side by side */}
          <div className="vendor-header-mobile" style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            marginBottom: 16
          }}>
            <VendorAvatar
              imageUrl={vendorImageUrl}
              name={vendorName}
              size={80}
              tier={vendorTier}
            />
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              {/* Compact Rating */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                backgroundColor: ratingCount && ratingCount > 0 ? '#fef3c7' : '#f3f4f6',
                borderRadius: 16,
                width: 'fit-content'
              }}>
                <div style={{ display: 'flex', gap: 1 }}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const rating = averageRating || 0
                    const filled = star <= Math.floor(rating)
                    return (
                      <span key={star} style={{ fontSize: 14, color: filled ? '#f59e0b' : '#d1d5db' }}>★</span>
                    )
                  })}
                </div>
                {ratingCount && ratingCount > 0 ? (
                  <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                    {(averageRating || 0).toFixed(1)} ({ratingCount})
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{t('vp.no_reviews', locale)}</span>
                )}
              </div>
              {/* Verified + Listings compact */}
              <div style={{ fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 8 }}>
                {vendorStatus === 'approved' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t('vp.verified', locale)}</span>
                ) : isAdmin && (
                  <span style={{ color: vendorStatus === 'rejected' ? '#dc2626' : '#d97706' }}>
                    ⏳ {vendorStatus === 'submitted' ? t('vp.pending', locale) : vendorStatus === 'rejected' ? t('vp.rejected', locale) : t('vp.draft', locale)}
                  </span>
                )}
                <span>•</span>
                <span>{(listings?.length || 0) !== 1 ? t('vp.listing_count_plural', locale, { count: String(listings?.length || 0) }) : t('vp.listing_count', locale, { count: '1' })}</span>
              </div>
            </div>
          </div>

          {/* DESKTOP LAYOUT: Traditional side-by-side */}
          <div className="vendor-header-desktop" style={{
            display: 'none',
            gap: 24,
            alignItems: 'flex-start'
          }}>
            <VendorAvatar
              imageUrl={vendorImageUrl}
              name={vendorName}
              size={100}
              tier={vendorTier}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Line 1: Name + tier badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <h1 style={{
                  color: branding.colors.primary,
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 'bold',
                  lineHeight: 1.3
                }}>
                  {vendorName}
                </h1>
                {(vendorTier === 'pro' || vendorTier === 'boss') && (
                  <TierBadge tier={vendorTier} size="lg" />
                )}
              </div>
              {/* Line 2: Event Approved + reviews */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                {vendor.event_approved && (vertical === 'food_trucks' || vertical === 'farmers_market') && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 10px',
                    backgroundColor: 'transparent',
                    color: '#545454',
                    border: '1.5px solid #545454',
                    borderRadius: 16,
                    fontSize: 13,
                    fontWeight: 600,
                  }}>
                    {t('vp.event_approved', locale)}
                  </span>
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
                        ({ratingCount !== 1 ? t('vp.review_count_plural', locale, { count: String(ratingCount) }) : t('vp.review_count', locale, { count: '1' })})
                      </span>
                    </>
                  ) : (
                    <span style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginLeft: 4
                    }}>
                      {t('vp.no_reviews_yet', locale)}
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

              {/* Cover Photo — mobile (capped at 180px tall) */}
              {vendor.cover_image_url && (
                <div style={{ margin: '12px 0', borderRadius: 8, overflow: 'hidden', maxHeight: 180 }}>
                  <Image
                    src={vendor.cover_image_url as string}
                    alt={`${vendorName} cover photo`}
                    width={600}
                    height={180}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                  />
                </div>
              )}

              <div className="vendor-meta" style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                color: '#666',
                fontSize: 14,
                marginTop: 8
              }}>
                {vendorStatus === 'approved' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {t('vp.verified_vendor', locale)}
                  </span>
                ) : isAdmin && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: vendorStatus === 'rejected' ? '#dc2626' : '#d97706'
                  }}>
                    ⏳ {vendorStatus === 'submitted' ? t('vp.pending_approval', locale) : vendorStatus === 'rejected' ? t('vp.rejected', locale) : t('vp.draft', locale)}
                  </span>
                )}
                <span>
                  {(listings?.length || 0) !== 1 ? t('vp.listing_count_plural', locale, { count: String(listings?.length || 0) }) : t('vp.listing_count', locale, { count: '1' })}
                </span>
              </div>

              {/* Social Links - Desktop (compact, secondary to View Menu/Products) */}
              {socialLinks && Object.keys(socialLinks).some(key => socialLinks[key]) && (
                <div style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 12,
                  flexWrap: 'wrap'
                }}>
                  {socialLinks.facebook && (
                    <a
                      href={socialLinks.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '4px 10px',
                        backgroundColor: 'transparent',
                        color: '#1877f2',
                        border: '1px solid #1877f2',
                        textDecoration: 'none',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500
                      }}
                    >
                      {t('vp.facebook', locale)}
                    </a>
                  )}
                  {socialLinks.instagram && (
                    <a
                      href={socialLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '4px 10px',
                        backgroundColor: 'transparent',
                        color: '#e4405f',
                        border: '1px solid #e4405f',
                        textDecoration: 'none',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500
                      }}
                    >
                      {t('vp.instagram', locale)}
                    </a>
                  )}
                  {websiteUrl && (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '4px 10px',
                        backgroundColor: 'transparent',
                        color: '#6b7280',
                        border: '1px solid #6b7280',
                        textDecoration: 'none',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500
                      }}
                    >
                      {t('vp.website', locale)}
                    </a>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* MOBILE CONTENT: Name, Description, Social Links (below the avatar+stats row) */}
          <div className="vendor-content-mobile">
            {/* Name + Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <h1 style={{
                color: branding.colors.primary,
                margin: 0,
                fontSize: 24,
                fontWeight: 'bold',
                lineHeight: 1.3
              }}>
                {vendorName}
              </h1>
              {(vendorTier === 'pro' || vendorTier === 'boss') && (
                <TierBadge tier={vendorTier} size="md" />
              )}
              {vendor.event_approved && (vertical === 'food_trucks' || vertical === 'farmers_market') && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  backgroundColor: 'transparent',
                  color: '#545454',
                  border: '1.5px solid #545454',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  ✓ Event Approved
                </span>
              )}
            </div>

            {/* Description - left aligned */}
            {vendorDescription && (
              <p style={{
                margin: '0 0 12px 0',
                fontSize: 14,
                lineHeight: 1.6,
                color: '#374151',
                textAlign: 'left'
              }}>
                {vendorDescription}
              </p>
            )}

            {/* Cover Photo — desktop (capped at 220px tall) */}
            {vendor.cover_image_url && (
              <div style={{ margin: '0 0 16px 0', borderRadius: 8, overflow: 'hidden', maxHeight: 220 }}>
                <Image
                  src={vendor.cover_image_url as string}
                  alt={`${vendorName} cover photo`}
                  width={600}
                  height={220}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                />
              </div>
            )}

            {/* Social Links - Mobile (compact, outlined) */}
            {socialLinks && Object.keys(socialLinks).some(key => socialLinks[key]) && (
              <div style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap'
              }}>
                {socialLinks.facebook && (
                  <a
                    href={socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'transparent',
                      color: '#1877f2',
                      border: '1px solid #1877f2',
                      textDecoration: 'none',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500
                    }}
                  >
                    {t('vp.facebook', locale)}
                  </a>
                )}
                {socialLinks.instagram && (
                  <a
                    href={socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'transparent',
                      color: '#e4405f',
                      border: '1px solid #e4405f',
                      textDecoration: 'none',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500
                    }}
                  >
                    {t('vp.instagram', locale)}
                  </a>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '4px 10px',
                      backgroundColor: 'transparent',
                      color: '#6b7280',
                      border: '1px solid #6b7280',
                      textDecoration: 'none',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500
                    }}
                  >
                    {t('vp.website', locale)}
                  </a>
                )}
              </div>
            )}
          </div>

          {/* CTAs — View Menu + Event booking */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="#menu"
              style={{
                display: 'inline-block',
                padding: '10px 32px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              {vertical === 'food_trucks' ? 'View Menu' : 'View Products'}
            </a>
          </div>
        </div>

        {/* Vendor Availability Schedule - Calendar Grid */}
        {allPickupLocations.length > 0 && (
          <PickupScheduleGrid locations={allPickupLocations} />
        )}

        {/* Vendor Listings (daily menu/products) — shown first for daily customers */}
        <div>
          <h2 style={{
            color: branding.colors.primary,
            margin: '0 0 20px 0',
            fontSize: 20,
            fontWeight: 600
          }}>
            <span id="menu">{t('vp.listings_from', locale, { vendor: vendorName })}</span>
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
                const isInPremiumWindow = premiumEnabled && premiumWindowEndsAt && premiumWindowEndsAt > now
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
                        {t('vp.premium_early_bird', locale)}
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
                          backgroundColor: colors.primaryLight,
                          color: colors.primaryDark,
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          zIndex: 1
                        }}>
                          {listingCategory}
                        </span>
                      )}

                      {primaryImage?.url ? (
                        <Image
                          src={primaryImage.url}
                          alt={listingTitle}
                          width={280}
                          height={140}
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
                              return market?.market_type === 'private_pickup'
                                ? t('vp.private_pickup', locale, { name: market?.name || t('vp.location_fallback', locale) })
                                : t('vp.market_label', locale, { name: market?.name || t('vp.location_fallback', locale) })
                            })()
                          : t('vp.pickup_locations', locale, { count: String(listingMarkets.length) })
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
              {t('vp.no_products', locale)}
            </div>
          )}
        </div>

        {/* Vendor Details — metadata moved below menu for better conversion flow */}
        <div style={{
          padding: 16,
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          marginBottom: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
        </div>

        {/* Market Boxes / Chef Boxes — below daily menu listings */}
        {hasActiveMarketBoxes && marketBoxes && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              color: branding.colors.primary,
              margin: '0 0 20px 0',
              fontSize: 20,
              fontWeight: 600
            }}>
              📦 {term(vertical, 'market_box', locale)} {t('vp.subscriptions', locale)}
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
                const DAYS = [t('day.0', locale), t('day.1', locale), t('day.2', locale), t('day.3', locale), t('day.4', locale), t('day.5', locale), t('day.6', locale)]
                const boxPremiumWindowEndsAt = box.premium_window_ends_at as string | null
                const boxInPremiumWindow = premiumEnabled && boxPremiumWindowEndsAt && boxPremiumWindowEndsAt > now
                const showBoxPremiumRestriction = boxInPremiumWindow && !isPremiumBuyer

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
                      border: showBoxPremiumRestriction ? '2px solid #3b82f6' : '1px solid #dbeafe',
                      borderRadius: 8,
                      textDecoration: 'none',
                      position: 'relative'
                    }}
                  >
                    {showBoxPremiumRestriction && (
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
                        {t('vp.premium_early_bird', locale)}
                      </div>
                    )}

                    <div style={{ position: 'relative', marginBottom: 12, marginTop: showBoxPremiumRestriction ? 28 : 0 }}>
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
                        📦 {term(vertical, 'market_box', locale)}
                      </span>

                      {boxImageUrls && boxImageUrls.length > 0 ? (
                        <Image
                          src={boxImageUrls[0]}
                          alt={boxName}
                          width={280}
                          height={140}
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

                    <h3 style={{
                      marginBottom: 8,
                      marginTop: 0,
                      color: branding.colors.primary,
                      fontSize: 16,
                      fontWeight: 600
                    }}>
                      {boxName}
                    </h3>

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

                    <div style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 8
                    }}>
                      {DAYS[boxDay]}s at {formatTime(boxStartTime)}
                      {boxMarket && ` • ${boxMarket.name}`}
                    </div>

                    <div style={{
                      fontSize: 18,
                      fontWeight: 'bold',
                      color: branding.colors.primary
                    }}>
                      {formatDisplayPrice(boxPriceCents)}
                      <span style={{ fontSize: 12, fontWeight: 'normal', color: '#6b7280' }}> {t('vp.per_4_weeks', locale)}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Event / Catering — below chef boxes */}
        {vendor.event_approved && (vertical === 'food_trucks' || vertical === 'farmers_market') && (
          <div style={{ marginBottom: 32, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 8px 0' }}>
              Event Catering
            </h3>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px 0' }}>
              This vendor is approved for private events and corporate catering.
            </p>
            <Link
              href={`/${vertical}/events?vendor=${vendorId}`}
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#545454',
                border: '1.5px solid #545454',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Book for Your Event
            </Link>
          </div>
        )}

        {/* Additional Info — payment methods, categories, certifications (at bottom) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          paddingTop: 16,
          borderTop: '1px solid #e5e7eb',
        }}>
          {/* Payment Methods */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 8px 0' }}>
              {t('vp.accepted_payments', locale)}
            </h3>
            <PaymentMethodBadges
              venmoUsername={vendor.venmo_username as string | null}
              cashappCashtag={vendor.cashapp_cashtag as string | null}
              paypalUsername={vendor.paypal_username as string | null}
              acceptsCashAtPickup={vendor.accepts_cash_at_pickup as boolean}
              size="md"
            />
          </div>

          {/* Categories */}
          {(allCategories.length > 0 || hasActiveMarketBoxes) && (
            <div style={{ paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 8px 0' }}>
                {t('vp.listing_categories', locale)}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allCategories.sort().map(category => (
                  <span key={category} style={{
                    padding: '4px 12px',
                    backgroundColor: colors.primaryLight,
                    color: colors.primaryDark,
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {category}
                  </span>
                ))}
                {hasActiveMarketBoxes && (
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: '#dbeafe',
                    color: '#1e40af',
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    📦 {term(vertical, 'market_box', locale)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <div style={{ paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: '0 0 8px 0' }}>
                {t('vp.registrations', locale)}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {certifications.map((cert, index) => {
                  const style = certificationStyles[cert.type] || certificationStyles.other
                  return (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ fontSize: 14 }}>{style.icon}</span>
                      <span style={{ color: style.color, fontWeight: 600 }}>{cert.label}</span>
                      <span style={{ color: '#6b7280' }}>#{cert.registration_number}</span>
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>({cert.state})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        /* Mobile first: show mobile layout, hide desktop */
        .vendor-profile-page .vendor-header-mobile {
          display: flex !important;
        }
        .vendor-profile-page .vendor-header-desktop {
          display: none !important;
        }
        .vendor-profile-page .vendor-content-mobile {
          display: block;
          text-align: left;
        }
        .vendor-profile-page .listings-grid {
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }

        /* Desktop: hide mobile layout, show desktop */
        @media (min-width: 640px) {
          .vendor-profile-page .vendor-header-mobile {
            display: none !important;
          }
          .vendor-profile-page .vendor-header-desktop {
            display: flex !important;
          }
          .vendor-profile-page .vendor-content-mobile {
            display: none;
          }
          .vendor-profile-page .vendor-meta {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  )
}
