import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ScheduleDisplay from '@/components/markets/ScheduleDisplay'
import ApplyToMarketButton from './ApplyToMarketButton'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface MarketDetailPageProps {
  params: Promise<{ vertical: string; id: string }>
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { vertical, id } = await params
  const supabase = await createClient()

  // Get market with schedules and approved vendors
  const { data: market, error } = await supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*),
      market_vendors(
        id,
        vendor_profile_id,
        approved,
        booth_number,
        vendor_profiles(
          id,
          profile_data,
          status
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !market) {
    notFound()
  }

  // Get current user's vendor profile for this vertical (if any)
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
        hasApplied = market.market_vendors?.some(
          (mv: { vendor_profile_id: string }) => mv.vendor_profile_id === vendorProfile.id
        )
      }
    }
  }

  // Transform vendors
  const approvedVendors = market.market_vendors
    ?.filter((mv: { approved: boolean }) => mv.approved)
    .map((mv: {
      id: string
      vendor_profile_id: string
      booth_number: string | null
      vendor_profiles: { id: string; profile_data: Record<string, unknown> } | null
    }) => ({
      id: mv.id,
      vendor_profile_id: mv.vendor_profile_id,
      booth_number: mv.booth_number,
      business_name: mv.vendor_profiles?.profile_data?.business_name ||
                     mv.vendor_profiles?.profile_data?.farm_name ||
                     'Unknown',
    }))

  const locationParts = [market.address, market.city, market.state, market.zip].filter(Boolean)
  const fullAddress = locationParts.join(', ')

  return (
    <div style={{
      maxWidth: containers.xl,
      margin: '0 auto',
      padding: spacing.sm,
      backgroundColor: colors.surfaceBase,
      minHeight: '100vh'
    }}>
      {/* Back link */}
      <Link
        href={`/${vertical}/markets`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing['3xs'],
          color: colors.primary,
          textDecoration: 'none',
          fontSize: typography.sizes.sm,
          marginBottom: spacing.sm,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Markets
      </Link>

      {/* Header */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        boxShadow: shadows.md,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: typography.sizes['2xl'],
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary
            }}>
              {market.name}
            </h1>
            <span
              style={{
                display: 'inline-block',
                marginTop: spacing['2xs'],
                padding: `${spacing['3xs']} ${spacing.xs}`,
                borderRadius: radius.full,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                backgroundColor: market.type === 'traditional' ? colors.primaryLight : colors.surfaceSubtle,
                color: market.type === 'traditional' ? colors.primaryDark : colors.accent,
              }}
            >
              {market.type === 'traditional' ? 'Farmers Market' : 'Private Pickup'}
            </span>
          </div>

          {/* Apply button for vendors */}
          {userVendorProfile && !hasApplied && (
            <ApplyToMarketButton
              marketId={id}
              vendorProfileId={userVendorProfile.id}
            />
          )}
          {hasApplied && (
            <span style={{
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

        {market.description && (
          <p style={{
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.base,
            color: colors.textSecondary,
            lineHeight: typography.leading.relaxed
          }}>
            {market.description}
          </p>
        )}

        {/* Location */}
        {fullAddress && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.sm }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" style={{ marginTop: 2 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <div style={{ fontSize: typography.sizes.base, color: colors.textPrimary }}>{fullAddress}</div>
            </div>
          </div>
        )}

        {/* Contact */}
        {(market.contact_email || market.contact_phone) && (
          <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
            {market.contact_email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <a href={`mailto:${market.contact_email}`} style={{ color: colors.primary, fontSize: typography.sizes.sm }}>
                  {market.contact_email}
                </a>
              </div>
            )}
            {market.contact_phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <a href={`tel:${market.contact_phone}`} style={{ color: colors.primary, fontSize: typography.sizes.sm }}>
                  {market.contact_phone}
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule section (for traditional markets) */}
      {market.type === 'traditional' && (
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.lg,
          padding: spacing.md,
          marginBottom: spacing.sm,
          boxShadow: shadows.md,
        }}>
          <h2 style={{
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary
          }}>
            Market Hours
          </h2>
          <ScheduleDisplay schedules={market.market_schedules || []} />
        </div>
      )}

      {/* Vendors section */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: radius.lg,
        padding: spacing.md,
        boxShadow: shadows.md,
      }}>
        <h2 style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary
        }}>
          Vendors ({approvedVendors?.length || 0})
        </h2>

        {approvedVendors && approvedVendors.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            {approvedVendors.map((vendor: {
              id: string
              vendor_profile_id: string
              booth_number: string | null
              business_name: string
            }) => (
              <div
                key={vendor.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md,
                }}
              >
                <span style={{ fontWeight: typography.weights.medium, color: colors.textPrimary }}>
                  {vendor.business_name}
                </span>
                {vendor.booth_number && (
                  <span style={{
                    padding: `${spacing['3xs']} ${spacing.xs}`,
                    backgroundColor: colors.primaryLight,
                    color: colors.primaryDark,
                    borderRadius: radius.sm,
                    fontSize: typography.sizes.xs,
                    fontWeight: typography.weights.medium,
                  }}>
                    Booth {vendor.booth_number}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: colors.textSecondary, margin: 0 }}>
            No vendors at this market yet.
          </p>
        )}
      </div>
    </div>
  )
}
