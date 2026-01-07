import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import ListingFilters from './ListingFilters'

interface ListingsPageProps {
  searchParams: Promise<{ status?: string; vertical?: string }>
}

export default async function AdminListingsPage({ searchParams }: ListingsPageProps) {
  await requireAdmin()
  const { status, vertical } = await searchParams
  const supabase = await createClient()

  // Build query
  let query = supabase
    .from('listings')
    .select(`
      *,
      vendor_profiles!inner (
        id,
        profile_data,
        vertical_id
      )
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (vertical) {
    query = query.eq('vertical_id', vertical)
  }

  const { data: listings } = await query

  return (
    <div>
      <h1 style={{ color: '#333', marginBottom: 30 }}>All Listings</h1>

      {/* Filters */}
      <ListingFilters
        currentStatus={status}
        currentVertical={vertical}
      />

      {/* Results */}
      <div style={{ marginBottom: 15, color: '#666' }}>
        {listings?.length || 0} listing{listings?.length !== 1 ? 's' : ''} found
      </div>

      {listings && listings.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Title</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vendor</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Price</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Status</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const listingId = listing.id as string
                const listingTitle = listing.title as string
                const listingCategory = listing.category as string | null
                const listingStatus = listing.status as string
                const priceCents = listing.price_cents as number
                const createdAt = listing.created_at as string
                const vendorProfile = listing.vendor_profiles as Record<string, unknown> | null
                const vendorData = vendorProfile?.profile_data as Record<string, unknown> | null
                const vendorName = (vendorData?.business_name as string) || (vendorData?.farm_name as string) || 'Unknown'

                return (
                  <tr key={listingId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15 }}>
                      <div style={{ fontWeight: 600, color: '#333' }}>{listingTitle}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{listingCategory}</div>
                    </td>
                    <td style={{ padding: 15, color: '#666' }}>
                      {vendorName}
                    </td>
                    <td style={{ padding: 15, color: '#333', fontWeight: 600 }}>
                      ${((priceCents || 0) / 100).toFixed(2)}
                    </td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor:
                          listingStatus === 'published' ? '#d4edda' :
                          listingStatus === 'draft' ? '#e2e3e5' : '#fff3cd',
                        color:
                          listingStatus === 'published' ? '#155724' :
                          listingStatus === 'draft' ? '#383d41' : '#856404'
                      }}>
                        {listingStatus}
                      </span>
                    </td>
                    <td style={{ padding: 15, color: '#666', fontSize: 14 }}>
                      {new Date(createdAt).toLocaleDateString()}
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
          <p style={{ color: '#666' }}>No listings found.</p>
        </div>
      )}
    </div>
  )
}
