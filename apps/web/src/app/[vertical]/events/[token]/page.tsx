import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import { formatDisplayPrice } from '@/lib/constants'
import { spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import EventFeedbackForm from '@/components/events/EventFeedbackForm'

export const dynamic = 'force-dynamic'

interface EventPageProps {
  params: Promise<{ vertical: string; token: string }>
}

export default async function EventPage({ params }: EventPageProps) {
  const { vertical, token } = await params
  const supabase = createServiceClient()

  // Auth check is separate from the data fetch — used only to tell
  // EventFeedbackForm whether to show the rating UI or the login prompt.
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  const isLoggedIn = !!user

  // Fetch event by token
  const { data: event } = await supabase
    .from('catering_requests')
    .select('*')
    .eq('event_token', token)
    .in('status', ['approved', 'ready', 'active', 'review', 'completed'])
    .single()

  if (!event) notFound()

  // Fetch participating vendors (accepted invitations)
  const vendors: Array<{
    id: string
    business_name: string
    description: string | null
    profile_image_url: string | null
    listings: Array<{
      id: string
      title: string
      description: string | null
      price_cents: number
      image_urls: string[] | null
      listing_data: Record<string, unknown> | null
    }>
  }> = []

  if (event.market_id) {
    // Batch approach: avoids N+1 queries and PostgREST FK ambiguity on market_vendors
    // (market_vendors has two FKs to vendor_profiles: vendor_profile_id + replaced_vendor_id)

    // 1. Get accepted vendor IDs (simple query, no embed)
    const { data: marketVendors } = await supabase
      .from('market_vendors')
      .select('vendor_profile_id')
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    const acceptedVendorIds = (marketVendors || []).map(mv => mv.vendor_profile_id as string)

    if (acceptedVendorIds.length > 0) {
      // 2. Batch-fetch vendor profiles
      const { data: profiles } = await supabase
        .from('vendor_profiles')
        .select('id, profile_data, profile_image_url, description')
        .in('id', acceptedVendorIds)
        .eq('status', 'approved')
        .is('deleted_at', null)

      const profileMap = new Map((profiles || []).map(p => [p.id, p]))

      // 3. Batch-fetch event_vendor_listings for this market
      const { data: allEvlRows } = await supabase
        .from('event_vendor_listings')
        .select('vendor_profile_id, listing_id')
        .eq('market_id', event.market_id)
        .in('vendor_profile_id', acceptedVendorIds)

      const allListingIds = [...new Set((allEvlRows || []).map(r => r.listing_id as string))]

      // 4. Batch-fetch all listings in one call
      type ListingRow = { id: string; title: string; description: string | null; price_cents: number; image_urls: string[] | null; listing_data: Record<string, unknown> | null }
      const listingMap = new Map<string, ListingRow>()

      if (allListingIds.length > 0) {
        const { data: listingRows } = await supabase
          .from('listings')
          .select('id, title, description, price_cents, image_urls, listing_data')
          .in('id', allListingIds)
          .eq('status', 'published')
          .is('deleted_at', null)

        for (const l of listingRows || []) {
          listingMap.set(l.id, l as ListingRow)
        }
      }

      // 5. Group listings by vendor
      const vendorListingsMap = new Map<string, ListingRow[]>()
      for (const evl of allEvlRows || []) {
        const vid = evl.vendor_profile_id as string
        const lid = evl.listing_id as string
        const listing = listingMap.get(lid)
        if (!listing) continue
        if (!vendorListingsMap.has(vid)) vendorListingsMap.set(vid, [])
        vendorListingsMap.get(vid)!.push(listing)
      }

      // 6. For vendors with NO event_vendor_listings, fallback to catering-eligible items
      const vendorsNeedingFallback = acceptedVendorIds.filter(id => !vendorListingsMap.has(id) && profileMap.has(id))
      if (vendorsNeedingFallback.length > 0) {
        const { data: fallbackListings } = await supabase
          .from('listings')
          .select('id, title, description, price_cents, image_urls, listing_data, vendor_profile_id')
          .in('vendor_profile_id', vendorsNeedingFallback)
          .eq('status', 'published')
          .is('deleted_at', null)

        for (const l of fallbackListings || []) {
          const ld = l.listing_data as Record<string, unknown> | null
          if (ld?.event_menu_item !== true) continue
          const vid = l.vendor_profile_id as string
          if (!vendorListingsMap.has(vid)) vendorListingsMap.set(vid, [])
          vendorListingsMap.get(vid)!.push(l as ListingRow)
        }
      }

      // 7. Build vendors array
      for (const vendorId of acceptedVendorIds) {
        const vp = profileMap.get(vendorId)
        if (!vp) continue
        const pd = vp.profile_data as Record<string, unknown>
        const vListings = vendorListingsMap.get(vendorId) || []
        vendors.push({
          id: vp.id,
          business_name: (pd?.business_name as string) || (pd?.farm_name as string) || 'Vendor',
          description: vp.description,
          profile_image_url: vp.profile_image_url,
          listings: vListings.map(l => ({
            id: l.id,
            title: l.title,
            description: l.description,
            price_cents: l.price_cents,
            image_urls: l.image_urls,
            listing_data: l.listing_data,
          })),
        })
      }
    }
  }

  const eventDate = event.event_date
    ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const formatTime = (t: string | null) => {
    if (!t) return null
    const [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
  }

  const isCompleted = event.status === 'completed' || event.status === 'review'
  const isOrderable = event.status === 'ready' || event.status === 'active'
  const verticalId = vertical

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Hero */}
      <div style={{
        backgroundColor: '#1a1a1a',
        color: 'white',
        padding: `${spacing.xl} ${spacing.md}`,
      }}>
        <div style={{ maxWidth: containers.md, margin: '0 auto' }}>
          <p style={{ fontSize: typography.sizes.sm, color: '#9ca3af', margin: `0 0 ${spacing.xs}`, textTransform: 'uppercase', letterSpacing: 1 }}>
            {isCompleted ? 'Past Event' : isOrderable ? 'Pre-Orders Open' : 'Upcoming Event'}
          </p>
          <h1 style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold }}>
            {event.company_name}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md, fontSize: typography.sizes.base, color: '#d1d5db' }}>
            {eventDate && <span>{eventDate}</span>}
            {event.event_start_time && event.event_end_time && (
              <span>{formatTime(event.event_start_time)} — {formatTime(event.event_end_time)}</span>
            )}
            {event.headcount && <span>{event.headcount} attendees</span>}
          </div>
          {event.address && (
            <p style={{ margin: `${spacing.sm} 0 0`, fontSize: typography.sizes.sm, color: '#9ca3af' }}>
              {event.address}, {event.city}, {event.state} {event.zip}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: containers.md, margin: '0 auto', padding: `${spacing.lg} ${spacing.md}` }}>

        {/* Pre-order banner */}
        {isOrderable && vendors.length > 0 && (
          <div style={{
            padding: spacing.sm,
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: radius.md,
            marginBottom: spacing.md,
            textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: '#166534' }}>
              Pre-orders are open! Browse menus below and tap any item to order.
            </p>
          </div>
        )}

        {/* Vendors */}
        {vendors.length > 0 ? (
          <>
            <h2 style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold, color: '#111827', margin: `0 0 ${spacing.md}` }}>
              {vendors.length} Vendor{vendors.length !== 1 ? 's' : ''} Confirmed
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {vendors.map(vendor => (
                <div key={vendor.id} style={{
                  backgroundColor: 'white',
                  borderRadius: radius.md,
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden',
                  boxShadow: shadows.sm,
                }}>
                  {/* Vendor Header */}
                  <div style={{ padding: spacing.md, borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                      {vendor.profile_image_url && (
                        <Image
                          src={vendor.profile_image_url}
                          alt={vendor.business_name}
                          width={48}
                          height={48}
                          style={{ borderRadius: '50%', objectFit: 'cover' }}
                        />
                      )}
                      <div>
                        <h3 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: '#111827' }}>
                          {vendor.business_name}
                        </h3>
                        {vendor.description && (
                          <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.sm, color: '#6b7280' }}>
                            {vendor.description.slice(0, 100)}{vendor.description.length > 100 ? '...' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  {vendor.listings.length > 0 ? (
                    <div style={{ padding: spacing.sm }}>
                      {vendor.listings.map(item => {
                        const itemContent = (
                          <div style={{
                            display: 'flex',
                            gap: spacing.sm,
                            padding: spacing.xs,
                            borderBottom: '1px solid #f9fafb',
                          }}>
                            {item.image_urls?.[0] && (
                              <Image
                                src={item.image_urls[0]}
                                alt={item.title}
                                width={64}
                                height={64}
                                style={{ borderRadius: radius.sm, objectFit: 'cover', flexShrink: 0 }}
                              />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <h4 style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.medium, color: '#111827' }}>
                                  {item.title}
                                </h4>
                                <span style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#111827', flexShrink: 0 }}>
                                  {formatDisplayPrice(item.price_cents)}
                                </span>
                              </div>
                              {item.description && (
                                <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: typography.sizes.xs, color: '#6b7280' }}>
                                  {item.description.slice(0, 80)}{item.description.length > 80 ? '...' : ''}
                                </p>
                              )}
                              {!!item.listing_data?.contains_allergens && (
                                <p style={{ margin: `${spacing['3xs']} 0 0`, fontSize: 10, color: '#b45309' }}>
                                  Allergens: {(item.listing_data?.ingredients as string) || 'Contains allergens'}
                                </p>
                              )}
                              {isOrderable && (
                                <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: '#16a34a' }}>
                                  Tap to order →
                                </p>
                              )}
                            </div>
                          </div>
                        )
                        return isOrderable ? (
                          <Link key={item.id} href={`/${verticalId}/events/${token}/shop`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                            {itemContent}
                          </Link>
                        ) : (
                          <div key={item.id}>{itemContent}</div>
                        )
                      })}
                    </div>
                  ) : (
                    <p style={{ padding: spacing.md, color: '#9ca3af', fontStyle: 'italic', margin: 0, fontSize: typography.sizes.sm }}>
                      Menu coming soon
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: spacing.xl }}>
            <h2 style={{ color: '#6b7280', fontSize: typography.sizes.xl, margin: `0 0 ${spacing.xs}` }}>
              Vendors Being Confirmed
            </h2>
            <p style={{ color: '#9ca3af', fontSize: typography.sizes.base, margin: 0 }}>
              We&apos;re coordinating food trucks for this event. Check back soon for the menu!
            </p>
          </div>
        )}

        {/* Feedback Form — shown during active, review, and completed phases */}
        {['active', 'review', 'completed'].includes(event.status) && (
          <div style={{ marginTop: spacing.lg }}>
            <EventFeedbackForm
              eventToken={token}
              isLoggedIn={isLoggedIn}
            />
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: spacing.xl, paddingTop: spacing.md, borderTop: '1px solid #e5e7eb' }}>
          <p style={{ color: '#9ca3af', fontSize: typography.sizes.xs, margin: 0 }}>
            Powered by <Link href="/" style={{ color: '#9ca3af' }}>{verticalId === 'farmers_market' ? 'Farmers Marketing' : "Food Truck'n"}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
