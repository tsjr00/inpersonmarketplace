/**
 * Invitation gate — what a self-service organizer must answer before vendor
 * invitations go out (owner decision 2026-08-29, mig 239).
 *
 * Why: intake used to auto-approve AND auto-invite in one call, before the
 * organizer could even set a vendor fee (only possible after approval) or say
 * anything about budget, what else is at the venue, background checks or risk.
 * Vendors were being asked to commit to a blank.
 *
 * Now: intake auto-approves and runs the match engine as a DRY RUN (a
 * preliminary "N look like a fit"), and invitations are HELD until the
 * organizer completes this list and clicks "Send invitations"
 * (POST /api/events/[token]/release-invitations). Every other path that can
 * invite — the daily re-match sweep in the cron, "Refresh matches" — checks
 * `invitationsHeld` first.
 *
 * Scope: self-service events only. Admin-assisted events keep today's flow
 * (owner: "we will do admin assist later").
 *
 * The required list, in the owner's words → columns:
 *   Free or charged event                 → vendor_fee_decided_at (fee card save)
 *   Budget Part 1: run this before? Y/N   → has_run_before
 *   Budget Part 2: spend per purchaser    → estimated_spend_per_attendee_cents > 0
 *   Event Context, all except Themed      → event_context_confirmed_at (group saved)
 *                                           + competing_food_options when
 *                                             has_competing_vendors is true
 *   Background checks + cost              → background_check_required answered,
 *                                           details when true
 *   Anything That Could Make Vendors      → logistics_confirmed_at (group saved;
 *   Reconsider?                             the checklist itself writes NULL for
 *                                           "none", which is a valid answer)
 */

export type GateGroup = 'fee' | 'budget' | 'context' | 'logistics'

export interface MissingDetail {
  /** Stable key for tests + UI anchors. */
  key: string
  /** Owner-facing label, as it appears on the Organizer Event Dashboard. */
  label: string
  /** Which card / section on the dashboard answers it. */
  group: GateGroup
}

/** The columns the gate reads. Select exactly these (plus service_level etc.). */
export const INVITATION_GATE_COLUMNS = [
  'service_level',
  'invitations_released_at',
  'vendor_fee_decided_at',
  'event_vendor_fee_cents',
  'has_run_before',
  'estimated_spend_per_attendee_cents',
  'event_context_confirmed_at',
  'has_competing_vendors',
  'competing_food_options',
  'logistics_confirmed_at',
  'background_check_required',
  'background_check_details',
] as const

export interface InvitationGateRow {
  service_level?: string | null
  invitations_released_at?: string | null
  vendor_fee_decided_at?: string | null
  event_vendor_fee_cents?: number | null
  has_run_before?: boolean | null
  estimated_spend_per_attendee_cents?: number | null
  event_context_confirmed_at?: string | null
  has_competing_vendors?: boolean | null
  competing_food_options?: string | null
  logistics_confirmed_at?: string | null
  background_check_required?: boolean | null
  background_check_details?: string | null
}

/** Fields whose presence in a details PATCH means the group was answered. */
export const EVENT_CONTEXT_FIELDS = [
  'beverages_provided',
  'dessert_provided',
  'competing_food_options',
  'has_competing_vendors',
  'children_present',
  'is_ticketed',
] as const

export const LOGISTICS_GATE_FIELDS = [
  'background_check_required',
  'background_check_details',
  'cancellation_risk_factors',
] as const

/** Details-editor fields that carry the "required before invitations" tag. */
export const INVITATION_REQUIRED_DETAIL_FIELDS = new Set<string>([
  'has_run_before',
  'estimated_spend_per_attendee_cents',
  ...EVENT_CONTEXT_FIELDS,
  'background_check_required',
  'background_check_details',
  'cancellation_risk_factors',
])

export function isSelfService(row: Pick<InvitationGateRow, 'service_level'>): boolean {
  return row.service_level === 'self_service'
}

/**
 * True when invitations must NOT go out yet. Only self-service events are
 * gated; everything else returns false so existing flows are untouched.
 */
export function invitationsHeld(row: Pick<InvitationGateRow, 'service_level' | 'invitations_released_at'>): boolean {
  return isSelfService(row) && !row.invitations_released_at
}

export function missingInvitationDetails(row: InvitationGateRow): MissingDetail[] {
  const missing: MissingDetail[] = []

  if (!row.vendor_fee_decided_at && !(typeof row.event_vendor_fee_cents === 'number' && row.event_vendor_fee_cents > 0)) {
    missing.push({ key: 'fee', label: 'Free or charged event — set a vendor fee, or save "no fee"', group: 'fee' })
  }

  if (row.has_run_before !== true && row.has_run_before !== false) {
    missing.push({ key: 'has_run_before', label: 'Have you run this or a similar event before?', group: 'budget' })
  }
  if (!(typeof row.estimated_spend_per_attendee_cents === 'number' && row.estimated_spend_per_attendee_cents > 0)) {
    missing.push({ key: 'estimated_spend', label: 'Anticipated spend per person who buys something', group: 'budget' })
  }

  if (!row.event_context_confirmed_at) {
    missing.push({ key: 'event_context', label: 'Event Context — beverages, dessert, other food, children, ticketed (save the section)', group: 'context' })
  } else if (row.has_competing_vendors && !(row.competing_food_options || '').trim()) {
    missing.push({ key: 'competing_food_options', label: 'Other food at venue — you said other vendors will be there; say what', group: 'context' })
  }

  if (row.background_check_required !== true && row.background_check_required !== false) {
    missing.push({ key: 'background_check', label: 'Do you require background checks for vendors?', group: 'logistics' })
  } else if (row.background_check_required && !(row.background_check_details || '').trim()) {
    missing.push({ key: 'background_check_details', label: 'Background check process & cost', group: 'logistics' })
  }
  if (!row.logistics_confirmed_at) {
    missing.push({ key: 'risk_factors', label: 'Anything That Could Make Vendors Reconsider? (save the Logistics section — "none" counts)', group: 'logistics' })
  }

  return missing
}

export function invitationDetailsComplete(row: InvitationGateRow): boolean {
  return missingInvitationDetails(row).length === 0
}
