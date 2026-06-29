'use client'

import { useMemo, useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Market Operator Revenue Projection (Phase 0 RM tooling, 2026-06-28).
 *
 * Pure client-side estimator. Two audiences via a toggle:
 *   - Market Manager: a single market, focused on "switch to the platform" —
 *     the operator-keep % is the headline lever (default 93.5% = current rate;
 *     raise it to model a switch incentive). Rules for who gets what % are a
 *     later business decision — here it's just an editable field.
 *   - Regional Manager: multiple properties + a $1,000/yr license + territory.
 *
 * Economics (our real numbers): a booth's BASE weekly price is what the operator
 * lists. The operator RECEIVES base × keep% (default 93.5% — base − 6.5%). The
 * vendor pays base + 6.5% + $0.15 on top, which the platform keeps regardless of
 * keep%. So raising keep% toward 100% hands back the operator-side fee; the
 * platform still earns the vendor-side fee on every booth. ESTIMATES ONLY.
 */

type Audience = 'manager' | 'rm'
type PropertyType = 'farmers_market' | 'food_truck_park' | 'dual'
type Category = 'fm' | 'ft'

interface SpaceType {
  id: string
  name: string
  category: Category
  weeklyPrice: number // dollars (base list price)
  count: number
  occupancyPct: number
}
interface Property {
  id: string
  name: string
  type: PropertyType
  weeksPerYear: number
  spaceTypes: SpaceType[]
}
interface CostItem {
  id: string
  label: string
  monthly: number // dollars
}

// Platform's vendor-side booth fee (always kept, independent of keep%).
const VENDOR_FEE_PCT = 6.5
const VENDOR_FLAT = 0.15
const STANDARD_KEEP_PCT = 93.5

let _id = 0
const nid = (p: string) => `${p}-${_id++}`

function space(name: string, category: Category, weeklyPrice: number, count: number, occ: number): SpaceType {
  return { id: nid('s'), name, category, weeklyPrice, count, occupancyPct: occ }
}
function defaultCosts(): CostItem[] {
  return [
    { id: nid('c'), label: 'Land lease / rent', monthly: 0 },
    { id: nid('c'), label: 'Insurance', monthly: 0 },
    { id: nid('c'), label: 'Utilities', monthly: 0 },
    { id: nid('c'), label: 'Restrooms / sanitation / trash', monthly: 0 },
    { id: nid('c'), label: 'Security', monthly: 0 },
    { id: nid('c'), label: 'Marketing', monthly: 0 },
    { id: nid('c'), label: 'On-site staff / market manager pay', monthly: 0 },
    { id: nid('c'), label: 'Permits / signage / software / misc', monthly: 0 },
  ]
}
function starterMarket(): Property {
  return {
    id: nid('p'), name: 'Main Street Farmers Market', type: 'farmers_market', weeksPerYear: 30,
    spaceTypes: [space('10x10 booth', 'fm', 25, 30, 70), space('10x20 booth', 'fm', 45, 8, 60)],
  }
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

export default function OperatorProjectionTool({ vertical }: { vertical: string }) {
  const [audience, setAudience] = useState<Audience>('manager')
  const [keepPct, setKeepPct] = useState<number>(STANDARD_KEEP_PCT)
  const [licenseFee, setLicenseFee] = useState<number>(1000)
  const [ownerSharePct, setOwnerSharePct] = useState<number>(0)
  const [rampMonths, setRampMonths] = useState<number>(0)
  const [properties, setProperties] = useState<Property[]>([starterMarket()])
  const [costs, setCosts] = useState<CostItem[]>(defaultCosts())
  // Capacity check
  const [hoursAvailable, setHoursAvailable] = useState<number>(20)
  const [hoursPerProperty, setHoursPerProperty] = useState<number>(12)

  const isRM = audience === 'rm'

  // ---- Derived calculations (memoized) ----
  const calc = useMemo(() => {
    let baseAnnual = 0
    let maxBaseAnnual = 0 // at 100% occupancy
    let bookingsAnnual = 0
    let fmBase = 0
    let ftBase = 0
    const perProperty: { id: string; name: string; base: number; operatorGross: number }[] = []
    for (const p of properties) {
      let pBase = 0
      let pMax = 0
      let pBookings = 0
      for (const s of p.spaceTypes) {
        const occ = Math.max(0, Math.min(100, s.occupancyPct)) / 100
        const weekly = s.weeklyPrice * s.count * occ
        const weeklyMax = s.weeklyPrice * s.count
        const annual = weekly * p.weeksPerYear
        pBase += annual
        pMax += weeklyMax * p.weeksPerYear
        pBookings += s.count * occ * p.weeksPerYear
        if (s.category === 'ft') ftBase += annual
        else fmBase += annual
      }
      baseAnnual += pBase
      maxBaseAnnual += pMax
      bookingsAnnual += pBookings
      perProperty.push({ id: p.id, name: p.name, base: pBase, operatorGross: pBase * (keepPct / 100) })
    }

    const keep = keepPct / 100
    const operatorGross = baseAnnual * keep

    // Platform: operator-side (rebated portion) + vendor-side fee (always kept).
    const platformOperatorSide = baseAnnual * (1 - keep)
    const platformVendorSide = baseAnnual * (VENDOR_FEE_PCT / 100) + bookingsAnnual * VENDOR_FLAT
    const platformBooth = platformOperatorSide + platformVendorSide
    const license = isRM ? licenseFee : 0
    const platformTotal = platformBooth + license

    const operatingFixed = costs.reduce((sum, c) => sum + c.monthly * 12, 0)
    const ownerShareAmt = operatorGross * (ownerSharePct / 100)
    const operatingTotal = operatingFixed + ownerShareAmt

    const netAnnual = operatorGross - operatingTotal - license
    const netMonthly = netAnnual / 12

    // Break-even occupancy: solve net=0. operatorGross*(1-owner) = fixed+license.
    const ownerFactor = 1 - ownerSharePct / 100
    const requiredOperatorGross = ownerFactor > 0 ? (operatingFixed + license) / ownerFactor : Infinity
    const requiredBase = keep > 0 ? requiredOperatorGross / keep : Infinity
    const breakEvenOccPct = maxBaseAnnual > 0 ? (requiredBase / maxBaseAnnual) * 100 : Infinity

    // Year 1 with ramp (reduces gross only).
    const rampFactor = rampMonths === 12 ? 0.625 : rampMonths === 6 ? 0.75 : rampMonths === 3 ? 0.875 : 1
    const y1Gross = operatorGross * rampFactor
    const y1Net = y1Gross * ownerFactor - operatingFixed - license

    return {
      baseAnnual, maxBaseAnnual, operatorGross, platformBooth, platformTotal, license,
      operatingFixed, ownerShareAmt, operatingTotal, netAnnual, netMonthly,
      breakEvenOccPct, fmBase, ftBase, perProperty, rampFactor, y1Net,
    }
  }, [properties, costs, keepPct, ownerSharePct, isRM, licenseFee, rampMonths])

  // Sensitivity: scale every occupancy by a factor, recompute net.
  const sensitivity = useMemo(() => {
    const run = (occFactor: number) => {
      let base = 0
      for (const p of properties) for (const s of p.spaceTypes) {
        const occ = Math.max(0, Math.min(100, s.occupancyPct * occFactor)) / 100
        base += s.weeklyPrice * s.count * occ * p.weeksPerYear
      }
      const operatorGross = base * (keepPct / 100)
      const operatingFixed = costs.reduce((sum, c) => sum + c.monthly * 12, 0)
      const license = isRM ? licenseFee : 0
      return operatorGross * (1 - ownerSharePct / 100) - operatingFixed - license
    }
    return { conservative: run(0.7), realistic: run(1), best: run(1.15) }
  }, [properties, costs, keepPct, ownerSharePct, isRM, licenseFee])

  const workload = properties.length * hoursPerProperty
  const overCapacity = workload > hoursAvailable

  // ---- Mutators ----
  const updateProperty = (id: string, patch: Partial<Property>) =>
    setProperties((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const updateSpace = (pid: string, sid: string, patch: Partial<SpaceType>) =>
    setProperties((ps) => ps.map((p) => p.id !== pid ? p : { ...p, spaceTypes: p.spaceTypes.map((s) => s.id === sid ? { ...s, ...patch } : s) }))
  const addSpace = (pid: string) =>
    setProperties((ps) => ps.map((p) => p.id !== pid ? p : { ...p, spaceTypes: [...p.spaceTypes, space('New space', p.type === 'food_truck_park' ? 'ft' : 'fm', 25, 10, 60)] }))
  const removeSpace = (pid: string, sid: string) =>
    setProperties((ps) => ps.map((p) => p.id !== pid ? p : { ...p, spaceTypes: p.spaceTypes.filter((s) => s.id !== sid) }))
  const addProperty = () => setProperties((ps) => [...ps, starterMarket()])
  const removeProperty = (id: string) => setProperties((ps) => ps.filter((p) => p.id !== id))

  const applyPreset = (preset: 'starter' | 'moderate' | 'large' | 'ftpark' | 'dual' | 'multi') => {
    if (preset === 'starter') setProperties([starterMarket()])
    else if (preset === 'moderate') setProperties([{ id: nid('p'), name: 'Riverside Market', type: 'farmers_market', weeksPerYear: 40, spaceTypes: [space('10x10 booth', 'fm', 30, 50, 75), space('Premium corner', 'fm', 60, 6, 80)] }])
    else if (preset === 'large') setProperties([{ id: nid('p'), name: 'Downtown Market', type: 'farmers_market', weeksPerYear: 48, spaceTypes: [space('10x10 booth', 'fm', 35, 90, 80), space('10x20 booth', 'fm', 65, 20, 75)] }])
    else if (preset === 'ftpark') setProperties([{ id: nid('p'), name: 'Food Truck Park', type: 'food_truck_park', weeksPerYear: 50, spaceTypes: [space('Food truck space', 'ft', 75, 12, 70)] }])
    else if (preset === 'dual') setProperties([{ id: nid('p'), name: 'Dual-Use Property', type: 'dual', weeksPerYear: 50, spaceTypes: [space('Daytime booth', 'fm', 30, 40, 70), space('Evening truck space', 'ft', 75, 10, 65)] }])
    else setProperties([starterMarket(), { id: nid('p'), name: 'Second Market', type: 'farmers_market', weeksPerYear: 30, spaceTypes: [space('10x10 booth', 'fm', 25, 40, 65)] }])
  }

  return (
    <div>
      <h1 style={{ margin: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary }}>
        Market operator revenue projection
      </h1>
      <p style={{ marginTop: spacing['2xs'], marginBottom: spacing.md, color: colors.textMuted, fontSize: typography.sizes.sm, lineHeight: 1.5 }}>
        Estimate what you could earn operating {vertical === 'food_trucks' ? 'food truck parks' : 'farmers markets'} on the
        platform. Change any value — totals update live. <strong>These are estimates, not guaranteed income.</strong>
      </p>

      {/* Audience toggle */}
      <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md }}>
        {([['manager', 'I run a market'], ['rm', 'Regional Manager (multi-property)']] as const).map(([val, label]) => (
          <button key={val} type="button" onClick={() => setAudience(val)}
            style={{
              padding: `${spacing.xs} ${spacing.md}`, borderRadius: radius.sm, cursor: 'pointer',
              border: `1px solid ${audience === val ? colors.primary : colors.border}`,
              backgroundColor: audience === val ? colors.primary : 'transparent',
              color: audience === val ? '#fff' : colors.textPrimary,
              fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold,
            }}>{label}</button>
        ))}
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'], marginBottom: spacing.md }}>
        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, alignSelf: 'center' }}>Start from:</span>
        {([['starter', 'Small starter'], ['moderate', 'Moderate'], ['large', 'Large'], ['ftpark', 'Food truck park'], ['dual', 'Dual-use'], ['multi', 'Multi-property']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => applyPreset(k)} style={presetBtn}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: spacing.md }}>
        {/* ---- The keep-% lever ---- */}
        <Section title="The split">
          <Field label="Operator keeps (% of base booth price)" hint={`Default ${STANDARD_KEEP_PCT}% = today's rate. Raise toward 100% to model a switch incentive — the platform still earns the vendor-side ${VENDOR_FEE_PCT}% + $${VENDOR_FLAT.toFixed(2)}/booth.`}>
            <NumInput value={keepPct} onChange={setKeepPct} suffix="%" step={0.5} min={0} />
          </Field>
          {isRM && (
            <Field label="Annual regional license fee">
              <NumInput value={licenseFee} onChange={setLicenseFee} prefix="$" step={100} min={0} />
            </Field>
          )}
          <Field label="Property-owner revenue share (paid out of operator revenue)">
            <NumInput value={ownerSharePct} onChange={setOwnerSharePct} suffix="%" step={1} min={0} />
          </Field>
          <Field label="First-year ramp-up">
            <select value={rampMonths} onChange={(e) => setRampMonths(Number(e.target.value))} style={selectStyle}>
              <option value={0}>No ramp (full from day one)</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </Field>
        </Section>

        {/* ---- Properties ---- */}
        <Section title={isRM ? 'Properties' : 'Your market'}>
          {properties.map((p) => (
            <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm }}>
              <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Name" grow><TextInput value={p.name} onChange={(v) => updateProperty(p.id, { name: v })} /></Field>
                <Field label="Type">
                  <select value={p.type} onChange={(e) => updateProperty(p.id, { type: e.target.value as PropertyType })} style={selectStyle}>
                    <option value="farmers_market">Farmers market</option>
                    <option value="food_truck_park">Food truck park</option>
                    <option value="dual">Dual-use</option>
                  </select>
                </Field>
                <Field label="Weeks / year"><NumInput value={p.weeksPerYear} onChange={(v) => updateProperty(p.id, { weeksPerYear: v })} step={1} min={0} /></Field>
                {isRM && properties.length > 1 && (
                  <button type="button" onClick={() => removeProperty(p.id)} style={removeBtn}>Remove</button>
                )}
              </div>

              <table style={{ width: '100%', marginTop: spacing.sm, borderCollapse: 'collapse', fontSize: typography.sizes.xs }}>
                <thead>
                  <tr style={{ color: colors.textMuted, textAlign: 'left' }}>
                    <th style={th}>Space type</th><th style={th}>FM/FT</th><th style={th}>$/week</th><th style={th}>Count</th><th style={th}>Occ %</th><th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {p.spaceTypes.map((s) => (
                    <tr key={s.id}>
                      <td style={td}><TextInput value={s.name} onChange={(v) => updateSpace(p.id, s.id, { name: v })} /></td>
                      <td style={td}>
                        <select value={s.category} onChange={(e) => updateSpace(p.id, s.id, { category: e.target.value as Category })} style={{ ...selectStyle, minWidth: 56 }}>
                          <option value="fm">FM</option><option value="ft">FT</option>
                        </select>
                      </td>
                      <td style={td}><NumInput value={s.weeklyPrice} onChange={(v) => updateSpace(p.id, s.id, { weeklyPrice: v })} prefix="$" step={5} min={0} compact /></td>
                      <td style={td}><NumInput value={s.count} onChange={(v) => updateSpace(p.id, s.id, { count: v })} step={1} min={0} compact /></td>
                      <td style={td}><NumInput value={s.occupancyPct} onChange={(v) => updateSpace(p.id, s.id, { occupancyPct: v })} suffix="%" step={5} min={0} compact /></td>
                      <td style={td}>{p.spaceTypes.length > 1 && <button type="button" onClick={() => removeSpace(p.id, s.id)} style={linkBtn}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={() => addSpace(p.id)} style={addBtn}>+ Add space type</button>
            </div>
          ))}
          {isRM && <button type="button" onClick={addProperty} style={addBtn}>+ Add property</button>}
        </Section>

        {/* ---- Operating costs ---- */}
        <Section title="Operating costs (monthly)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: spacing.xs }}>
            {costs.map((c) => (
              <Field key={c.id} label={c.label}>
                <NumInput value={c.monthly} onChange={(v) => setCosts((cs) => cs.map((x) => x.id === c.id ? { ...x, monthly: v } : x))} prefix="$" step={50} min={0} />
              </Field>
            ))}
          </div>
        </Section>

        {/* ---- Capacity ---- */}
        <Section title="Your time">
          <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
            <Field label="Hours you have / week"><NumInput value={hoursAvailable} onChange={setHoursAvailable} step={1} min={0} /></Field>
            <Field label="Hours per property / week"><NumInput value={hoursPerProperty} onChange={setHoursPerProperty} step={1} min={0} /></Field>
          </div>
          {overCapacity && (
            <p style={{ margin: `${spacing.xs} 0 0 0`, padding: `${spacing['2xs']} ${spacing.xs}`, backgroundColor: '#fff3cd', color: '#856404', borderRadius: radius.sm, fontSize: typography.sizes.sm }}>
              This scenario needs ~{workload} hrs/week but you have {hoursAvailable}. You&apos;ll likely need hired market managers or fewer properties.
            </p>
          )}
        </Section>

        {/* ---- Outputs ---- */}
        <div style={{ border: `2px solid ${colors.primary}`, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceElevated }}>
          <h2 style={{ margin: 0, marginBottom: spacing.sm, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
            Estimated annual results
          </h2>
          <Row label="Gross booth revenue (base)" value={money(calc.baseAnnual)} />
          <Row label={`Your revenue (keep ${pct(keepPct)})`} value={money(calc.operatorGross)} strong />
          <Row label="Operating costs" value={`– ${money(calc.operatingTotal)}`} />
          {isRM && <Row label="Regional license" value={`– ${money(calc.license)}`} />}
          <div style={{ borderTop: `1px solid ${colors.border}`, margin: `${spacing.xs} 0` }} />
          <Row label="Estimated net (annual)" value={money(calc.netAnnual)} big positive={calc.netAnnual >= 0} />
          <Row label="Estimated net (monthly avg)" value={money(calc.netMonthly)} />
          {calc.rampFactor < 1 && <Row label="Year 1 net (with ramp-up)" value={money(calc.y1Net)} />}
          <div style={{ borderTop: `1px solid ${colors.border}`, margin: `${spacing.xs} 0` }} />
          <Row label="Break-even occupancy" value={Number.isFinite(calc.breakEvenOccPct) ? pct(calc.breakEvenOccPct) : '—'} />
          {(calc.fmBase > 0 && calc.ftBase > 0) && (
            <Row label="Farmers market vs food truck (base)" value={`${money(calc.fmBase)} / ${money(calc.ftBase)}`} />
          )}
          <Row label="Platform earns (booth fees + license)" value={money(calc.platformTotal)} muted />

          {/* Sensitivity */}
          <div style={{ marginTop: spacing.sm, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.xs }}>
            {([['Conservative', sensitivity.conservative], ['Realistic', sensitivity.realistic], ['Best case', sensitivity.best]] as const).map(([label, val]) => (
              <div key={label} style={{ padding: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.surfaceBase, textAlign: 'center' }}>
                <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{label}</div>
                <div style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.bold, color: val >= 0 ? colors.textPrimary : '#dc2626' }}>{money(val)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ marginTop: spacing.md, fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: 1.5 }}>
        <strong>Estimates only — not a guarantee of income.</strong> Actual results depend on location, vendor demand,
        property costs, weather, local regulations, management, and marketing. The operator-keep % and any incentive are
        not an offer; final terms are set separately.
      </p>
    </div>
  )
}

// ---- Small presentational helpers ----
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: spacing.md }}>
      <h2 style={{ margin: 0, marginBottom: spacing.sm, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>{title}</h2>
      {children}
    </div>
  )
}
function Field({ label, hint, children, grow }: { label: string; hint?: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'], marginBottom: spacing.xs, flex: grow ? '1 1 160px' : '0 0 auto' }}>
      <span style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  )
}
function Row({ label, value, strong, big, muted, positive }: { label: string; value: string; strong?: boolean; big?: boolean; muted?: boolean; positive?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: `${spacing['3xs']} 0` }}>
      <span style={{ fontSize: typography.sizes.sm, color: muted ? colors.textMuted : colors.textSecondary }}>{label}</span>
      <span style={{
        fontSize: big ? typography.sizes.xl : typography.sizes.sm,
        fontWeight: (strong || big) ? typography.weights.bold : typography.weights.semibold,
        color: big ? (positive ? colors.primary : '#dc2626') : colors.textPrimary,
      }}>{value}</span>
    </div>
  )
}
function NumInput({ value, onChange, prefix, suffix, step, min, compact }: { value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; step?: number; min?: number; compact?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {prefix && <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>{prefix}</span>}
      <input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={min}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: compact ? 64 : 110, padding: `${spacing['3xs']} ${spacing['2xs']}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textPrimary, backgroundColor: colors.surfaceBase }} />
      {suffix && <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>{suffix}</span>}
    </span>
  )
}
function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', minWidth: 100, padding: `${spacing['3xs']} ${spacing['2xs']}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textPrimary, backgroundColor: colors.surfaceBase }} />
  )
}

const selectStyle = { padding: `${spacing['3xs']} ${spacing['2xs']}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, color: colors.textPrimary, backgroundColor: colors.surfaceBase } as const
const th = { padding: `${spacing['3xs']} ${spacing['2xs']}`, fontWeight: typography.weights.semibold } as const
const td = { padding: `2px ${spacing['2xs']}` } as const
const presetBtn = { padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, backgroundColor: colors.surfaceBase, color: colors.textPrimary, fontSize: typography.sizes.xs, cursor: 'pointer' } as const
const addBtn = { marginTop: spacing.xs, padding: `${spacing['2xs']} ${spacing.sm}`, border: `1px dashed ${colors.primary}`, borderRadius: radius.sm, backgroundColor: 'transparent', color: colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, cursor: 'pointer' } as const
const removeBtn = { padding: `${spacing['3xs']} ${spacing.xs}`, border: `1px solid ${colors.border}`, borderRadius: radius.sm, backgroundColor: 'transparent', color: '#dc2626', fontSize: typography.sizes.xs, cursor: 'pointer' } as const
const linkBtn = { border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: typography.sizes.base } as const
