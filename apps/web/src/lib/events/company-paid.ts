/**
 * Company-paid ("our company pays for everyone") event ordering — the ONE switch.
 *
 * OFF (owner 2026-10-03) until the host-paid events build
 * (apps/web/.claude/host_paid_events_design.md). Same kill-switch pattern as
 * TRIAL_SYSTEM_ENABLED (vendor-limits.ts) and TAX_STREAM1_PROD (tax/flags.ts):
 * a code constant, so turning it on is a reviewed, committed, deployed change.
 *
 * Why it is off: the company-paid order route creates orders OUTSIDE
 * /api/checkout/session, so nothing it sold would carry sales tax — and the
 * path was never executable anyway (the shop does not send the access code the
 * route demands; `create_company_paid_order` writes columns `orders` does not
 * have). Rather than leave a dead path that fails with a generic error, the
 * app says so plainly and stops offering it.
 *
 * While false:
 *  - POST /api/events/[token]/order refuses before it touches the database;
 *  - POST /api/event-requests stores no company-paid or hybrid event (the
 *    request is saved with no payment model, which the shop reads as
 *    "each person pays for themselves");
 *  - the event request form offers only "Each person pays for themselves".
 *
 * ⛔ Before setting this to true: the order route must go through the tax
 * engine (lib/tax/checkout-tax.ts) and the RPC must be rewritten against the
 * real schema — tax/flags.ts condition 3. Pinned by flow-integrity
 * ("Company-paid event ordering is switched off").
 */
export const COMPANY_PAID_ORDERING_ENABLED: boolean = false

/** What an attendee is told if they reach the company-paid order route while it is off. */
export const COMPANY_PAID_UNAVAILABLE_MESSAGE =
  'Company-paid ordering is not available yet. You can still order from the event menu and pay at checkout.'
