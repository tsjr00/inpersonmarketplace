import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import { formatDisplayPrice } from '@/lib/constants'
import { spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'

interface EventPageProps {
  params: Promise<{ token: string }>
}

export default async function EventPage({ params }: EventPageProps) {
  const { token } = await params
  const supabase = createServiceClient()

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
    // Get accepted vendors
    const { data: marketVendors } = await supabase
      .from('market_vendors')
      .select(`
        vendor_profile_id,
        response_status,
        vendor_profiles:vendor_profile_id (
          id,
          profile_data,
          profile_image_url,
          description
        )
      `)
      .eq('market_id', event.market_id)
      .eq('response_status', 'accepted')

    if (marketVendors) {
      for (const mv of marketVendors) {
        const vp = mv.vendor_profiles as unknown as {
          id: string
          profile_data: Record<string, unknown>
          profile_image_url: string | null
          description: string | null
        } | null
        if (!vp) continue

        // Get vendor's event-specific menu (from event_vendor_listings)
        // Falls back to all catering-eligible listings if no selections exist yet
        const { data: eventListings } = await supabase
          .from('event_vendor_listings')
          .select('listing:listings(id, title, description, price_cents, image_urls, listing_data)')
          .eq('market_id', event.market_id)
          .eq('vendor_profile_id', vp.id)

        let listings: Array<{ id: string; title: string; description: string | null; price_cents: number; image_urls: string[] | null; listing_data: Record<string, unknown> | null }> = []

        if (eventListings && eventListings.length > 0) {
          // Use event-specific selections
          listings = eventListings
            .map(el => el.listing as unknown as typeof listings[0])
            .filter(Boolean)
        } else {
          // Fallback: show all catering-eligible published listings
          const { data: allListings } = await supabase
            .from('listings')
            .select('id, title, description, price_cents, image_urls, listing_data')
            .eq('vendor_profile_id', vp.id)
            .eq('status', 'published')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

          listings = (allListings || []).filter(l => {
            const data = l.listing_data as Record<string, unknown> | null
            return data?.event_menu_item === true
          }) as typeof listings
        }

        vendors.push({
          id: vp.id,
          business_name: (vp.profile_data?.business_name as string) || (vp.profile_data?.farm_name as string) || 'Vendor',
          description: vp.description,
          profile_image_url: vp.profile_image_url,
          listings: (listings || []).map(l => ({
            id: l.id,
            title: l.title,
            description: l.description,
            price_cents: l.price_cents,
            image_urls: l.image_urls as string[] | null,
            listing_data: l.listing_data as Record<string, unknown> | null,
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

  const isCompleted = event.status === 'completed'

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
            {isCompleted ? 'Past Event' : 'Upcoming Event'}
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
                      {vendor.listings.map(item => (
                        <div key={item.id} style={{
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
                          </div>
                        </div>
                      ))}
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

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: spacing.xl, paddingTop: spacing.md, borderTop: '1px solid #e5e7eb' }}>
          <p style={{ color: '#9ca3af', fontSize: typography.sizes.xs, margin: 0 }}>
            Powered by <Link href="/" style={{ color: '#9ca3af' }}>Food Truck&apos;n</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
