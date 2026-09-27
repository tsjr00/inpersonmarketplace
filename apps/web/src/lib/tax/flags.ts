/**
 * Per-stream tax rollout flags (sales_tax_readiness.md III.4: "ship dark
 * behind per-stream flags; go-live = flag flip on the chosen date").
 *
 * Same kill-switch pattern as TRIAL_SYSTEM_ENABLED (vendor-limits.ts): the
 * PRODUCTION switch is a code constant, not an env var — flipping it is a
 * reviewed, committed, deployed change, never a config drift between
 * environments.
 *
 * ⛔ TAX_STREAM1_PROD must stay false until ALL of:
 *   1. Quarterly rate-refresh job exists (Batch 4) — the seam's freshness
 *      guardrail HALTS taxable sales at every quarter-turn without it. ✅ 2026-09-25
 *   2. Refund-path tax reversals shipped (Batch 3). ✅ 2026-09-26
 *   3. Event order route (/api/events/[token]/order) wired through the seam —
 *      it creates orders outside checkout/session and would sell untaxed.
 *   4. Jurisdiction codes entered + verified for every live market (III.7),
 *      registration effective date reached (III.4 — never collect early).
 *   5. The W13 rehearsal month passed on Staging (docs/testing/TEST_PROTOCOL_open_items.md).
 *
 * STAGING REHEARSAL (owner 2026-09-26, option b): tax can be switched on for a
 * NON-production Vercel environment with the env var TAX_STREAM1_STAGING=true
 * (set in the Vercel dashboard for Preview; unset it to end the rehearsal).
 * Production ignores that variable by construction — VERCEL_ENV === 'production'
 * short-circuits the override — so no flip ever has to sit on `main` while
 * Prod is owed a push. Pinned by flow-integrity ("Sales tax Batch 2").
 */

/** Stream 1 — facilitated product sales: the PRODUCTION switch. */
export const TAX_STREAM1_PROD = false

/** Non-production rehearsal override — can never be true on production. */
export const TAX_STREAM1_STAGING_OVERRIDE =
  process.env.VERCEL_ENV !== 'production' && process.env.TAX_STREAM1_STAGING === 'true'

/** Stream 1 — what the checkout engine reads (checkout-tax.ts is the ONE gate). */
export const TAX_STREAM1_ENABLED = TAX_STREAM1_PROD || TAX_STREAM1_STAGING_OVERRIDE
