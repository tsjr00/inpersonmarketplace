/**
 * Followed-vendor digest (A3, vip_loyalty_buildout_plan.md — owner decisions
 * 2026-09-04).
 *
 * THE RULE (owner): "today's special notification is fine, but it should
 * consolidate offers — we don't want a user to get 5 updates from 5 trucks."
 * ONE notification per buyer per vertical per day, covering every followed or
 * VIP vendor's new items. There is exactly ONE send call in this module, and
 * it fires per BUYER — a per-vendor loop around a send is the defect this
 * design exists to prevent (flow-integrity-guarded).
 *
 * Cadence (owner Q4): 8am local, content-gated — zero new items means zero
 * send, which is also what keeps the off-season silent (out of season buyers
 * "go to the app and look"). Local time follows the house idiom: each
 * buyer's send hour keys off their vendors' home-market timezone (fallback
 * 'America/Chicago', the same fallback the surveys cron uses). Runs as an
 * independent block inside the HOURLY surveys cron — the 8:00–8:59 window
 * plus the notifications-table dedup makes once-per-day structural.
 *
 * v1 limitation (accepted): "new" = listing CREATED in the last 24h with
 * status published. A listing drafted earlier and published today is missed.
 * Free channels only (immediate = push + in_app) — comms-cost rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'

const SEND_HOUR = 8 // 8:00–8:59 local — owner: "8am daily during the season"
const MAX_ITEMS_PER_VENDOR = 3
const DEDUP_WINDOW_HOURS = 20 // < 24 so tomorrow's 8am is never blocked

export interface VendorDigestSummary {
  vendorsWithNewItems: number
  buyersNotified: number
  errors: string[]
}

function localHour(tz: string): number {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz })).getHours()
}

export async function runFollowedVendorDigest(
  serviceClient: SupabaseClient
): Promise<VendorDigestSummary> {
  const summary: VendorDigestSummary = { vendorsWithNewItems: 0, buyersNotified: 0, errors: [] }
  try {
    // Content gate: new published listings in the last 24h, or nothing at all.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: newListings } = await observed(serviceClient
      .from('listings')
      .select('id, title, vendor_profile_id, vertical_id')
      .eq('status', 'published')
      .is('deleted_at', null)
      .gte('created_at', since), { table: 'listings' })
    if (!newListings || newListings.length === 0) return summary

    const itemsByVendor = new Map<string, string[]>()
    for (const l of newListings) {
      const vid = l.vendor_profile_id as string
      const list = itemsByVendor.get(vid) ?? []
      if (l.title) list.push(l.title as string)
      itemsByVendor.set(vid, list)
    }
    const vendorIds = [...itemsByVendor.keys()]
    summary.vendorsWithNewItems = vendorIds.length

    // Vendor names + timezones (home market → markets.timezone).
    const { data: vendors } = await observed(serviceClient
      .from('vendor_profiles')
      .select('id, vertical_id, profile_data, home_market_id')
      .in('id', vendorIds), { table: 'vendor_profiles' })
    const vendorById = new Map((vendors ?? []).map(v => [v.id as string, v]))
    const homeMarketIds = [...new Set((vendors ?? []).map(v => v.home_market_id as string | null).filter(Boolean))] as string[]
    const tzByMarket = new Map<string, string>()
    if (homeMarketIds.length > 0) {
      const { data: markets } = await observed(serviceClient
        .from('markets')
        .select('id, timezone')
        .in('id', homeMarketIds), { table: 'markets' })
      for (const m of markets ?? []) {
        if (m.timezone) tzByMarket.set(m.id as string, m.timezone as string)
      }
    }
    const vendorTz = (vendorId: string): string => {
      const v = vendorById.get(vendorId)
      const mid = (v?.home_market_id as string | null) ?? null
      return (mid ? tzByMarket.get(mid) : undefined) ?? 'America/Chicago'
    }
    const vendorName = (vendorId: string): string => {
      const pd = (vendorById.get(vendorId)?.profile_data ?? {}) as Record<string, unknown>
      return (pd.business_name as string) || (pd.farm_name as string) || 'A vendor you follow'
    }

    // Audience: followers ∪ VIPs of the vendors with new items.
    const [{ data: favRows }, { data: vipRows }] = await Promise.all([
      observed(serviceClient
        .from('vendor_favorites')
        .select('user_id, vendor_profile_id')
        .in('vendor_profile_id', vendorIds), { table: 'vendor_favorites' }),
      observed(serviceClient
        .from('vendor_vip_customers')
        .select('buyer_user_id, vendor_profile_id')
        .in('vendor_profile_id', vendorIds), { table: 'vendor_vip_customers' }),
    ])

    // Group per (buyer, vertical) — the consolidation. Never per vendor.
    type Group = { userId: string; vertical: string; vendorIds: Set<string> }
    const groups = new Map<string, Group>()
    const addFollower = (userId: string, vendorId: string) => {
      const vertical = (vendorById.get(vendorId)?.vertical_id as string | undefined) ?? 'food_trucks'
      const key = `${userId}|${vertical}`
      const g = groups.get(key) ?? { userId, vertical, vendorIds: new Set<string>() }
      g.vendorIds.add(vendorId)
      groups.set(key, g)
    }
    for (const r of favRows ?? []) addFollower(r.user_id as string, r.vendor_profile_id as string)
    for (const r of vipRows ?? []) addFollower(r.buyer_user_id as string, r.vendor_profile_id as string)
    if (groups.size === 0) return summary

    // 8am window per group (first vendor's timezone) …
    const due = [...groups.values()].filter(g => {
      const firstVendor = [...g.vendorIds][0]!
      return localHour(vendorTz(firstVendor)) === SEND_HOUR
    })
    if (due.length === 0) return summary

    // … minus anyone already digested in this window (once per day per
    // vertical — the same notifications-table dedup the check-in reminders use).
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const { data: priorNotifs } = await observed(serviceClient
      .from('notifications')
      .select('user_id, vertical_id')
      .in('user_id', due.map(g => g.userId))
      .eq('type', 'followed_vendor_digest')
      .gte('created_at', dedupSince), { table: 'notifications' })
    const alreadySent = new Set((priorNotifs ?? []).map(n => `${n.user_id}|${n.vertical_id}`))

    for (const g of due) {
      if (alreadySent.has(`${g.userId}|${g.vertical}`)) continue
      const parts: string[] = []
      for (const vid of g.vendorIds) {
        const items = itemsByVendor.get(vid) ?? []
        const shown = items.slice(0, MAX_ITEMS_PER_VENDOR).join(', ')
        const more = items.length > MAX_ITEMS_PER_VENDOR ? ` +${items.length - MAX_ITEMS_PER_VENDOR} more` : ''
        parts.push(`${vendorName(vid)}: ${shown}${more}`)
      }
      await sendNotification(
        g.userId,
        'followed_vendor_digest',
        {
          digestSummary: parts.join(' · '),
          digestVendorCount: g.vendorIds.size,
          ...(g.vendorIds.size === 1 ? { vendorName: vendorName([...g.vendorIds][0]!) } : {}),
        },
        { vertical: g.vertical }
      )
      summary.buyersNotified++
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : 'Unknown digest error')
  }
  return summary
}
