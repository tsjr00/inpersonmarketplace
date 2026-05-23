import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { formatMarketDateDisplay } from '@/lib/surveys/cron-helpers'

interface PageProps {
  params: Promise<{ vertical: string }>
}

/**
 * Vendor's "my surveys" list — Phase E Stage 3.
 *
 * Shows three buckets:
 *   1. Pending — not submitted, not expired
 *   2. Submitted — submitted_at IS NOT NULL
 *   3. Expired — past expires_at without submission
 *
 * Each row links to the detail page (or to a "closed" view for
 * expired ones). Auth-gated to signed-in vendors of this vertical.
 */
export default async function VendorSurveysPage({ params }: PageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${vertical}/login`)

  // Vendor profile for this vertical
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('vertical_id', vertical)
    .maybeSingle()

  if (!vendorProfile) notFound()

  const serviceClient = createServiceClient()
  const { data: rows } = await serviceClient
    .from('market_surveys')
    .select(`
      id, market_date, expires_at, submitted_at, rating_overall, created_at,
      markets!inner ( name )
    `)
    .eq('vendor_profile_id', vendorProfile.id)
    .eq('kind', 'vendor')
    .order('market_date', { ascending: false })

  type Row = {
    id: string
    market_date: string
    expires_at: string
    submitted_at: string | null
    rating_overall: number | null
    markets: { name: string } | { name: string }[] | null
  }

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const pending: Row[] = []
  const submitted: Row[] = []
  const expired: Row[] = []
  for (const r of (rows ?? []) as Row[]) {
    if (r.submitted_at !== null) submitted.push(r)
    else if (new Date(r.expires_at).getTime() < now) expired.push(r)
    else pending.push(r)
  }

  return (
    <div style={{
      maxWidth: containers.md,
      margin: '0 auto',
      padding: spacing.md,
    }}>
      <Link
        href={`/${vertical}/dashboard`}
        style={{
          fontSize: typography.sizes.sm,
          color: colors.textMuted,
          textDecoration: 'none',
          marginBottom: spacing.sm,
          display: 'inline-block',
        }}
      >
        ← Back to dashboard
      </Link>
      <h1 style={{
        margin: 0,
        marginBottom: spacing.sm,
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
      }}>
        My market surveys
      </h1>
      <p style={{
        margin: 0,
        marginBottom: spacing.md,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        After each market day you attend, we send a short survey. Your
        ratings help the market manager and the aggregate data helps
        the market prove its impact to funders. Surveys close 30 days
        after the market day.
      </p>

      <Section title={`Pending (${pending.length})`} emptyText="No pending surveys right now.">
        {pending.map((r) => (
          <SurveyListItem
            key={r.id}
            vertical={vertical}
            row={r}
            status="pending"
          />
        ))}
      </Section>

      <Section title={`Submitted (${submitted.length})`} emptyText="No submitted surveys yet.">
        {submitted.map((r) => (
          <SurveyListItem
            key={r.id}
            vertical={vertical}
            row={r}
            status="submitted"
          />
        ))}
      </Section>

      {expired.length > 0 && (
        <Section title={`Closed (${expired.length})`} emptyText="">
          {expired.map((r) => (
            <SurveyListItem
              key={r.id}
              vertical={vertical}
              row={r}
              status="expired"
            />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string
  emptyText: string
  children: React.ReactNode
}) {
  const childrenArray = Array.isArray(children) ? children : [children]
  const isEmpty = childrenArray.filter(Boolean).length === 0
  return (
    <section style={{ marginBottom: spacing.lg }}>
      <h2 style={{
        margin: 0,
        marginBottom: spacing.xs,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        {title}
      </h2>
      {isEmpty ? (
        <p style={{
          margin: 0,
          color: colors.textMuted,
          fontSize: typography.sizes.sm,
        }}>
          {emptyText}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {children}
        </ul>
      )}
    </section>
  )
}

function SurveyListItem({
  vertical,
  row,
  status,
}: {
  vertical: string
  row: {
    id: string
    market_date: string
    expires_at: string
    submitted_at: string | null
    rating_overall: number | null
    markets: { name: string } | { name: string }[] | null
  }
  status: 'pending' | 'submitted' | 'expired'
}) {
  const marketsField = row.markets
  const market = Array.isArray(marketsField) ? marketsField[0] : marketsField
  const marketName = market?.name ?? 'Unknown market'
  const dateDisplay = formatMarketDateDisplay(row.market_date)
  const linkable = status === 'pending'

  const content = (
    <div style={{
      padding: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
    }}>
      <div>
        <div style={{
          fontWeight: typography.weights.semibold,
          fontSize: typography.sizes.sm,
          color: colors.textPrimary,
          marginBottom: 2,
        }}>
          {marketName}
        </div>
        <div style={{
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
        }}>
          {dateDisplay}
          {status === 'submitted' && row.rating_overall !== null && (
            <> · You rated: {'★'.repeat(row.rating_overall)}</>
          )}
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  )

  if (linkable) {
    return (
      <li>
        <Link
          href={`/${vertical}/vendor/survey/${row.id}`}
          style={{ display: 'block', textDecoration: 'none' }}
        >
          {content}
        </Link>
      </li>
    )
  }
  return <li>{content}</li>
}

function StatusBadge({ status }: { status: 'pending' | 'submitted' | 'expired' }) {
  const map = {
    pending: { bg: '#fff3cd', fg: '#664d03', label: 'Take survey →' },
    submitted: { bg: '#d4edda', fg: '#155724', label: '✓ Submitted' },
    expired: { bg: '#f8d7da', fg: '#721c24', label: 'Closed' },
  } as const
  const m = map[status]
  return (
    <span style={{
      padding: '2px 10px',
      borderRadius: 999,
      backgroundColor: m.bg,
      color: m.fg,
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
      whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  )
}
