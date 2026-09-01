import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ScheduleDisplay from '@/components/markets/ScheduleDisplay'
import ScheduleManager from '@/components/admin/MarketScheduleManager'
import VendorManager from '@/components/admin/MarketVendorManager'
import MarketManagerAssignment from '@/components/market-manager/MarketManagerAssignment'
import ManagerHistoryPanel, { type ManagerHistoryRow } from '@/components/admin/ManagerHistoryPanel'
import ApproveStatusButton from '@/components/admin/MarketApproveStatusButton'
import MarketDetailActions from '@/components/admin/MarketDetailActions'
import SurveyResultsCard from '@/components/market-manager/SurveyResultsCard'
import DuplicateMarketBanner from '@/components/markets/DuplicateMarketBanner'
import MarketDocumentsViewer from '@/components/markets/MarketDocumentsViewer'
import MarketTaxJurisdictionsCard from '@/components/admin/MarketTaxJurisdictionsCard'

/**
 * Shared market detail page (admin UI rebuild phase 5, owner 2026-08-31).
 *
 * Absorbs the platform admin detail (app/admin/markets/[id] — schedules,
 * vendors, manager + history, duplicates, documents, tax, survey, intake
 * approve) and adds the vertical list's row actions via MarketDetailActions
 * so phones no longer need landscape mode for approve / suspend / delete.
 *
 * Auth lives in the route wrappers (platform: requireAdmin; vertical:
 * redirect-based inline admin check) — this component assumes an admin.
 *
 * Changes vs the absorbed platform page:
 *  - Manager section: gated on market_type='traditional' instead of FM-only.
 *    The manager partnership is vertical-agnostic (FM market managers AND FT
 *    park operators — auth + routes key on market_id, not vertical); the
 *    vertical list's edit form already applied this newer rule.
 *  - Type badge handles 'event' (the platform page predated event markets).
 *  - Edit → the vertical markets list with ?edit=<id> (the single edit form;
 *    the platform edit form was retired in this phase — its API wrote the
 *    phantom columns `type` and `zip_code`, so it errored on save).
 *  - Delete/suspend/approve-suggestion actions call the GUARDED admin API.
 */
interface MarketDetailAdminPageProps {
  marketId: string
  /** Back-link target: the list this detail was opened from. */
  backHref: string
  /** When set (vertical route), a market outside this vertical 404s. */
  vertical?: string
}

export default async function MarketDetailAdminPage({ marketId, backHref, vertical }: MarketDetailAdminPageProps) {
  const id = marketId
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

  // Vertical route: don't serve another vertical's market on this URL.
  if (vertical && market.vertical_id !== vertical) {
    notFound()
  }

  // Phase 1B — manager assignment history (newest first). Service client
  // because market_manager_history is RLS default-deny. Traditional markets
  // only (matches the Market Manager section gate below).
  let managerHistory: ManagerHistoryRow[] = []
  if (market.market_type === 'traditional') {
    const { data: histRows } = await supabase
      .from('market_manager_history')
      .select('manager_email_snapshot, assigned_at, ended_at, end_reason')
      .eq('market_id', id)
      .order('assigned_at', { ascending: false })
    managerHistory = (histRows || []) as ManagerHistoryRow[]
  }

  // Only show ACTIVE schedules. Schedules are soft-deleted (active=false) by
  // the single-schedule DELETE route — the row is preserved so cascade FKs
  // (vendor_market_schedules / order_items / cart_items) keep their links, but
  // an inactive window should look "gone" to the admin.
  const activeSchedules = (market.market_schedules || []).filter(
    (s: { active?: boolean }) => s.active !== false
  )

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

  const marketType = market.market_type as string
  // Edit uses the vertical list's inline form (the one edit surface).
  // Traditional + event only: for private pickups the admin PUT accepts
  // ONLY status changes — all other fields are vendor-managed.
  const editHref = `/${market.vertical_id}/admin/markets?edit=${id}`
  const canEdit = marketType === 'traditional' || marketType === 'event'

  return (
    <div>
      {/* Back link */}
      <Link
        href={backHref}
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
          another market shares this exact (name + city). */}
      {isPending && <DuplicateMarketBanner duplicates={possibleDuplicates} />}

      {/* Verification documents (NEW-7) — manager-uploaded evidence the
          admin reviews during the status=pending → active approval flow.
          For pending intake markets this is the primary review surface;
          for active markets it serves as ongoing reference. */}
      <MarketDocumentsViewer
        marketId={id}
        heading="Verification Documents (manager-uploaded)"
        showEmptyState={isPending}
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#333' }}>{market.name}</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: marketType === 'traditional' ? '#e8f5e9' : marketType === 'event' ? '#fef3c7' : '#fff3e0',
              color: marketType === 'traditional' ? '#2e7d32' : marketType === 'event' ? '#92400e' : '#e65100',
            }}>
              {marketType === 'traditional' ? 'Traditional' : marketType === 'event' ? '🎪 Event' : 'Private Pickup'}
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
            {/* Status badge — separate from `active` boolean. Surfaces the
                `markets.status` column (pending / active / inactive /
                rejected / suspended). Pending markets come in via the public
                intake form and stay hidden from public browse until an admin
                flips status to 'active' via the approve button below. */}
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
            {/* Vendor-suggested markets carry an approval workflow of their
                own (approval_status), separate from intake status. */}
            {market.approval_status && market.approval_status !== 'approved' && (
              <span style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: market.approval_status === 'pending' ? '#fef3c7' : '#fee2e2',
                color: market.approval_status === 'pending' ? '#92400e' : '#991b1b',
              }}>
                Suggestion: {market.approval_status}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <ApproveStatusButton marketId={id} status={marketStatus} />
          {canEdit && (
            <Link
              href={editHref}
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
          )}
        </div>
      </div>

      {/* Approve / reject / suspend / delete — the vertical list's row
          actions, available here so mobile admins have full control. */}
      <div style={{ marginBottom: 24 }}>
        <MarketDetailActions
          marketId={id}
          marketName={market.name as string}
          marketType={marketType}
          status={marketStatus}
          approvalStatus={(market.approval_status as string | null) ?? null}
          listHref={backHref}
        />
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

        {/* Sales tax jurisdictions (mig 214) — set at approval time, alongside
            the address/coordinates work the admin is already doing here. Every
            order picked up at this market inherits these rates; the seven-digit
            local codes are what Form 01-116 reports against. Reference data
            only — nothing here calculates or charges tax. */}
        <MarketTaxJurisdictionsCard marketId={id} />
      </div>

      {/* Market Manager — traditional markets (vertical-agnostic: FM market
          managers AND FT park operators; keys on market_id, not vertical). */}
      {marketType === 'traditional' && (
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
            managerStatus={market.manager_status as string | null}
          />

          {/* Phase 1B — assignment history audit trail */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#555' }}>
              Assignment history
            </h3>
            <ManagerHistoryPanel history={managerHistory} />
          </div>
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
          {marketType === 'traditional' ? 'Operating Schedule' : marketType === 'event' ? 'Event Schedule' : 'Pickup Schedule'}
        </h2>

        {/* Warning if no schedules */}
        {activeSchedules.length === 0 && (
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
                  This {marketType === 'traditional' ? 'market' : marketType === 'event' ? 'event' : 'pickup location'} has no schedule.
                  Without a schedule, the order cutoff system cannot function and listings may not work correctly.
                  Please add at least one schedule below.
                </p>
              </div>
            </div>
          </div>
        )}

        <ScheduleDisplay schedules={activeSchedules} />

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
          <ScheduleManager marketId={id} schedules={activeSchedules} />
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

      {/* Survey results — same component as the manager dashboard.
          Admin gets a per-market view of vendor + buyer survey
          aggregates. Phase E Stage 5. */}
      <SurveyResultsCard marketId={id} vertical={market.vertical_id as string} />
    </div>
  )
}
