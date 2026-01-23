import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import DeleteListingButton from './DeleteListingButton'

interface ViewListingPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function ViewListingPage({ params }: ViewListingPageProps) {
  const { vertical, listingId } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get listing
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .eq('vendor_profile_id', vendorProfile.id)
    .is('deleted_at', null)
    .single()

  if (listingError || !listing) {
    notFound()
  }

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
          <h1 style={{ color: branding.colors.primary, marginBottom: 0, marginTop: 0 }}>
            {listing.title}
          </h1>
        </div>
        <Link
          href={`/${vertical}/vendor/listings`}
          style={{
            padding: '10px 20px',
            backgroundColor: branding.colors.secondary,
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600
          }}
        >
          Back to Listings
        </Link>
      </div>

      {/* Listing Details */}
      <div style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: 30,
        backgroundColor: 'white',
        color: '#333',
        borderRadius: 8,
        border: `1px solid ${branding.colors.secondary}`
      }}>
        {/* Status */}
        <div style={{ marginBottom: 20 }}>
          <span style={{
            padding: '6px 12px',
            borderRadius: 4,
            fontSize: 14,
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
            {listing.status.toUpperCase()}
          </span>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 25 }}>
          <h3 style={{ marginBottom: 10, color: '#333', marginTop: 0 }}>Description</h3>
          <p style={{ color: '#666', lineHeight: 1.6, margin: 0 }}>
            {listing.description || 'No description provided'}
          </p>
        </div>

        {/* Details Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
          marginBottom: 25
        }}>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333', marginTop: 0 }}>Price</h4>
            <p style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, margin: 0 }}>
              ${((listing.price_cents || 0) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333', marginTop: 0 }}>Quantity</h4>
            <p style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, margin: 0 }}>
              {listing.quantity ?? 'Unlimited'}
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333', marginTop: 0 }}>Category</h4>
            <p style={{ fontSize: 18, color: '#666', margin: 0 }}>
              {listing.category || 'Uncategorized'}
            </p>
          </div>
          <div>
            <h4 style={{ marginBottom: 5, color: '#333', marginTop: 0 }}>Created</h4>
            <p style={{ fontSize: 18, color: '#666', margin: 0 }}>
              {new Date(listing.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Listing ID */}
        <div style={{ marginBottom: 30 }}>
          <h4 style={{ marginBottom: 5, color: '#333', marginTop: 0 }}>Listing ID</h4>
          <code style={{
            fontSize: 12,
            color: '#666',
            backgroundColor: '#f8f9fa',
            padding: '4px 8px',
            borderRadius: 4
          }}>
            {listing.id}
          </code>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: 15,
          paddingTop: 20,
          borderTop: '1px solid #eee'
        }}>
          <Link
            href={`/${vertical}/vendor/listings/${listing.id}/edit`}
            style={{
              padding: '12px 24px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Edit Listing
          </Link>

          <DeleteListingButton
            vertical={vertical}
            listingId={listing.id}
            listingTitle={listing.title}
          />
        </div>
      </div>
    </div>
  )
}
