import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import LogoutButton from './LogoutButton'

interface DashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding from defaults
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for THIS vertical (if exists)
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

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
        <h1 style={{ color: branding.colors.primary, margin: 0 }}>
          {branding.brand_name} Dashboard
        </h1>
        <LogoutButton vertical={vertical} branding={branding} />
      </div>

      {/* Welcome Section */}
      <div style={{
        padding: 20,
        backgroundColor: 'white',
        color: '#333',
        border: `1px solid ${branding.colors.secondary}`,
        borderRadius: 8,
        marginBottom: 20
      }}>
        <h2 style={{ marginTop: 0 }}>Welcome, {user.user_metadata?.full_name || user.email}!</h2>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Account Created:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
      </div>

      {/* Vendor Status */}
      <div style={{
        padding: 20,
        backgroundColor: 'white',
        color: '#333',
        border: `1px solid ${branding.colors.secondary}`,
        borderRadius: 8
      }}>
        {vendorProfile ? (
          <>
            <h3 style={{ color: branding.colors.accent, marginTop: 0 }}>
              You&apos;re a {branding.brand_name} Vendor
            </h3>
            <p><strong>Status:</strong> {vendorProfile.status}</p>
            <p><strong>Joined:</strong> {new Date(vendorProfile.created_at).toLocaleDateString()}</p>
            <a
              href={`/${vertical}/vendor/dashboard`}
              style={{
                display: 'inline-block',
                marginTop: 10,
                padding: '10px 20px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 4,
                fontWeight: 600
              }}
            >
              Manage Vendor Profile
            </a>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>Become a Vendor</h3>
            <p>You&apos;re not yet registered as a vendor on {branding.brand_name}.</p>
            <a
              href={`/${vertical}/vendor-signup`}
              style={{
                display: 'inline-block',
                marginTop: 10,
                padding: '10px 20px',
                backgroundColor: branding.colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 4,
                fontWeight: 600
              }}
            >
              Complete Vendor Registration
            </a>
          </>
        )}
      </div>
    </div>
  )
}
