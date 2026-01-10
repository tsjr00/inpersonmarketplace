import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import Link from 'next/link'
import EditProfileButton from './EditProfileButton'

interface VendorDashboardPageProps {
  params: Promise<{ vertical: string }>
}

export default async function VendorDashboardPage({ params }: VendorDashboardPageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Check auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    redirect(`/${vertical}/login`)
  }

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Get vendor profile for THIS vertical
  const { data: vendorProfile, error: vendorError } = await supabase
    .from('vendor_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .single()

  // If no vendor profile, redirect to vendor signup
  if (vendorError || !vendorProfile) {
    redirect(`/${vertical}/vendor-signup`)
  }

  // Get user profile for display name
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('display_name, email')
    .eq('user_id', user.id)
    .single()

  // Parse profile_data JSON
  const profileData = vendorProfile.profile_data as Record<string, unknown>

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
        <div>
          <h1 style={{ color: branding.colors.primary, marginBottom: 5, marginTop: 0 }}>
            Vendor Dashboard
          </h1>
          <p style={{ fontSize: 14, color: branding.colors.secondary, margin: 0 }}>
            {branding.brand_name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href={`/${vertical}/dashboard`}
            style={{
              padding: '10px 20px',
              backgroundColor: branding.colors.secondary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 4,
              fontWeight: 600
            }}
          >
            User Dashboard
          </Link>
        </div>
      </div>

      {/* Status Banner */}
      <div style={{
        padding: 20,
        marginBottom: 30,
        backgroundColor:
          vendorProfile.status === 'approved' ? '#d4edda' :
          vendorProfile.status === 'submitted' ? '#fff3cd' :
          vendorProfile.status === 'rejected' ? '#f8d7da' : '#e2e3e5',
        border: `1px solid ${
          vendorProfile.status === 'approved' ? '#c3e6cb' :
          vendorProfile.status === 'submitted' ? '#ffeaa7' :
          vendorProfile.status === 'rejected' ? '#f5c6cb' : '#d6d8db'
        }`,
        borderRadius: 8,
        color: '#333'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 18 }}>
              Status: {vendorProfile.status.charAt(0).toUpperCase() + vendorProfile.status.slice(1)}
            </strong>
            <p style={{ margin: '5px 0 0 0', fontSize: 14 }}>
              {vendorProfile.status === 'approved' && 'Your vendor profile is approved and active'}
              {vendorProfile.status === 'submitted' && 'Your profile is under review'}
              {vendorProfile.status === 'rejected' && 'Your profile needs updates'}
              {vendorProfile.status === 'suspended' && 'Your profile is currently suspended'}
              {vendorProfile.status === 'draft' && 'Your profile is saved as draft'}
            </p>
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            Submitted: {new Date(vendorProfile.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Profile Information */}
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Contact Information */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          color: '#333',
          border: `1px solid ${branding.colors.secondary}`,
          borderRadius: 8
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20
          }}>
            <h2 style={{ color: branding.colors.primary, margin: 0 }}>Contact Information</h2>
            <EditProfileButton vertical={vertical} />
          </div>

          <div style={{ display: 'grid', gap: 15 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Legal Name:</strong>
              <span>{(profileData.legal_name as string) || 'Not provided'}</span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Phone Number:</strong>
              <span>{(profileData.phone as string) || 'Not provided'}</span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Email:</strong>
              <span>{(profileData.email as string) || userProfile?.email || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* Business Information */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          color: '#333',
          border: `1px solid ${branding.colors.secondary}`,
          borderRadius: 8
        }}>
          <h2 style={{ color: branding.colors.primary, marginBottom: 20, marginTop: 0 }}>
            Business Information
          </h2>

          <div style={{ display: 'grid', gap: 15 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Business Name:</strong>
              <span>{(profileData.business_name as string) || (profileData.farm_name as string) || 'Not provided'}</span>
            </div>

            {vertical === 'fireworks' && (
              <>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Business Type:</strong>
                  <span>{(profileData.business_type as string) || 'Not provided'}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Primary County (TX):</strong>
                  <span>{(profileData.primary_county as string) || 'Not provided'}</span>
                </div>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Seller Permit #:</strong>
                  <span>{(profileData.seller_permit as string) || 'Not provided'}</span>
                </div>
              </>
            )}

            {vertical === 'farmers_market' && (
              <>
                <div>
                  <strong style={{ display: 'block', marginBottom: 5 }}>Vendor Type:</strong>
                  <span>{(profileData.vendor_type as string) || 'Not provided'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Account Details */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          color: '#333',
          border: `1px solid ${branding.colors.secondary}`,
          borderRadius: 8
        }}>
          <h2 style={{ color: branding.colors.primary, marginBottom: 20, marginTop: 0 }}>
            Account Details
          </h2>

          <div style={{ display: 'grid', gap: 15 }}>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Vendor ID:</strong>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {vendorProfile.id}
              </span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Member Since:</strong>
              <span>{new Date(vendorProfile.created_at).toLocaleDateString()}</span>
            </div>
            <div>
              <strong style={{ display: 'block', marginBottom: 5 }}>Last Updated:</strong>
              <span>{new Date(vendorProfile.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 20
        }}>
          {/* Listings Quick Access */}
          <Link
            href={`/${vertical}/vendor/listings`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              color: '#333',
              border: `1px solid ${branding.colors.secondary}`,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
              height: '100%'
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📦</div>
              <h3 style={{ color: branding.colors.primary, margin: '0 0 10px 0' }}>
                Your Listings
              </h3>
              <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
                Create and manage your product listings
              </p>
            </div>
          </Link>

          {/* Payment Settings */}
          <Link
            href={`/${vertical}/vendor/dashboard/stripe`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              color: '#333',
              border: `1px solid ${branding.colors.secondary}`,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
              height: '100%'
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💳</div>
              <h3 style={{ color: branding.colors.primary, margin: '0 0 10px 0' }}>
                Payment Settings
              </h3>
              <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
                Connect your bank account to receive payments
              </p>
            </div>
          </Link>

          {/* Orders */}
          <Link
            href={`/${vertical}/vendor/dashboard/orders`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              color: '#333',
              border: `1px solid ${branding.colors.secondary}`,
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
              height: '100%'
            }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🛒</div>
              <h3 style={{ color: branding.colors.primary, margin: '0 0 10px 0' }}>
                Orders
              </h3>
              <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
                Manage incoming orders from customers
              </p>
            </div>
          </Link>
        </div>

        {/* Future Features */}
        <div style={{
          padding: 20,
          backgroundColor: '#f8f9fa',
          color: '#333',
          border: '1px solid #dee2e6',
          borderRadius: 8
        }}>
          <h3 style={{ marginBottom: 15, color: '#666', marginTop: 0 }}>Coming Soon</h3>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#888' }}>
            <li>Analytics and insights</li>
            <li>Customer messages</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
