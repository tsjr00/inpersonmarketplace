# Current Task: Session 55 — Comprehensive Systems Audit + Fixes

Started: 2026-03-14

## Goal
Thorough codebase and systems review → prioritized findings → user-directed fixes for 28 items.

## Status: FIXES IN PROGRESS — Save point before auto-compaction

### What's Complete

**Audit report**: Written to `.claude/session55_audit_report.md` (2 Critical, 7 High, 12 Medium, 8 Low)

**Code changes in working directory (uncommitted, 23 files changed):**

| Item | Description | Status | Files Changed |
|------|-------------|--------|---------------|
| C1 | COI soft gate for vendors, hard gate for events | ✅ DONE | migration 083, onboarding/status/route.ts, event-approval/route.ts |
| H1 | Checkout availability re-validation | ✅ NO CHANGE NEEDED | Already validates via `is_listing_accepting_orders()` RPC + `atomic_decrement_inventory` |
| H4 | Market box payout race condition | ✅ NO CHANGE NEEDED | Already protected by 3 layers (Stripe idempotency key, app check, DB unique index) |
| H5 | Chargeback webhook handler | ✅ DONE | webhooks.ts, types.ts (charge_dispute_created type added) |
| H6 | Webhook out-of-order handling | ✅ DONE | webhooks.ts (handlePaymentSuccess graceful when no record) |
| M1 | Notification deduplication | ✅ DONE | service.ts (10s time-window dedup before all notifications) |
| M3 | Quality checks vertical filter | ✅ DONE | quality-checks.ts (5 functions), admin/quality-checks/route.ts |
| M7 | FM category selection in signup | ✅ DONE | submit/route.ts (reads 'categories' alongside 'vendor_type') |
| M8 | Buyer order placed notification | ✅ DONE | checkout/success/route.ts, types.ts (order_placed type added) |
| M9 | Market box base price validation | ✅ DONE | checkout/session/route.ts, webhook-utils.ts, checkout/success/route.ts |
| M11 | Payout record atomicity | ✅ DONE | 6 files: webhooks.ts, fulfill, confirm-handoff, buyer/confirm, checkout/success, cron Phase 5+7 |
| M12 | Flat fee proration rounding | ✅ DONE | pricing.ts (new proratedFlatFee functions), cancellation-fees.ts, reject/route.ts, cron, checkout/session |
| L5 | Email logo domain | ✅ NO CHANGE NEEDED | Already parameterized per vertical in email-config.ts |
| L7 | Timing attack in cron auth | ✅ ALREADY FIXED | All 3 cron routes use timingSafeEqual |
| L8 | Small order fee tracking | ✅ NO CHANGE NEEDED | Already tracked in orders.small_order_fee_cents |
| Backlog | L2, L4, L6 updates | ✅ DONE | backlog.md updated, stale items marked resolved |

**Research findings delivered (no code changes):**

| Item | Finding |
|------|---------|
| C2 | Cancellation fee split uses applicationFeePercent (13%) on fee amount → platform gets $0.70 instead of ~$2.68 on $20 order. Platform being shorted. See session55_audit_report.md |
| H2 | 3 options: A) restore only after refund, B) current + compensation, C) two-phase pending restore. Each has pros/cons documented. |
| H3 | Race via: buyer double-click, buyer+vendor simultaneous cancel, cron+manual. No FOR UPDATE lock on order_items. Window is 1-5ms between read and update. |
| L1 | Health check ALREADY EXISTS at /api/health (created Session 49) |
| L3 | createVerifiedServiceClient: creates anon client → verifies admin role (both role + roles[]) → returns service client + userId. Used in 26 admin routes. More secure than plain createServiceClient. |
| M2 | subscription_expired type ALREADY EXISTS in types.ts. No duplication. Not yet called by any code though. |
| M4 | Two availability systems compared in detail. 5 divergence scenarios found. Recommendation: Replace JS with SQL-backed API (Option A, consolidate on RPC). Post-launch or pre-launch depending on priority. |
| M6 | buyer_search_log table exists, no code writes to it. 3 use cases proposed: coverage gap detection, geographic expansion planning, search funnel analytics. |

### Still Pending (not yet implemented)

| Item | Description | Status |
|------|-------------|--------|
| H7 | FT no-show timing (pickup_time + 1hr) | `shouldTriggerNoShow()` EXISTS in no-show.ts with correct logic + tests, but Phase 4 cron does NOT use it yet. Need: import it, add preferred_pickup_time to query, relax filter to `.lte('pickup_date', today)`, gate each item with shouldTriggerNoShow() |
| M5 | Hardcoded America/Chicago timezone | 1 occurrence in listing-availability.ts:176 as fallback. Fix: change to 'UTC'. Low risk since market.timezone is primary. |
| M10 | Data retention per-vertical | Phase 9 cleanup is global. Both verticals have same retention. Adding vertical filter is structural but wouldn't change results. Optional. |
| H2 | Inventory-before-refund fix | User said "do not make any changes — explain options" — DONE (options documented above) |
| H3 | Concurrent cancellation fix | User said "do not make any changes — explain the scenario" — DONE (scenario documented above) |
| C2 | Cancellation fee split fix | User said "show the calculations" — DONE but no fix authorized yet. Math shows platform is shorted ~$2 per $20 cancellation. |
| M4 | Availability system consolidation | User said "report back on status & options" — DONE. No fix authorized. |

### Quality Checks
- **TypeScript**: 0 errors ✅
- **ESLint**: 0 errors, 366 warnings (all pre-existing) ✅
- **Tests**: All passing ✅

### Migration
- `supabase/migrations/20260314_083_coi_soft_gate.sql` — CREATED, NOT YET APPLIED
  - Removes COI check from `can_vendor_publish()` DB function
  - COI now enforced only in event-approval route (hard gate for events)

### Key Decisions Made
- C1: COI is soft gate (vendors publish without COI), hard gate (events require COI) — per user directive
- H1: No change — existing checkout validation is comprehensive
- H4: No change — triple protection already exists (Stripe idempotency + app check + DB unique index)
- L5: No change — email branding already parameterized per vertical
- L7: No change — timingSafeEqual already in all cron routes
- L8: No change — small_order_fee_cents already tracked at order level
- M1: 10-second time-window dedup (per user_id + type) — catches webhook retries without false positives
- M11: "Insert pending first" pattern applied to ALL 6 payout paths (webhooks, fulfill, confirm-handoff, buyer/confirm, checkout/success, cron Phase 7) + stale pending cleanup in Phase 5

### Files Modified (23 total)
- `supabase/migrations/20260314_083_coi_soft_gate.sql` — NEW migration
- `apps/web/.claude/backlog.md` — stale items resolved + L2/L4/L6 added
- `apps/web/.claude/current_task.md` — this file
- `apps/web/.claude/session55_audit_report.md` — NEW audit report
- `apps/web/.claude/session55_audit_research.md` — research notes
- `apps/web/src/app/api/admin/quality-checks/route.ts` — M3 vertical filter
- `apps/web/src/app/api/admin/vendors/[id]/event-approval/route.ts` — C1 COI hard gate
- `apps/web/src/app/api/buyer/orders/[id]/confirm/route.ts` — M11 payout atomicity
- `apps/web/src/app/api/checkout/session/route.ts` — M12 flat fee + M9 basePriceCents
- `apps/web/src/app/api/checkout/success/route.ts` — M8 buyer notification + M11 payout
- `apps/web/src/app/api/cron/expire-orders/route.ts` — M11 Phase 5+7 + M12 flat fee
- `apps/web/src/app/api/submit/route.ts` — M7 FM category
- `apps/web/src/app/api/vendor/onboarding/status/route.ts` — C1 COI removed
- `apps/web/src/app/api/vendor/orders/[id]/confirm-handoff/route.ts` — M11 payout
- `apps/web/src/app/api/vendor/orders/[id]/fulfill/route.ts` — M11 payout
- `apps/web/src/app/api/vendor/orders/[id]/reject/route.ts` — M12 flat fee
- `apps/web/src/lib/__tests__/notification-types.test.ts` — updated counts
- `apps/web/src/lib/notifications/service.ts` — M1 dedup
- `apps/web/src/lib/notifications/types.ts` — order_placed + charge_dispute_created
- `apps/web/src/lib/payments/cancellation-fees.ts` — M12 flat fee
- `apps/web/src/lib/pricing.ts` — M12 proratedFlatFee functions
- `apps/web/src/lib/quality-checks.ts` — M3 vertical filter
- `apps/web/src/lib/stripe/webhook-utils.ts` — M9 base price warning
- `apps/web/src/lib/stripe/webhooks.ts` — H5+H6+M11

### Gotchas
- Migration 083 needs to be applied BEFORE testing COI changes
- M11 "insert pending" pattern requires vendor_payouts to accept status='pending' (already supported)
- M1 dedup uses 10s window — legitimate same-type notifications >10s apart will still send
- Sales tax feature (Session 54) still 2 commits ahead of origin/main, needs staging verification
- `shouldTriggerNoShow()` is ready to use but Phase 4 cron doesn't call it yet (H7 pending)
- M7 fix reads 'categories' field but FM vendor signup form needs 'categories' field added to verticals.config in DB
