import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import ListingForm from '../../ListingForm'
import ScheduleNoticeBanner from '@/components/vendor/ScheduleNoticeBanner'

interface EditListingPageProps {
  params: Promise<{ vertical: string; listingId: string }>
  searchParams: Promise<{ schedule_note?: string }>
}

export default async function EditListingPage({ params, searchParams }: EditListingPageProps) {
  const { schedule_note: scheduleNote } = await searchParams
  const { vertical, listingId } = await params
  const supabase = await createClient()

  // Check auth + vertical membership
  await enforceVerticalAccess(vertical)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get vendor profile with status
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id, status, event_approved')
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
        <h1 style={{ color: branding.colors.primary, marginBottom: 0, marginTop: 0 }}>
          Edit Listing
        </h1>
      </div>

      {/* A create-save that could not declare every market day (conflict elsewhere) lands here with the notice. */}
      <ScheduleNoticeBanner notice={scheduleNote} />

      <ListingForm
        vertical={vertical}
        vendorProfileId={vendorProfile.id}
        vendorStatus={vendorProfile.status}
        branding={branding}
        mode="edit"
        listing={listing}
        eventApproved={!!(vendorProfile as Record<string, unknown>).event_approved}
      />
    </div>
  )
}
