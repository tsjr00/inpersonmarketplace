import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import EditProfileForm from './EditProfileForm'
import ProfileImageUpload from '@/components/vendor/ProfileImageUpload'
import ProfileEditForm from '@/components/vendor/ProfileEditForm'
import { type Certification } from '@/components/vendor/CertificationsForm'
import DocumentsCertificationsSection from '@/components/vendor/DocumentsCertificationsSection'
import COISection from '@/components/vendor/COISection'
import EventReadinessForm from './EventReadinessForm'
import PickupLeadTimeForm from '@/components/vendor/PickupLeadTimeForm'
import CoverImageUpload from '@/components/vendor/CoverImageUpload'

interface EditProfilePageProps {
  params: Promise<{ vertical: string }>
}

export default async function EditProfilePage({ params }: EditProfilePageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth + vertical membership
  await enforceVerticalAccess(vertical)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Get vendor profile
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  if (vendorError || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: '24px 16px'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: 30,
        paddingBottom: 20,
        borderBottom: `2px solid ${branding.colors.primary}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ color: branding.colors.primary, marginBottom: 0, marginTop: 0 }}>
            Edit Vendor Profile
          </h1>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Important Notice */}
      <div style={{
        backgroundColor: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: '#92400e', fontSize: 14 }}>
          {'💡'} Each section saves independently
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#b45309' }}>
          Click the save button in each section after making changes. Your data is saved when you see the success message.
        </p>
      </div>

      {/* Profile Image Section */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        border: '1px solid #e5e7eb'
      }}>
        <ProfileImageUpload
          currentImageUrl={vendorProfile.profile_image_url}
          vertical={vertical}
        />
      </div>

      {/* Cover Photo */}
      <div style={{ marginBottom: 20 }}>
        <CoverImageUpload
          currentImageUrl={vendorProfile.cover_image_url}
          vertical={vertical}
        />
      </div>

      {/* Description & Social Links */}
      <div style={{ marginBottom: 20 }}>
        <ProfileEditForm
          vendorId={vendorProfile.id}
          currentData={{
            description: vendorProfile.description,
            social_links: vendorProfile.social_links,
            fee_discount_code: vendorProfile.fee_discount_code,
          }}
        />
      </div>

      {/* Original Edit Form */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        border: '1px solid #e5e7eb'
      }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 600 }}>Business Information</h2>
        <EditProfileForm
          vertical={vertical}
          vendorProfile={vendorProfile}
          branding={branding}
        />
      </div>

      {/* Pickup Lead Time — FT only */}
      {vertical === 'food_trucks' && (
        <div style={{ marginTop: 20 }}>
          <PickupLeadTimeForm
            vendorId={vendorProfile.id}
            currentLeadMinutes={vendorProfile.pickup_lead_minutes ?? 30}
          />
        </div>
      )}

      {/* Unified Documents & Certifications Section */}
      <div style={{ marginTop: 20 }}>
        <DocumentsCertificationsSection
          vendorId={vendorProfile.id}
          vertical={vertical}
          currentCertifications={(vendorProfile.certifications as Certification[]) || []}
        />
      </div>

      {/* Certificate of Insurance — required for event approval */}
      {(vertical === 'food_trucks' || vertical === 'farmers_market') && (
        <div style={{ marginTop: 20 }}>
          <COISection vertical={vertical} />
        </div>
      )}

      {/* Event Readiness Section — event-enabled verticals */}
      {(vertical === 'food_trucks' || vertical === 'farmers_market') && (
        <div style={{ marginTop: 20 }}>
          <EventReadinessForm
            vendorId={vendorProfile.id}
            vertical={vertical}
            initialData={((vendorProfile.profile_data as Record<string, unknown>)?.event_readiness as Record<string, unknown>) || null}
            eventApproved={!!vendorProfile.event_approved}
          />
        </div>
      )}
    </div>
  )
}
