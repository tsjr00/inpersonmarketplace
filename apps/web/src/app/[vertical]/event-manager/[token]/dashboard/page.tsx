export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import { colors, spacing, typography, containers, statusColors } from '@/lib/design-tokens'
import DashboardCard from '@/components/dashboard/DashboardCard'
import EventAgreementPickerCard from '@/components/events/EventAgreementPickerCard'
import EventBroadcastCard from '@/components/events/EventBroadcastCard'
import EventRatingsCard from '@/components/events/EventRatingsCard'

interface PageProps {
  params: Promise<{ vertical: string; token: string }>
}

/**
 * EVENT MANAGER DASHBOARD — the home event organisers never had.
 *
 * Their controls previously lived as a full-width "My Events" band bolted onto
 * the SHOPPER dashboard, one block per event. Owner: it "doesn't fit in the mix
 * and makes the dashboard feel weird" — correct, because it was never a band.
 * It was a dashboard that had not been built.
 *
 * ⚠ Scope, per the owner (2026-08-07): "build the basics of the dashboard now,
 * we will add specifics later, but we need a place to put the data." This is
 * the shell plus the existing management controls. Do NOT invent new event
 * features here; add them as the specifics arrive.
 *
 * ⚠ The shopper-dashboard band is deliberately STILL IN PLACE. The owner asked
 * to "keep the way in for organizers for now (testing)" — the left rail and
 * bottom bar that will properly route here do not exist until Slice 4. Remove
 * the band then, not before, or organisers lose their route in mid-test.
 *
 * ⚠ NOT the vendor's view of an event. "My Vendor Events" on the vendor
 * dashboard means "I am booked to sell at this event"; this page means "I am
 * running this event". Separate roles, separate data, keep them separate.
 *
 * Auth: the organiser of THIS event only, matched on
 * catering_requests.organizer_user_id. Anyone else is redirected out rather
 * than shown a 403, so an event token cannot be probed for existence.
 */
export default async function EventManagerDashboardPage({ params }: PageProps) {
  const { vertical, token } = await params

  await enforceVerticalAccess(vertical)
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect(`/${vertical}/login`)

  const serviceClient = createServiceClient()
  const { data: event } = await serviceClient
    .from('catering_requests')
    .select('id, company_name, event_date, event_end_date, status, market_id, event_token, vendor_count, headcount, service_level, payment_model, access_code, organizer_user_id, vertical_id')
    .eq('event_token', token)
    .maybeSingle()

  // Unknown token, wrong vertical and "not yours" all resolve identically.
  if (!event || event.vertical_id !== vertical || event.organizer_user_id !== user.id) {
    redirect(`/${vertical}/dashboard`)
  }

  const eventDate = event.event_date
    ? new Date((event.event_date as string) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Date TBD'

  const status = event.status as string
  const isLive = ['ready', 'active'].includes(status)
  const showsAgreements = ['approved', 'ready', 'active', 'review'].includes(status)

  return (
    <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: spacing.md }}>
      <div style={{ marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottom: `2px solid ${colors.primary}` }}>
        <h1 style={{
          color: colors.primary,
          margin: 0,
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.bold,
        }}>
          {(event.company_name as string) || 'My Event'}
        </h1>
        <p style={{ margin: `${spacing['3xs']} 0 0 0`, color: colors.textMuted, fontSize: typography.sizes.sm }}>
          {eventDate} · {status}
        </p>
      </div>

      <DashboardCard title="Event details">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md, fontSize: typography.sizes.sm }}>
          <span><strong>{(event.headcount as number) || '?'}</strong> expected</span>
          <span><strong>{(event.vendor_count as number) || '?'}</strong> vendors requested</span>
          {event.service_level ? <span>{event.service_level as string}</span> : null}
          {event.payment_model ? <span>{event.payment_model as string}</span> : null}
        </div>

        {/* Access code — the one piece organisers physically hand to attendees. */}
        {event.access_code && (event.payment_model === 'company_paid' || event.payment_model === 'hybrid') && (
          <p style={{
            margin: `${spacing.xs} 0 0 0`,
            padding: spacing.xs,
            backgroundColor: statusColors.warningLight,
            border: `1px solid ${statusColors.warningBorder}`,
            borderRadius: 6,
            fontSize: typography.sizes.sm,
            color: statusColors.warningDark,
          }}>
            Access code: <strong style={{ letterSpacing: 2, fontFamily: 'monospace' }}>{event.access_code as string}</strong>
            <span style={{ marginLeft: spacing.xs }}> — share with attendees</span>
          </p>
        )}

        {isLive && (
          <p style={{ margin: `${spacing.xs} 0 0 0` }}>
            <Link
              href={`/${vertical}/events/${event.event_token}/shop`}
              style={{ color: colors.primary, fontSize: typography.sizes.sm, textDecoration: 'none' }}
            >
              View the attendee shopping page →
            </Link>
          </p>
        )}
      </DashboardCard>

      {/* The management controls, moved off the shopper dashboard.
          These three are inline expand/collapse toggles rather than cards —
          each is wrapped so it reads as a section here. Restructuring them into
          proper cards is deferred to the events rebuild. */}
      {event.event_token && (
        <DashboardCard title="Announcements">
          <EventBroadcastCard eventToken={event.event_token as string} primaryColor={colors.primary} />
        </DashboardCard>
      )}

      {showsAgreements && event.event_token && (
        <DashboardCard title="Vendor agreements">
          <EventAgreementPickerCard eventToken={event.event_token as string} primaryColor={colors.primary} />
        </DashboardCard>
      )}

      {event.event_token && (
        <DashboardCard title="Ratings & feedback">
          <EventRatingsCard eventToken={event.event_token as string} primaryColor={colors.primary} />
        </DashboardCard>
      )}
    </div>
  )
}
