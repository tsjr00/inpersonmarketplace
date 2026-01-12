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

  return (
    <div style={{
      backgroundColor: branding.colors.background,
      color: branding.colors.text
    }}>
      {/* Breadcrumb */}
      <div style={{ padding: '20px 40px', borderBottom: '1px solid #eee' }}>
        <Link
          href={`/${vertical}/browse`}
          style={{ color: branding.colors.primary, textDecoration: 'none' }}
        >
          ← Back to Browse
        </Link>
      </div>

      {/* Content */}
      <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 40 }}>
          {/* Main Content */}
          <div>
            {/* Image */}
            <div style={{
              height: 400,
              backgroundColor: '#f0f0f0',
              borderRadius: 8,
              marginBottom: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: 80, color: '#ccc' }}>📦</span>
            </div>

            {/* Description */}
            <div style={{
              padding: 25,
              backgroundColor: 'white',
              borderRadius: 8,
              border: `1px solid ${branding.colors.secondary}`
            }}>
              <h2 style={{
                color: branding.colors.primary,
                marginBottom: 15,
                marginTop: 0,
                fontSize: 24
              }}>
                Description
              </h2>
              <p style={{
                color: '#333',
                lineHeight: 1.8,
                fontSize: 16,
                whiteSpace: 'pre-wrap',
                margin: 0
              }}>
                {listing.description || 'No description provided.'}
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Listing Info Card */}
            <div style={{
              padding: 25,
              backgroundColor: 'white',
              borderRadius: 8,
              border: `1px solid ${branding.colors.secondary}`,
              marginBottom: 20
            }}>
              {/* Category */}
              {listing.category && (
                <span style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  backgroundColor: branding.colors.secondary + '20',
                  color: branding.colors.secondary,
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 15
                }}>
                  {listing.category}
                </span>
              )}

              {/* Title */}
              <h1 style={{
                color: '#333',
                marginBottom: 15,
                marginTop: 0,
                fontSize: 28
              }}>
                {listing.title}
              </h1>

              {/* Price (includes platform fee) */}
              <div style={{
                fontSize: 36,
                fontWeight: 'bold',
                color: branding.colors.primary,
                marginBottom: 20
              }}>
                {formatDisplayPrice(listing.price_cents || 0)}
              </div>

              {/* Availability */}
              <div style={{
                marginBottom: 20,
                padding: 15,
                backgroundColor: '#f8f9fa',
                borderRadius: 6
              }}>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 5 }}>
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
                listingInfo={{
                  title: listing.title,
                  price_cents: listing.price_cents || 0,
                  vendor_name: vendorName,
                }}
                maxQuantity={listing.quantity}
                primaryColor={branding.colors.primary}
              />
            </div>

            {/* Vendor Card */}
            <div style={{
              padding: 25,
              backgroundColor: 'white',
              borderRadius: 8,
              border: `1px solid ${branding.colors.secondary}`
            }}>
              <h3 style={{
                color: branding.colors.primary,
                marginBottom: 15,
                marginTop: 0,
                fontSize: 18
              }}>
                Sold by
              </h3>

              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: '#333'
                }}
              >
                <div style={{
                  fontSize: 20,
                  fontWeight: 600,
                  marginBottom: 10,
                  color: branding.colors.primary
                }}>
                  {vendorName}
                </div>
              </Link>

              <div style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
                Member since {new Date(vendorProfile.created_at as string).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric'
                })}
              </div>

              <Link
                href={`/${vertical}/vendor/${vendorId}/profile`}
                style={{
                  display: 'block',
                  padding: '10px 15px',
                  backgroundColor: branding.colors.secondary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  textAlign: 'center',
                  fontWeight: 600
                }}
              >
                View Vendor Profile
              </Link>
            </div>

            {/* Other Listings from Vendor */}
            {otherListings && otherListings.length > 0 && (
              <div style={{
                padding: 25,
                backgroundColor: 'white',
                borderRadius: 8,
                border: `1px solid ${branding.colors.secondary}`,
                marginTop: 20
              }}>
                <h3 style={{
                  color: branding.colors.primary,
                  marginBottom: 15,
                  marginTop: 0,
                  fontSize: 18
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
                        padding: '10px 15px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: 6,
                        textDecoration: 'none',
                        color: '#333'
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
      </div>
    </div>
  )
}
