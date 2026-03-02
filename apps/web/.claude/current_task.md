# Current Task: Business Rules Audit Responses + Migrations
Started: 2026-03-02

## Goal
Process user's business rules audit responses from Session 49, implement 3 approved migrations, answer remaining questions.

## Session Context — SEO Work (COMPLETED EARLIER TODAY)
- Commit `71775c3`: SEO keyword expansion (cuisines, Texas cities, cottage food, days of week)
- Commit `f26b99e`: Fix branding (Fresh Market → Local Market, remove 815 from public pages)
- Both pushed to staging AND prod. All branches in sync at `f26b99e`.

## Branding Rules (CONFIRMED THIS SESSION)
- **"Farmers Marketing"** = actual app brand name (brand_name in defaults.ts)
- **"Local Market"** = generic descriptor replacing "Fresh Market" in non-brand contexts
- **"815 Enterprises"** = ONLY in Terms of Service + umbrella domain config + 815enterprises.com page
- **"Food Truck'n"** = FT brand name (unchanged)

## APPROVED MIGRATIONS (implement now):

### Migration 1: GAP 7 — Fix original_end_date
- Table: `market_box_subscriptions.original_end_date` (DATE, nullable)
- Problem: `create_market_box_pickups()` trigger was rewritten in migration 20260130 and the UPDATE that sets original_end_date was dropped
- Fix: Add `UPDATE market_box_subscriptions SET original_end_date = NEW.start_date + ((NEW.term_weeks - 1) * 7) WHERE id = NEW.id;` back into trigger
- Also: Backfill existing NULLs with same formula
- File: `supabase/migrations/20260302_063_fix_original_end_date.sql`

### Migration 2: GAP 4 + SL-Q3 — Cron auto-miss past-due pickups
- Add new cron phase (Phase 4.7 or similar) in expire-orders route
- Logic: `market_box_pickups.status = 'scheduled' AND market_box_pickups.scheduled_date < TODAY - 2 days`
- Action: Set status → 'missed', send notification to buyer
- This allows subscription completion trigger to fire naturally
- File: Code change in `src/app/api/cron/expire-orders/route.ts`

### Migration 3: GAP 6 — Market box offering DB trigger
- Create `enforce_market_box_tier_limit` trigger on `market_box_offerings`
- Pattern: match `enforce_listing_tier_limit` trigger
- Check active offerings count vs tier limit from `vendor-limits.ts`
- Fire on INSERT or UPDATE when status becomes 'active'
- File: `supabase/migrations/20260302_064_market_box_tier_trigger.sql`

## CONFIRMED BUSINESS RULES (no changes needed):
- GAP 3 (cancellation): FM=1hr grace, FT=15min grace. Full refund if unconfirmed, 75% if confirmed after grace. CODE IS CORRECT.
- AC-R1 through AC-R5, AC-R8 through AC-R11: All confirmed as desired behavior
- AC-R14: Admin management UI EXISTS at /admin/admins (verified)
- NI-R1, NI-R3, NI-R4, NI-R5, NI-R6, NI-R10: All confirmed

## QUESTIONS STILL NEED ANSWERS (provide to user):
- **AC-R6**: Dual role system — works fine, no risk, keep redundancy for now
- **AC-R7**: Rate limits — per IP, industry standard ranges, explain which are lenient/conservative

## FUTURE FIX LIST (approved but not this session):
1. Build buyer cancellation route for Market Box/Chef Box subscriptions (GAP 3 SL)
2. NI-R2: Notification sound (configurable by urgency)
3. NI-R7: Critical notifications at ALL tiers. SMS/push configurable per vendor preference. NEEDS DESIGN for preference UI.
4. NI-R8/R9: Push notification settings UI with re-enroll option
5. NI-R11: Show user full list of 30 notification types for confirmation (later)
6. NI-R12: User delete button + 120-day retention (keep in DB longer, clean from UI)
7. NI-R13: Keep sendNotificationBatch() dead code, reevaluate later
8. NI-R14: Verify all notification elements are vertical-specific
9. Console: apple-mobile-web-app-capable deprecation, analytics/vitals 405

## What's Been Done This Session
- [x] SEO keyword expansion (commit 71775c3, pushed prod+staging)
- [x] Branding fixes (commit f26b99e, pushed prod+staging)
- [x] Read full business rules audit (1168 lines, 8 domains)
- [x] Researched FT cancellation logic (confirmed correct)
- [x] Researched original_end_date gap (confirmed trigger missing UPDATE)
- [x] Verified admin management UI at /admin/admins
- [x] Provided plain-English AC-R1-R14 and NI-R1-R14 explanations
- [x] Saved progress to current_task.md
- [x] Answer AC-R6 and AC-R7
- [x] Implement GAP 7 migration (original_end_date) — 20260302_063_fix_original_end_date.sql
- [x] Implement GAP 4 cron phase (auto-miss pickups) — Phase 4.7 in expire-orders/route.ts
- [x] Implement GAP 6 migration (market box trigger) — 20260302_064_market_box_tier_trigger.sql
- [x] Added market_box_pickup_missed notification type
- [ ] Commit all changes
- [ ] Push to staging for testing
- [ ] User applies migrations 063+064 to Dev/Staging databases

## Key Context (DO NOT FORGET)
- 3 migrations approved: GAP 7, GAP 4/SL-Q3, GAP 6
- Cancellation rules ALREADY correctly implemented (no fix needed)
- User wants plain English explanations, not technical jargon
- brand_name = "Farmers Marketing" (not Fresh Market, not Local Market)
- All git branches in sync at f26b99e
- Business rules audit file: `.claude/business_rules_audit_and_testing.md` (1168 lines)
- Tier limits reference: FM free=5/standard=10/premium=20/featured=30. FT free=5/basic=10/pro=20/boss=45
- Market box tier limits in vendor-limits.ts: totalMarketBoxes and activeMarketBoxes per tier
