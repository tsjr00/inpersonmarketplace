import type { SupabaseClient } from '@supabase/supabase-js'

export interface VendorProfileResult<T> {
  profile: T | null
  error: string | null
}

/**
 * Find a vendor profile for a given user, scoped to a specific vertical.
 *
 * A single auth user can have vendor_profiles in multiple verticals (e.g. one
 * for farmers_market, one for food_trucks). Querying by user_id alone with
 * `.single()` fails for these users with a "more than one row" error which
 * gets surfaced to the vendor as the unhelpful "Vendor profile not found".
 *
 * Resolution rules:
 * 1. Zero profiles → not-found error
 * 2. Exactly one profile → return it (vertical param optional, works for
 *    single-vertical vendors with or without the client passing ?vertical=)
 * 3. Multiple profiles + matching vertical → return the matching one
 * 4. Multiple profiles + no vertical → disambiguation error listing which
 *    verticals exist
 * 5. Multiple profiles + vertical with no match → not-found error
 *
 * Callers should pass `verticalId` whenever possible:
 * - From `request.nextUrl.searchParams.get('vertical')` for onboarding,
 *   certifications, event-readiness routes
 * - Derived from a fetched resource (e.g. `market.vertical_id`) for routes
 *   where the URL identifies a vertical-scoped resource
 *
 * @param select  Columns to select from vendor_profiles. Defaults to 'id'.
 *                `vertical_id` is automatically included for disambiguation.
 */
export async function getVendorProfileForVertical<T = { id: string }>(
  supabase: SupabaseClient,
  userId: string,
  verticalId: string | null | undefined,
  select: string = 'id'
): Promise<VendorProfileResult<T>> {
  const selectParts = select.split(',').map((s) => s.trim())
  const fullSelect = selectParts.includes('vertical_id')
    ? select
    : `${select}, vertical_id`

  let query = supabase
    .from('vendor_profiles')
    .select(fullSelect)
    .eq('user_id', userId)

  if (verticalId) {
    query = query.eq('vertical_id', verticalId)
  }

  const { data, error } = await query

  if (error) {
    return { profile: null, error: error.message }
  }

  if (!data || data.length === 0) {
    return {
      profile: null,
      error: verticalId
        ? `vendor profile not found for vertical '${verticalId}'`
        : 'vendor profile not found',
    }
  }

  if (data.length > 1) {
    const verticals = (data as unknown as Array<Record<string, unknown>>)
      .map((d) => String(d.vertical_id ?? 'unknown'))
      .join(', ')
    return {
      profile: null,
      error: `user has vendor profiles in multiple verticals (${verticals}) — vertical parameter is required`,
    }
  }

  return { profile: data[0] as unknown as T, error: null }
}
