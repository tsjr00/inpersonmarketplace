import { createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { isWellFormedSurveyToken } from '@/lib/surveys/token'

interface PageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ unsub?: string; token?: string }>
}

/**
 * Email preferences / unsubscribe landing (Phase E Stage 4).
 *
 * Currently handles ONE thing: ?unsub=surveys&token=<accessToken>
 * one-click unsubscribe from buyer survey emails.
 *
 * Flow:
 *   1. Validate token shape + look up the market_surveys row
 *   2. Resolve buyer_user_id from that row
 *   3. UPDATE user_profiles.survey_emails_opted_out = true
 *   4. Render confirmation
 *
 * The token is the same opaque access_token from the survey email
 * (mig 147). It's not a JWT — it's a DB-stored opaque value the
 * survey emails reference. Security model: low-stakes; if intercepted,
 * the only action is opting the user out of survey emails (which
 * they could do themselves later via this same page if they have any
 * other survey link). Vendor surveys can't be unsubscribed — that's
 * by design (vendor surveys are part of being on the platform).
 *
 * In-app notifications continue regardless of email opt-out.
 */
export default async function EmailPreferencesPage({ params, searchParams }: PageProps) {
  await params
  const sp = await searchParams

  if (sp.unsub === 'surveys' && sp.token && isWellFormedSurveyToken(sp.token)) {
    return await handleSurveyUnsubscribe(sp.token)
  }

  return (
    <Shell>
      <h1 style={headingStyle}>Email preferences</h1>
      <p style={paragraphStyle}>
        This page handles email opt-out for survey requests. If you
        clicked an &quot;unsubscribe&quot; link from an email and ended up
        here without an action, the link may be malformed — try the
        original email again, or contact the market manager directly.
      </p>
    </Shell>
  )
}

async function handleSurveyUnsubscribe(token: string) {
  const serviceClient = createServiceClient()

  // Look up the buyer from the survey row
  const { data: survey } = await serviceClient
    .from('market_surveys')
    .select('buyer_user_id, kind')
    .eq('access_token', token)
    .maybeSingle()

  if (!survey || survey.kind !== 'buyer' || !survey.buyer_user_id) {
    return (
      <Shell>
        <h1 style={headingStyle}>Survey email opt-out</h1>
        <p style={paragraphStyle}>
          We couldn&apos;t find a buyer account tied to this link. If you
          recently received a survey email and want to stop them, try
          clicking the unsubscribe link in the most recent email.
        </p>
      </Shell>
    )
  }

  // Apply the opt-out
  await serviceClient
    .from('user_profiles')
    .update({ survey_emails_opted_out: true })
    .eq('user_id', survey.buyer_user_id as string)

  return (
    <Shell>
      <h1 style={headingStyle}>✓ Unsubscribed from survey emails</h1>
      <p style={paragraphStyle}>
        We won&apos;t email you survey requests anymore. You&apos;ll still
        see them in your in-app notifications if you have an account —
        feel free to fill one out anytime there. To re-enable survey
        emails, contact{' '}
        <a href="mailto:support@farmersmarketing.app" style={{ color: '#2d5016' }}>
          support@farmersmarketing.app
        </a>
        .
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      maxWidth: containers.sm,
      margin: '0 auto',
      padding: spacing.lg,
    }}>
      <div style={{
        padding: spacing.lg,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}>
        {children}
      </div>
    </div>
  )
}

const headingStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: spacing.sm,
  fontSize: typography.sizes.xl,
  fontWeight: typography.weights.bold,
  color: colors.textPrimary,
}

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  color: colors.textPrimary,
  fontSize: typography.sizes.sm,
  lineHeight: 1.6,
}
