# Current Task: Update FT Tier Limits + Fix Missing Vertical Params

Started: 2026-02-22

## Goal
1. Update FT tier limits to new values
2. Fix 5 API routes missing `vertical` param on `getTierLimits()` calls
3. Create migration 052 to update DB trigger `enforce_listing_tier_limit`

## Key Decisions Made
- New FT tier limits approved by user (see table below)
- Fix both JS code AND DB trigger (hardcoded limits)
- Also add `vertical` param to `getSubscriberDefault()` for consistency

## New FT Tier Limits (USER APPROVED)

| Resource | Free | Basic | Pro | Boss |
|----------|------|-------|-----|------|
| Product listings | 5 | 10 | 20 | 45 |
| Traditional markets | 1 | 3 | 5 | 8 |
| Private pickup locations | 2 | 3 | 5 | 15 |
| Pickup windows/location | 4 | 5 | 6 | 7 |
| Total market boxes | 0 | 2 | 4 | 8 |
| Active market boxes | 0 | 2 | 4 | 8 |
| Max subscribers/offering | 0 | 10 | 20 | 50 |
| Analytics days | 0 | 30 | 60 | 90 |
| Notification channels | in_app | +email | +push | +sms |
| Location insights | none | basic | pro | boss |

## What's Been Completed
- [x] Investigated root cause: `getTierLimits()` called without `vertical` param → falls back to FM standard limits (5 listings, 1 market) even for Boss-tier FT vendors
- [x] Updated `FT_TIER_LIMITS` in `vendor-limits.ts` with new values
- [x] Added `vertical` param to `getSubscriberDefault()` in `vendor-limits.ts`

## What's Remaining
- [ ] Fix 5 API routes missing `vertical` param:
  1. `src/app/api/vendor/market-stats/route.ts:65` — `getTierLimits(vendorTier)` → add `, vertical`
  2. `src/app/api/vendor/markets/route.ts:76` — `getTierLimits(tier)` → add `, vertical`
  3. `src/app/api/vendor/markets/route.ts:288` — `getTierLimits(tier)` → add `, vertical`
  4. `src/app/api/vendor/markets/[id]/route.ts:92` — `getTierLimits(tier)` → add vertical (need to get from market object at line 74 which has all fields)
  5. `vendor-limits.ts:181` — already fixed (getSubscriberDefault now passes vertical through)
- [ ] Create migration `20260222_052_update_ft_tier_listing_limits.sql` — update `enforce_listing_tier_limit()` trigger: free 4→5, basic 8→10
- [ ] Run tests (`npm test` + `tsc --noEmit`)
- [ ] Commit and push to staging

## Files Modified So Far
- `src/lib/vendor-limits.ts` — Updated FT_TIER_LIMITS values + getSubscriberDefault signature

## Files Still Need Changes
- `src/app/api/vendor/market-stats/route.ts` — line 65
- `src/app/api/vendor/markets/route.ts` — lines 76, 288
- `src/app/api/vendor/markets/[id]/route.ts` — line 92 (get vertical from market object)
- `supabase/migrations/20260222_052_update_ft_tier_listing_limits.sql` — NEW FILE

## Context From Earlier This Session
- Migration 050 (notifications FK fix) — committed, pushed staging+prod. Applied all 3 envs.
- Migration 051 (FT seed onboarding gates 2 & 4) — committed, pushed staging. Applied dev+staging.
- Both commits on main, staging synced.
- Main is ahead of origin/main by 16 commits.

## Gotchas
- `markets/[id]/route.ts` vendor profile query doesn't select `vertical_id` — get vertical from market object instead (line 74 fetches full market)
- DB trigger uses 'published' not 'active' (fixed in migration 038)
- `isPremiumTier()` callers in markets routes also missing vertical — check if those need fixing too
