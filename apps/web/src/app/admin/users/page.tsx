import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'

export default async function UsersPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('user_profiles')
    .select('*')
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
                <th style={{ textAlign: 'left', padding: 15, color: '#666' }}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const userId = user.user_id as string
                const email = user.email as string
                const displayName = user.display_name as string | null
                const role = user.role as string | null
                const createdAt = user.created_at as string

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
                        backgroundColor: role === 'admin' ? '#e0e7ff' : '#f0f0f0',
                        color: role === 'admin' ? '#3730a3' : '#666'
                      }}>
                        {role || 'user'}
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
          <p style={{ color: '#666' }}>No users found.</p>
        </div>
      )}
    </div>
  )
}
