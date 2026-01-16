import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { formatDisplayPrice } from '@/lib/constants'

interface ListingDetailPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { vertical, listingId } = await params
  const supabase = await createClient()

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get listing with vendor info
  const { data: listing, error } = await supabase
    .from('listings')
    .select(`
      *,
      vendor_profiles!inner (
        id,
        profile_data,
        status,
        created_at
      )
    `)
    .eq('id', listingId)
    .eq('status', 'published')
    .eq('vendor_profiles.status', 'approved')
    .is('deleted_at', null)
    .single()

  if (error || !listing) {
    notFound()
  }

  const vendorProfile = listing.vendor_profiles as Record<string, unknown>
  const vendorData = vendorProfile?.profile_data as Record<string, unknown>
  const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Vendor'
  const vendorId = vendorProfile?.id as string

  // Get other listings from same vendor
  const { data: otherListings } = await supabase
    .from('listings')
    .select('id, title, price_cents')
    .eq('vendor_profile_id', listing.vendor_profile_id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .neq('id', listingId)
    .limit(4)

  // Get markets where this listing is available
  const { data: listingMarkets } = await supabase
    .rpc('get_listing_markets_summary', {
      p_listing_id: listingId
    })

  // Check if user is logged in (for private pickup address visibility)
  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  return (
    <div
      style={{
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        minHeight: '100vh'
      }}
      className="listing-detail-page"
    >
      {/* Back Link */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #eee',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: branding.colors.primary,
              textDecoration: 'none',
              fontSize: 14,
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              padding: '8px 0'
            }}
          >
            ← Back to Browse
          </Link>
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px'
      }}>
        {/* Main Content - single col mobile, two col desktop */}
        <div className="main-grid" style={{
          display: 'grid',
          gap: 24
        }}>
          {/* Left: Image */}
          <div>
            <div style={{
              aspectRatio: '1',
              backgroundColor: '#f3f4f6',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxHeight: 500
            }}>
              <span style={{ fontSize: 80, color: '#ccc' }}>📦</span>
            </div>
          </div>

          {/* Right: Details */}
          <div>
            {/* Listing Info Card */}
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              marginBottom: 20
            }}>
              {/* Category */}
              {listing.category && (
                <span style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  backgroundColor: '#d1fae5',
                  color: '#065f46',
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 12
                }}>
                  {listing.category}
                </span>
              )}

              {/* Title */}
              <h1 style={{
                color: '#333',
                margin: '0 0 12px 0',
                fontSize: 24,
                lineHeight: 1.3
              }}>
                {listing.title}
              </h1>

              {/* Price (includes platform fee) */}
              <div style={{
                fontSize: 32,
                fontWeight: 'bold',
                color: branding.colors.primary,
                marginBottom: 20
              }}>
                {formatDisplayPrice(listing.price_cents || 0)}
              </div>

              {/* Availability */}
              <div style={{
                marginBottom: 20,
                padding: 16,
                backgroundColor: '#f9fafb',
                borderRadius: 8
              }}>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>
                  Availability
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>
                  {listing.quantity === null
                    ? 'In Stock'
                    : listing.quantity > 0
                      ? `${listing.quantity} available`
                      : 'Sold Out'
                  }
                </div>
              </div>

              {/* Add to Cart */}
              <AddToCartButton
                listingId={listingId}
                maxQuantity={listing.quantity}
                primaryColor={branding.colors.primary}
              />

              {/* Available At - Markets */}
              {listingMarkets && listingMarkets.length > 0 && (
                <div style={{
                  marginTop: 20,
                  padding: 16,
                  backgroundColor: '#f9fafb',
                  borderRadius: 8
                }}>
                  <h3 style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 12,
                    marginTop: 0,
                    color: '#374151'
                  }}>
                    Available At
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {listingMarkets.map((market: {
                      market_id: string
                      market_name: string
                      market_type: string
                      address: string
                      city: string
                      state: string
                      day_of_week: number | null
                      start_time: string | null
                      end_time: string | null
                    }) => {
                      const isPrivate = market.market_type === 'private'
                      const prefix = isPrivate ? 'Private Pickup: ' : 'Market: '
                      // Only show private pickup address if user is logged in
                      const showAddress = !isPrivate || isLoggedIn

                      return (
                        <div key={market.market_id} style={{ fontSize: 14 }}>
                          <div style={{ fontWeight: 600, color: '#333' }}>
                            <span style={{ color: '#6b7280', fontWeight: 500 }}>{prefix}</span>
                            {market.market_name}
                          </div>
                          {showAddress ? (
                            <div style={{ color: '#6b7280', fontSize: 13 }}>
                              {market.address}, {market.city}, {market.state}
                            </div>
                          ) : (
                            <div style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>
                              <Link href={`/${vertical}/login`} style={{ color: branding.colors.primary, textDecoration: 'none' }}>
                                Log in
                              </Link>
                              {' '}to see pickup address
                            </div>
                          )}
                          {market.market_type === 'traditional' && market.day_of_week !== null && (
                            <div style={{ color: '#6b7280', fontSize: 12 }}>
                              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][market.day_of_week]}
                              {market.start_time && market.end_time && ` ${market.start_time} - ${market.end_time}`}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Vendor Card */}
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                color: branding.colors.primary,
                margin: '0 0 12px 0',
                fontSize: 16,
                fontWeight: 600
              }}>
                Sold by
              </h3>

              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  textDecoration: 'none',
                  color: '#333'
                }}
              >
                <div style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginBottom: 8,
                  color: branding.colors.primary
                }}>
                  {vendorName}
                </div>
              </Link>

              <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
                Member since {new Date(vendorProfile.created_at as string).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric'
                })}
              </div>

              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 16px',
                  backgroundColor: branding.colors.secondary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  minHeight: 44
                }}
              >
                View Vendor Profile
              </Link>
            </div>
          </div>
        </div>

        {/* Description & More from Vendor - stack below on mobile */}
        <div className="bottom-grid" style={{
          display: 'grid',
          gap: 24,
          marginTop: 24
        }}>
          {/* Description */}
          <div style={{
            padding: 20,
            backgroundColor: 'white',
            borderRadius: 8,
            border: '1px solid #e5e7eb'
          }}>
            <h2 style={{
              color: branding.colors.primary,
              margin: '0 0 12px 0',
              fontSize: 18,
              fontWeight: 600
            }}>
              Description
            </h2>
            <p style={{
              color: '#333',
              lineHeight: 1.7,
              fontSize: 15,
              whiteSpace: 'pre-wrap',
              margin: 0
            }}>
              {listing.description || 'No description provided.'}
            </p>

            {/* Allergen Warning */}
            {listing.listing_data?.contains_allergens && (
              <div style={{
                marginTop: 20,
                padding: 16,
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: 8
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8
                }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <strong style={{ color: '#92400e' }}>Allergen Warning</strong>
                </div>
                <p style={{
                  margin: 0,
                  color: '#78350f',
                  fontSize: 14,
                  lineHeight: 1.5
                }}>
                  {listing.listing_data?.ingredients || 'This product may contain allergens. Contact the vendor for details.'}
                </p>
              </div>
            )}
          </div>

          {/* Other Listings from Vendor */}
          {otherListings && otherListings.length > 0 && (
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                color: branding.colors.primary,
                margin: '0 0 16px 0',
                fontSize: 16,
                fontWeight: 600
              }}>
                More from {vendorName}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {otherListings.map((item: Record<string, unknown>) => (
                  <Link
                    key={item.id as string}
                    href={`/${vertical}/listing/${item.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      backgroundColor: '#f9fafb',
                      borderRadius: 6,
                      textDecoration: 'none',
                      color: '#333',
                      minHeight: 44
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{item.title as string}</span>
                    <span style={{
                      fontWeight: 600,
                      color: branding.colors.primary
                    }}>
                      {formatDisplayPrice((item.price_cents as number) || 0)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .listing-detail-page .main-grid {
          grid-template-columns: 1fr;
        }
        .listing-detail-page .bottom-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 768px) {
          .listing-detail-page .main-grid {
            grid-template-columns: 1fr 400px;
          }
          .listing-detail-page .bottom-grid {
            grid-template-columns: 1fr 400px;
          }
        }
      `}</style>
    </div>
  )
}
