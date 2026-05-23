import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import SurveyForm from '@/components/surveys/SurveyForm'
import { formatMarketDateDisplay } from '@/lib/surveys/cron-helpers'

interface PageProps {
  params: Promise<{ vertical: string; surveyId: string }>
}

/**
 * Vendor's individual survey detail page (Phase E Stage 3).
 *
 * Server-side validates ownership + state, then renders the shared
 * SurveyForm component. If the survey is already submitted or
 * expired, renders an informative state instead of the form.
 */
export default async function VendorSurveyDetailPage({ params }: PageProps) {
  const { vertical, surveyId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .maybeSingle()

  if (!vendorProfile) notFound()

  const serviceClient = createServiceClient()
  const { data: survey } = await serviceClient
    .from('market_surveys')
    .select(`
      id, kind, vendor_profile_id, market_id, market_date,
      expires_at, submitted_at,
      markets!inner ( name )
    `)
    .eq('id', surveyId)
    .maybeSingle()

  if (!survey || survey.kind !== 'vendor') notFound()
  if (survey.vendor_profile_id !== vendorProfile.id) notFound()

  const marketsField = survey.markets as { name: string } | { name: string }[] | null
  const market = Array.isArray(marketsField) ? marketsField[0] : marketsField
  const marketName = market?.name ?? 'Unknown market'
  const dateDisplay = formatMarketDateDisplay(survey.market_date as string)

  // eslint-disable-next-line react-hooks/purity
  const expired = new Date(survey.expires_at as string).getTime() < Date.now()
  const alreadySubmitted = survey.submitted_at !== null

  return (
    <div style={{
      maxWidth: containers.md,
      margin: '0 auto',
      padding: spacing.md,
    }}>
      <Link
        href={`/${vertical}/vendor/surveys`}
        style={{
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          textDecoration: 'none',
          marginBottom: spacing.sm,
          display: 'inline-block',
        }}
      >
        ← All surveys
      </Link>
      <h1 style={{
        margin: 0,
        marginBottom: spacing.md,
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        Market survey
      </h1>

      {alreadySubmitted ? (
        <ClosedState
          tone="submitted"
          marketName={marketName}
          dateDisplay={dateDisplay}
          message="Thanks — your response is recorded. You can't edit it after submitting; the manager + admin see your individual ratings."
        />
      ) : expired ? (
        <ClosedState
          tone="expired"
          marketName={marketName}
          dateDisplay={dateDisplay}
          message="This survey closed 30 days after the market day. The window has passed and submissions are no longer accepted."
        />
      ) : (
        <SurveyForm
          kind="vendor"
          marketName={marketName}
          marketDateDisplay={dateDisplay}
          vertical={vertical}
          surveyId={survey.id as string}
        />
      )}
    </div>
  )
}

function ClosedState({
  tone,
  marketName,
  dateDisplay,
  message,
}: {
  tone: 'submitted' | 'expired'
  marketName: string
  dateDisplay: string
  message: string
}) {
  const bg = tone === 'submitted' ? '#d4edda' : '#f8d7da'
  const border = tone === 'submitted' ? '#c3e6cb' : '#f5c6cb'
  const color = tone === 'submitted' ? '#155724' : '#721c24'
  return (
    <div style={{
      padding: spacing.lg,
      backgroundColor: bg,
      border: `1px solid ${border}`,
      borderRadius: radius.md,
      color,
      lineHeight: 1.5,
    }}>
      <div style={{
        fontWeight: typography.weights.semibold,
        fontSize: typography.sizes.lg,
        marginBottom: spacing.xs,
      }}>
        {tone === 'submitted' ? '✓ Survey submitted' : 'Survey closed'}
      </div>
      <div style={{ marginBottom: spacing.xs, fontSize: typography.sizes.sm }}>
        <strong>{marketName}</strong> · {dateDisplay}
      </div>
      <p style={{ margin: 0, fontSize: typography.sizes.sm }}>{message}</p>
    </div>
  )
}
