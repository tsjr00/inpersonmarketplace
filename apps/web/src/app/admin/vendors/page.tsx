import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import VendorFilters from './VendorFilters'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

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
    <div style={{ maxWidth: containers.wide, margin: '0 auto' }}>
      <h1 style={{ color: '#333', marginBottom: spacing.lg, fontSize: typography.sizes['2xl'] }}>All Vendors</h1>

      {/* Filters */}
      <VendorFilters
        currentStatus={status}
        currentVertical={vertical}
        verticals={verticals || []}
      />

      {/* Results */}
      <div style={{ marginBottom: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>
        {vendors?.length || 0} vendor{vendors?.length !== 1 ? 's' : ''} found
      </div>

      {vendors && vendors.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: radius.md,
          boxShadow: shadows.sm,
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>Business</th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>Vertical</th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>Status</th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>Tier</th>
                <th style={{ textAlign: 'left', padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>Created</th>
                <th style={{ textAlign: 'right', padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>Action</th>
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
                    <td style={{ padding: spacing.sm }}>
                      <div style={{ fontWeight: typography.weights.semibold, color: '#333' }}>{businessName}</div>
                    </td>
                    <td style={{ padding: spacing.sm }}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        backgroundColor: '#f0f0f0',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold
                      }}>
                        {verticalId}
                      </span>
                    </td>
                    <td style={{ padding: spacing.sm }}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
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
                    <td style={{ padding: spacing.sm }}>
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing['2xs']}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
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
                    <td style={{ padding: spacing.sm, color: '#666', fontSize: typography.sizes.sm }}>
                      {new Date(createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: spacing.sm, textAlign: 'right' }}>
                      <Link
                        href={`/admin/vendors/${vendorId}`}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: '#0070f3',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm
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
          borderRadius: radius.md,
          padding: spacing['3xl'],
          textAlign: 'center'
        }}>
          <p style={{ color: '#666', fontSize: typography.sizes.base }}>No vendors found matching filters.</p>
        </div>
      )}
    </div>
  )
}
