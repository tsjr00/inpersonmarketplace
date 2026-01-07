import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import VendorActions from './VendorActions'

interface VendorDetailPageProps {
  params: Promise<{ vendorId: string }>
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { vendorId } = await params
  await requireAdmin()
  const supabase = await createClient()

  // Get vendor details (using id, not vendor_id)
  const { data: vendor, error } = await supabase
    .from('vendor_profiles')
    .select(`
      *,
      user_profiles!vendor_profiles_user_id_fkey (
        email,
        display_name,
        created_at
      )
    `)
    .eq('id', vendorId)
    .single()

  if (error || !vendor) {
    notFound()
  }

  const profileData = vendor.profile_data as Record<string, unknown>
  const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown'
  const userProfile = vendor.user_profiles as Record<string, unknown> | null
  const vendorStatus = vendor.status as string
  const verticalId = vendor.vertical_id as string
  const createdAt = vendor.created_at as string
  const updatedAt = vendor.updated_at as string

  // Get vendor's listings count
  const { count: listingsCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_profile_id', vendorId)
    .is('deleted_at', null)

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 30
      }}>
        <div>
          <Link
            href="/admin/vendors"
            style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}
          >
            Back to Vendors
          </Link>
          <h1 style={{ color: '#333', marginTop: 10 }}>{businessName}</h1>
          <span style={{
            display: 'inline-block',
            marginTop: 10,
            padding: '6px 12px',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 600,
            backgroundColor:
              vendorStatus === 'approved' ? '#d4edda' :
              vendorStatus === 'submitted' ? '#fff3cd' :
              vendorStatus === 'rejected' ? '#f8d7da' : '#e2e3e5',
            color:
              vendorStatus === 'approved' ? '#155724' :
              vendorStatus === 'submitted' ? '#856404' :
              vendorStatus === 'rejected' ? '#721c24' : '#383d41'
          }}>
            {vendorStatus.toUpperCase()}
          </span>
        </div>

        <VendorActions
          vendorId={vendorId}
          currentStatus={vendorStatus}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 30 }}>
        {/* Main Info */}
        <div>
          {/* Profile Data */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 25,
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ color: '#333', marginBottom: 20 }}>Business Information</h2>

            <div style={{ display: 'grid', gap: 15 }}>
              {Object.entries(profileData).map(([key, value]) => (
                <div key={key} style={{
                  display: 'flex',
                  borderBottom: '1px solid #eee',
                  paddingBottom: 10
                }}>
                  <div style={{
                    width: 150,
                    color: '#666',
                    fontSize: 14,
                    textTransform: 'capitalize'
                  }}>
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div style={{ flex: 1, color: '#333' }}>
                    {String(value) || 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Account */}
          {userProfile && (
            <div style={{
              backgroundColor: 'white',
              borderRadius: 8,
              padding: 25,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h2 style={{ color: '#333', marginBottom: 20 }}>User Account</h2>

              <div style={{ display: 'grid', gap: 15 }}>
                <div style={{ display: 'flex', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Email</div>
                  <div style={{ flex: 1, color: '#333' }}>{userProfile.email as string}</div>
                </div>
                <div style={{ display: 'flex', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Display Name</div>
                  <div style={{ flex: 1, color: '#333' }}>{(userProfile.display_name as string) || 'N/A'}</div>
                </div>
                <div style={{ display: 'flex' }}>
                  <div style={{ width: 150, color: '#666', fontSize: 14 }}>Account Created</div>
                  <div style={{ flex: 1, color: '#333' }}>
                    {new Date(userProfile.created_at as string).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* Quick Stats */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 25,
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#333', marginBottom: 15 }}>Quick Stats</h3>

            <div style={{ marginBottom: 15 }}>
              <div style={{ color: '#666', fontSize: 14 }}>Vertical</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {verticalId}
              </div>
            </div>

            <div style={{ marginBottom: 15 }}>
              <div style={{ color: '#666', fontSize: 14 }}>Listings</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {listingsCount || 0}
              </div>
            </div>

            <div style={{ marginBottom: 15 }}>
              <div style={{ color: '#666', fontSize: 14 }}>Applied</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {new Date(createdAt).toLocaleDateString()}
              </div>
            </div>

            <div>
              <div style={{ color: '#666', fontSize: 14 }}>Last Updated</div>
              <div style={{ color: '#333', fontSize: 18, fontWeight: 600 }}>
                {new Date(updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Vendor ID */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 25,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ color: '#333', marginBottom: 10 }}>Vendor ID</h3>
            <code style={{
              fontSize: 11,
              color: '#666',
              backgroundColor: '#f8f9fa',
              padding: '8px 12px',
              borderRadius: 4,
              display: 'block',
              wordBreak: 'break-all'
            }}>
              {vendorId}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
