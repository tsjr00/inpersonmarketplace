/**
 * Platform agreement clauses — tester finding F6 (2026-07-24, owner-approved).
 *
 * A fixed set of platform commitments that ride on EVERY market/park agreement,
 * on top of whatever opt-in statements the operator selects. Two audiences:
 *
 *  - Truck/vendor-facing (4 clauses): auto-included in every agreement, so
 *    every business accepts them when they book. Injected into the acceptance
 *    snapshot (book-park-spot + join) and shown in MarketAgreementBlock.
 *
 *  - Operator-facing (1 clause): the operator's own commitment to monitor and
 *    enforce compliance. Shown read-only in the agreement editor (OptinManager)
 *    and acknowledged with a checkbox before they can save.
 *
 * Single source of truth so the editor, the vendor display, and the acceptance
 * record can never drift. Synthetic statement_ids use the `_platform_` prefix
 * (matches the existing `_meta` synthetic-statement convention in the booking
 * routes) so they're distinguishable from catalog statements.
 */

import { defaultBranding } from '@/lib/branding/defaults'

export interface PlatformClause {
  statement_id: string
  text: string
}

const PLATFORM_CATEGORY = '_platform'
const PLATFORM_CATEGORY_LABEL = 'Platform requirements'

export { PLATFORM_CATEGORY, PLATFORM_CATEGORY_LABEL }

function brandName(vertical: string): string {
  return defaultBranding[vertical]?.brand_name ?? 'the platform'
}

/**
 * The truck/vendor-facing platform clauses — every business agrees to them when
 * booking. Brand name is filled per vertical; wording is otherwise neutral so it
 * reads for both a food truck and a farmers-market vendor.
 *
 * Food trucks additionally get `_platform_vendor_space` (see below): a
 * characterization clause, not a behavioral one. Texas presumes a "rental or
 * lease of a parking facility" is TAXABLE (34 TAC 3.315(h)), but 3.315(h)(1)
 * excludes space rented for a purpose OTHER than parking — its own example is a
 * flea market — provided the lessor "receives and retains documentation clearly
 * describing the nontaxable activity." This clause IS that documentation: the
 * vendor's accepted agreement records that the space is vending space, not
 * motor-vehicle parking or storage. Booth fees at markets are already
 * nontaxable (Pub. 96-211), so FM needs no equivalent.
 *
 * ⚠️ Substance controls, not the label. This clause only holds if the facts
 * match it — no overnight occupancy, no unattended storage, access tied to
 * service hours. If an operator starts permitting overnight parking, the
 * characterization fails regardless of wording. See `.claude/sales_tax_readiness.md`.
 */
export function getTruckPlatformClauses(vertical: string): PlatformClause[] {
  const brand = brandName(vertical)
  const isFoodTrucks = vertical === 'food_trucks'
  return [
    ...(isFoodTrucks
      ? [{
          statement_id: '_platform_vendor_space',
          text: `I understand I'm booking vendor space to sell from during posted service hours — not a parking space. I won't stay overnight, leave my truck or equipment stored on site, or use the space for anything other than serving customers.`,
        }]
      : []),
    {
      statement_id: '_platform_good_standing',
      text: `I'll keep my ${brand} profile active and in good standing for as long as I operate here.`,
    },
    {
      statement_id: '_platform_prepay',
      text: `I'll familiarize myself with how ${brand} works and accept the pre-paid orders customers place through the app.`,
    },
    {
      statement_id: '_platform_skip_line',
      text: `I'll honor the "Skip the Line" benefit — when a customer pre-pays through the app and arrives on time, I'll have their order ready so they don't wait in the regular line.`,
    },
    {
      statement_id: '_platform_pickup_sign',
      text: `I'll keep the ${brand} pickup sign posted near my service window so app customers can easily find where to collect their order.`,
    },
    // Owner 2026-08-15, prompted by event-organizer feedback: markets and
    // events regularly happen at schools, churches, and daycares. The full
    // formal version lives in the vendor service agreement ("Child-Safety
    // Legal Compliance"); this is the same commitment in the vendor's voice,
    // acknowledged on every agreement. Language is Claude-drafted pending the
    // owner's attorney review — update BOTH surfaces together if it changes.
    {
      statement_id: '_platform_child_safety',
      text: `If I or anyone on my team is subject to a legal prohibition or restriction against being at or near schools, churches, daycares, playgrounds, or other places where children gather or are likely to gather (including from sex-offender registration or any similar status, court order, or condition of supervision), it is my responsibility — not the platform's — to ensure that person is not present at any market, event, or location arranged through the platform where that prohibition applies. I accept this responsibility in full, and I agree to cooperate fully with any action the platform takes and any disclosure the platform must make if a violation of this policy is brought to its attention.`,
    },
  ]
}

/** The operator's own compliance-monitoring commitment (acknowledged, not booked). */
export function getOperatorComplianceClause(vertical: string): string {
  const place = vertical === 'food_trucks' ? 'park' : 'market'
  return `As the operator, I'll monitor whether the businesses at my ${place} are following these platform rules, and I'll address issues and take action as needed.`
}
