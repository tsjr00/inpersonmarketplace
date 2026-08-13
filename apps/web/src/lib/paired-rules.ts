/**
 * PAIRED-SURFACE RULE REGISTRY
 *
 * A paired-surface rule is one rule enforced in MORE THAN ONE place, where the
 * places can be edited independently and drift between them is SILENT — no
 * type error, no runtime failure, no existing test. That drift is the single
 * dominant defect pattern of 2026-08 (backlog.md → "PAIRED-SURFACE TESTS"):
 *
 *   - the token generator changed alphabet; the shop guard didn't follow
 *     (T-01 — every event shop link 404'd for two months)
 *   - cart/items allowed multi-market carts; cart/validate forbade them
 *     (multi-market checkout dead in PRODUCTION for three weeks, 1911 tests green)
 *   - the identity-protection policy lived in one route's comment; three other
 *     surfaces never learned it (T-09, T-67, T-75)
 *   - the matching inputs existed in three copies until 2026-08-13 (T-64)
 *
 * HOW IT WORKS (modelled on codebase-map-coverage.test.ts):
 *   1. Every participating site carries a comment tag: `@paired-rule <key>`.
 *      The tag is the warning the next editor actually sees.
 *   2. Every key is registered here, with the rule stated in one line, which
 *      surface is authoritative, why drift is silent, and — crucially — the
 *      BEHAVIOURAL test that pins the surfaces to each other.
 *   3. `paired-rules-coverage.test.ts` (pre-commit) fails the commit when a
 *      tag has no registry entry, a rule has fewer than two tagged sites, or
 *      a rule's named behavioural test cannot be found. Registration without
 *      a behavioural test is decoration — the pointer is what proves the pair
 *      is actually pinned.
 *
 * BEFORE ADDING AN ENTRY — collapse first (owner principle, 2026-08-11):
 * "The best paired-surface test is the one you don't need, because there is
 * only one surface." A registry entry is permanent maintenance cost; deleting
 * a duplicate is free forever. Register only what genuinely cannot share one
 * implementation — chiefly app ↔ SQL pairs, per-viewer policy applied at
 * multiple API layers, and display ↔ submit pairs inside client components.
 *
 * REMOVING AN ENTRY requires removing its tags in the same commit (the
 * coverage test enforces it) — which means the diff SHOWS the rule being
 * de-registered. A rule cannot silently stop being protected.
 */

export interface PairedRule {
  /** Stable kebab-case key. NEVER rename — the tags in code reference it. */
  key: string
  /** The rule, stated once, in one sentence. */
  rule: string
  /** Which surface wins when the pair disagrees. */
  authoritative: string
  /** Why drift between the surfaces produces no error anywhere. */
  whyDriftIsSilent: string
  /**
   * The behavioural test that pins the surfaces together.
   * `marker` must appear verbatim in `file` — the coverage test verifies it,
   * so a renamed or deleted behavioural test breaks the build instead of
   * leaving a registry entry pointing at nothing.
   */
  behaviouralTest: { file: string; marker: string }
}

export const PAIRED_RULES: PairedRule[] = [
  {
    key: 'multi-market-cart',
    rule: 'A cart may span multiple traditional/private-pickup markets; only EVENT items must be ordered alone.',
    authoritative: 'api/cart/items (what the cart accepts) — validate must agree with what items allowed in',
    whyDriftIsSilent:
      'Two routes, edited independently; validate runs at checkout, long after items were accepted. ' +
      'Disagreement killed multi-market checkout in production for three weeks with 1911 tests green.',
    behaviouralTest: { file: 'src/lib/__tests__/flow-integrity.test.ts', marker: 'Multi-location cart rule' },
  },
  {
    key: 'event-token-format',
    rule: 'The shop-page token guard must accept every token the generator can mint (base64url: A-Za-z0-9_-).',
    authoritative: 'lib/events/event-actions.ts (the generator defines the alphabet)',
    whyDriftIsSilent:
      'The guard rejects with a 404 identical to a genuinely bad token. A security fix widened the ' +
      'alphabet and every event shop link 404’d for two months (T-01) before anyone connected the two files.',
    behaviouralTest: { file: 'src/lib/__tests__/flow-integrity.test.ts', marker: 'Event token format' },
  },
  {
    key: 'organizer-identity',
    rule: 'A vendor never sees an organizer’s identity (company name, market name built from it, street address) until they ACCEPT the invitation; public events are exempt.',
    authoritative: 'api/vendor/events/[marketId] (the invitation route — where the policy is documented and hasAccepted is defined)',
    whyDriftIsSilent:
      'The policy is per-viewer masking applied independently at each API surface. A surface that predates ' +
      'the policy (market-stats, T-09) or a new field nobody masked (the market NAME, T-75) leaks with no error.',
    behaviouralTest: { file: 'src/lib/__tests__/flow-integrity.test.ts', marker: 'Organizer identity protection' },
  },
  {
    key: 'event-sells-on-acceptance',
    rule: 'An event listing sells iff the vendor has an ACCEPTED market_vendors row — acceptance is recorded ONCE, never mirrored into vendor_market_schedules.',
    authoritative: 'the newest SQL definer of get_available_pickup_dates (found by migration NUMBER, not file date)',
    whyDriftIsSilent:
      'App ↔ SQL pair: TypeScript cannot see the function body. The respond route writing a vms row ' +
      '"to be safe" would create a second source of attendance truth that drifts on cancellation — the ' +
      'exact rejected design that mig 223’s header documents.',
    behaviouralTest: {
      file: 'src/lib/__tests__/flow-integrity.test.ts',
      marker: 'the NEWEST definition of get_available_pickup_dates keeps the event acceptance branch',
    },
  },
  {
    key: 'capacity-seeding',
    rule: 'The capacity number a vendor SEES on the event invitation and the number the form SUBMITS come from the same computation.',
    authoritative: 'the shared calculateWaveCount + loader seed (display is a view of the submitted value, never a parallel computation)',
    whyDriftIsSilent:
      'Display and submit lived in the same file but had separate sources; the render fell back to the ' +
      'profile number so the vendor SAW a value the submit handler never sent (T-03 — accepting with the ' +
      'default capacity was impossible and looked like a server bug).',
    behaviouralTest: { file: 'src/lib/__tests__/flow-integrity.test.ts', marker: 'Vendor event capacity seeding' },
  },
  {
    key: 'market-visibility',
    rule: 'A traditional market is buyer-visible iff ≥1 vendor has BOTH a published non-deleted listing there AND an active schedule row — intersected on the SAME vendor.',
    authoritative: 'lib/markets/visible-markets.ts getFullyOnboardedMarketIds (what buyer search actually applies)',
    whyDriftIsSilent:
      'Two hand-kept implementations by design (batch for search, per-market for the manager card that ' +
      'explains WHY a market is hidden). If they drift, the manager is told a different rule than the one ' +
      'hiding their market — a wrong explanation is worse than none, and nothing errors. Registered from ' +
      'the retrospective lens 2026-08-13: this is the first pre-existing pair pinned BEFORE it broke.',
    behaviouralTest: { file: 'src/lib/__tests__/flow-integrity.test.ts', marker: 'Market visibility rule' },
  },
  {
    key: 'matching-inputs',
    rule: 'Every surface that scores a vendor against an event feeds scoreVendorMatch the vendor’s REAL readiness — no defaults standing in for missing data (readiness is a hard gate, T-70).',
    authoritative: 'lib/events/event-actions.ts autoMatchAndInvite (the engine that actually invites)',
    whyDriftIsSilent:
      'The scorer accepts whatever inputs it is handed. The admin preview hardcoded 30/wave + 6hr for ' +
      'months (T-64) and rendered scores the engine never produced — plausible numbers, no error, just wrong.',
    behaviouralTest: { file: 'src/lib/__tests__/flow-integrity.test.ts', marker: 'Matching readiness integrity' },
  },
]
