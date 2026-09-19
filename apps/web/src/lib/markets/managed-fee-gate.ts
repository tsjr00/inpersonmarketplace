import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'

/**
 * Managed-market obligation (owner rulings 2026-09-18, decisions.md):
 *
 *   At a MANAGED (markets.manager_user_id set), FEE-CHARGING farmers market, a
 *   vendor sells a given date — and counts as "open"/"scheduled" there — only
 *   with a PAID booth week covering that date. This is the FT paid-park rule
 *   (mig 199: booking = selling = paid) applied to FM. Everywhere else —
 *   off-app markets, free managed markets, private pickups — the vendor's
 *   attendance row (vendor_market_schedules.is_active) stays the rule.
 *
 * "Charges vendors" = FT: park_mode <> 'free'; FM: any market_booth_inventory
 * tier with weekly_price_cents > 0 (the definition the managed-join gate in
 * api/vendor/markets/[id]/schedules already used — moved here so there is ONE).
 *
 * @paired-rule managed-fee-market-sells-paid-weeks — the SQL sell gate
 * (get_available_pickup_dates, mig 255 FM predicate) is the authoritative
 * twin; buyer visibility (visible-markets.ts + market-visibility.ts) and the
 * vendor week strip (week-strip.ts) read THIS module so they cannot drift from
 * each other. See lib/paired-rules.ts.
 *
 * The conflict checker and the schedule gates deliberately do NOT use this:
 * an attendance row is a COMMITMENT before payment (owner ruling 5).
 */

export interface MarketFeeShape {
  id: string
  vertical_id: string
  park_mode?: string | null
}

/** Does this market charge vendors to sell? FT by park mode; FM by priced booth tiers. */
export async function marketChargesVendors(
  service: SupabaseClient,
  market: MarketFeeShape
): Promise<boolean> {
  if (market.vertical_id === 'food_trucks') {
    return market.park_mode !== 'free'
  }
  const { data: pricedInventory } = await observed(service
    .from('market_booth_inventory')
    .select('id')
    .eq('market_id', market.id)
    .gt('weekly_price_cents', 0)
    .limit(1), { table: 'market_booth_inventory' })
  return (pricedInventory ?? []).length > 0
}

/**
 * Of the given market ids, the FARMERS-MARKET ones that are managed AND charge
 * for booths — the markets where the paid-week rule applies. FT parks are
 * excluded on purpose: their paid-day rule already lives in the sell gate
 * (mig 199) and the check-in route.
 */
export async function getManagedFeeMarketIds(
  service: SupabaseClient,
  marketIds: string[]
): Promise<Set<string>> {
  if (marketIds.length === 0) return new Set()
  const { data: managed } = await observed(service
    .from('markets')
    .select('id')
    .in('id', marketIds)
    .eq('vertical_id', 'farmers_market')
    .eq('market_type', 'traditional')
    .not('manager_user_id', 'is', null), { table: 'markets' })
  const managedIds = (managed ?? []).map((m) => m.id as string)
  if (managedIds.length === 0) return new Set()
  const { data: priced } = await observed(service
    .from('market_booth_inventory')
    .select('market_id')
    .in('market_id', managedIds)
    .gt('weekly_price_cents', 0), { table: 'market_booth_inventory' })
  return new Set((priced ?? []).map((r) => r.market_id as string))
}

/** ISO date (YYYY-MM-DD) shifted by `days`, no timezone shift. */
export function shiftIsoDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d! + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** A booth week runs 7 days from its week_start_date (inclusive). */
export function fmWeekCovers(weekStartDate: string, date: string): boolean {
  return date >= weekStartDate && date <= shiftIsoDate(weekStartDate, 6)
}

/**
 * `${marketId}|${vendorProfileId}` pairs holding a PAID booth week that is
 * current or upcoming as of `fromDate` (a week whose start is at most 6 days
 * before `fromDate` still covers it). Query only the markets that need it.
 */
export async function getPaidWeekPairs(
  service: SupabaseClient,
  marketIds: string[],
  fromDate: string
): Promise<Set<string>> {
  if (marketIds.length === 0) return new Set()
  const { data: rentals } = await observed(service
    .from('weekly_booth_rentals')
    .select('market_id, vendor_profile_id')
    .in('market_id', marketIds)
    .eq('status', 'paid')
    .gte('week_start_date', shiftIsoDate(fromDate, -6)), { table: 'weekly_booth_rentals' })
  return new Set((rentals ?? []).map((r) => `${r.market_id}|${r.vendor_profile_id}`))
}

/** Today as YYYY-MM-DD in the given IANA timezone (markets carry their own). */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
