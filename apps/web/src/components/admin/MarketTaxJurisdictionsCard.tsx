'use client'

import { useState, useEffect, useMemo } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  validateJurisdictions,
  totalRatePct,
  TX_MAX_COMBINED_RATE_PCT,
  TX_STATE_RATE_PCT,
  type TaxJurisdiction,
  type JurisdictionLevel,
} from '@/lib/tax/jurisdictions'

interface Props {
  marketId: string
}

const LEVELS: JurisdictionLevel[] = ['state', 'city', 'county', 'transit', 'spd']
const LEVEL_LABEL: Record<JurisdictionLevel, string> = {
  state: 'State', city: 'City', county: 'County', transit: 'Transit (MTA)', spd: 'Special Purpose District',
}
/** Rate-table URL per level — where the seven-digit local code comes from. */
const LEVEL_SOURCE: Record<JurisdictionLevel, string> = {
  state: 'https://comptroller.texas.gov/taxes/sales/',
  city: 'https://comptroller.texas.gov/taxes/sales/city.php',
  county: 'https://comptroller.texas.gov/taxes/sales/county.php',
  transit: 'https://comptroller.texas.gov/taxes/sales/mta.php',
  spd: 'https://comptroller.texas.gov/taxes/sales/spd.php',
}

const TX_STATE_ROW: TaxJurisdiction = {
  code: '7000000', name: 'TEXAS', level: 'state', rate_pct: TX_STATE_RATE_PCT,
}

/** Suggest the current quarter, e.g. "2026-Q3" — rates change quarterly. */
function currentQuarter(): string {
  const now = new Date()
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`
}

/**
 * Texas sales-tax jurisdictions for a market — set at APPROVAL time, next to
 * lat/long, because both follow from the address the admin already has open.
 *
 * Safeguards against the ways this data actually goes wrong:
 *  - the state row is seeded automatically so it can't be forgotten
 *  - level is a dropdown, never free text
 *  - codes are checked for the seven-digit Form 01-116 shape
 *  - rates pasted in the Comptroller's DECIMAL form (.015) are normalized to
 *    percent (1.5) with a visible note — a silent 100x error would under-charge
 *    every buyer at this location
 *  - the combined rate is shown live against the 8.25% Texas ceiling
 *  - Save is blocked while anything is invalid (server re-validates anyway)
 *
 * Nothing here calculates or charges tax — this is reference data (mig 214).
 */
export default function MarketTaxJurisdictionsCard({ marketId }: Props) {
  const [rows, setRows] = useState<TaxJurisdiction[]>([])
  const [rateVersion, setRateVersion] = useState('')
  const [note, setNote] = useState('')
  const [address, setAddress] = useState<{ line: string | null; city: string | null; state: string | null; zip: string | null } | null>(null)
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [copied, setCopied] = useState(false)
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null)
  const [needsReverification, setNeedsReverification] = useState(false)
  const [serverWarnings, setServerWarnings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [normalizedNotice, setNormalizedNotice] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/markets/${marketId}/tax-jurisdictions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) { setLoading(false); return }
        setRows(d.jurisdictions?.length ? d.jurisdictions : [{ ...TX_STATE_ROW }])
        setRateVersion(d.rateVersion || currentQuarter())
        setNote(d.note || '')
        setAddress(d.address || null)
        setCoords({ lat: d.latitude ?? null, lng: d.longitude ?? null })
        setVerifiedAt(d.verifiedAt || null)
        setNeedsReverification(!!d.needsReverification)
        setServerWarnings(d.warnings || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [marketId])

  const errors = useMemo(() => validateJurisdictions(rows), [rows])
  const total = useMemo(() => totalRatePct(rows), [rows])
  const overCeiling = total > TX_MAX_COMBINED_RATE_PCT

  const update = (i: number, patch: Partial<TaxJurisdiction>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  /** Normalize a pasted rate on blur: .015 → 1.5 (the Comptroller's tables use decimals). */
  const normalizeRate = (i: number) => {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r
      if (r.rate_pct > 0 && r.rate_pct < 0.25) {
        setNormalizedNotice(true)
        return { ...r, rate_pct: Math.round(r.rate_pct * 100 * 10000) / 10000 }
      }
      return r
    }))
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/tax-jurisdictions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jurisdictions: rows, rateVersion, note }),
      })
      const data = await res.json()
      if (res.ok) {
        setMsg({ text: 'Saved', ok: true })
        setVerifiedAt(new Date().toISOString())
        setNeedsReverification(false)
        setServerWarnings(data.warnings || [])
      } else {
        setMsg({ text: data.error || 'Save failed', ok: false })
      }
    } finally { setSaving(false) }
  }

  const addressString = address
    ? [address.line, address.city, address.state, address.zip].filter(Boolean).join(', ')
    : ''

  // The Rate Locator takes lat/long as well as an address, and the coordinate
  // search is the more reliable of the two: an address the state's geocoder
  // can't parse just errors out, and it is two fields to fill instead of four.
  const coordString = coords.lat != null && coords.lng != null ? `${coords.lat}, ${coords.lng}` : ''
  // Precision is a TAX correctness issue here, not a map-pin nicety: 4 decimals
  // is ~11m and can sit on the wrong side of a city line, which would resolve
  // the wrong jurisdiction. 6 decimals is ~0.1m. The column stores 8, but a
  // value entered at 4 arrives as 4 — PostgREST sends NUMERIC as a JSON number
  // and JS drops the trailing zeros.
  const coordDecimals = (n: number | null) => (n == null ? 0 : (String(n).split('.')[1] || '').length)
  const coarseCoords = coordString !== '' && Math.min(coordDecimals(coords.lat), coordDecimals(coords.lng)) < 6

  const copyCoords = async () => {
    try {
      await navigator.clipboard.writeText(coordString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the value is selectable on screen anyway */ }
  }

  const input = {
    padding: spacing.xs, border: `1px solid ${colors.border}`,
    borderRadius: radius.sm, fontSize: typography.sizes.sm,
  }

  if (loading) {
    return (
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md }}>
        <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Loading tax jurisdictions…</span>
      </div>
    )
  }

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md }}>
      <div style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.base, color: colors.textPrimary }}>
        Sales tax jurisdictions
      </div>
      <p style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, lineHeight: 1.5, marginTop: spacing.xs }}>
        Which Texas taxing jurisdictions this location sits in. Set this when you approve the market — it follows
        from the same address you use for coordinates. Every order picked up here inherits these rates, and the
        seven-digit local codes are what the monthly return (Form 01-116) reports against.
        {' '}<strong>This does not charge tax</strong> — it is reference data only.
      </p>

      {/* mig 215: the address moved after these jurisdictions were verified.
          They may now describe the wrong location — loudest thing on the card. */}
      {needsReverification && (
        <div style={{
          marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm,
          background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e',
          fontSize: typography.sizes.xs, lineHeight: 1.5,
        }}>
          ⚠ <strong>Re-verify needed.</strong> This market&apos;s address changed after these jurisdictions were
          saved, so they may describe the old location. Re-check them against the Rate Locator and save again.
        </div>
      )}

      {serverWarnings.length > 0 && (
        <div style={{
          marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm,
          background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e',
          fontSize: typography.sizes.xs, lineHeight: 1.5,
        }}>
          {serverWarnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* The address to resolve against + the lookup tool */}
      <div style={{ background: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm, fontSize: typography.sizes.xs, lineHeight: 1.5 }}>
        {addressString ? (
          <>
            <div style={{ color: colors.textSecondary }}>Resolve for this address:</div>
            <div style={{ color: colors.textPrimary, fontWeight: typography.weights.medium }}>{addressString}</div>
          </>
        ) : (
          <div style={{ color: '#92400e' }}>
            ⚠ This market has no street address yet. Add the address first — jurisdictions can&apos;t be resolved without it.
          </div>
        )}
        {/* Coordinate search first — it is the more reliable of the Rate Locator's
            two modes and needs two fields instead of four. Copy BEFORE navigating:
            iOS Safari ignores target="_blank" (especially from a home-screen
            shortcut), so the operator may well come back via the back button. */}
        {coordString && (
          <div style={{ marginTop: spacing.xs, display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
            <span style={{ color: colors.textSecondary }}>Or search by coordinates:</span>
            <code style={{
              padding: `2px ${spacing.xs}`, background: '#f3f4f6', borderRadius: radius.sm,
              fontSize: typography.sizes.sm, userSelect: 'all',
            }}>{coordString}</code>
            <button
              type="button"
              onClick={copyCoords}
              style={{
                padding: `2px ${spacing.xs}`, borderRadius: radius.sm, cursor: 'pointer',
                border: `1px solid ${colors.border}`, background: 'white',
                fontSize: typography.sizes.xs, color: colors.textSecondary,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        )}
        {coarseCoords && (
          <div style={{ marginTop: spacing['2xs'], color: '#92400e', fontSize: typography.sizes.xs }}>
            ⚠ These coordinates have fewer than 6 decimal places (~11 m of slop). That can land on the
            wrong side of a city boundary and resolve the wrong jurisdiction — re-resolve the market&apos;s
            latitude/longitude above before trusting the result.
          </div>
        )}
        <div style={{ marginTop: spacing.xs }}>
          <a href="https://gis.cpa.texas.gov/search/" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>
            Open the Comptroller Rate Locator →
          </a>
          <span style={{ color: colors.textMuted }}> (copy the coordinates first, then bring each LOCAL code back here)</span>
        </div>
      </div>

      {/* Rows */}
      <div style={{ marginTop: spacing.sm, display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {rows.map((r, i) => {
          const badCode = !/^\d{7}$/.test(r.code || '')
          // The state row is CONSTANT for Texas: 6.25%, always present, and the
          // Comptroller issues no seven-digit code for it (codes are LOCAL only —
          // city/county/transit/SPD). Leaving these editable invited the exact
          // mistake it caused in testing: the operator pasted the city's code over
          // the seeded state placeholder, then pasted the same code into the city
          // row and got "duplicate jurisdiction code". Nothing about this row is
          // the operator's to decide, so nothing about it is editable.
          const isState = r.level === 'state'
          if (isState) {
            return (
              <div key={i} style={{
                display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap',
                padding: spacing.xs, background: '#f9fafb',
                border: `1px solid ${colors.border}`, borderRadius: radius.sm,
              }}>
                <span style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  Texas state
                </span>
                <span style={{ color: colors.textPrimary }}>{TX_STATE_RATE_PCT}%</span>
                <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                  Fixed statewide rate — added automatically. Texas issues no jurisdiction code for the
                  state portion, so there is nothing to paste here. Enter only LOCAL jurisdictions below.
                </span>
              </div>
            )
          }
          return (
            <div key={i} style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                style={{ ...input, width: 96, borderColor: badCode ? '#f59e0b' : colors.border }}
                value={r.code}
                onChange={(e) => update(i, { code: e.target.value.replace(/\D/g, '').slice(0, 7) })}
                placeholder="7-digit code"
                title="Texas seven-digit local code (Form 01-116, column 2)"
              />
              <input
                style={{ ...input, flex: 1, minWidth: 120 }}
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value.toUpperCase() })}
                placeholder="Jurisdiction name"
              />
              <select
                style={{ ...input }}
                value={r.level}
                onChange={(e) => update(i, { level: e.target.value as JurisdictionLevel })}
              >
                {/* 'state' is deliberately absent: the state row is seeded and locked
                    above, and offering it here would let an operator create a second
                    one, which validateJurisdictions then rejects with a message that
                    does not explain what they did wrong. */}
                {LEVELS.filter((l) => l !== 'state').map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
              <input
                style={{ ...input, width: 84 }}
                type="number"
                step="0.0001"
                min="0"
                value={r.rate_pct}
                onChange={(e) => update(i, { rate_pct: parseFloat(e.target.value) || 0 })}
                onBlur={() => normalizeRate(i)}
                title="Percent (1.5 = 1.5%). Decimal form from the state's tables (.015) is converted automatically."
              />
              <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>%</span>
              <a href={LEVEL_SOURCE[r.level]} target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: typography.sizes.xs, color: colors.primary }}>
                codes ↗
              </a>
              {r.level !== 'state' && (
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{ ...input, cursor: 'pointer', background: 'transparent', color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                >
                  Remove
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { code: '', name: '', level: 'city', rate_pct: 0 }])}
        style={{ ...input, cursor: 'pointer', background: 'transparent', color: colors.primary, marginTop: spacing.xs }}
      >
        + Add jurisdiction
      </button>

      {normalizedNotice && (
        <p style={{ fontSize: typography.sizes.xs, color: '#92400e', marginTop: spacing.xs }}>
          A rate was entered in decimal form and converted to percent (e.g. .015 → 1.5%). Double-check the values.
        </p>
      )}

      {/* Live combined rate vs the ceiling */}
      <div style={{ marginTop: spacing.sm, fontSize: typography.sizes.sm, color: overCeiling ? '#991b1b' : colors.textPrimary }}>
        Combined rate: <strong>{total}%</strong>
        <span style={{ color: colors.textMuted, fontSize: typography.sizes.xs }}> (Texas maximum {TX_MAX_COMBINED_RATE_PCT}%)</span>
        {overCeiling && <strong> — over the ceiling, something is wrong</strong>}
      </div>

      {errors.length > 0 && (
        <ul style={{ margin: `${spacing.xs} 0 0`, paddingLeft: spacing.md, fontSize: typography.sizes.xs, color: '#991b1b' }}>
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {/* Provenance */}
      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: typography.sizes.xs, color: colors.textSecondary }}>
          Rate version{' '}
          <input style={{ ...input, width: 96 }} value={rateVersion} onChange={(e) => setRateVersion(e.target.value)} placeholder="2026-Q3" />
        </label>
        <input
          style={{ ...input, flex: 1, minWidth: 180 }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (address searched, anomalies, who verified)"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
        <button
          type="button"
          onClick={save}
          disabled={saving || errors.length > 0}
          style={{
            padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.sm, border: 'none',
            background: colors.primary, color: '#fff', fontSize: typography.sizes.sm,
            fontWeight: typography.weights.medium,
            cursor: saving || errors.length > 0 ? 'not-allowed' : 'pointer',
            opacity: saving || errors.length > 0 ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save jurisdictions'}
        </button>
        {msg && <span style={{ fontSize: typography.sizes.sm, color: msg.ok ? '#065f46' : '#991b1b' }}>{msg.text}</span>}
        {verifiedAt && (
          <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
            Last verified {new Date(verifiedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  )
}
