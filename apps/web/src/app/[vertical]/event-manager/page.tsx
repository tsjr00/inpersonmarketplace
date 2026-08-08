export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import { colors, spacing, typography, radius, containers, statusColors } from '@/lib/design-tokens'
import DashboardCard from '@/components/dashboard/DashboardCard'
import DashboardNav, { DashboardNavSpacer } from '@/components/dashboard/DashboardNav'
import { getNavDestinations } from '@/lib/dashboard/nav-destinations'

interface PageProps {
  params: Promise<{ vertical: string }>
}

/**
 * EVENT MANAGER PICKER.
 *
 * ⚠ An event ORGANISER is not a market manager. Different table, different
 * identity column: organisers are `catering_requests.organizer_user_id`,
 * managers are `markets.manager_user_id`. An approved event does get a linked
 * `market_id`, which makes them look related — they are not, and the owner
 * called this out explicitly (2026-08-07): "they are separate even though they
 * both relate to events."
 *
 * ⚠ Also distinct from the VENDOR's view of an event. "My Vendor Events" on the
 * vendor dashboard means "I am booked to sell at this event". This side means
 * "I am running this event". Do not merge them.
 *
 * Mirrors the market-manager picker deliberately: one dashboard per event,
 * loading one event's data at a time.
 */
export default async function EventManagerPickerPage({ params }: PageProps) {
  const { vertical } = await params

  await enforceVerticalAccess(vertical)
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect(`/${vertical}/login`)

  // Service client: organiser rows are read by owner id, which RLS on
  // catering_requests does not expose to the user client.
  const serviceClient = createServiceClient()
  const { data: events } = await serviceClient
    .from('catering_requests')
    .select('id, company_name, event_date, status, event_token')
    .eq('organizer_user_id', user.id)
    .eq('vertical_id', vertical)
    .order('event_date', { ascending: false })

  const withToken = (events || []).filter(e => e.event_token)

  if (withToken.length === 0) redirect(`/${vertical}/dashboard`)
  if (withToken.length === 1) redirect(`/${vertical}/event-manager/${withToken[0].event_token}/dashboard`)

  const fmt = (d: string | null) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Date TBD'

  const navDestinations = await getNavDestinations(supabase, user, vertical)

  return (
    <div className="has-dashboard-nav" style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <DashboardNav destinations={navDestinations} />
      <h1 style={{
        color: colors.primary,
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.xl,
        fontWeight: typography.weights.bold,
      }}>
        My Events
      </h1>
      <p style={{ margin: `0 0 ${spacing.md} 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        You organize {withToken.length} events. Choose one to open its dashboard.
      </p>

      <DashboardCard title="Choose an event">
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {withToken.map((e) => (
            <Link
              key={e.id}
              href={`/${vertical}/event-manager/${e.event_token}/dashboard`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: colors.surfaceBase,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                textDecoration: 'none',
                color: colors.textPrimary,
                fontSize: typography.sizes.sm,
                minWidth: 0,
              }}
            >
              <span style={{ fontWeight: typography.weights.medium, minWidth: 0 }}>
                {e.company_name || 'Untitled event'}
                <span style={{ color: colors.textMuted, fontWeight: typography.weights.normal, marginLeft: spacing['2xs'] }}>
                  · {fmt(e.event_date as string | null)}
                </span>
              </span>
              <span style={{ color: statusColors.neutral500, fontSize: typography.sizes.xs, whiteSpace: 'nowrap' }}>
                {e.status} →
              </span>
            </Link>
          ))}
        </div>
      </DashboardCard>
      <DashboardNavSpacer destinations={navDestinations} />
    </div>
  )
}
