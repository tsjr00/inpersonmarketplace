# Backlog

Last updated: 2026-04-26

## Priority 0 — Cross-Vertical Audit

- [ ] **FT vertical audit for market box changes (Session 74)** — Session 74's market box hardening focused on FM testing flows. Need to verify no FM-hardcoded terms or assumptions broke FT's market box UX. Review: vendor new/edit forms (`vendor/market-boxes/new/page.tsx` + `[id]/edit/page.tsx`), vendor list (`vendor/market-boxes/page.tsx`), vendor detail (`vendor/market-boxes/[id]/page.tsx`), cart drawer (`components/cart/CartDrawer.tsx`), checkout item (`checkout/CheckoutMarketBoxItem.tsx`), browse card (`browse/page.tsx`), subscription detail (`buyer/subscriptions/[id]/page.tsx`). Look for: hardcoded "farmers market" / "FM" terms, `term(vertical, ...)` calls that don't have FT mappings, vertical-conditional logic that may have been broken by display refactors. Particular risk areas: 8-week (2-month) option that's FM-only (`vertical !== 'food_trucks'`), pickup window UI (FT uses time slot, FM uses range). Found 2026-04-26.

## Priority 0 — TOP OF NEXT SESSION (Session 74 discoveries)

- [ ] **Pass platform order number/ID to Stripe metadata** — *PROMOTED FROM 0.5.* Currently Stripe checkout sessions, charges, and payment intents do NOT carry the platform's `order_number` or `order_id`. Looking at the actual Stripe event for Order #FA-2026-34616411, the only platform identifier was `client_reference_id: 295bb0bb-...` (the order UUID), which the user can't easily match to an order number. **Operational consequence:** vendors and admins cannot conclusively trace a Stripe transaction to an order without running DB queries. This blocks routine reconciliation and turns every "did we charge for the right thing?" question into an investigation. Add `order_number` AND `order_id` to the Stripe Checkout session `metadata` field at session creation. Touches `apps/web/src/app/api/checkout/session/route.ts` (CRITICAL-PATH — needs per-file approval with diff). For market box subscriptions, also include `market_box_subscription_id` (set after subscription creation, via Stripe's PaymentIntent metadata update — or wait until next charge cycle). Verify metadata appears on both the checkout session AND the resulting payment intent. Originally raised by user 2026-04-25; promoted to Priority 0 after the Order #FA-2026-34616411 investigation made the operational pain concrete.

- [ ] **`processMarketBoxPayout` catch-all eats errors silently** — `apps/web/src/lib/stripe/market-box-payout.ts:144-146`. The outer try/catch does only `console.error('[MARKET_BOX_PAYOUT] Error in processMarketBoxPayout:', err)` — never `logError`. ANY thrown error inside the helper vanishes from `error_logs` (only visible in Vercel logs which expire). **This is exactly why the constraint-violation bug took so long to find** — only the specific INSERT path uses `logError(ERR_PAYOUT_003)`, so we got one structured trace; if the throw had come from the vendor lookup, transfer call, or anywhere else, we'd have had zero diagnostic trail. Fix: change the catch-all to `await logError(new TracedError('ERR_PAYOUT_005', \`Unhandled error in processMarketBoxPayout: ${err}\`, { route: source === 'checkout-success' ? '/api/checkout/success' : '/webhooks/stripe', method: source === 'checkout-success' ? 'GET' : 'POST', subscriptionId, offeringId }))`. ~5-line change, dramatically improves debuggability of all future market box payout failures. Found Session 74.

- [x] **Schema snapshot is wrong about 4 columns on `orders` table — phantom columns may be referenced in code** — *RESOLVED 2026-04-26.* Audit results: `orders.vendor_payout_cents`, `orders.buyer_fee_cents`, `orders.service_fee_cents` are NOT referenced in any production code (the matches are all on `order_items` joins or in test fixtures using object literals). `orders.market_id` HAS 4 active references in event-cancellation flows (`events/[token]/cancel/route.ts:116-144` and `admin/events/[id]/route.ts:242-271`) — all 4 silently failed at runtime, breaking the entire event-cancellation buyer-notification + order-cancellation flow. Fixed by querying via `order_items.market_id` (the working pattern documented in `events_comprehensive_todo.md` T0-2 and used correctly elsewhere — e.g. `admin/events/[id]/route.ts:294-298` for the completion flow). Status filter also extended to preserve `'completed'` orders (don't mark already-completed orders as cancelled). **STILL TODO** (separate backlog item below): regenerate `SCHEMA_SNAPSHOT.md` from REFRESH_SCHEMA.sql to clear the 4 phantom columns from the snapshot.

- [ ] **Regenerate `SCHEMA_SNAPSHOT.md` to remove 4 phantom `orders` columns** — Snapshot at lines 740-743 (approximate) lists `orders.vendor_payout_cents`, `buyer_fee_cents`, `service_fee_cents`, `market_id` which don't exist on live staging. Live verified 2026-04-26 via `information_schema.columns` query. The snapshot rebuild done 2026-04-05 was wrong about these 4 (likely a copy/parse error in the REFRESH_SCHEMA output processing). Action: ask user to run `supabase/REFRESH_SCHEMA.sql` and rebuild the structured tables in `SCHEMA_SNAPSHOT.md`. Until done, the new mechanical schema gate in CLAUDE.md (escalate to `information_schema.columns` when snapshot fails) covers this — but cleaning the snapshot is the proper fix. Found 2026-04-26.

- [ ] **T0-2 step 3: refund Stripe-paid event orders on event cancellation** — When an event is cancelled (organizer or admin), buyer orders are now correctly marked `cancelled` with a notification (Session 74 fix). However per design doc `events_comprehensive_todo.md` T0-2 step 3, Stripe-paid buyers should ALSO get an automatic refund (or be flagged for manual refund). Current implementation marks orders as cancelled but does not initiate refunds. Stripe-paid buyers see "cancelled" status in their dashboard but won't see money returned without separate action. Touches `lib/stripe/payments.ts` (CRITICAL-PATH) — needs per-file approval. Two paths: (a) auto-refund via Stripe API in the cancel routes, (b) flag the orders for manual admin review (intermediate step before full automation). Found 2026-04-26 while fixing the order-cancellation bug; this is the unfinished piece of the original T0-2 design.

- [x] **Audit other webhook handlers for the `if (!existingPayment)` anti-pattern** — *RESOLVED 2026-04-26.* Audited all 13 handlers in `webhooks.ts` + `resend/route.ts`. **No other handlers have the same bug shape.** Findings: (1) `handleMarketBoxCheckoutComplete` has an `if (existing) {...}` pattern at line 372 BUT correctly calls `processMarketBoxPayout` inside the existence branch before returning — this is the GOOD idempotent pattern. (2) All UPDATE-only handlers (`handlePaymentSuccess/Failed`, `handleAccountUpdated`, `handleInvoicePaymentSucceeded/Failed`, `handleSubscriptionCheckoutComplete`, `handleSubscriptionUpdated/Deleted`) are pure UPDATEs and idempotent by nature. (3) `handleTransferCreated/Failed` and `handleChargeRefunded` use `wasNotificationSent` dedup and apply state-based UPDATEs — safe on retry. (4) `handleChargeDisputeCreated` is notification-only with NO dedup — admins receive duplicate notifications on Stripe retry. Logged as a separate Priority 1 cleanup item below (low severity — notification noise only, no monetary risk). The original bug was unique to `handleCheckoutComplete`'s specific combination of payment-row idempotency + nested side effects.

## Priority 0.5 — Buyer Upgrade

- [ ] **Premium buyer upgrade returns "Not authenticated"** — Found 2026-04-26 by user testing. User tried to upgrade buyer to premium and received `Not authenticated` error from the upgrade endpoint. The user WAS authenticated (had to be to reach the upgrade page). Investigation: find the buyer premium upgrade endpoint (likely under `/api/buyer/premium/...` or `/api/buyer/upgrade/...`), check whether it uses `supabase.auth.getUser()` or session check correctly. May be missing the auth context cookie pass-through, or the endpoint may have an auth check that's looking for a `vendor` role when buyer doesn't have one. Cross-reference: this also surfaced the error-reporting form bug (C) — see Priority 0.5 — Market Box UX duplicate-subscription entry. Fix the auth bug AND the form bug together since they're paired in user experience.

## Priority 0.5 — Notification Routing (NEEDS DESIGN DISCUSSION)

- [ ] **Notification deep-link routing for market box pickups is wrong for early/off-day pickups** — Found 2026-04-26 by user testing. When a buyer confirms a market box pickup, the vendor receives an in-app notification. Clicking it currently routes the vendor to **Pickup Mode** (`/[vertical]/vendor/pickup`), which is filtered to show only TODAY's `status='ready'` pickups (per the comment added in Commit C). If the buyer confirms pickup early (vendor marked ready before scheduled date), pickup mode page shows nothing — vendor can't find the pickup, the 30-second confirmation window expires, buyer gets a "vendor missed window" notification, and the cascade gets ugly.

  **Design options to discuss next session:**
  - (a) Always route to the market box manage page (`/[vertical]/vendor/market-boxes/[offering_id]` Pickups tab) — vendor gets full context regardless of date
  - (b) Route by date: today's pickup → pickup mode (current behavior), not-today → manage page
  - (c) Route by notification action type: "ready for pickup" notifications → pickup mode (vendor-initiated flow); "buyer confirmed" notifications → manage page (response to buyer action)
  - (d) Combine (b) + (c) — most complex but most context-sensitive

  Also affects timing/race-condition issues: in user's test, vendor was 30s late confirming because they couldn't find the pickup, system fired "vendor missed" to buyer, vendor confirmed late, buyer reconfirmed within 30s, system marked picked_up. Notification routing is upstream of all this.

- [ ] **Vendor not notified when new market box subscription created** — User created a new market box subscription on 2026-04-26 (Stripe `pi_3TQaLNAUXdXt3w5T28jdCxWJ`); buyer was notified immediately, vendor was not. The subscription DOES appear correctly in the vendor's `/vendor/market-boxes` Subscribers tab with the buyer's email — just no in-app notification fired. Need a `new_market_box_subscription` notification type (or reuse existing `new_paid_order` if the structure fits) sent to the vendor on subscription creation. Trigger point: in `processMarketBoxPayout` after subscription is confirmed, OR in the success route's market box block. Found 2026-04-26.

## Priority 0.5 — Vendor Dashboard

- [ ] **Vendor analytics page does not show today's sales** — User on `farmersmarketingapp+vegvendor1@gmail.com` saw Pending Payouts = $109.36 on the "Payments & Earnings" card but couldn't reconcile because the analytics view excludes today's sales. The $109.36 = $93.35 (Order #FA-2026-34616411 market box payout, created 2026-04-26 01:49 UTC = 8:49 PM CT 2026-04-25) + $16.01 (yesterday's regular order, still 'processing'). Hypotheses to test in order: (a) date filter with off-by-one — uses `created_at::date < CURRENT_DATE` excluding "today"; (b) UTC vs CT boundary — query uses UTC date but user's "today" is CT; (c) ISR/daily-aggregate table not yet refreshed; (d) different table queried than where today's sales landed. Investigation: grep the vendor analytics page (likely at `apps/web/src/app/[vertical]/vendor/analytics/page.tsx` or under `/vendor/dashboard`) for date-filter logic. Also check whether `getServerTimezone()` or similar utility is being used. Found 2026-04-26 while reconciling the dashboard against Order #FA-2026-34616411.

- [ ] **Buyer orders progress bar shows "0 of 4 pickups" after pickup confirmed** — Found 2026-04-26 by user testing. After buyer confirmed receipt of pickup #1 on a market box subscription, the progress bar on `/[vertical]/buyer/orders` still shows "0 of 4 pickups." Likely date-triggered (waiting for `scheduled_date` to pass) instead of status-triggered (counting pickups with `status='picked_up'`). Investigation: find the `pickups_progress` rendering logic in `buyer/orders/page.tsx` and switch from a date-based count to a status-based count. Related to (but separate from) the `weeks_completed` trigger bug — this one is purely UI counting; the trigger bug is DB state.

- [ ] **Vendors cannot delete market boxes (only deactivate)** — Found 2026-04-26 by user testing. There's no delete action for market box offerings in the vendor UI. Vendors can deactivate via the active toggle, but a deactivated box still consumes a slot in their offering count and clutters their list. Need design + guardrails before implementing:
  - Hard delete vs soft delete (soft = `deleted_at` column, preserves audit trail and existing subscriptions)
  - Require zero active subscribers before delete (otherwise active subscribers lose their subscription record)
  - What happens to historical `vendor_payouts.market_box_subscription_id` references (use ON DELETE SET NULL or CASCADE? CASCADE would erase payout records — bad)
  - What happens to `market_box_pickups` rows — preserve for audit?
  - Confirm UI flow with double-confirm because it's destructive
  Recommendation: soft delete with `deleted_at` filter on all reads, FK `ON DELETE RESTRICT` on subscriptions, only deletable when zero active subs. Open design question.

- [ ] **Subscribers tab on vendor market box detail page should show order number** — Found 2026-04-26 by user testing. URL: `/[vertical]/vendor/market-boxes/[id]` Subscribers tab. Currently shows buyer email per row but no `order_number`. Vendor cannot see which buyer is associated with which order from the market box management screens. Add the order number column joined from `market_box_subscriptions.order_id → orders.order_number`. Investigation: `vendor/market-boxes/[id]/page.tsx` Subscribers tab render (around line 545 area where current `Subscriber` interface is rendered). Need to add `order_number` to the Subscriber type + the API response from `/api/vendor/market-boxes/[id]`. Found while testing market box flow on 2026-04-26.

- [ ] **`market_box_subscriptions.weeks_completed` not incrementing when pickup confirmed** — Subscription `c6acffda-b05a-42e0-b010-978695c2197b` has pickup #1 with `status='picked_up'`, both `vendor_confirmed_at` and `buyer_confirmed_at` populated, but `weeks_completed` on the parent subscription is still 0. The `check_subscription_completion` trigger (rewritten in migration 124 to count actual pickup rows instead of relying on `term_weeks`) appears to not be firing OR is not updating `weeks_completed`. Verify trigger is attached to `market_box_pickups` AFTER UPDATE, then check what it actually does — may only flip status to `completed`, not bump weeks_completed. Affects subscription lifecycle status, trial-to-paid conversion logic, vendor analytics, and completion notifications. Found 2026-04-26 while investigating Order #FA-2026-34616411.

## Priority 0.5 — Stripe operational improvement

- [ ] **Other 5 silent-return points in `processMarketBoxPayout` should log when triggered** — Beyond the catch-all (Priority 0 above), the helper at `apps/web/src/lib/stripe/market-box-payout.ts` has 5 more places that silently return without any error_logs entry: line 35 (`actualPaidCents <= 0`), line 49 (existing non-terminal payout — fine, but noise-free is OK), line 58 (offering not found), line 66 (vendor not found), line 86 (duplicate insert 23505). The "not found" cases especially should `logError` — if those fire it indicates data integrity issues that should be visible. ~10 lines added, gives observability for "shouldn't happen" cases that, when they DO happen, are critical. Found Session 74.

- [ ] **Yesterday's $16.01 vendor payout still 'processing' 24+ hours later** — Vendor `farmersmarketingapp+vegvendor1` payout `aa74cfda-37da-4a8c-8d32-d1677e9f04ee` (transfer `tr_3TPsV5AUXdXt3w5T15M6RAsF`, $16.01, regular order) has been in `vendor_payouts.status='processing'` since 2026-04-24 22:49 UTC. Either (a) Stripe test-mode transfers genuinely take days to settle (possible — verify in Stripe sandbox), or (b) there's no cron/webhook updating our `vendor_payouts.status` from Stripe's `transfer.paid` event. If (b), processing payouts may stay in that state indefinitely and the dashboard's "Pending Payouts" number will compound forever. **Investigation:** check if a Stripe `transfer.paid` or `payout.paid` webhook handler exists in `webhooks.ts` and whether it updates `vendor_payouts.status='paid'`. If not, this is a real gap. Found Session 74.

- [ ] **Investigate which migration added `vendor_payouts.market_box_subscription_id` without updating the constraint** — Migration 127 had to fix `vendor_payouts_has_reference` to accept the column. The column existed for some time before that (helper code referenced it). Means an earlier migration added the column and missed updating the CHECK constraint. **Worth knowing:** which migration, what else it changed, and whether any other constraints in the codebase have similar "added column / missed constraint update" gaps. Process-quality investigation. Found Session 74.

- [ ] **Order-side cron retry missing `source_transaction`** — `apps/web/src/app/api/cron/expire-orders/route.ts:1089-1094` calls `transferToVendor` without `source_transaction` in the order-side Phase 5 retry block. Commit `121b3d5e` fixed the inline `fulfill` route only — the cron retry path was not touched. Same `balance_insufficient` failure mode as the original Jennifer/Chef Prep incident applies here when funds haven't settled. One-line fix mirroring the order fulfill pattern: look up charge ID from `payments.stripe_payment_intent_id` for the payout's `order_item.order_id`, pass as `sourceTransaction`. Found while auditing the market box payout flow on 2026-04-24.

## Priority 1 — Webhook polish

- [ ] **`handleChargeDisputeCreated` doesn't dedup admin notifications** — `apps/web/src/lib/stripe/webhooks.ts:1015`. The handler notifies all admin users about a Stripe chargeback. If Stripe retries the webhook (which they do for any non-2xx response or sometimes spuriously), all admins get the dispute notification a second time. Other notification-emitting handlers in the same file (`handleTransferCreated`, `handleChargeRefunded`) use `wasNotificationSent(supabase, userId, type, refKey)` to dedup — apply the same pattern here using the dispute ID (`dispute.id`) as the dedup key. Severity: low (notification noise, no monetary risk). Found 2026-04-26 during the webhook anti-pattern audit (Priority 0 item now resolved).

## Priority 1 — Infrastructure / Process

- [ ] **Stripe webhook endpoint cleanup — one endpoint missing Protection Bypass** — Stripe sandbox has 2 webhook endpoints registered. One has Vercel Protection Bypass header set (works — delivers to staging), one doesn't (returns 401 on every delivery). The broken endpoint pollutes the Stripe Events log and could mask real failures. Either add the bypass header to the broken one OR delete it. Cosmetic but worth a 5-min cleanup. Found Session 74.

- [ ] **Pre-existing baseline lint error in `OrganizerEventDetails.tsx:110`** — `react-hooks/set-state-in-effect`. Slipping past pre-commit because lint-staged only checks staged files. Real React anti-pattern (cascading renders). Fix is probably wrapping the setState in `queueMicrotask()` or moving to a `useMemo`. ~1-line fix. Found Session 74 while running `npm run lint` on Batch 1 changes.

- [ ] **Verify `STRIPE_SECRET_KEY` on staging matches Stripe sandbox** — Stripe migrated from legacy "test mode" (orange bar) to "Sandboxes" (blue bar) for this account. If Stripe rotated keys during the migration, staging's `STRIPE_SECRET_KEY` env var could be pointing at the wrong sandbox or stale key. Symptom would be webhook events never delivering to staging at all (different from the Protection Bypass issue above). Quick verify: confirm the key prefix (e.g., `sk_test_51...`) matches what's shown in the active sandbox's Developers → API keys section. Found Session 74.

## Priority 0.5 — Market Box UX (early pickup notification)

- [ ] **Buyer notification when vendor marks pickup ready BEFORE scheduled date should include deep link to confirm-pickup page** — Today, market box pickups have a scheduled date and a face-to-face confirm flow. The two relevant pages are `/farmers_market/buyer/subscriptions/{subscription_id}?from=orders` (buyer side, includes confirm-pickup button) and `/farmers_market/vendor/market-boxes/{offering_id}` (vendor side, mark ready). If a vendor marks the box ready earlier than the scheduled day, the buyer's notification/email needs to (a) tell them the pickup is available now even though it's earlier than expected, and (b) include a direct link to their subscription page so they can navigate straight to confirm. First questions to answer in next session: does the existing notification system fire when vendor marks ready (regardless of date), or only on the scheduled day? Notification template type to update: probably the market_box ready-for-pickup notification. Need to add the deep link to the actionUrl + body. Found 2026-04-25.

## Priority 0.5 — Market Box UX

- [ ] **Market box duplicate-subscription flow has 3 stacked UX bugs** — Found 2026-04-26 by user testing on staging.

  **Repro:** Buyer who already has an active subscription to market box X tries to add box X to cart again (e.g., same vendor's biweekly box).

  **(A) Cart vs. checkout inconsistency:** Cart adds the duplicate item with only a soft warning; checkout then blocks with hard error "You already have an active subscription to this market box." Either both layers should block, or both should warn-and-allow with the duplicate handled at subscription creation. Investigation: grep `apps/web/src/app/api/cart/items/route.ts` for any `market_box_subscriptions` duplicate check; the gate may exist server-side at the RPC level (`subscribe_to_market_box_if_capacity`), and the cart route may not pre-check, OR the cart route checks but only warns.

  **(B) Error code missing from display:** The "active subscription" error UI doesn't show the error code that the system generated. Past convention (per CLAUDE.md error-resolution system) is to display the `ERR_XXX_NNN` code visibly so users can report it. This particular error path is missing that. Investigation: find the error-handling component that renders this, check whether the ErrorPage / ErrorBoundary / inline error component shows `error.code` / `error.errorCode` / `error.traceId`.

  **(C) Error reporting form requires `errorCode`/`traceId` but user never sees them:** Form validation error "Either errorCode or traceId is required" fires when the user submits without a code, but the user was never given a code (per #B). Even if #B is fixed, the form should auto-populate from the parent error's context (no need for the user to re-type a code that's already known to the page). Additionally, the form's validation error displays alongside the original error rather than replacing it — UI ends up showing two errors stacked, confusingly. Investigation: find the error-reporting endpoint (likely `/api/error-resolutions` or `/api/admin/error-resolutions` based on session memory) and the form component; the form should derive `errorCode` from the page's error context as a hidden field, not require user input.

  **Fix order should be:** (B) first — make error codes visible for this error type. (C) auto-populate the form so users don't have to re-enter known data. (A) last — decide cart vs checkout policy and align them.

  **2026-04-26 update:** Another instance of issue (C) confirmed via the buyer premium upgrade flow. User tried to upgrade buyer to premium → got `Not authenticated` error → reported it via the form → got the same `Either errorCode or traceId is required` validation error even when entering an email. Confirms the form validation bug is generic across all error sources (not specific to the duplicate-subscription path), which makes (C) higher priority — every "report this error" attempt is broken until it's fixed. Also see Priority 0.5 — Buyer Upgrade entry below for the underlying `Not authenticated` cause investigation.

- [ ] **Show current pickup frequency on the new-market-box form (read-only reminder)** — `apps/web/src/app/[vertical]/vendor/market-boxes/new/page.tsx`. Pickup frequency is set vendor-wide on the market-boxes list page (`/vendor/market-boxes`), not per box. When a vendor creates a new box, they should see a small read-only banner on the form like "This box will be **Bi-Weekly** — change at /vendor/market-boxes" so they're not surprised by the cadence the box launches with. Same treatment makes sense on the per-box edit form. Found 2026-04-24 by user testing the staging biweekly flow.

- [ ] **"Rate" button on buyer dashboard "Rate Your Recent Orders" card doesn't work** — buyer dashboard prompt offers a Rate button per fulfilled order (e.g., "Order #FA-2026-01646780 $19.30 · Valley Verde Farm"). Clicking the button does nothing — should open the rating flow / modal / link to the rating endpoint. Prompt copy is fine; just the action needs wiring. Found 2026-04-24 staging testing.

- [ ] **Improve traditional-market-cap error message on box activation** — `apps/web/src/app/api/vendor/market-boxes/[id]/route.ts:262`. Current message: "Market limit reached (3/3). Reactivating this box would bring you to 4 traditional markets. Remove a listing or box from another market first, or upgrade your plan." Better: list the vendor's current markets explicitly (e.g., "Your current markets are Amarillo, Canyon, Lubbock") and name the market the activation would add (e.g., "Activating this box would add Westgate Mall as a 4th market"). Helps the vendor decide which listing to drop without having to leave the page. Found 2026-04-24.

## Priority 1 — Documentation drift

- [ ] **`CLAUDE_CONTEXT.md` FM tier limits are stale** — doc says "Standard Traditional Markets: 1, Premium: 4" but `vendor-limits.ts:57,71,85` shows 3 / 5 / 8 (standard / premium / featured). Code is authoritative; doc should be updated. Found 2026-04-24 while investigating an activation enforcement question.

## Priority 0.5 — Market Box Edge Cases

- [ ] **Standalone market box checkout doesn't support biweekly vendors** — `apps/web/src/lib/stripe/webhooks.ts:367` (the `handleMarketBoxCheckoutComplete` function for direct-buy flow via `createMarketBoxCheckoutSession`) hardcodes `p_pickup_frequency: 'weekly'` because the standalone metadata format doesn't carry it. If a buyer ever uses the standalone purchase path on a biweekly vendor's box, the subscription will be created as weekly (4 pickups instead of 2) regardless of vendor settings. Currently MarketBoxDetailClient.tsx routes through the cart flow, so standalone path may be cold — but if it's reactivated or used by an admin, biweekly is broken. Fix: do a vendor_profile lookup in `handleMarketBoxCheckoutComplete` to read `market_box_frequency`, OR push frequency into standalone metadata at session-creation time in `apps/web/src/app/api/buyer/market-boxes/route.ts:309` (call to `createMarketBoxCheckoutSession`) and the corresponding metadata write in `payments.ts:163-201`. Found 2026-04-24 while fixing webhook RPC overload.

- [ ] **Refund on RPC failure can attempt the wrong amount** — `apps/web/src/lib/stripe/webhooks.ts:218,232` `createRefund(paymentIntentId, mbItem.priceCents)`. After today's fix, `mbItem.priceCents` is the food subtotal (pre-fee), not the actual Stripe charge. So a refund will succeed but only return the food portion, leaving the buyer-fee portion stuck. Better: refund the actual line-item charge (food + buyer percentage fee + proportional flat fee), or use Stripe's refund-charge-by-PI semantics that auto-pick the full amount. Low impact — refund only fires if the RPC fails, which after Fix A should be rare. Found 2026-04-24.

- [ ] **Test CashApp payment failure flow on staging** — user note 2026-04-25. Verify what the buyer sees if CashApp authorization fails at Stripe checkout: does the order go to a clean cancelled state? Does inventory get restored properly? Does the buyer get a clear retry path? Stripe test mode supports forcing payment-method failures.

- [ ] **Investigate possible market box term-selector state bug** — user reported choosing "1 Month" but ending up subscribed to a 2 Month term (term_weeks=8 in cart and on success page). May be downstream of cart `pickup_frequency` propagation bug fixed 2026-04-25 — retest first; if still happening, dig into MarketBoxDetailClient term selector state, particularly the `selectedTermWeeks` / `addMarketBoxToCart` handoff at the subscribe button. Found 2026-04-25.

## Priority 0.5 — Vendor Onboarding (Session 73)

- [ ] **Additive vendor categories with documentation gate** — Vendors should be able to add new product categories after signup (currently locked from signup form). When a vendor adds a category that requires documentation (e.g., adding Baked Goods to a Produce vendor), the system should: (1) allow the category to be added from their profile or listing form, (2) prompt for required documents per `category-requirements.ts`, (3) gate publishing of listings in the new category until docs are approved. Touches: listing form category selector, vendor_verifications.requested_categories, category document upload flow, OnboardingChecklist. Session 73 friction audit finding #14.

## Priority 0.5 — Event Rating Follow-ups (Session 71)

- [ ] **Admin moderation UI for `event_ratings`** — page at `/admin/event-ratings` with filters (pending/approved/hidden), approve / hide actions, ability to see the full event + user context. Until built, approve via SQL: `UPDATE event_ratings SET status='approved', moderated_at=now(), moderated_by=<admin_user_id> WHERE id='<id>';`
- [ ] **Organizer dashboard: event rating display** — on the organizer's event detail page, show approved `event_ratings` rows with rating + comment. RLS already allows organizers to read approved rows for events where `organizer_user_id = auth.uid()` — just needs the UI.
- [ ] **Magic-link re-auth for post-event rating** — logout friction fix. Post-event notification email includes a Supabase `admin.generateLink()` signed URL that auto-authenticates the attendee for a one-shot rating. Attach to the existing notification flow. User raised this concern in Session 71.
- [ ] **Aggregate stats on `catering_requests`** — `average_rating` + `rating_count` columns + trigger on `event_ratings` so we can show "4.6 ★ from 23 attendees" publicly (if user wants aggregated bragging). Currently deferred — individual ratings stay private.
- [ ] **Per-vendor "unrated event orders" nudge** — after event completes, notify buyers with an unrated completed order from the event so they rate via the dashboard (not just via the event page).

## Priority 0.5 — Quick Fixes

- [ ] **Locale switch fetch error unhandled** — `src/lib/locale/client.ts:24` `setClientLocale()` doesn't catch fetch failure. Sentry issue 7382469144.
- [ ] **Organizer cancel API** — new route `POST /api/events/[token]/cancel` with organizer_user_id auth. Current button shows "contact support".
- [ ] **Organizer pre-order detail** — expandable section on My Events card showing order breakdown per vendor.
- [ ] **Event order cap enforcement** — reimplementation via separate validation endpoint (NOT cart/items/route.ts). DB columns exist (migration 106).
- [ ] **Vendor guidance text** — capacity planning message on acceptance UI, pre-order count in prep reminders.
- [ ] **Organization type field** — add to event request form (company, church, school, community group, government). Use "event organizer" instead of "company" generically.

## Priority 0.5 — Event System (from Session 66)

### Event Capacity Safety
- [ ] **Event order volume alert for unlimited-inventory vendors** — When a vendor with `quantity = NULL` listings accumulates event orders exceeding their stated `max_headcount_per_wave × wave_count`, send a proactive notification warning them. The data is in `event_readiness` JSONB on vendor_profiles. Without this, a vendor could get 200 pre-orders with no system-level cap. Regular markets are less risky (daily cadence + vendor can refuse in real-time), but events batch all orders before event day.

### Event System Cleanup (non-blocking, from code review)
- [ ] **Admin PATCH duplicates approval logic** — `admin/events/[id]/route.ts` lines 112-173 duplicates `approveEventRequest()` from event-actions.ts. Should call the shared function instead.
- [ ] **Phase 11 cron hardcodes vertical** — Line 1993 sends `vertical: 'food_trucks'` for all event prep reminders. Should use event's actual vertical_id.
- [ ] **Phase 12 cron email uses FT language for FM** — Results email says "food trucks" regardless of vertical.
- [ ] **Public event page footer hardcodes "Food Truck'n"** — `events/[token]/page.tsx` line 316. Should be vertical-aware.
- [ ] **Public event page N+1 vendor queries** — Shop page already fixed with batch queries; event info page still loops per vendor.

## Priority 1 — Session 72 Findings

### H3: Event completion with unfulfilled order items — refund/reconciliation logic
- [ ] **COMPLEX — requires multi-scenario research + planning before code.**
  
  When admin marks an event 'completed', unfulfilled order items (pending/confirmed/ready) are logged but no refund or correction happens. The right behavior depends on the payment model:
  
  - **Company-paid (host pays for everything):** vendor should get a grace window to correct unconfirmed orders before completion finalizes. Unfulfilled items may represent vendor error (didn't confirm), not buyer no-show. Company already paid — refund goes back to company, not individual attendees.
  - **Attendee-paid (Stripe checkout):** unfulfilled items could be buyer no-show (no refund deserved), vendor no-show (full refund deserved), or handoff failure (partial refund?). Each case has different financial treatment.
  - **Hybrid (future):** combination of both — company portion refunded to company, attendee portion refunded to attendee. Most complex.
  
  **Work required:**
  1. Map every order_items status that could exist at completion time, per payment model
  2. Define the correct financial action for each (refund buyer, refund company, charge vendor, write off, etc.)
  3. Design admin UI: show unfulfilled breakdown, require admin to choose action per item or per vendor before finalizing
  4. Consider: vendor dispute window before completion (e.g., 24h after event to confirm any stragglers)
  5. Consider: auto-complete vs manual-complete distinction (cron auto-complete should be stricter than admin manual)
  
  **Cited code:** `api/admin/events/[id]/route.ts:290-327` — current implementation queries unfulfilled items, notifies vendors, logs warning, proceeds without blocking or refunding.

### Session 72 audit findings (backlog items)
- [ ] **H1: Notification placeholder data gaps** — 9+ notification call sites pass incomplete template data. Buyers see "A customer" and "your vendor" instead of real names. Largest impact: `new_paid_order` at `checkout/success/route.ts:335` (every Stripe order). Full report in Session 72 conversation.
- [ ] **H2: Duplicate organizer confirmation emails** — `admin/events/[id]/route.ts:204` (status→ready) and `events/[token]/select/route.ts:329` (vendor selection) both send nearly identical "X vendors ready" emails. Fix: add `selection_email_sent_at` column to gate duplicates.
- [ ] **C2: Turnstile graceful degradation** — if Cloudflare CDN fails, signup button stays permanently disabled with no error message. Need timeout + fallback (enable button after 10s if widget doesn't load).
- [ ] **M1: Cart isolation — move to DB trigger (Option C).** Current app-level check has race condition + silent bypass on query failure. Replace with BEFORE INSERT trigger on `cart_items` that enforces cross-event isolation atomically. Full risk analysis + implementation plan at `.claude/plans/cart-isolation-db-trigger-plan.md`. Deploy while volume is low — risk increases with scale.
- [ ] **M2: Vendor cancel notification uses wrong template** — `events/[token]/cancel/route.ts:104` sends `catering_vendor_responded` (accept/decline template) for cancellations. Vendor sees grammatically broken message. Needs dedicated `event_cancelled_vendor` notification type.
- [ ] **M4: Event-ratings admin optimistic UI count bug** — `admin/event-ratings/page.tsx:89` decrements wrong status count when moderating a rating while viewing a different one. Fix: capture oldStatus before update.
- [ ] **Admin panel: show user/vendor names not just emails** — user request from Session 72.
- [ ] **`column market_vendors.status does not exist`** — error in prod Postgres logs. Separate bug, not investigated.
- [ ] **`column v.business_name does not exist`** — error in prod Postgres logs. Separate bug, not investigated.
- [ ] **`/api/buyer/location` POST silently swallows profile-update errors** — cookie updates but profile doesn't. User's browse location stays stale.
- [ ] **`browse/page.tsx:531` ignores query errors on rawListings** — root cause of silent empty browse page when RLS errored. Should check error and log.

## Priority 0 — Next Session

### Sales Tax Implementation (UPDATED Session 72 — TaxCloud vs Stripe Tax decision pending)
- [x] **TX Comptroller registration** — DONE. Taxpayer ID obtained, awaiting system processing.
- [ ] **Tax provider decision** — TaxCloud Premium ($79/mo, free filing+audit) vs Stripe Tax (0.5%/txn, simpler integration). At <100 orders/mo Stripe Tax is cheaper. TaxCloud wins on compliance. See Session 72 cost analysis. USER DECISION.
- [ ] **Provider account setup** — Either TaxCloud (API ID + API Key + bank link) or Stripe Tax (add TX registration in dashboard). USER ACTION.
- [ ] **Code: Tax lookup at checkout** — API client skeleton at `src/lib/tax/taxcloud.ts` + TIC mapping at `src/lib/tax/tic-codes.ts` (ready for TaxCloud). Stripe Tax alternative: 2 lines in checkout config.
- [ ] **Code: Display tax line item** — Show tax to buyer before payment.
- [ ] **Code: Report transactions** — TaxCloud: call `captureTransaction()`. Stripe Tax: automatic.
- [ ] **Code: Report refunds** — TaxCloud: call `reportReturn()`. Stripe Tax: automatic.
- [ ] **Code: Withhold tax from vendor transfers** — Exclude tax from vendor_payout_cents.
- [ ] **Code: Track sales_tax_cents** — Add column to orders/order_items.

### Pre-Launch Business Items
- [ ] **Tax compliance consultation** — Partially done (Session 63 research). Remaining: confirm platform fee taxability, verify filing frequency, confirm marketplace facilitator registration process. CPA recommended.

### Catering Pre-Order System (Session 63 decisions)
- [ ] **Catering minimum order enforcement** — 10 items per vendor minimum for catering orders (`advance_order_days > 0`). Enforce at cart validation AND checkout. Show clear message: "Catering orders require a minimum of 10 items per vendor."
- [ ] **Catering advance notice tiers** — Size-based minimum lead time: 10-29 items = 1 day, 30-49 items = 2 days, 50+ items = 3 days. Enforce in SQL `get_available_pickup_dates()` — the advance window should expand/contract based on cart quantity per vendor. Also enforce at checkout validation.
- [ ] **Listing form advance ordering update** — Current dropdown offers fixed 2-7 days. Needs to reflect the new tier logic. The vendor sets their MAX advance window; the system enforces minimums based on order size. May need rethinking — vendor sets "I accept catering orders" (boolean) and the tiers are platform-enforced, not vendor-chosen.
- [ ] **Event $75 per-truck fee** — Due with 50% deposit when agreement signed/uploaded. Needs: fee calculation in event booking flow, payment capture mechanism, tracking in a fees table or on catering_requests.
- [ ] **Zip code visibility across geographic pages** — Research item from Session 63. All geo-search pages should show what zip they're keyed off of. Changing zip on one should change all. DO NOT change until implications understood (browse page has different fallback logic).

### Session 63 Completed
- [x] **Vendor configurable pickup lead time** — DONE. Migration 096, 15/30 toggle, dropdown UI.
- [x] **Password reset** — DONE. verifyOtp with token_hash, bypasses PKCE.
- [x] **Vendor hours display mismatch** — Was already done (Session 31).
- [x] **T-2, T-3, T-11 protective tests** — DONE. 32 new tests.
- [x] **Inventory restore safety** — DONE. shouldRestoreInventory() utility.
- [x] **Buyer premium page rewrite** — DONE. False claims removed.
- [x] **Time slot UX** — Dropdown replaces tiles. End time = valid arrival. 15-min slots for 15-min lead.
- [x] **Vendor profile reorder** — Menu → Chef boxes → Catering → Info at bottom.
- [x] **Cover photo** — Migration 097, upload with resize, 16:9 display.
- [x] **Favorites page** — Simple name+logo cards, no geo search.
- [x] **Landing page button** — "Where are trucks today?" navigates to where-today.
- [x] **Tutorial fix** — Missing notification_preferences column on prod.
- [x] **TypeScript build errors** — All resolved (events page types).
- [x] **Production push** — 49+ commits pushed to prod with revert tag.
- [x] **Stress test protocols** — 8 protocols documented.
- [x] **Cite-or-verify rule** — New absolute rule in CLAUDE.md + global rules.
- [x] **Vendor profile section reorder** — Menu → Chef boxes → Catering → Info at bottom.
- [x] **Cover photo** — Migration 097, upload with resize, 16:9 display.
- [x] **Favorites page** — Simple name+logo cards, no geo search.
- [x] **Catering badge on vendor profile** — Shows on listing cards + gold highlight button.
- [x] **Checkout mobile layout** — Items → tip → payment → Pay Now → cross-sell.
- [x] **Accounting reports (6)** — Transaction reconciliation, refund detail, external fee ledger, subscription revenue, tax summary, monthly P&L.
- [x] **Payment methods expanded** — Card + Cash App + Amazon Pay + Link explicitly listed.
- [x] **External payments hidden** — EXTERNAL_PAYMENTS_ENABLED flag, UI hidden, backend preserved.
- [x] **FT sales tax always-on** — Greyed out checkbox + pre-packaged food block.
- [x] **FM category-based tax rules** — Auto tax by category + trigger questions for Meat/Baked Goods.
- [x] **Signup tax guidance** — Tax notice on vendor signup success page per category.
- [x] **FM vendor_type expanded** — Migration 098, 11 categories matching listing categories.
- [x] **Catering cash restriction removed** — Premature; will rebuild with catering minimum system.
- [x] **Vendor outreach emails** — FT and FM templates written for vendor recruitment.

## Priority 1 — From Session 62

### Notifications & Communication
- [x] **Confirmation email pickup instructions** — DONE Session 62. order_ready notification includes handoff instructions + deep-link to specific order.
- [x] **Vendor expiration notification** — DONE Session 62. Cron Phase 1 now notifies vendor when order expires.
- [ ] **Inventory change notifications (design needed)** — Notify buyers when favorited vendors restock. Design: favorites-only, 15-30 min batch window after last change, max 1 per vendor per buyer per day.
- [ ] **Vendor notification titles i18n** — 20+ vendor notifications use hardcoded English strings. Buyer notifications use `t()`. Should be consistent.
- [x] **Notification deep-linking** — DONE Session 62. All buyer order notifications link to specific order detail page.
- [ ] **Notification click routing review** — 48 actionUrls need review for appropriate destinations. Not a wiring issue — each type's actionUrl needs individual review. Tedious but mechanical.

### Tests — Protect Revenue & Recent Fixes
- [ ] **T-7: External payment fee flow test** — HIGHEST PRIORITY. User said "if it breaks we lose money."
- [ ] **T-2: Refund calculation consistency test** — All 4 refund paths must produce identical amounts.
- [ ] **T-11: Inventory restore vertical awareness test** — FT fulfilled = no restore, FM = restore.
- [ ] **T-3: Tip split protective test** — Confirmed correct, needs protection from accidental changes.

### Business Rules to Document
- [x] **BR-5: Market box missed pickup = no refund** — DONE Session 62. In decisions.md.
- [x] **BR-6: Trial tier = 'free'** — DONE Session 62. In decisions.md.
- [x] **BR-11: FT fulfilled items don't restore inventory** — DONE Session 62. In decisions.md.
- [ ] **BR-4: Event approval prerequisites** — What criteria grants event_approved? Is COI required?
- [ ] **BR-7: Cancellation fee allocation** — No documented percentage for vendor's share.
- [ ] **BR-8: Event headcount range (10-5000)** — Hardcoded, no justification documented.
- [x] **BR-9: Cross-vertical cart isolation** — DONE Session 62. Validation added to add-to-cart API.
- [ ] **BR-10: Radius persistence behavior** — Cookie-only vs profile.

### Investigation Needed
- [x] **E-8/E-9: Cart cross-vertical isolation** — DONE Session 62. Vertical validation added to listing + market box add-to-cart.
- [ ] **E-21: Timezone centralization** — zip_codes table has timezone column. Design centralized utility.
- [x] **E-22: Geocode/browse** — INVESTIGATED Session 62. zip_codes table populated on all 3 envs (33,793 rows). DB lookup should work. Silent fallback is documented in code.
- [ ] **Where-today schedule mismatch** — Need specific example from user to diagnose.

### Small Fixes
- [x] **E-25: UserRole type dedup** — DONE Session 62.
- [x] **E-19: Cart remove endpoint stub** — DONE Session 62. Deleted.

## Priority 1 — From Session 61 (Carried Forward)

### Buyer Premium Upgrade Page
- [ ] **Rewrite premium buyer value proposition** — Remove market box claims, remove "premium support" claim. Focus on early access, premium badge visibility to vendors.

### Vendor Profile (FM)
- [x] **"View Menu" → "View Products"** — ALREADY DONE (prior session).
- [x] **Hide "Free" tier badge** — ALREADY DONE (prior session).
- [x] **Show tier badge on FM vendor cards** — ALREADY DONE (prior session).
- [x] **Resize social buttons on vendor profile** — DONE Session 62. Reduced ~10%, 3-line desktop layout.

### Notification Click Behavior
- [ ] **Notification click routing review** — Each notification type's actionUrl needs review. Most point to orders list; some should point to dashboard, settings, etc. Tedious but mechanical.

### Translation Gaps
- [ ] **Page-by-page translation audit** — Many items not translated to Spanish.

### Order Lifecycle Monitoring
- [x] **Fix "active orders" count on dashboard** — DONE Session 62.
- [x] **Admin dashboard: stuck orders card** — DONE Session 62. Shows count + open issues link.
- [ ] **Integration test: full order lifecycle** — Test order transitions pending → paid → confirmed → ready → completed.
- [x] **Backfill stuck orders** — DONE Session 62. One-time SQL cleanup applied to all 3 envs.

### Event System
- [x] **Event Phase 1 completion** — DONE Session 62. Per-event vendor menus (event_vendor_listings table, vendor picker on accept, 5-item limit). Event lifecycle statuses (approved → ready → active → review → completed). Migration 094 applied all 3 envs.
- [x] **Event Phase 3: Attendee feedback** — DONE Session 62. EventFeedbackForm component on event page during active/review status.
- [x] **Event Phase 3: Vendor prep reminder** — DONE Session 62. Cron Phase 11 sends 24h-before notification.
- [x] **Event Phase 3: Settlement notification** — DONE Session 62. event_settlement_summary type created.
- [x] **Event Phase 4: Revenue estimate** — DONE Session 62. Shows on vendor invitation page.
- [ ] **Event Phase 2: Wave-based ordering** — Time slots with capacity limits, wave-aware checkout. Significant build.
- [ ] **Event Phase 3 remaining: Settlement email trigger** — Send settlement notification to vendors when admin marks event completed. Notification type exists, needs to be called from the admin status transition.
- [ ] **Stripe payouts_enabled flag sync** — Investigate why DB flags don't stay current after vendor completes Stripe setup.

### Stripe Cleanup
- [x] **Delete old pebble02 webhook endpoint** — DONE by user Session 62.

## Priority 2 — Soon

- [x] **Browse page: consolidate filters** — DONE (prior session).
- [ ] **Playwright automated smoke tests** — See detailed plan in archive section.
- [ ] **Test push notifications on staging** — Verify web push end-to-end.
- [ ] **Stripe live mode activation** — Switch from test to live keys when ready.
- [ ] **Prod zip_codes seeded** — DONE Session 62. 33,793 rows via CSV import.

## Priority 2.5 — Session 62 Audit Opportunities

- [ ] **Opportunity 1: Buyer Interest Geographic Intelligence Dashboard** — buyer_interests table has data. Admin page showing interests by zip/count/date + CSV export.
- [ ] **Opportunity 2: Vendor Quality System Activation** — Nightly cron generates findings. Zero UI. Vendor dashboard card + admin findings page.
- [ ] **Opportunity 3: Trial-to-Paid Conversion Funnel** — Dashboard banner "Day X of 90", upgrade page context, 7-day pre-expiry notification.
- [ ] **Opportunity 4: Vendor Leads Management UI** — Admin leads page with status tracking, follow-up, demo scheduling.

## Priority 2.6 — Documentation Deep Dives
- [ ] **Area-specific deep dive series** — Internal reference docs across full stack. Topics: Statuses, Dates/Times, Locations, Hours/Schedules, Tiers/Limits, Financial Flows, Auth/Access, Device/Browser.

## Priority 2.7 — Performance & Infrastructure
- [ ] **AC-4: Optimize heavy RLS policies on markets table** — 2 nested EXISTS subqueries per row.
- [ ] **L4: Zod input validation on API routes** — Gradually add Zod schemas.
- [ ] **L6: SMS send logic when push enabled** — Blocked by A2P 10DLC carrier approval.
- [ ] **L2: External cron monitoring** — Deferred post-launch.
- [ ] **RLS: Consolidate multiple permissive policies** — Supabase linter flags 15 tables with multiple OR'd permissive SELECT policies. Consolidate into single comprehensive policies for performance.
- [ ] **RLS: Audit auth.uid() vs (SELECT auth.uid())** — Supabase flags auth RLS initialization plan warnings. Ensure all policies use `(SELECT auth.uid())` pattern.
- [ ] **RLS: Document buyer_interests INSERT policy** — `WITH CHECK (true)` is intentional (public lead capture). Add SQL comment or tighten to require valid email. Not a real vulnerability — API validates and rate-limits.
- [ ] **Auth: Investigate incognito/regular Chrome session conflict** — Admin in incognito got logged out when vendor logged in on regular Chrome (same domain, same Supabase project). Likely Supabase SSR cookie middleware or BroadcastChannel issue. Not blocking (different browsers work). Workaround: use Chrome + Edge for multi-role testing.
- [ ] **Migration 006: Apply to prod** — DONE Session 65. Remove this item.

## Priority 3 — When Time Allows
- [ ] **Geographic intelligence feature** — Plan at `.claude/geographic_intelligence_plan.md`
- [ ] **A2P 10DLC SMS approval** — Waiting on carrier

## Post-Launch — Growth & Expansion
- [ ] **Ecosystem Partner Platform** — Full design at `docs/CC_reference_data/Ecosystem_Partner_Platform_Design.md`
- [ ] **Growth Ambassador Program** — Design at `docs/CC_reference_data/Growth_Partner_System_Design.md`
- [ ] **Geographic Expansion Planning** — Workbook at `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx`
- [ ] **Property Broker (3-sided marketplace)** — Land/parking lot rentals for vendors. Concept + phased plan at `apps/web/.claude/property_broker_concept.md`. Phase 0 validation required before any build. Reuses ~70% of existing infrastructure (matching, Stripe Connect, onboarding gates, notifications). Closest analogue: Storefront (failed) — but we start with demand side already in place.

## Icebox
- [ ] **Events feature Phase 5+** — Ticketing, capacity management, recurring events
- [ ] **Advanced vendor analytics** — Sales trends, customer demographics, peak hours

## Housekeeping / Tech Debt
- [ ] **Clean up home_market_id remnants** — After Session 70's tier-cap fix, `home_market_id` is no longer used for listing permissions. It still exists for: (1) DB column on `vendor_profiles`, (2) `/api/vendor/home-market` GET/POST endpoint, (3) dashboard home market card display, (4) `vendor/markets/page.tsx` 🏠 badge + "Set as Home Market" button + home market card, (5) `markets/page.tsx:291` stale text "used as your primary position in geographic search results" (geographic search does NOT actually use this column — confirmed via grep in Session 70). Six helper functions in `vendor-limits.ts` (`getHomeMarket`, `setHomeMarket`, `canChangeHomeMarket`, `isHomeMarket`, and usage in `getVendorUsageSummary`). When cleaning up: decide whether home_market_id has any remaining meaningful purpose (maybe as a vendor-preferred display default?), and either (a) fully remove it including the column migration, or (b) repurpose it explicitly for something and update the UI text. DO NOT touch this until geographic search is stable — user's constraint in Session 70.
- [ ] **Retroactively fix misleading commit message on `dfd01923`** — Session 70 accidentally bundled migration folder cleanup (107-109 deletions + 110-113 moves to `applied/` + `ROLLBACK_109.sql` deletion) into the commit titled `docs: Protocol 8 — Error Log Review at every session kickoff`. The commit log doesn't reflect the migration work. **Fix when there's downtime:** either (a) note in decisions.md / session history that migration cleanup happened in `dfd01923`, or (b) if this section of history is ever rebased for another reason, split it cleanly. No functional impact — all work is committed and correct, just the message is incomplete. Caught in Session 70.
- [ ] **Dead code: delete `apps/web/src/components/vendor/CertificationsForm.tsx`** — Only its `Certification` TYPE is imported (by `vendor/edit/page.tsx`). The component itself is never rendered. Either inline the type into a types file or delete the component and keep the type-only export. Session 70.
- [ ] **Refactor events routes to use `getVendorProfileForVertical` for consistency** — 4 of 5 events routes (`route.ts`, `message`, `cancel`, `respond`) were fixed by commit `17fa16cc` with an inline pattern that works correctly but doesn't use the shared utility. Cosmetic refactor, zero behavior change. Session 70.

---

## Completed (Archive)

| Date | Item |
|------|------|
| 2026-03-20 | Active orders count fix (migration 092 + trigger 093 + data cleanup) |
| 2026-03-20 | Admin approval tier names (was basic/standard, now free) |
| 2026-03-20 | Admin vendor/listing table tier filter + badge colors |
| 2026-03-20 | Event invite event_approved check |
| 2026-03-20 | Event request past date validation |
| 2026-03-20 | JSONB race condition on doc upload |
| 2026-03-20 | Where-today rate limit |
| 2026-03-20 | Resolve-issue refund math (now includes buyer fees) |
| 2026-03-20 | Inventory restore vertical awareness (FT fulfilled = no restore) |
| 2026-03-20 | Migration 085 applied (lazy profile + role enums) |
| 2026-03-20 | External payment safety net (buyer cancel + vendor non-payment) |
| 2026-03-20 | Vendor resolve-issue UI on orders page |
| 2026-03-20 | Admin order issues page |
| 2026-03-20 | Listing edit no longer demotes published to draft |
| 2026-03-20 | Where-today FM text (header, subtitle, count labels) |
| 2026-03-20 | Where-today zip persistence (reads from API, not cookie) |
| 2026-03-20 | Cancelled order banner — no refund text for external payments |
| 2026-03-20 | Cancel-nonpayment updates order-level status |
| 2026-03-20 | Resolve-issue updates order status when all items cancelled |
| 2026-03-20 | Migration 093: auto-cancel order trigger |
| 2026-03-20 | UserRole type dedup (import from roles.ts) |
| 2026-03-20 | Cart remove stub deleted |
| 2026-03-20 | BR-5, BR-6, BR-11 documented in decisions.md |
| 2026-03-20 | Vendor profile desktop layout (3 lines) + social button sizing |
| 2026-03-20 | Admin stuck orders + open issues cards on dashboard |
| 2026-03-20 | Notification deep-linking (all buyer notifications → specific order) |
| 2026-03-20 | Vendor expiration notification (cron Phase 1) |
| 2026-03-20 | Order confirmed notification includes handoff instructions |
| 2026-03-20 | Spanish translations for new notifications |
| 2026-03-20 | Cart cross-vertical validation (E-8/E-9) |
| 2026-03-20 | Order-ready notification includes pickup instructions + deep-link |
| 2026-03-20 | Prod zip_codes seeded (33,793 rows) |
| 2026-03-20 | Event Phase 1: per-event vendor menus (migration 094 + vendor picker) |
| 2026-03-20 | Event Phase 1: lifecycle statuses (ready/active/review) + admin transitions |
| 2026-03-20 | Event Phase 3: attendee feedback form on event page |
| 2026-03-20 | Event Phase 3: vendor prep reminder (cron Phase 11) |
| 2026-03-20 | Event Phase 3+4: settlement notification + revenue estimate |
| 2026-03-20 | External payment fee flow documented in decisions.md |
| 2026-03-04 | Upstash Redis rate limiting |
| 2026-03-04 | CI lint fixes (ESLint errors) |
| 2026-03-04 | Sentry setup (staging + production) |
| 2026-03-04 | Legal terms 3-tier system |
| 2026-03-04 | Production push (all infra) |
