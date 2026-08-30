import Link from 'next/link'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

/**
 * ORGANIZER PROGRESS — where the event is, and what happens next.
 *
 * Answers three findings from owner testing 2026-08-12 that turned out to be
 * one problem (T-53, T-54, T-71):
 *
 *   T-71 — after confirming trucks the dashboard looked identical. It still
 *          read "2 of 4 vendors confirmed" with no sense that anything moved.
 *   T-53 — the organizer scrolled to the bottom expecting an action and found
 *          ratings, "copy event link" and "cancel event". The two real actions
 *          sat in small text at the top.
 *   T-54 — those actions led to pages with nothing to DO yet, because vendors
 *          had not responded. The pages were not broken; the expectation was
 *          never set. (Owner: *"they were not blank, just nothing to do on
 *          them because the vendors needed to respond first."*)
 *
 * THE RULE THIS ENCODES (owner, 2026-08-12): at every stage, say what the
 * organizer has FINISHED and what is happening now. *"The honest answer is
 * 'do nothing and wait', but that doesn't feel good — the goal is to let them
 * know they have done that part and the next step is underway with the
 * vendors."* Never render a stage as "nothing to do".
 *
 * Stages are DERIVED from catering_requests.status — no second source of truth
 * to drift. `new` and `reviewing` are admin-side and mean nothing to an
 * organizer, so they fold into the first step. Completed steps stay VISIBLE and
 * ticked (owner decision) rather than being dropped, because seeing the part
 * they finished is the reassurance.
 *
 * ⚠ Labels are deliberately plain — an organizer should never have to decode a
 * status name. If the DB gains a status, add it to STAGE_FOR_STATUS or it will
 * fall through to the first stage and quietly under-report progress.
 */

interface OrganizerProgressProps {
  status: string
  vertical: string
  eventToken: string | null
  /** Drives whether "Review responses" is offered. */
  vendorsAccepted: number
  vendorCount: number | null
  serviceLevel: string | null
  /** Invitation gate (mig 239): self-service + not yet released. Stage 2 must
   *  not claim "invitations are out" — they aren't until the organizer clicks
   *  Send on the dashboard card. */
  invitationsHeld?: boolean
  /**
   * The two halves render in different places on purpose:
   *   'strip' goes under Event details, beside the traction line, so progress
   *           is visible without scrolling (T-71).
   *   'next'  goes at the BOTTOM, because T-53 is specifically that an
   *           organizer scrolls to the end looking for the next action and
   *           finds ratings and "cancel event".
   * Terminal states (cancelled/declined) render their statement once, from
   * the 'strip' position only, so it isn't repeated down the page.
   */
  part?: 'strip' | 'next'
}

/** Index into the visible stage list for each DB status. */
const STAGE_FOR_STATUS: Record<string, number> = {
  new: 1,
  reviewing: 1,
  approved: 2,
  ready: 3,
  active: 4,
  review: 5,
  completed: 5,
}

export default function OrganizerProgress({
  status,
  vertical,
  eventToken,
  vendorsAccepted,
  vendorCount,
  serviceLevel,
  invitationsHeld = false,
  part = 'strip',
}: OrganizerProgressProps) {
  const vendorWord = term(vertical, 'vendors').toLowerCase()

  // Terminal states get a statement, not a progress bar. A strip frozen at
  // step 2 next to the word "cancelled" reads like a bug.
  if (status === 'cancelled' || status === 'declined') {
    if (part === 'next') return null
    return (
      <div style={{
        marginBottom: spacing.md,
        padding: spacing.sm,
        backgroundColor: statusColors.neutral100,
        border: `1px solid ${statusColors.neutral300}`,
        borderRadius: radius.md,
        color: colors.textSecondary,
        fontSize: typography.sizes.sm,
      }}>
        {status === 'cancelled'
          ? 'This event has been cancelled. Nothing further is scheduled.'
          : 'This event request was declined. Get in touch if you think that was a mistake.'}
      </div>
    )
  }

  const stages = [
    'Event details in',
    'Approved',
    `${term(vertical, 'vendors')} responding`,
    'Pre-orders open',
    'Event day',
  ]
  const current = STAGE_FOR_STATUS[status] ?? 1

  const nextStep = ((): { done: string; now: string; actions: Array<{ label: string; href: string }> } => {
    const actions: Array<{ label: string; href: string }> = []
    switch (current) {
      case 1:
        return {
          done: 'Your event details are in.',
          now: `We're reviewing them now — nothing is needed from you. Anything you add while you wait makes the match to ${vendorWord} better.`,
          actions,
        }
      case 2:
        if (invitationsHeld) {
          return {
            done: 'Your event is approved.',
            now: `Invitations have not gone out yet — ${vendorWord} decide on the details you give them. Finish the items in the Send invitations card above and click Send; they usually respond within 48 hours of that.`,
            actions,
          }
        }
        // The stage that prompted all three findings.
        if (eventToken && serviceLevel === 'self_service' && vendorsAccepted > 0) {
          actions.push({ label: 'Review responses', href: `/${vertical}/events/${eventToken}/select` })
        }
        return {
          done: `Your event is live and invitations are out — that part is done.`,
          now: vendorsAccepted > 0
            ? `${vendorsAccepted} ${vendorsAccepted === 1 ? 'has' : 'have'} responded so far${vendorCount ? ` of the ${vendorCount} you asked for` : ''}. You can review them now, or wait for more — they usually reply within 48 hours.`
            : `It's with the ${vendorWord} now. They usually respond within 48 hours, and you'll get an email as replies come in.`,
          actions,
        }
      case 3:
        if (eventToken) {
          actions.push({ label: 'View the attendee page', href: `/${vertical}/events/${eventToken}/shop` })
        }
        return {
          done: `Your ${vendorWord} are confirmed.`,
          now: 'Attendees can pre-order now. Share your event link so people can order before the day.',
          actions,
        }
      case 4:
        if (eventToken) {
          actions.push({ label: 'View the attendee page', href: `/${vertical}/events/${eventToken}/shop` })
        }
        return {
          done: 'Everything is set.',
          now: `It's event day — orders are with your ${vendorWord}.`,
          actions,
        }
      default:
        return {
          done: 'Your event is done.',
          now: 'Ratings and feedback are collected below. Thanks for running it with us.',
          actions,
        }
    }
  })()

  if (part === 'strip') {
    return (
      /* The strip. Completed steps stay visible and ticked — the point is to
         show the organizer the part they already finished. */
      <ol style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: spacing['2xs'],
        listStyle: 'none',
        margin: `0 0 ${spacing.sm} 0`,
        padding: 0,
      }}>
        {stages.map((label, i) => {
          const done = i < current
          const isCurrent = i === current
          return (
            <li
              key={label}
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                flex: '1 1 140px',
                padding: `${spacing['2xs']} ${spacing.xs}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                fontWeight: isCurrent ? typography.weights.bold : typography.weights.medium,
                border: `1px solid ${isCurrent ? colors.primary : done ? statusColors.successBorder : statusColors.neutral300}`,
                backgroundColor: isCurrent ? colors.primary : done ? statusColors.successLight : 'transparent',
                color: isCurrent ? 'white' : done ? statusColors.success : colors.textMuted,
              }}
            >
              {done ? '✓ ' : ''}{label}
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <div style={{ marginBottom: spacing.md }}>
      <div style={{
        padding: spacing.sm,
        backgroundColor: statusColors.infoLight,
        border: `1px solid ${statusColors.infoBorder}`,
        borderRadius: radius.md,
      }}>
        <p style={{
          margin: 0,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          {nextStep.done}
        </p>
        <p style={{
          margin: `${spacing['3xs']} 0 0 0`,
          fontSize: typography.sizes.sm,
          color: colors.textSecondary,
          lineHeight: 1.6,
        }}>
          {nextStep.now}
        </p>
        {nextStep.actions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
            {nextStep.actions.map(a => (
              <Link
                key={a.href}
                href={a.href}
                style={{
                  padding: `${spacing['2xs']} ${spacing.sm}`,
                  backgroundColor: colors.primary,
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
