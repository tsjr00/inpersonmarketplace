import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { observed } from '@/lib/errors'
import { term } from '@/lib/vertical/terminology'
import { sundayOf, addDays, dayOfWeekOf } from '@/lib/markets/manager-week-strip'
import { declaredDatesForWeek } from '@/lib/markets/booth-cancel-credit'
import PrintButton from './PrintButton'

/**
 * The week sheet — the piece of paper a manager takes to the market
 * (owner 2026-09-20, easy-wins round). One table for one Sunday-keyed week:
 * every vendor with a booking or a hold that week, their booth number, size,
 * paid / pending / held, and which of the week's market days they declared.
 * Off-platform placeholders are listed too, so the sheet is the whole market.
 *
 * `?week=YYYY-MM-DD` (any date; snapped to its Sunday) — default: the current
 * week in the market's timezone. Print-styled: the page chrome hides under
 * @media print and the table is black on white.
 *
 * Auth: manager of this market (isMarketManager). Service client for the
 * reads (manager-scoped tables are RLS default-deny).
 */
interface PageProps {
  params: Promise<{ vertical: string; marketId: string }>
  searchParams: Promise<{ week?: string }>
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function nameOf(pd: unknown): string {
  const d = (pd ?? {}) as { business_name?: string; farm_name?: string }
  return d.business_name || d.farm_name || 'Unknown vendor'
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default async function WeekSheetPage({ params, searchParams }: PageProps) {
  const { vertical, marketId } = await params
  const { week: weekParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)
  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) redirect(`/${vertical}/dashboard`)

  const service = createServiceClient()
  const { data: market } = await observed(service
    .from('markets')
    .select('id, name, timezone')
    .eq('id', marketId)
    .maybeSingle(), { table: 'markets' })
  if (!market) redirect(`/${vertical}/dashboard`)

  const tz = (market.timezone as string | null) || 'America/Chicago'
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`
  const anchor = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today
  const week = sundayOf(anchor)
  const weekEnd = addDays(week, 6)

  const [rentalsRes, pinsRes, placeholdersRes, tiersRes, schedRes] = await Promise.all([
    observed(service
      .from('weekly_booth_rentals')
      .select('id, vendor_profile_id, booth_number, inventory_id, status, price_cents, vendor_profiles!weekly_booth_rentals_vendor_profile_id_fkey ( profile_data )')
      .eq('market_id', marketId)
      .eq('week_start_date', week)
      .in('status', ['pending_payment', 'paid', 'completed']), { table: 'weekly_booth_rentals' }),
    observed(service
      .from('market_vendors')
      .select('vendor_profile_id, booth_number, inventory_id, vendor_profiles!market_vendors_vendor_profile_id_fkey ( profile_data )')
      .eq('market_id', marketId)
      .eq('approved', true)
      .not('booth_number', 'is', null), { table: 'market_vendors' }),
    observed(service
      .from('market_booth_placeholders')
      .select('booth_number, inventory_id, notes')
      .eq('market_id', marketId), { table: 'market_booth_placeholders' }),
    observed(service
      .from('market_booth_inventory')
      .select('id, size_label')
      .eq('market_id', marketId), { table: 'market_booth_inventory' }),
    observed(service
      .from('market_schedules')
      .select('day_of_week, start_time, end_time')
      .eq('market_id', marketId)
      .eq('active', true), { table: 'market_schedules' }),
  ])

  const sizeById = new Map((tiersRes.data ?? []).map((t) => [t.id as string, t.size_label as string]))
  const marketDays = Array.from(new Set((schedRes.data ?? []).map((s) => s.day_of_week as number))).sort()
  const marketDates = marketDays.map((dow) => {
    const date = addDays(week, dow)
    return { dow, date, label: `${DAY_ABBR[dow]} ${fmtDate(date).replace(/^\w+, /, '')}` }
  })

  type Row = { name: string; booth: string; size: string; status: string; declared: Set<string>; vendorId: string | null }
  const rows: Row[] = []
  const rentedVendors = new Set<string>()
  for (const r of rentalsRes.data ?? []) {
    const vp = r.vendor_profiles as unknown as { profile_data: unknown } | { profile_data: unknown }[] | null
    const vendorId = r.vendor_profile_id as string
    rentedVendors.add(vendorId)
    rows.push({
      name: nameOf((Array.isArray(vp) ? vp[0] : vp)?.profile_data),
      booth: (r.booth_number as string | null) ?? '—',
      size: sizeById.get(r.inventory_id as string) ?? '—',
      status: r.status === 'pending_payment' ? 'Booked · NOT paid' : 'Paid',
      declared: new Set<string>(),
      vendorId,
    })
  }
  // Holds without a booking this week: on the sheet as "held", so the manager
  // knows whose number it is even if they have not paid.
  for (const p of pinsRes.data ?? []) {
    const vendorId = p.vendor_profile_id as string
    if (rentedVendors.has(vendorId)) continue
    const vp = p.vendor_profiles as unknown as { profile_data: unknown } | { profile_data: unknown }[] | null
    rows.push({
      name: nameOf((Array.isArray(vp) ? vp[0] : vp)?.profile_data),
      booth: p.booth_number as string,
      size: sizeById.get(p.inventory_id as string) ?? '—',
      status: 'Held · no booking this week',
      declared: new Set<string>(),
      vendorId,
    })
  }
  for (const ph of placeholdersRes.data ?? []) {
    rows.push({
      name: ((ph.notes as string | null) || '').trim() || 'Off-platform vendor',
      booth: ph.booth_number as string,
      size: sizeById.get(ph.inventory_id as string) ?? '—',
      status: 'Off-platform',
      declared: new Set(marketDates.map((d) => d.date)),
      vendorId: null,
    })
  }
  // Declared days for each on-platform row (one read per vendor; a week sheet
  // is small).
  await Promise.all(rows.filter((r) => r.vendorId).map(async (r) => {
    const dates = await declaredDatesForWeek(service, { marketId, vendorProfileId: r.vendorId as string, weekStartSunday: week })
    r.declared = new Set(dates)
  }))
  rows.sort((a, b) => {
    const an = parseInt(a.booth.replace(/\D/g, ''), 10)
    const bn = parseInt(b.booth.replace(/\D/g, ''), 10)
    if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an - bn
    return a.booth.localeCompare(b.booth)
  })

  const booth = term(vertical, 'booth')
  const prevWeek = addDays(week, -7)
  const nextWeek = addDays(week, 7)
  const isCurrent = week === sundayOf(today)

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif', color: '#111' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        }
        table.sheet { width: 100%; border-collapse: collapse; font-size: 14px; }
        table.sheet th, table.sheet td { border: 1px solid #999; padding: 6px 8px; text-align: left; vertical-align: top; }
        table.sheet th { background: #f3f4f6; }
        table.sheet td.c { text-align: center; }
      `}</style>

      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <Link href={`/${vertical}/market-manager/${marketId}/dashboard#weekly-bookings`} style={{ color: '#2563eb', textDecoration: 'none', fontSize: 14 }}>← Back to the dashboard</Link>
        <span style={{ flex: 1 }} />
        <Link href={`?week=${prevWeek}`} style={{ color: '#2563eb', fontSize: 14 }}>← Previous week</Link>
        <Link href={`?week=${nextWeek}`} style={{ color: '#2563eb', fontSize: 14 }}>Next week →</Link>
        <PrintButton />
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{market.name as string} — week sheet</h1>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: '#444' }}>
        Week of {fmtDate(week)} – {fmtDate(weekEnd)}{isCurrent ? ' (this week)' : ''} · {rows.length} {rows.length === 1 ? 'row' : 'rows'} ·
        {' '}printed {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: '#444' }}>Nothing on the books for this week yet.</p>
      ) : (
        <table className="sheet">
          <thead>
            <tr>
              <th>{booth} #</th>
              <th>Vendor</th>
              <th>Size</th>
              <th>Status</th>
              {marketDates.map((d) => <th key={d.date} style={{ textAlign: 'center' }}>{d.label}</th>)}
              <th style={{ width: 90 }}>Checked in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.booth}-${i}`}>
                <td style={{ fontWeight: 600 }}>{r.booth}</td>
                <td>{r.name}</td>
                <td>{r.size}</td>
                <td>{r.status}</td>
                {marketDates.map((d) => (
                  <td key={d.date} className="c">{r.declared.has(d.date) ? '✓' : ''}</td>
                ))}
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: '#666' }}>
        ✓ = the vendor declared that day. &ldquo;Held&rdquo; = the number is reserved for them but no week is booked. &ldquo;Booked · NOT paid&rdquo; = they cannot sell until they pay (fee markets).
        {marketDates.length === 0 ? ' No operating days are set for this market.' : ''}
      </p>
      <p className="no-print" style={{ fontSize: 12, color: '#666' }}>
        Week starts on Sunday, matching bookings. Today in {tz}: {fmtDate(today)} ({DAY_ABBR[dayOfWeekOf(today)]}).
      </p>
    </div>
  )
}
