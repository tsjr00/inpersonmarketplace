import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'

interface PageProps {
  params: Promise<{ vertical: string; marketId: string }>
}

/**
 * Market Manager dashboard — skeleton page for v1.
 *
 * Auth: redirects to /[vertical]/dashboard if the current user is not the
 * assigned manager of this market (per isMarketManager dual-key check).
 *
 * Content: placeholder. Real surfaces (vendor list, weekly bookings,
 * surveys, share tools, etc.) ship in Phase 2+ per market_manager_v2_plan.md.
 *
 * Vertical scope: FM only for v1. The card on the buyer dashboard already
 * filters to FM, so a non-FM user shouldn't reach this page through normal
 * navigation. The auth check still works for any vertical (it just looks
 * up the row by id), but rendering FM-flavored copy is fine since the v1
 * scope is FM.
 */
export default async function MarketManagerDashboardPage({ params }: PageProps) {
  const { vertical, marketId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    redirect(`/${vertical}/dashboard`)
  }

  // User is the manager — fetch the market row for display
  const { data: market } = await supabase
    .from('markets')
    .select('id, name, address, city, state, market_type')
    .eq('id', marketId)
    .single()

  if (!market) {
    redirect(`/${vertical}/dashboard`)
  }

  return (
    <div style={{
      maxWidth: containers.lg,
      margin: '0 auto',
      padding: spacing.md,
    }}>
      <div style={{ marginBottom: spacing.md }}>
        <Link
          href={`/${vertical}/dashboard`}
          style={{
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            textDecoration: 'none',
          }}
        >
          ← Back to your dashboard
        </Link>
      </div>

      <h1 style={{
        margin: 0,
        marginBottom: spacing['2xs'],
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        {market.name}
      </h1>
      {(market.city || market.state) && (
        <p style={{
          margin: 0,
          marginBottom: spacing.lg,
          color: colors.textMuted,
          fontSize: typography.sizes.base,
        }}>
          {[market.address, market.city, market.state].filter(Boolean).join(' · ')}
        </p>
      )}

      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Market manager dashboard — coming soon
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          You&apos;re recognized as the assigned manager of this market.
          The dashboard surfaces below are being built and will roll in
          over the next several updates:
        </p>
        <ul style={{
          margin: 0,
          paddingLeft: spacing.md,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.6,
        }}>
          <li>Vendor list with booth assignments and attendance status</li>
          <li>Weekly booth rental bookings and payment status</li>
          <li>Aggregate market activity (order count and pickup volume)</li>
          <li>Post-market vendor + buyer surveys</li>
          <li>Vendor invite link and onboarding referral</li>
          <li>Share tools for promoting market days on social media</li>
          <li>Market schedule and support resources</li>
        </ul>
      </div>

      <p style={{
        marginTop: spacing.md,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        fontStyle: 'italic',
      }}>
        Have feedback on what would make this dashboard most useful for
        your market? Reply to your most recent platform email or reach
        out via the support page.
      </p>
    </div>
  )
}
