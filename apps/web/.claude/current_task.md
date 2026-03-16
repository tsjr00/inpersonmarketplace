# Current Task: Session 59 (continued) — Performance Optimization + Performance Regression Framework

Started: 2026-03-16

## Mode
Fix mode — user approved all items.

## COMMITS MADE (prior context)
1. `36ae55e` — perf: comprehensive performance audit (11 items) — PUSHED TO STAGING
2. `a449813` — feat: ADMIN-R1/R2 business rules (admin account integrity + self-protection) — NOT pushed to staging yet

## What's COMPLETE This Continuation

### Browse Page Performance Fixes (A, B, C) — CODE DONE, NOT COMMITTED
Three optimizations to `src/app/[vertical]/browse/page.tsx`:
- **A: Parallelized** `auth.getUser()` + `getLocale()` via `Promise.all` (were sequential)
- **B: Eliminated duplicate queries** — Combined `user_profiles` query to fetch both `buyer_tier` AND location fields (`preferred_latitude`, `preferred_longitude`, `location_source`, `location_text`) in single call. Inlined location resolution using pre-fetched data + direct cookie read. Removed `getServerLocation()` import (it was duplicating auth + profile queries). Now imports `cookies` from `next/headers` and `LOCATION_COOKIE_NAME`, `DEFAULT_RADIUS`, `VALID_RADIUS_OPTIONS` from `@/lib/location/server`.
- **C: Consolidated dual RPC** — `get_listings_accepting_status` is now called once when Available Now filter is active (data reused for badge rendering). Second call only runs when filter is off. Guard: `if (paginatedListings.length > 0 && !isAvailableNow)`.

### Performance Regression Framework — ALL DONE, NOT COMMITTED
User identified critical pattern: sessions undo prior sessions' performance work due to structural bias toward action. Built comprehensive protection system:

1. **Rule file**: `.claude/rules/no-performance-regression.md` — 5 rules: measure before/after, never increase query count, respect prior sessions, acknowledge limits, loading states are not problems. Strong opening: "Action does not need to be taken just because it can be."

2. **Global CLAUDE.md Rule 1 update**: Added action-bias paragraph under "Scope matching" in `C:\Users\tracy\.claude\CLAUDE.md`

3. **Performance baseline doc**: `.claude/PERFORMANCE_BASELINE.md` — Query structure table for 5 hot-path pages, client bundle sizes (4.3MB, 118 chunks), architectural decisions (ISR not effective, loading.tsx correct, RPC ceiling), known ceilings, change log

4. **Performance regression tests**: `src/lib/__tests__/performance-baseline.test.ts` — **28 tests across 9 groups**:
   - PERF-R1: Browse page query structure (5 tests — Promise.all, combined profile, no getServerLocation, consolidated RPC)
   - PERF-R2: Markets page parallelization (2 tests)
   - PERF-R3: Vendors page parallelization (1 test)
   - PERF-R4: Listing detail parallelization (2 tests)
   - PERF-R5: Loading skeletons exist (5 tests — can't be removed)
   - PERF-R6: Infrastructure files exist (6 tests — self-protecting)
   - PERF-R7: Bundle size guard (1 test — 150 chunk ceiling)
   - PERF-R8: Schema snapshot staleness (3 tests — every applied migration must be in changelog)
   - PERF-R9: Performance baseline staleness (3 tests — date must be within 60 days, change log must have entries)

5. **Schema snapshot updated**: Added 13 previously-undocumented applied migrations to `supabase/SCHEMA_SNAPSHOT.md` changelog (migrations 010-023 and 031 from Sessions 20-27 that pre-dated the changelog system). PERF-R8 test now passes.

6. **Feedback memory saved**: `feedback_action_bias.md` — Records user's directive about structural bias toward action

7. **MEMORY.md updated**: Added action bias reference

### All Tests Pass: 28/28 performance baseline tests, full suite needs final run (was interrupted)

## What's REMAINING
- [ ] **Run full test suite** — was interrupted, need to confirm all 1230+ tests pass
- [ ] **Commit all changes** from this continuation (browse perf fixes + performance framework)
- [ ] **Migration 085** needs application to all 3 envs before committing role enum code changes
- [ ] **Commit role enum + lazy profile code changes** after migration 085 applied
- [ ] **Push `a449813` (admin rules) + new commits to staging**
- [ ] **Update SCHEMA_SNAPSHOT.md** after migration 085 applied
- [ ] **Browse page Option D** (static shell + client fetch) — deferred to future session
- [ ] **RPC rewrite** (set-based `get_listings_accepting_status`) — deferred to future session
- [ ] **Dashboard parallelization** — 6 sequential queries, 0 parallelized. Candidate for future optimization.
- [ ] **Investigate**: Why did prod admin users disappear? (root cause unknown)
- [ ] **Dual role columns**: `role` + `roles` on user_profiles — tech debt, future session

## Files Modified This Continuation (not committed)
- `src/app/[vertical]/browse/page.tsx` — Parallelized auth+locale, combined user_profiles query, inlined location, consolidated RPC
- `.claude/rules/no-performance-regression.md` — NEW (action bias + regression prevention rules)
- `.claude/PERFORMANCE_BASELINE.md` — NEW (structural metrics, baselines, ceilings, change log)
- `src/lib/__tests__/performance-baseline.test.ts` — NEW (28 tests)
- `C:\Users\tracy\.claude\CLAUDE.md` — Added action-bias paragraph to Rule 1
- `supabase/SCHEMA_SNAPSHOT.md` — Added 13 missing changelog entries for old applied migrations

## Files Modified From Prior Context (also not committed)
- `src/lib/supabase/types.ts` — UserRole updated (waiting for migration 085)
- `src/lib/auth/roles.ts` — isRegionalAdmin, isPlatformAdmin (waiting for migration 085)
- `src/lib/auth/admin.ts` — UserRole updated (waiting for migration 085)
- `src/app/[vertical]/login/page.tsx` — Lazy profile creation (waiting for migration 085)

## Key Decisions Made This Continuation
- **Browse page Option D deferred** — Static shell + client fetch is biggest win but most effort. User chose A/B/C first.
- **RPC rewrite deferred** — 3 options analyzed (set-based, lightweight boolean, cache table). Deferred.
- **Action bias rule added to CLAUDE.md** — User's exact words: "Action does not need to be taken just because it can be. Choosing to act or advise the user to act when the action will reduce performance is a failure and breach of responsibility."
- **60-day staleness window** for PERFORMANCE_BASELINE.md
- **Schema staleness test** checks every applied migration individually (no grouped references)

## Gotchas / Watch Out For
- **ISR on browse page is NOT effective** — `createClient()` calls `cookies()` which opts into dynamic rendering. `revalidate = 300` does nothing.
- **loading.tsx is NOT the problem** — it reveals existing ~0.5s SSR latency. Don't remove it.
- **getServerLocation still used** by markets + vendors pages — only removed from browse page
- **Migration 085 must be applied before** committing role enum code changes
- **Pre-existing type error** in `api-route-guards.test.ts` — not our fault
- **Dashboard page has 0 parallelization** — 6 sequential queries, known ceiling documented in baseline
- **User's core principle**: "find the data then make decisions — don't guess"
