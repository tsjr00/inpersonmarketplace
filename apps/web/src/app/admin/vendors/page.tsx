import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import VendorFilters from './VendorFilters'

interface VendorsPageProps {
  searchParams: Promise<{ status?: string; vertical?: string }>
}

export default async function VendorsPage({ searchParams }: VendorsPageProps) {
  await requireAdmin()
  const { status, vertical } = await searchParams
  const supabase = await createClient()

  // Build query (using id, not vendor_id)
  let query = supabase
    .from('vendor_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  const { data: vendors } = await query

  // Get unique verticals for filter
  const { data: verticals } = await supabase
    .from('verticals')
    .select('vertical_id, name_public')
    .eq('is_active', true)

  return (
    <div>
      <h1 style={{ color: '#333', marginBottom: 30 }}>All Vendors</h1>

      {/* Filters */}
      <VendorFilters
        currentStatus={status}
        currentVertical={vertical}
        verticals={verticals || []}
      />

      {/* Results */}
      <div style={{ marginBottom: 15, color: '#666' }}>
        {vendors?.length || 0} vendor{vendors?.length !== 1 ? 's' : ''} found
      </div>

      {vendors && vendors.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Business</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Status</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Tier</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Created</th>
                <th style={{ textAlign: 'right', padding: 15, color: '#666' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => {
                const vendorId = vendor.id as string
                const profileData = vendor.profile_data as Record<string, unknown>
                const businessName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'Unknown'
                const vendorStatus = vendor.status as string
                const verticalId = vendor.vertical_id as string
                const createdAt = vendor.created_at as string
                const tier = (vendor.tier as string) || 'standard'

                return (
                  <tr key={vendorId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15 }}>
                      <div style={{ fontWeight: 600, color: '#333' }}>{businessName}</div>
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: '#f0f0f0',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {verticalId}
                      </span>
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
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
                        {vendorStatus}
                      </span>
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor:
                          tier === 'premium' ? '#dbeafe' :
                          tier === 'featured' ? '#fef3c7' : '#f3f4f6',
                        color:
                          tier === 'premium' ? '#1e40af' :
                          tier === 'featured' ? '#92400e' : '#6b7280'
                      }}>
                        {tier}
                      </span>
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {new Date(createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 15, textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendorId}`}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: 4,
                          fontSize: 14
                        }}
                      >
                        View
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
          textAlign: 'center'
        }}>
          <p style={{ color: '#666' }}>No vendors found matching filters.</p>
        </div>
      )}
    </div>
  )
}
