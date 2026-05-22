import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ScheduleDisplay from '@/components/markets/ScheduleDisplay'
import ScheduleManager from './ScheduleManager'
import VendorManager from './VendorManager'
import MarketManagerAssignment from '@/components/market-manager/MarketManagerAssignment'
import ApproveStatusButton from './ApproveStatusButton'

interface MarketDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  await requireAdmin()
  const { id } = await params
  const supabase = createServiceClient()

  // Get market with schedules and vendors
  const { data: market, error } = await supabase
    .from('markets')
    .select(`
      *,
      market_schedules(*),
      market_vendors(
        id,
        vendor_profile_id,
        approved,
        booth_number,
        notes,
        created_at,
        vendor_profiles!market_vendors_vendor_profile_id_fkey(
          id,
          profile_data,
          status
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !market) {
    notFound()
  }

  // Transform vendors
  const vendors = market.market_vendors?.map((mv: {
    id: string
    vendor_profile_id: string
    approved: boolean
    booth_number: string | null
    notes: string | null
    created_at: string
    vendor_profiles: { id: string; profile_data: Record<string, unknown>; status: string } | null
  }) => ({
    id: mv.id,
    vendor_profile_id: mv.vendor_profile_id,
    approved: mv.approved,
    booth_number: mv.booth_number,
    notes: mv.notes,
    created_at: mv.created_at,
    business_name: mv.vendor_profiles?.profile_data?.business_name ||
                   mv.vendor_profiles?.profile_data?.farm_name ||
                   'Unknown',
    vendor_status: mv.vendor_profiles?.status,
  }))

  const pendingVendors = vendors?.filter((v: { approved: boolean }) => !v.approved) || []
  const approvedVendors = vendors?.filter((v: { approved: boolean }) => v.approved) || []

  // Possible-duplicate check (intake fraud guard). Mirrors the intake
  // route's post-insert query — same name + same city, excluding this
  // market. Only relevant for `status='pending'`; active markets are
  // already approved and live, no need to re-warn.
  //
  // Implementation: fetch every market in the same city (ilike — city
  // values are uniform enough), then normalize-and-filter the name in
  // JS. Normalization strips everything except a-z/0-9 and lowercases
  // so we catch "Farmer's" vs "Farmers", whitespace, punctuation, etc.
  // A pure ilike on name misses real duplicates that have subtle data
  // differences — which is what happened in Session 84 testing.
  const marketStatus = (market.status as string | null) || 'active'
  const isPending = marketStatus === 'pending'
  let possibleDuplicates: Array<{
    id: string
    name: string
    city: string | null
    state: string | null
    status: string | null
    manager_email: string | null
  }> = []
  if (isPending && market.name && market.city) {
    const normalizeName = (s: string): string =>
      s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const targetNormalized = normalizeName(market.name as string)

    const { data: cityCandidates } = await supabase
      .from('markets')
      .select('id, name, city, state, status, manager_email')
      .ilike('city', market.city as string)
      .neq('id', id)

    possibleDuplicates = (cityCandidates ?? [])
      .filter((c) => normalizeName((c.name as string | null) ?? '') === targetNormalized)
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        city: (c.city as string | null) ?? null,
        state: (c.state as string | null) ?? null,
        status: (c.status as string | null) ?? null,
        manager_email: (c.manager_email as string | null) ?? null,
      }))
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/admin/markets"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#0070f3',
          textDecoration: 'none',
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Markets
      </Link>

      {/* Possible-duplicate warning — only for pending markets where
          another market shares this exact (name + city). The intake
          route surfaced this in the admin email too; this banner makes
          sure the admin sees it again when they open the detail page. */}
      {isPending && possibleDuplicates.length > 0 && (
        <div style={{
          padding: '14px 16px',
          marginBottom: 20,
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 8,
          color: '#664d03',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
            ⚠️ Possible duplicate / claim of existing market
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
            Another market with the same name and city already exists. Before approving this intake, verify the prospective manager is legitimate.
          </div>
          <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: '#664d03' }}>
            <li>Email the prospective manager and ask for ownership proof (LLC docs, market website with their name, signed letter from the market organization).</li>
            <li>Request a Certificate of Insurance naming the market as additional insured (if applicable).</li>
            <li>Contact the existing market&apos;s manager_email (if set) to confirm or deny the new request.</li>
            <li>Do not approve until verified — booth rental payments route through Stripe and reversing a fraudulent activation is costly.</li>
          </ul>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Existing market{possibleDuplicates.length === 1 ? '' : 's'} with the same name + city:
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fffaf0' }}>
            <tbody>
              {possibleDuplicates.map((d) => (
                <tr key={d.id}>
                  <td style={{ padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', borderBottom: '1px solid #f5e6c2' }}>
                    <Link href={`/admin/markets/${d.id}`} style={{ color: '#664d03', textDecoration: 'underline' }}>
                      {d.id}
                    </Link>
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #f5e6c2' }}>
                    <strong>{d.name}</strong>
                    {' · '}
                    {d.city}{d.state ? `, ${d.state}` : ''}
                    {' · status='}
                    <code>{d.status ?? 'unknown'}</code>
                    {d.manager_email
                      ? <> · current manager: <a href={`mailto:${d.manager_email}`} style={{ color: '#664d03' }}>{d.manager_email}</a></>
                      : ' · no manager_email on file'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#333' }}>{market.name}</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <span style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: market.market_type === 'traditional' ? '#e8f5e9' : '#fff3e0',
              color: market.market_type === 'traditional' ? '#2e7d32' : '#e65100',
            }}>
              {market.market_type === 'traditional' ? 'Traditional' : 'Private Pickup'}
            </span>
            <span style={{
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: market.active ? '#d4edda' : '#f8d7da',
              color: market.active ? '#155724' : '#721c24',
            }}>
              {market.active ? 'Active' : 'Inactive'}
            </span>
            {/* Status badge — separate from `active` boolean. Surfaces
                the `markets.status` column (pending / active / inactive
                / rejected / suspended). Pending markets come in via the
                public intake form (/api/market-manager/intake) and stay
                hidden from public browse until admin flips status to
                'active' via the approve button below. */}
            {market.status && market.status !== 'active' && (
              <span style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: market.status === 'pending' ? '#fff3cd' : '#f5c6cb',
                color: market.status === 'pending' ? '#856404' : '#721c24',
              }}>
                Status: {market.status}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <ApproveStatusButton marketId={id} status={(market.status as string) || 'active'} />
          <Link
            href={`/admin/markets/${id}/edit`}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0070f3',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            Edit Market
          </Link>
        </div>
      </div>

      {/* Market Info */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#333' }}>
          Market Information
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Description
            </h4>
            <p style={{ margin: 0, color: '#333', lineHeight: 1.6 }}>
              {market.description || '-'}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Location
            </h4>
            <p style={{ margin: 0, color: '#333' }}>
              {market.address || '-'}<br />
              {[market.city, market.state, market.zip].filter(Boolean).join(', ') || '-'}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Contact Email
            </h4>
            <p style={{ margin: 0, color: '#333' }}>
              {market.contact_email || '-'}
            </p>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase' }}>
              Contact Phone
            </h4>
            <p style={{ margin: 0, color: '#333' }}>
              {market.contact_phone || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Market Manager — FM only for v1 */}
      {market.vertical_id === 'farmers_market' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#333' }}>
            Market Manager
          </h2>
          <MarketManagerAssignment
            marketId={id}
            managerEmail={market.manager_email as string | null}
            managerUserId={market.manager_user_id as string | null}
            managerInvitedAt={market.manager_invited_at as string | null}
            managerAcceptedAt={market.manager_accepted_at as string | null}
          />
        </div>
      )}

      {/* Schedules - Required for ALL market types */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#333' }}>
          {market.market_type === 'traditional' ? 'Operating Schedule' : 'Pickup Schedule'}
        </h2>

        {/* Warning if no schedules */}
        {(!market.market_schedules || market.market_schedules.length === 0) && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#991b1b' }}>
                  Schedule Required
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#991b1b' }}>
                  This {market.market_type === 'traditional' ? 'market' : 'pickup location'} has no schedule.
                  Without a schedule, the order cutoff system cannot function and listings may not work correctly.
                  Please add at least one schedule below.
                </p>
              </div>
            </div>
          </div>
        )}

        <ScheduleDisplay schedules={market.market_schedules || []} />

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
          <ScheduleManager marketId={id} schedules={market.market_schedules || []} />
        </div>
      </div>

      {/* Pending Vendors */}
      {pendingVendors.length > 0 && (
        <div style={{
          backgroundColor: '#fff3cd',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#856404' }}>
            Pending Applications ({pendingVendors.length})
          </h2>
          <VendorManager marketId={id} vendors={pendingVendors} type="pending" />
        </div>
      )}

      {/* Approved Vendors */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#333' }}>
          Approved Vendors ({approvedVendors.length})
        </h2>
        {approvedVendors.length > 0 ? (
          <VendorManager marketId={id} vendors={approvedVendors} type="approved" />
        ) : (
          <p style={{ color: '#666', margin: 0 }}>No approved vendors yet.</p>
        )}
      </div>
    </div>
  )
}
