# Current Task: Location Insights — Tier-Gated Geographic Intelligence

Started: 2026-02-22

## Goal
Implement Phases 1-2 of Location Insights feature: Basic tier (own-data insights) + Pro tier (location scores, market expansion recs) + Boss tier (buyer density, coverage gaps). Includes migration, API, UI page, and dashboard card.

## Key Decisions Made
- Tier gating: Free=blocked, Basic=4 metrics, Pro=+2 metrics, Boss=+2 metrics
- New table `buyer_search_log` for anonymous search tracking (feeds Boss tier)
- `locationInsights` field added to `FtTierExtras` interface
- Single GET endpoint at `/api/vendor/location-insights/`
- Page at `[vertical]/vendor/insights/page.tsx`
- Dashboard card added to Row 3

## Files to Create/Modify
### New (3)
1. `supabase/migrations/20260222_048_buyer_search_log.sql`
2. `src/app/api/vendor/location-insights/route.ts`
3. `src/app/[vertical]/vendor/insights/page.tsx`

### Modified (4)
4. `src/lib/vendor-limits.ts` — add locationInsights to FtTierExtras
5. `src/app/api/markets/nearby/route.ts` — search logging
6. `src/app/api/vendors/nearby/route.ts` — search logging
7. `src/app/[vertical]/vendor/dashboard/page.tsx` — insights card in Row 3

## What's Been Completed
- [x] Read all pattern files
- [x] Migration 048 — buyer_search_log table + indexes + RLS
- [x] vendor-limits.ts — locationInsights field on FtTierExtras + all 4 tiers
- [x] Search logging in markets/nearby + vendors/nearby (fire-and-forget)
- [x] API route — /api/vendor/location-insights (single GET, tier-gated)
- [x] Insights page — /[vertical]/vendor/insights (full 3-state UI)
- [x] Dashboard card — Location Insights in Row 3 with lock pattern
- [x] TypeScript clean compile
- [x] ESLint — 0 errors (warnings are pre-existing any pattern)

## What's Remaining
- Apply migration 048 to staging SQL editor
- Deploy to staging for user testing
- Schema snapshot update after migration applied
- Commit + push to staging
