# Current Task: Session 52 — Implement Session 51 Audit Fixes
Started: 2026-03-12

## Goal
Implement fixes for 40 findings from Session 51 comprehensive systems audit.

## Mode: Fix (user approved all changes)

## SESSION STATUS: 32 of 40 items addressed. Ready to commit.

## CRITICAL CONTEXT FOR CONTINUATION

### What's Been Done (COMPLETED)

**Phase 2: Trivial fixes — COMPLETE**
- [x] M-8: Fixed stale comments in `vendor-limits.ts` line 6-7 (FM Premium $24.99→$25, FT Pro $30→$25)

**Phase 3: Database migration + code changes — PARTIALLY COMPLETE**
- [x] Migration `20260312_078_session52_audit_fixes.sql` WRITTEN (NOT YET APPLIED):
  - C-1: Rewrote `atomic_decrement_inventory()` — RAISE EXCEPTION on oversell + auto-draft listing when qty=0
  - C-2: Added `can_vendor_publish()` check to `enforce_listing_tier_limit()` trigger
  - H-8: Created `atomic_restore_inventory()` RPC (atomic add-back)
  - M-7: Fixed `is_platform_admin()` to check both 'admin' AND 'platform_admin' roles
  - M-13: Added `cancellation_fee_cents` column to `order_items`
- [x] L-5: Fixed market suggestion status `'active'` → `'pending'` in `src/app/api/vendor/markets/suggest/route.ts:118`
- [x] M-13: Updated cancel route to persist `cancellation_fee_cents` in `src/app/api/buyer/orders/[id]/cancel/route.ts:151`
- [x] H-8: Rewrote `src/lib/inventory.ts` to use `atomic_restore_inventory` RPC instead of read-then-update
- [x] C-1: Updated `src/app/api/checkout/session/route.ts` — handles RAISE EXCEPTION from RPC, returns clear error
- [x] C-1: Updated `src/app/api/checkout/external/route.ts` — same + sends `inventory_out_of_stock` notification to vendor when qty hits 0

**Pending migrations (already existed before this session, NOT YET APPLIED):**
- `20260302_063_fix_original_end_date.sql` — L-6 fix (original_end_date NULL)
- `20260302_064_market_box_tier_trigger.sql` — M-9 fix (market box tier limit enforcement)

### What's NOT Done Yet (REMAINING)

**Phase 4: API Route Fixes — COMPLETE**
- [x] C-3: Added auth to `/api/subscriptions/verify` — getUser() + user_id match check
- [x] H-1: Separated fulfillment from payout — transfer failure now inserts `status='failed'` payout, keeps item 'fulfilled', Phase 5 retries
- [x] H-7: Vertical admin scope — added `verifyAdminScope()` helper to admin.ts, applied to errors/reports/quality-checks/feedback routes. Fixed errors route using `hasPlatformAdminRole` instead of `hasAdminRole`.
- [x] M-3: Vertical validation — created `src/lib/validation/vertical.ts` with `VALID_VERTICALS`, `validateVertical()`, `requireVertical()`. Updated middleware.ts + vendor-signup.ts to use shared constant.
- [ ] M-2: Deep investigation of vendor confirm time-based guard — user wants detailed report BEFORE any fix. Must trace full status progression.
- [x] L-2: Added `/api/health` endpoint — DB connectivity check via verticals table
- [x] L-4: Stricter email validation — added regex `.refine()` after Zod `.email()` in vendor-signup.ts

**Phase 5: Notification & Email — COMPLETE**
- [x] H-5: Email unsubscribe — added List-Unsubscribe header + footer link to settings page. Full token-based one-click unsubscribe deferred.
- [x] H-6: Webhook notification dedup — added `wasNotificationSent()` helper to webhooks.ts, applied to all 6 sendNotification calls (payout_processed, payout_failed, order_refunded)
- [x] H-11: Investigated — only `catering_request_received` is unused scaffolding. Other 5 event types are actively used. No fix needed.
- [x] M-1: Auto-pause excess listings on tier downgrade — added to `handleSubscriptionDeleted()` in webhooks.ts. Counts published listings vs free tier limits, pauses newest excess.
- [x] M-4: Created `subscription_expired` notification type in types.ts + updated Phase 8 to use it instead of `payout_failed`

**Phase 6: Cron & Lifecycle — MOSTLY COMPLETE**
- [x] H-3: Per-vertical auto-miss — FM=48h, FT=2h. Shortest cutoff for DB query, per-vertical check in loop.
- [x] H-9: Stale 'processing' payouts — 7+ day 'processing' payouts marked as 'failed' for retry before expired payout check.
- [x] H-10: Atomic Phase 4 no-show payout — insert 'pending' record FIRST, then transfer, then update status.
- [x] M-11: Cancellation fee retry — cancel route now creates vendor_payouts record with atomic pattern, Phase 5 retries failures.
- [x] M-12: Auto-expire stale confirmed orders — Phase 4.6 added. 7+ day old confirmed items with past pickup dates → expired.
- [x] M-15: External payment double-confirmation guard — conditional UPDATE with `external_payment_confirmed_at IS NULL`, checks affected row count.
- [ ] H-2: Market box cancellation flow — review existing grace period code for regular orders FIRST, then implement same flow for market boxes
- [x] L-9: Dynamic Sentry trace sampling — 100% for cron, 10% for regular. Applied to both server + edge configs.

**Phase 7: Performance — PARTIALLY COMPLETE**
- [ ] M-16: Nearby vendors DB-level pagination (DEFERRED — requires more investigation)
- [x] M-14: SMS fallback when push fails — added to push case in sendNotification, triggers SMS when all push subscriptions fail.

**Remaining (3 items for next session):**
- [ ] M-2: Investigation COMPLETE. Vendor confirm 30-sec window traced. User must review before any fix.
- [ ] H-2: Market box cancellation flow — needs code review of existing grace period first
- [ ] M-16: Nearby vendors DB-level pagination — deferred

## M-2 Investigation Report: Vendor Confirm Time-Based Guard

### Full Lifecycle:
1. **T+0s**: Buyer clicks "I picked up" → `buyer_confirmed_at` set, `confirmation_window_expires_at` = T+30s
2. **T+0-30s**: Vendor has 30-second window to confirm → sets `vendor_confirmed_at`, triggers payout
3. **T+30s**: Window expires mathematically
4. **T+5m30s**: Cron Phase 7 auto-fulfills if vendor didn't confirm (5min leeway)

### Key Files:
- Buyer acknowledge: `src/app/api/buyer/orders/[id]/confirm/route.ts`
- Vendor confirm: `src/app/api/vendor/orders/[id]/confirm-handoff/route.ts`
- Window constant: `src/lib/cron/order-timing.ts:28` (CONFIRMATION_WINDOW_SECONDS=30)
- Stale check: `src/lib/cron/order-timing.ts:55-59` (isConfirmationWindowStale)
- Cron auto-fulfill: Phase 7 of expire-orders

### Columns: buyer_confirmed_at, vendor_confirmed_at, confirmation_window_expires_at, lockdown_active, lockdown_initiated_at

### Edge case: If vendor fulfills FIRST (before buyer acknowledges), buyer acknowledge auto-completes both — no window needed.

### Items SKIPPED/DEFERRED (user decisions)
- M-5: Keep `sendNotificationBatch()` as-is (future broadcast feature)
- M-10: Cash order lifecycle — user still deciding, skip
- H-4: External checkout duplicate detection — user says acceptable behavior, not a bug
- L-3: Sentry Crons — plan for future, added to todo
- L-7: Sentry env vars — user will add manually
- L-8: Vendor status state machine — skip (user may need direct SQL updates)
- L-10: Rate limit optimization — monitor via Upstash dashboard
- L-1: CLAUDE_CONTEXT.md update — do at end of session

### Items ALREADY EXISTED (just need to be applied)
- M-9: Migration 064 (`20260302_064_market_box_tier_trigger.sql`) — pending
- L-6: Migration 063 (`20260302_063_fix_original_end_date.sql`) — pending

## Investigation Results (KEY FINDINGS — preserve these)

### C-2: can_vendor_publish() in trigger
- SAFE. Trigger only fires on status='published'. Drafts still allowed.
- Uses `COALESCE(NEW.category, 'Unknown')` for category param.
- No admin code path creates/publishes listings directly.

### C-3: Add auth to subscriptions/verify
- SAFE. Called from `src/app/[vertical]/subscription/success/page.tsx` AFTER Stripe redirect.
- User's session cookie already present. Adding `getUser()` check won't break flow.
- Route handles vendor, buyer, and food_truck_vendor types.

### H-1: Fulfill route refactor
- 'failed' payout status ALREADY EXISTS in enum (from migration 035).
- Phase 5 explicitly queries `status='failed'` and retries transfers.
- Fix: On transfer failure, insert payout with status='failed', keep item 'fulfilled'.

### H-7: Vertical admin scope
- Approve/reject routes ALREADY have scope checks (lines 38-56 in approve route).
- GAP: Read-only admin routes (errors, reports, quality-checks, feedback) don't check scope.
- `src/lib/auth/admin.ts` has `isPlatformAdminCheck()`, `hasPlatformAdminRole()`, `verifyAdminForApi()`.

### M-1: Tier downgrade auto-pause
- HIGH severity — allows subscription evasion (downgrade to free, keep premium listings).
- Phase 10c has the unpublish logic but requires `trial_grace_ends_at IS NOT NULL`.
- Fix: Extend Phase 10c OR create new cron sub-phase that checks tier vs published count.

### H-6: Webhook notification dedup
- Phase 4.5 (lines 776-788) has working dedup pattern: batch query recent notifications, build Set, check before sending.
- Apply same pattern to webhook handlers in `src/lib/stripe/webhooks.ts`.

### H-9: Stale processing payouts
- Phase 5 retries `status='failed'` but NOT `status='processing'`.
- Fix: Add check for `status='processing' AND created_at < 7 days ago` → mark as 'failed'.

### H-10: Non-atomic Phase 4 payout
- Transfer happens first, then DB insert. If insert fails, money sent but no record.
- Fix: Insert payout with status='pending' FIRST, then transfer, then update to 'processing'.

### Phase 1 Explanations Given to User
- M-4: Phase 8 misuses `payout_failed` for tier expiration → vendor sees "$0.00 payout for order #subscription failed". Fix: dedicated `subscription_expired` type.
- M-5: `sendNotificationBatch()` is dead code. User wants to keep for future broadcast feature.
- M-10: Cash lifecycle traced. Gap: vendor confirms but never fulfills → order stuck in 'paid' forever. User still deciding.
- H-3: Phase 4.7 has hardcoded 2-day window, no per-vertical config. User decided: FM=2 days, FT=2 hours.
- H-4: External checkout: cart cleared immediately after order. Duplicate requires manual re-add. User says acceptable behavior.
- L-3: External cron monitoring options: Sentry Crons (free), external ping services ($10-30/mo), DIY sendNotification. User: plan Sentry Crons for future.
- L-4: Zod `.email()` too permissive. Fix: add stricter regex.
- L-7: 4 Sentry env vars needed: NEXT_PUBLIC_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN.
- L-8: Vendor status state machine — 5 states, no DB enforcement. User: skip (needs SQL flexibility).
- L-9: Sentry tracesSampleRate=0.1 → 90% chance cron invisible. Fix: dynamic sampling (100% cron, 10% regular).
- L-10: 146/155 routes covered. 94% coverage excellent. User: monitor via Upstash.

## Files Modified This Session
**Phase 2-3 (pre-compaction):**
- `src/lib/vendor-limits.ts` — M-8: Fixed stale pricing comments (line 6-7)
- `supabase/migrations/20260312_078_session52_audit_fixes.sql` — NEW: C-1, C-2, H-8, M-7, M-13
- `src/app/api/vendor/markets/suggest/route.ts` — L-5: status 'active' → 'pending' (line 118)
- `src/app/api/buyer/orders/[id]/cancel/route.ts` — M-13: persist cancellation_fee_cents + M-11: atomic cancellation fee payout
- `src/lib/inventory.ts` — H-8: Rewrote to use atomic_restore_inventory RPC
- `src/app/api/checkout/session/route.ts` — C-1: Handle RAISE EXCEPTION from inventory RPC
- `src/app/api/checkout/external/route.ts` — C-1: Handle RAISE EXCEPTION + vendor notification on qty=0

**Phase 4+ (post-compaction):**
- `src/app/api/subscriptions/verify/route.ts` — C-3: Auth check + user_id match
- `src/app/api/health/route.ts` — L-2: NEW health check endpoint
- `sentry.server.config.ts` — L-9: Dynamic trace sampling
- `sentry.edge.config.ts` — L-9: Dynamic trace sampling
- `src/lib/notifications/types.ts` — M-4: subscription_expired type + previousTier/newTier fields
- `src/app/api/cron/expire-orders/route.ts` — M-4 (Phase 8), H-3 (Phase 4.7 per-vertical), H-9 (stale processing), H-10 (atomic Phase 4), M-12 (Phase 4.6)
- `src/app/api/vendor/orders/[id]/fulfill/route.ts` — H-1: Separate fulfillment from payout
- `src/lib/validation/vendor-signup.ts` — L-4: Stricter email regex + M-3: vertical import
- `src/lib/validation/vertical.ts` — M-3: NEW vertical validation utility
- `src/middleware.ts` — M-3: Import shared VALID_VERTICALS
- `src/lib/auth/admin.ts` — H-7: verifyAdminScope() helper
- `src/app/api/admin/feedback/route.ts` — H-7: Vertical scope enforcement
- `src/app/api/admin/quality-checks/route.ts` — H-7: Vertical scope enforcement
- `src/app/api/admin/reports/route.ts` — H-7: Vertical scope enforcement
- `src/app/api/admin/errors/route.ts` — H-7: Fix hasPlatformAdminRole
- `src/lib/stripe/webhooks.ts` — H-6: Notification dedup + M-1: Auto-pause excess listings on downgrade
- `src/lib/notifications/service.ts` — M-14: SMS fallback + H-5: List-Unsubscribe header + footer link
- `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts` — M-15: Atomic double-confirmation guard

## Git State
- Branch: main
- All changes are LOCAL (not committed, not pushed)
- No migration has been applied yet — migration 078 needs user to run in SQL Editor
- TypeScript: 0 errors
