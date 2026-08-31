'use client'

/**
 * AdminsManager — the ONE implementation behind /admin/admins (platform
 * admins) and /[vertical]/admin/admins (vertical admins). Admin UI rebuild
 * phase 3, merge 3/11, owner 2026-08-31.
 *
 * UNLIKE the users/listings merges, these two pages manage DIFFERENT
 * permission systems, not one dataset behind a scope filter:
 *   · platform mode — platform admins live on user_profiles (role/roles +
 *     is_chief_platform_admin), via GET/POST /api/admin/admins and
 *     DELETE /api/admin/admins/[userId] (keyed by user_id);
 *   · vertical mode — vertical admins are vertical_admins rows, via
 *     GET/POST /api/admin/verticals/[vertical]/admins and
 *     DELETE .../admins/[adminId] (keyed by the row id).
 * So this component merges the UI SHAPE only (list + add form + chief flag +
 * remove + info box); every endpoint and permission gate is kept verbatim
 * per mode — the APIs' S4-2 escalation guards are untouched.
 *
 * Who can do what (mirrors the pre-merge pages exactly):
 *   platform — Add shown to all viewers (the API 403s non-platform-admins);
 *     "make chief" only for chief platform admins; Remove on any row but
 *     your own (API enforces chief-on-chief + last-chief rules).
 *   vertical — Add only for platform admins or chief vertical admins;
 *     "make chief" only for platform admins; Remove only for platform
 *     admins, or chief vertical admins on non-chief rows.
 *
 * One row-list at ALL widths (owner standard from the users merge — the old
 * platform copy was a desktop table with no mobile view at all).
 */

import { useState, useEffect } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { useStatusBanner } from '@/hooks/useStatusBanner'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import AdminMobileRow from '@/components/admin/AdminMobileRow'

interface AdminRow {
  /** React key + DELETE path segment: user_id (platform) / row id (vertical). */
  removeId: string
  user_id: string
  email: string
  display_name: string | null
  isChief: boolean
  addedAt: string
}

interface AdminsManagerProps {
  mode: 'platform' | 'vertical'
  /** Required in vertical mode. */
  vertical?: string
}

export default function AdminsManager({ mode, vertical }: AdminsManagerProps) {
  const isPlatformMode = mode === 'platform'
  const listUrl = isPlatformMode ? '/api/admin/admins' : `/api/admin/verticals/${vertical}/admins`

  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // Platform mode: chief platform admin. Vertical mode: the two caller flags.
  const [isChiefAdmin, setIsChiefAdmin] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [isChiefVerticalAdmin, setIsChiefVerticalAdmin] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [makeChief, setMakeChief] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { showBanner, StatusBanner } = useStatusBanner()
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string; confirmLabel: string;
    variant: 'default' | 'danger'; onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} })

  const fetchAdmins = async () => {
    try {
      const res = await fetch(listUrl)
      if (res.ok) {
        const data = await res.json()
        if (isPlatformMode) {
          // Platform rows come straight off user_profiles.
          setAdmins((data.admins || []).map((a: { user_id: string; email: string; display_name: string | null; is_chief_platform_admin: boolean; created_at: string }) => ({
            removeId: a.user_id,
            user_id: a.user_id,
            email: a.email,
            display_name: a.display_name,
            isChief: a.is_chief_platform_admin,
            addedAt: a.created_at,
          })))
          setIsChiefAdmin(data.isChiefAdmin)
        } else {
          // Vertical rows are vertical_admins joined with user details.
          setAdmins((data.admins || []).map((a: { id: string; user_id: string; email: string; display_name: string | null; is_chief: boolean; granted_at: string }) => ({
            removeId: a.id,
            user_id: a.user_id,
            email: a.email,
            display_name: a.display_name,
            isChief: a.is_chief,
            addedAt: a.granted_at,
          })))
          setIsPlatformAdmin(data.isPlatformAdmin)
          setIsChiefVerticalAdmin(data.isChiefVerticalAdmin)
        }
        setCurrentUserId(data.currentUserId)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl])

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(listUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newAdminEmail, makeChief }),
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

  const handleRemoveAdmin = (removeId: string, email: string) => {
    setConfirmDialog({
      open: true,
      title: 'Remove Admin',
      message: `Remove admin access from ${email}?`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`${listUrl}/${removeId}`, { method: 'DELETE' })
          if (res.ok) {
            await fetchAdmins()
          } else {
            const errData = await res.json()
            showBanner('error', errData.error || 'Failed to remove admin')
          }
        } catch (err) {
          console.error('Error removing admin:', err)
          showBanner('error', 'Failed to remove admin')
        }
      },
    })
  }

  // Per-mode capability + copy (kept identical to each pre-merge page).
  const canAdd = isPlatformMode ? true : (isPlatformAdmin || isChiefVerticalAdmin)
  const canMakeChief = isPlatformMode ? isChiefAdmin : isPlatformAdmin
  const canRemoveRow = (row: AdminRow) =>
    row.user_id !== currentUserId &&
    (isPlatformMode ? true : (isPlatformAdmin || (isChiefVerticalAdmin && !row.isChief)))

  const verticalDisplayName = !isPlatformMode && vertical ? term(vertical, 'display_name') : ''
  const title = isPlatformMode ? 'Platform Admins' : `${verticalDisplayName} Admins`
  const subtitle = isPlatformMode
    ? 'Manage who has platform-wide admin access'
    : 'Manage who has admin access to this vertical'
  const addLabel = isPlatformMode ? '+ Add Platform Admin' : '+ Add Vertical Admin'
  const addFormTitle = isPlatformMode ? 'Add Platform Admin' : 'Add Vertical Admin'
  const chiefLabel = isPlatformMode ? 'Make Chief Platform Admin' : 'Make Chief Vertical Admin'
  const chiefHelp = isPlatformMode
    ? 'Chief admins can add/remove other platform admins'
    : 'Chief vertical admins can add/remove other vertical admins'
  const emptyText = isPlatformMode ? 'No platform admins found' : 'No vertical admins found'
  const infoTitle = isPlatformMode ? 'About Platform Admins' : 'About Vertical Admins'
  const infoBullets = isPlatformMode
    ? [
        'Platform admins have access to all verticals and can manage all content',
        'Chief Platform Admins can add/remove other platform admins',
        'Only Chief Platform Admins can promote others to Chief status',
        'There must always be at least one Chief Platform Admin',
      ]
    : [
        'Vertical admins can manage content within this vertical (vendors, listings, markets)',
        'Chief vertical admins can add/remove other vertical admins (but not chief admins)',
        'Platform admins can add/remove any vertical admin including chief admins',
        'There must always be at least one chief admin for each vertical',
      ]

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.sm }}>
        <div>
          <h1 style={{ margin: 0, color: colors.textPrimary, fontSize: typography.sizes['2xl'] }}>{title}</h1>
          <p style={{ margin: `${spacing['2xs']} 0 0 0`, color: colors.textSecondary, fontSize: typography.sizes.sm }}>{subtitle}</p>
        </div>
        {canAdd && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, fontWeight: typography.weights.semibold, cursor: 'pointer' }}
          >
            {addLabel}
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: spacing.sm, backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: radius.sm, marginBottom: spacing.md }}>
          {error}
        </div>
      )}

      {/* Add Admin Form */}
      {showAddForm && (
        <div style={{ padding: spacing.md, backgroundColor: colors.surfaceElevated, border: `1px solid ${colors.border}`, borderRadius: radius.md, marginBottom: spacing.md, boxShadow: shadows.sm }}>
          <h3 style={{ margin: `0 0 ${spacing.sm} 0`, fontSize: typography.sizes.lg }}>{addFormTitle}</h3>
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
                style={{ width: '100%', maxWidth: 400, padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.base }}
              />
              <p style={{ margin: `${spacing['2xs']} 0 0 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
                User must already have an account
              </p>
            </div>

            {canMakeChief && (
              <div style={{ marginBottom: spacing.sm }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, cursor: 'pointer' }}>
                  <input type="checkbox" checked={makeChief} onChange={(e) => setMakeChief(e.target.checked)} />
                  <span>{chiefLabel}</span>
                </label>
                <p style={{ margin: `${spacing['2xs']} 0 0 ${spacing.md}`, color: colors.textMuted, fontSize: typography.sizes.sm }}>{chiefHelp}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: spacing.xs }}>
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: submitting ? colors.borderMuted : colors.primary, color: 'white', border: 'none', borderRadius: radius.sm, fontWeight: typography.weights.semibold, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Adding...' : 'Add Admin'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setNewAdminEmail(''); setMakeChief(false) }}
                style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: colors.surfaceMuted, color: colors.textPrimary, border: 'none', borderRadius: radius.sm, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admins — one row-list at every width (owner standard). */}
      <div style={{ backgroundColor: 'white', borderRadius: radius.md, boxShadow: shadows.sm }}>
        {admins.length === 0 ? (
          <div className="admin-mobile-empty">{emptyText}</div>
        ) : (
          admins.map((admin) => {
            const isSelf = admin.user_id === currentUserId
            const roleBadge = (
              <span style={{
                padding: `2px ${spacing['2xs']}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                backgroundColor: admin.isChief ? '#fef3c7' : '#e0e7ff',
                color: admin.isChief ? '#92400e' : '#3730a3',
              }}>
                {admin.isChief ? 'Chief Admin' : 'Admin'}
              </span>
            )
            const rightAction = canRemoveRow(admin) ? (
              <button
                onClick={() => handleRemoveAdmin(admin.removeId, admin.email)}
                style={{ padding: `${spacing['3xs']} ${spacing.xs}`, backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: radius.sm, fontSize: typography.sizes.sm, cursor: 'pointer', minHeight: 36 }}
              >
                Remove
              </button>
            ) : isSelf ? (
              <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs, fontStyle: 'italic' }}>(You)</span>
            ) : null
            return (
              <AdminMobileRow
                key={admin.removeId}
                title={admin.display_name || admin.email}
                statusBadge={roleBadge}
                secondary={
                  <>
                    <span style={{ wordBreak: 'break-all' }}>{admin.email}</span>
                    {' · '}
                    <span>added {new Date(admin.addedAt).toLocaleDateString()}</span>
                  </>
                }
                rightAction={rightAction}
              />
            )
          })
        )}
      </div>

      {/* Info Box */}
      <div style={{ marginTop: spacing.md, padding: spacing.sm, backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: radius.sm }}>
        <h4 style={{ margin: `0 0 ${spacing['2xs']} 0`, color: '#0369a1', fontSize: typography.sizes.sm }}>{infoTitle}</h4>
        <ul style={{ margin: 0, paddingLeft: spacing.md, color: '#0c4a6e', fontSize: typography.sizes.sm }}>
          {infoBullets.map(b => <li key={b}>{b}</li>)}
        </ul>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, open: false })) }}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
      <StatusBanner />
    </div>
  )
}
