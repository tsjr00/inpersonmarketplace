import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import SettingsForm from './SettingsForm'
import VendorTierManager from './VendorTierManager'

interface SettingsPageProps {
  params: Promise<{ vertical: string }>
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get user profile
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Get vendor profile if exists
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  return (
    <div style={{
      maxWidth: 800,
      margin: '0 auto',
      padding: 24
    }}>
      <h1 style={{
        fontSize: 28,
        fontWeight: 'bold',
        color: branding.colors.primary,
        marginBottom: 24,
        marginTop: 0
      }}>
        Settings
      </h1>

      {/* Account Details */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        padding: 24,
        marginBottom: 24
      }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 600,
          color: '#111827',
          marginTop: 0,
          marginBottom: 20
        }}>
          Account Details
        </h2>

        <SettingsForm
          initialDisplayName={userProfile?.display_name || ''}
          userEmail={user.email || ''}
          primaryColor={branding.colors.primary}
        />

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 4px 0' }}>Member Since</p>
              <p style={{ margin: 0, color: '#111827' }}>
                {userProfile?.created_at
                  ? new Date(userProfile.created_at).toLocaleDateString()
                  : 'Unknown'}
              </p>
            </div>

            <div>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 4px 0' }}>Account ID</p>
              <p style={{
                margin: 0,
                color: '#6b7280',
                fontSize: 12,
                fontFamily: 'monospace'
              }}>
                {user.id}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Vendor Account Details (if vendor) */}
      {vendorProfile && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          padding: 24,
          marginBottom: 24
        }}>
          <h2 style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#111827',
            marginTop: 0,
            marginBottom: 20
          }}>
            Vendor Account
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 4px 0' }}>Vendor ID</p>
              <p style={{
                margin: 0,
                color: '#6b7280',
                fontSize: 12,
                fontFamily: 'monospace'
              }}>
                {vendorProfile.id}
              </p>
            </div>

            <div>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 4px 0' }}>Status</p>
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 4,
                fontSize: 14,
                backgroundColor: vendorProfile.status === 'approved' ? '#d1fae5' : '#fef3c7',
                color: vendorProfile.status === 'approved' ? '#065f46' : '#92400e'
              }}>
                {vendorProfile.status.charAt(0).toUpperCase() + vendorProfile.status.slice(1)}
              </span>
            </div>

            <div>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 4px 0' }}>Tier</p>
              <span style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 4,
                fontSize: 14,
                textTransform: 'capitalize',
                backgroundColor:
                  vendorProfile.tier === 'premium' ? '#fef3c7' :
                  vendorProfile.tier === 'featured' ? '#dbeafe' : '#f3f4f6',
                color:
                  vendorProfile.tier === 'premium' ? '#92400e' :
                  vendorProfile.tier === 'featured' ? '#1e40af' : '#374151'
              }}>
                {vendorProfile.tier || 'standard'}
              </span>
            </div>

            <div>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 4px 0' }}>Last Updated</p>
              <p style={{ margin: 0, color: '#111827' }}>
                {new Date(vendorProfile.updated_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Tier Management */}
          <VendorTierManager
            vertical={vertical}
            vendorId={vendorProfile.id}
            currentTier={vendorProfile.tier || 'standard'}
            stripeSubscriptionId={vendorProfile.stripe_subscription_id}
            primaryColor={branding.colors.primary}
          />
        </div>
      )}

      {/* Coming Soon */}
      <div style={{
        backgroundColor: '#f9fafb',
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        padding: 24
      }}>
        <h2 style={{
          fontSize: 18,
          fontWeight: 600,
          color: '#6b7280',
          marginTop: 0,
          marginBottom: 12
        }}>
          Coming Soon
        </h2>
        <ul style={{
          margin: 0,
          paddingLeft: 20,
          color: '#6b7280',
          fontSize: 14
        }}>
          <li>Notification preferences</li>
          <li>Email settings</li>
          <li>Privacy settings</li>
        </ul>
      </div>
    </div>
  )
}
