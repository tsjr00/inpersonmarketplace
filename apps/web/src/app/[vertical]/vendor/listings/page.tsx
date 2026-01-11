import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'

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
    .select('id, status')
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

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 40
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <div>
          <h1 style={{ color: branding.colors.primary, marginBottom: 5, marginTop: 0 }}>
            My Listings
          </h1>
          <p style={{ fontSize: 14, color: branding.colors.secondary, margin: 0 }}>
            {branding.brand_name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href={`/${vertical}/vendor/listings/new`}
            style={{
              padding: '12px 24px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            + New Listing
          </Link>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              padding: '12px 24px',
              backgroundColor: branding.colors.secondary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Vendor Dashboard
          </Link>
        </div>
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 20
        }}>
          {listings.map((listing: Record<string, unknown>) => (
            <div
              key={listing.id as string}
              style={{
                padding: 20,
                backgroundColor: 'white',
                color: '#333',
                border: `1px solid ${branding.colors.secondary}`,
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

              {/* Price & Quantity */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 15,
                fontSize: 14
              }}>
                <span>
                  <strong>Price:</strong> ${(((listing.price_cents as number) || 0) / 100).toFixed(2)}
                </span>
                <span>
                  <strong>Qty:</strong> {(listing.quantity as number) ?? 'Unlimited'}
                </span>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <Link
                  href={`/${vertical}/vendor/listings/${listing.id}/edit`}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: branding.colors.primary,
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    textAlign: 'center',
                    fontWeight: 600
                  }}
                >
                  Edit
                </Link>
                <Link
                  href={`/${vertical}/vendor/listings/${listing.id}`}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    textAlign: 'center',
                    fontWeight: 600
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
          <h3 style={{ marginBottom: 15, color: '#666' }}>No Listings Yet</h3>
          <p style={{ marginBottom: 20, color: '#999' }}>
            Create your first listing to start selling on {branding.brand_name}
          </p>
          <Link
            href={`/${vertical}/vendor/listings/new`}
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            + Create First Listing
          </Link>
        </div>
      )}
    </div>
  )
}
