/**
 * Listings admin page body — server side of the merged listings page (admin
 * UI rebuild phase 3, merge 2/11, owner 2026-08-30). Both routes render this:
 * /[vertical]/admin/listings with scope = that vertical, /admin/listings with
 * scope = null (all verticals). One query, superset of the two former pages,
 * plus three filter repairs (same defect classes the owner found on the
 * users page):
 *   - search is SERVER-SIDE now (both old pages filtered the current 20-row
 *     page client-side, so counts and pagination ignored the search):
 *     title ilike OR vendor-name match, the vendor half resolved by a
 *     vendor_profiles pre-query on profile_data business_name/farm_name;
 *   - the all-scope vertical dropdown uses verticals.vertical_id (the text
 *     slug that listings.vertical_id actually stores). The old platform page
 *     put verticals.id — a UUID — in the option values, so the filter could
 *     never match a row;
 *   - the status filter offers Paused (suspended). The suspend action on this
 *     very page sets status='paused', but the old dropdowns stopped at
 *     published/draft/archived (listing_status enum: draft, published,
 *     paused, archived).
 */

import { createServiceClient } from '@/lib/supabase/server'
import ListingsAdminTable, { type AdminListingRow } from './ListingsAdminTable'

export interface ListingsSearchParams {
  page?: string
  limit?: string
  search?: string
  status?: string
  vertical?: string
  category?: string
}

interface ListingsAdminPageProps {
  scope: string | null
  basePath: string
  searchParams: ListingsSearchParams
}

export default async function ListingsAdminPage({ scope, basePath, searchParams }: ListingsAdminPageProps) {
  const {
    page = '1', limit = '20', search = '',
    status = '', vertical = '', category = '',
  } = searchParams

  const currentPage = Math.max(1, parseInt(page))
  const pageSize = Math.min(100, Math.max(10, parseInt(limit)))
  const offset = (currentPage - 1) * pageSize

  const serviceClient = createServiceClient()

  let query = serviceClient
    .from('listings')
    .select(`
      id, title, status, price_cents, quantity, category, vertical_id, created_at,
      vendor_profiles!inner ( id, tier, profile_data )
    `, { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (scope) query = query.eq('vertical_id', scope)
  else if (vertical) query = query.eq('vertical_id', vertical)
  if (status) query = query.eq('status', status)
  if (category) query = query.eq('category', category)

  if (search) {
    // PostgREST cannot OR a parent column against an embedded-table column,
    // so resolve vendors whose name matches first, then fold their ids into
    // one or() on listings (title match OR vendor match).
    let vendorQ = serviceClient
      .from('vendor_profiles')
      .select('id')
      .or(`profile_data->>business_name.ilike.%${search}%,profile_data->>farm_name.ilike.%${search}%`)
      .limit(500)
    if (scope) vendorQ = vendorQ.eq('vertical_id', scope)
    const { data: vendorMatches } = await vendorQ
    const vendorIds = (vendorMatches || []).map(v => v.id as string)
    query = vendorIds.length > 0
      ? query.or(`title.ilike.%${search}%,vendor_profile_id.in.(${vendorIds.join(',')})`)
      : query.ilike('title', `%${search}%`)
  }

  query = query.range(offset, offset + pageSize - 1)

  const { data: listings, count, error } = await query
  if (error) {
    console.error('Error fetching listings:', error)
  }

  // Category options for the filter dropdown (scoped to the vertical when scoped).
  let catQ = serviceClient
    .from('listings')
    .select('category')
    .is('deleted_at', null)
    .not('category', 'is', null)
  if (scope) catQ = catQ.eq('vertical_id', scope)
  const { data: categoriesList } = await catQ
  const categories = [...new Set((categoriesList || []).map(c => c.category as string).filter(Boolean))].sort()

  // Vertical options for the all-scope filter dropdown — see header comment:
  // option value must be the text slug, label is the public name.
  let verticals: Array<{ id: string; label: string }> = []
  if (!scope) {
    const { data: verticalsList } = await serviceClient
      .from('verticals')
      .select('vertical_id, name_public')
      .eq('is_active', true)
      .order('vertical_id')
    verticals = (verticalsList || []).map(v => ({
      id: v.vertical_id as string,
      label: (v.name_public as string) || (v.vertical_id as string),
    }))
  }

  const typedListings: AdminListingRow[] = (listings || []).map(listing => ({
    id: listing.id as string,
    title: listing.title as string,
    status: listing.status as string,
    price_cents: listing.price_cents as number,
    quantity: (listing as Record<string, unknown>).quantity as number | null,
    category: listing.category as string | null,
    vertical_id: listing.vertical_id as string,
    created_at: listing.created_at as string,
    vendor_profiles: (() => {
      const vp = Array.isArray(listing.vendor_profiles)
        ? listing.vendor_profiles[0]
        : listing.vendor_profiles
      if (!vp) return null
      return {
        id: (vp as Record<string, unknown>).id as string,
        tier: (vp as Record<string, unknown>).tier as string | null,
        profile_data: (vp as Record<string, unknown>).profile_data as {
          business_name?: string
          farm_name?: string
        } | null,
      }
    })(),
  }))

  const totalCount = count || 0
  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
          {scope ? 'Listings' : 'All Listings'}
        </h1>
        <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
          {totalCount.toLocaleString()} listings {scope ? 'in this vertical' : 'total'}
        </p>
      </div>
      <ListingsAdminTable
        listings={typedListings}
        scope={scope}
        verticals={verticals}
        categories={categories}
        basePath={basePath}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        initialFilters={{ search, status, vertical, category }}
      />
    </div>
  )
}
