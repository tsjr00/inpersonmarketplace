/**
 * Admin hub data (phase 2 of the admin UI rebuild, owner 2026-08-30).
 *
 * One resolver for BOTH hub pages — queues-first mission control:
 *   · queues   — "Needs you now": the owner-approved badge set as tiles
 *                (only rendered when > 0), sharing lib/admin/queue-badges.ts
 *                with the shell so the hub and the ☰ menu can never disagree.
 *   · watch    — red-flag counts the old hubs showed as banners (stuck orders
 *                >24h in paid/confirmed, vendors pending ≥2 days) — kept.
 *   · snapshot — NEW: rolling 24h / 7d activity (orders, sales, new vendors,
 *                new users). Rolling windows on purpose: Vercel runs UTC and
 *                the platform spans timezones, so "today" would either lie or
 *                need a hardcoded zone (forbidden). "Last 24 h" is honest.
 *   · totals   — every count the old hubs displayed, preserved exactly
 *                (capability inventory in .claude/admin_ui_redesign_research.md).
 *   · perVertical (platform only) — the FM/FT command cards' urgent counts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { getAdminQueueBadges, type AdminBadges } from './queue-badges'

export interface HubQueue {
  key: string
  label: string
  count: number
  href: string
}

export interface HubSnapshot {
  orders24h: number
  sales24hCents: number
  orders7d: number
  sales7dCents: number
  newVendors7d: number
  newUsers7d: number
}

export interface HubTotals {
  /** label → value, in display order; preserves every old hub stat. */
  sections: Array<{ label: string; stats: Array<{ label: string; value: number; href?: string }> }>
}

export interface HubPerVertical {
  id: string
  name: string
  color: string
  pendingVendors: number
  openIssues: number
  eventRequests: number
}

export interface AdminHubData {
  badges: AdminBadges
  queues: HubQueue[]
  watch: { stuckOrders: number; staleVendors: number }
  snapshot: HubSnapshot
  totals: HubTotals
  perVertical: HubPerVertical[] | null
}

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
  const res = await q
  return res.count ?? 0
}

export async function getAdminHubData(
  service: SupabaseClient,
  vertical: string | null
): Promise<AdminHubData> {
  const head = { count: 'exact' as const, head: true }
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  // Structural cast instead of a generic: the PostgREST builder generics blow
  // TS2589 (excessively deep instantiation) when threaded through a helper.
  // Every call site is terminal — awaited for its `count` — so a thenable with
  // chainable `eq` is the whole contract.
  type CountQ = PromiseLike<{ count: number | null; error: unknown }> & { eq: (c: string, x: unknown) => CountQ }
  const v = (q: unknown, col = 'vertical_id'): CountQ => {
    const c = q as CountQ
    return vertical ? c.eq(col, vertical) : c
  }

  const badges = await getAdminQueueBadges(service, vertical)

  // ── watch (red flags, kept from the old hubs) ─────────────────────────
  let stuckQ = service.from('orders').select('id', head).in('status', ['paid', 'confirmed']).lt('created_at', dayAgo)
  if (vertical) stuckQ = stuckQ.eq('vertical_id', vertical)
  let staleQ = service.from('vendor_profiles').select('id', head).eq('status', 'submitted').lt('created_at', twoDaysAgo)
  if (vertical) staleQ = staleQ.eq('vertical_id', vertical)

  // ── snapshot (rolling windows; orders table carries vertical_id) ──────
  const ordersIn = (since: string) => {
    let q = service.from('orders').select('id', head).gte('created_at', since)
    if (vertical) q = q.eq('vertical_id', vertical)
    return q
  }
  const salesIn = async (since: string): Promise<number> => {
    let q = service.from('order_items').select('subtotal_cents, orders!inner ( vertical_id, created_at )').gte('orders.created_at', since).is('cancelled_at', null)
    if (vertical) q = q.eq('orders.vertical_id', vertical)
    const { data } = await observed(q, { table: 'order_items' })
    return (data ?? []).reduce((s, r) => s + ((r as { subtotal_cents: number | null }).subtotal_cents || 0), 0)
  }

  // ── totals (every stat the old hubs displayed) ────────────────────────
  const totalsPromise: Promise<HubTotals> = (async () => {
    if (vertical) {
      const [totalMarkets, pendingMarkets, activeMarkets, totalVendors, pendingVendors, approvedVendors, proVendors, bossVendors, totalUsers, vendorUsers, premiumBuyers, publishedListings, activeMarketBoxes] = await Promise.all([
        count(v(service.from('markets').select('id', head))),
        count(v(service.from('markets').select('id', head).eq('status', 'pending'))),
        count(v(service.from('markets').select('id', head)).eq('active', true)),
        count(v(service.from('vendor_profiles').select('id', head))),
        count(v(service.from('vendor_profiles').select('id', head).eq('status', 'submitted'))),
        count(v(service.from('vendor_profiles').select('id', head).eq('status', 'approved'))),
        count(v(service.from('vendor_profiles').select('id', head).eq('status', 'approved').eq('tier', 'pro'))),
        count(v(service.from('vendor_profiles').select('id', head).eq('status', 'approved').eq('tier', 'boss'))),
        count(service.from('user_profiles').select('id', head).contains('verticals', [vertical])),
        count(service.from('user_profiles').select('id', head).contains('verticals', [vertical]).contains('roles', ['vendor'])),
        count(service.from('user_profiles').select('id', head).contains('verticals', [vertical]).eq('buyer_tier', 'premium')),
        count(v(service.from('listings').select('id', head).eq('status', 'published').is('deleted_at', null))),
        count(v(service.from('market_box_offerings').select('id', head).eq('active', true))),
      ])
      const base = `/${vertical}/admin`
      return {
        sections: [
          { label: 'Markets', stats: [
            { label: 'Total', value: totalMarkets, href: `${base}/markets` },
            { label: 'Pending', value: pendingMarkets },
            { label: 'Active', value: activeMarkets },
          ] },
          { label: 'Vendors', stats: [
            { label: 'Total', value: totalVendors, href: `${base}/vendors` },
            { label: 'Pending', value: pendingVendors },
            { label: 'Approved', value: approvedVendors },
            { label: 'Pro', value: proVendors },
            { label: 'Boss', value: bossVendors },
          ] },
          { label: 'Users', stats: [
            { label: 'Total', value: totalUsers, href: `${base}/users` },
            { label: 'Vendors', value: vendorUsers },
            { label: 'Premium buyers', value: premiumBuyers },
          ] },
          { label: 'Listings', stats: [
            { label: 'Published', value: publishedListings, href: `${base}/listings` },
            { label: 'Active market boxes', value: activeMarketBoxes },
          ] },
        ],
      }
    }
    const [totalUsers, totalVendors, pendingVendors, approvedVendors, totalListings, publishedListings] = await Promise.all([
      count(service.from('user_profiles').select('id', head)),
      count(service.from('vendor_profiles').select('id', head)),
      count(service.from('vendor_profiles').select('id', head).eq('status', 'submitted')),
      count(service.from('vendor_profiles').select('id', head).eq('status', 'approved')),
      count(service.from('listings').select('id', head).is('deleted_at', null)),
      count(service.from('listings').select('id', head).eq('status', 'published').is('deleted_at', null)),
    ])
    return {
      sections: [
        { label: 'Platform totals', stats: [
          { label: 'Users', value: totalUsers, href: '/admin/users' },
          { label: 'Vendors', value: totalVendors, href: '/admin/vendors' },
          { label: 'Pending approval', value: pendingVendors, href: '/admin/vendors/pending' },
          { label: 'Approved vendors', value: approvedVendors },
          { label: 'Listings', value: totalListings, href: '/admin/listings' },
          { label: 'Published listings', value: publishedListings },
        ] },
      ],
    }
  })()

  // ── platform command cards (kept) ─────────────────────────────────────
  const perVerticalPromise: Promise<HubPerVertical[] | null> = vertical
    ? Promise.resolve(null)
    : (async () => {
        const defs = [
          { id: 'farmers_market', name: 'Farmers Marketing', color: '#2d5016' },
          { id: 'food_trucks', name: "Food Truck'n", color: '#ff5757' },
        ]
        return Promise.all(defs.map(async (d) => {
          const b = await getAdminQueueBadges(service, d.id)
          return {
            ...d,
            pendingVendors: b.pendingVendors ?? 0,
            openIssues: b.orderIssues ?? 0,
            eventRequests: b.eventRequests ?? 0,
          }
        }))
      })()

  const [stuckOrders, staleVendors, orders24h, orders7d, sales24hCents, sales7dCents, newVendors7d, newUsers7d, totals, perVertical] = await Promise.all([
    count(stuckQ),
    count(staleQ),
    count(ordersIn(dayAgo)),
    count(ordersIn(weekAgo)),
    salesIn(dayAgo),
    salesIn(weekAgo),
    count(v(service.from('vendor_profiles').select('id', head).gte('created_at', weekAgo))),
    vertical
      ? count(service.from('user_profiles').select('id', head).contains('verticals', [vertical]).gte('created_at', weekAgo))
      : count(service.from('user_profiles').select('id', head).gte('created_at', weekAgo)),
    totalsPromise,
    perVerticalPromise,
  ])

  const base = vertical ? `/${vertical}/admin` : '/admin'
  const queueDefs: Array<{ key: keyof AdminBadges; label: string; href: string }> = [
    { key: 'pendingVendors', label: 'Vendors waiting for approval', href: vertical ? `${base}/vendors` : '/admin/vendors/pending' },
    { key: 'pendingMarkets', label: 'Markets pending review', href: `${base}/markets` },
    { key: 'eventRequests', label: 'Event requests to review', href: vertical ? `${base}/events` : '/farmers_market/admin/events' },
    { key: 'orderIssues', label: 'Open order issues', href: `${base}/order-issues` },
    { key: 'errorReports', label: 'Error reports', href: `${base}/errors` },
    { key: 'activityFlags', label: 'Vendor activity flags', href: vertical ? `${base}/vendor-activity` : '/farmers_market/admin/vendor-activity' },
    { key: 'causeUnremitted', label: 'Cause funds to remit', href: '/admin/cause' },
  ]
  const queues: HubQueue[] = queueDefs
    .map(q => ({ key: q.key, label: q.label, href: q.href, count: badges[q.key] ?? 0 }))
    .filter(q => q.count > 0)

  return {
    badges,
    queues,
    watch: { stuckOrders, staleVendors },
    snapshot: { orders24h, sales24hCents, orders7d, sales7dCents, newVendors7d, newUsers7d },
    totals,
    perVertical,
  }
}
