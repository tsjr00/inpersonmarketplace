# Current Task: Session 59 — Performance Audit Implementation

Started: 2026-03-16

## Goal
Implement all approved items from the performance audit (`apps/web/.claude/performance_audit.md`).

## Mode
Fix mode — user approved all items listed below.

## What's COMPLETE (all done this session)

### Phase 1: Quick Wins
1. **QW4** — AVIF added to `next.config.ts` image formats ✅
2. **ME-1** — Removed `force-dynamic` from `src/app/[vertical]/layout.tsx` ✅
3. **ME-2** — Added 7 `loading.tsx` skeleton files + shared `Skeleton.tsx` component ✅
   - Files: `browse/`, `listing/[listingId]/`, `vendor/[vendorId]/profile/`, `dashboard/`, `vendor/dashboard/`, `buyer/orders/`, `checkout/`
4. **ME-3** — Lazy-loaded chart.js via `next/dynamic` on 3 analytics pages ✅
5. **ME-5** — Batched expired order cleanup with `Promise.allSettled()` in checkout session route ✅
6. **QW3A** — Cache-Control headers on 3 public API routes ✅
   - `api/listings/[id]/availability` — `s-maxage=60, stale-while-revalidate=300`
   - `api/market-boxes` — `s-maxage=300, stale-while-revalidate=600`
   - `api/markets/[id]/vendors-with-listings` — `s-maxage=300, stale-while-revalidate=600`
   - Skipped: `api/markets/[id]/vendors` (admin-facing), `api/buyer/location/reverse-geocode` (already has 24hr memory cache), `api/market-boxes/[id]` (user-specific canPurchase)
7. **QW1** — Compressed `food-truck-lifestyle.png`: 6.6MB PNG → 269KB JPEG (96% reduction) ✅
   - Converted to `.jpg`, updated Hero.tsx reference
8. **QW2** — Removed 4 duplicate/unused logo files (saved 2.6MB) ✅
   - Deleted: `Farmers Marketing Logo.png`, `FastWrks logo.png`, `logo-full-color.png`, `logo-icon-color.png`
   - Updated: `defaults.ts` (logo_path), `layout.tsx` (default icon)
   - All confirmed identical via md5sum before deletion

### Phase 4: Database
9. **ME-4** — Migration `20260316_084_add_vendor_tier_index.sql` created ✅
   - `idx_vendor_profiles_vertical_tier ON vendor_profiles(vertical_id, tier)`
   - Note: `vertical_id + status` index already existed, only tier composite was needed
   - **NEEDS: Apply to Dev/Staging/Prod, then update schema snapshot**

### Phase 5: Architectural
10. **AC-2** — Code-split vendor markets page (2583 → 524 lines) ✅
    - Extracted 3 sections into `src/components/vendor/markets/`:
      - `MarketSuggestionSection.tsx` (533 lines)
      - `EventMarketsSection.tsx` (274 lines)
      - `PrivatePickupSection.tsx` (559 lines)
      - `types.ts` (65 lines) — shared types
      - `utils.ts` (33 lines) — shared utility functions (DAYS, formatTime12h, getCutoffDisplay, getDefaultCutoffHours)
    - All loaded via `next/dynamic` with `ssr: false`
    - Type check passes (only pre-existing api-route-guards.test.ts error)

11. **AC-5** — SWR client-side caching ✅
    - `swr` package installed ✅
    - `src/lib/swr.ts` created (fetcher + swrDefaults) ✅
    - Notifications page — COMPLETE. Uses `useSWR` for page 1, `extraNotifications` for load-more. Optimistic updates via `mutate()`.
    - Buyer orders page — COMPLETE. Uses `useSWR` with filter-based key (auto-refetch on filter change). Separate SWR call for markets list (long cache).

## What's REMAINING
- [ ] **Commit all changes** — No commits made yet this session
- [ ] **Update backlog** if needed (deferred items already added in prior context)

## Key Decisions Made
- **QW3A scope**: Only 3 of 6 candidate routes got Cache-Control. The others were admin-facing or user-specific.
- **QW2 logo cleanup**: `logo-full-color.png` was identical to `farmersmarketing-full-logo.png` — consolidated to the latter. `logo-icon-color.png` was a fallback default icon — pointed to `farmersmarketing-full-logo.png` instead.
- **ME-4 index**: Only `vertical_id + tier` needed — `vertical_id + status` already existed since migration 019.
- **AC-2 approach**: Extracted 3 sections as separate `next/dynamic` components. Traditional Markets section stays inline (always visible first). Each section owns its own form state internally. Shared state (error, selectedMarketForSchedule) passed as props.
- **AC-5 SWR approach**: Using SWR for initial page load + revalidation. "Load more" pagination stays manual via local state. Not using `useSWRInfinite` to keep it simple.

## Files Modified This Session
- `next.config.ts` — AVIF format added
- `src/app/[vertical]/layout.tsx` — force-dynamic removed, default icon updated
- `src/components/shared/Skeleton.tsx` — NEW (shared skeleton components)
- `src/app/[vertical]/browse/loading.tsx` — NEW
- `src/app/[vertical]/listing/[listingId]/loading.tsx` — NEW
- `src/app/[vertical]/vendor/[vendorId]/profile/loading.tsx` — NEW
- `src/app/[vertical]/dashboard/loading.tsx` — NEW
- `src/app/[vertical]/vendor/dashboard/loading.tsx` — NEW
- `src/app/[vertical]/buyer/orders/loading.tsx` — NEW
- `src/app/[vertical]/checkout/loading.tsx` — NEW
- `src/app/[vertical]/vendor/analytics/page.tsx` — dynamic chart import
- `src/app/[vertical]/admin/analytics/page.tsx` — dynamic chart import
- `src/app/admin/analytics/page.tsx` — dynamic chart import
- `src/app/api/checkout/session/route.ts` — Promise.allSettled batch cleanup
- `src/app/api/listings/[id]/availability/route.ts` — Cache-Control header
- `src/app/api/market-boxes/route.ts` — Cache-Control header
- `src/app/api/markets/[id]/vendors-with-listings/route.ts` — Cache-Control header
- `public/images/food-truck-lifestyle.jpg` — NEW (compressed replacement)
- `public/images/food-truck-lifestyle.png` — DELETED
- `public/Farmers Marketing Logo.png` — DELETED
- `public/FastWrks logo.png` — DELETED
- `public/logos/logo-full-color.png` — DELETED
- `public/logos/logo-icon-color.png` — DELETED
- `src/components/landing/Hero.tsx` — .png → .jpg reference
- `src/lib/branding/defaults.ts` — logo_path updated
- `supabase/migrations/20260316_084_add_vendor_tier_index.sql` — NEW
- `src/components/vendor/markets/types.ts` — NEW
- `src/components/vendor/markets/utils.ts` — NEW
- `src/components/vendor/markets/MarketSuggestionSection.tsx` — NEW
- `src/components/vendor/markets/EventMarketsSection.tsx` — NEW
- `src/components/vendor/markets/PrivatePickupSection.tsx` — NEW
- `src/app/[vertical]/vendor/markets/page.tsx` — REWRITTEN (2583 → 524 lines)
- `src/lib/swr.ts` — NEW
- `src/app/[vertical]/notifications/page.tsx` — SWR conversion complete
- `src/app/[vertical]/buyer/orders/page.tsx` — SWR conversion complete

## Gotchas / Watch Out For
- **Both SWR pages complete and type-clean** — notifications + buyer orders.
- **Pre-existing type error** in `api-route-guards.test.ts` — RequestInit.signal incompatibility. Not caused by our changes.
- **Migration 084 needs application** — user must apply to Dev/Staging/Prod before it can be moved to applied/
- **`getDefaultCutoffHours` signature changed** — old: `(marketType: string)`, new in utils.ts: `(vertical: string, marketType: string)`. The main page.tsx uses the new signature correctly.
