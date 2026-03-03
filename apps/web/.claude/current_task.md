# Current Task: Supabase Cost Optimization (Pre-Launch)

Started: 2026-03-03 (Session 51, continued)

## Goal
Reduce Supabase costs to near-zero for pre-launch app with 0 live users. User got unexpected $7.16 charge. 5-batch plan approved.

## What's Been Completed

### Batch 1: Cron Environment Gating ✅ DONE
Added `VERCEL_ENV` production guard to all 3 cron routes. Staging/preview deployments now return immediately.
- `src/app/api/cron/expire-orders/route.ts` — guard added after withErrorTracing, before secret check
- `src/app/api/cron/vendor-activity-scan/route.ts` — same pattern
- `src/app/api/cron/vendor-quality-checks/route.ts` — same pattern

### Batch 2: Business-Hours-Aware Polling ✅ DONE
Created centralized polling config with off-peak awareness (10pm-6am = reduced polling).
- NEW `src/lib/polling-config.ts` — exports `isOffPeak()`, `getPollingInterval()`, `POLLING_INTERVALS`
- `src/components/notifications/NotificationBell.tsx` — 60s → 5min active / 15min off-peak (line 187)
- `src/app/[vertical]/vendor/dashboard/orders/page.tsx` — 30s → 2min active / 10min off-peak (line 114)
- `src/components/listings/CutoffStatusBanner.tsx` — 60s → 5min + visibility check + off-peak skip (line 55)

### Batch 3: Cron Timing + Early Exits ✅ DONE
- `vercel.json` — shifted cron times to business hours:
  - expire-orders: `0 12 * * *` (12pm UTC / ~6am CT, was midnight CT)
  - vendor-activity-scan: `0 8 * * *` (8am UTC / ~2am CT)
  - vendor-quality-checks: `0 14 * * *` (2pm UTC / ~8am CT)
- `expire-orders/route.ts` — added 4 parallel count queries as quick-check. If no pending work, returns immediately.
- `expire-orders/route.ts` — Phase 9 data retention now runs Sundays only (`isCleanupDay`)
- `vendor-quality-checks/route.ts` — added vendor count early exit (0 vendors = skip all 5 checks)

### Batch 4: N+1 Query Fixes — PARTIALLY DONE
- ✅ Phase 4.5 stale confirmed dedup — DONE. Replaced 3 per-item notification dedup queries with 1 batch query + Set lookup. File: `expire-orders/route.ts` (~line 789-860)
- ❌ Phase 10a trial notification dedup — NOT YET DONE
- ❌ Quality checks vendor_profiles full-table scan fix — NOT YET DONE

## What's Remaining

### Batch 4 (continued):
1. **Phase 10a trial notification dedup** — `expire-orders/route.ts` ~line 1676
   - Currently: 1 dedup query per trial vendor checking notifications table
   - Fix: Batch query all recent trial notifications before the loop, build Set for O(1) lookup
   - Pattern: Same as Phase 4.5 fix above

2. **Quality checks vendor_profiles scan** — `src/lib/quality-checks.ts` line 56
   - Currently: Loads ALL vendor_profiles then filters in JS for multiple_trucks
   - Fix: Only load vendor_profiles whose IDs appear in the schedules query
   - Need to read the file first to understand exact code

### After Batch 4:
3. Run vitest to confirm all pass
4. Run tsc --noEmit to confirm no type errors
5. Commit all changes (Batches 1-4 together)
6. Push to staging
7. Batch 5 is a user decision (pause Dev Supabase project) — no code changes

## Key Context
- Vitest: 337 passing, 59 todo, 0 failures (confirmed after Batches 1-3)
- TypeScript: 0 errors (confirmed after Batches 1-3)
- Plan file: `C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md`
- Git: main branch, 6 commits ahead of origin/main (from earlier session work)
- Task IDs: #58 (Batch 1, done), #59 (Batch 2, done), #60 (Batch 3, done), #61 (Batch 4, in_progress)

## Files Modified This Session (uncommitted)
- `src/app/api/cron/expire-orders/route.ts` — env guard + early exit + Phase 9 weekly + Phase 4.5 batch dedup
- `src/app/api/cron/vendor-activity-scan/route.ts` — env guard
- `src/app/api/cron/vendor-quality-checks/route.ts` — env guard + vendor count early exit + schedule comment
- `src/lib/polling-config.ts` — NEW file (centralized polling intervals + isOffPeak)
- `src/components/notifications/NotificationBell.tsx` — import polling-config, 5min/15min intervals
- `src/app/[vertical]/vendor/dashboard/orders/page.tsx` — import polling-config, 2min/10min intervals
- `src/components/listings/CutoffStatusBanner.tsx` — import polling-config, 5min + visibility + off-peak
- `vercel.json` — shifted cron schedules to business hours

## Batch 5: Third Supabase Project (User Decision Needed)
Supabase free tier = 2 active projects. User has 3 (Dev, Staging, Prod). Options:
- A. Pause Dev project (recommended) — ~$7-10/mo savings
- B. Use local Supabase via Docker
- C. Keep all 3 and accept cost

## Earlier This Session (already committed)
- Commit `7990d76` — Category 1+2 test conversions (8 rules, tip math + cutoff hours + vertical config)
- 337 passing, 59 todo, 0 failures. Pushed to staging.
