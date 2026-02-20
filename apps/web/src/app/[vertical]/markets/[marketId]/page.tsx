import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import BackLink from '@/components/shared/BackLink'
import VendorAvatar from '@/components/shared/VendorAvatar'
import { getMapsUrl } from '@/lib/utils/maps-link'

interface MarketDetailPageProps {
  params: Promise<{ vertical: string; marketId: string }>
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { vertical, marketId } = await params
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Fetch market details
  const { data: market } = await supabase
    .from('markets')
    .select(`
      *,
      market_schedules (
        id,
        day_of_week,
        start_time,
        end_time,
        active
      )
    `)
    .eq('id', marketId)
    .eq('vertical_id', vertical)
    .single()

  if (!market) {
    notFound()
  }

  const isEvent = market.market_type === 'event'
  const eventStartDate = market.event_start_date as string | null
  const eventEndDate = market.event_end_date as string | null
  const eventUrl = market.event_url as string | null

  // For events, check if it's a past event
  if (isEvent && eventEndDate) {
    const todayStr = new Date().toISOString().split('T')[0]
    if (eventEndDate < todayStr) {
      // Past event — still show but with a banner
    }
  }

  // Fetch attending vendors (from vendor_market_schedules)
  const { data: vendorSchedules } = await supabase
    .from('vendor_market_schedules')
    .select(`
      vendor_profile_id,
      is_active,
      vendor_start_time,
      vendor_end_time,
      vendor_profiles (
        id,
        profile_data,
        profile_image_url,
        description
      )
    `)
    .eq('market_id', marketId)
    .eq('is_active', true)

  // Get unique vendors
  const vendorsMap = new Map<string, {
    id: string
    name: string
    imageUrl: string | null
    description: string | null
  }>()

  if (vendorSchedules) {
    for (const vs of vendorSchedules) {
      const vendor = vs.vendor_profiles as unknown as {
        id: string
        profile_data: { business_name?: string } | null
        profile_image_url: string | null
        description: string | null
      } | null
      if (vendor && !vendorsMap.has(vendor.id)) {
        vendorsMap.set(vendor.id, {
          id: vendor.id,
          name: vendor.profile_data?.business_name || 'Vendor',
          imageUrl: vendor.profile_image_url,
          description: vendor.description
        })
      }
    }
  }
  const vendors = Array.from(vendorsMap.values())

  // Format helpers
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const address = [market.address, market.city, market.state].filter(Boolean).join(', ')
  const activeSchedules = (market.market_schedules || []).filter((s: { active: boolean }) => s.active)

  return (
    <div style={{
      backgroundColor: colors.surfaceBase,
      minHeight: '100vh'
    }}>
      {/* Back navigation */}
      <div style={{
        padding: `${spacing.xs} ${spacing.sm}`,
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <BackLink
            fallbackHref={`/${vertical}/markets`}
            fallbackLabel={`Back to ${term(vertical, 'traditional_markets')}`}
            style={{ color: branding.colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}
          />
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: `${spacing.md} ${spacing.sm}` }}>
        {/* Event badge */}
        {isEvent && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing['3xs'],
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: '#fef3c7',
            color: '#92400e',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            marginBottom: spacing.sm
          }}>
            🎪 {term(vertical, 'event')}
          </div>
        )}

        {/* Market/Event name */}
        <h1 style={{
          color: branding.colors.primary,
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold
        }}>
          {market.name}
        </h1>

        {/* Event dates */}
        {isEvent && eventStartDate && eventEndDate && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            marginBottom: spacing.sm,
            padding: spacing.sm,
            backgroundColor: '#fef3c7',
            borderRadius: radius.md,
            border: '1px solid #fde68a'
          }}>
            <span style={{ fontSize: 20 }}>📅</span>
            <div>
              <div style={{
                fontWeight: typography.weights.semibold,
                color: '#92400e',
                fontSize: typography.sizes.base
              }}>
                {formatDate(eventStartDate)}
                {eventStartDate !== eventEndDate && ` – ${formatDate(eventEndDate)}`}
              </div>
              {eventUrl && (
                <a
                  href={eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: branding.colors.primary,
                    fontSize: typography.sizes.sm,
                    textDecoration: 'underline'
                  }}
                >
                  Event website
                </a>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {market.description && (
          <p style={{
            margin: `0 0 ${spacing.md} 0`,
            fontSize: typography.sizes.base,
            color: colors.textSecondary,
            lineHeight: typography.leading.relaxed
          }}>
            {market.description}
          </p>
        )}

        {/* Location */}
        {address && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.xs,
            marginBottom: spacing.md,
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`
          }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div>
              <div style={{
                fontWeight: typography.weights.semibold,
                color: colors.textPrimary,
                fontSize: typography.sizes.sm,
                marginBottom: spacing['3xs']
              }}>
                Location
              </div>
              <a
                href={getMapsUrl(market.address, market.city, market.state)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: branding.colors.primary,
                  fontSize: typography.sizes.sm,
                  textDecoration: 'underline'
                }}
              >
                {address}
              </a>
            </div>
          </div>
        )}

        {/* Schedule */}
        {activeSchedules.length > 0 && (
          <div style={{
            marginBottom: spacing.md,
            padding: spacing.sm,
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`
          }}>
            <div style={{
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
              fontSize: typography.sizes.sm,
              marginBottom: spacing.xs
            }}>
              {isEvent ? 'Event Hours' : 'Schedule'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
              {activeSchedules
                .sort((a: { day_of_week: number }, b: { day_of_week: number }) => a.day_of_week - b.day_of_week)
                .map((s: { id: string; day_of_week: number; start_time: string; end_time: string }) => (
                  <div key={s.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: typography.sizes.sm,
                    color: colors.textSecondary
                  }}>
                    <span style={{ fontWeight: typography.weights.medium }}>
                      {DAYS[s.day_of_week]}
                    </span>
                    <span>{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Attending Vendors */}
        <div style={{ marginBottom: spacing.md }}>
          <h2 style={{
            color: branding.colors.primary,
            margin: `0 0 ${spacing.sm} 0`,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold
          }}>
            {isEvent ? `${term(vertical, 'vendors')} at This Event` : `${term(vertical, 'vendors')}`}
            {vendors.length > 0 && (
              <span style={{ fontWeight: typography.weights.normal, fontSize: typography.sizes.sm, color: colors.textMuted, marginLeft: spacing.xs }}>
                ({vendors.length})
              </span>
            )}
          </h2>

          {vendors.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: spacing.sm
            }}>
              {vendors.map(vendor => (
                <Link
                  key={vendor.id}
                  href={`/${vertical}/vendor/${vendor.id}/profile`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div style={{
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.md,
                    border: `1px solid ${colors.border}`,
                    padding: spacing.sm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.sm,
                    transition: 'box-shadow 0.2s',
                    cursor: 'pointer'
                  }}>
                    <VendorAvatar
                      imageUrl={vendor.imageUrl}
                      name={vendor.name}
                      size={48}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: typography.weights.semibold,
                        color: colors.textPrimary,
                        fontSize: typography.sizes.sm,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {vendor.name}
                      </div>
                      {vendor.description && (
                        <div style={{
                          fontSize: typography.sizes.xs,
                          color: colors.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {vendor.description}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{
              padding: spacing.lg,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              textAlign: 'center',
              color: colors.textMuted,
              border: `1px solid ${colors.border}`
            }}>
              No {term(vertical, 'vendors').toLowerCase()} have confirmed attendance yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
