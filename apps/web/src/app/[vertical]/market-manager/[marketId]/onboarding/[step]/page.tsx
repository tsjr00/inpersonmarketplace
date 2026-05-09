import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getOnboardingProgress } from '@/lib/markets/onboarding-progress'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import BoothInventoryManager from '@/components/market-manager/BoothInventoryManager'
import BoothPlaceholderManager from '@/components/market-manager/BoothPlaceholderManager'
import OptinManager from '@/components/market-manager/OptinManager'

const STEPS = ['identity', 'booths', 'placeholders', 'optin', 'confirm'] as const
type StepSlug = typeof STEPS[number]

const STEP_LABELS: Record<StepSlug, string> = {
  identity: 'Confirm your market',
  booths: 'Booth inventory',
  placeholders: 'Off-platform placeholders',
  optin: 'Vendor agreement statements',
  confirm: 'Review and finish',
}

interface PageProps {
  params: Promise<{ vertical: string; marketId: string; step: string }>
}

/**
 * Onboarding wizard step page. Auth-gated server component that
 * dispatches to one of 5 named steps:
 *
 *   identity     — read-only confirmation of the market record
 *   booths       — wraps BoothInventoryManager
 *   placeholders — wraps BoothPlaceholderManager
 *   optin        — wraps OptinManager
 *   confirm      — review summary + back-to-dashboard
 *
 * Unknown step slugs 404. Non-manager users redirect to dashboard.
 *
 * Step state lives in the underlying tables (no separate "completion"
 * column — Option A from the Session 81 plan). Progress for the
 * confirm step is computed from market_booth_inventory +
 * market_optin_selections row counts.
 */
export default async function OnboardingStepPage({ params }: PageProps) {
  const { vertical, marketId, step } = await params

  if (!STEPS.includes(step as StepSlug)) {
    notFound()
  }
  const stepSlug = step as StepSlug

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) redirect(`/${vertical}/dashboard`)

  const { data: market } = await supabase
    .from('markets')
    .select('id, name, address, city, state, market_type')
    .eq('id', marketId)
    .single()

  if (!market) redirect(`/${vertical}/dashboard`)

  const progress = await getOnboardingProgress(supabase, marketId)

  const stepIdx = STEPS.indexOf(stepSlug)
  const prevStep = stepIdx > 0 ? STEPS[stepIdx - 1] : null
  const nextStep = stepIdx < STEPS.length - 1 ? STEPS[stepIdx + 1] : null

  return (
    <div style={{
      maxWidth: containers.lg,
      margin: '0 auto',
      padding: spacing.md,
    }}>
      {/* Step header */}
      <div style={{ marginBottom: spacing.md }}>
        <Link
          href={`/${vertical}/market-manager/${marketId}/onboarding`}
          style={{
            color: colors.textMuted,
            fontSize: typography.sizes.sm,
            textDecoration: 'none',
          }}
        >
          ← Setup checklist
        </Link>
      </div>

      <div style={{
        marginBottom: spacing.md,
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        fontWeight: typography.weights.semibold,
      }}>
        Step {stepIdx + 1} of {STEPS.length}
      </div>

      <h1 style={{
        margin: 0,
        marginBottom: spacing['2xs'],
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        {STEP_LABELS[stepSlug]}
      </h1>
      <p style={{
        margin: 0,
        marginBottom: spacing.lg,
        color: colors.textMuted,
        fontSize: typography.sizes.base,
      }}>
        {market.name}
      </p>

      {/* Step content */}
      <div style={{ marginBottom: spacing.lg }}>
        {stepSlug === 'identity' && (
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: spacing.sm,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
            }}>
              Market details
            </h2>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: typography.sizes.sm }}>
              <tbody>
                <tr>
                  <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textMuted, width: 140 }}>Name</td>
                  <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textPrimary }}>{market.name}</td>
                </tr>
                {market.address && (
                  <tr>
                    <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textMuted }}>Address</td>
                    <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textPrimary }}>{market.address}</td>
                  </tr>
                )}
                {(market.city || market.state) && (
                  <tr>
                    <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textMuted }}>Location</td>
                    <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textPrimary }}>
                      {[market.city, market.state].filter(Boolean).join(', ')}
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textMuted }}>Type</td>
                  <td style={{ padding: `${spacing['3xs']} 0`, color: colors.textPrimary }}>{market.market_type}</td>
                </tr>
              </tbody>
            </table>
            <p style={{
              margin: 0,
              marginTop: spacing.sm,
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
              lineHeight: 1.5,
            }}>
              If anything here is incorrect, contact support to update it before continuing.
            </p>
          </div>
        )}

        {stepSlug === 'booths' && (
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
          }}>
            <p style={{
              margin: 0,
              marginBottom: spacing.sm,
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
              lineHeight: 1.5,
            }}>
              Set up the booth size tiers at your market — how many of each size you have and the weekly rental price. This is the foundation for the weekly vendor booking flow. You need at least one tier to continue.
            </p>
            <BoothInventoryManager marketId={marketId} />
          </div>
        )}

        {stepSlug === 'placeholders' && (
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
          }}>
            <p style={{
              margin: 0,
              marginBottom: spacing.sm,
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
              lineHeight: 1.5,
            }}>
              Optional. Track booths occupied by vendors who are not on the platform yet. No vendor identity is captured — just the booth number and (optionally) which size tier it counts against. Skip this step if all your vendors are already on the platform.
            </p>
            <BoothPlaceholderManager marketId={marketId} />
          </div>
        )}

        {stepSlug === 'optin' && (
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
          }}>
            <p style={{
              margin: 0,
              marginBottom: spacing.sm,
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
              lineHeight: 1.5,
            }}>
              Pick the opt-in statements vendors must accept when they sign up to your market. Statements with placeholders (in curly braces) let you fill in values specific to your market — these get substituted into the vendor-facing text at signup. You need at least one statement selected to continue.
            </p>
            <OptinManager marketId={marketId} />
          </div>
        )}

        {stepSlug === 'confirm' && (
          <div style={{
            padding: spacing.md,
            backgroundColor: colors.surfaceElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
          }}>
            <h2 style={{
              marginTop: 0,
              marginBottom: spacing.sm,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary,
            }}>
              Review your setup
            </h2>
            <ul style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              fontSize: typography.sizes.sm,
              color: colors.textPrimary,
            }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                <span style={{ color: colors.primary, fontSize: typography.sizes.lg }}>✓</span>
                <span><strong>Market identity</strong> — {market.name}</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                <span style={{ color: progress.inventory_done ? colors.primary : '#dc2626', fontSize: typography.sizes.lg }}>
                  {progress.inventory_done ? '✓' : '⚠'}
                </span>
                <span>
                  <strong>Booth inventory</strong>
                  {progress.inventory_done
                    ? ' — configured'
                    : ' — no tiers yet, vendors won\'t be able to book booths'}
                </span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                <span style={{
                  color: progress.placeholders_count > 0 ? colors.primary : colors.textMuted,
                  fontSize: typography.sizes.lg,
                }}>
                  {progress.placeholders_count > 0 ? '✓' : '○'}
                </span>
                <span style={{ color: progress.placeholders_count > 0 ? colors.textPrimary : colors.textMuted }}>
                  <strong>Off-platform placeholders</strong>
                  {progress.placeholders_count > 0
                    ? ` — ${progress.placeholders_count} tracked`
                    : ' — none added (optional)'}
                </span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
                <span style={{ color: progress.optin_done ? colors.primary : '#dc2626', fontSize: typography.sizes.lg }}>
                  {progress.optin_done ? '✓' : '⚠'}
                </span>
                <span>
                  <strong>Vendor agreement statements</strong>
                  {progress.optin_done
                    ? ' — configured'
                    : ' — no statements selected, vendors won\'t see any agreement to accept'}
                </span>
              </li>
            </ul>
            <p style={{
              margin: 0,
              marginTop: spacing.md,
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
              lineHeight: 1.5,
            }}>
              {progress.inventory_done && progress.optin_done
                ? 'Your market is set up and ready. You can edit any of these from the dashboard later.'
                : 'You can finish later — fill in the missing pieces from the dashboard or come back to this wizard.'}
            </p>
          </div>
        )}
      </div>

      {/* Step navigation */}
      <div style={{
        display: 'flex',
        gap: spacing.xs,
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}>
        {prevStep ? (
          <Link
            href={`/${vertical}/market-manager/${marketId}/onboarding/${prevStep}`}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: 'transparent',
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {nextStep ? (
          <Link
            href={`/${vertical}/market-manager/${marketId}/onboarding/${nextStep}`}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            Next →
          </Link>
        ) : (
          <Link
            href={`/${vertical}/market-manager/${marketId}/dashboard`}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              textDecoration: 'none',
            }}
          >
            Finish — back to dashboard
          </Link>
        )}
      </div>
    </div>
  )
}
