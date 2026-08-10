/**
 * REFUSAL REGISTRY — every rule that can tell a user "no".
 *
 * WHY THIS FILE EXISTS
 *
 * On 2026-08-09 we found multi-market checkout had been dead in production for
 * three weeks with 1911 tests green. The rule that killed it had sat inert for
 * six months, so it could never fail a test, and the capability it broke had no
 * test of its own. Nothing counted refusals, so nobody could see a rule go from
 * "never fires" to "fires daily".
 *
 * Counting alone is not enough. Without a declared list you cannot tell a rule
 * that NEVER FIRED from a rule that DOES NOT EXIST — and "never fired" is the
 * interesting signal. This file is that list.
 *
 * WHAT A KEY IS
 *
 * A key identifies a RULE, not an error code. Codes are reused: ERR_CHECKOUT_001
 * appears at twelve sites and means only "some validation failed". Attach
 * `errorCode` ONLY when that code means this one rule and nothing else.
 *
 * ⚠ NEVER RENAME A KEY. A rename silently resets that rule's recorded history to
 * "never fired" — which is precisely the blindness this exists to remove. Retire
 * it in RETIRED_RULES and add a new key instead.
 *
 * HOW TO ADD ONE
 *
 * Add the entry here, then either attach `errorCode` (thrown refusals record
 * themselves — see with-error-tracing.ts) or call `recordRefusal(key, ctx)` at
 * the site (for refusals that return a warning instead of throwing). Refusals
 * that only WARN are the dangerous kind: they are invisible in error_logs, and
 * that is the kind that broke us.
 *
 * ⚠ DO NOT register rate-limit refusals. A bot would write unbounded rows, and
 * the limiter already counts them itself.
 *
 * This list is deliberately incomplete. It starts on the cart and checkout money
 * path and grows as sites are wired. Only rules whose behaviour has actually
 * been READ belong here — a guessed description is worse than an absent one.
 */

export interface RefusalRule {
  /** Stable identity. Never rename — see the warning above. */
  key: string
  /** What the user is refused, in the user's terms. */
  description: string
  /** Where it is enforced. Kept current so the registry is a real inventory. */
  where: string
  /**
   * Set ONLY when this thrown code means this rule and nothing else. Generic
   * codes (ERR_CHECKOUT_001) must not be mapped — they would attribute a dozen
   * unrelated refusals to one rule.
   */
  errorCode?: string
  /** The decision behind the rule, and when. Absent = never recorded (suspect). */
  decided?: string
}

export const REFUSAL_RULES: readonly RefusalRule[] = [
  // ── Cart assembly ────────────────────────────────────────────────────────
  {
    key: 'cart.event_isolation',
    description:
      'An event item cannot be added to a cart that already holds an item from a different market (or vice versa).',
    where: 'app/api/cart/items/route.ts (listing + market-box paths)',
    errorCode: 'ERR_CART_010',
    decided:
      '2026-08-09 (owner): events stay isolated because events/[token]/cancel refunds the WHOLE payment intent — one order spanning two events would refund both.',
  },
  {
    key: 'cart.inventory_insufficient',
    description: 'Not enough stock for the requested quantity.',
    where: 'app/api/cart/items/route.ts',
    errorCode: 'ERR_CART_002',
  },

  // ── Pre-checkout validation (cart/validate GET) ──────────────────────────
  //
  // These RETURN A WARNING rather than throwing, so they never reach
  // error_logs. They are the reason this whole system exists.
  {
    key: 'cart.event_isolation_checkout',
    description:
      'Pre-checkout backstop: an event sharing a cart with any other market. Should be near-zero — cart/items refuses this earlier and harder. A rising count here means carts are being assembled by some path that bypasses the add-time guard.',
    where: 'app/api/cart/validate/route.ts (GET)',
    decided: '2026-08-09 (owner): same rule as cart.event_isolation.',
  },
  {
    key: 'cart.cutoff_passed',
    description:
      'Ordering has closed for an item — the vendor is preparing for market day, or the private-pickup prep window has passed.',
    where: 'app/api/cart/validate/route.ts (GET), via get_listings_accepting_status',
  },
  {
    key: 'cart.listing_no_markets',
    description:
      'An item in the cart is not available at any market. Should be rare; a rising count suggests vendors are detaching listings from markets while they sit in carts.',
    where: 'app/api/cart/validate/route.ts (GET)',
  },
  {
    key: 'cart.validate_failed_closed',
    description:
      'Cart validation could not run and refused rather than guessing. NOT a business rule — a health signal. Any sustained count here is an incident: buyers are being blocked from checking out by an infrastructure fault.',
    where: 'app/api/cart/validate/route.ts (GET), the fail-closed branch',
    decided:
      '2026-07-12 (f4b2700c, CHK-3): this branch previously failed OPEN — the query errored and validation silently always passed.',
  },

  // ── Checkout ─────────────────────────────────────────────────────────────
  {
    key: 'checkout.pickup_slot_unavailable',
    description:
      'The chosen pickup time is full, or is no longer a real slot for that vendor on that day.',
    where: 'app/api/checkout/session/route.ts (FT day-to-day only)',
    errorCode: 'ERR_CHECKOUT_SLOT',
    decided:
      'mig 216: inert until a vendor sets a cap — the RPCs return allowed=true when both caps are NULL, which is every truck today. A nonzero count here means a vendor has opted in.',
  },
  {
    key: 'checkout.tip_without_percentage',
    description:
      'A tip amount arrived with no percentage, which would have routed the entire tip to the platform and paid the vendor nothing.',
    where: 'app/api/checkout/session/route.ts',
    errorCode: 'ERR_CHECKOUT_TIP_NO_PCT',
    decided: '2026-07-20 (0cdda987, S1-4).',
  },
] as const

/**
 * RETIRED RULES — removed on purpose. Recorded so nobody "restores" one.
 *
 * This section is the direct answer to how the July regression happened: a rule
 * was contradicted by a later feature but never deleted, and six months on it
 * came back to life. A rule that is retired must say so, in writing, with the
 * reason.
 */
export const RETIRED_RULES: readonly {
  key: string
  description: string
  retired: string
  why: string
}[] = [
  {
    key: 'cart.same_market_traditional',
    description: 'Refused a cart holding items from two different traditional markets.',
    retired: '2026-08-09',
    why:
      'Never a decision. Written on day eleven (c585da5c, 2026-01-14) inside a commit about an unrelated API-path bug, with no recorded rationale, and contradicted ten days later by the multi-location checkout (bb865e30). Inert behind a fail-open bug until 2026-07-12, then began firing on 2026-07-20 and killed multi-market checkout in production. The owner confirmed spanning is intended: a morning market and an evening market in one city is a real order.',
  },
  {
    key: 'cart.mixed_pickup_types',
    description:
      'Refused a cart mixing pickup types — e.g. a traditional market item plus a vendor private pickup.',
    retired: '2026-08-09',
    why:
      'Same origin and same fate as cart.same_market_traditional. The owner confirmed a market pickup plus a private pickup is one legitimate order; the checkout acknowledgment notice was already built to render both. Event isolation, the one case that must not mix, is kept and is enforced at add time.',
  },
] as const

/** Fast membership test for the hot path. */
export const REFUSAL_KEYS: ReadonlySet<string> = new Set(REFUSAL_RULES.map((r) => r.key))

/**
 * Thrown-code -> rule key. The hook in with-error-tracing.ts does one lookup in
 * this map and does nothing at all when the code is absent, which is the
 * overwhelming majority of errors.
 */
export const REFUSAL_BY_ERROR_CODE: ReadonlyMap<string, string> = new Map(
  REFUSAL_RULES.filter((r) => r.errorCode).map((r) => [r.errorCode as string, r.key])
)
