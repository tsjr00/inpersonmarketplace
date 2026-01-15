import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

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
  }[]
}

// Helper to determine display role
function getDisplayRole(user: UserProfile): string {
  const roles: string[] = []

  // Check if admin
  if (user.role === 'admin' || user.roles?.includes('admin')) {
    roles.push('admin')
  }

  // Check if vendor (has any vendor profile)
  if (user.vendor_profiles && user.vendor_profiles.length > 0) {
    roles.push('vendor')
  }

  // Check if buyer (default, or explicit in roles)
  if (user.roles?.includes('buyer') || roles.length === 0) {
    if (!roles.includes('admin')) { // Don't show buyer for admins
      roles.push('buyer')
    }
  }

  return roles.join(', ')
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
        vertical_id
      )
    `)
    .order('created_at', { ascending: false })

  const typedUsers = users as unknown as UserProfile[] | null

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30
      }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
            Users
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            {typedUsers?.length || 0} total users
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

      {/* Users Table */}
      {typedUsers && typedUsers.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Name
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Role(s)
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Vendor Status
                </th>
                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#495057' }}>
                  Joined
                </th>
              </tr>
            </thead>
            <tbody>
              {typedUsers.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  {/* Name */}
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 500, color: '#333' }}>
                      {user.display_name || 'No name'}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      ID: {user.user_id.slice(0, 8)}...
                    </div>
                  </td>

                  {/* Role(s) */}
                  <td style={{ padding: 12 }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: getDisplayRole(user).includes('admin')
                        ? '#e7d6ff'
                        : getDisplayRole(user).includes('vendor')
                        ? '#d1f4ff'
                        : '#f3f4f6',
                      color: getDisplayRole(user).includes('admin')
                        ? '#6b21a8'
                        : getDisplayRole(user).includes('vendor')
                        ? '#0369a1'
                        : '#6b7280'
                    }}>
                      {getDisplayRole(user)}
                    </span>
                  </td>

                  {/* Vendor Status */}
                  <td style={{ padding: 12 }}>
                    {user.vendor_profiles && user.vendor_profiles.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {user.vendor_profiles.map((vp) => (
                          <span
                            key={vp.id}
                            style={{
                              padding: '3px 10px',
                              borderRadius: 10,
                              fontSize: 12,
                              fontWeight: 600,
                              backgroundColor:
                                vp.status === 'approved' ? '#d1fae5' :
                                vp.status === 'rejected' ? '#fee2e2' :
                                '#fef3c7',
                              color:
                                vp.status === 'approved' ? '#065f46' :
                                vp.status === 'rejected' ? '#991b1b' :
                                '#92400e',
                              display: 'inline-block'
                            }}
                          >
                            {vp.vertical_id}: {vp.status}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#999', fontSize: 13 }}>-</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td style={{ padding: 12, color: '#666', fontSize: 14 }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 60,
          textAlign: 'center',
          color: '#666'
        }}>
          <p>No users found.</p>
        </div>
      )}
    </div>
  )
}
