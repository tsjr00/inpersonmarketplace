import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import UsersTableClient from './UsersTableClient'

// Cache for 2 minutes - admin data doesn't need real-time updates
export const revalidate = 120

interface AdminUsersPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{
    page?: string
    limit?: string
    search?: string
    role?: string
    vendorStatus?: string
    vendorTier?: string
    buyerTier?: string
  }>
}

export default async function AdminUsersPage({ params, searchParams }: AdminUsersPageProps) {
  const { vertical } = await params
  const {
    page = '1',
    limit = '20',
    search = '',
    role = '',
    vendorStatus = '',
    vendorTier = '',
    buyerTier = ''
  } = await searchParams

  const supabase = await createClient()

  // Verify user is authenticated and admin
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Please log in to access this page.</p>
      </div>
    )
  }

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')

  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Admin access required.</p>
      </div>
    )
  }

  // Parse pagination params
  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  // Use service client to bypass RLS
  const serviceClient = createServiceClient()

  // Build the query with server-side filtering
  // Only select the columns we actually need (not full vendor_profiles)
  let query = serviceClient
    .from('user_profiles')
    .select(`
      id,
      user_id,
      email,
      display_name,
      role,
      roles,
      buyer_tier,
      created_at,
      vendor_profiles!left (
        id,
        status,
        vertical_id,
        tier
      )
    `, { count: 'exact' })
    .contains('verticals', [vertical]) // Filter by vertical in DB!
    .order('created_at', { ascending: false })

  // Apply search filter (server-side)
  if (search) {
    query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
  }

  // Apply role filter
  if (role) {
    query = query.contains('roles', [role])
  }

  // Apply buyer tier filter
  if (buyerTier) {
    query = query.eq('buyer_tier', buyerTier)
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: users, count, error } = await query

  if (error) {
    console.error('Error fetching users:', error)
  }

  // Filter vendor-related filters client-side (complex nested filter)
  // These filters are less common so acceptable for now
  let filteredUsers = users || []

  if (vendorStatus || vendorTier) {
    filteredUsers = filteredUsers.filter(user => {
      const vendorProfiles = user.vendor_profiles as { id: string; status: string; vertical_id: string; tier?: string }[] | null
      if (!vendorProfiles || vendorProfiles.length === 0) return false

      const verticalProfile = vendorProfiles.find(vp => vp.vertical_id === vertical)
      if (!verticalProfile) return false

      if (vendorStatus && verticalProfile.status !== vendorStatus) return false
      if (vendorTier && verticalProfile.tier !== vendorTier) return false

      return true
    })
  }

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      <AdminNav type="vertical" vertical={vertical} />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
            Users
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            {totalCount.toLocaleString()} users in this vertical
          </p>
        </div>
        <Link
          href={`/${vertical}/admin`}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600
          }}
        >
          Back to Admin
        </Link>
      </div>

      <UsersTableClient
        users={filteredUsers}
        vertical={vertical}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        initialFilters={{ search, role, vendorStatus, vendorTier, buyerTier }}
      />
    </div>
  )
}
