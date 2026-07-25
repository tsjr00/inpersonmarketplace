'use client'

import { useEffect, useMemo, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  groupStatementsByCategory,
  renderOptinStatement,
  validateOptinSelection,
  type OptinStatement,
  type OptinSelection,
} from '@/lib/markets/optin-types'
import {
  getTruckPlatformClauses,
  getOperatorComplianceClause,
} from '@/lib/markets/platform-agreement-clauses'

interface OptinManagerProps {
  marketId: string
  vertical: string
}

interface SelectionState {
  checked: boolean
  values: Record<string, string>
}

/**
 * Manager-side picker for opt-in vendor agreement statements.
 *
 * Loads the catalog and current selections in parallel, then renders
 * the catalog grouped by category. Each statement has a checkbox plus
 * (if placeholders) inline inputs for the manager to fill in.
 *
 * Save semantics: PUT replaces the full set. Manager picks all the
 * statements they want, fills placeholders, hits Save. Server-side does
 * delete-all + insert-all for this market.
 *
 * Validation: client checks that every checked statement has values for
 * all its declared placeholders before letting Save proceed.
 *
 * Backend:
 *   - GET  /api/market-manager/[marketId]/optin/catalog
 *   - GET  /api/market-manager/[marketId]/optin/selections
 *   - PUT  /api/market-manager/[marketId]/optin/selections
 */
export default function OptinManager({ marketId, vertical }: OptinManagerProps) {
  const [catalog, setCatalog] = useState<OptinStatement[] | null>(null)
  const [state, setState] = useState<Record<string, SelectionState>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // F6 (2026-07-24): the fixed platform clauses. The truck-facing ones are
  // read-only (every agreement includes them); the operator must acknowledge
  // their own compliance clause before they can save.
  const platformClauses = useMemo(() => getTruckPlatformClauses(vertical), [vertical])
  const operatorClause = useMemo(() => getOperatorComplianceClause(vertical), [vertical])
  const [platformAck, setPlatformAck] = useState<boolean | null>(null)
  const [savingAck, setSavingAck] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/market-manager/${marketId}/platform-ack`)
      .then((res) => (res.ok ? res.json() : { acknowledged: false }))
      .then((data) => { if (!cancelled) setPlatformAck(data.acknowledged === true) })
      .catch(() => { if (!cancelled) setPlatformAck(false) })
    return () => { cancelled = true }
  }, [marketId])

  const toggleAck = async (next: boolean) => {
    setSavingAck(true)
    setPlatformAck(next) // optimistic
    setSaveError(null)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/platform-ack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged: next }),
      })
      if (!res.ok) setPlatformAck(!next)
    } catch {
      setPlatformAck(!next)
    } finally {
      setSavingAck(false)
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [catalogRes, selectionsRes] = await Promise.all([
          fetch(`/api/market-manager/${marketId}/optin/catalog`),
          fetch(`/api/market-manager/${marketId}/optin/selections`),
        ])
        const catalogData = await catalogRes.json().catch(() => ({}))
        const selectionsData = await selectionsRes.json().catch(() => ({}))

        if (!catalogRes.ok) {
          setLoadError(catalogData.error || 'Failed to load opt-in catalog')
          setCatalog([])
          return
        }
        if (!selectionsRes.ok) {
          setLoadError(selectionsData.error || 'Failed to load current selections')
          setCatalog([])
          return
        }

        const catalogList: OptinStatement[] = catalogData.catalog || []
        const selectionList: OptinSelection[] = selectionsData.selections || []

        // Build state: every catalog item gets an entry; checked=true if
        // there's a matching selection
        const initial: Record<string, SelectionState> = {}
        for (const stmt of catalogList) {
          const sel = selectionList.find((s) => s.statement_id === stmt.id)
          const stringValues: Record<string, string> = {}
          if (sel) {
            for (const [k, v] of Object.entries(sel.placeholder_values || {})) {
              stringValues[k] = String(v)
            }
          }
          initial[stmt.id] = {
            checked: !!sel,
            values: stringValues,
          }
        }
        setCatalog(catalogList)
        setState(initial)
      } catch {
        setLoadError('Network error loading opt-in catalog')
        setCatalog([])
      }
    }
    load()
  }, [marketId])

  const grouped = useMemo(
    () => (catalog ? groupStatementsByCategory(catalog) : []),
    [catalog]
  )

  const checkedCount = useMemo(
    () => Object.values(state).filter((s) => s.checked).length,
    [state]
  )

  const handleToggle = (id: string) => {
    setSaveSuccess(false)
    setSaveError(null)
    setState((s) => ({
      ...s,
      [id]: { ...s[id], checked: !s[id].checked },
    }))
  }

  const handleValueChange = (id: string, key: string, value: string) => {
    setSaveSuccess(false)
    setSaveError(null)
    setState((s) => ({
      ...s,
      [id]: {
        ...s[id],
        values: { ...s[id].values, [key]: value },
      },
    }))
  }

  const handleSave = async () => {
    if (!catalog) return
    setSaveError(null)
    setSaveSuccess(false)

    // F6: the operator must acknowledge the platform compliance clause before
    // the agreement section can be saved.
    if (!platformAck) {
      setSaveError('Please acknowledge the platform agreement below before saving.')
      return
    }

    // Client-side: every checked statement must have all placeholders filled
    const selections: Array<{ statement_id: string; placeholder_values: Record<string, string> }> = []
    for (const stmt of catalog) {
      const s = state[stmt.id]
      if (!s?.checked) continue
      const validationError = validateOptinSelection(stmt, s.values)
      if (validationError) {
        // Show the rendered statement text (truncated) instead of the
        // internal stmt.id so the manager recognizes which row they need
        // to finish filling in.
        const preview = renderOptinStatement(stmt.statement, s.values)
        const truncated = preview.length > 80 ? preview.slice(0, 80) + '…' : preview
        setSaveError(`${validationError} in "${truncated}"`)
        return
      }
      // Only include keys the statement actually declares
      const cleanedValues: Record<string, string> = {}
      for (const ph of stmt.placeholders) {
        if (s.values[ph] !== undefined) cleanedValues[ph] = s.values[ph]
      }
      selections.push({
        statement_id: stmt.id,
        placeholder_values: cleanedValues,
      })
    }

    setSaveLoading(true)
    try {
      const res = await fetch(`/api/market-manager/${marketId}/optin/selections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(data.error || 'Save failed')
      } else {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2500)
      }
    } catch {
      setSaveError('Network error')
    } finally {
      setSaveLoading(false)
    }
  }

  if (catalog === null) {
    return <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading opt-in statements…</div>
  }

  if (loadError) {
    return (
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fee2e2',
        color: '#991b1b',
        borderRadius: radius.sm,
        fontSize: typography.sizes.sm,
      }}>
        {loadError}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
      {/* Summary */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceBase,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
        fontSize: typography.sizes.sm,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: spacing.xs,
      }}>
        <div>
          <span style={{ fontWeight: typography.weights.semibold }}>{checkedCount}</span>
          <span style={{ color: colors.textMuted }}> of {catalog.length} statements selected</span>
        </div>
        {saveSuccess && (
          <span style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold }}>
            ✓ Saved
          </span>
        )}
      </div>

      {/* F6: platform requirements — always included, operator can't uncheck.
          Shown so the operator knows exactly what every business agrees to. */}
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
      }}>
        <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing['3xs'] }}>
          Included in every agreement
        </div>
        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>
          These platform requirements are part of every agreement and can&apos;t be removed — every business that books here agrees to them.
        </div>
        <ul style={{ margin: 0, paddingLeft: spacing.md, listStyleType: 'disc', fontSize: typography.sizes.sm, color: colors.textPrimary, lineHeight: 1.5 }}>
          {platformClauses.map((c) => (
            <li key={c.statement_id} style={{ marginBottom: spacing['3xs'] }}>{c.text}</li>
          ))}
        </ul>

        {/* F6: the operator's own acknowledgment — the LAST item in this
            subsection (tester 2026-07-25: it belongs here with the platform
            clauses, not down by the sticky save bar which was overlapping it and
            blocking the click). Required — Save is gated on it. */}
        {platformAck !== null && (
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.xs,
            marginTop: spacing.sm,
            paddingTop: spacing.sm,
            borderTop: `1px solid ${colors.border}`,
            cursor: savingAck ? 'wait' : 'pointer',
          }}>
            <input
              type="checkbox"
              checked={platformAck}
              disabled={savingAck}
              onChange={(e) => toggleAck(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18 }}
            />
            <span style={{ fontSize: typography.sizes.sm, color: colors.textPrimary, lineHeight: 1.4 }}>
              {operatorClause}
            </span>
          </label>
        )}
      </div>

      {/* Catalog grouped by category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {grouped.map((group) => (
          <div key={group.category}>
            <h3 style={{
              margin: 0,
              marginBottom: spacing.xs,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {group.label}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {group.statements.map((stmt) => {
                const s = state[stmt.id] ?? { checked: false, values: {} }
                const preview = renderOptinStatement(stmt.statement, s.values)
                return (
                  <div
                    key={stmt.id}
                    style={{
                      padding: spacing.sm,
                      backgroundColor: s.checked ? colors.surfaceElevated : colors.surfaceBase,
                      border: `1px solid ${s.checked ? colors.primary : colors.border}`,
                      borderRadius: radius.sm,
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={s.checked}
                        onChange={() => handleToggle(stmt.id)}
                        style={{ marginTop: 4, cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: typography.sizes.sm,
                          color: colors.textPrimary,
                          lineHeight: 1.5,
                        }}>
                          {preview}
                        </div>
                      </div>
                    </label>
                    {s.checked && stmt.placeholders.length > 0 && (
                      <div style={{
                        marginTop: spacing.xs,
                        marginLeft: spacing.lg,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: spacing['2xs'],
                      }}>
                        {stmt.placeholders.map((ph) => (
                          <div key={ph} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                            <label style={{
                              fontSize: typography.sizes.xs,
                              color: colors.textMuted,
                              minWidth: 140,
                              fontFamily: 'monospace',
                            }}>
                              {`{${ph}}`}
                            </label>
                            <input
                              type="text"
                              value={s.values[ph] ?? ''}
                              onChange={(e) => handleValueChange(stmt.id, ph, e.target.value)}
                              placeholder={`Enter value for ${ph}`}
                              maxLength={200}
                              style={{
                                flex: '1 1 200px',
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                border: `1px solid ${colors.border}`,
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.sm,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Save bar */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.sm,
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={handleSave}
          disabled={saveLoading || !platformAck}
          title={!platformAck ? 'Acknowledge the platform agreement above to save' : undefined}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            cursor: (saveLoading || !platformAck) ? 'not-allowed' : 'pointer',
            opacity: (saveLoading || !platformAck) ? 0.6 : 1,
          }}
        >
          {saveLoading ? 'Saving…' : 'Save selections'}
        </button>
        {saveError && (
          <div style={{ color: '#991b1b', fontSize: typography.sizes.xs, flex: 1 }}>
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <span style={{ color: colors.primary, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold }}>
            ✓ Saved
          </span>
        )}
      </div>
    </div>
  )
}
