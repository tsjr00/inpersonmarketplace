import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'

// Helper function to determine display role
function getDisplayRole(user: {
  role?: string | null
  roles?: string[] | null
  vendor_profiles?: { id: string; status: string; vertical_id: string }[] | null
}): { label: string; isAdmin: boolean; isVendor: boolean } {
  const roles: string[] = []

  // Check if admin (check BOTH columns)
  const isAdmin = user.role === 'admin' || user.roles?.includes('admin')
  if (isAdmin) {
    roles.push('admin')
  }

  // Check if vendor (has any vendor profile)
  const isVendor = user.vendor_profiles && user.vendor_profiles.length > 0
  if (isVendor) {
    roles.push('vendor')
  }

  // Check if buyer (default, or explicit in roles)
  if (user.roles?.includes('buyer') || roles.length === 0) {
    if (!isAdmin) { // Don't show buyer for admins
      roles.push('buyer')
    }
  }

  return {
    label: roles.join(', '),
    isAdmin: !!isAdmin,
    isVendor: !!isVendor
  }
}

export default async function UsersPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Fetch users with their roles and vendor profiles
  const { data: users } = await supabase
    .from('user_profiles')
    .select(`
      id,
      user_id,
      email,
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

  return (
    <div>
      <h1 style={{ color: '#333', marginBottom: 30 }}>All Users</h1>

      <div style={{ marginBottom: 15, color: '#666' }}>
        {users?.length || 0} user{users?.length !== 1 ? 's' : ''} total
      </div>

      {users && users.length > 0 ? (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Email</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Name</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Role</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Vendor Status</th>
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const userId = user.user_id as string
                const email = user.email as string
                const displayName = user.display_name as string | null
                const createdAt = user.created_at as string
                const vendorProfiles = user.vendor_profiles as { id: string; status: string; vertical_id: string }[] | null

                const roleInfo = getDisplayRole({
                  role: user.role as string | null,
                  roles: user.roles as string[] | null,
                  vendor_profiles: vendorProfiles
                })

                return (
                  <tr key={userId} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 15, color: '#333' }}>{email}</td>
                    <td style={{ padding: 15, color: '#666' }}>{displayName || 'N/A'}</td>
                    <td style={{ padding: 15 }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: roleInfo.isAdmin ? '#e0e7ff' : roleInfo.isVendor ? '#dbeafe' : '#f0f0f0',
                        color: roleInfo.isAdmin ? '#3730a3' : roleInfo.isVendor ? '#1e40af' : '#666'
                      }}>
                        {roleInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: 15 }}>
                      {vendorProfiles && vendorProfiles.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {vendorProfiles.map((vp) => (
                            <span
                              key={vp.id}
                              style={{
                                padding: '3px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 500,
                                backgroundColor:
                                  vp.status === 'approved' ? '#d1fae5' :
                                  vp.status === 'rejected' ? '#fee2e2' :
                                  '#fef3c7',
                                color:
                                  vp.status === 'approved' ? '#065f46' :
                                  vp.status === 'rejected' ? '#991b1b' :
                                  '#92400e'
                              }}
                            >
                              {vp.vertical_id}: {vp.status}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: '#999', fontSize: 12 }}>—</span>
                      )}
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
          <p style={{ color: '#666' }}>No users found.</p>
        </div>
      )}
    </div>
  )
}
