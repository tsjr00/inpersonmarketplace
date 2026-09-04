export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { enforceVerticalAccess } from '@/lib/auth/vertical-gate'
import { colors, spacing, typography, containers, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import DashboardCard from '@/components/dashboard/DashboardCard'
import DashboardNav, { DashboardNavSpacer } from '@/components/dashboard/DashboardNav'
import { getNavDestinations } from '@/lib/dashboard/nav-destinations'
import EventAgreementPickerCard from '@/components/events/EventAgreementPickerCard'
import EventBroadcastCard from '@/components/events/EventBroadcastCard'
import EventRatingsCard from '@/components/events/EventRatingsCard'
import OrganizerEventDetails from '@/components/events/OrganizerEventDetails'
import EventVendorFeeCard from '@/components/events/EventVendorFeeCard'
import OrganizerEventActions from '@/components/events/OrganizerEventActions'
import OrganizerProgress from '@/components/events/OrganizerProgress'
import InvitationGateCard from '@/components/events/InvitationGateCard'
import { invitationsHeld, invitationGateChecklist } from '@/lib/events/invitation-gate'
import { classifyVendorEventStage, type VendorEventStage } from '@/lib/events/vendor-stage'

interface PageProps {
  params: Promise<{ vertical: string; id: string }>
}

/**
 * Human labels for the enums shown on this page.
 *
 * ⚠ Deliberately NOT shared with the admin or vendor versions of these maps.
 * The same three values get three different sentences depending on who is
 * reading: admin says "Company pays for everyone", the vendor page says
 * "Organizer pays for attendees", and here — the organizer's own dashboard —
 * it is addressed to them directly. Merging them into one map would force one
 * audience's vocabulary onto the other two.
 *
 * Added 2026-08-08: this card previously printed the raw column values
 * ("self_service", "attendee_paid") straight from the database. Fine while
 * testing, not something to show an organizer.
 */
const PAYMENT_MODEL_LABELS: Record<string, string> = {
  company_paid: 'You pay for everyone',
  attendee_paid: 'Attendees pay individually',
  hybrid: 'You cover a base amount, attendees can upgrade',
}

const SERVICE_LEVEL_LABELS: Record<string, string> = {
  self_service: 'Self-service — you pick your vendors',
  full_service: 'Full service — we match vendors for you',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Submitted',
  reviewing: 'Under Review',
  approved: 'Approved — Inviting Vendors',
  ready: 'Enough Vendors Said Yes — Pre-Orders Open',
  active: 'Event Day',
  review: 'Event Ended — Collecting Feedback',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
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
 * ⚠ KEYED ON catering_requests.id, NOT event_token (changed 2026-08-08).
 * The token is minted at APPROVAL, so keying this page on it meant the events
 * that most needed an organiser surface — the un-approved ones — were the exact
 * ones it could not address. An event submitted without a street address could
 * not be approved (api/admin/events/[id] refuses), could not be edited (no
 * token, no editor) and could not be cancelled (no token, no route). It was
 * permanently stuck. The id has no such gap, and the token was never doing any
 * work here anyway: auth below is the session's organizer identity. The token
 * remains what it always was — a bearer credential for ATTENDEE pages.
 *
 * Auth: the organiser of THIS event only, matched on
 * catering_requests.organizer_user_id. Anyone else is redirected out rather
 * than shown a 403, so an event id cannot be probed for existence.
 */
export default async function EventManagerDashboardPage({ params }: PageProps) {
  const { vertical, id } = await params

  await enforceVerticalAccess(vertical)
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect(`/${vertical}/login`)

  const serviceClient = createServiceClient()
  const { data: event } = await serviceClient
    .from('catering_requests')
    .select('id, company_name, event_date, event_end_date, status, market_id, event_token, vendor_count, headcount, service_level, payment_model, access_code, organizer_user_id, vertical_id, address, invitations_released_at, vendor_fee_decided_at, event_vendor_fee_cents, has_run_before, estimated_spend_per_attendee_cents, event_context_confirmed_at, has_competing_vendors, competing_food_options, logistics_confirmed_at, background_check_required, background_check_details')
    .eq('id', id)
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

  // Everything the organiser can act on is addressed by this. Before approval
  // there is no token, so it is the id — see lib/events/event-ref.ts.
  const eventRef = (event.event_token as string | null) || (event.id as string)

  // Approval is refused without a street address (api/admin/events/[id]:128).
  // Say so HERE, where the organiser can actually fix it, instead of leaving
  // them staring at an event that silently never advances.
  const needsAddress = !String(event.address ?? '').trim()
    && ['new', 'reviewing'].includes(status)

  // Traction data, ported off the shopper dashboard's "My Events" band
  // 2026-08-08. There it ran `.in('market_id', [...])` across every event the
  // organiser had; here it is one event, so the per-market bucketing is gone.
  // The band also queried order_items TWICE with identical filters — once to
  // count rows, once to sum subtotals — collapsed into one pass below.
  // Only meaningful once approval has created the market.
  const marketId = event.market_id as string | null
  let vendorsAccepted = 0
  let vendorsSelected = 0
  let preOrderCount = 0
  let orderValueCents = 0
  let waves: Array<{ wave_number: number; capacity: number; reserved: number; status: string }> = []
  // Per-truck roster (owner 2026-09-03): "with 10–15 trucks it would be very
  // easy to lose track of which trucks are in what stage." FULL names at every
  // stage — organizer→vendor disclosure only; the reverse (organizer identity
  // to vendors) stays masked until acceptance per the organizer-identity rule.
  let roster: Array<{ id: string; name: string; stage: VendorEventStage; standby: boolean }> = []

  if (marketId) {
    const [vendorRes, orderRes, waveRes] = await Promise.all([
      serviceClient
        .from('market_vendors')
        .select('id, response_status, organizer_selected_at, is_backup, standby_opted_in_at, vendor_profiles:vendor_profile_id(profile_data)')
        .eq('market_id', marketId),
      serviceClient
        .from('order_items')
        .select('subtotal_cents')
        .eq('market_id', marketId)
        .not('status', 'in', '("cancelled")'),
      serviceClient
        .from('event_waves')
        .select('wave_number, capacity, reserved_count, status')
        .eq('market_id', marketId)
        .order('wave_number'),
    ])

    const vendorRows = vendorRes.data || []
    const acceptedRows = vendorRows.filter(r => r.response_status === 'accepted')
    vendorsAccepted = acceptedRows.length
    // ST-20 (d): "confirmed" means selected by the organizer, not "said yes".
    vendorsSelected = acceptedRows.filter(r => r.organizer_selected_at != null && r.is_backup !== true).length

    const STAGE_ORDER: VendorEventStage[] = ['selected', 'bench', 'accepted_awaiting', 'invited', 'declined', 'withdrawn', 'none']
    roster = vendorRows
      .map(r => {
        const pd = (r.vendor_profiles as unknown as { profile_data: Record<string, unknown> } | null)?.profile_data || {}
        return {
          id: r.id as string,
          name: (pd.business_name as string) || (pd.farm_name as string) || 'Vendor',
          stage: classifyVendorEventStage({
            response_status: (r.response_status as string | null) ?? null,
            organizer_selected_at: (r.organizer_selected_at as string | null) ?? null,
            is_backup: r.is_backup === true,
          }),
          standby: r.standby_opted_in_at != null,
        }
      })
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.name.localeCompare(b.name))
    preOrderCount = (orderRes.data || []).length
    orderValueCents = (orderRes.data || []).reduce(
      (sum, r) => sum + ((r.subtotal_cents as number) || 0),
      0
    )
    waves = (waveRes.data || []).map(w => ({
      wave_number: w.wave_number as number,
      capacity: w.capacity as number,
      reserved: w.reserved_count as number,
      status: w.status as string,
    }))
  }

  const headcount = (event.headcount as number) || 0
  const participationPct = preOrderCount > 0 && headcount > 0
    ? Math.round((preOrderCount / headcount) * 100)
    : null

  const navDestinations = await getNavDestinations(supabase, user, vertical)

  return (
    <div className="has-dashboard-nav" style={{ maxWidth: containers.xl, margin: '0 auto', padding: spacing.md }}>
      <DashboardNav destinations={navDestinations} />
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
          {eventDate} · {STATUS_LABELS[status] || status}
        </p>
      </div>

      {/* T-52: the dashboard opened straight into data with no statement of
          what the organizer is here to DO. The intake form deliberately asks
          little, so the profile arriving incomplete is the normal case, not an
          error — and how complete it is directly drives matching quality. Say
          that once, at the top, in the organizer's terms. */}
      <p style={{
        margin: `0 0 ${spacing.md} 0`,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.6,
      }}>
        Use <strong>Add or edit details</strong> below to fill in your event — the more you tell
        us, the better we can match {term(vertical, 'vendors').toLowerCase()} to it. You can update
        it any time and re-run matching.
      </p>

      {needsAddress && (
        <div style={{
          marginBottom: spacing.md,
          padding: spacing.sm,
          backgroundColor: statusColors.warningLight,
          border: `1px solid ${statusColors.warningBorder}`,
          borderRadius: 8,
          color: statusColors.warningDark,
          fontSize: typography.sizes.sm,
        }}>
          <strong>Your event needs a street address before it can be approved.</strong>
          <span> Open <em>Add or edit details</em> below, choose <em>Event Basics</em>, and fill in Street Address. Nothing moves forward until it&rsquo;s there.</span>
        </div>
      )}

      <DashboardCard title="Event details">
        {/* A labelled grid, not a row of space-separated words. Each value gets
            a label above it, so "3" is legibly "Vendors requested" rather than
            a number floating next to another number. `auto-fit` + `minmax`
            reflows to one column on a phone without a breakpoint. */}
        <dl style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: spacing.sm,
          margin: 0,
        }}>
          {([
            ['Expected attendees', (event.headcount as number) ? String(event.headcount) : 'Not set'],
            ['Vendors requested', (event.vendor_count as number) ? String(event.vendor_count) : 'Not set'],
            ['Service level', SERVICE_LEVEL_LABELS[event.service_level as string] ?? null],
            ['Who pays', PAYMENT_MODEL_LABELS[event.payment_model as string] ?? null],
          ] as Array<[string, string | null]>)
            .filter(([, value]) => value !== null)
            .map(([label, value]) => (
              <div key={label} style={{ minWidth: 0 }}>
                <dt style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textMuted,
                  marginBottom: spacing['3xs'],
                }}>
                  {label}
                </dt>
                <dd style={{
                  margin: 0,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.medium,
                  color: colors.textPrimary,
                }}>
                  {value}
                </dd>
              </div>
            ))}
        </dl>

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

        {/* Traction line, ported from the shopper band. Vendors-confirmed is the
            number organisers actually watch before an event; pre-orders and
            participation are what they watch after it opens. */}
        {marketId && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: spacing.md,
            marginTop: spacing.xs,
            paddingTop: spacing.xs,
            borderTop: `1px solid ${colors.border}`,
            fontSize: typography.sizes.sm,
            color: colors.textSecondary,
          }}>
            {/* ST-20 (d), 2026-08-29: one vocabulary across surfaces —
                "said yes" = accepted the invitation, "selected" = you chose
                them, "attending" = selected and (if there is a fee) paid. */}
            <span><strong>{vendorsSelected}</strong> of {(event.vendor_count as number) || '?'} vendors selected · <strong>{vendorsAccepted}</strong> said yes</span>
            {preOrderCount > 0 && (
              <span><strong>{preOrderCount}</strong> pre-order{preOrderCount === 1 ? '' : 's'}</span>
            )}
            {participationPct !== null && <span>{participationPct}% participation</span>}
            {orderValueCents > 0 && event.payment_model === 'company_paid' && (
              <span>Total order value <strong>${(orderValueCents / 100).toFixed(2)}</strong></span>
            )}
          </div>
        )}

        {/* T-71: stage strip, derived from status. Sits inside Event details,
            under the traction line, so progress is visible without scrolling.
            The matching "what happens next" block renders at the BOTTOM of the
            page — see the note on `part` in OrganizerProgress. */}
        <div style={{ marginTop: spacing.sm }}>
          <OrganizerProgress
            part="strip"
            status={status}
            vertical={vertical}
            eventToken={(event.event_token as string) || null}
            vendorsAccepted={vendorsAccepted}
            vendorCount={(event.vendor_count as number) || null}
            serviceLevel={(event.service_level as string) || null}
            invitationsHeld={invitationsHeld(event)}
          />
        </div>

        {/* The organiser's three ways into their own event. Only the attendee
            shop link existed here before; View Event Page and Select Vendors
            were reachable only from the shopper-dashboard band. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
          {event.event_token && ['approved', 'ready', 'active', 'review', 'completed'].includes(status) && (
            <Link
              href={`/${vertical}/events/${event.event_token}`}
              style={{ color: colors.primary, fontSize: typography.sizes.sm, textDecoration: 'none' }}
            >
              View the event page →
            </Link>
          )}
          {event.event_token && event.service_level === 'self_service' && ['approved', 'ready'].includes(status) && (
            <Link
              href={`/${vertical}/events/${event.event_token}/select`}
              style={{ color: colors.primary, fontSize: typography.sizes.sm, textDecoration: 'none' }}
            >
              Select vendors →
            </Link>
          )}
          {isLive && (
            <Link
              href={`/${vertical}/events/${event.event_token}/shop`}
              style={{ color: colors.primary, fontSize: typography.sizes.sm, textDecoration: 'none' }}
            >
              View the attendee shopping page →
            </Link>
          )}
        </div>
      </DashboardCard>

      {/* Per-truck roster (owner 2026-09-03): every invited truck and its
          stage, so the organizer selecting from 10–15 trucks never loses
          track of who is where. Stage labels come from the SAME classifier as
          the Vendor Event Page and the vendor's locations pill
          (lib/events/vendor-stage.ts) — one vocabulary, three surfaces.
          Read-only; selecting happens on the Select Vendors page. */}
      {roster.length > 0 && (
        <DashboardCard title={`Your ${term(vertical, 'event_vendor_unit')}s (${roster.length} invited)`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
            {roster.map(r => {
              const badge: Record<string, { label: string; bg: string; fg: string }> = {
                selected: { label: 'Selected', bg: statusColors.successLight, fg: statusColors.successDark },
                bench: { label: r.standby ? 'On the bench · standby' : 'On the bench', bg: statusColors.infoLight, fg: statusColors.infoDark },
                accepted_awaiting: { label: 'Said yes — pick or bench them', bg: statusColors.infoLight, fg: statusColors.infoDark },
                invited: { label: 'Invited · awaiting answer', bg: statusColors.warningLight, fg: statusColors.warningDark },
                declined: { label: 'Declined', bg: statusColors.neutral100, fg: statusColors.neutral500 },
                withdrawn: { label: 'Withdrawn', bg: statusColors.dangerLight, fg: statusColors.dangerDark },
                none: { label: '—', bg: statusColors.neutral100, fg: statusColors.neutral500 },
              }
              const b = badge[r.stage]!
              return (
                <div key={r.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing['3xs']} 0`,
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: typography.sizes.sm,
                }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{
                    flexShrink: 0,
                    padding: `2px ${spacing['2xs']}`,
                    backgroundColor: b.bg,
                    color: b.fg,
                    borderRadius: 10,
                    fontSize: typography.sizes.xs,
                    fontWeight: 600,
                  }}>{b.label}</span>
                </div>
              )
            })}
          </div>
          {event.event_token && event.service_level === 'self_service' && ['approved', 'ready'].includes(status) ? (
            <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>
              Selecting and benching happen on the{' '}
              <Link href={`/${vertical}/events/${event.event_token}/select`} style={{ color: colors.primary }}>
                Select vendors page →
              </Link>
            </p>
          ) : null}
        </DashboardCard>
      )}

      {/* Wave utilisation — only exists for wave-ordering events, so the whole
          card stays out of the way when there are none. */}
      {waves.length > 0 && (
        <DashboardCard title="Time slot availability">
          <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
            {waves.map(w => {
              const pct = w.capacity > 0 ? Math.round((w.reserved / w.capacity) * 100) : 0
              const isFull = w.status === 'full' || pct >= 100
              return (
                <div key={w.wave_number} style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  backgroundColor: isFull ? statusColors.dangerLight : pct > 75 ? statusColors.warningLight : statusColors.successLight,
                  border: `1px solid ${isFull ? statusColors.dangerBorder : pct > 75 ? statusColors.warningBorder : statusColors.successBorder}`,
                  borderRadius: 6,
                  fontSize: typography.sizes.xs,
                  color: isFull ? statusColors.dangerDark : pct > 75 ? statusColors.warningDark : statusColors.successDark,
                }}>
                  W{w.wave_number}: {w.reserved}/{w.capacity}{isFull ? ' (full)' : ''}
                </div>
              )
            })}
          </div>
        </DashboardCard>
      )}

      {/* The editor. NOT gated on event_token — that gate is precisely what made
          an addressless event unfixable, because the token does not exist until
          approval and approval is what the address blocks. `address` has always
          been an allowed field here and 'new' has always been an editable
          status; the capability was reachable-by-nobody, not missing. */}
      {/* Invitation gate (mig 239, owner 2026-08-29): self-service events hold
          invitations until the organizer answers what vendors need, then
          clicks Send. Not shown for admin-assisted events (their invitations
          go out at approval — owner: admin assist later). */}
      {event.service_level === 'self_service' && ['new', 'reviewing', 'approved', 'ready'].includes(status) && (
        <DashboardCard
          title={invitationsHeld(event) ? 'Send invitations' : 'Invitations'}
          state={invitationsHeld(event) ? 'warning' : 'neutral'}
        >
          <InvitationGateCard
            eventRef={eventRef}
            vertical={vertical}
            checklist={invitationGateChecklist(event)}
            releasedAt={(event.invitations_released_at as string | null) ?? null}
            approved={!!event.market_id}
            primaryColor={colors.primary}
          />
        </DashboardCard>
      )}

      <DashboardCard title="Add or edit details" state={needsAddress ? 'warning' : 'neutral'}>
        <OrganizerEventDetails
          eventRef={eventRef}
          status={status}
          vertical={vertical}
          primaryColor={colors.primary}
        />
      </DashboardCard>

      {/* Event Vendor Fee (V1, 2026-08-14) — organizer charges vendors for
          their spot. Post-approval feature; pre-approval the card explains
          itself. Payout onboarding (lazy Connect) is driven from inside it. */}
      <DashboardCard title="Event Vendor Fee">
        <EventVendorFeeCard eventRef={eventRef} primaryColor={colors.primary} />
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

      {/* T-53/T-54: the organizer scrolls to the end looking for what to do and
          used to find ratings, copy-link and cancel. This says what they have
          FINISHED and what is happening now — including when the honest answer
          is "wait", which is most of the time between invitations going out and
          vendors replying. Placed ABOVE "Manage this event" so the housekeeping
          card is no longer the last word on the page. */}
      <DashboardCard title="What happens next">
        <OrganizerProgress
          part="next"
          status={status}
          vertical={vertical}
          eventToken={(event.event_token as string) || null}
          vendorsAccepted={vendorsAccepted}
          vendorCount={(event.vendor_count as number) || null}
          serviceLevel={(event.service_level as string) || null}
          invitationsHeld={invitationsHeld(event)}
        />
      </DashboardCard>

      {/* Copy-link + Cancel. Cancel is the escape hatch: without it, an event
          that cannot be approved and cannot be edited also cannot be abandoned,
          which is what turned a missing address into a permanent dead end. It is
          addressed by id when there is no token. */}
      <DashboardCard title="Manage this event">
        <OrganizerEventActions
          eventId={event.id as string}
          eventName={(event.company_name as string) || 'this event'}
          eventRef={eventRef}
          eventToken={event.event_token as string | null}
          status={status}
          vertical={vertical}
        />
      </DashboardCard>

      <DashboardNavSpacer destinations={navDestinations} />
    </div>
  )
}
