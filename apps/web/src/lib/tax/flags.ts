/**
 * Per-stream tax rollout flags (sales_tax_readiness.md III.4: "ship dark
 * behind per-stream flags; go-live = flag flip on the chosen date").
 *
 * Same kill-switch pattern as TRIAL_SYSTEM_ENABLED (vendor-limits.ts): a code
 * constant, not an env var — flipping it is a reviewed, committed, deployed
 * change, never a config drift between environments.
 *
 * ⛔ TAX_STREAM1_ENABLED must stay false until ALL of:
 *   1. Quarterly rate-refresh job exists (Batch 4) — the seam's freshness
 *      guardrail HALTS taxable sales at every quarter-turn without it.
 *   2. Refund-path tax reversals shipped (Batch 3).
 *   3. Event order route (/api/events/[token]/order) wired through the seam —
 *      it creates orders outside checkout/session and would sell untaxed.
 *   4. Jurisdiction codes entered + verified for every live market (III.7),
 *      registration effective date reached (III.4 — never collect early).
 */

/** Stream 1 — facilitated product sales (checkout tax line + snapshot). */
export const TAX_STREAM1_ENABLED = false
