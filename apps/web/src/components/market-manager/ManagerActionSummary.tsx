import { colors, spacing, typography } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import DashboardCard from '@/components/dashboard/DashboardCard'
import type { OnboardingProgress } from '@/lib/markets/onboarding-progress'
import type { ManagerDashboardStats } from '@/lib/markets/manager-dashboard-stats'
import type { ManagerActionSignals } from '@/lib/markets/manager-action-items'

interface ManagerActionSummaryProps {
  vertical: string
  progress: OnboardingProgress
  stats: ManagerDashboardStats
  /** The four signals beyond approvals/booth numbers (booth_numbering_design.md §3.9). FM only; FT passes nothing. */
  signals?: ManagerActionSignals | undefined
  /** FT parks (2026-09-20): setup is the PARK-shaped checklist — the FM one
   *  checks booth inventory a park never has, so the card never rendered for
   *  a park. When given, this replaces the FM-derived gate. */
  setupComplete?: boolean | undefined
  /** FT parks: the two park to-dos that already exist as badges on the page. */
  ftSignals?: { trucksBookedNeedingApproval: number; holdRequests: number } | undefined
}

/**
 * "Action Items" — the first card on the manager dashboard (owner 2026-09-19/20,
 * OB-029 part C + Option U part D: "a distillation of action items for the
 * manager to DO, not just things he needs to be aware of"). Six kinds, every
 * one something the manager can click and finish on this page:
 *
 *   1. Vendors pending approval                   → Review (roster)
 *   2. Active vendors needing a booth #           → Assign (roster) — only where
 *      the market does NOT charge for booths; at a charging market the vendor
 *      gets a number when they book (F2a)
 *   3. A size with no booth numbers yet · held/placeholder numbers with no size
 *                                                 → Booth inventory / roster
 *   4. A size over capacity this week             → Booths & occupancy
 *   5. Stripe needs more information              → Setup
 *   6. Season settlements owed                    → Seasons
 *
 * Awareness-only items do NOT belong here — the schedule strip carries them.
 *
 * NOT a replacement for OnboardingChecklist — they show different things.
 * Onboarding checklist = "you haven't finished setup yet."
 * Action Items         = "setup is done; here's what needs your hand."
 */
export default function ManagerActionSummary({
  vertical,
  progress,
  stats,
  signals,
  setupComplete,
  ftSignals,
}: ManagerActionSummaryProps) {
  // If onboarding isn't complete, defer to OnboardingChecklist. Don't
  // render a competing prompt during the setup flow. FT passes its own
  // park-shaped answer (see setupComplete).
  const setupIncomplete = setupComplete !== undefined ? !setupComplete : (!progress.inventory_done || !progress.optin_done)
  if (setupIncomplete) return null

  const isFoodTrucks = vertical === 'food_trucks'
  const vendorOne = term(vertical, 'vendor').toLowerCase()
  const vendorMany = term(vertical, 'vendors').toLowerCase()
  const booth = term(vertical, 'booth').toLowerCase()

  const items: Array<{ key: string; icon: string; text: React.ReactNode; href: string; cta: string }> = []

  // FM: the roster card is #roster; FT: the "Your trucks" tabbed group is #vendors.
  const rosterHref = isFoodTrucks ? '#vendors' : '#roster'
  if (stats.pendingApprovalCount > 0) {
    // FT: a truck that has already BOOKED this week and is still unapproved is
    // the urgent subset — name it (the week card's accessory said this before).
    const urgent = ftSignals?.trucksBookedNeedingApproval ?? 0
    items.push({
      key: 'approvals', icon: '📥', href: rosterHref, cta: 'Review →',
      text: <>
        <strong>{stats.pendingApprovalCount}</strong> {stats.pendingApprovalCount === 1 ? vendorOne : vendorMany} pending your approval
        {urgent > 0 ? <> — <strong>{urgent}</strong> {urgent === 1 ? 'has' : 'have'} already booked this week</> : null}.
      </>,
    })
  }
  if (ftSignals && ftSignals.holdRequests > 0) {
    items.push({
      key: 'holds', icon: '📌', href: '#vendors', cta: 'Decide →',
      text: <><strong>{ftSignals.holdRequests}</strong> recurring-hold {ftSignals.holdRequests === 1 ? 'request is' : 'requests are'} waiting for your yes or no (Recurring holds tab).</>,
    })
  }
  // FT parks have no booth-number model — a truck's spot lives in
  // park_spot_bookings, so activeVendorsNeedingBooth (booth_number IS NULL)
  // counts every truck. Suppress for FT. At a CHARGING FM market the number
  // arrives with the booking, so it is not the manager's to-do (F2a).
  if (!isFoodTrucks && !stats.marketChargesBooths && stats.activeVendorsNeedingBooth > 0) {
    items.push({
      key: 'booth', icon: '📋', href: rosterHref, cta: 'Assign now →',
      text: <><strong>{stats.activeVendorsNeedingBooth}</strong> active {stats.activeVendorsNeedingBooth === 1 ? `${vendorOne} needs` : `${vendorMany} need`} a {booth} number.</>,
    })
  }
  if (signals && signals.unnumberedSizes.length > 0) {
    items.push({
      key: 'unnumbered', icon: '🔢', href: '#setup', cta: 'Set numbers →',
      text: <><strong>{signals.unnumberedSizes.join(', ')}</strong> {signals.unnumberedSizes.length === 1 ? 'has' : 'have'} no {booth} numbers yet — {vendorMany} can&apos;t book {signals.unnumberedSizes.length === 1 ? 'that size' : 'those sizes'}.</>,
    })
  }
  if (signals && signals.untieredNumbers > 0) {
    items.push({
      key: 'untiered', icon: '🏷️', href: '#roster', cta: 'Re-pick →',
      text: <><strong>{signals.untieredNumbers}</strong> held or placeholder {signals.untieredNumbers === 1 ? 'number has' : 'numbers have'} no size — re-pick {signals.untieredNumbers === 1 ? 'it' : 'them'} so {signals.untieredNumbers === 1 ? 'it lands' : 'they land'} under the right size.</>,
    })
  }
  if (signals && signals.overCapacitySizes.length > 0) {
    items.push({
      key: 'overcap', icon: '⚠️', href: '#booths', cta: 'Fix →',
      text: <><strong>{signals.overCapacitySizes.join(', ')}</strong> {signals.overCapacitySizes.length === 1 ? 'is' : 'are'} over capacity this week — more placeholders and bookings than {booth}s.</>,
    })
  }
  if (signals?.stripeNeedsAction) {
    items.push({
      key: 'stripe', icon: '💳', href: '#setup', cta: 'Finish →',
      text: <>Stripe needs more information before it can pay you — finish the payment setup.</>,
    })
  }
  if (signals && signals.settlementsOwed > 0) {
    items.push({
      key: 'settle', icon: '🧾', href: '#seasons', cta: 'Settle →',
      text: <><strong>{signals.settlementsOwed}</strong> season {signals.settlementsOwed === 1 ? 'vendor is' : 'vendors are'} owed a settlement for cancelled days beyond the cap.</>,
    })
  }

  // Collapses rather than disappearing (owner, 2026-08-08). "Nothing to do"
  // is genuinely useful information for a manager — it is the difference
  // between "I'm caught up" and "I wonder if this page is broken".
  //
  // ⚠ NOTE the early return above is NOT converted. `setupIncomplete` is not an
  // empty state — OnboardingChecklist owns that moment, and rendering a second
  // prompt beside it is the competing-prompt problem that return exists to
  // avoid. Only the genuinely-nothing-to-do case collapses.
  const nothingToDo = items.length === 0

  return (
    <DashboardCard
      title="Action Items"
      {...(nothingToDo ? {
        empty: {
          kind: 'waiting' as const,
          message: isFoodTrucks
            ? `Nothing needs you right now — truck approvals and recurring-hold requests show up here.`
            : `Nothing needs you right now — ${vendorOne} applications, ${booth} numbers, sizes over capacity, Stripe requests and season settlements show up here.`,
        },
      } : {})}
    >
      <ul style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
      }}>
        {items.map((it) => (
          <li key={it.key} style={{
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            display: 'flex',
            alignItems: 'baseline',
            gap: spacing['2xs'],
            flexWrap: 'wrap',
          }}>
            <span>{it.icon}</span>
            <span>{it.text}</span>
            {/* Plain anchor, NOT next/link. This card is always on the same page
                as its targets, and a <Link> to a full path + hash silently stops
                working after the first click: once the URL already ends in the
                hash the router sees no change, fires no navigation, and nothing
                scrolls. A native same-page anchor re-scrolls every time. Matches
                ManagerJumpNav. #roster = the roster card; #setup / #booths /
                #seasons = the FmDashboardBody sections. */}
            <a
              href={it.href}
              style={{
                color: colors.primary,
                textDecoration: 'underline',
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.xs,
              }}
            >
              {it.cta}
            </a>
          </li>
        ))}
      </ul>
    </DashboardCard>
  )
}
