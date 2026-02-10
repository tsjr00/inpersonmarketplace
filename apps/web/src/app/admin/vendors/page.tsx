import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import AdminNav from '@/components/admin/AdminNav'
import VendorsTableClient from './VendorsTableClient'

// Cache for 2 minutes
export const revalidate = 120

interface VendorsPageProps {
  searchParams: Promise<{
    page?: string
    limit?: string
    search?: string
    status?: string
    vertical?: string
    tier?: string
  }>
}

export default async function VendorsPage({ searchParams }: VendorsPageProps) {
  await requireAdmin()

  const {
    page = '1',
    limit = '20',
    search = '',
    status = '',
    vertical = '',
    tier = ''
  } = await searchParams

  // Parse pagination params
  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  const serviceClient = createServiceClient()

  // Build query with server-side filtering
  let query = serviceClient
    .from('vendor_profiles')
    .select(`
      id,
      user_id,
      vertical_id,
      status,
      tier,
      created_at,
      profile_data,
      orders_confirmed_count,
      orders_cancelled_after_confirm_count
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  // Apply status filter
  if (status) {
    if (status === 'pending') {
      query = query.in('status', ['submitted', 'draft'])
    } else {
      query = query.eq('status', status)
    }
  }

  // Apply vertical filter
  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  // Apply tier filter
  if (tier) {
    query = query.eq('tier', tier)
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: vendors, count, error } = await query

  if (error) {
    console.error('Error fetching vendors:', error)
  }

  // Client-side search filter (profile_data is JSONB, can't easily filter server-side)
  let filteredVendors = vendors || []
  if (search) {
    const searchLower = search.toLowerCase()
    filteredVendors = filteredVendors.filter(vendor => {
      const profileData = vendor.profile_data as Record<string, string> | null
      const businessName = profileData?.business_name?.toLowerCase() || ''
      const legalName = profileData?.legal_name?.toLowerCase() || ''
      const email = profileData?.email?.toLowerCase() || ''
      return businessName.includes(searchLower) ||
             legalName.includes(searchLower) ||
             email.includes(searchLower)
    })
  }

  // Get unique verticals for filter dropdown
  const { data: verticalsList } = await serviceClient
    .from('verticals')
    .select('id, name_public')
    .eq('is_active', true)
    .order('id')

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      <AdminNav type="platform" />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
            All Vendors
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            {totalCount.toLocaleString()} vendors total
          </p>
        </div>
      </div>

      <VendorsTableClient
        vendors={filteredVendors}
        verticals={verticalsList || []}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        initialFilters={{ search, status, vertical, tier }}
      />
    </div>
  )
}
