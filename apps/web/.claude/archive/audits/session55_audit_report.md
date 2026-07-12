# Session 55 — Comprehensive Systems Audit Report

**Date**: 2026-03-14
**Scope**: Full codebase + systems review for launch readiness
**Methodology**: 7 parallel research agents + independent code verification against 189 business rules
**Mode**: Report only — no code changes made

---

## Executive Summary

The app is in **strong overall shape** for launch. Security posture is solid (157 routes all have auth + rate limiting + error tracing). The Stripe Connect payment flow works end-to-end. The multi-vertical architecture is well-isolated. The cron system is idempotent with independent error handling per phase.

**However, there is 1 launch blocker, 7 high-priority issues, and ~20 medium/low items that should be addressed.**

The single most critical finding: **the COI gate blocks ALL vendor publishing**, contradicting the confirmed business rule that COI is optional. No vendor can publish listings without an approved Certificate of Insurance, which was explicitly decided to be optional in Session 49.

---

## CRITICAL — Launch Blockers

### C-1: COI Gate Blocks All Vendor Publishing
**Business Rule Conflict: VJ-R1 says COI is OPTIONAL, but code REQUIRES it**

- `can_vendor_publish()` DB function (migration 012, lines 146-148) requires `coi_status = 'approved'`
- `onboarding/status/route.ts:219` requires `verification.coi_status === 'approved'`
- `enforce_listing_tier_limit` trigger (migration 078) calls `can_vendor_publish()`, enforcing at DB level
- **Impact**: Zero vendors can publish listings without approved COI. This is a complete blocker for any vendor who hasn't uploaded and had COI approved.
- **Fix**: Remove COI check from `can_vendor_publish()` and from `onboarding/status/route.ts`, or make it a soft gate (warning, not blocking)
- **Effort**: Small (1 migration + 1 API route edit)

### C-2: Cancellation Fee Split Calculation Bug
**Agent 1 finding — verified in code**

- `cancellation-fees.ts:92` uses `applicationFeePercent` incorrectly when calculating the vendor's share of a cancellation fee
- The platform fee percentage is applied to the cancellation fee, but the math produces wrong splits for partial cancellations
- **Impact**: When a buyer cancels an order and owes a cancellation fee, the vendor/platform split may be incorrect — real money impact
- **Fix**: Correct the calculation to properly split cancellation fees
- **Effort**: Small (1 file fix + test)

---

## HIGH — Should Fix Before or Shortly After Launch

### H-1: Checkout Does Not Re-Validate Availability
**Agent 4 finding — race condition**

- Between "add to cart" and "complete payment," no re-check of listing availability occurs
- If a listing's market schedule changes, cutoff passes, or inventory sells out after cart was built, the checkout proceeds anyway
- The `atomic_decrement_inventory` will catch zero-stock (RAISE EXCEPTION), but won't catch schedule/cutoff violations
- **Impact**: Buyer pays for item that isn't actually available for the selected pickup. Requires manual vendor cancellation.
- **Fix**: Add availability re-validation in checkout flow before Stripe session creation
- **Effort**: Medium (checkout route modification + availability check integration)

### H-2: Inventory Restored Before Refund Confirmation
**Agent 2 finding — data consistency risk**

- When an order is cancelled, inventory is restored BEFORE the Stripe refund is confirmed
- If the Stripe refund fails, inventory is already restored but buyer is still charged
- **Impact**: Inconsistent state — inventory available but money not returned. Requires manual intervention.
- **Fix**: Restore inventory only after refund confirmation, or implement compensation logic on refund failure
- **Effort**: Medium (reorder operations in cancel route + error handling)

### H-3: Concurrent Cancellation Race Condition
**Agent 2 finding — no row-level locking**

- Order cancellation/status updates don't use `FOR UPDATE` or similar locking
- Two simultaneous cancellation requests could both succeed, potentially double-refunding
- **Impact**: Financial — double refund possible in edge cases
- **Fix**: Add `SELECT ... FOR UPDATE` on order row before status transition, or use Supabase RPC with row lock
- **Effort**: Medium (modify cancel route + potentially new RPC)

### H-4: Market Box Payout Race Condition
**Agent 1 finding — webhook vs success route**

- Both the Stripe webhook handler AND the checkout success route can trigger market box vendor payout
- If both fire close together, could create duplicate payouts
- **Impact**: Financial — vendor paid twice for same subscription
- **Fix**: Add idempotency check (the `vendor_payouts` unique index on `market_box_subscription_id` should catch this at DB level, but the Stripe transfer would still fire). Verify the unique index prevents the second `INSERT`, and add a pre-check before calling `stripe.transfers.create()`
- **Effort**: Small-Medium (verify index behavior + add pre-check)

### H-5: Missing `charge.dispute.created` Webhook Handler
**Known gap IR GAP 3 — still open**

- Stripe chargebacks are not handled. If a buyer disputes a charge, the app has no visibility.
- **Impact**: Admin has no notification of disputes. No automated response. Could miss dispute deadlines (losing the dispute by default).
- **Fix**: Add `charge.dispute.created` handler to webhook route. Notify admin. Consider auto-pausing vendor if pattern.
- **Effort**: Small-Medium (webhook handler + admin notification)

### H-6: Webhook Out-of-Order Handling
**Known gap IR GAP 5 — still open**

- `payment_intent.succeeded` can arrive before `checkout.session.completed`
- The app expects checkout.session.completed first (it creates the order)
- **Impact**: payment_intent.succeeded handler may fail or no-op if order doesn't exist yet. Resilience gap.
- **Fix**: Either make `payment_intent.succeeded` idempotent (check if order exists, skip if not), or add a brief retry/queue mechanism
- **Effort**: Medium

### H-7: FT No-Show Timing Not Implemented Per Decision
**Known gap OL-R19 — user decided 1hr after pickup, code uses date-only**

- User decided in Session 54 that FT no-show should be 1hr after scheduled pickup time
- Code currently uses date-only comparison (end of day)
- **Impact**: FT vendors can't mark no-shows until end of day instead of 1hr after pickup
- **Fix**: Update no-show logic to compare against `pickup_time + 1hr`
- **Effort**: Small (cron phase + possibly vendor action route)

---

## MEDIUM — Important but Not Blocking Launch

### M-1: Stripe Webhook Notifications Can Duplicate
**Known gap NI GAP 3**

- `payout_processed`, `payout_failed`, `order_refunded` notifications have no deduplication
- Stripe can retry webhooks, causing duplicate notifications to vendors/buyers
- **Fix**: Add `notification_key` deduplication check before sending (the notifications table may already support this)
- **Effort**: Small

### M-2: `payout_failed` Notification Type Misused for Tier Expiration
**Known gap NI GAP 2**

- Tier expiration sends `payout_failed` notification type instead of a dedicated type
- Confusing for vendors — they see "payout failed" when their tier actually expired
- **Fix**: Add `subscription_expired` notification type (NI-Q3 decision needed)
- **Effort**: Small

### M-3: Quality Checks Don't Filter by Vertical
**Agent 6 finding**

- All 5 quality check functions query globally, not per-vertical
- A food truck vendor's quality issues show up alongside farmers market vendor issues
- **Impact**: Admin sees mixed results. Not a data integrity issue but a UX/operational issue.
- **Fix**: Add vertical_id filter to quality check queries
- **Effort**: Small (5 query modifications)

### M-4: Two Availability Systems Can Disagree
**Agent 4 finding**

- SQL RPC `get_available_pickup_dates()` and JS `processListingMarkets()` use different logic
- If one is updated and the other isn't, they can return different available dates
- **Impact**: Cart shows different availability than listing page. Confusing but not necessarily a data loss.
- **Fix**: Consolidate to single source of truth (likely the RPC, with JS as formatting layer)
- **Effort**: Large (significant refactor — defer post-launch)

### M-5: Hardcoded `America/Chicago` Timezone Default
**Agent 4 finding**

- Availability calculations fall back to America/Chicago when no timezone specified
- Decision log says "never hardcode timezone" but this default exists
- **Impact**: Vendors/buyers outside Central Time zone see wrong cutoff times if timezone isn't explicitly set
- **Fix**: Require timezone from client or derive from market location. Remove hardcoded default.
- **Effort**: Medium

### M-6: `buyer_search_log` Table Exists But No Code Writes to It
**Agent 7 finding**

- Schema has a `buyer_search_log` table but no code ever inserts into it
- **Impact**: No impact on functionality — it's unused infrastructure. But it was presumably created for analytics.
- **Fix**: Either implement search logging or drop the table. Low priority.
- **Effort**: Small (implement) or trivial (drop)

### M-7: FM Category Selection Missing from Signup Form
**Agent 3 finding**

- FM vendor signup uses `vendor_type` field but doesn't present category selection
- FT signup properly handles food truck categories
- **Impact**: FM vendors may not get proper category classification during onboarding
- **Fix**: Add category selection step to FM vendor signup flow
- **Effort**: Medium

### M-8: `buyer_order_confirmed` Notification Missing at Checkout
**Agent 7 finding**

- When a buyer completes checkout, no `order_confirmed` notification is sent to the buyer
- Vendor gets notified of new order, but buyer doesn't get confirmation
- **Impact**: Buyer has no notification confirming their order. They rely on the success page only.
- **Fix**: Add `sendNotification()` call for buyer in checkout success/webhook handler
- **Effort**: Small

### M-9: 8-Week Subscription Base Price Fallback
**Agent 1 finding**

- Market box subscription checkout uses a fallback base price if Stripe metadata is missing
- **Impact**: If metadata isn't set, vendor payout could be based on wrong amount
- **Fix**: Ensure `base_price_cents` is always in Stripe metadata. Add validation.
- **Effort**: Small

### M-10: Data Retention Cleanup Is Global, Not Per-Vertical
**Agent 6 finding**

- Cron data retention cleanup doesn't consider vertical-specific retention policies
- **Impact**: Low — both verticals currently use same retention periods. But if they diverge, this becomes an issue.
- **Fix**: Add vertical awareness to retention queries. Defer unless policies diverge.
- **Effort**: Small

### M-11: Payout Record Insertion Not Guaranteed Atomic
**Agent 2 finding**

- After Stripe transfer succeeds, the DB insert of the payout record could fail
- Vendor gets paid but no record in the app
- **Impact**: Financial tracking gap — Stripe has the transfer but app doesn't know about it
- **Fix**: Use transaction or RPC to make transfer + record atomic, or add reconciliation
- **Effort**: Medium

### M-12: Prorated Flat Fee Rounding Error
**Agent 1 finding**

- `STRIPE_CONFIG.buyerFlatFeeCents` is per order ($0.15), prorated per item with `Math.round(fee / totalItems)`
- On 2-item orders: `Math.round(15/2)` = 8 + 8 = 16 cents (off by 1 cent)
- **Impact**: Buyer pays 1 cent extra on some multi-item orders. Tiny but technically wrong.
- **Fix**: Use floor for all items except last, which gets the remainder
- **Effort**: Trivial

---

## LOW — Nice to Have / Post-Launch

### L-1: No Health Check Endpoint (IR GAP 4)
- No `/api/health` or equivalent for monitoring
- **Fix**: Simple endpoint returning 200 + DB connectivity check
- **Effort**: Trivial

### L-2: No External Cron Monitoring (IR-Q4)
- Cron jobs run on Vercel cron but have no external heartbeat/monitoring
- If cron silently fails, no alert fires
- **Fix**: Integrate with free monitoring service (e.g., Cronitor, Better Uptime)
- **Effort**: Small

### L-3: `createVerifiedServiceClient` Defined but Never Used
**Agent 5 finding**

- A more secure service client pattern was defined but no routes adopted it
- **Fix**: Gradual adoption where service client is used. Not urgent.
- **Effort**: Medium (many routes to update — do incrementally)

### L-4: Input Validation Inconsistent (Zod Only on Signup)
**Agent 5 finding**

- Only vendor signup uses Zod validation. Other routes use manual checks.
- **Fix**: Gradually add Zod schemas to other routes. Not blocking.
- **Effort**: Large (many routes — do incrementally post-launch)

### L-5: Email Logo URL May Use Wrong Domain
**Agent 7 finding**

- Email templates may reference logo from wrong vertical domain
- **Fix**: Ensure logo URL is parameterized by vertical
- **Effort**: Trivial

### L-6: SMS Sends Even When Push Enabled
**Agent 7 finding — needs verification**

- Agent reported SMS sends independently of push, but service.ts line 365 may handle this
- **Verify**: Check if the SMS-skip-when-push logic is working correctly
- **Effort**: Trivial (if already handled) to Small (if not)

### L-7: Timing Attack in Cron Auth
**Agent 5 finding — very minor**

- Cron authorization header check does a length comparison that could leak info via timing
- **Impact**: Extremely low risk — cron secret would need to be brute-forced
- **Fix**: Use constant-time comparison
- **Effort**: Trivial

### L-8: Small Order Fee Not Tracked in Vendor Payouts
**Agent 1 finding**

- Platform collects small order fee but it's not broken out in payout records
- **Impact**: Accounting/reporting gap, not a correctness issue
- **Fix**: Add `small_order_fee_cents` field to payout tracking
- **Effort**: Small

---

## Open Decisions Needed (User Input Required)

These items are blocked on business decisions, not technical work:

| ID | Question | Context |
|----|----------|---------|
| SL-Q2 | Buyer market box cancellation policy | Can buyers cancel? Refund rules? |
| OL-Q7 | Cash order full lifecycle | What happens when vendor marks cash order complete? |
| NI-Q3 | Add `subscription_expired` notification type? | Currently misuses `payout_failed` |
| NI-Q4 | Should critical notifications bypass tier gating? | Emergency/financial notifications for free-tier vendors |
| IR-Q1 | Add health check endpoint? | Simple but needs agreement |
| IR-Q3 | Chargeback webhook handling scope | Auto-pause vendor? Admin-only notification? |
| IR-Q4 | External cron monitoring service | Cronitor? Better Uptime? |
| AC-Q2 | Adopt `createVerifiedServiceClient` pattern? | More secure but requires migration effort |
| VI-Q1 | Cross-vertical shared identity | Shared Supabase auth — is this OK long-term? |

---

## Backlog Staleness — Items to Remove

These items are currently on the backlog as open issues but have been **fixed**:

1. **`atomic_decrement_inventory` overselling** — FIXED by migration 078. RAISE EXCEPTION on insufficient stock.
2. **Fulfill route payout failure handling** — FIXED with H-1 FIX in fulfill/route.ts:283-319.

These should be removed from the backlog or marked resolved.

---

## Resolved Gaps (Previously Documented as Open)

For the record, these 5 gaps from the business rules document are now **confirmed fixed** in current code:

1. `atomic_decrement_inventory` overselling → Migration 078
2. Fulfill route payout failure handling → H-1 FIX
3. Listing publication gate client-only → Migration 078 C-2
4. No auto-miss for market box pickups → Cron Phase 4.7
5. No email unsubscribe link → List-Unsubscribe headers + footer

Additionally, 2 gaps that were previously flagged are now resolved:
- `/api/subscriptions/verify` auth → C-3 FIX added authentication
- Auto-pause excess listings on subscription cancel → M-1 FIX in `handleSubscriptionDeleted`

---

## Recommended Fix Order for Launch

**Priority 1 — Fix before any real vendor onboards:**
1. C-1: COI gate conflict (blocks ALL publishing)
2. C-2: Cancellation fee split calculation

**Priority 2 — Fix before significant order volume:**
3. H-2: Inventory restored before refund confirmation
4. H-3: Concurrent cancellation race condition
5. H-4: Market box payout race condition (verify unique index protection)
6. M-8: Buyer order confirmed notification (simple, high UX value)

**Priority 3 — Fix within first 2 weeks of launch:**
7. H-1: Checkout availability re-validation
8. H-5: Chargeback webhook handler
9. H-6: Webhook out-of-order handling
10. H-7: FT no-show timing
11. M-1: Notification deduplication
12. M-12: Prorated flat fee rounding

**Priority 4 — Post-launch improvements:**
13-25. Remaining Medium and Low items in order of effort/impact ratio

---

## Strengths Noted

The audit also identified significant strengths worth preserving:

- **Security posture**: All 157 API routes have authentication, rate limiting, and error tracing. This is excellent.
- **Idempotent cron**: All 10+ cron phases have independent error handling — one phase failing doesn't break others.
- **Multi-vertical isolation**: Queries consistently filter by `vertical_id`. Branding is parameterized.
- **Error tracking**: Sentry integration with `withErrorTracing` wrapper provides structured error categorization.
- **Financial safety**: `atomic_decrement_inventory` now properly rejects overselling. Payout unique indexes prevent duplicates at DB level.
- **Notification system**: 26+ types across 4 channels with proper per-vertical branding and unsubscribe support.

---

*This report is based on code as of 2026-03-14. No code changes were made during this audit.*
