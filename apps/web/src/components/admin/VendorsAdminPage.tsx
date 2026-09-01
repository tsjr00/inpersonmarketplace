/**
 * Vendors admin list — server side of the merged vendors page (admin UI
 * rebuild phase 4, owner 2026-08-31). Both routes render this:
 * /[vertical]/admin/vendors with scope = that vertical, /admin/vendors with
 * scope = null (all verticals). Superset of the two former pages — the
 * vertical copy's rich query (markets, listings count, Stripe flag,
 * verifications for the inline onboarding panel) runs for BOTH tiers now,
 * plus three filter repairs (same defect classes the owner ruled on for
 * users/listings):
 *   - search is SERVER-SIDE (both old pages filtered only the fetched page):
 *     or() over profile_data->>business_name / legal_name / email;
 *   - the all-scope vertical dropdown uses verticals.vertical_id (text slug —
 *     what vendor_profiles.vertical_id stores); the old platform page put
 *     verticals.id (UUID) in the option values, so that filter could never
 *     match a row;
 *   - tier options are per-vertical in the client (the old platform list
 *     offered only FT tiers; the old vertical list offered only FM tiers,
 *     even on the FT route).
 * 'pending' status means submitted OR draft (kept); 'suspended' is offered
 * on both tiers now (the vertical copy's dropdown lacked it).
 */

import { createServiceClient } from '@/lib/supabase/server'
import VendorsAdminTable, { type AdminVendorRow, type VendorVerificationInfo } from './VendorsAdminTable'

export interface VendorsSearchParams {
  page?: string
  limit?: string
  search?: string
  status?: string
  vertical?: string
  tier?: string
}

interface VendorsAdminPageProps {
  scope: string | null
  basePath: string
  searchParams: VendorsSearchParams
}

export default async function VendorsAdminPage({ scope, basePath, searchParams }: VendorsAdminPageProps) {
  const {
    page = '1', limit = '20', search = '',
    status = '', vertical = '', tier = '',
  } = searchParams

  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  const serviceClient = createServiceClient()

  let query = serviceClient
    .from('vendor_profiles')
    .select(`
      id, user_id, vertical_id, status, tier, event_approved, created_at,
      profile_data, orders_confirmed_count, orders_cancelled_after_confirm_count,
      stripe_account_id,
      market_vendors!market_vendors_vendor_profile_id_fkey ( market_id, markets ( name ) ),
      listings ( id )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })

  if (scope) query = query.eq('vertical_id', scope)
  else if (vertical) query = query.eq('vertical_id', vertical)

  if (status) {
    if (status === 'pending') query = query.in('status', ['submitted', 'draft'])
    else query = query.eq('status', status)
  }
  if (tier) query = query.eq('tier', tier)

  if (search) {
    // Server-side JSONB name/email search — single table, so a plain or()
    // with the ->> operator does it (no pre-query needed here).
    query = query.or(
      `profile_data->>business_name.ilike.%${search}%,profile_data->>legal_name.ilike.%${search}%,profile_data->>email.ilike.%${search}%`
    )
  }

  query = query.range(offset, offset + pageSize - 1)

  const { data: vendors, count, error } = await query
  if (error) {
    console.error('Error fetching vendors:', error)
  }
  const queryError = error ? `${error.message} (code: ${error.code})` : null

  const typedVendors: AdminVendorRow[] = (vendors || []).map(vendor => ({
    id: vendor.id as string,
    user_id: vendor.user_id as string,
    vertical_id: vendor.vertical_id as string,
    status: vendor.status as string,
    tier: vendor.tier as string | null,
    event_approved: !!(vendor as Record<string, unknown>).event_approved,
    created_at: vendor.created_at as string,
    profile_data: vendor.profile_data as AdminVendorRow['profile_data'],
    orders_confirmed_count: ((vendor as Record<string, unknown>).orders_confirmed_count as number) || 0,
    orders_cancelled_after_confirm_count: ((vendor as Record<string, unknown>).orders_cancelled_after_confirm_count as number) || 0,
    stripe_connected: !!(vendor as Record<string, unknown>).stripe_account_id,
    listing_count: (((vendor as Record<string, unknown>).listings as Array<{ id: string }> | null) || []).length,
    days_pending: Math.floor(
      (new Date().getTime() - new Date(vendor.created_at as string).getTime()) / (1000 * 60 * 60 * 24)
    ),
    markets: ((vendor.market_vendors || []) as unknown as Array<{ market_id: string; markets: { name: string } | null }>),
  }))

  // Verification records for the inline onboarding panel (was vertical-only;
  // both tiers get it now).
  const vendorIds = typedVendors.map(v => v.id)
  const { data: verifications } = vendorIds.length > 0
    ? await serviceClient
        .from('vendor_verifications')
        .select('*')
        .in('vendor_profile_id', vendorIds)
    : { data: [] }

  const verificationsMap: Record<string, VendorVerificationInfo> = {}
  for (const v of (verifications || [])) {
    verificationsMap[v.vendor_profile_id as string] = {
      status: (v.status as string) || 'pending',
      documents: Array.isArray(v.documents) ? v.documents as VendorVerificationInfo['documents'] : [],
      notes: v.notes as string | null,
      reviewed_at: v.reviewed_at as string | null,
      requested_categories: (v.requested_categories || []) as string[],
      category_verifications: (v.category_verifications || {}) as VendorVerificationInfo['category_verifications'],
      coi_status: (v.coi_status as string) || 'not_submitted',
      coi_documents: Array.isArray(v.coi_documents) ? v.coi_documents as VendorVerificationInfo['coi_documents'] : [],
      coi_verified_at: v.coi_verified_at as string | null,
      prohibited_items_acknowledged_at: v.prohibited_items_acknowledged_at as string | null,
      onboarding_completed_at: v.onboarding_completed_at as string | null,
    }
  }

  // Vertical options for the all-scope filter dropdown — text slug values
  // (the old platform page emitted UUIDs that never matched).
  let availableVerticals: Array<{ id: string; label: string }> = []
  if (!scope) {
    const { data: verticalsList } = await serviceClient
      .from('verticals')
      .select('vertical_id, name_public')
      .eq('is_active', true)
      .order('vertical_id')
    availableVerticals = (verticalsList || []).map(v => ({
      id: v.vertical_id as string,
      label: (v.name_public as string) || (v.vertical_id as string),
    }))
  }

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      {queryError && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991b1b', fontSize: 14 }}>
          <strong>Query error:</strong> {queryError}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
          {scope ? 'Vendors' : 'All Vendors'}
        </h1>
        <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
          {totalCount.toLocaleString()} vendors {scope ? 'in this vertical' : 'total'}
        </p>
      </div>

      <VendorsAdminTable
        vendors={typedVendors}
        verifications={verificationsMap}
        scope={scope}
        verticals={availableVerticals}
        basePath={basePath}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        initialFilters={{ search, status, vertical, tier }}
      />
    </div>
  )
}
