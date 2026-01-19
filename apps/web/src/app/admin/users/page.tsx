import { createClient, createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import UsersTable from './UsersTable'

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

export default async function UsersPage() {
  await requireAdmin()

  // Use service client to bypass RLS and fetch all users
  const serviceClient = createServiceClient()
  const { data: users, error } = await serviceClient
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
      vendor_profiles (
        id,
        status,
        vertical_id,
        tier
      )
    `)
    .order('created_at', { ascending: false })

  // Log error for debugging
  if (error) {
    console.error('Error fetching users:', error)
  }

  // Get unique verticals from both user verticals and vendor profiles
  const verticals = new Set<string>()
  users?.forEach(user => {
    // Add from user's verticals array
    const userVerticals = user.verticals as string[] | null
    userVerticals?.forEach(v => {
      if (v) verticals.add(v)
    })
    // Add from vendor profiles
    const vps = user.vendor_profiles as VendorProfile[] | null
    vps?.forEach(vp => {
      if (vp.vertical_id) verticals.add(vp.vertical_id)
    })
  })

  // Type the users properly
  const typedUsers: UserProfile[] = (users || []).map(user => ({
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

  return (
    <div>
      <h1 style={{ color: '#333', marginBottom: 20 }}>All Users</h1>
      <UsersTable
        users={typedUsers}
        verticals={Array.from(verticals).sort()}
      />
    </div>
  )
}
