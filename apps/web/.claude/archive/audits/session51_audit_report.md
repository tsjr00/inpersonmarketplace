# Session 51 — Comprehensive Systems Audit Report
**Date:** 2026-03-11
**Scope:** Full codebase, schema, business rules, API routes, cron jobs, notifications, vertical isolation
**Mode:** Report only (no code changes)
**Method:** Direct file reading + 4 parallel deep-dive agents (API security, checkout flow, vertical isolation, cron/notifications/infra)

---

## Executive Summary

The InPersonMarketplace codebase is **production-capable with targeted fixes**. The architecture is sound — multi-vertical isolation scores 8.2/10, API security posture is good (155 routes audited, no critical auth bypasses), checkout flow is solid with proper guards at every step, and the notification system covers all major lifecycle events.

**However, there are revenue-impacting and data-integrity issues that should be fixed before launch:**
- 3 CRITICAL issues that could cause financial loss or security exposure
- 11 HIGH issues that impact operational reliability or financial accuracy
- 16 MEDIUM issues affecting correctness or code quality
- 10 LOW issues for post-launch improvement

The codebase has strong foundations: proper Stripe webhook verification, comprehensive rate limiting, forward-only status transitions, double-payout prevention, and idempotent handlers. The issues found are mostly edge cases in failure paths, missing lifecycle guards, and gaps in the newer subsystems (catering, events, market boxes).

---

## CRITICAL — Fix Before Launch

These issues can cause direct financial loss, security exposure, or data corruption.

### C-1: `atomic_decrement_inventory` allows overselling
**Source:** Business rules audit (MP-R8), backlog P2
**Impact:** Buyer sees "order placed" but vendor may not have stock
**Details:** DB function uses `GREATEST(0, qty - n)` — silently clamps to 0 instead of rejecting when `quantity < requested`. Business rule MP-R8: "quantity never goes negative."
**Fix:** Migration to change function to `RAISE EXCEPTION` when `quantity < p_quantity`
**Effort:** Small (1 migration)

### C-2: No server-side listing publication gate
**Source:** Business rules audit (VJ Gap 1)
**Impact:** Vendor could bypass onboarding and publish listings via direct Supabase insert
**Details:** RLS only checks `vendor_profile_id` ownership, not vendor approval or onboarding status. DB trigger checks tier limits but not onboarding gates. `can_vendor_publish()` DB function EXISTS but is UNUSED.
**Fix:** Add `can_vendor_publish()` check to the listing insert trigger, or create RLS policy that checks vendor status
**Effort:** Small (1 migration)

### C-3: `/api/subscriptions/verify` uses service client without auth
**Source:** Business rules audit (AC Gap 1), open question AC-Q1
**Impact:** If Stripe `session_id` is leaked/guessed, tier could be activated for any vendor
**Details:** Takes `session_id` as query param, updates vendor/buyer tiers with service client. Only guard is that session_id must be a valid Stripe session.
**Fix:** Add `supabase.auth.getUser()` check — verify authenticated user matches the Stripe session's customer
**Effort:** Small (add auth check to existing route)

---

## HIGH — Fix Before or Immediately After Launch

These issues impact financial accuracy, operational reliability, or could cause user-facing problems under normal operation.

### H-1: Fulfill route conflates fulfillment with payout
**Source:** Backlog P2, status_system_audit.md Q3
**Impact:** On failed Stripe transfer, item reverts to `ready` — but buyer already has it
**Details:** `src/app/api/vendor/orders/[id]/fulfill/route.ts:282-303`. User decided 2026-03-10 to fix this.
**Fix:** Keep `fulfilled` status on transfer failure, insert `vendor_payouts` with `status='failed'` for Phase 5 retry
**Effort:** Medium (route refactor + payout record creation)

### H-2: No buyer cancellation for market box subscriptions
**Source:** Business rules audit (SL Gap 3), open question SL-Q2
**Impact:** Buyers have no way to cancel recurring market box subscriptions
**Details:** `cancelled` status exists in enum but NO code path sets it. No admin override either.
**Decision needed:** Refund policy (prorated? end-of-period? no refund?)

### H-3: No auto-miss for past-due market box pickups
**Source:** Business rules audit (SL Gap 4), open question SL-Q3
**Impact:** Scheduled pickups remain in `scheduled` state indefinitely if nobody acts
**Decision needed:** Auto-miss after how many days? (Code at Phase 4.7 exists but may need tuning)

### H-4: External payment checkout lacks duplicate detection
**Source:** Agent 1 finding
**Impact:** Buyer could accidentally place two identical orders via Venmo/CashApp/PayPal
**Details:** Unlike Stripe checkout (which checks for pending orders at `session/route.ts:130-208`), the external payment path at `/api/checkout/external/route.ts` has no idempotency check.
**Fix:** Add pending order check mirroring Stripe checkout logic
**Effort:** Small-Medium

### H-5: No email unsubscribe link
**Source:** Business rules audit (NI Gap 1), open question NI-Q2
**Impact:** Potential CAN-SPAM/GDPR compliance issue
**Details:** Single HTML email template for ALL notification types has no one-click unsubscribe.
**Fix:** Add unsubscribe link + backend route to manage email preferences
**Effort:** Medium (template + API route + preference storage)

### H-6: Stripe webhook notifications not deduplicated
**Source:** Business rules audit (NI Gap 3)
**Impact:** Webhook redeliveries (up to 16 over 72hr) cause duplicate notifications
**Details:** `payout_processed`, `payout_failed`, `order_refunded` from webhooks have no "already sent" check.
**Fix:** Check notification history before sending, or use idempotency key
**Effort:** Small

### H-7: Vendor admin cross-vertical scope not enforced
**Source:** Agent 3 finding
**Impact:** A vertical admin could theoretically approve/reject vendors in OTHER verticals
**Details:** Vendor approval routes (`/api/admin/vendors/[id]/approve`) don't check `vertical_admins` membership. RLS should block at DB level, but no app-layer guard. Also affects market management, quality checks, activity scans.
**Fix:** Add vertical admin scope check in admin routes
**Effort:** Small-Medium

### H-8: Non-atomic inventory restoration (race condition)
**Source:** Agent 2 finding
**Impact:** Two concurrent cancellations for same listing could lose one inventory update
**Details:** `restoreInventory()` does read-then-update (not atomic RPC like decrement).
**Fix:** Create `atomic_restore_inventory()` RPC mirroring `atomic_decrement_inventory()`
**Effort:** Small (1 migration + 1 code change)
**Risk:** Uncommon but possible — acceptable to defer slightly

### H-9: Market box payout webhook tracking missing
**Source:** Agent 2 finding
**Impact:** If Stripe transfer fails AFTER DB insert with `status='processing'`, status stays `processing` forever
**Details:** `transferMarketBoxPayout()` initiates transfer but doesn't track async failures. Cron Phase 5 retries `failed` but never catches stuck `processing`.
**Fix:** Listen to `transfer.created`/`transfer.reversed` webhooks, or add Phase 5 check for stale `processing` payouts
**Effort:** Medium

### H-10: Cron Phase 4 no-show payout — non-atomic Stripe + DB
**Source:** Agent 4 finding
**Impact:** Stripe transfer can succeed but DB status update can fail = orphaned payment
**Details:** Transfer and DB update are separate operations. If DB update fails after successful transfer, money moves but records don't reflect it.
**Fix:** Wrap in try/catch — on DB failure after successful transfer, log alert for admin review. Or: insert payout record BEFORE transfer, update status after.
**Effort:** Small-Medium

### H-11: 8 notification types defined but never triggered
**Source:** Agent 4 finding
**Impact:** Catering and events notification types exist in code but no route sends them
**Details:** These are likely scaffolding for features still in development. Not a bug per se, but means catering/events workflows are incomplete.
**Fix:** Implement notification triggers when catering/events features are production-ready, or remove unused types
**Effort:** Depends on feature status

---

## MEDIUM — Fix in First Post-Launch Sprint

### M-1: No auto-pause of excess listings on tier downgrade
**Source:** Business rules audit (VJ Gap 2)
**Details:** When vendor is downgraded, existing published listings remain published even if exceeding new tier limits. Trial grace expiry (Phase 10) handles this, but paid-to-free downgrade doesn't.
**Fix:** Add downgrade handler that auto-pauses excess listings
**Effort:** Small-Medium

### M-2: Vendor confirm route has no time-based guard
**Source:** Business rules audit (OL-Q1)
**Details:** Vendor can confirm an item at any time, even days after expiration. Should reject items where `expires_at < NOW()`.
**Fix:** Add timestamp check to confirm route
**Effort:** Small

### M-3: API routes don't validate vertical param
**Source:** Agent 3 finding
**Details:** Many routes accept `vertical` as query/body param but don't validate against allowed verticals list. RLS policies should prevent cross-vertical data access, but no application-layer validation.
**Fix:** Add vertical validation middleware or utility
**Effort:** Small (utility function + apply to routes)

### M-4: `payout_failed` type misused for tier expiration
**Source:** Business rules audit (NI Gap 2)
**Details:** Cron Phase 8 sends `payout_failed` with `orderNumber: 'subscription'`, `amountCents: 0`. Message reads "A payout of $0.00 for order #subscription could not be processed."
**Fix:** Add dedicated `subscription_expired` notification type
**Effort:** Small

### M-5: `sendNotificationBatch()` is dead code
**Source:** Business rules audit (NI Gap 5)
**Details:** Exported but never called.
**Fix:** Remove or use it
**Effort:** Trivial

### M-6: `createVerifiedServiceClient()` defined but never used
**Source:** Business rules audit (AC Gap 2)
**Details:** Safer pattern at `server.ts:56-84` that checks admin role before creating service client. No route uses it.
**Fix:** Adopt in admin routes or remove
**Effort:** Small per route

### M-7: `is_platform_admin()` DB function inconsistent with TS code
**Source:** Business rules audit (AC Gap 3)
**Details:** DB function only checks `role='admin'`, TS code checks BOTH `admin` and `platform_admin`. If user has only `role='platform_admin'`, DB-level RLS won't recognize them.
**Fix:** Update DB function to check both roles
**Effort:** Small (1 migration)

### M-8: Vendor pricing comments stale
**Source:** Direct reading
**Details:** `vendor-limits.ts` line 7 says FM Premium is $24.99/mo and FT Pro is $30/mo. Actual constants in `pricing.ts` are $25 each per decisions log.
**Fix:** Update comments
**Effort:** Trivial

### M-9: No DB-level market box limit trigger
**Source:** Business rules audit (SL Gap 6)
**Details:** Unlike listings (`enforce_listing_tier_limit`), market box creation has no DB guard. Direct Supabase writes bypass API-level tier limits.
**Fix:** Add `enforce_market_box_tier_limit` trigger
**Effort:** Small (1 migration)

### M-10: Cash order lifecycle undefined
**Source:** Business rules audit (OL-Q7), open question
**Details:** Cash orders excluded from Phase 3.6 auto-confirm (verified in code). Vendor must manually confirm — but what if they never do? No reminder or escalation specific to cash.
**Decision needed:** What happens to unconfirmed cash orders? Auto-cancel after X days?

### M-11: Cancellation fee vendor transfer can fail silently
**Source:** Agent 2 finding
**Details:** When buyer cancels after grace period, vendor's 25% fee share transfer can fail. Logged to console but no admin escalation, no retry mechanism.
**Fix:** Add failed cancellation fee transfers to Phase 5 retry logic
**Effort:** Small

### M-12: Stale confirmed orders never auto-expire
**Source:** Agent 2 finding
**Details:** After Phase 4.5 sends 2 vendor notifications, no further action. Vendor can leave order in `confirmed` state indefinitely.
**Fix:** Add Phase 4.6 auto-expire after configurable window (3-7 days)
**Effort:** Small-Medium

### M-13: Refund amounts not persisted for audit
**Source:** Agent 2 finding
**Details:** `refund_amount_cents` stored but NOT `cancellation_fee_cents`. Fee amounts calculated at cancellation time but only returned in JSON response.
**Fix:** Add `cancellation_fee_cents` column to `order_items`
**Effort:** Small (1 migration + 1 code change)

### M-14: SMS skipped if push enabled, no fallback
**Source:** Agent 4 finding
**Details:** If push is enabled for a user, SMS is auto-skipped (`service.ts:365`). But if push fails silently (browser permissions revoked, service worker removed), the notification is lost.
**Fix:** Consider sending SMS as fallback when push delivery can't be confirmed
**Effort:** Medium (push delivery tracking is complex)

### M-15: Phase 3.5/3.6 external payment double-confirmation race
**Source:** Agent 4 finding
**Details:** If vendor confirms payment via UI at the same moment Phase 3.6 auto-confirms, both could succeed creating duplicate records or conflicting state.
**Fix:** Add DB-level guard (unique constraint or check) on external payment confirmation
**Effort:** Small

### M-16: `/api/vendors/nearby` loads full result set before pagination
**Source:** Agent 4 finding
**Details:** Entire result set loaded in memory before slicing for pagination. Could cause OOM at scale with thousands of vendors.
**Fix:** Use DB-level pagination (LIMIT/OFFSET) or cursor-based pagination
**Effort:** Small-Medium

---

## LOW — Post-Launch / Nice-to-Have

### L-1: `CLAUDE_CONTEXT.md` 10+ sessions behind
Last updated Session 40, now at Session 51. Update during next session end checkpoint.

### L-2: No health check endpoint
No `/api/health` for monitoring DB connectivity. Standard practice for production apps.

### L-3: No external cron monitoring
If cron crashes entirely, only Vercel built-in catches it. Consider pinging external monitor on success.

### L-4: Email validation regex too permissive
Allows `user@domain.` or `user@.com` in forms.

### L-5: Market suggestion creates active market before admin approval
`status='active'` + `approval_status='pending'`. Security depends on buyer-facing queries filtering.

### L-6: `original_end_date` may be NULL on market box subscriptions
Function doesn't set it.

### L-7: Sentry env vars not in `.env.example`
4 required vars missing from template.

### L-8: No vendor status state machine enforcement
Nothing prevents invalid transitions at DB level.

### L-9: Sentry trace sample rate 10% = sparse cron visibility
Cron runs daily, 10% sampling means most runs not traced. Consider 100% for cron routes.

### L-10: Upstash free tier may be insufficient for production
10K commands/day, each rate limit check ≈ 2 commands. At 155 routes with moderate traffic, could hit limit.

---

## Verified Working (No Action Needed)

These areas were audited and confirmed correct:

- **Order status transitions** — guarded at every step, forward-only
- **Inventory reservation** — at checkout (not payment success)
- **Stripe session creation** — before order record (clean failure pattern)
- **Tip calculation** — vendor food cost only, platform gets rest, per-item rounding
- **Flat fee proration** — correct across items for vendor payout
- **Double-payout prevention** — unique constraints + query checks
- **Order completion** — atomic RPC prevents race on dual confirmation
- **Cancellation fee split** — buyer 75%, vendor 25% (correct)
- **Multi-vertical isolation** — all order queries filtered by `vertical_id`
- **Idempotent handlers** — payment record, vendor notifications, cart clear
- **Rate limiting** — comprehensive across all 155 routes
- **Duplicate order prevention** — Stripe checkout reuses pending sessions
- **Market box at-capacity** — auto-refund buyer when capacity exceeded
- **Webhook verification** — Stripe + Resend both properly verified
- **Phase 3.6 cash exclusion** — code correctly excludes cash orders (matches OL-R18)
- **Vertical theming** — CSS var injection, `term()` system, design tokens all correct
- **Feature isolation** — tipping (FT-only), premium tier (FM-only) properly gated
- **13+ tables with `vertical_id`** — all properly structured with FKs

---

## Open Questions Needing User Decisions

| # | Question | Category | Impact |
|---|----------|----------|--------|
| 1 | Should buyers be able to cancel market box subscriptions? Refund policy? (SL-Q2) | Feature | Blocks H-2 |
| 2 | Should past-due market box pickups auto-miss? After how many days? (SL-Q3) | Lifecycle | Blocks H-3 |
| 3 | Should `/api/subscriptions/verify` require authentication? (AC-Q1) | Security | Blocks C-3 |
| 4 | Add email unsubscribe links for CAN-SPAM compliance? (NI-Q2) | Compliance | Blocks H-5 |
| 5 | Should immediate/urgent notifications skip tier gating for ALL vendors? (NI-Q4) | Notifications | Policy |
| 6 | Implement health check endpoint? (IR-Q1) | Monitoring | L-2 |
| 7 | Handle `charge.dispute.created` webhook? What action on chargeback? (IR-Q3) | Financial | Missing C-4 from prior audit |
| 8 | Should cron jobs ping external monitoring service? (IR-Q4) | Reliability | L-3 |
| 9 | Full cash order lifecycle — what happens if vendor never confirms? (OL-Q7) | Lifecycle | M-10 |

---

## Recommended Priority Order for Pre-Launch Fixes

**Sprint 1 (Critical path — do these first):**
1. C-1: Fix `atomic_decrement_inventory` to reject overselling
2. C-2: Wire up `can_vendor_publish()` in listing insert trigger
3. C-3: Add auth to `/api/subscriptions/verify` (pending AC-Q1 decision)
4. H-1: Separate fulfillment from payout in fulfill route
5. H-4: Add duplicate detection to external payment checkout
6. H-6: Deduplicate webhook-triggered notifications

**Sprint 2 (Financial safety + compliance):**
7. H-10: Make Phase 4 no-show payout atomic (or add failure alerting)
8. H-8: Create `atomic_restore_inventory()` RPC
9. H-9: Handle stale `processing` payouts in Phase 5
10. H-5: Email unsubscribe link (pending NI-Q2 decision)
11. M-11: Cancellation fee transfer retry in Phase 5
12. M-13: Persist `cancellation_fee_cents` for audit

**Sprint 3 (Lifecycle completeness):**
13. M-1: Auto-pause excess listings on tier downgrade
14. M-2: Time-based guard on vendor confirm
15. M-12: Auto-expire stale confirmed orders
16. M-7: Fix `is_platform_admin()` DB function
17. M-9: Market box tier limit trigger
18. M-15: External payment double-confirmation guard

**Post-launch (improvements):**
19-30: Remaining MEDIUM and LOW items as capacity allows

---

## Architecture Strengths Worth Preserving

1. **Single source of truth for pricing** (`pricing.ts`) — resist pressure to hardcode fees elsewhere
2. **Forward-only status transitions** — maintain this discipline for new features
3. **Vertical isolation via config** — the `term()` + design tokens pattern scales well
4. **Comprehensive rate limiting** — already in place across all routes
5. **Error tracing pattern** (`withErrorTracing` + `crumb.*`) — continue adopting in new routes
6. **Trial system design** — well-structured cron phases for lifecycle management
7. **Notification abstraction** — 4-channel delivery with per-vertical branding

---

## Methodology Notes

- **155 API routes** examined for auth, authorization, input validation, rate limiting, service client usage
- **11+ cron phases** traced for atomicity, failure handling, lifecycle completeness
- **32+ notification types** checked for trigger coverage and deduplication
- **8 business rule domains** (1300+ lines) cross-referenced against code
- **51 database tables** reviewed for schema consistency
- **4 parallel agents** used for deep-dive analysis of different system areas
- **Phase 3.6 cash order exclusion** — verified in actual code (lines 478, 508 of expire-orders route)
- All findings sourced from code reading and business rules documentation — no assumptions
