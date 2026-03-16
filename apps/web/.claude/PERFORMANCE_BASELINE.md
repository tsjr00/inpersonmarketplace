# Performance Baseline

**Last measured: 2026-03-16 (Session 59)**
**Purpose:** Source of truth for performance metrics. Any session proposing performance changes must measure against these baselines and demonstrate improvement before committing.

---

## Structural Metrics (Deterministic — Enforced by Tests)

These metrics are derived from code analysis. They do not depend on network conditions, data volume, or server load. They are enforced by `src/lib/__tests__/performance-baseline.test.ts`.

### Database Query Structure Per Page

| Page | Total DB Calls | Sequential | Parallelized | Max Waterfall Depth | Notes |
|------|---------------|------------|-------------|--------------------|----|
| `/[vertical]/browse` (listings) | 7 | 3 | 2 (auth+locale) | 5 | User profile combined query (buyer_tier + location). Availability RPC consolidated (single call when Available Now filter active). |
| `/[vertical]/browse` (market-boxes) | 4 | 4 | 0 | 4 | Auth, profile, offerings, subscription counts. |
| `/[vertical]/markets` | 5 | 1 | 4 | 2 | Excellent — 4-way parallel, then vendor counts. |
| `/[vertical]/vendors` | 4 | 0 | 4 | 2 | Optimal — two parallel phases. |
| `/[vertical]/listing/[id]` | 5 | 0 | 5 | 2 | Optimal — two parallel phases with data dependencies. |
| `/[vertical]/dashboard` | 6 | 6 | 0 | 6 | All sequential. Candidate for future parallelization. |

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
**Status: NOT EFFECTIVE** — `createClient()` calls `cookies()` which opts the route into dynamic rendering, overriding ISR. The `revalidate = 300` export has no effect. The page is dynamically rendered on every request.

**Why it's still in the code:** Removing it changes nothing functionally, but documents the intent. If the page is ever converted to a static/client-fetch architecture (Option D from Session 59 analysis), ISR would become effective.

### Browse Page `loading.tsx`
**Status: WORKING CORRECTLY** — The skeleton reveals existing server rendering latency (~0.5s on staging). The latency existed before the skeleton was added. The skeleton improves perceived performance by showing structure immediately instead of a white screen. **Do not remove the skeleton to "fix" slowness — the slowness is server-side query time, not the skeleton.**

### `get_listings_accepting_status` RPC
**Status: HEAVY BUT NECESSARY** — Called via `LEFT JOIN LATERAL` on `get_available_pickup_dates`, executing once per listing. For the browse page with 50+ listings, this is the single slowest operation. Three improvement options were analyzed in Session 59 (set-based rewrite, lightweight is-accepting function, cache table). Deferred to a future session.

---

## Known Performance Ceilings

| Area | Ceiling | Reason |
|------|---------|--------|
| Browse page SSR | ~0.5s on staging | 3+ sequential DB queries + heavy availability RPC. Further improvement requires Option D (static shell + client fetch) or RPC rewrite. |
| Dashboard page | Sum of 6 sequential queries | No parallelization. Improvement possible but not yet prioritized. |

---

## Change Log

| Date | Session | Change | Before | After | Method |
|------|---------|--------|--------|-------|--------|
| 2026-03-16 | 59 | Parallelize auth+locale, combine user_profiles query, consolidate dual RPC | 4-6 sequential queries, 2 duplicate queries, 2 RPC calls | 3 sequential + 1 parallel, 0 duplicates, 1 RPC call | Code analysis (query count) |
