import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import SurveyForm from '@/components/surveys/SurveyForm'
import { formatMarketDateDisplay } from '@/lib/surveys/cron-helpers'
import { isWellFormedSurveyToken } from '@/lib/surveys/token'

interface PageProps {
  params: Promise<{ vertical: string; token: string }>
}

/**
 * Anonymous buyer survey page (Phase E Stage 4).
 *
 * Token-gated. Anyone who knows the token can fill it out — by design,
 * since buyers might not be signed in when they click the email link
 * and we don't want to force a login wall. The token IS the auth.
 *
 * Server-validates token shape + looks up the survey row. Renders the
 * shared SurveyForm with kind='buyer'. Submission goes through
 * /api/surveys/respond with { accessToken, ratings... }.
 *
 * Closed states:
 *   - Token bad/missing → 404
 *   - Survey already submitted → "thanks" closed state
 *   - Survey expired → "closed" state
 */
export default async function BuyerSurveyPage({ params }: PageProps) {
  const { vertical, token } = await params

  if (!isWellFormedSurveyToken(token)) {
    notFound()
  }

  const serviceClient = createServiceClient()
  const { data: survey } = await serviceClient
    .from('market_surveys')
    .select(`
      id, kind, buyer_user_id, market_id, market_date,
      expires_at, submitted_at,
      markets!inner ( name, logo_url )
    `)
    .eq('access_token', token)
    .maybeSingle()

  if (!survey || survey.kind !== 'buyer') {
    notFound()
  }

  const marketsField = survey.markets as
    | { name: string; logo_url: string | null }
    | { name: string; logo_url: string | null }[]
    | null
  const market = Array.isArray(marketsField) ? marketsField[0] : marketsField
  const marketName = market?.name ?? 'Unknown market'
  const marketLogoUrl = market?.logo_url ?? null
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
      {/* Market header — logo if uploaded, name + date */}
      <header style={{
        marginBottom: spacing.md,
        textAlign: 'center',
        padding: spacing.md,
        backgroundColor: '#fffaf0',
        border: '1px solid #e5d4a8',
        borderRadius: radius.md,
      }}>
        {marketLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={marketLogoUrl}
            alt={marketName}
            style={{
              maxWidth: 120,
              maxHeight: 80,
              display: 'block',
              margin: '0 auto 8px',
              borderRadius: radius.sm,
            }}
          />
        )}
        <h1 style={{
          margin: 0,
          marginBottom: 4,
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.bold,
          color: colors.textPrimary,
        }}>
          {marketName}
        </h1>
        <div style={{
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
        }}>
          {dateDisplay}
        </div>
      </header>

      {alreadySubmitted ? (
        <ClosedState
          tone="submitted"
          message="Thanks — your response is recorded. The market manager uses your aggregated ratings to keep improving, and the data helps the market prove its impact to funders."
        />
      ) : expired ? (
        <ClosedState
          tone="expired"
          message="This survey closed 30 days after the market day. Thanks for stopping by, and watch for the next one!"
        />
      ) : (
        <SurveyForm
          kind="buyer"
          marketName={marketName}
          marketDateDisplay={dateDisplay}
          vertical={vertical}
          accessToken={token}
        />
      )}

      <p style={{
        margin: 0,
        marginTop: spacing.md,
        textAlign: 'center',
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
      }}>
        Your answers stay anonymous. Only aggregate scores are shared with the market.
      </p>
    </div>
  )
}

function ClosedState({
  tone,
  message,
}: {
  tone: 'submitted' | 'expired'
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
      textAlign: 'center',
    }}>
      <div style={{
        fontWeight: typography.weights.semibold,
        fontSize: typography.sizes.lg,
        marginBottom: spacing.xs,
      }}>
        {tone === 'submitted' ? '✓ Survey submitted' : 'Survey closed'}
      </div>
      <p style={{ margin: 0, fontSize: typography.sizes.sm }}>{message}</p>
    </div>
  )
}
