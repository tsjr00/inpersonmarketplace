/**
 * AdminHubZones — the queues-first hub body both admin dashboards render
 * (phase 2 of the admin UI rebuild, owner 2026-08-30; plan + capability
 * inventory in apps/web/.claude/admin_ui_redesign_research.md).
 *
 * Zones, in the order the owner works:
 *   1. Needs you now — red-flag banners (stuck orders, stale vendors) and one
 *      attention tile per non-empty queue, deep-linking into the page that
 *      clears it. All-clear line when nothing waits.
 *   2. (platform only) the per-vertical command cards — kept from the old hub.
 *   3. Activity — rolling 24h / 7d snapshot (rolling on purpose: Vercel runs
 *      UTC; "today" would need a hardcoded timezone).
 *   4. Totals — every count the old hubs displayed, compact.
 *   5. Browse — tiles built FROM lib/admin/nav.ts groups, so the hub can never
 *      miss a page the shell knows about.
 *
 * Server component; interactivity is navigation only.
 */

import Link from 'next/link'
import { spacing, typography, radius, shadows, colors } from '@/lib/design-tokens'
import { formatPrice } from '@/lib/pricing'
import DashboardTile, { TileBadge } from '@/components/dashboard/DashboardTile'
import DashboardCard from '@/components/dashboard/DashboardCard'
import GroupHeading from '@/components/dashboard/GroupHeading'
import type { DashboardIconName } from '@/components/dashboard/icons'
import type { AdminHubData } from '@/lib/admin/hub-data'
import type { AdminNavGroup } from '@/lib/admin/nav'

const QUEUE_ICONS: Record<string, DashboardIconName> = {
  pendingVendors: 'browse',
  pendingMarkets: 'locations',
  eventRequests: 'events',
  orderIssues: 'orders',
  errorReports: 'feedback',
  activityFlags: 'reviews',
  causeUnremitted: 'upgrade',
}

const BROWSE_ICONS: Record<string, DashboardIconName> = {
  Dashboard: 'analytics',
  Events: 'events',
  'Order Issues': 'orders',
  Feedback: 'feedback',
  Analytics: 'analytics',
  Vendors: 'browse',
  Markets: 'locations',
  Users: 'notifications',
  Listings: 'listings',
  'Vendor Activity': 'reviews',
  Reports: 'analytics',
  'Stripe Reconcile': 'upgrade',
  'Community Giving': 'favorites',
  'Error Reports': 'feedback',
  'Error Logs': 'feedback',
  'Event Ratings': 'reviews',
  'Knowledge Base': 'upcoming',
  'Pending Vendors': 'browse',
  'Vertical Admins': 'notifications',
  'Platform Admins': 'notifications',
  'MFA Setup': 'upcoming',
}

interface AdminHubZonesProps {
  hub: AdminHubData
  base: string
  navGroups: AdminNavGroup[]
  /** Extra red-banner link target for stale vendors. */
  staleHref: string
}

export default function AdminHubZones({ hub, base, navGroups, staleHref }: AdminHubZonesProps) {
  const { queues, watch, snapshot, totals, perVertical } = hub

  return (
    <>
      {/* ── Zone 1: Needs you now ─────────────────────────────────────── */}
      <GroupHeading
        title="Needs you now"
        {...(queues.length === 0 && watch.stuckOrders === 0 && watch.staleVendors === 0
          ? { subtitle: 'All clear — nothing is waiting on you.' }
          : {})}
      />

      {/* Owner (phase-2 smoke): ONE visual language — no old-style horizontal
          banners next to the new tiles. Stuck orders = warning CARD (there is
          no dedicated page to send it to); stale vendors = an attention TILE
          in the same grid as the queues. */}
      {watch.stuckOrders > 0 && (
        <div style={{ marginBottom: spacing.sm }}>
          <DashboardCard
            state="warning"
            title={`${watch.stuckOrders} order${watch.stuckOrders === 1 ? '' : 's'} stuck in paid/confirmed for 24+ hours`}
          >
            <span style={{ fontSize: typography.sizes.sm }}>
              A day old without fulfillment — worth checking with the vendor or in Stripe.
            </span>
          </DashboardCard>
        </div>
      )}

      {(queues.length > 0 || watch.staleVendors > 0) && (
        <div className="admin-grid-3" style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          {watch.staleVendors > 0 && (
            <DashboardTile
              href={staleHref}
              icon="browse"
              title="Vendors waiting 2+ days"
              state="attention"
              badge={<TileBadge>{watch.staleVendors}</TileBadge>}
            >
              Oldest approvals first — tap to review
            </DashboardTile>
          )}
          {queues.map(q => (
            <DashboardTile
              key={q.key}
              href={q.href}
              icon={QUEUE_ICONS[q.key] ?? 'notifications'}
              title={q.label}
              state="attention"
              badge={<TileBadge>{q.count}</TileBadge>}
            >
              Tap to review and clear
            </DashboardTile>
          ))}
        </div>
      )}

      {/* ── Zone 2 (platform only): per-vertical command cards ─────────── */}
      {perVertical && (
        <div className="admin-grid-2" style={{ gap: spacing.md, marginBottom: spacing.md }}>
          {perVertical.map(v => {
            const urgent = v.pendingVendors + v.openIssues + v.eventRequests
            return (
              <Link key={v.id} href={`/${v.id}/admin`} style={{ display: 'block', padding: spacing.md, backgroundColor: 'white', border: urgent > 0 ? `2px solid ${v.color}` : '1px solid #d1d5db', borderRadius: radius.md, textDecoration: 'none', boxShadow: shadows.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                  <span style={{ color: v.color, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>{v.name}</span>
                  {urgent > 0 && (
                    <span style={{ backgroundColor: v.color, color: 'white', fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, padding: `2px ${spacing['2xs']}`, borderRadius: radius.full, minWidth: 20, textAlign: 'center' }}>{urgent}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: spacing.sm, fontSize: typography.sizes.sm, flexWrap: 'wrap' }}>
                  {v.pendingVendors > 0 && <span style={{ color: '#92400e' }}>⏳ {v.pendingVendors} pending vendor{v.pendingVendors !== 1 ? 's' : ''}</span>}
                  {v.openIssues > 0 && <span style={{ color: '#1e40af' }}>⚠️ {v.openIssues} open issue{v.openIssues !== 1 ? 's' : ''}</span>}
                  {v.eventRequests > 0 && <span style={{ color: '#92400e' }}>🎪 {v.eventRequests} event request{v.eventRequests !== 1 ? 's' : ''}</span>}
                  {urgent === 0 && <span style={{ color: '#6b7280' }}>All clear</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── Zone 3: Activity snapshot ─────────────────────────────────── */}
      <GroupHeading title="Activity" subtitle="Rolling windows — last 24 hours and last 7 days" />
      {/* Owner (phase-2 smoke): keep the numbers dense on phones — a fixed
          min-width auto-fit grid gives 2–3 columns everywhere instead of six
          full-width cards to scroll past. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: spacing.xs, marginBottom: spacing.md }}>
        <SnapshotCell label="Orders · 24 h" value={String(snapshot.orders24h)} />
        <SnapshotCell label="Sales · 24 h" value={formatPrice(snapshot.sales24hCents)} />
        <SnapshotCell label="Orders · 7 d" value={String(snapshot.orders7d)} />
        <SnapshotCell label="Sales · 7 d" value={formatPrice(snapshot.sales7dCents)} />
        <SnapshotCell label="New vendors · 7 d" value={String(snapshot.newVendors7d)} />
        <SnapshotCell label="New users · 7 d" value={String(snapshot.newUsers7d)} />
      </div>

      {/* ── Zone 4: Totals (every stat the old hub showed) ─────────────── */}
      <GroupHeading title="Totals" />
      <div className="admin-grid-2" style={{ gap: spacing.sm, marginBottom: spacing.md }}>
        {totals.sections.map(section => (
          <div key={section.label} style={{ backgroundColor: 'white', borderRadius: radius.md, boxShadow: shadows.sm, padding: spacing.sm }}>
            <div style={{ fontWeight: typography.weights.bold, fontSize: typography.sizes.sm, marginBottom: spacing['2xs'], color: colors.textPrimary }}>{section.label}</div>
            {section.stats.map(stat => (
              <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: typography.sizes.sm, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                {stat.href
                  ? <Link href={stat.href} style={{ color: colors.primary, textDecoration: 'none' }}>{stat.label}</Link>
                  : <span style={{ color: colors.textMuted }}>{stat.label}</span>}
                <span style={{ fontWeight: typography.weights.semibold }}>{stat.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Zone 5: Browse (built from the nav definition) ─────────────── */}
      <GroupHeading title="Browse" />
      {navGroups.map(group => (
        <div key={group.label} style={{ marginBottom: spacing.lg }}>
          {/* Owner (phase-2 smoke): clearer subsection boundaries — underline
              the group label and give groups more air between them. */}
          <div style={{ fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textMuted, borderBottom: '1px solid #e5e7eb', paddingBottom: 4, margin: `0 0 ${spacing.xs}` }}>{group.label}</div>
          <div className="admin-grid-3" style={{ gap: spacing.sm }}>
            {group.links.filter(l => l.path !== '').map(link => (
              <DashboardTile
                key={link.path}
                href={base + link.path}
                icon={BROWSE_ICONS[link.label] ?? 'browse'}
                title={link.label}
                state={(link.badgeKey && (hub.badges[link.badgeKey] ?? 0) > 0) ? 'active' : 'neutral'}
                badge={link.badgeKey && (hub.badges[link.badgeKey] ?? 0) > 0 ? <TileBadge>{hub.badges[link.badgeKey]}</TileBadge> : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function SnapshotCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ backgroundColor: 'white', borderRadius: radius.md, boxShadow: shadows.sm, padding: spacing.sm }}>
      <div style={{ color: colors.textMuted, fontSize: typography.sizes.xs, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>{value}</div>
    </div>
  )
}
