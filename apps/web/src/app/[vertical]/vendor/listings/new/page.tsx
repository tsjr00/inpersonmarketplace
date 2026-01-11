import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import ListingForm from '../ListingForm'

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

  // Get vendor profile with status
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (!vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Note: vendor_status enum is 'submitted' for pending approval (not 'pending')
  const isPendingVendor = vendorProfile.status === 'submitted'

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
          Create New Listing
        </h1>
        <p style={{ fontSize: 14, color: branding.colors.secondary, margin: 0 }}>
          {branding.brand_name}
        </p>
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
