import { createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  CATEGORY_DEFINITIONS,
  type MarketSurveyRow,
  type SurveyKind,
} from '@/lib/surveys/types'

interface SurveyResultsCardProps {
  marketId: string
  /** "Last N days" window. Default 30. Manager view caps at 30; admin
   *  view may want a wider lookback later (param exposed for that). */
  windowDays?: number
}

interface KindStats {
  totalNotified: number
  totalSubmitted: number
  responseRatePct: number | null // null when totalNotified=0
  categoryAverages: Map<keyof MarketSurveyRow, number | null>
}

/**
 * Manager + admin view of post-market survey results for a specific
 * market, aggregated over the last N days. Server component — queries
 * `market_surveys` directly via service client (RLS default-deny).
 *
 * Renders 2-column layout (vendor / buyer) + recent comments timeline.
 * Until cron Stage 2 starts populating rows, this card shows the empty
 * state.
 *
 * Admin can render the same component on /admin/markets/[id] — there's
 * no manager-vs-admin behavioral difference today. The component does
 * NOT enforce auth itself; caller is responsible (manager pages run
 * isMarketManager(); admin pages run requireAdmin()).
 */
export default async function SurveyResultsCard({
  marketId,
  windowDays = 30,
}: SurveyResultsCardProps) {
  const serviceClient = createServiceClient()

  // Date range — last N days
  const now = new Date()
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - windowDays)
  const startDateStr = formatYMD(startDate)

  // Fetch all surveys for this market within the window. Single query;
  // aggregate in JS — saves N+1 group-bys and keeps the code readable
  // at this volume (manager dashboards are small N, not analytics).
  const { data: rows, error } = await serviceClient
    .from('market_surveys')
    .select(
      `
      id, kind, market_date,
      rating_overall,
      rating_foot_traffic, rating_sales, rating_market_organization, rating_manager_support,
      rating_variety, rating_quality, rating_atmosphere, rating_layout, rating_accessibility,
      comment, submitted_at, notified_at, created_at
      `
    )
    .eq('market_id', marketId)
    .gte('market_date', startDateStr)
    .order('created_at', { ascending: false })

  if (error) {
    // Defensive: don't throw — render an error state in place. The
    // dashboard has plenty of other cards; survey failure shouldn't
    // blank the whole page.
    return (
      <Card>
        <Heading>Survey results — last {windowDays} days</Heading>
        <p style={mutedTextStyle}>
          Could not load surveys for this period.
        </p>
      </Card>
    )
  }

  const surveys = (rows ?? []) as MarketSurveyRow[]
  const vendorStats = computeStats(surveys, 'vendor')
  const buyerStats = computeStats(surveys, 'buyer')

  const recentComments = surveys
    .filter((s) => s.submitted_at !== null && s.comment !== null && s.comment.trim().length > 0)
    .slice(0, 10)

  const hasAnyData =
    vendorStats.totalNotified > 0 ||
    buyerStats.totalNotified > 0

  return (
    <Card>
      <Heading>Survey results — last {windowDays} days</Heading>

      {!hasAnyData && (
        <p style={mutedTextStyle}>
          No surveys yet. After each market day, vendors who attended and
          shoppers who picked up an order will receive a short survey.
          Responses show up here.
        </p>
      )}

      {hasAnyData && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: spacing.md,
            marginBottom: spacing.md,
          }}>
            <KindSection kind="vendor" stats={vendorStats} />
            <KindSection kind="buyer" stats={buyerStats} />
          </div>

          {recentComments.length > 0 && (
            <div>
              <div style={{
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
                color: colors.textPrimary,
                marginBottom: spacing.xs,
              }}>
                Recent comments
              </div>
              <ul style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.xs,
              }}>
                {recentComments.map((s) => (
                  <li key={s.id}>
                    <CommentItem survey={s} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function computeStats(rows: MarketSurveyRow[], kind: SurveyKind): KindStats {
  const ofKind = rows.filter((r) => r.kind === kind)
  const submitted = ofKind.filter((r) => r.submitted_at !== null)
  const totalNotified = ofKind.length
  const totalSubmitted = submitted.length

  const categoryAverages = new Map<keyof MarketSurveyRow, number | null>()
  const categoriesForKind = CATEGORY_DEFINITIONS.filter((c) => c.kinds.includes(kind))
  for (const cat of categoriesForKind) {
    const col = cat.dbColumn as keyof MarketSurveyRow
    let sum = 0
    let n = 0
    for (const s of submitted) {
      const v = s[col] as number | null
      if (typeof v === 'number') {
        sum += v
        n += 1
      }
    }
    categoryAverages.set(col, n > 0 ? sum / n : null)
  }

  const responseRatePct =
    totalNotified > 0 ? Math.round((totalSubmitted / totalNotified) * 100) : null

  return { totalNotified, totalSubmitted, responseRatePct, categoryAverages }
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      {children}
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      margin: 0,
      marginBottom: spacing.sm,
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold,
      color: colors.textPrimary,
    }}>
      {children}
    </h2>
  )
}

const mutedTextStyle = {
  margin: 0,
  color: colors.textMuted,
  fontSize: typography.sizes.sm,
  lineHeight: 1.5,
}

function KindSection({ kind, stats }: { kind: SurveyKind; stats: KindStats }) {
  const heading = kind === 'vendor' ? 'Vendor surveys' : 'Buyer surveys'
  const categoriesForKind = CATEGORY_DEFINITIONS.filter((c) => c.kinds.includes(kind))

  // Order: shared "overall" first (the headline), then specifics
  const overall = categoriesForKind.find((c) => c.dbColumn === 'rating_overall')
  const specifics = categoriesForKind.filter((c) => c.dbColumn !== 'rating_overall')
  const orderedCats = overall ? [overall, ...specifics] : specifics

  return (
    <div style={{
      padding: spacing.sm,
      backgroundColor: colors.surfaceBase,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
    }}>
      <div style={{
        fontWeight: typography.weights.semibold,
        fontSize: typography.sizes.base,
        color: colors.textPrimary,
        marginBottom: spacing.xs,
      }}>
        {heading}
      </div>

      <div style={{
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        marginBottom: spacing.sm,
        lineHeight: 1.5,
      }}>
        {stats.totalSubmitted} of {stats.totalNotified} responded
        {stats.responseRatePct !== null && (
          <> · {stats.responseRatePct}% response rate</>
        )}
      </div>

      {stats.totalSubmitted === 0 ? (
        <div style={{ ...mutedTextStyle, fontStyle: 'italic' }}>
          No responses yet in this window.
        </div>
      ) : (
        <ul style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: spacing['3xs'],
        }}>
          {orderedCats.map((cat) => {
            const avg = stats.categoryAverages.get(cat.dbColumn as keyof MarketSurveyRow)
            const isOverall = cat.dbColumn === 'rating_overall'
            return (
              <li key={cat.dbColumn as string}>
                <CategoryRow
                  label={cat.label}
                  avg={avg ?? null}
                  emphasis={isOverall}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CategoryRow({
  label,
  avg,
  emphasis,
}: {
  label: string
  avg: number | null
  emphasis: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      fontSize: emphasis ? typography.sizes.sm : typography.sizes.xs,
      fontWeight: emphasis ? typography.weights.semibold : typography.weights.normal,
      color: emphasis ? colors.textPrimary : colors.textMuted,
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {avg === null ? '—' : avg.toFixed(1) + ' / 5'}
      </span>
    </div>
  )
}

function CommentItem({ survey }: { survey: MarketSurveyRow }) {
  const kindLabel = survey.kind === 'vendor' ? 'Vendor' : 'Buyer'
  const kindBg = survey.kind === 'vendor' ? '#dcfce7' : '#dbeafe'
  const kindColor = survey.kind === 'vendor' ? '#166534' : '#1e40af'
  const overall = survey.rating_overall

  return (
    <div style={{
      padding: spacing.xs,
      backgroundColor: colors.surfaceBase,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
    }}>
      <div style={{
        display: 'flex',
        gap: spacing['2xs'],
        alignItems: 'center',
        marginBottom: spacing['3xs'],
        fontSize: typography.sizes.xs,
        color: colors.textMuted,
        flexWrap: 'wrap',
      }}>
        <span style={{
          padding: '1px 6px',
          borderRadius: 999,
          backgroundColor: kindBg,
          color: kindColor,
          fontSize: 10,
        }}>
          {kindLabel}
        </span>
        {overall !== null && (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{'★'.repeat(overall)}</span>
        )}
        <span>· {formatDisplayDate(survey.market_date)}</span>
      </div>
      <div style={{
        fontSize: typography.sizes.sm,
        color: colors.textPrimary,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
      }}>
        {survey.comment}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatYMD(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayDate(ymd: string): string {
  // Parse YYYY-MM-DD without local tz drift
  const [y, m, d] = ymd.split('-').map((s) => parseInt(s, 10))
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
