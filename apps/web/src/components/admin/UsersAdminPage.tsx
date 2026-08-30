/**
 * Users admin page body — server side of the merged users page (admin UI
 * rebuild phase 3, first merge, owner 2026-08-30). Both routes render this:
 * /[vertical]/admin/users with scope = that vertical, /admin/users with
 * scope = null (all verticals). One query, superset of the two former pages:
 * always selects verticals + buyer_tier_expires_at; the scope adds the
 * `.contains('verticals', [scope])` filter; the platform 'pending' vendor
 * status means submitted OR draft (kept); vendor-side filters match only
 * profiles inside the scope.
 */

import { createServiceClient } from '@/lib/supabase/server'
import UsersAdminTable, { type AdminUserRow, type AdminVendorProfile } from './UsersAdminTable'

export interface UsersSearchParams {
  page?: string
  limit?: string
  search?: string
  role?: string
  vertical?: string
  vendorStatus?: string
  vendorTier?: string
  buyerTier?: string
}

interface UsersAdminPageProps {
  scope: string | null
  basePath: string
  searchParams: UsersSearchParams
}

export default async function UsersAdminPage({ scope, basePath, searchParams }: UsersAdminPageProps) {
  const {
    page = '1', limit = '20', search = '', role = '',
    vertical = '', vendorStatus = '', vendorTier = '', buyerTier = '',
  } = searchParams

  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  const serviceClient = createServiceClient()

  let query = serviceClient
    .from('user_profiles')
    .select(`
      id, user_id, email, display_name, role, roles, verticals,
      buyer_tier, buyer_tier_expires_at, deleted_at, created_at,
      vendor_profiles!left ( id, status, vertical_id, tier )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (scope) query = query.contains('verticals', [scope])
  else if (vertical) query = query.contains('verticals', [vertical])
  if (search) query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
  if (role) query = query.contains('roles', [role])
  if (buyerTier) query = query.eq('buyer_tier', buyerTier)
  query = query.range(offset, offset + pageSize - 1)

  const { data: users, count, error } = await query
  if (error) {
    console.error('Error fetching users:', error)
  }

  // Vendor-side filters stay client-side (nested data); a profile only counts
  // when it is inside the scope.
  let filtered = users || []
  if (vendorStatus || vendorTier) {
    filtered = filtered.filter(user => {
      const profiles = (user.vendor_profiles as AdminVendorProfile[] | null || [])
        .filter(vp => !scope || vp.vertical_id === scope)
      if (profiles.length === 0) return false
      return profiles.some(vp => {
        if (vendorStatus) {
          if (vendorStatus === 'pending') {
            if (vp.status !== 'submitted' && vp.status !== 'draft') return false
          } else if (vp.status !== vendorStatus) {
            return false
          }
        }
        if (vendorTier && (vp.tier || 'free') !== vendorTier) return false
        return true
      })
    })
  }

  // Vertical list for the all-scope filter dropdown.
  let availableVerticals: string[] = []
  if (!scope) {
    const { data: verticalsList } = await serviceClient
      .from('verticals')
      .select('vertical_id')
      .eq('is_active', true)
      .order('vertical_id')
    availableVerticals = (verticalsList || []).map(v => v.vertical_id as string)
  }

  const typedUsers: AdminUserRow[] = filtered.map(user => ({
    id: user.id as string,
    user_id: user.user_id as string,
    email: (user.email as string | null) ?? null,
    display_name: user.display_name as string | null,
    role: user.role as string | null,
    roles: user.roles as string[] | null,
    verticals: user.verticals as string[] | null,
    buyer_tier: user.buyer_tier as string | null,
    buyer_tier_expires_at: user.buyer_tier_expires_at as string | null,
    deleted_at: (user as Record<string, unknown>).deleted_at as string | null,
    created_at: user.created_at as string,
    vendor_profiles: user.vendor_profiles as AdminVendorProfile[] | null,
  }))

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
          {scope ? 'Users' : 'All Users'}
        </h1>
        <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
          {totalCount.toLocaleString()} users {scope ? 'in this vertical' : 'total'}
        </p>
      </div>
      <UsersAdminTable
        users={typedUsers}
        scope={scope}
        verticals={availableVerticals}
        basePath={basePath}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        initialFilters={{ search, role, vertical, vendorStatus, vendorTier, buyerTier }}
      />
    </div>
  )
}
