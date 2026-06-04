import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'

interface PageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ marketId?: string }>
}

/**
 * Landing page shown when a user is redirected from the manager dashboard
 * because they are no longer the assigned manager of the market — either
 * because they USED to manage it (history shows ended_at != NULL) or because
 * they have no relationship to the market at all.
 *
 * Auth: requires logged-in user (anonymous users redirect to login first via
 * the layout, but this page is reachable directly so we re-check).
 *
 * Phase 1 — manager export + lockout plan
 * (apps/web/.claude/manager_export_and_lockout_plan.md).
 */
export default async function AccessRemovedPage({ params, searchParams }: PageProps) {
  const { vertical } = await params
  const { marketId } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  // Resolve market name + last-end record if marketId provided.
  let marketName: string | null = null
  let endedAt: string | null = null

  if (marketId) {
    const { data: market } = await supabase
      .from('markets')
      .select('name')
      .eq('id', marketId)
      .maybeSingle()
    marketName = (market?.name as string | null) ?? null

    const { data: historyRow } = await supabase
      .from('market_manager_history')
      .select('ended_at')
      .eq('market_id', marketId)
      .eq('manager_user_id', user.id)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    endedAt = (historyRow?.ended_at as string | null) ?? null
  }

  const wasFormerManager = endedAt !== null

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
        color: branding.colors.text,
        padding: `${spacing.xl} ${spacing.md}`,
      }}
    >
      <div
        style={{
          maxWidth: containers.sm,
          margin: '0 auto',
          backgroundColor: 'white',
          borderRadius: radius.lg,
          padding: spacing.xl,
          border: `1px solid ${colors.border}`,
        }}
      >
        <h1
          style={{
            margin: `0 0 ${spacing.md} 0`,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.semibold,
            color: branding.colors.primary,
          }}
        >
          Manager access not available
        </h1>

        {wasFormerManager ? (
          <p
            style={{
              margin: `0 0 ${spacing.md} 0`,
              fontSize: typography.sizes.base,
              color: colors.textSecondary,
              lineHeight: 1.6,
            }}
          >
            Your access to manage <strong>{marketName ?? 'this market'}</strong>{' '}
            ended on {endedAt ? new Date(endedAt).toLocaleDateString() : 'an earlier date'}.
          </p>
        ) : (
          <p
            style={{
              margin: `0 0 ${spacing.md} 0`,
              fontSize: typography.sizes.base,
              color: colors.textSecondary,
              lineHeight: 1.6,
            }}
          >
            You are not the assigned manager of{' '}
            <strong>{marketName ?? 'this market'}</strong>.
          </p>
        )}

        <p
          style={{
            margin: `0 0 ${spacing.lg} 0`,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}
        >
          If you believe this is in error, contact{' '}
          <a
            href="mailto:admin@farmersmarketing.app"
            style={{ color: branding.colors.primary }}
          >
            admin@farmersmarketing.app
          </a>
          .
        </p>

        <Link
          href={`/${vertical}/dashboard`}
          style={{
            display: 'inline-block',
            padding: `${spacing.sm} ${spacing.md}`,
            backgroundColor: branding.colors.primary,
            color: 'white',
            textDecoration: 'none',
            borderRadius: radius.md,
            fontWeight: typography.weights.semibold,
          }}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
