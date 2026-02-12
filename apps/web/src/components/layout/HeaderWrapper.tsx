import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { Header } from './Header'

interface HeaderWrapperProps {
  vertical: string
  isLandingPage?: boolean
}

export async function HeaderWrapper({ vertical, isLandingPage }: HeaderWrapperProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  let userProfile = null
  let vendorProfile = null

  if (user) {
    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, role, roles')
      .eq('user_id', user.id)
      .single()
    userProfile = profile

    // Get vendor profile for this vertical
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('vertical_id', vertical)
      .single()
    vendorProfile = vendor
  }

  return (
    <Header
      vertical={vertical}
      user={user ? { id: user.id, email: user.email } : null}
      userProfile={userProfile}
      vendorProfile={vendorProfile}
      branding={branding}
      isLandingPage={isLandingPage}
    />
  )
}
