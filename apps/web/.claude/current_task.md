# Current Task: Schedule Conflict Prevention (Session 50 continued)

Started: 2026-03-03

## Goal
Prevent single-truck food truck vendors from having overlapping schedules at different markets on the same day. Two-layer protection: API validation (primary) + DB trigger (safety net).

## Session 50 Summary — 3 Items Completed, 1 In Progress

### Item 1: Dashboard UX (COMMITTED `e4d34b4`, pushed to staging)
- Combined PaymentMethodsCard + Earnings → single "Payments & Earnings" card
- Row 3 grid: 4→3 columns (Business Profile, Payments & Earnings, Analytics)
- Listings icon: `🏷️`→`📋`, Chef Boxes icon: `📍`/`🧺`→`📦`

### Item 2: VI Business Rule Tests (COMMITTED `e4d34b4`, pushed to staging)
- VI-R16 through VI-R19 in vertical-isolation.test.ts + business-rules-coverage.test.ts
- Cross-vertical data isolation rules (notification scoping, login membership, page gate, sendNotification threading)

### Item 3: Cross-Vertical Isolation (COMMITTED earlier: `437f2c7` + `5e157fe`)
- Migration 065 applied to all 3 envs. Schema snapshot updated. Migration moved to applied/.

### Item 4: Schedule Conflict Prevention (IN PROGRESS — NOT YET COMMITTED)
See details below.

## Schedule Conflict Prevention — Status

### Completed (code written, not committed):
- [x] **Batch 1**: `src/lib/utils/schedule-overlap.ts` — shared utility with `padTime()`, `timesOverlap()`, `findScheduleConflicts()`, `dayOfWeekName()`, `formatTimeDisplay()`
- [x] **Batch 1**: `src/lib/__tests__/schedule-overlap.test.ts` — 24 unit tests, ALL PASSING
- [x] **Batch 2**: API validation in `src/app/api/vendor/markets/[id]/schedules/route.ts`
  - Added `isMultiTruckVendor()` + `getOtherActiveSlots()` helpers at top
  - PATCH: checks conflicts when `isActive === true` before upsert → returns 409 + `ERR_SCHEDULE_CONFLICT`
  - PUT: checks conflicts for each schedule being activated → returns 409 + `ERR_SCHEDULE_CONFLICT`
  - Both skip check if `profile_data.multiple_trucks === true`
- [x] **Batch 3**: Migration `supabase/migrations/20260303_066_schedule_conflict_trigger.sql`
  - `check_vendor_schedule_conflict()` trigger fn (BEFORE INSERT OR UPDATE on vendor_market_schedules)
  - Skips if `NOT NEW.is_active` or `multiple_trucks = true`
  - Resolves effective times (vendor overrides or market defaults)
  - RAISE EXCEPTION on overlap at different market on same day
  - `SECURITY DEFINER SET search_path = public`
- [x] **Batch 4**: UI error handling in `src/components/vendor/MarketScheduleSelector.tsx`
  - `ERR_SCHEDULE_CONFLICT` treated as blocking error type
  - Error header shows "Schedule Conflict" instead of "Cannot deactivate"
  - `saveVendorTime` also handles conflict errors
- [x] **Batch 5**: VJ-R14 business rule in `business-rules-coverage.test.ts`
  - Added `import { timesOverlap } from '@/lib/utils/schedule-overlap'` at top of file
  - 1 concrete test + 4 .todo markers

### REMAINING (must do before commit):
- [ ] **Fix VJ-R14 test body** — line ~473 still has `require('@/lib/utils/schedule-overlap')` which needs to be removed since we added the import at the top. Replace with just using the already-imported `timesOverlap`.
- [ ] Run `npx vitest run` — expect all pass after fix
- [ ] Run `npx tsc --noEmit` — was 0 errors before test change
- [ ] Commit all schedule conflict prevention files
- [ ] Push to staging

### Post-commit (user action needed):
- [ ] User applies migration 066 to Dev, Staging, Prod
- [ ] After confirmed: update SCHEMA_SNAPSHOT.md (changelog + function description), move to applied/, update MIGRATION_LOG.md

## Files Modified (Not Yet Committed)
| File | Status | Change |
|------|--------|--------|
| `src/lib/utils/schedule-overlap.ts` | NEW | Shared overlap detection (padTime, timesOverlap, findScheduleConflicts, formatters) |
| `src/lib/__tests__/schedule-overlap.test.ts` | NEW | 24 unit tests for overlap logic |
| `src/app/api/vendor/markets/[id]/schedules/route.ts` | MODIFIED | PATCH + PUT conflict validation with isMultiTruckVendor + getOtherActiveSlots |
| `supabase/migrations/20260303_066_schedule_conflict_trigger.sql` | NEW | DB trigger safety net |
| `src/components/vendor/MarketScheduleSelector.tsx` | MODIFIED | ERR_SCHEDULE_CONFLICT UI handling |
| `src/lib/__tests__/integration/business-rules-coverage.test.ts` | MODIFIED | VJ-R14 rule + timesOverlap import (NEEDS FIX: remove require() on ~line 473) |

## Key Decisions
- **Block + explain** at API level (user chose this over warn-but-allow or auto-deactivate)
- **Keep nightly quality check advisory-only** (user chose this — API prevention is sufficient)
- **DB trigger as safety net** (user requested defense-in-depth against API failures)
- **Multiple trucks bypass**: `profile_data.multiple_trucks = true` skips both layers
- Adjacent times (A ends when B starts, e.g., 10-14 and 14-18) are NOT conflicts

## Architecture
```
Layer 1 (API — primary): schedules/route.ts PATCH+PUT
  → isMultiTruckVendor() check
  → getOtherActiveSlots() query
  → findScheduleConflicts() from schedule-overlap.ts
  → 409 ERR_SCHEDULE_CONFLICT response

Layer 2 (DB — safety net): check_vendor_schedule_conflict() trigger
  → Fires BEFORE INSERT OR UPDATE on vendor_market_schedules
  → Same logic as API but in PL/pgSQL
  → RAISE EXCEPTION on conflict

Layer 3 (Advisory — existing): quality-checks.ts checkScheduleConflicts()
  → Nightly cron, creates vendor_quality_findings
  → Notification only, no blocking
  → Unchanged by this work
```

## Git State
- Main branch, 12 commits ahead of origin/main
- Staging synced to main (pushed after dashboard UX commit)
- Migration 065 applied to all 3 envs, moved to applied/
- Migration 066 NOT YET applied (pending commit + user action)
