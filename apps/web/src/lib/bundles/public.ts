/**
 * Buyer-facing bundle display data (mig 244) — shared by the public market
 * page section and the /api/bundles/[bundleId] detail endpoint so the
 * availability rule has ONE definition on the display side. (Checkout's
 * expansion block remains the authoritative enforcement at purchase time —
 * these mirror it for display.)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { bundleDisplayPriceCents, bundleOrderingOpen } from '@/lib/bundles/core'
import { todayInTimezone, DEFAULT_TIMEZONE } from '@/lib/time/market-dates'
import type { BundleCardData } from '@/components/markets/MarketBundlesSection'

interface ComponentListing {
  id: string
  title: string | null
  price_cents: number | null
  quantity: number | null
  status: string | null
  deleted_at: string | null
  vendor_profile_id: string | null
  vendor_profiles: { bundles_opt_out: boolean; profile_data: Record<string, unknown> | null } | null
}

/** Display-side mirror of the checkout expansion's per-component gate. */
export function componentIsLive(l: ComponentListing | undefined, neededQty: number): boolean {
  if (!l || l.deleted_at || l.status !== 'published') return false
  if (l.vendor_profiles?.bundles_opt_out) return false
  if (l.quantity !== null && l.quantity !== undefined && (l.quantity as number) < neededQty) return false
  return true
}

export function vendorDisplayName(l: ComponentListing | undefined): string {
  const pd = l?.vendor_profiles?.profile_data ?? {}
  return (pd.business_name as string) || (pd.farm_name as string) || 'Vendor'
}

/** Active bundles for a market, shaped for MarketBundlesSection cards. */
export async function getMarketBundleCards(
  serviceClient: SupabaseClient,
  marketId: string,
  marketTimezone: string | null
): Promise<BundleCardData[]> {
  const { data: bundles } = await observed(serviceClient
    .from('market_bundles')
    .select('id, name, description, margin_cents, quantity_limit, quantity_sold, pickup_market_date, pickup_notes, cause_beneficiary_id, cause_pct, market_bundle_components (listing_id, quantity)')
    .eq('market_id', marketId)
    .eq('status', 'active')
    .order('pickup_market_date', { ascending: true }), { table: 'market_bundles' })
  if (!bundles || bundles.length === 0) return []

  const listingIds = [...new Set(bundles.flatMap(b =>
    ((b.market_bundle_components ?? []) as Array<{ listing_id: string }>).map(c => c.listing_id)))]
  const { data: listings } = listingIds.length
    ? await observed(serviceClient
        .from('listings')
        .select('id, title, price_cents, quantity, status, deleted_at, vendor_profile_id, vendor_profiles (bundles_opt_out, profile_data)')
        .in('id', listingIds), { table: 'listings' })
    : { data: [] }
  const byId = new Map(((listings ?? []) as unknown as ComponentListing[]).map(l => [l.id, l]))

  const beneficiaryIds = [...new Set(bundles.map(b => b.cause_beneficiary_id as string | null).filter((x): x is string => !!x))]
  const { data: beneficiaries } = beneficiaryIds.length
    ? await observed(serviceClient
        .from('cause_beneficiaries')
        .select('id, name')
        .in('id', beneficiaryIds), { table: 'cause_beneficiaries' })
    : { data: [] }
  const beneficiaryNames = new Map((beneficiaries ?? []).map(b => [b.id as string, b.name as string]))

  const today = todayInTimezone(marketTimezone || DEFAULT_TIMEZONE)

  return bundles
    .filter(b => !!b.pickup_market_date)
    .map(b => {
      const components = (b.market_bundle_components ?? []) as Array<{ listing_id: string; quantity: number }>
      let componentSum = 0
      let allLive = components.length > 0
      const makerIds = new Set<string>()
      const makers: Array<{ vendorProfileId: string; vendorName: string }> = []
      for (const c of components) {
        const l = byId.get(c.listing_id)
        if (!componentIsLive(l, c.quantity)) allLive = false
        componentSum += ((l?.price_cents as number) ?? 0) * c.quantity
        const vid = l?.vendor_profile_id
        if (vid && !makerIds.has(vid)) {
          makerIds.add(vid)
          makers.push({ vendorProfileId: vid, vendorName: vendorDisplayName(l) })
        }
      }
      const remaining = Math.max(0, (b.quantity_limit as number) - (b.quantity_sold as number))
      const orderingOpen = bundleOrderingOpen(today, b.pickup_market_date as string)
      return {
        id: b.id as string,
        name: b.name as string,
        description: (b.description as string) || null,
        displayPriceCents: bundleDisplayPriceCents(componentSum, b.margin_cents as number),
        remaining,
        pickupMarketDate: b.pickup_market_date as string,
        pickupNotes: (b.pickup_notes as string) || null,
        causeName: b.cause_beneficiary_id ? (beneficiaryNames.get(b.cause_beneficiary_id as string) ?? null) : null,
        causePct: (b.cause_pct as number) || null,
        makers,
        available: allLive && remaining > 0 && orderingOpen,
      }
    })
}
