import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import ListingForm from '../ListingForm'
import Link from 'next/link'
import { getListingLimit } from '@/lib/constants'

interface NewListingPageProps {
  params: Promise<{ vertical: string }>
}

export default async function NewListingPage({ params }: NewListingPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile with status and tier
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status, tier')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Note: vendor_status enum is 'submitted' for pending approval (not 'pending')
  const isPendingVendor = vendorProfile.status === 'submitted'

  // Check listing limit
  const tier = (vendorProfile as Record<string, unknown>).tier as string || 'standard'
  const limit = getListingLimit(tier)

  const { count: listingCount } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorProfile.id)
    .is('deleted_at', null)

  const canCreateListing = (listingCount || 0) < limit

  // If at limit, show message instead of form
  if (!canCreateListing) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        padding: 40
      }}>
        <div style={{
          maxWidth: 600,
          margin: '0 auto'
        }}>
          <h1 style={{ color: branding.colors.primary, marginBottom: 20 }}>
            Listing Limit Reached
          </h1>
          <div style={{
            padding: 20,
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 8,
            color: '#856404',
            marginBottom: 20
          }}>
            <p style={{ marginTop: 0, fontWeight: 600, fontSize: 16 }}>
              You&apos;ve reached your limit of {limit} listings for this market.
            </p>
            <p style={{ marginBottom: 0 }}>
              {tier === 'standard' ? (
                <>
                  <strong>Upgrade to Premium</strong> to create up to 10 listings per market,
                  or delete an existing listing to create a new one.
                </>
              ) : (
                <>
                  Delete an existing listing to create a new one.
                </>
              )}
            </p>
          </div>
          <Link
            href={`/${vertical}/vendor/listings`}
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
            ← Back to My Listings
          </Link>
        </div>
      </div>
    )
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
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <h1 style={{ color: branding.colors.primary, marginBottom: 0, marginTop: 0 }}>
          Create New Listing
        </h1>
      </div>

      <ListingForm
        vertical={vertical}
        vendorProfileId={vendorProfile.id}
        vendorStatus={vendorProfile.status}
        branding={branding}
        mode="create"
      />
    </div>
  )
}
