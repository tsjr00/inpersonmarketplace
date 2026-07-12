# Known / Decided / Out-of-Scope (read before reporting)

Purpose: stop the review from re-reporting things that are **intentional**, **already
known**, or **inactive**. If a finding matches something here, don't file it (or file it
only if you have NEW evidence the decision is being violated). Sources: `.claude/decisions.md`,
`.claude/backlog.md`, `CLAUDE_CONTEXT.md`. Cite those for the authority behind each item.

## Do NOT report as bugs/gaps — these are intentional (see `decisions.md`)
- **External payments are INACTIVE.** `EXTERNAL_PAYMENTS_ENABLED=false` (`src/lib/constants.ts:12`, verified); all Venmo/CashApp/PayPal/Cash UI hidden, backend preserved but dormant (pending tax resolution). Do NOT flag external-payment code as a gap, dead code, or security hole — it's deliberately parked and **hook-protected** (`protected-paths.txt`). Out of scope entirely.
- **Sales tax is NOT wired yet.** TaxCloud integration is pending (TX Comptroller registration in progress). Do NOT report "platform collects no sales tax" as a finding — it's a known, tracked gap with a plan (`sales_tax_readiness.md`, `decisions.md` 2026-04-17).
- **Market-box / chef-box subscriptions have NO cancellation, BY DESIGN.** Buyer prepays 4/8-week term; no in-platform cancel/refund; missed pickup = no refund. `cancelled_at`/'cancelled' status reserved but intentionally unused. Not a bug.
- **Park prepay-week $0.15 flat fee is charged per-DAY** (per booking row), matching FM season booking. Intentional (`decisions.md` 2026-07-02). Not "double charging."
- **Park spots use one flat daily rate** (no weekend premium / per-DOW pricing) — deferred feature, not a gap.
- **`market_seasons.status='ended'` is reserved-not-wired** — an intentional earmark for the make-up/extend feature, not dead code (`decisions.md` 2026-06-28).
- **Booth rentals are Stripe-only** (no offline fallback); if a manager hasn't done Stripe Connect, the booking form is intentionally hidden. Not a missing feature.
- **Composable roles never merge** — do NOT propose a unified "venue/host identity" or org/staff layer; explicitly rejected (`decisions.md` 2026-06-12).
- **Server components not fetching their own API routes** is a deliberate rule (Vercel SSO 401). If you see logic extracted to `src/lib/**` instead of an internal fetch, that's correct.
- **One number, no fee breakdown** on pre-Stripe screens is a locked UX convention (`decisions.md` 2026-05-19). Not an omission.
- **`zip_codes` table is EMPTY** — the `?zip=` param path silently no-ops and the httpOnly location cookie is the real filter. Known; the cookie fallback is load-bearing (do NOT "simplify" it away).
- **Fee math is centralized** in `src/lib/pricing.ts` (6.5% + $0.15). Vendor/booth/event fee structures are all decided (`decisions.md` 2026-03-23 / 04-12 / 05-19). Don't re-litigate the numbers; do flag any code that hardcodes fees instead of using `pricing.ts`.

## Already known / in backlog — don't re-file (add evidence to backlog instead)
- **Timezone drift** (UTC "today" vs market-local date columns): the fix **shipped to staging** (prod pending). If you find a *remaining* unconverted site, that's useful — cite it; but the pattern + the money-path sites are already tracked in `backlog.md`.
- **Events gaps** G1/G3/G5 (fixed, staging), G2 organizer Stripe (unbuilt), G7 event-market manager persona (unbuilt), vendor-paid events (deferred) — all catalogued in `backlog.md` / `events_manager_crosspollination_research.md`.
- **Market-box biweekly `original_end_date` term-length mismatch** — open product decision, already in `backlog.md`.
- **`get_listings_accepting_status` RPC is heavy** (per-listing lateral join on browse) — known ceiling, 3 fix options analyzed + deferred (`PERFORMANCE_BASELINE.md`). Re-flag only with a concrete measured improvement.
- **`'cancelled'` admin status side-bug** (admin `validStatuses` lists it but DB CHECK doesn't) — known, in `backlog.md`.

## Known deploy / environment state (not code bugs)
- **Prod is behind staging.** Migrations **184→189** are on Dev+Staging, **prod-pending**; a batch of feature commits (Events Tier-1, tz fix, FT-port) sits on staging awaiting the combined prod push. Don't report "feature X missing in prod" — it's a pending deploy.
- **Local Dev DB has drift** — missing migrations 039/040, so `markets.event_end_date` doesn't exist locally (browse/availability errors in local logs). Staging/prod are correct. Not a code bug.
- **Structured tables in `SCHEMA_SNAPSHOT.md` are STALE** (since 2026-04-24) but the Change Log is current. Verify columns via `information_schema` if a claim depends on exact structure.

## Scope guidance for this review series
- **Goal:** gaps, conflicts, and efficiency/cost savings before public re-release.
- **In scope:** correctness bugs, security (authz/RLS/IDOR), money-path errors, data integrity, cross-file contract breaks, and **cost/efficiency** (API calls, query counts, token/LLM spend) — see `COST_EFFICIENCY_ANCHORS.md`.
- **Out of scope:** the intentional-decisions above; the inactive external-payments subsystem; pure style/naming nits (unless they cause a real bug); anything already resolved in `decisions.md`/`backlog.md` without new evidence.
