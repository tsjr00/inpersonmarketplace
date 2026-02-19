# Current Task: Session 35 Audit — COMMITTING ALL FIXES
Started: 2026-02-19

## STATUS: ALL CODE FIXES DONE, IN THE MIDDLE OF COMMITTING

### Commit 1: eb33d83 (ALREADY COMMITTED)
- Phase 1 Critical (C1-C5)
- Layer 1 Error Resolution (4 items)
- Error Report Admin Notifications (spike detection + daily digest)
- High Priority (H2-H9, H11; H1 deferred, H10 already done)

### Commit 2: Medium Priority (M1-M15) — PARTIALLY STAGED, NOT YET COMMITTED
**16 files are currently staged via `git add`.** Need to also stage the deleted route before committing.

**EXACT NEXT STEPS to finish Commit 2:**
1. `git add apps/web/src/app/api/cron/retry-failed-payouts/route.ts` (deleted file, M5)
2. Commit with message about medium priority audit fixes
3. Stage and commit low priority files (Commit 3)
4. Push to staging

**Medium fixes included (M1-M15):**
- M1: Rate limiting on knowledge (GET/POST/PATCH/DELETE), market-boxes, activity-feed, acknowledge-prohibited-items — uses `rateLimits.api` (NOT `rateLimits.standard` which doesn't exist)
- M2: activity-feed wrapped in withErrorTracing
- M3: N+1 fix in getTraditionalMarketUsage — JOIN markets instead of per-row lookup
- M4: DEFERRED (timezone hardcode fine for launch)
- M5: DELETED dead retry-failed-payouts route
- M6: how-it-works logo uses defaultBranding[vertical]
- M7: test-components gated with layout.tsx notFound() in production (NEW FILE: `src/app/test-components/layout.tsx`)
- M8: Root metadata → "815 Enterprises - Local Marketplace Platform"
- M9: REVERTED — landing/Footer.tsx IS used by [vertical]/page.tsx and features/page.tsx (NOT dead code, audit was wrong)
- M10: Verified OK — messages already generic
- M11: Already fixed in H5
- M12: Design tokens header → "815 ENTERPRISES DESIGN SYSTEM"
- M13: QUANTITY_UNITS extracted to constants.ts, 3 consuming files import from there now
- M14: Upgrade page prices from SUBSCRIPTION_AMOUNTS in pricing.ts (NOT from stripe/config.ts — that imports Stripe which is server-only, can't use in 'use client')
- M15: Reject route aligned with approve: service client + sendNotification + vertical admin check

### Commit 3: Low Priority (L1-L12) — NOT YET STAGED OR COMMITTED

**Low fixes completed:**
- L1: `statusColors` semantic tokens added to design-tokens.ts (danger/success/warning/info + neutral50-900). Checkout page: 35→8 remaining hex. Pickup page: 60→13 remaining hex.
- L2: Order-issues vertical filter moved from JS to DB query using `!inner` join when vertical param present
- L3: Help page fully tokenized (13 hardcoded hex → 0)
- L4: `deletion` rate limit preset added (3/hour, 3600s window)
- L5: Migration 035 created: `20260219_035_add_payout_status_enum_values.sql` (adds 'skipped_dev' + 'pending_stripe_setup' to payout_status enum). NOT YET APPLIED to any environment.
- L6: Cross-sell suggestions API now selects `image_urls`, checkout UI shows real product images with 📦 fallback
- L7: Browse page box-type badge uses statusColors.warningLight/warningDark
- L8: Pickup page ~47 hex values replaced with statusColors tokens (neutrals + semantic)
- L9: `areVerticalPricesConfigured(vertical)` unified check added to stripe/config.ts (keeps old functions too for backwards compat)
- L10: TODO comment added to category-requirements.ts for Texas-specific parameterization
- L11: TODO comment added to analytics trends route for in-memory grouping
- L12: sendNotificationBatch pre-fetches all user profiles in single batch query, passes email/phone via options

**Files for Low commit (not yet staged):**
- `src/app/[vertical]/browse/page.tsx` — L7 (statusColors import + badge)
- `src/app/[vertical]/checkout/page.tsx` — L1+L6 (statusColors + product images)
- `src/app/[vertical]/help/page.tsx` — L3 (full token rewrite)
- `src/app/[vertical]/vendor/pickup/page.tsx` — L1+L8 (statusColors bulk replace)
- `src/app/api/admin/analytics/trends/route.ts` — L11 (TODO comment)
- `src/app/api/admin/order-issues/route.ts` — L2 (DB-level vertical filter)
- `src/app/api/listings/suggestions/route.ts` — L6 (image_urls in select)
- `src/lib/notifications/service.ts` — L12 (batch profile fetch)
- `src/lib/onboarding/category-requirements.ts` — L10 (TODO comment)
- `src/lib/rate-limit.ts` — L4 (deletion preset)
- `src/lib/stripe/config.ts` — L9 (unified price check)
- `supabase/migrations/20260219_035_add_payout_status_enum_values.sql` — L5 (NEW FILE)

**Also stage for Low commit:**
- `.claude/current_task.md`
- `.claude/session35_audit_report.md`

## AFTER COMMITTING
- Push both commits to staging: `git checkout staging && git merge main --no-edit && git push origin staging && git checkout main`
- Wait for user to confirm staging works
- Migration 035 needs to be applied to Dev + Staging + Prod
- Update SCHEMA_SNAPSHOT.md after migration 035 is applied (changelog entry for enum values)

## KEY GOTCHAS DISCOVERED THIS SESSION
- `rateLimits.standard` does NOT exist — use `rateLimits.api` (60/min) instead
- `landing/Footer.tsx` is NOT dead code — imported by [vertical]/page.tsx and features/page.tsx via barrel export
- `stripe/config.ts` can't be imported in 'use client' components (imports `stripe` npm package which is Node-only). Created `SUBSCRIPTION_AMOUNTS` in `pricing.ts` instead.
- `statusColors` are NOT vertical-specific — same across all verticals (red=danger, green=success, etc.)
- `colors` from design-tokens uses CSS vars that change per vertical; `statusColors` uses fixed hex values

## TSC: PASSES CLEAN (verified after all changes)
