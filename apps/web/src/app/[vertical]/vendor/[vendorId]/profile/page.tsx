import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'

interface VendorProfilePageProps {
  params: Promise<{ vertical: string; vendorId: string }>
}

export default async function VendorProfilePage({ params }: VendorProfilePageProps) {
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
  const vendorType = (profileData?.vendor_type as string) || (profileData?.business_type as string) || null

  // Get vendor's published listings
  const { data: listings } = await supabase
    .from('listings')
    .select('*')
    .eq('vendor_profile_id', vendorId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Check auth for header
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text
    }}>
      {/* Navigation */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 40px',
        borderBottom: `1px solid ${branding.colors.secondary}`,
        backgroundColor: branding.colors.background
      }}>
        <Link
          href={`/${vertical}`}
          style={{
            fontSize: 24,
            fontWeight: 'bold',
            color: branding.colors.primary,
            textDecoration: 'none'
          }}
        >
          {branding.brand_name}
        </Link>

        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: branding.colors.text,
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            Browse
          </Link>
          {user ? (
            <Link
              href={`/${vertical}/dashboard`}
              style={{
                padding: '8px 16px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600
              }}
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href={`/${vertical}/signup`}
              style={{
                padding: '8px 16px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600
              }}
            >
              Sign Up
            </Link>
          )}
        </div>
      </nav>

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
        {/* Vendor Header */}
        <div style={{
          padding: 30,
          backgroundColor: 'white',
          borderRadius: 8,
          border: `1px solid ${branding.colors.secondary}`,
          marginBottom: 30
        }}>
          <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
            {/* Vendor Avatar Placeholder */}
            <div style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              backgroundColor: branding.colors.primary + '20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              color: branding.colors.primary
            }}>
              {vendorName.charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{
                color: branding.colors.primary,
                marginBottom: 10,
                marginTop: 0,
                fontSize: 32
              }}>
                {vendorName}
              </h1>

              <div style={{
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
                color: '#666'
              }}>
                <span>
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
            </div>
          </div>

          {/* Business Info */}
          {vendorType && (
            <div style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #eee'
            }}>
              <span style={{
                padding: '4px 10px',
                backgroundColor: branding.colors.secondary + '20',
                color: branding.colors.secondary,
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 600
              }}>
                {vendorType}
              </span>
            </div>
          )}
        </div>

        {/* Vendor Listings */}
        <div>
          <h2 style={{
            color: branding.colors.primary,
            marginBottom: 20,
            fontSize: 24
          }}>
            Listings from {vendorName}
          </h2>

          {listings && listings.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 25
            }}>
              {listings.map((listing) => {
                const listingId = listing.id as string
                const listingTitle = listing.title as string
                const listingCategory = listing.category as string | null
                const listingPrice = ((listing.price_cents as number) || 0) / 100

                return (
                  <Link
                    key={listingId}
                    href={`/${vertical}/listing/${listingId}`}
                    style={{
                      display: 'block',
                      padding: 20,
                      backgroundColor: 'white',
                      color: '#333',
                      border: `1px solid ${branding.colors.secondary}`,
                      borderRadius: 8,
                      textDecoration: 'none'
                    }}
                  >
                    {/* Image Placeholder */}
                    <div style={{
                      height: 150,
                      backgroundColor: '#f0f0f0',
                      borderRadius: 6,
                      marginBottom: 15,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: 40, color: '#ccc' }}>📦</span>
                    </div>

                    {/* Category */}
                    {listingCategory && (
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        backgroundColor: branding.colors.secondary + '20',
                        color: branding.colors.secondary,
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        marginBottom: 10
                      }}>
                        {listingCategory}
                      </span>
                    )}

                    {/* Title */}
                    <h3 style={{
                      marginBottom: 8,
                      marginTop: 0,
                      color: branding.colors.primary,
                      fontSize: 18
                    }}>
                      {listingTitle}
                    </h3>

                    {/* Price */}
                    <div style={{
                      fontSize: 22,
                      fontWeight: 'bold',
                      color: branding.colors.primary
                    }}>
                      ${listingPrice.toFixed(2)}
                    </div>
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
    </div>
  )
}
