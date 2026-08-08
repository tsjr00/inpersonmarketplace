export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import { getMarketsManagedBy } from '@/lib/markets/manager-queries'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import DashboardCard from '@/components/dashboard/DashboardCard'
import DashboardNav, { DashboardNavSpacer } from '@/components/dashboard/DashboardNav'
import { getNavDestinations } from '@/lib/dashboard/nav-destinations'

interface PageProps {
  params: Promise<{ vertical: string }>
}

/**
 * MARKET MANAGER PICKER — the index that was missing.
 *
 * The per-market dashboard has always been `[marketId]/dashboard`, i.e. it
 * loads exactly ONE market's data at a time. That is the model the owner wants
 * ("a picker that only loads the data for one market at a time — I like the
 * picker better", 2026-08-07), and it was already correct. The only thing
 * absent was an index to choose from: managers reached their dashboards through
 * a card on the SHOPPER dashboard, which does not survive the move to
 * per-role dashboards.
 *
 * This page is that index, and it is what the Slice 4 nav will point at.
 *
 * Deliberately minimal — "build the basics now, we will add specifics later,
 * but we need a place to put the data" (owner). No stats, no aggregates: one
 * row per market, one click to its dashboard.
 *
 * ⚠ Redirects rather than 403s. A user with exactly one market is sent
 * straight to it — a picker with one option is a pointless click, and most
 * managers have one market today. A user with none does not belong here at all.
 */
export default async function MarketManagerPickerPage({ params }: PageProps) {
  const { vertical } = await params

  await enforceVerticalAccess(vertical)
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect(`/${vertical}/login`)

  const markets = await getMarketsManagedBy(supabase, user, vertical)

  if (markets.length === 0) redirect(`/${vertical}/dashboard`)
  if (markets.length === 1) redirect(`/${vertical}/market-manager/${markets[0].id}/dashboard`)

  const navDestinations = await getNavDestinations(supabase, user, vertical)

  return (
    <div className="has-dashboard-nav" style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <DashboardNav destinations={navDestinations} />
      <h1 style={{
        color: colors.primary,
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.bold,
      }}>
        My {term(vertical, 'markets')}
      </h1>
      <p style={{ margin: `0 0 ${spacing.md} 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        You manage {markets.length} {term(vertical, 'markets').toLowerCase()}. Choose one to open its dashboard.
      </p>

      <DashboardCard title="Choose a market">
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {markets.map((m) => (
            <Link
              key={m.id}
              href={`/${vertical}/market-manager/${m.id}/dashboard`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                textDecoration: 'none',
                color: colors.textPrimary,
                fontSize: typography.sizes.sm,
                minWidth: 0,
              }}
            >
              <span style={{ fontWeight: typography.weights.medium, minWidth: 0 }}>
                {m.name}
                {(m.city || m.state) && (
                  <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal, marginLeft: spacing['2xs'] }}>
                    · {[m.city, m.state].filter(Boolean).join(', ')}
                  </span>
                )}
              </span>
              <span style={{ color: colors.primary, fontSize: typography.sizes.xs, whiteSpace: 'nowrap' }}>
                Open →
              </span>
            </Link>
          ))}
        </div>
      </DashboardCard>
      <DashboardNavSpacer destinations={navDestinations} />
    </div>
  )
}
