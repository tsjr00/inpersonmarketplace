import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import VendorAvatar from '@/components/shared/VendorAvatar'
import PickupScheduleGrid from '@/components/vendor/PickupScheduleGrid'
import type { Metadata } from 'next'

interface SchedulePageProps {
  params: Promise<{ vertical: string; vendorId: string }>
}

// Generate Open Graph metadata for social sharing
export async function generateMetadata({ params }: SchedulePageProps): Promise<Metadata> {
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
      title: 'Schedule Not Found',
    }
  }

  const profileData = vendor.profile_data as Record<string, unknown>
  const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
  const vendorImageUrl = vendor.profile_image_url as string | null

  const title = `${vendorName} - This Week's Schedule`
  const description = `Find out where to get fresh products from ${vendorName} this week on ${branding.brand_name}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
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

export default async function VendorSchedulePage({ params }: SchedulePageProps) {
  const { vertical, vendorId } = await params
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile
  const { data: vendor, error } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('id', vendorId)
    .eq('vertical_id', vertical)
    .eq('status', 'approved')
    .single()

  if (error || !vendor) {
    notFound()
  }

  const profileData = vendor.profile_data as Record<string, unknown>
  const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Vendor'
  const vendorImageUrl = vendor.profile_image_url as string | null

  // Get vendor's published listings to find active markets
  const { data: listings } = await supabase
    .from('listings')
    .select('id')
    .eq('vendor_profile_id', vendorId)
    .eq('status', 'published')
    .is('deleted_at', null)

  const listingIds = (listings || []).map(l => l.id as string)

  // Build pickup locations with schedules
  let allPickupLocations: {
    id: string
    name: string
    address?: string
    city?: string
    state?: string
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
          expires_at
        )
      `)
      .in('listing_id', listingIds)

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
          expires_at?: string | null
        } | null

        // Skip expired markets
        if (market?.expires_at && market.expires_at < nowIso) {
          continue
        }

        if (market && !pickupLocationsMap.has(market.id)) {
          pickupLocationsMap.set(market.id, {
            id: market.id,
            name: market.name,
            address: market.address,
            city: market.city,
            state: market.state,
            market_type: market.market_type as 'private_pickup' | 'traditional'
          })
        }
      }
    }

    // Fetch schedules for private pickup locations
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

    // Fetch schedules for traditional markets
    const traditionalMarketIds = Array.from(pickupLocationsMap.values())
      .filter(loc => loc.market_type === 'traditional')
      .map(loc => loc.id)

    if (traditionalMarketIds.length > 0) {
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

    // Convert map to array, only locations with schedules
    allPickupLocations = Array.from(pickupLocationsMap.values())
      .filter(loc => loc.schedules && loc.schedules.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  return (
    <div
      style={{
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        minHeight: '100vh'
      }}
    >
      <div style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '24px 16px'
      }}>
        {/* Vendor Header - Compact */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24,
          padding: 16,
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb'
        }}>
          <VendorAvatar
            imageUrl={vendorImageUrl}
            name={vendorName}
            size={60}
          />
          <div style={{ flex: 1 }}>
            <h1 style={{
              color: branding.colors.primary,
              margin: 0,
              fontSize: 24,
              fontWeight: 'bold'
            }}>
              {vendorName}
            </h1>
            <p style={{
              margin: '4px 0 0 0',
              fontSize: 14,
              color: '#6b7280'
            }}>
              Weekly Availability Schedule
            </p>
          </div>
        </div>

        {/* Schedule Grid */}
        {allPickupLocations.length > 0 ? (
          <PickupScheduleGrid locations={allPickupLocations} />
        ) : (
          <div style={{
            padding: 40,
            backgroundColor: 'white',
            borderRadius: 8,
            textAlign: 'center',
            color: '#6b7280',
            border: '1px solid #e5e7eb'
          }}>
            No scheduled pickup times this week.
          </div>
        )}

        {/* Link to Full Profile */}
        <div style={{
          marginTop: 24,
          textAlign: 'center'
        }}>
          <Link
            href={`/${vertical}/vendor/${vendorId}/profile`}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14
            }}
          >
            View Full Profile & Shop
          </Link>
        </div>

        {/* Powered By Footer */}
        <div style={{
          marginTop: 32,
          textAlign: 'center',
          fontSize: 12,
          color: '#9ca3af'
        }}>
          Powered by {branding.brand_name}
        </div>
      </div>
    </div>
  )
}
