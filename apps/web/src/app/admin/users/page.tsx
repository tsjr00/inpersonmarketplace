import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import AdminNav from '@/components/admin/AdminNav'
import UsersTableClient from './UsersTableClient'

// Cache for 2 minutes
export const revalidate = 120

interface VendorProfile {
  id: string
  status: string
  vertical_id: string
  tier?: string
}

interface UserProfile {
  id: string
  user_id: string
  email: string
  display_name: string | null
  role: string | null
  roles: string[] | null
  verticals: string[] | null
  buyer_tier: string | null
  buyer_tier_expires_at: string | null
  created_at: string
  vendor_profiles: VendorProfile[] | null
}

interface AdminUsersPageProps {
  searchParams: Promise<{
    page?: string
    limit?: string
    search?: string
    role?: string
    vertical?: string
    vendorStatus?: string
    vendorTier?: string
    buyerTier?: string
  }>
}

export default async function UsersPage({ searchParams }: AdminUsersPageProps) {
  await requireAdmin()

  const {
    page = '1',
    limit = '20',
    search = '',
    role = '',
    vertical = '',
    vendorStatus = '',
    vendorTier = '',
    buyerTier = ''
  } = await searchParams

  // Parse pagination params
  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  // Use service client to bypass RLS
  const serviceClient = createServiceClient()

  // Build query with server-side filtering
  let query = serviceClient
    .from('user_profiles')
    .select(`
      id,
      user_id,
      email,
      display_name,
      role,
      roles,
      verticals,
      buyer_tier,
      buyer_tier_expires_at,
      created_at,
      vendor_profiles!left (
        id,
        status,
        vertical_id,
        tier
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  // Apply search filter (server-side)
  if (search) {
    query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
  }

  // Apply role filter (server-side)
  if (role) {
    query = query.contains('roles', [role])
  }

  // Apply vertical filter (server-side)
  if (vertical) {
    query = query.contains('verticals', [vertical])
  }

  // Apply buyer tier filter (server-side)
  if (buyerTier) {
    query = query.eq('buyer_tier', buyerTier)
  }

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: users, count, error } = await query

  if (error) {
    console.error('Error fetching users:', error)
  }

  // Filter vendor-related filters client-side (complex nested data)
  let filteredUsers = users || []

  if (vendorStatus || vendorTier) {
    filteredUsers = filteredUsers.filter(user => {
      const vendorProfiles = user.vendor_profiles as VendorProfile[] | null
      if (!vendorProfiles || vendorProfiles.length === 0) return false

      const matchingProfile = vendorProfiles.find(vp => {
        if (vendorStatus) {
          if (vendorStatus === 'pending') {
            if (vp.status !== 'submitted' && vp.status !== 'draft') return false
          } else if (vp.status !== vendorStatus) {
            return false
          }
        }
        if (vendorTier && (vp.tier || 'standard') !== vendorTier) return false
        return true
      })

      return !!matchingProfile
    })
  }

  // Get unique verticals for filter dropdown
  const { data: verticalsList } = await serviceClient
    .from('verticals')
    .select('id')
    .order('id')

  const availableVerticals = verticalsList?.map(v => v.id) || []

  // Type the users
  const typedUsers: UserProfile[] = filteredUsers.map(user => ({
    id: user.id as string,
    user_id: user.user_id as string,
    email: user.email as string,
    display_name: user.display_name as string | null,
    role: user.role as string | null,
    roles: user.roles as string[] | null,
    verticals: user.verticals as string[] | null,
    buyer_tier: user.buyer_tier as string | null,
    buyer_tier_expires_at: user.buyer_tier_expires_at as string | null,
    created_at: user.created_at as string,
    vendor_profiles: user.vendor_profiles as VendorProfile[] | null
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
            All Users
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            {totalCount.toLocaleString()} users total
          </p>
        </div>
      </div>

      <UsersTableClient
        users={typedUsers}
        verticals={availableVerticals}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        initialFilters={{ search, role, vertical, vendorStatus, vendorTier, buyerTier }}
      />
    </div>
  )
}
