import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import EditProfileForm from './EditProfileForm'
import ProfileImageUpload from '@/components/vendor/ProfileImageUpload'
import ProfileEditForm from '@/components/vendor/ProfileEditForm'
import CertificationsForm, { Certification } from '@/components/vendor/CertificationsForm'
import { VendorTierType } from '@/lib/constants'

interface EditProfilePageProps {
  params: Promise<{ vertical: string }>
}

export default async function EditProfilePage({ params }: EditProfilePageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
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
      padding: 40
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
        padding: 16,
        marginBottom: 20,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12
      }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <div>
          <p style={{ margin: 0, fontWeight: 600, color: '#92400e' }}>
            Each section saves independently
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#b45309' }}>
            Click the save button in each section after making changes. Your data is saved when you see the success message.
          </p>
        </div>
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
        />
      </div>

      {/* Description & Social Links */}
      <div style={{ marginBottom: 20 }}>
        <ProfileEditForm
          vendorId={vendorProfile.id}
          currentData={{
            description: vendorProfile.description,
            social_links: vendorProfile.social_links
          }}
          tier={(vendorProfile.tier || 'standard') as VendorTierType}
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

      {/* Certifications Section */}
      <div style={{ marginTop: 20 }}>
        <CertificationsForm
          vendorId={vendorProfile.id}
          currentCertifications={(vendorProfile.certifications as Certification[]) || []}
        />
      </div>
    </div>
  )
}
