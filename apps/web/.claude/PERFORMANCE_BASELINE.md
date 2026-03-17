# Performance Baseline

**Last measured: 2026-03-16 (Session 59)**
**Purpose:** Source of truth for performance metrics. Any session proposing performance changes must measure against these baselines and demonstrate improvement before committing.

---

## Structural Metrics (Deterministic — Enforced by Tests)

These metrics are derived from code analysis. They do not depend on network conditions, data volume, or server load. They are enforced by `src/lib/__tests__/performance-baseline.test.ts`.

### Database Query Structure Per Page

| Page | Total DB Calls | Sequential | Parallelized | Max Waterfall Depth | Notes |
|------|---------------|------------|-------------|--------------------|----|
| `/[vertical]/browse` (listings) | 2-3 | 2-3 | 0 | 2-3 | **ISR-cached (Session 59).** Uses anonSupabase (no cookies). Auth/tier/locale moved to BrowseBuyerOverlay client component. Queries: listings, availability RPC, optionally zip_codes. |
| `/[vertical]/browse` (market-boxes) | 2 | 2 | 0 | 2 | **ISR-cached (Session 59).** Uses anonSupabase. Queries: offerings, subscription counts. Auth/tier moved to client overlay. |
| `/[vertical]/markets` | 5 | 1 | 4 | 2 | Excellent — 4-way parallel, then vendor counts. |
| `/[vertical]/vendors` | 4 | 0 | 4 | 2 | Optimal — two parallel phases. |
| `/[vertical]/listing/[id]` | 5 | 0 | 5 | 2 | Optimal — two parallel phases with data dependencies. |
| `/[vertical]/dashboard` | 7 | 3 | 5 | 3 | Auth guard (enforceVerticalAccess) + auth.getUser sequential, then 5-way parallel (vendorProfile, userProfile, orderCount, readyOrders, ordersNeedingConfirmation), then conditional activeItemCounts. |

**Rules:**
- Query count must NOT increase without user approval
- Sequential depth must NOT increase
- Parallel queries must NOT be converted to sequential

### Client Bundle Size

| Metric | Value | Date |
|--------|-------|------|
| Total client JS (`.next/static/chunks/`) | 4.3 MB | 2026-03-16 |
| Total client JS chunk count | 118 | 2026-03-16 |
| Largest chunk | 228 KB | 2026-03-16 |

**Rule:** Total client JS must not increase beyond 5% (4.5 MB ceiling) without justification.

---

## Architectural Decisions (Context for Future Sessions)

### Browse Page ISR (`revalidate = 300`)
**Status: EFFECTIVE (Session 59)** — Browse page uses `anonSupabase` (no cookies). `revalidate = 300` now works: first request renders server-side, then CDN caches for 5 minutes. All users hitting the same URL get cache hits (~50ms vs ~500ms dynamic). User-specific data (auth, buyer tier, premium window filtering) handled by `BrowseBuyerOverlay` client component.

**Tradeoffs accepted:**
- Cookie-based location filtering removed — users use `?zip=` URL param instead
- Premium-window items hidden via CSS class + client overlay (brief ~200ms delay for premium users to see them)
- Locale defaults to 'en' on server (client can override, rare scenario for US app)
- **Rollback:** Replace `anonSupabase` with `createClient()` to restore dynamic rendering instantly

### Browse Page `loading.tsx`
**Status: WORKING CORRECTLY** — The skeleton reveals existing server rendering latency (~0.5s on staging). The latency existed before the skeleton was added. The skeleton improves perceived performance by showing structure immediately instead of a white screen. **Do not remove the skeleton to "fix" slowness — the slowness is server-side query time, not the skeleton.**

### `get_listings_accepting_status` RPC
**Status: HEAVY BUT NECESSARY** — Called via `LEFT JOIN LATERAL` on `get_available_pickup_dates`, executing once per listing. For the browse page with 50+ listings, this is the single slowest operation. Three improvement options were analyzed in Session 59 (set-based rewrite, lightweight is-accepting function, cache table). Deferred to a future session.

---

## Known Performance Ceilings

| Area | Ceiling | Reason |
|------|---------|--------|
| Browse page TTFB | ~50ms (CDN hit), ~500ms (cache miss) | ISR-cached with 5-min revalidation. First request per URL is dynamic; subsequent requests served from CDN. |
| Dashboard page | Auth guard + auth.getUser + 5-way parallel + conditional | Parallelized in Session 59. Remaining sequential: enforceVerticalAccess (auth+profile) + auth.getUser (needed for user.id). |

---

## Change Log

| Date | Session | Change | Before | After | Method |
|------|---------|--------|--------|-------|--------|
| 2026-03-16 | 59 | Parallelize auth+locale, combine user_profiles query, consolidate dual RPC | 4-6 sequential queries, 2 duplicate queries, 2 RPC calls | 3 sequential + 1 parallel, 0 duplicates, 1 RPC call | Code analysis (query count) |
| 2026-03-16 | 59 | Dashboard: parallelize 5 data queries into Promise.all | 6 sequential, 0 parallel, depth 6 | 3 sequential, 5 parallel, depth 3 | Code analysis (query count) |
| 2026-03-16 | 59 | Compress oversized logos + hero images | fastwrks 1.2MB, FM 968KB, heroes 761KB+747KB | fastwrks 62KB, FM 93KB, heroes 202KB+194KB | File size measurement |
| 2026-03-16 | 59 | Browse page ISR: anonSupabase, auth/tier/locale to client overlay | 7 queries (3 seq + 2 parallel), depth 5, every request dynamic | 2-3 queries, depth 2-3, ISR-cached at CDN (5 min) | Code analysis + architecture change |
