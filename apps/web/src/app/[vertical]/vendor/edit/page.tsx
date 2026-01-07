import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import EditProfileForm from './EditProfileForm'

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
        <h1 style={{ color: branding.colors.primary, marginBottom: 5, marginTop: 0 }}>
          Edit Vendor Profile
        </h1>
        <p style={{ fontSize: 14, color: branding.colors.secondary, margin: 0 }}>
          {branding.brand_name}
        </p>
      </div>

      <EditProfileForm
        vertical={vertical}
        vendorProfile={vendorProfile}
        branding={branding}
      />
    </div>
  )
}
