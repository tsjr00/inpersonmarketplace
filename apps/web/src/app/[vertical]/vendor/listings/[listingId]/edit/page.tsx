import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import ListingForm from '../../ListingForm'

interface EditListingPageProps {
  params: Promise<{ vertical: string; listingId: string }>
}

export default async function EditListingPage({ params }: EditListingPageProps) {
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
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <h1 style={{ color: branding.colors.primary, marginBottom: 5, marginTop: 0 }}>
          Edit Listing
        </h1>
        <p style={{ fontSize: 14, color: branding.colors.secondary, margin: 0 }}>
          {branding.brand_name}
        </p>
      </div>

      <ListingForm
        vertical={vertical}
        vendorProfileId={vendorProfile.id}
        branding={branding}
        mode="edit"
        listing={listing}
      />
    </div>
  )
}
