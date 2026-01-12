import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import PublishButton from './PublishButton'
import { formatPrice, getListingLimit } from '@/lib/constants'

interface ListingsPageProps {
  params: Promise<{ vertical: string }>
}

export default async function ListingsPage({ params }: ListingsPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for this vertical
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status, tier')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get vendor's listings
  const { data: listings } = await supabase
    .from('listings')
    .select('*')
    .eq('vendor_profile_id', vendorProfile.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Calculate listing count and limit
  const tier = (vendorProfile as Record<string, unknown>).tier as string || 'standard'
  const limit = getListingLimit(tier)
  const listingCount = listings?.length || 0
  const canCreateMore = listingCount < limit

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
        color: branding.colors.text
      }}
      className="vendor-listings-page"
    >
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px'
      }}>
        {/* Header - Mobile-first layout */}
        <div style={{
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: `2px solid ${branding.colors.primary}`
        }}>
          {/* Title */}
          <h1 style={{
            color: branding.colors.primary,
            margin: 0,
            fontSize: 28,
            fontWeight: 'bold'
          }}>
            My Listings
          </h1>
          <p style={{
            fontSize: 14,
            color: branding.colors.secondary,
            margin: '4px 0 16px 0'
          }}>
            {branding.brand_name}
          </p>

          {/* Buttons - stack on mobile, inline on desktop */}
          <div className="header-buttons" style={{
            display: 'flex',
            gap: 12,
            marginBottom: 16
          }}>
            {canCreateMore ? (
              <Link
                href={`/${vertical}/vendor/listings/new`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 24px',
                  backgroundColor: branding.colors.primary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: 6,
                  fontWeight: 600,
                  minHeight: 44,
                  flex: 1
                }}
              >
                + New Listing
              </Link>
            ) : (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px 24px',
                  backgroundColor: '#ccc',
                  color: '#666',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'not-allowed',
                  minHeight: 44,
                  flex: 1
                }}
                title={`Limit of ${limit} listings reached`}
              >
                + New Listing
              </span>
            )}
            <Link
              href={`/${vertical}/vendor/dashboard`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 24px',
                backgroundColor: branding.colors.secondary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600,
                minHeight: 44,
                flex: 1
              }}
            >
              Vendor Dashboard
            </Link>
          </div>

          {/* Listing count */}
          <p style={{
            fontSize: 14,
            color: branding.colors.secondary,
            margin: 0
          }}>
            {listingCount} / {limit} listings
            {listingCount >= limit && (
              <span style={{ color: '#dc3545', fontWeight: 600 }}> (limit reached)</span>
            )}
            {listingCount === limit - 1 && (
              <span style={{ color: '#ffc107', fontWeight: 600 }}> (1 remaining)</span>
            )}
          </p>
        </div>

        {/* Vendor Status Warning */}
        {vendorProfile.status !== 'approved' && (
          <div style={{
            padding: 15,
            marginBottom: 20,
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 8,
            color: '#856404'
          }}>
            <strong>Note:</strong> Your vendor profile is pending approval.
            Listings you create will become visible once your profile is approved.
          </div>
        )}

        {/* Listings Grid */}
        {listings && listings.length > 0 ? (
          <div className="listings-grid" style={{
            display: 'grid',
            gap: 16
          }}>
            {listings.map((listing: Record<string, unknown>) => (
              <div
                key={listing.id as string}
                style={{
                  padding: 16,
                  backgroundColor: 'white',
                  color: '#333',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8
                }}
              >
                {/* Status Badge */}
                <div style={{ marginBottom: 10 }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor:
                      listing.status === 'published' ? '#d4edda' :
                      listing.status === 'draft' ? '#e2e3e5' :
                      listing.status === 'paused' ? '#fff3cd' :
                      listing.status === 'archived' ? '#f8d7da' : '#e2e3e5',
                    color:
                      listing.status === 'published' ? '#155724' :
                      listing.status === 'draft' ? '#383d41' :
                      listing.status === 'paused' ? '#856404' :
                      listing.status === 'archived' ? '#721c24' : '#383d41'
                  }}>
                    {(listing.status as string).toUpperCase()}
                  </span>
                </div>

                {/* Title */}
                <h3 style={{
                  marginBottom: 10,
                  marginTop: 0,
                  color: branding.colors.primary,
                  fontSize: 18
                }}>
                  {listing.title as string}
                </h3>

                {/* Description */}
                <p style={{
                  fontSize: 14,
                  color: '#666',
                  marginBottom: 15,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {(listing.description as string) || 'No description'}
                </p>

                {/* Price & Quantity (shows base price for vendors) */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 15,
                  fontSize: 14
                }}>
                  <span>
                    <strong>Price:</strong> {formatPrice((listing.price_cents as number) || 0)}
                  </span>
                  <span>
                    <strong>Qty:</strong> {(listing.quantity as number) ?? 'Unlimited'}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {/* Publish button - only for approved vendors with draft listings */}
                  {vendorProfile.status === 'approved' && (
                    <PublishButton
                      listingId={listing.id as string}
                      currentStatus={listing.status as string}
                    />
                  )}
                  <Link
                    href={`/${vertical}/vendor/listings/${listing.id}/edit`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 12px',
                      backgroundColor: branding.colors.primary,
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 4,
                      fontSize: 14,
                      fontWeight: 600,
                      minHeight: 44
                    }}
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/${vertical}/vendor/listings/${listing.id}`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 12px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: 4,
                      fontSize: 14,
                      fontWeight: 600,
                      minHeight: 44
                    }}
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: 60,
            backgroundColor: 'white',
            color: '#333',
            borderRadius: 8,
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: 15, marginTop: 0, color: '#666' }}>No Listings Yet</h3>
            <p style={{ marginBottom: 20, color: '#999' }}>
              Create your first listing to start selling on {branding.brand_name}
            </p>
            <Link
              href={`/${vertical}/vendor/listings/new`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 24px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600,
                minHeight: 44
              }}
            >
              + Create First Listing
            </Link>
          </div>
        )}
      </div>

      {/* Responsive Styles */}
      <style>{`
        .vendor-listings-page .header-buttons {
          flex-direction: column;
        }
        .vendor-listings-page .listings-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .vendor-listings-page .header-buttons {
            flex-direction: row;
          }
          .vendor-listings-page .header-buttons > * {
            flex: initial !important;
          }
          .vendor-listings-page .listings-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .vendor-listings-page .listings-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
