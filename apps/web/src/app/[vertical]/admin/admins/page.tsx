'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface VerticalAdmin {
  id: string
  user_id: string
  email: string
  display_name: string | null
  is_chief: boolean
  granted_at: string
}

export default function VerticalAdminManagementPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [admins, setAdmins] = useState<VerticalAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isChiefVerticalAdmin, setIsChiefVerticalAdmin] = useState(false)

  // Add admin form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [makeChief, setMakeChief] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchAdmins = async () => {
    try {
      const res = await fetch(`/api/admin/verticals/${vertical}/admins`)
      if (res.ok) {
        const data = await res.json()
        setAdmins(data.admins || [])
        setCurrentUserId(data.currentUserId)
        setIsPlatformAdmin(data.isPlatformAdmin)
        setIsChiefVerticalAdmin(data.isChiefVerticalAdmin)
      } else {
        const errData = await res.json()
        setError(errData.error || 'Failed to fetch vertical admins')
      }
    } catch (err) {
      console.error('Error fetching vertical admins:', err)
      setError('Failed to load vertical admins')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (vertical) {
      fetchAdmins()
    }
  }, [vertical])

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/admin/verticals/${vertical}/admins`, {
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
        setError(errData.error || 'Failed to add vertical admin')
      }
    } catch (err) {
      console.error('Error adding vertical admin:', err)
      setError('Failed to add vertical admin')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveAdmin = async (adminId: string, email: string) => {
    if (!confirm(`Remove admin access from ${email}?`)) return

    try {
      const res = await fetch(`/api/admin/verticals/${vertical}/admins/${adminId}`, {
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

  const canAddAdmins = isPlatformAdmin || isChiefVerticalAdmin

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
        <p>Loading...</p>
      </div>
    )
  }

  const verticalDisplayName = vertical === 'farmers_market' ? 'Farmers Market' : vertical

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
      {/* Back link */}
      <Link
        href={`/${vertical}/admin`}
        style={{
          color: colors.primary,
          textDecoration: 'none',
          fontSize: typography.sizes.sm,
          display: 'inline-block',
          marginBottom: spacing.md
        }}
      >
        &larr; Back to Admin Dashboard
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
            {verticalDisplayName} Admins
          </h1>
          <p style={{ margin: `${spacing['2xs']} 0 0 0`, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            Manage who has admin access to this vertical
          </p>
        </div>
        {canAddAdmins && (
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
            + Add Vertical Admin
          </button>
        )}
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
            Add Vertical Admin
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

            {isPlatformAdmin && (
              <div style={{ marginBottom: spacing.sm }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={makeChief}
                    onChange={(e) => setMakeChief(e.target.checked)}
                  />
                  <span>Make Chief Vertical Admin</span>
                </label>
                <p style={{ margin: `${spacing['2xs']} 0 0 ${spacing.md}`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                  Chief vertical admins can add/remove other vertical admins
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
                  No vertical admins found
                </td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={tdStyle}>{admin.email}</td>
                  <td style={tdStyle}>{admin.display_name || '-'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: admin.is_chief ? '#fef3c7' : '#e0e7ff',
                      color: admin.is_chief ? '#92400e' : '#3730a3',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold
                    }}>
                      {admin.is_chief ? 'Chief Admin' : 'Admin'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {new Date(admin.granted_at).toLocaleDateString()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {admin.user_id === currentUserId ? (
                      <span style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
                        (You)
                      </span>
                    ) : (isPlatformAdmin || (isChiefVerticalAdmin && !admin.is_chief)) ? (
                      <button
                        onClick={() => handleRemoveAdmin(admin.id, admin.email)}
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
                    ) : null}
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
          About Vertical Admins
        </h4>
        <ul style={{ margin: 0, paddingLeft: spacing.md, color: '#0c4a6e', fontSize: typography.sizes.sm }}>
          <li>Vertical admins can manage content within this vertical (vendors, listings, markets)</li>
          <li>Chief vertical admins can add/remove other vertical admins (but not chief admins)</li>
          <li>Platform admins can add/remove any vertical admin including chief admins</li>
          <li>There must always be at least one chief admin for each vertical</li>
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
