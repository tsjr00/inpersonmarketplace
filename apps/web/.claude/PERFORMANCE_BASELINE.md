# Performance Baseline

**Last measured: 2026-09-11 (launch-readiness re-measure — browse rows corrected: the page has been `force-dynamic` since the Session 59 location-search restore; the ISR claims below were stale)**
**Purpose:** Source of truth for performance metrics. Any session proposing performance changes must measure against these baselines and demonstrate improvement before committing.

---

## Structural Metrics (Deterministic — Enforced by Tests)

These metrics are derived from code analysis. They do not depend on network conditions, data volume, or server load. They are enforced by `src/lib/__tests__/performance-baseline.test.ts`.

### Database Query Structure Per Page

| Page | Total DB Calls | Sequential | Parallelized | Max Waterfall Depth | Notes |
|------|---------------|------------|-------------|--------------------|----|
| `/[vertical]/browse` (listings) | 2 (anon) → up to 6 (signed-in + location + available=true) | up to 5 | 2 (auth ‖ locale) | up to 5 | **DYNAMIC (`force-dynamic`, page.tsx:28) — NOT cached.** Uses `createClient()` (cookies) — required by the httpOnly `user_location` cookie path (vaulted, Session 59 restore). Per request: `auth.getUser()` ‖ `getLocale()` (:200) → `user_profiles` if signed in (:214-221) → **whole-vertical published catalog with nested vendor/market/schedule/image embeds, no DB pagination** (:468-541) → `zip_codes` if `?zip=` (:592-597) → `get_listings_within_radius` RPC if a location resolves (:660-671, page_size 1000) → `get_listings_accepting_status` RPC over the 50-item page slice (:792-795), or over ALL post-filter listings when `?available=true` (:764-767). Anonymous visitors with no session skip the auth network call (auth-js short-circuits without a session token). Measured 2026-09-11 by code read; see launch_fix_plan item 5 for the reduction plan. |
| `/[vertical]/browse` (market-boxes) | 3-4 | 3-4 | 0 | 3-4 | **DYNAMIC** (same page, same client). `auth.getUser()` → `user_profiles` if signed in → offerings (:232-262) → subscription counts in ONE query (:270-276). |
| `/[vertical]/markets` | 5 | 1 | 4 | 2 | Excellent — 4-way parallel, then vendor counts. |
| `/[vertical]/vendors` | 4 | 0 | 4 | 2 | Optimal — two parallel phases. |
| `/[vertical]/listing/[id]` | 5 | 0 | 5 | 2 | Optimal — two parallel phases with data dependencies. |
| `/[vertical]/dashboard` | 7 | 3 | 5 | 3 | Auth guard (enforceVerticalAccess) + auth.getUser sequential, then 5-way parallel (vendorProfile, userProfile, orderCount, readyOrders, ordersNeedingConfirmation), then conditional activeItemCounts. |

**Rules:**
- Query count must NOT increase without user approval
- Sequential depth must NOT increase
- Parallel queries must NOT be converted to sequential

### Client Bundle Size

| Metric | Value | Date | Notes |
|--------|-------|------|-------|
| Total client JS (`.next/static/chunks/`) | 4.3 MB | 2026-03-16 | original baseline |
| Total client JS chunk count | 118 | 2026-03-16 | original baseline |
| Largest chunk | 228 KB | 2026-03-16 | original baseline |
| Total client JS chunk count | 152 | 2026-05-10 | organic growth from Phase A market manager (~10 new pages); no single bad import |
| Largest chunk | 553 KB | 2026-05-10 | Next.js framework chunk (router/BloomFilter); not addressable |
| Total client JS (`.next/static/chunks/`) | 5.4 MB | 2026-05-10 | up from 4.3 MB; tracks page-count growth |
| **Chunk count ceiling** | **200** | **2026-05-10** | **raised from 150; ~32% headroom for continued feature growth** |
| Total client JS chunk count | 153 | 2026-05-15 | +1 from Phase B agreement loop (MarketAgreementBlock component + 2 new API routes). No structural growth. |
| Largest chunk | 553 KB | 2026-05-15 | Unchanged — same Next.js framework chunk. |
| Total client JS (`.next/static/chunks/`) | 5.4 MB | 2026-05-15 | Unchanged at MB granularity. |
| Total client JS chunk count | 160 | 2026-07-14 | +7 over 2 months (FT park-operator system, Events Tier-1 agreement/broadcast/ratings, help KB, FM dashboard phases). Organic page growth; 20% headroom to the 200 ceiling. |
| Largest chunk | 541 KB | 2026-07-14 | Same Next.js framework chunk (slightly smaller than 5/15). |
| Total client JS (`.next/static/chunks/`) | 5.9 MB | 2026-07-14 | +0.5 MB since 5/15; tracks page-count growth, no single bad import. |
| Total client JS chunk count | 169 | 2026-09-11 | +9 over 2 months (bundles, VIP/loyalty, tax batch 1-2, events UX, admin rebuild). 15% headroom to the 200 ceiling. |
| Largest chunk | 555 KB | 2026-09-11 | Same Next.js framework chunk (+14 KB; Next 16.1.6). |
| Total client JS (`.next/static/chunks/`) | 6.1 MB | 2026-09-11 | +0.2 MB since 7/14. Fresh `npm run build`, `find .next/static/chunks -name '*.js' \| wc -l` + `du -sh`. |
| Chunks / total JS after Next 16.3.4 upgrade | 173 / 5.9 MB | 2026-09-11 | Same day, post-upgrade build (exit 0). Chunking changed with the framework bump; total shrank 0.2 MB. 27 chunks headroom to the 200 ceiling. |

**Rule:** Total client JS must not increase beyond 5% (4.5 MB ceiling) without justification. Chunk count ceiling enforced by `performance-baseline.test.ts` PERF-R7.

---

## Architectural Decisions (Context for Future Sessions)

### Browse Page ISR (`revalidate = 300`)
**Status: REVERTED — page is `force-dynamic` (corrected 2026-09-11).** The Session 59 ISR conversion (anonSupabase + `revalidate = 300` + client overlay) broke cookie-based location search and was rolled back; the restored page reads the `user_location` cookie server-side and carries an explicit comment forbidding `export const revalidate` (page.tsx:25-28). This section previously still said "EFFECTIVE" — that was stale and misled a 2026-09-10 review until the code was read.

**Current posture (vaulted — see `.claude/vault-manifest.md` Location Search):** every browse request is server-rendered with the cookie/profile/zip location filter applied after a whole-catalog fetch. Do NOT re-add `revalidate`, remove cookie reads, or drop the Haversine fallback. Cost-reduction options that keep this behavior are ranked in `.claude/launch_fix_plan_2026-09-10.md` item 5 (trim the unused `market_schedules` embed; set-based rewrite of `get_listings_accepting_status`; `unstable_cache` on the catalog fetch only). Each needs a before/after measurement against THIS row.

### Browse Page `loading.tsx`
**Status: WORKING CORRECTLY** — The skeleton reveals existing server rendering latency (~0.5s on staging). The latency existed before the skeleton was added. The skeleton improves perceived performance by showing structure immediately instead of a white screen. **Do not remove the skeleton to "fix" slowness — the slowness is server-side query time, not the skeleton.**

### `get_listings_accepting_status` RPC
**Status: HEAVY BUT NECESSARY** — Called via `LEFT JOIN LATERAL` on `get_available_pickup_dates`, executing once per listing. For the browse page with 50+ listings, this is the single slowest operation. Three improvement options were analyzed in Session 59 (set-based rewrite, lightweight is-accepting function, cache table). Deferred to a future session.

---

## Known Performance Ceilings

| Area | Ceiling | Reason |
|------|---------|--------|
| Browse page TTFB | Every request dynamic (no CDN hits). Server time = catalog fetch + availability RPC; UNMEASURED in wall-clock terms as of 2026-09-11 — the prior "~50ms CDN hit" figure described the reverted ISR build and is withdrawn. | `force-dynamic` for the cookie location filter (vaulted). The availability RPC (`LEFT JOIN LATERAL get_available_pickup_dates` per listing, mig 245) is the CPU-heavy step. |
| Dashboard page | Auth guard + auth.getUser + 5-way parallel + conditional | Parallelized in Session 59. Remaining sequential: enforceVerticalAccess (auth+profile) + auth.getUser (needed for user.id). |

---

## Change Log

| Date | Session | Change | Before | After | Method |
|------|---------|--------|--------|-------|--------|
| 2026-03-16 | 59 | Parallelize auth+locale, combine user_profiles query, consolidate dual RPC | 4-6 sequential queries, 2 duplicate queries, 2 RPC calls | 3 sequential + 1 parallel, 0 duplicates, 1 RPC call | Code analysis (query count) |
| 2026-03-16 | 59 | Dashboard: parallelize 5 data queries into Promise.all | 6 sequential, 0 parallel, depth 6 | 3 sequential, 5 parallel, depth 3 | Code analysis (query count) |
| 2026-03-16 | 59 | Compress oversized logos + hero images | fastwrks 1.2MB, FM 968KB, heroes 761KB+747KB | fastwrks 62KB, FM 93KB, heroes 202KB+194KB | File size measurement |
| 2026-03-16 | 59 | Browse page ISR: anonSupabase, auth/tier/locale to client overlay | 7 queries (3 seq + 2 parallel), depth 5, every request dynamic | 2-3 queries, depth 2-3, ISR-cached at CDN (5 min) | Code analysis + architecture change |
| 2026-05-15 | 82 | Phase B agreement loop ship | 152 chunks / 5.4 MB / 553 KB largest | 153 chunks / 5.4 MB / 553 KB largest | Bundle measurement (`ls .next/static/chunks/`). Query structure unchanged on browse/markets/vendors/listing/dashboard — no perf-sensitive paths touched. |
| 2026-07-14 | 94 | 60-day staleness re-measure (PERF-R9 fired; no perf change made) | 153 chunks / 5.4 MB / 553 KB largest | 160 chunks / 5.9 MB / 541 KB largest | Bundle measurement from fresh `npm run build` (`find .next/static/chunks`). Structural query metrics verified current by the passing PERF-R1..R8 tests. Growth = 2 months of features (park operator, Events Tier-1, help KB). |
| 2026-09-11 | launch-readiness (date-named session) | 60-day re-measure ahead of PERF-R9 (would have fired 2026-09-13) + **correction**: browse rows/ISR section/TTFB ceiling rewritten to match the `force-dynamic` code; no perf change made | 160 chunks / 5.9 MB / 541 KB; browse documented as ISR | 169 chunks / 6.1 MB / 555 KB; browse documented as dynamic with per-request query list | Bundle from fresh `npm run build` 2026-09-10. Browse structure by code read (`browse/page.tsx` line refs in the table). Other page rows verified current by passing PERF-R1..R8 (90 files / 2207 tests green 2026-09-10). |
