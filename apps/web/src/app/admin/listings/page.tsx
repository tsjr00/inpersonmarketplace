import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import AdminNav from '@/components/admin/AdminNav'
import ListingsTableClient from './ListingsTableClient'

// Cache for 2 minutes
export const revalidate = 120

interface ListingsPageProps {
  searchParams: Promise<{
    page?: string
    limit?: string
    search?: string
    status?: string
    vertical?: string
    category?: string
  }>
}

export default async function AdminListingsPage({ searchParams }: ListingsPageProps) {
  await requireAdmin()

  const {
    page = '1',
    limit = '20',
    search = '',
    status = '',
    vertical = '',
    category = ''
  } = await searchParams

  // Parse pagination params
  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  const serviceClient = createServiceClient()

  // Build query with server-side filtering
  let query = serviceClient
    .from('listings')
    .select(`
      id,
      title,
      status,
      price_cents,
      category,
      vertical_id,
      created_at,
      vendor_profiles!inner (
        id,
        tier,
        profile_data
      )
    `, { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  // Apply status filter
  if (status) {
    query = query.eq('status', status)
  }

  // Apply vertical filter
  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  // Apply category filter
  if (category) {
    query = query.eq('category', category)
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: listings, count, error } = await query

  if (error) {
    console.error('Error fetching listings:', error)
  }

  // Client-side search filter (title search across fields)
  let filteredListings = listings || []
  if (search) {
    const searchLower = search.toLowerCase()
    filteredListings = filteredListings.filter(listing => {
      const title = (listing.title as string || '').toLowerCase()
      const vendorProfile = listing.vendor_profiles as unknown as Record<string, unknown> | null
      const profileData = vendorProfile?.profile_data as Record<string, string> | null
      const vendorName = profileData?.business_name?.toLowerCase() || profileData?.farm_name?.toLowerCase() || ''
      return title.includes(searchLower) || vendorName.includes(searchLower)
    })
  }

  // Get unique verticals and categories for filters
  const { data: verticalsList } = await serviceClient
    .from('verticals')
    .select('id, name_public')
    .eq('is_active', true)
    .order('id')

  // Get unique categories from current filter results
  const { data: categoriesList } = await serviceClient
    .from('listings')
    .select('category')
    .is('deleted_at', null)
    .not('category', 'is', null)

  const uniqueCategories = [...new Set(categoriesList?.map(c => c.category as string).filter(Boolean))].sort()

  // Type the listings properly (vendor_profiles comes as array from join, take first)
  const typedListings = filteredListings.map(listing => ({
    id: listing.id as string,
    title: listing.title as string,
    status: listing.status as string,
    price_cents: listing.price_cents as number,
    category: listing.category as string | null,
    vertical_id: listing.vertical_id as string,
    created_at: listing.created_at as string,
    vendor_profiles: Array.isArray(listing.vendor_profiles) && listing.vendor_profiles.length > 0
      ? {
          id: listing.vendor_profiles[0].id as string,
          tier: listing.vendor_profiles[0].tier as string | null,
          profile_data: listing.vendor_profiles[0].profile_data as {
            business_name?: string
            farm_name?: string
          } | null
        }
      : null
  }))

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
            All Listings
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            {totalCount.toLocaleString()} listings total
          </p>
        </div>
      </div>

      <ListingsTableClient
        listings={typedListings}
        verticals={verticalsList || []}
        categories={uniqueCategories}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        initialFilters={{ search, status, vertical, category }}
      />
    </div>
  )
}
