// ============================================================================
// DEPRECATED TOMBSTONE — returns HTTP 410. KEEP, DO NOT DELETE.
// ============================================================================
// As of 2026-04-16 this route was not called by any UI in the app, and a
// repo-wide search on 2026-09-12 confirmed nothing references it or consumes
// its output. The active handoff flow is /api/vendor/orders/[id]/fulfill,
// which supports both buyer-first and vendor-first ordering.
//
// WHY THE BODY WAS REMOVED (finding VOR-7, closed 2026-09-12):
// The live implementation had no payment proof before paying a vendor — it
// never checked for a succeeded `payments` row — and it fired the Stripe
// transfer WITHOUT source_transaction, so the money would have come from the
// platform's own balance (the Session-74 incident pattern). It was harmless
// only by accident: its vendor_payouts insert ran on the user client and
// `vendor_payouts` has no INSERT policy, so RLS refused the insert and the
// route threw before reaching the transfer. One added policy, or one switch to
// a service client, would have turned a dormant route into an unguarded payout
// path. A deployed, authenticated endpoint that pays vendors on request is not
// something to leave lying around for a product decision that may never come.
//
// THE STRICT BUYER-FIRST RULE IT ENFORCED (the part worth keeping):
// the vendor could not counter-confirm until `order_items.buyer_confirmed_at`
// was set, i.e. mandatory buyer-first acknowledgment, in contrast to fulfill's
// either-order handoff. If that product decision is ever made, implement it as
// a guard inside fulfill rather than as a second payout route: fulfill already
// carries the paid gate, the charge id, the atomic fee claim and the
// double-payout guard that this file would have to duplicate correctly.
//
// Mirrors ./confirm-cash-complete/route.ts, the other deprecated tombstone.
// ============================================================================

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    error: 'This endpoint is deprecated. Vendor handoff runs through the standard confirm → ready → fulfill flow.',
    code: 'ENDPOINT_DEPRECATED'
  }, { status: 410 })
}
