# Session 75 — End-to-End Codebase Audit

**Date:** 2026-04-28
**Scope:** Auth → onboarding → browse → cart → checkout → fulfillment → payouts → notifications → admin. Both verticals (FM + FT). Read-only — no edits made.
**Mode:** Report. Per `.claude/rules/cite-or-verify.md`, every claim is tagged with how it was confirmed.

---

## How findings are tagged

- **VERIFIED**: I read the file at the cited line and confirmed the behavior.
- **AGENT-VERIFIED**: A research agent reported it; I did not re-read. Treat as a strong lead, not a confirmed fact.
- **ALREADY-IN-BACKLOG**: This was already known and tracked at `apps/web/.claude/backlog.md`. Listed for visibility only.

## Test signal (baseline)

`npx vitest run` — **51 files / 1478 tests pass, 0 fail.** No regressions in business-rule, refund-consistency, tip-rules, cancellation-fee, or inventory-restore tests. Test coverage of cross-file contracts (auth/api/RPC) is thinner — most failures here would surface only at runtime.

## Out of scope (acknowledged)

- Did not run Playwright / browser tests.
- Did not query the live database — relied on schema snapshot + Session 74's verified phantom-column list.
- Did not deeply audit browse, fulfillment-mode UI, or RLS policy SQL — backlog suggests those areas have been recently exercised; sampled only.
- Uncommitted edits to `admins/page.tsx`, `error-logs/page.tsx`, `AdminMobileRow.tsx` reviewed as-is per current_task.md.

---

# P0 — Active production bugs that prevent users from completing the flow

## P0-1: Buyer cannot view event order pick-ticket / QR after paying
**Status:** VERIFIED
**Cite:** `src/app/api/events/[token]/my-order/route.ts:43-51`
**What:** GET handler queries `.from('orders').eq('market_id', event.market_id)`. The `orders` table does **not** have a `market_id` column on the live database (Session 74 confirmed via `information_schema.columns`; backlog item "4 phantom `orders` columns"). The PostgREST query against a non-existent column returns no rows; route returns `404 No order found for this event`.
**User impact:** Every buyer who pays for an event order and then opens the "My Order" page (used at the venue to show pick-ticket + QR code to vendors) sees a 404. Same Session 74 bug pattern that broke `events/[token]/cancel/route.ts` and `admin/events/[id]/route.ts` — those two were fixed; this third instance was missed.
**Fix shape:** Resolve order IDs through `order_items.market_id` (the working pattern at `events/[token]/cancel/route.ts:116` after the Session 74 fix), then SELECT from `orders` by id. ~5-line change.
**Why P0:** Live, breaks a flow buyers actually use, no workaround.

## P0-2: Phase 5 cron payout retry omits `source_transaction` (vendor payouts can stick)
**Status:** VERIFIED + ALREADY-IN-BACKLOG
**Cite:** `src/app/api/cron/expire-orders/route.ts:1089-1094`
**What:** The order-side Phase 5 retry calls `transferToVendor({ amount, destination, orderId, orderItemId })` with **no** `sourceTransaction`. Compare to `payments.ts:88-118` — the function accepts `sourceTransaction` and Stripe needs it to tie the transfer to a settled charge, otherwise it can fail with `balance_insufficient` for funds that haven't cleared.
**User impact:** Same root cause as Session 74's $16.01 stuck payout. Vendor money sits in `processing` status indefinitely on retry; cron will keep retrying and keep failing.
**Fix shape:** Look up `charge_id` via `payments.stripe_payment_intent_id` for the payout's `order_item.order_id`, pass it as `sourceTransaction`. Inline `fulfill` route (`121b3d5e`) already shows the pattern. **CRITICAL-PATH** — `lib/stripe/payments.ts` is on the protected list, so the actual fix happens in `expire-orders/route.ts` (also critical) — needs explicit per-file approval.
**Why P0:** Backlog tagged this Priority 0.5 but it's silently keeping vendor money in limbo; counts as P0 for vendor trust.

## P0-3: Stripe-paid event orders are not refunded on event cancellation
**Status:** ALREADY-IN-BACKLOG
**Cite:** `events_comprehensive_todo.md` T0-2 step 3, plus current state of `events/[token]/cancel/route.ts` and `lib/stripe/payments.ts` (CRITICAL-PATH).
**What:** Session 74 fixed the buyer-notify + order-cancel branch. The third step from the original design (auto-refund Stripe charges or flag for manual admin review) was never shipped. Buyers see "cancelled" status but no money returned without admin action.
**User impact:** Real money. Buyer pays → organizer cancels → buyer charged but order cancelled. Trust-killing.
**Fix shape:** Either auto-refund via Stripe API in the cancel routes, or write the orders into a `pending_refunds` queue admin can action. Critical-path file approval required.

---

# P1 — Active bugs / silent failure paths / data correctness gaps

## P1-1: Cart cross-event isolation is enforced for listings but NOT for market boxes
**Status:** VERIFIED (NEW)
**Cite:** Listing path enforces it at `src/app/api/cart/items/route.ts:203-227`. Market box path (`handleMarketBoxAdd`, lines 305-505) has **no equivalent check** before its `cart_items` INSERT at line 482.
**What:** A buyer can have a listing from a regular market in the cart, then add a market box subscription tied to a different (event or non-event) market without triggering the cross-market guard.
**User impact:** Cart can hold genuinely unrelated items (a regular-market listing + a market-box subscription tied to an event market, etc.). Checkout proceeds, but vendors and the buyer end up tangled across two events/contexts. Hard to detect; will show up as customer-support tickets blaming "wrong" subscriptions.
**Fix shape:** Repeat the lines-203-227 pattern inside `handleMarketBoxAdd` against `offering.pickup_market_id` before the insert. Or move the rule into the cart_items DB trigger Session 72 already plans (M1 backlog item).

## P1-2: `handleChargeDisputeCreated` doesn't dedupe admin notifications
**Status:** VERIFIED + ALREADY-IN-BACKLOG
**Cite:** `src/lib/stripe/webhooks.ts:1078-1088` — sends `charge_dispute_created` to every admin via `Promise.all` with no `wasNotificationSent` gate. Other handlers in the same file (`handleTransferCreated`, `handleChargeRefunded:1022`) use the dedup helper.
**User impact:** Every Stripe webhook retry on a chargeback fans out duplicate notifications to all admins. Notification noise; not monetary.
**Fix shape:** `if (await wasNotificationSent(supabase, admin.user_id, 'charge_dispute_created', dispute.id)) continue;` — 3 lines.

## P1-3: Vendor "new subscription" notification is generic — no buyer name or offering name
**Status:** VERIFIED — backlog wording was imprecise
**Cite:** `src/lib/stripe/market-box-payout.ts:139-143`
**What I read:** The vendor IS notified — but only with `payout_processed` carrying `{ amountCents }`. There is no separate "new market box subscription" notification with buyer/offering context. The `payout_processed` template (per `notifications/types.ts`) speaks to "$X is on the way" — not "Person Y subscribed to your Z box."
**User impact:** Vendor sees a payout ping but has to dig into the dashboard to learn who subscribed and to which offering. User confirmed on 2026-04-26 that the experience felt like "no notification fired."
**Fix shape:** Add a `new_market_box_subscription` notification type with templateData `{ offeringName, buyerName, termWeeks }` and fire it in `processMarketBoxPayout` BEFORE the payout notification, OR enrich `payout_processed` templateData with the same fields. Lower risk option: enrich, since it avoids template-type proliferation.

## P1-4: ~~`processMarketBoxPayout` catch-all logs only to `console.error`~~ — ALREADY FIXED
**Status:** VERIFIED FIXED (backlog item is stale)
**Cite:** `src/lib/stripe/market-box-payout.ts:144-151`
**What I read:** The outer catch-all DOES call `await logError(new TracedError('ERR_PAYOUT_004', ...))` with route, method, subscriptionId, and offeringId attached. The backlog item describing this as a "5-line fix needed" was written before this code shipped. The remaining `console.error` at line 119 is INSIDE the inner try block for transfer-specific failures, and the failure is recorded as `vendor_payouts.status='failed'` — that's a different concern (recoverable transfer failure vs. unhandled exception) and is acceptable.
**Action:** Remove this item from the Priority 0 — TOP OF NEXT SESSION cluster in `backlog.md`.

## P1-5: Market box refund on RPC failure DOES refund only the pre-fee subtotal — buyer is shorted
**Status:** VERIFIED — backlog is correct, cart-audit agent was wrong
**Cite (refund call sites):** `src/lib/stripe/webhooks.ts:227` (RPC-failure branch) and `:241` (at-capacity branch) both pass `mbItem.priceCents` to `createRefund`.
**Cite (what `priceCents` actually is):** `src/app/api/checkout/session/route.ts:700-721` — the metadata-build comment explicitly says: *"priceCents stores the vendor's stated term price (pre-fee). This is what calculateVendorPayout consumes downstream."* Lines 707-709 set `termPriceCents = mb.termWeeks === 8 ? offering.price_8week_cents : offering.price_4week_cents` — that's the vendor's number, not the gross charge.
**User impact:** When a market box checkout reaches the rejection branch (RPC failure or at-capacity), Stripe charges the buyer the gross amount (vendor price + 6.5% buyer fee + prorated $0.15 flat fee), but the code refunds only the vendor's price portion. The buyer fee + flat fee stays charged. For a $40 weekly box, that's roughly $40 + $2.60 + $0.15 = $42.75 charged but only $40 refunded — buyer eats $2.75 for a subscription they never got.
**Fix shape:** Either (a) refund without specifying amount so Stripe refunds the full original charge, or (b) compute the gross paid from `session.amount_total` allocated proportionally across market box items. Option (a) is safer when the order has only one market box item; option (b) is required for mixed orders. **CRITICAL-PATH file** (`webhooks.ts`) — needs explicit per-file approval.

## P1-6: Pre-existing lint error blocks a clean baseline (CI risk)
**Status:** VERIFIED + ALREADY-IN-BACKLOG
**Cite:** `src/components/events/OrganizerEventDetails.tsx:109-111`
**What I read:** `useEffect(() => { if (expanded && !details) loadDetails() }, [expanded])` with `// eslint-disable-line react-hooks/exhaustive-deps`. The function `loadDetails` calls `setLoading(true)` synchronously and later `setDetails(...)` + `setLoading(false)`. The lint rule that's flagged in CI per the backlog is `react-hooks/set-state-in-effect` — the exhaustive-deps disable doesn't suppress it. The `details` setter omitted from deps could also cause loops if not for the `!details` guard.
**Why it matters:** Lint-staged passes locally because it only checks staged files; CI runs full project lint. Any unrelated PR that touches this file will surface this and fail CI; meanwhile the underlying anti-pattern is real (cascading renders during state updates).
**Fix shape:** Wrap the conditional `loadDetails()` call in `queueMicrotask()`, or use `useMemo` to derive the loaded state. ~1-line change.

## P1-7: Listing publish gate enforcement — endpoint not located, behavior UNVERIFIED
**Status:** UNVERIFIED — I looked but couldn't conclusively find the publish handler
**What I checked:**
- `src/app/api/listings/route.ts` has only a GET handler (line 7). No POST.
- `src/app/api/listings/[id]/route.ts` has only a DELETE handler (line 8). No PATCH.
- `src/app/api/listings/[id]/availability/route.ts` is read-only.
- The vendor listing pages at `src/app/[vertical]/vendor/listings/...` exist but I didn't trace where their forms POST to. Likely server actions or a vendor-scoped endpoint I didn't surface.
**What IS verified:** `canPublishListings` is correctly computed at `src/app/api/vendor/onboarding/status/route.ts:220-224`. There IS a test (`src/lib/__tests__/vendor-onboarding.test.ts:33-58`) asserting the criteria. **Important finding from that test:** COI is NOT part of `canPublishListings` — it's a soft gate for listings (hard gate only for events). So the gate set is: `verification.status === 'approved' && allAuthorized && gate4.stripePayoutsEnabled`.
**Risk if not enforced:** A vendor without category authorization or without Stripe could publish listings; buyers could order; vendor can't fulfill or receive payment. Legal/compliance risk for unauthorized categories.
**Fix shape (if not enforced):** Add a `canPublishListings` check in the publish handler. ~5 lines.
**Action:** A 30-minute follow-up should locate the actual publish endpoint (probably a vendor-scoped server action or a route I missed). Worth doing before assuming this is a real bug — could equally be already-enforced and just not where I looked.

## P1-8: Schema snapshot has 4 phantom `orders` columns — and one (P0-1) is already biting code
**Status:** ALREADY-IN-BACKLOG. P0-1 above is a live consequence of this stale snapshot.
**Cite:** Backlog item "Regenerate `SCHEMA_SNAPSHOT.md` to remove 4 phantom orders columns".
**What:** Snapshot lists `orders.vendor_payout_cents`, `orders.buyer_fee_cents`, `orders.service_fee_cents`, `orders.market_id` — none exist on live. Session 74's grep found `market_id` had 4 active code references (since fixed); the other 3 had no active references at the time. But the snapshot lying about these columns means the next session that drafts new SQL will reference them and silently fail. P0-1 above slipped past Session 74's sweep precisely because there was no follow-up grep after the snapshot was reaffirmed.
**Fix shape:** User runs `supabase/REFRESH_SCHEMA.sql`, I rebuild structured tables in `SCHEMA_SNAPSHOT.md`, then I re-grep all 4 column names across `src/` to confirm zero remaining references.

---

# P2 — Quality / consistency / silent-error issues

## P2-1: 5 silent-return points in `processMarketBoxPayout` need logging
**Status:** ALREADY-IN-BACKLOG. `src/lib/stripe/market-box-payout.ts` lines 35, 49, 58, 66, 86. "Not found" cases (offering, vendor) especially should log.

## P2-2: Buyer order progress bar shows "0 of 4" after pickup confirmed
**Status:** ALREADY-IN-BACKLOG. Likely date-triggered count instead of status-triggered. UI bug.

## P2-3: `weeks_completed` trigger not incrementing
**Status:** ALREADY-IN-BACKLOG. Pickup `picked_up`, both confirmations set, `weeks_completed` still 0. Trigger may only update status, not the counter.

## P2-4: Stripe Dashboard refund of a market box doesn't cascade
**Status:** ALREADY-IN-BACKLOG (Session 75 fresh audit, A4). Plan drafted; held for design call on 3 caveats. Operational interim is manual cleanup. Worth shipping the plan; until then, document the runbook.

## P2-5: Subscribers tab missing order_number column on vendor market box detail
**Status:** ALREADY-IN-BACKLOG.

## P2-6: Buyer premium upgrade returns "Not authenticated" error
**Status:** ALREADY-IN-BACKLOG. Investigation needed; bundles with the error-reporting form bug (paired UX issues).

## P2-7: 3 vendor routes still use `vendor_profiles.single()` without vertical scope
**Status:** ALREADY-IN-BACKLOG (Session 70 finding, deferred). `api/vendor/cover-image/route.ts:21`, `api/vendor/stripe/onboard/route.ts:28`, `api/vendor/stripe/status/route.ts:26`. 500s for multi-vertical users without `?vertical=`.

## P2-8: Auth callback hardcodes `food_trucks` fallback
**Status:** VERIFIED
**Cite:** `src/app/api/auth/callback/route.ts:53-58`. FM users with expired email links land on `/food_trucks/forgot-password?error=expired`. Wrong brand, wrong domain styling.
**Fix:** Read vertical from `Host` header.

## P2-9: 4 webhook handler catch paths use `console.error` only, not `logError`
**Status:** AGENT-VERIFIED
**Cite (per agent):** `webhooks.ts:262-266` (handleMarketBoxCheckoutComplete refund-failure), `webhooks.ts:663` (handleSubscriptionDeleted auto-pause failure). Plus the catch-all in `processMarketBoxPayout` (P1-4 above) and Phase 11 cron at `expire-orders/route.ts:2023`.
**Fix:** Replace each with `await logError(new TracedError(...))`.

## P2-10: Notification template fallbacks use generic "A customer" / "your vendor"
**Status:** AGENT-VERIFIED
**Cite (per agent):** `src/lib/notifications/types.ts:200, 379, 444, 535`.
**What:** When `buyerName`/`vendorName` aren't passed in `templateData`, the template falls back to generic strings. Backlog H1 from Session 72 lists 9+ call sites that pass incomplete data.
**Fix:** Audit the call sites; or have `sendNotification` look up the name as a fallback.

## P2-11: External-payment cancellation flow CashApp regression risk
**Status:** ALREADY-IN-BACKLOG (Priority 0.5 testing). Verify what buyer sees if Stripe CashApp authorization fails — order cancelled cleanly? inventory restored? clear retry path?

## P2-12: Stripe webhook endpoint has one unbypassed Vercel Protection endpoint
**Status:** ALREADY-IN-BACKLOG. Pollutes Stripe Events log; could mask real failures.

## P2-13: Phase 12 cron email — backlog claims FT language used for FM
**Status:** UNVERIFIED. Backlog claim. Phase 11 turned out to NOT be hardcoded (`event.vertical_id || 'farmers_market'` at line 2016) — Phase 12 may also already be fixed; needs re-read.

## P2-14: `subscriptions/checkout/route.ts` doesn't appear in the rate-limit-check sweep
**Status:** UNVERIFIED. The grep that found 178/190 routes using `checkRateLimit` had this file in both the wrapped and rate-limited lists, but I didn't open it. Worth a 1-minute confirmation.

## P2-15: 13 vendor-profile lookups across vendor-event routes use `.single()`
**Status:** AGENT-VERIFIED. Already correctly scoped via `.eq('vertical_id', marketInfo.vertical_id)` per the grep results, so they should be safe — but the pattern duplicates the `getVendorProfileForVertical` utility that was extracted in Session 70. Refactor opportunity, not a bug.

---

# P3 — Cleanup / dead code / stale docs

## P3-1: Deprecated cash-complete endpoint still listening
**Status:** VERIFIED. `src/app/api/vendor/orders/[id]/confirm-cash-complete/route.ts:12-17` returns 410. Zero callers in `src/`. Safe to delete.

## P3-2: `vault` branch is at commit `7f895e5` from 2026-03-16 — 50+ commits stale
**Status:** VERIFIED. `apps/web/.claude/vault-manifest.md:8`. Vault hasn't been updated since pre-Session 59 despite many systems verified working since (events, market box biweekly hardening, etc.). User-only action; flagging.

## P3-3: `home_market_id` cleanup pending
**Status:** ALREADY-IN-BACKLOG. Column + 6 helper functions + UI references for a feature that no longer drives geographic search.

## P3-4: `apps/web/src/components/vendor/CertificationsForm.tsx` only its TYPE is imported
**Status:** ALREADY-IN-BACKLOG. Component never rendered.

## P3-5: 7 routes don't use `withErrorTracing` (most are infra)
**Status:** VERIFIED.
**Routes:** `apple-touch-icon`, `health`, `manifest`, `locale` (all infra — fine), `auth/callback` (uses redirect-on-error pattern, fine), `admin/moderation-test` (admin-gated diagnostic), `vendor/orders/[id]/confirm-cash-complete` (deprecated 410). No live route handles user data without tracing.

## P3-6: `CLAUDE_CONTEXT.md` FM tier limits stale
**Status:** ALREADY-IN-BACKLOG. Doc says "Standard 1, Premium 4" — `vendor-limits.ts` says 3/5/8.

## P3-7: Backlog claim "cart adds duplicate market box with soft warning" is incorrect
**Status:** VERIFIED. `src/app/api/cart/items/route.ts:412-414` hard-throws `ERR_CART_008`. The duplicate-subscription bug is **not** a cart-vs-checkout inconsistency — both layers block. The bug is the form C (errorCode/traceId not auto-populated in the report-error form), not gate inconsistency.
**Action:** Update backlog Priority 0.5 — Market Box UX entry to remove the "(A) Cart vs. checkout inconsistency" sub-point. Keep (B) error code visibility and (C) form auto-populate as the real items.

## P3-8: Backlog claim "Phase 11 hardcodes vertical to food_trucks" is stale
**Status:** VERIFIED.
**Cite:** `expire-orders/route.ts:2016` reads `event.vertical_id || 'farmers_market'`. Already vertical-aware.
**Action:** Remove this line item from `Priority 0.5 — Event System (from Session 66)` cluster in backlog.

---

# Verified-clean (areas that were checked and pass)

These spot-checks confirmed correctness — calling them out so the report doesn't read as one-sided:

- **Stripe metadata `order_number`**: Present at `src/lib/stripe/payments.ts:72`. The Priority 0 backlog item appears to be already shipped — verify by inspecting a real Stripe event in dashboard, then close the backlog item.
- **Atomic inventory decrement**: `atomic_decrement_inventory` RPC used in both Stripe-paid (`checkout/session/route.ts:777`) and external-payment (`checkout/external/route.ts:330`) paths. Race-safe. Market boxes correctly skip inventory (no stock model).
- **Cart duplicate-subscription gate**: Hard-blocks at `cart/items/route.ts:412`. Cart and checkout layer both enforce.
- **Rate limiting coverage**: 178/190 routes use `checkRateLimit`. The 12 outliers are infra (manifest, health), webhook receivers, and platform-internal admin diagnostic — defensible.
- **`withErrorTracing` coverage**: 183/190 routes wrapped. The 7 outliers are all infra/redirect/deprecated.
- **Cron auth**: All three cron routes (`expire-orders`, `vendor-quality-checks`, `vendor-activity-scan`) verify `Authorization: Bearer ${CRON_SECRET}` with timing-safe comparison.
- **Admin route auth pattern**: 14 admin routes audited, all do auth-check before `createServiceClient()`. No service-client-before-auth escalation vector.
- **Vertical admin scoping**: `api/admin/verticals/[verticalId]/admins` correctly verifies caller is platform admin OR vertical admin for *this specific* verticalId.
- **`is_platform_admin()` recursion**: No SQL RLS policy in source calls it on `user_profiles`.
- **Login redirects**: `login/page.tsx:123` carries `${vertical}` into `/${vertical}/dashboard` — no hardcoded path.
- **Auth checks on vendor onboarding routes**: All 5 onboarding endpoints (status, coi, category-documents, acknowledge-prohibited-items, documents) verify `supabase.auth.getUser()` before any DB write.
- **Email verification flow**: `confirm-email/page.tsx` calls `verifyOtp` directly without requiring pre-existing auth — Session 68 incident has not regressed.
- **Password reset uses `verifyOtp` not `exchangeCodeForSession`**: Confirmed in `reset-password/page.tsx:68-72` per agent report.
- **Vertical isolation on cart**: `cart/items/route.ts:122-124` rejects cross-vertical adds; market box `cart/items/route.ts:372-374` does the same.
- **Phase 11 cron vertical handling**: vertical-aware (line 2016).
- **error-logs admin page (uncommitted)**: Read by agent — properly structured with `.admin-list-table` + `.admin-list-mobile` siblings, AdminMobileRow imported, no blank-page risk.

---

# Recommended next-session sequence

If you want to ship fixes from this audit, this is the order I'd run them in. Each requires its own approval per critical-path / present-before-changing rules.

1. **P0-1** (event my-order phantom column) — 5-line fix in `events/[token]/my-order/route.ts`. Not critical-path. Ship first; fastest win.
2. **P0-2** (Phase 5 cron source_transaction) — `expire-orders/route.ts` is critical. Per-file approval. Match the inline `fulfill` route pattern exactly.
3. **P3-7, P3-8** (backlog corrections) — purely doc updates; bundle into a single doc commit.
4. **P1-2** (chargeback dedup) — 3-line fix in webhooks.ts (CRITICAL-PATH). Per-file approval.
5. **P1-4 + P2-1** (market-box-payout logging) — single file, single commit. Worth bundling.
6. **P1-1** (cart cross-event isolation for market boxes) — `cart/items/route.ts` is CRITICAL-PATH. Approve carefully or do as a DB trigger (M1 backlog item).
7. **P0-3** (event-cancel auto-refund) — design + approval session. Keeps real money in flight; not a one-line fix.
8. **P1-7** (listing publish gate enforcement) — verify-then-fix, in that order.
9. **P1-8** (schema snapshot regeneration) — mechanical; user runs REFRESH_SCHEMA.sql, I rebuild tables.

After (1), (2), (4), (5) ship — re-run vitest + manual smoke (Tier 1 from `smoke-test-checklist.md`) before pushing to staging.

---

# Notes for the user

- **Backlog accuracy**: Two backlog items (P3-7, P3-8) are stale — code already does the right thing. One (Stripe `order_number` metadata in P0 backlog) appears already shipped. Worth a backlog reconcile pass.
- **Test coverage gap**: 1478 tests pass but the cross-file contract holes (event my-order, market-box cross-event isolation, chargeback dedup) are exactly the kind that don't surface in unit tests. The `flow-integrity.test.ts` protocol is the right defense; consider adding tests for these 3 contracts after the fixes ship.
- **Action bias check**: 2 of the 3 P0 items are previously-reported issues (P0-2 Phase 5, P0-3 event refund) that have been deferred. They're not new finds — they're known risks left in flight. The audit's main NEW value is **P0-1 (event my-order)** and **P1-1 (market box cross-event isolation)**. Worth weighing the cost of leaving the existing P0s parked vs. shipping them.
