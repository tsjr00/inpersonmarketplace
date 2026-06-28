'use client'

import { useCallback, useEffect, useState } from 'react'
import ManagerCard from './ManagerCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface GroupView {
  groupId: string
  vendorName: string
  weekCount: number
  cancelledDays: number
  refundCapDays: number
  owedDays: number
  owedCents: number
  resolved: boolean
}

interface SeasonView {
  season: { id: string; name: string; start_date: string; end_date: string; refund_cap_days: number; status: string }
  groups: GroupView[]
}

type Resolution = 'off_platform'

interface Pending {
  seasonId: string
  groupId: string
  resolution: Resolution
  owedCents: number
  vendorName: string
}

function fmtDate(d: string): string {
  const date = new Date(`${d}T00:00:00`)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Phase E — manager season-end settlement card. Lists ended (not-yet-settled)
 * seasons and, per paid group, the cancelled days vs the refund cap and the owed
 * value (manager-held base, per-day prorated). The manager resolves each shortfall
 * as a booth credit (rollover) or off-platform. No money moves backward; the
 * credit is funded from the booth payment the manager already received.
 */
export default function MarketSeasonSettlementCard({ marketId }: { marketId: string }) {
  const [items, setItems] = useState<SeasonView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not load seasons.')
        return
      }
      const today = todayStr()
      const eligible = ((data.seasons ?? []) as Array<{ id: string; end_date: string | null; status: string }>)
        .filter((s) => !!s.end_date && s.end_date <= today && s.status !== 'settled')
      const detailed: SeasonView[] = []
      for (const s of eligible) {
        const r = await fetch(`/api/market-manager/${marketId}/seasons/${s.id}/settlement`)
        if (r.ok) {
          const d = await r.json()
          detailed.push({ season: d.season, groups: d.groups })
        }
      }
      setItems(detailed)
    } catch {
      setError('Network error loading settlement data.')
    } finally {
      setLoading(false)
    }
  }, [marketId])

  useEffect(() => { load() }, [load])

  const confirmResolve = async () => {
    if (!pending) return
    setSubmitting(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/seasons/${pending.seasonId}/settlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: pending.groupId, resolution: pending.resolution }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(data.error || 'Could not settle this group.')
      } else {
        setNotice(`Marked ${pending.vendorName} settled off-platform.`)
        await load()
      }
    } catch {
      setNotice('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
      setPending(null)
    }
  }

  const muted = { color: colors.textMuted, fontSize: typography.sizes.sm, margin: 0 }

  return (
    <ManagerCard
      id="settlement"
      title="Season settlement"
      description="For ended seasons where a vendor lost more than the refund cap to manager-cancelled days: make them whole directly and record it here. (In-platform credit / make-up-date resolution arrives with the season make-up feature.)"
    >
      {loading && <p style={muted}>Loading…</p>}
      {error && <p style={{ ...muted, color: '#721c24' }}>{error}</p>}
      {notice && (
        <p style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.sm,
          color: '#155724',
          backgroundColor: '#d4edda',
          padding: `${spacing['3xs']} ${spacing.xs}`,
          borderRadius: radius.sm,
        }}>
          {notice}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p style={muted}>No seasons are ready to settle.</p>
      )}

      {items.map(({ season, groups }) => {
        const shortfall = groups.filter((g) => g.owedDays > 0)
        return (
          <div key={season.id} style={{ marginBottom: spacing.md }}>
            <h3 style={{
              margin: `0 0 ${spacing.xs} 0`,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
            }}>
              {season.name} · ended {fmtDate(season.end_date)}
            </h3>
            {shortfall.length === 0 ? (
              <p style={muted}>No vendor exceeded the {season.refund_cap_days}-day cap — nothing to settle.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                {shortfall.map((g) => (
                  <div
                    key={g.groupId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                      padding: spacing.sm,
                      backgroundColor: colors.surfaceElevated,
                      border: `1px solid ${colors.border}`,
                      borderRadius: radius.md,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                        {g.vendorName}
                      </div>
                      <div style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                        {g.cancelledDays} cancelled · cap {g.refundCapDays} → {g.owedDays} day(s) owed = {fmtPrice(g.owedCents)}
                      </div>
                    </div>
                    {g.resolved ? (
                      <span style={{
                        padding: `${spacing['3xs']} ${spacing.xs}`,
                        backgroundColor: '#d4edda',
                        color: '#155724',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
                      }}>
                        Settled
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPending({ seasonId: season.id, groupId: g.groupId, resolution: 'off_platform', owedCents: g.owedCents, vendorName: g.vendorName })}
                        style={{
                          padding: `${spacing['2xs']} ${spacing.sm}`,
                          backgroundColor: colors.primary,
                          color: '#fff',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          cursor: 'pointer',
                          minHeight: 44,
                        }}
                      >
                        Settled off-platform
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={!!pending}
        title="Mark settled off-platform?"
        message={`Record that you've made ${pending?.vendorName ?? 'this vendor'} whole directly, outside the platform (about ${fmtPrice(pending?.owedCents ?? 0)} for the days beyond the cap). No credit is added here.`}
        confirmLabel={submitting ? 'Working…' : 'Confirm'}
        cancelLabel="Cancel"
        onConfirm={confirmResolve}
        onCancel={() => setPending(null)}
      />
    </ManagerCard>
  )
}
