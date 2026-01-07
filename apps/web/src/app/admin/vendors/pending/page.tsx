import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'

export default async function PendingVendorsPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Get all pending vendors (using id, not vendor_id)
  const { data: pendingVendors } = await supabase
    .from('vendor_profiles')
    .select(`
      id,
      vertical_id,
      profile_data,
      status,
      created_at,
      user_id
    `)
    .eq('status', 'submitted')
    .order('created_at', { ascending: true })

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30
      }}>
        <h1 style={{ color: '#333' }}>Pending Vendor Approvals</h1>
        <span style={{
          padding: '6px 12px',
          backgroundColor: '#f59e0b',
          color: 'white',
          borderRadius: 20,
          fontWeight: 600
        }}>
          {pendingVendors?.length || 0} pending
        </span>
      </div>

      {pendingVendors && pendingVendors.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Business Name</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Contact</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Applied</th>
                <th style={{ textAlign: 'right', padding: 15, color: '#666' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingVendors.map((vendor) => {
                const vendorId = vendor.id as string
                const profileData = vendor.profile_data as Record<string, unknown>
                const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown'
                const contactName = (profileData?.legal_name as string) || 'N/A'
                const email = (profileData?.email as string) || 'N/A'
                const verticalId = vendor.vertical_id as string
                const createdAt = vendor.created_at as string

                return (
                  <tr key={vendorId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15 }}>
                      <div style={{ fontWeight: 600, color: '#333' }}>{businessName}</div>
                      <div style={{ fontSize: 13, color: '#666' }}>{contactName}</div>
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: verticalId === 'fireworks' ? '#ff450020' : '#2d501620',
                        color: verticalId === 'fireworks' ? '#ff4500' : '#2d5016',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {verticalId}
                      </span>
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {email}
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {new Date(createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 15, textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendorId}`}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 14
                        }}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 15 }}>All Caught Up!</div>
          <h3 style={{ color: '#333', marginBottom: 10 }}>No Pending Applications</h3>
          <p style={{ color: '#666' }}>No pending vendor applications to review.</p>
        </div>
      )}
    </div>
  )
}
