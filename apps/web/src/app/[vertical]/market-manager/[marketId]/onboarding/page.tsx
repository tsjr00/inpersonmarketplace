import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getOnboardingProgress } from '@/lib/markets/onboarding-progress'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'

interface PageProps {
  params: Promise<{ vertical: string; marketId: string }>
}

/**
 * Onboarding checklist landing page — entry point into the guided
 * 5-step wizard. Shows current progress and an explanation of what each
 * step covers, so the manager knows what they're getting into before
 * they start.
 *
 * Auth: redirects non-managers to /[vertical]/dashboard.
 *
 * The actual steps live at ./[step]/page.tsx with named slugs:
 * identity, booths, placeholders, optin, confirm.
 */
export default async function OnboardingLandingPage({ params }: PageProps) {
  const { vertical, marketId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) redirect(`/${vertical}/dashboard`)

  const { data: market } = await supabase
    .from('markets')
    .select('id, name, city, state')
    .eq('id', marketId)
    .single()

  if (!market) redirect(`/${vertical}/dashboard`)

  const progress = await getOnboardingProgress(supabase, marketId)

  const steps = [
    { slug: 'identity', label: 'Confirm your market', description: 'Make sure the market info is correct.', done: true },
    { slug: 'booths', label: 'Booth inventory', description: 'Set up size tiers and weekly prices.', done: progress.inventory_done },
    { slug: 'placeholders', label: 'Off-platform placeholders', description: 'Track booths occupied by vendors not on the platform. Optional.', done: progress.placeholders_seen, optional: true },
    { slug: 'optin', label: 'Vendor agreement statements', description: 'Pick the opt-in statements vendors must accept.', done: progress.optin_done },
    { slug: 'confirm', label: 'Review and finish', description: 'Verify everything looks right.', done: false },
  ]

  return (
    <div style={{
      maxWidth: containers.lg,
      margin: '0 auto',
      padding: spacing.md,
    }}>
      <div style={{ marginBottom: spacing.md }}>
        <Link
          href={`/${vertical}/market-manager/${marketId}/dashboard`}
          style={{
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            textDecoration: 'none',
          }}
        >
          ← Back to dashboard
        </Link>
      </div>

      <h1 style={{
        margin: 0,
        marginBottom: spacing['2xs'],
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        Set up {market.name}
      </h1>
      <p style={{
        margin: 0,
        marginBottom: spacing.lg,
        color: colors.textMuted,
        fontSize: typography.sizes.base,
      }}>
        Walk through a short setup process to configure your market.
        Everything here can be edited from the dashboard later.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {steps.map((step, idx) => (
          <Link
            key={step.slug}
            href={`/${vertical}/market-manager/${marketId}/onboarding/${step.slug}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing.md,
              backgroundColor: colors.surfaceElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              textDecoration: 'none',
              color: colors.textPrimary,
            }}
          >
            <div style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: '50%',
              backgroundColor: step.done ? colors.primary : colors.surfaceBase,
              color: step.done ? 'white' : colors.textMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: typography.weights.bold,
              fontSize: typography.sizes.sm,
              border: step.done ? 'none' : `1px solid ${colors.border}`,
            }}>
              {step.done ? '✓' : idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
                color: colors.textPrimary,
              }}>
                {step.label}
                {step.optional && (
                  <span style={{ marginLeft: spacing['2xs'], color: colors.textMuted, fontWeight: typography.weights.normal, fontSize: typography.sizes.xs }}>
                    (optional)
                  </span>
                )}
              </div>
              <div style={{
                fontSize: typography.sizes.sm,
                color: colors.textMuted,
                marginTop: spacing['3xs'],
                lineHeight: 1.4,
              }}>
                {step.description}
              </div>
            </div>
            <div style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>→</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
