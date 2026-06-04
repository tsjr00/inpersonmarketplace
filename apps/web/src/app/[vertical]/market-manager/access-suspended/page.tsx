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
 * Landing page shown when the assigned manager hits a dashboard URL but
 * markets.manager_status is 'suspended'. Distinct from access-removed —
 * the manager assignment is still in place, just paused.
 *
 * Phase 1 — manager export + lockout plan.
 */
export default async function AccessSuspendedPage({ params, searchParams }: PageProps) {
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

  let marketName: string | null = null
  if (marketId) {
    const { data: market } = await supabase
      .from('markets')
      .select('name')
      .eq('id', marketId)
      .maybeSingle()
    marketName = (market?.name as string | null) ?? null
  }

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
            color: '#92400e',
          }}
        >
          Manager access temporarily suspended
        </h1>

        <p
          style={{
            margin: `0 0 ${spacing.md} 0`,
            fontSize: typography.sizes.md,
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}
        >
          Your manager access for{' '}
          <strong>{marketName ?? 'this market'}</strong> has been temporarily
          suspended pending review.
        </p>

        <p
          style={{
            margin: `0 0 ${spacing.lg} 0`,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}
        >
          Your assignment is still in place — only access is paused. To discuss
          or restore access, contact{' '}
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
