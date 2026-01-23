import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import EditProfileForm from './EditProfileForm'
import ProfileImageUpload from '@/components/vendor/ProfileImageUpload'
import ProfileEditForm from '@/components/vendor/ProfileEditForm'
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
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

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
        <h1 style={{ color: branding.colors.primary, marginBottom: 0, marginTop: 0 }}>
          Edit Vendor Profile
        </h1>
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
    </div>
  )
}
