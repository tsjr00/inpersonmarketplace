import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { getAppUrl } from '@/lib/environment'
import ScheduleDisplay from '@/components/markets/ScheduleDisplay'
import ApplyToMarketButton from './ApplyToMarketButton'
import MarketVendorsList from './MarketVendorsList'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getMapsUrl } from '@/lib/utils/maps-link'
import { term } from '@/lib/vertical'

interface MarketDetailPageProps {
  params: Promise<{ vertical: string; id: string }>
}

interface VendorWithListings {
  vendor_profile_id: string
  business_name: string
  profile_image_url: string | null
  categories: string[]
  listing_count: number
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { vertical, id } = await params
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get market with schedules
  const { data: market, error } = await supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*)
    `)
    .eq('id', id)
    .single()

  if (error || !market) {
    notFound()
  }

  // Fetch vendors with listings from API
  const baseUrl = getAppUrl()
  let vendorsData: { vendors: VendorWithListings[]; categories: string[] } = { vendors: [], categories: [] }

  try {
    const response = await fetch(`${baseUrl}/api/markets/${id}/vendors-with-listings`, {
      cache: 'no-store'
    })
    if (response.ok) {
      const data = await response.json()
      vendorsData = { vendors: data.vendors || [], categories: data.categories || [] }
    }
  } catch {
    // Silently fail - will show empty vendors
  }

  // Get current user's vendor profile for this vertical (for apply button)
  const { data: { user } } = await supabase.auth.getUser()
  let userVendorProfile = null
  let hasApplied = false

  if (user) {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (userProfile) {
      const { data: vendorProfile } = await supabase
        .from('vendor_profiles')
        .select('id, profile_data')
        .eq('user_id', userProfile.id)
        .eq('vertical_id', vertical)
        .single()

      if (vendorProfile) {
        userVendorProfile = vendorProfile

        // Check if already applied
        const { data: existingApplication } = await supabase
          .from('market_vendors')
          .select('id')
          .eq('market_id', id)
          .eq('vendor_profile_id', vendorProfile.id)
          .single()

        hasApplied = !!existingApplication
      }
    }
  }

  const locationParts = [market.address, market.city, market.state, market.zip].filter(Boolean)
  const fullAddress = locationParts.join(', ')

  // Get next market date from schedule
  const getNextMarketDate = () => {
    const schedules = market.market_schedules || []
    if (schedules.length === 0) return null

    const now = new Date()
    const currentDay = now.getDay()

    let nearestDate: Date | null = null

    for (const schedule of schedules) {
      if (!schedule.active) continue

      const scheduleDay = schedule.day_of_week
      let daysUntil = scheduleDay - currentDay
      if (daysUntil < 0) daysUntil += 7
      if (daysUntil === 0) {
        // Check if today's market time has passed
        const [hours, minutes] = (schedule.start_time || '00:00').split(':').map(Number)
        const marketTime = new Date(now)
        marketTime.setHours(hours, minutes, 0, 0)
        if (now > marketTime) daysUntil = 7
      }

      const nextDate = new Date(now)
      nextDate.setDate(now.getDate() + daysUntil)

      if (!nearestDate || nextDate < nearestDate) {
        nearestDate = nextDate
      }
    }

    return nearestDate
  }

  const nextMarketDate = getNextMarketDate()

  return (
    <div
      style={{
        backgroundColor: colors.surfaceBase,
        minHeight: '100vh'
      }}
      className="market-profile-page"
    >
      {/* Back Link */}
      <div style={{
        padding: spacing.sm,
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
          <Link
            href={`/${vertical}/markets`}
            style={{
              color: branding.colors.primary,
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing['2xs'],
              minHeight: 44,
              padding: `${spacing.xs} 0`
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Markets
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Market Header Card */}
        <div style={{
          padding: spacing.sm,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          border: `1px solid ${colors.border}`,
          marginBottom: spacing.md,
          boxShadow: shadows.sm
        }}>
          {/* Icon + Name on same line */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            marginBottom: spacing.xs,
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{term(vertical, 'market_icon_emoji')}</span>
            <h1 style={{
              color: branding.colors.primary,
              margin: 0,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.bold,
              lineHeight: 1.3
            }}>
              {market.name}
            </h1>
            {/* Apply button for vendors */}
            {userVendorProfile && !hasApplied && (
              <div style={{ marginLeft: 'auto' }}>
                <ApplyToMarketButton
                  marketId={id}
                  vendorProfileId={userVendorProfile.id}
                />
              </div>
            )}
            {hasApplied && (
              <span style={{
                marginLeft: 'auto',
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.primaryLight,
                color: colors.primaryDark,
                borderRadius: radius.md,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.medium,
              }}>
                Applied
              </span>
            )}
          </div>

          {/* Description */}
          {market.description && (
            <p style={{
              margin: `0 0 ${spacing.xs} 0`,
              fontSize: typography.sizes.base,
              lineHeight: typography.leading.relaxed,
              color: colors.textSecondary
            }}>
              {market.description}
            </p>
          )}

          {/* Location */}
          {fullAddress && (
            <div style={{
              paddingTop: spacing.xs,
              paddingBottom: spacing.xs,
              borderTop: `1px solid ${colors.borderMuted}`,
              borderBottom: `1px solid ${colors.borderMuted}`
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.xs
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <a
                  href={getMapsUrl(market.address, market.city, market.state, market.zip)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: typography.sizes.base, color: colors.textPrimary, textDecoration: 'none' }}
                >
                  {fullAddress}
                </a>
              </div>
            </div>
          )}

          {/* Vendor count + Next date on one line */}
          <div style={{
            display: 'flex',
            gap: spacing.md,
            flexWrap: 'wrap',
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            marginTop: spacing.xs
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
              👥 {vendorsData.vendors.length} vendor{vendorsData.vendors.length !== 1 ? 's' : ''}
            </span>
            {nextMarketDate && (
              <span style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                📅 Next: {nextMarketDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            )}
          </div>

          {/* Schedule */}
          {market.market_schedules && market.market_schedules.length > 0 && (
            <div style={{
              marginTop: spacing.sm,
              paddingTop: spacing.xs,
              borderTop: `1px solid ${colors.borderMuted}`
            }}>
              <h3 style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: colors.textSecondary,
                margin: `0 0 ${spacing['2xs']} 0`
              }}>
                {term(vertical, 'market_hours')}
              </h3>
              <ScheduleDisplay schedules={market.market_schedules} grid />
            </div>
          )}

          {/* Season Dates */}
          {(market.season_start || market.season_end) && (
            <div style={{
              marginTop: spacing.xs,
              paddingTop: spacing.xs,
              borderTop: `1px solid ${colors.borderMuted}`
            }}>
              <h3 style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: colors.textSecondary,
                margin: `0 0 ${spacing['2xs']} 0`
              }}>
                Season
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                fontSize: typography.sizes.base,
                color: colors.textPrimary
              }}>
                <span>🗓️</span>
                <span>
                  {market.season_start && market.season_end ? (
                    <>
                      {new Date(market.season_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                      {' '}&ndash;{' '}
                      {new Date(market.season_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                    </>
                  ) : market.season_start ? (
                    <>Opens {new Date(market.season_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</>
                  ) : (
                    <>Closes {new Date(market.season_end + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Contact */}
          {(market.contact_email || market.contact_phone) && (
            <div style={{
              marginTop: spacing.xs,
              paddingTop: spacing.xs,
              borderTop: `1px solid ${colors.borderMuted}`,
              display: 'flex',
              gap: spacing.md,
              flexWrap: 'wrap'
            }}>
              {market.contact_email && (
                <a
                  href={`mailto:${market.contact_email}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['2xs'],
                    color: colors.primary,
                    fontSize: typography.sizes.sm,
                    textDecoration: 'none'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  {market.contact_email}
                </a>
              )}
              {market.contact_phone && (
                <a
                  href={`tel:${market.contact_phone}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['2xs'],
                    color: colors.primary,
                    fontSize: typography.sizes.sm,
                    textDecoration: 'none'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {market.contact_phone}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Legal Disclaimer */}
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#f5f5f5',
          borderRadius: radius.md,
          border: '1px solid #e0e0e0',
          marginBottom: spacing.md
        }}>
          <p style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            textAlign: 'center',
            lineHeight: typography.leading.relaxed
          }}>
            {vertical === 'food_trucks'
              ? `This location is listed as a pickup spot by the food trucks shown below. This platform is not affiliated with the ${term(vertical, 'traditional_market').toLowerCase()} management or property owners.`
              : 'This market is listed as a pickup location by the vendors shown below. This platform is not affiliated with the market management.'
            }
          </p>
        </div>

        {/* Vendors Section */}
        <div style={{
          padding: spacing.lg,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm
        }}>
          <h2 style={{
            color: branding.colors.primary,
            margin: `0 0 ${spacing.md} 0`,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold
          }}>
            {term(vertical, 'vendors')} at {market.name}
          </h2>

          <MarketVendorsList
            vendors={vendorsData.vendors}
            categories={vendorsData.categories}
            vertical={vertical}
          />
        </div>
      </div>

      {/* Responsive Styles - placeholder for future breakpoints */}
      <style>{``}</style>
    </div>
  )
}
