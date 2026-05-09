import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import VendorBoothList from '@/components/market-manager/VendorBoothList'
import BoothInventoryManager from '@/components/market-manager/BoothInventoryManager'
import BoothPlaceholderManager from '@/components/market-manager/BoothPlaceholderManager'
import OptinManager from '@/components/market-manager/OptinManager'

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

      {/* Booth inventory — manage size tiers + per-week prices */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Booth inventory
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Configure the booth size tiers at your market — how many of each size
          you have and the weekly rental price. This is the foundation for the
          weekly vendor booking flow.
        </p>
        <BoothInventoryManager marketId={marketId} />
      </div>

      {/* Off-platform vendor booth placeholders — track occupancy without
          on-platform vendor identity */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Off-platform booth placeholders
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Track booths occupied by vendors who are not on the platform. No
          vendor identity is captured — just the booth number and (optionally)
          which size tier it counts against. Useful when you have existing
          vendors who haven&apos;t onboarded yet.
        </p>
        <BoothPlaceholderManager marketId={marketId} />
      </div>

      {/* Vendors at this market — assign / edit booth numbers */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Vendors at this market
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Assign booth numbers to vendors who are on the platform and at this
          market. Off-platform vendor placeholders ship in a later update.
        </p>
        <VendorBoothList marketId={marketId} />
      </div>

      {/* Opt-in vendor agreement statements — manager picks which ones
          apply to their market */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        marginBottom: spacing.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Vendor agreement statements
        </h2>
        <p style={{
          margin: 0,
          marginBottom: spacing.sm,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.5,
        }}>
          Select which opt-in statements vendors must accept when they sign
          up to your market. Statements with placeholders (in curly braces)
          let you fill in values specific to your market — these get
          substituted into the vendor-facing text at signup.
        </p>
        <OptinManager marketId={marketId} />
      </div>

      {/* What's still coming */}
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceBase,
        border: `1px dashed ${colors.border}`,
        borderRadius: radius.md,
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: spacing.xs,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: colors.textMuted,
        }}>
          Coming soon
        </h2>
        <ul style={{
          margin: 0,
          paddingLeft: spacing.md,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
          lineHeight: 1.6,
        }}>
          <li>Weekly booth rental bookings + payment via the platform</li>
          <li>Aggregate market activity (order count, pickup volume)</li>
          <li>Post-market vendor + buyer surveys</li>
          <li>Vendor invite / onboarding referral link</li>
          <li>Share tools for market-day social promotion</li>
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
