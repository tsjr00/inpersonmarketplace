import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import UsersTable from './UsersTable'

interface AdminUsersPageProps {
  params: Promise<{ vertical: string }>
}

interface UserProfile {
  id: string
  user_id: string
  display_name: string | null
  role: string
  roles: string[] | null
  created_at: string
  vendor_profiles: {
    id: string
    status: string
    vertical_id: string
    tier?: string
  }[]
}

export default async function AdminUsersPage({ params }: AdminUsersPageProps) {
  const { vertical } = await params
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

  // Fetch all users with their vendor profiles
  const { data: users } = await supabase
    .from('user_profiles')
    .select(`
      id,
      user_id,
      display_name,
      role,
      roles,
      created_at,
      vendor_profiles (
        id,
        status,
        vertical_id,
        tier
      )
    `)
    .order('created_at', { ascending: false })

  const typedUsers = users as unknown as UserProfile[] | null

  // Filter to only users in this vertical
  // Include all buyers (no vendor profile) and vendors who have a profile in this vertical
  const verticalUsers = typedUsers?.filter(user => {
    // If user has no vendor profiles, they're a buyer - include them
    if (!user.vendor_profiles || user.vendor_profiles.length === 0) {
      return true
    }
    // If user has vendor profiles, only include if they have one in this vertical
    return user.vendor_profiles.some(vp => vp.vertical_id === vertical)
  }) || []

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

      <UsersTable users={verticalUsers} vertical={vertical} />
    </div>
  )
}
