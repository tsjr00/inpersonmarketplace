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
 * The four truck/vendor-facing platform clauses, every business agrees to them
 * when booking. Brand name is filled per vertical; wording is otherwise neutral
 * so it reads for both a food truck and a farmers-market vendor.
 */
export function getTruckPlatformClauses(vertical: string): PlatformClause[] {
  const brand = brandName(vertical)
  return [
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
  ]
}

/** The operator's own compliance-monitoring commitment (acknowledged, not booked). */
export function getOperatorComplianceClause(vertical: string): string {
  const place = vertical === 'food_trucks' ? 'park' : 'market'
  return `As the operator, I'll monitor whether the businesses at my ${place} are following these platform rules, and I'll address issues and take action as needed.`
}
