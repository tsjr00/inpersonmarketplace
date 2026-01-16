import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import { formatDisplayPrice, VendorTierType } from '@/lib/constants'
import VendorAvatar from '@/components/shared/VendorAvatar'
import TierBadge from '@/components/shared/TierBadge'

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
  const vendorTier = (vendor.tier || 'standard') as VendorTierType
  const vendorDescription = vendor.description as string | null
  const vendorImageUrl = vendor.profile_image_url as string | null
  const socialLinks = vendor.social_links as Record<string, string> | null

  // Get vendor_type from profile (could be array or string)
  const profileTypes = profileData?.vendor_type
  const profileCategories: string[] = profileTypes
    ? (Array.isArray(profileTypes) ? profileTypes as string[] : [profileTypes as string])
    : []

  // Get vendor's published listings
  const { data: listings } = await supabase
    .from('listings')
    .select('*')
    .eq('vendor_profile_id', vendorId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Get all unique categories from vendor's listings
  const listingCategories = [...new Set(
    (listings || [])
      .map(l => l.category as string | null)
      .filter((c): c is string => c !== null)
  )]

  // Combine profile categories and listing categories (unique)
  const allCategories = [...new Set([...profileCategories, ...listingCategories])]

  return (
    <div
      style={{
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        minHeight: '100vh'
      }}
      className="vendor-profile-page"
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
        {/* Vendor Header */}
        <div style={{
          padding: 24,
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          marginBottom: 24
        }}>
          <div className="vendor-header" style={{
            display: 'flex',
            gap: 24,
            alignItems: 'flex-start'
          }}>
            {/* Vendor Avatar */}
            <VendorAvatar
              imageUrl={vendorImageUrl}
              name={vendorName}
              size={100}
              tier={vendorTier}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <h1 style={{
                  color: branding.colors.primary,
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 'bold',
                  lineHeight: 1.3
                }}>
                  {vendorName}
                </h1>
                {vendorTier !== 'standard' && (
                  <TierBadge tier={vendorTier} size="lg" />
                )}
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

              <div className="vendor-meta" style={{
                display: 'flex',
                gap: 16,
                flexWrap: 'wrap',
                color: '#666',
                fontSize: 14,
                marginTop: 8
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

              {/* Social Links (Premium only) */}
              {socialLinks && Object.keys(socialLinks).some(key => socialLinks[key]) && (
                <div style={{
                  display: 'flex',
                  gap: 12,
                  marginTop: 16,
                  flexWrap: 'wrap'
                }}>
                  {socialLinks.facebook && (
                    <a
                      href={socialLinks.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#1877f2',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      Facebook
                    </a>
                  )}
                  {socialLinks.instagram && (
                    <a
                      href={socialLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#e4405f',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      Instagram
                    </a>
                  )}
                  {socialLinks.website && (
                    <a
                      href={socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      Website
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Categories - show ALL categories vendor sells */}
          {allCategories.length > 0 && (
            <div style={{
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid #f3f4f6'
            }}>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8
              }}>
                {allCategories.map(category => (
                  <span
                    key={category}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#d1fae5',
                      color: '#065f46',
                      borderRadius: 16,
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  >
                    {category}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Vendor Listings */}
        <div>
          <h2 style={{
            color: branding.colors.primary,
            margin: '0 0 20px 0',
            fontSize: 20,
            fontWeight: 600
          }}>
            Listings from {vendorName}
          </h2>

          {listings && listings.length > 0 ? (
            <div className="listings-grid" style={{
              display: 'grid',
              gap: 16
            }}>
              {listings.map((listing) => {
                const listingId = listing.id as string
                const listingTitle = listing.title as string
                const listingCategory = listing.category as string | null
                const listingPriceCents = (listing.price_cents as number) || 0

                return (
                  <Link
                    key={listingId}
                    href={`/${vertical}/listing/${listingId}`}
                    style={{
                      display: 'block',
                      padding: 16,
                      backgroundColor: 'white',
                      color: '#333',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      textDecoration: 'none'
                    }}
                  >
                    {/* Image Placeholder with Category Badge */}
                    <div style={{ position: 'relative', marginBottom: 12 }}>
                      {listingCategory && (
                        <span style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          padding: '4px 10px',
                          backgroundColor: '#d1fae5',
                          color: '#065f46',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          zIndex: 1
                        }}>
                          {listingCategory}
                        </span>
                      )}

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
                    </div>

                    {/* Title */}
                    <h3 style={{
                      marginBottom: 8,
                      marginTop: 0,
                      color: branding.colors.primary,
                      fontSize: 16,
                      fontWeight: 600
                    }}>
                      {listingTitle}
                    </h3>

                    {/* Price (includes platform fee) */}
                    <div style={{
                      fontSize: 20,
                      fontWeight: 'bold',
                      color: branding.colors.primary
                    }}>
                      {formatDisplayPrice(listingPriceCents)}
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

      {/* Responsive Styles */}
      <style>{`
        .vendor-profile-page .vendor-header {
          flex-direction: column;
          text-align: center;
        }
        .vendor-profile-page .vendor-meta {
          justify-content: center;
        }
        .vendor-profile-page .listings-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-profile-page .vendor-header {
            flex-direction: row;
            text-align: left;
          }
          .vendor-profile-page .vendor-meta {
            justify-content: flex-start;
          }
          .vendor-profile-page .listings-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendor-profile-page .listings-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 1280px) {
          .vendor-profile-page .listings-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
