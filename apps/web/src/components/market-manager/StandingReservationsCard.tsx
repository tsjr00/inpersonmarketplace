'use client'

import { useEffect, useState } from 'react'
import ManagerCard from './ManagerCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface StandingReservation {
  id: string
  dayOfWeek: number
  status: string
  spotLabel: string | null
  truckName: string | null
  approvedAt: string | null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function weekdayName(dow: number): string {
  return WEEKDAYS[dow] ?? '—'
}

function describe(r: StandingReservation): string {
  const truck = r.truckName || 'Food truck'
  const spot = r.spotLabel || 'a spot'
  return `${truck} · ${spot} · every ${weekdayName(r.dayOfWeek)}`
}

/**
 * FT (P4a) — manager view of recurring weekly spot holds for a park.
 * Requests (status 'requested') can be approved or denied; active holds
 * (status 'active') can be revoked. Both denial and revoke go through a
 * ConfirmDialog (window.confirm is blocked on mobile). Self-fetches on mount
 * and re-fetches after each action.
 */
export default function StandingReservationsCard({ marketId }: { marketId: string }) {
  const [reservations, setReservations] = useState<StandingReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; label: string; message: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/standing-reservations`)
      if (!res.ok) { setReservations([]); return }
      const data = await res.json()
      setReservations(Array.isArray(data.reservations) ? data.reservations : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const res = await fetch(`/api/market-manager/${marketId}/standing-reservations`)
        if (!res.ok) { if (!cancelled) setReservations([]); return }
        const data = await res.json()
        if (!cancelled) setReservations(Array.isArray(data.reservations) ? data.reservations : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [marketId])

  async function act(reservationId: string, action: 'approve' | 'revoke') {
    setBusyId(reservationId)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/standing-reservations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: reservationId, action }),
      })
      if (res.ok) await load()
    } finally {
      setBusyId(null)
    }
  }

  const requests = reservations.filter((r) => r.status === 'requested')
  const active = reservations.filter((r) => r.status === 'active')

  const buttonStyle = (variant: 'primary' | 'muted' | 'danger') => ({
    padding: `${spacing['3xs']} ${spacing.sm}`,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    borderRadius: radius.sm,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    color: variant === 'muted' ? colors.textSecondary : '#fff',
    backgroundColor: variant === 'primary' ? colors.primary : variant === 'danger' ? '#dc2626' : 'transparent',
    border: variant === 'muted' ? `1px solid ${colors.border}` : 'none',
  })

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    flexWrap: 'wrap' as const,
  }

  return (
    <ManagerCard
      id="recurring"
      title="Recurring spot holds"
      description="Weekly spot holds food trucks have asked to keep. Approve a request to reserve that spot every week; revoke a hold to free it up."
    >
      {loading ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading…</p>
      ) : reservations.length === 0 ? (
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
          No recurring spot holds yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          {requests.length > 0 && (
            <div>
              <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textSecondary, marginBottom: spacing['3xs'] }}>
                Requests ({requests.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                {requests.map((r) => (
                  <div key={r.id} style={rowStyle}>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, minWidth: 0 }}>
                      {describe(r)}
                    </span>
                    <div style={{ display: 'flex', gap: spacing.xs }}>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, 'approve')}
                        style={buttonStyle('primary')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => setConfirm({ id: r.id, label: 'Deny', message: `Deny the weekly hold request for ${describe(r)}?` })}
                        style={buttonStyle('muted')}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {active.length > 0 && (
            <div>
              <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textSecondary, marginBottom: spacing['3xs'] }}>
                Active holds ({active.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                {active.map((r) => (
                  <div key={r.id} style={rowStyle}>
                    <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, minWidth: 0 }}>
                      {describe(r)}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => setConfirm({ id: r.id, label: 'Revoke', message: `Revoke the weekly hold for ${describe(r)}? The spot will be open for others.` })}
                      style={buttonStyle('danger')}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        variant="danger"
        title={confirm?.label === 'Deny' ? 'Deny weekly hold' : 'Revoke weekly hold'}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label}
        onConfirm={() => {
          if (confirm) act(confirm.id, 'revoke')
          setConfirm(null)
        }}
        onCancel={() => setConfirm(null)}
      />
    </ManagerCard>
  )
}
