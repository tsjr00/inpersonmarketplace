'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface Admin {
  user_id: string
  email: string
  display_name: string | null
  is_chief_platform_admin: boolean
  created_at: string
}

export default function AdminManagementPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isChiefAdmin, setIsChiefAdmin] = useState(false)

  // Add admin form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [makeChief, setMakeChief] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchAdmins = async () => {
    try {
      const res = await fetch('/api/admin/admins')
      if (res.ok) {
        const data = await res.json()
        setAdmins(data.admins || [])
        setCurrentUserId(data.currentUserId)
        setIsChiefAdmin(data.isChiefAdmin)
      } else {
        const errData = await res.json()
        setError(errData.error || 'Failed to fetch admins')
      }
    } catch (err) {
      console.error('Error fetching admins:', err)
      setError('Failed to load admins')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAdmins()
  }, [])

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAdminEmail, makeChief })
      })

      if (res.ok) {
        await fetchAdmins()
        setNewAdminEmail('')
        setMakeChief(false)
        setShowAddForm(false)
      } else {
        const errData = await res.json()
        setError(errData.error || 'Failed to add admin')
      }
    } catch (err) {
      console.error('Error adding admin:', err)
      setError('Failed to add admin')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveAdmin = async (userId: string, email: string) => {
    if (!confirm(`Remove admin access from ${email}?`)) return

    try {
      const res = await fetch(`/api/admin/admins/${userId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        await fetchAdmins()
      } else {
        const errData = await res.json()
        alert(errData.error || 'Failed to remove admin')
      }
    } catch (err) {
      console.error('Error removing admin:', err)
      alert('Failed to remove admin')
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
      {/* Back link */}
      <Link
        href="/admin"
        style={{
          color: colors.primary,
          textDecoration: 'none',
          fontSize: typography.sizes.sm,
          display: 'inline-block',
          marginBottom: spacing.md
        }}
      >
        &larr; Back to Platform Admin
      </Link>

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
        flexWrap: 'wrap',
        gap: spacing.sm
      }}>
        <div>
          <h1 style={{ margin: 0, color: colors.textPrimary, fontSize: typography.sizes['2xl'] }}>
            Platform Admins
          </h1>
          <p style={{ margin: `${spacing['2xs']} 0 0 0`, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            Manage who has platform-wide admin access
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontWeight: typography.weights.semibold,
            cursor: 'pointer'
          }}
        >
          + Add Platform Admin
        </button>
      </div>

      {error && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          borderRadius: radius.sm,
          marginBottom: spacing.md
        }}>
          {error}
        </div>
      )}

      {/* Add Admin Form */}
      {showAddForm && (
        <div style={{
          padding: spacing.md,
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          marginBottom: spacing.md,
          boxShadow: shadows.sm
        }}>
          <h3 style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.lg }}>
            Add Platform Admin
          </h3>
          <form onSubmit={handleAddAdmin}>
            <div style={{ marginBottom: spacing.sm }}>
              <label style={{ display: 'block', marginBottom: spacing['2xs'], fontWeight: typography.weights.medium }}>
                Email Address
              </label>
              <input
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="user@example.com"
                style={{
                  width: '100%',
                  maxWidth: 400,
                  padding: spacing.xs,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.base
                }}
              />
              <p style={{ margin: `${spacing['2xs']} 0 0 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                User must already have an account
              </p>
            </div>

            {isChiefAdmin && (
              <div style={{ marginBottom: spacing.sm }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={makeChief}
                    onChange={(e) => setMakeChief(e.target.checked)}
                  />
                  <span>Make Chief Platform Admin</span>
                </label>
                <p style={{ margin: `${spacing['2xs']} 0 0 ${spacing.md}`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  Chief admins can add/remove other platform admins
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: spacing.xs }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: submitting ? colors.borderMuted : colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: submitting ? 'not-allowed' : 'pointer'
                }}
              >
                {submitting ? 'Adding...' : 'Add Admin'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false)
                  setNewAdminEmail('')
                  setMakeChief(false)
                }}
                style={{
                  padding: `${spacing.xs} ${spacing.md}`,
                  backgroundColor: colors.surfaceMuted,
                  color: colors.textPrimary,
                  border: 'none',
                  borderRadius: radius.sm,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admins List */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: radius.md,
        boxShadow: shadows.sm,
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: colors.surfaceMuted }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Added</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: spacing.lg, textAlign: 'center', color: colors.textMuted }}>
                  No platform admins found
                </td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.user_id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>{admin.email}</td>
                  <td style={tdStyle}>{admin.display_name || '-'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: admin.is_chief_platform_admin ? '#fef3c7' : '#e0e7ff',
                      color: admin.is_chief_platform_admin ? '#92400e' : '#3730a3',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold
                    }}>
                      {admin.is_chief_platform_admin ? 'Chief Admin' : 'Admin'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {new Date(admin.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {admin.user_id === currentUserId ? (
                      <span style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
                        (You)
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRemoveAdmin(admin.user_id, admin.email)}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm,
                          cursor: 'pointer'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: spacing.md,
        padding: spacing.sm,
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: radius.sm
      }}>
        <h4 style={{ margin: `0 0 ${spacing['2xs']} 0`, color: '#0369a1', fontSize: typography.sizes.sm }}>
          About Platform Admins
        </h4>
        <ul style={{ margin: 0, paddingLeft: spacing.md, color: '#0c4a6e', fontSize: typography.sizes.sm }}>
          <li>Platform admins have access to all verticals and can manage all content</li>
          <li>Chief Platform Admins can add/remove other platform admins</li>
          <li>Only Chief Platform Admins can promote others to Chief status</li>
          <li>There must always be at least one Chief Platform Admin</li>
        </ul>
      </div>
    </div>
  )
}

const thStyle = {
  padding: spacing.sm,
  textAlign: 'left' as const,
  fontWeight: typography.weights.semibold,
  fontSize: typography.sizes.sm,
  color: colors.textSecondary,
  borderBottom: `2px solid ${colors.border}`
}

const tdStyle = {
  padding: spacing.sm,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary
}
