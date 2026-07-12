# Performance Audit — InPersonMarketplace

**Date:** 2026-03-16
**Scope:** End-to-end performance analysis — code, infrastructure, data flow, buyer hot paths
**Mode:** Report only — no code changes

---

## Executive Summary

The app has a solid foundation but is leaving significant speed on the table in three areas:

1. **Most pages are dynamically rendered on every request** — and this is harder to fix than it first appears. The `force-dynamic` on the vertical layout is redundant for most pages because the Supabase server client calls `cookies()`, which automatically opts pages into dynamic rendering. Removing `force-dynamic` alone only helps truly static pages (about, how-it-works, terms). To unlock ISR caching on data pages like browse and listing detail, the pages would need to be restructured to split public data (cacheable, no auth) from user-specific data (fetched client-side after hydration). This is a meaningful architectural change, not a one-line fix.
2. **Zero `loading.tsx` files, zero `<Suspense>` boundaries, zero `next/dynamic` imports** — the app uses none of Next.js's streaming or code-splitting features. This is the most impactful quick-to-medium effort improvement available.
3. **A 6.6MB uncompressed PNG** (`food-truck-lifestyle.png`) ships to mobile users on the FT landing page.

The buyer hot path (browse → listing → cart → checkout) is reasonably well-built on the data side (parallel queries, batched RPCs) but all data pages are dynamically rendered (no CDN caching) and there is no streaming infrastructure to improve perceived load times.

### Important: Why ISR isn't working (and what it would take)

Next.js automatically opts a page into dynamic rendering when its render path calls `cookies()`, `headers()`, or reads `searchParams`. The Supabase SSR client (`createClient()` in `src/lib/supabase/server.ts`) reads auth cookies to establish the user session, which calls `cookies()` internally. This means **every page that calls `createClient()` is implicitly dynamic** — the `revalidate` export is silently ignored.

Pages with `revalidate` that are actually dynamic due to `cookies()`:
- Browse (`revalidate = 300`) — calls `createClient()` for user tier check → dynamic
- Markets (`revalidate = 600`) — calls `createClient()` → dynamic
- Vendors (`revalidate = 600`) — calls `createClient()` → dynamic
- Help (`revalidate = 300`) — calls `createClient()` → dynamic
- Admin pages (`revalidate = 120`) — calls `createClient()` → dynamic

The `force-dynamic` on the layout is therefore **redundant but not the root cause**. Removing it helps static-content pages (about, terms, etc.) but does not unlock ISR on data pages. See AC-6 for the architectural path to real ISR.

---

## Section 1: Quick Wins (< 1 hour each, high impact)

### QW-1: Compress food-truck-lifestyle.png

- **What**: Convert `/public/images/food-truck-lifestyle.png` from 6.6MB raw PNG to optimized WebP/JPEG (~300-500KB)
- **Where**: `apps/web/public/images/food-truck-lifestyle.png`
- **Why**: 6.6MB image on the FT landing page. On a 3G connection, this alone takes 20+ seconds. Mobile users (primary audience for food trucks) suffer most.
- **Impact**: **HIGH** — eliminates the single largest asset bottleneck
- **Security impact**: None
- **Stability impact**: None
- **Trade-off verdict**: Acceptable — zero risk
- **Effort**: 15 minutes (compress with any image tool, replace file)
- **Dependencies**: None

### QW-2: Remove duplicate logos in /public

- **What**: Consolidate duplicate logo files. `farmersmarketing-logo.png` (969KB) exists in 3 locations. `food-truckn-logo.png` (1.2MB) is oversized for a logo.
- **Where**: `public/farmersmarketing-logo.png`, `public/logos/farmersmarketing-logo.png`, `public/Farmers Marketing Logo.png`, `public/FastWrks logo.png` (1.2MB), `public/food-truckn-logo.png` (1.2MB)
- **Why**: ~5MB of redundant logo files. Logos should be <50KB each (they're 200px-wide PNGs rendered at small sizes).
- **Impact**: **Medium** — reduces overall deployment size; logos are only loaded on specific pages but waste storage/bandwidth
- **Security impact**: None
- **Stability impact**: Negligible — must update any references to removed files
- **Trade-off verdict**: Acceptable
- **Effort**: 30 minutes (compress logos to ~30-50KB WebP, update references, remove duplicates)
- **Dependencies**: None

### QW-3: Add revalidate to static/semi-static pages

- **What**: Add `export const revalidate = 3600` (1 hour) to pages that rarely change: about, how-it-works, features, terms, support, coming-soon
- **Where**:
  - `src/app/[vertical]/about/page.tsx` — currently 'use client', no cache
  - `src/app/[vertical]/how-it-works/page.tsx` — currently 'use client', no cache
  - `src/app/[vertical]/terms/page.tsx` — currently 'use client', no cache
  - `src/app/[vertical]/terms/vendor/page.tsx` — currently 'use client', no cache
  - `src/app/[vertical]/terms/partner/page.tsx` — currently 'use client', no cache
- **Why**: These pages have static content but are re-rendered on every request. Note: these are `'use client'` pages, so `revalidate` won't help directly — they'd need to be converted to server components first, or the data they fetch would need API-level caching. See QW-3A below.
- **Impact**: **Medium** — reduces server load and TTFB on informational pages
- **Security impact**: None — public content
- **Stability impact**: None — content changes are manual and infrequent
- **Trade-off verdict**: Acceptable
- **Effort**: 30 minutes (for pages that are already server components); more if client→server conversion needed
- **Dependencies**: For 'use client' pages, need to either convert to server components OR add Cache-Control headers to the API routes they call

### QW-3A: Add Cache-Control to more API routes

- **What**: Add `Cache-Control: public, s-maxage=X, stale-while-revalidate=Y` to read-only API routes that currently have no cache headers
- **Where**: Currently only 11 of ~157 API routes have Cache-Control. Missing from:
  - `/api/vertical/[id]` — already has 1hr cache ✅
  - `/api/admin/analytics/*` routes — could cache 2-5 minutes
  - `/api/vendor/analytics/*` routes — could cache 2-5 minutes
  - `/api/buyer/orders` — should remain `no-store` (user-specific)
  - `/api/notifications/*` — should remain `no-store` (real-time)
  - `/api/help/*` (knowledge articles) — could cache 10-30 minutes
  - `/api/verticals` (if exists) — could cache 1 hour (rarely changes)
- **Why**: API routes without Cache-Control default to `no-store` on Vercel, meaning every request hits the serverless function. CDN caching on read-only public data is free performance.
- **Impact**: **Medium** — reduces function invocations and response times for repeated requests
- **Security impact**: None for public data routes. **Must NOT cache** user-specific, auth-gated, or mutation routes.
- **Stability impact**: Negligible — stale data for the cache duration (seconds to minutes)
- **Trade-off verdict**: Acceptable — only apply to public, read-only routes
- **Effort**: 30-60 minutes
- **Dependencies**: None

### QW-4: Enable WebP/AVIF in next.config image optimization

- **What**: Add `formats: ['image/avif', 'image/webp']` to the `images` config in `next.config.ts`
- **Where**: `apps/web/next.config.ts` line 61
- **Why**: Next.js defaults to WebP only. AVIF offers 20-50% smaller files than WebP for photos. Both are supported by modern browsers with automatic fallback. This affects all images served through `next/image`.
- **Impact**: **Medium** — all product images, vendor photos, and logos served through next/image get smaller
- **Security impact**: None
- **Stability impact**: None — automatic format negotiation with fallback
- **Trade-off verdict**: Acceptable
- **Effort**: 5 minutes (one line in config)
- **Dependencies**: None

### QW-5: Remove or fix WebVitals component

- **What**: The `WebVitals` component (`src/components/layout/WebVitals.tsx`) sends metrics to `/api/analytics/vitals`, but that API endpoint doesn't exist. Either create the endpoint or remove the component.
- **Where**: `src/components/layout/WebVitals.tsx`, `src/app/layout.tsx`
- **Why**: The component fires `navigator.sendBeacon()` on every page load to a non-existent endpoint, generating 404 errors silently. Wasted network request on every page.
- **Impact**: **Low** — eliminates one wasted request per page load
- **Security impact**: None
- **Stability impact**: None
- **Trade-off verdict**: Acceptable
- **Effort**: 10 minutes
- **Dependencies**: None

---

## Section 2: Medium Effort (1-4 hours, meaningful impact)

### ME-1: Remove `force-dynamic` from vertical layout (corrected scope)

- **What**: Remove `export const dynamic = 'force-dynamic'` from `src/app/[vertical]/layout.tsx`.
- **Where**: `src/app/[vertical]/layout.tsx:9`
- **Why**: The `force-dynamic` on the layout explicitly forces every child page to be dynamic. However, **most data pages are already implicitly dynamic** because they call `createClient()` which invokes `cookies()`. So removing `force-dynamic` does NOT unlock ISR for browse, markets, vendors, or listing detail — those pages would remain dynamic regardless.

  **What it DOES unlock**: Pages that don't call `createClient()` — about, how-it-works, terms, features, coming-soon — would become truly static (built at build time, served from CDN). These are low-traffic informational pages, so the impact is real but limited.

  The stated reason for `force-dynamic` was "to ensure header always reflects current user" and to prevent cross-vertical data leakage. Neither concern is actually addressed by `force-dynamic`:
  - **Header**: Already a `'use client'` component with `onAuthStateChange` — handles auth state client-side regardless of caching.
  - **Cross-vertical**: ISR cache keys include the full URL path (`/food_trucks/browse` ≠ `/farmers_market/browse`). Vertical isolation is enforced by `.eq('vertical_id', vertical)` in queries, not by rendering mode.
  - **The layout itself does NO data fetching** — it calls `getVerticalCSSVars()` (synchronous), generates metadata, and renders `<HeaderWrapper>` + `<CartProviderWrapper>`.

- **Impact**: **Low-Medium** — unlocks static rendering for ~5-8 informational pages only. Data pages remain dynamic due to `cookies()`. Still worth doing as cleanup (removes a misleading export and dead `revalidate` confusion), and it's a prerequisite for AC-6 (the architectural path to real ISR).
- **Security impact**: **None** — cross-vertical isolation is URL-path-based and query-based, not rendering-mode-based. Middleware still runs on every request (auth refresh, vertical validation). Header manages auth client-side.
- **Stability impact**: **None** — dashboard pages have their own `force-dynamic` (correct). Data pages remain dynamic via `cookies()`.
- **Trade-off verdict**: **Acceptable** — zero risk, moderate benefit for static pages, removes misleading config
- **Effort**: 30 minutes (remove the export + verify static pages render correctly)
- **Dependencies**: None

### ME-2: Add `loading.tsx` files for buyer hot path routes

- **What**: Create `loading.tsx` files for key routes to enable Next.js streaming (instant shell, content streams in)
- **Where**: Create files at:
  - `src/app/[vertical]/browse/loading.tsx` — skeleton grid of product cards
  - `src/app/[vertical]/listing/[listingId]/loading.tsx` — skeleton product detail
  - `src/app/[vertical]/vendor/[vendorId]/profile/loading.tsx` — skeleton vendor page
  - `src/app/[vertical]/dashboard/loading.tsx` — skeleton dashboard
  - `src/app/[vertical]/vendor/dashboard/loading.tsx` — skeleton vendor dashboard
- **Why**: Currently, the app shows nothing until the full page renders. With `loading.tsx`, Next.js streams a skeleton/spinner immediately while data loads. This dramatically improves perceived performance (FCP drops to near-instant).
- **Impact**: **HIGH** — perceived speed improvement is dramatic; users see content structure immediately
- **Security impact**: None — loading states show no real data
- **Stability impact**: None — standard Next.js pattern
- **Trade-off verdict**: Acceptable
- **Effort**: 2-3 hours (design consistent skeleton components, create 5-8 loading.tsx files)
- **Dependencies**: None — `loading.tsx` works regardless of ISR/dynamic rendering mode. It provides streaming for dynamic pages too (the shell renders immediately, data streams in). This is the single most impactful quick improvement precisely because it works even though all data pages are dynamic.

### ME-3: Lazy-load chart.js with `next/dynamic`

- **What**: Use `next/dynamic` to lazy-load `SalesChart` component so chart.js (~54KB) isn't in the initial bundle for analytics pages
- **Where**:
  - `src/app/admin/analytics/page.tsx`
  - `src/app/[vertical]/admin/analytics/page.tsx`
  - `src/app/[vertical]/vendor/analytics/page.tsx`
- **Why**: chart.js + react-chartjs-2 (~62KB combined) is loaded immediately when any analytics page renders, even before the data arrives. Dynamic import defers it until the chart is ready to display.
- **Impact**: **Medium** — only affects admin/vendor analytics pages (small audience), but removes ~62KB from those page bundles
- **Security impact**: None
- **Stability impact**: None — chart renders after data loads anyway
- **Trade-off verdict**: Acceptable
- **Effort**: 30 minutes
- **Dependencies**: None

### ME-4: Add missing database indexes for hot path queries

- **What**: Add composite indexes to support the buyer hot path queries:
  ```sql
  -- Browse page: vendor filter in listing query
  CREATE INDEX idx_vendor_profiles_vertical_status
    ON vendor_profiles(vertical_id, status);

  -- Browse page: vendor tier sorting
  CREATE INDEX idx_vendor_profiles_vertical_tier
    ON vendor_profiles(vertical_id, tier);
  ```
- **Where**: New migration file
- **Why**: The browse page query JOINs listings with `vendor_profiles!inner` filtered by `status='approved'` and `vertical_id`. Without a composite index, PostgreSQL may do a sequential scan on vendor_profiles for each listing.
- **Impact**: **Medium** — faster browse page queries, especially as vendor count grows
- **Security impact**: None — indexes don't change data access patterns
- **Stability impact**: None — additive, no schema changes
- **Trade-off verdict**: Acceptable
- **Effort**: 30 minutes (write migration, apply, update schema snapshot)
- **Dependencies**: Standard migration workflow

### ME-5: Batch expired order cleanup in checkout session

- **What**: Convert the sequential loop in checkout session route to use `Promise.all()` for expired order cleanup
- **Where**: `src/app/api/checkout/session/route.ts` (around lines 101-122)
- **Why**: When expired pending orders exist, the current code runs 3 sequential DB calls per expired order (restore inventory, update items, update order). With 10 expired orders, that's 30 sequential calls adding ~3 seconds to checkout initiation.
- **Impact**: **Medium** — only affects checkout when expired orders exist, but when it does, it's the checkout page (buyer hot path)
- **Security impact**: None — same operations, different execution pattern
- **Stability impact**: **Negligible** — need to ensure partial failure handling. If one order's cleanup fails, others should still proceed. Use `Promise.allSettled()` instead of `Promise.all()`.
- **Trade-off verdict**: Acceptable with `Promise.allSettled()`
- **Effort**: 1 hour
- **Dependencies**: None

### ME-6: Replace `select('*')` with explicit column lists in utility functions

- **What**: Replace `select('*')` calls with explicit column lists in `src/lib/db/listings.ts`, `src/lib/db/vendors.ts`, and `src/lib/db/verticals.ts`
- **Where**: `src/lib/db/listings.ts` (lines ~46, 71, 102), `src/lib/db/vendors.ts` (lines ~40, 58), `src/lib/db/verticals.ts`
- **Why**: `select('*')` fetches every column including large text fields, JSONB blobs, and unused columns. Explicit selects reduce payload size and PostgreSQL I/O.
- **Impact**: **Low-Medium** — depends on table width and JSONB column sizes. The `verticals` table has a large `config` JSONB column; selecting only needed fields saves bandwidth.
- **Security impact**: None — still filtered by RLS
- **Stability impact**: **Negligible** — must ensure all callers get the columns they need. Best done one file at a time with testing.
- **Trade-off verdict**: Acceptable
- **Effort**: 2 hours (audit each caller to determine needed columns)
- **Dependencies**: None

### ME-7: ~~Convert listing detail page from force-dynamic to short revalidate~~ RETRACTED

- **Original proposal**: Replace `force-dynamic` with `revalidate = 60` on the listing detail page.
- **Why retracted**: The listing detail page calls `createClient()` to query listing data, vendor info, and availability. The Supabase SSR client invokes `cookies()`, which automatically opts the page into dynamic rendering regardless of any `revalidate` export. Changing the export to `revalidate = 60` would have no effect — the page would remain dynamic.
- **What would be needed instead**: Restructure the page to fetch public listing data via an anonymous Supabase client (no cookies → ISR eligible) and load user-specific data (cart state, premium pricing) client-side. This is part of the larger AC-6 architectural change.
- **Status**: Rolled into AC-6.

---

## Section 3: Architectural Changes (larger effort, significant impact)

### AC-1: Convert high-traffic client pages to server components with streaming

- **What**: The 47 `'use client'` page components fetch data in `useEffect`, which means: render empty shell → hydrate → fire API calls → show loading spinner → render data. This creates a visible blank/loading state on every page load.

  Convert the highest-traffic pages to server components that fetch data at render time, with `<Suspense>` boundaries for streaming:
  - `src/app/[vertical]/buyer/orders/page.tsx` (1021 lines)
  - `src/app/[vertical]/buyer/orders/[id]/page.tsx` (~1250 lines)
  - `src/app/[vertical]/checkout/page.tsx` (1116 lines) — partial; keep interactive parts client
  - `src/app/[vertical]/notifications/page.tsx`

  Pattern: Server component fetches initial data → passes as props to client components for interactivity.

- **Where**: Each page listed above + new Suspense-wrapped sub-components
- **Why**: Server components stream HTML with data already embedded. The browser paints immediately — no blank→loading→content flash. On slow connections, the improvement is dramatic.
- **Impact**: **HIGH** — eliminates the loading flash on every page visit for the buyer flow
- **Security impact**: **Negligible** — server components have the same auth context via Supabase SSR cookies. Data access patterns don't change.
- **Stability impact**: **Negligible** — requires restructuring component boundaries. Interactive parts (filters, buttons, forms) stay as client components via composition.
- **Trade-off verdict**: Acceptable — standard Next.js architecture
- **Effort**: 2-4 hours per page (4-5 pages = 1-2 sessions)
- **Dependencies**: None (server components work regardless of ISR/dynamic mode — they still stream faster than client useEffect fetching)

### AC-2: Code-split the vendor markets page (2583 lines)

- **What**: Break `src/app/[vertical]/vendor/markets/page.tsx` (2583 lines) into sub-components loaded with `next/dynamic`. Current structure has 6+ `useEffect` chains, manages fixed markets, event markets, private pickups, limits, and suggestions all in one monolithic component.
- **Where**: `src/app/[vertical]/vendor/markets/page.tsx`
- **Why**: The entire 2583-line component bundle is shipped on initial load. Sections like event management, private pickup creation, and market suggestions could be lazy-loaded behind tabs/accordions.
- **Impact**: **Medium** — vendor page, not buyer hot path, but vendors visit frequently
- **Security impact**: None
- **Stability impact**: Negligible — refactoring existing code, no logic changes
- **Trade-off verdict**: Acceptable
- **Effort**: 3-4 hours
- **Dependencies**: None

### AC-3: Implement cursor-based database pagination for browse page

- **What**: Replace the current memory-based pagination (fetch all → filter → paginate in JS) with cursor-based pagination (database `LIMIT`/`OFFSET` or keyset pagination)
- **Where**: `src/app/[vertical]/browse/page.tsx` (lines ~440-650)
- **Why**: Currently, the browse page fetches ALL listings matching the vertical + status filter, then does Haversine distance filtering in memory, then paginates to 50/page. With 1000+ listings in a vertical, the initial fetch grows linearly.

  **Caveat**: Haversine filtering happens after the DB query because PostgreSQL doesn't have a native spatial index on this schema. Two options:
  - **Option A**: Add PostGIS extension + spatial index → filter distance at DB level → cursor pagination works directly
  - **Option B**: Keep Haversine in JS but limit the initial DB query with a generous bounding box (`WHERE lat BETWEEN X AND Y AND lng BETWEEN A AND B`) before applying exact Haversine

  Option B is simpler and delivers most of the benefit.

- **Impact**: **Medium** now (dataset is small), **HIGH** as listings grow past 500+
- **Security impact**: None — same data access
- **Stability impact**: **Negligible** — bounding box pre-filter might exclude edge cases at boundaries, but that's acceptable for discovery pages (not transactional)
- **Trade-off verdict**: Acceptable — Option B recommended (simpler, no new extension)
- **Effort**: 3-4 hours
- **Dependencies**: None, but ME-4 (indexes) improves this further

### AC-4: Optimize heavy RLS policies on markets table

- **What**: The markets SELECT RLS policy includes a nested `EXISTS` subquery that checks `order_items` for every market row returned. This runs on every query touching the markets table.
  ```sql
  OR EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.market_id = markets.id
    AND oi.vendor_profile_id = (
      SELECT id FROM vendor_profiles WHERE user_id = auth.uid()
    )
  )
  ```
  Optimize by: caching `vendor_profile_id` lookup, using `IN` instead of nested SELECT, or using a SECURITY DEFINER helper function.

- **Where**: Markets RLS policy (from migration `20260209_003_merge_markets_select_policies.sql`)
- **Why**: This subquery executes for **every row** in the markets table on every SELECT. With 100+ markets and 1000+ order_items, this compounds.
- **Impact**: **Medium** — affects all market queries (browse, vendor markets, admin)
- **Security impact**: **Must remain equivalent** — the policy controls who can see which markets. Any optimization must return the same result set.
- **Stability impact**: **Negligible** if policy logic is equivalent
- **Trade-off verdict**: Acceptable — but must verify policy equivalence with careful testing
- **Effort**: 2-3 hours (write migration, test RLS behavior, verify no access changes)
- **Dependencies**: Standard migration workflow. Query error_resolutions for RLS issues first.

### AC-6: Restructure data pages for ISR (public/private data split)

- **What**: The architectural change required to actually unlock ISR caching on data pages (browse, listing detail, markets, vendors). Currently, these pages call `createClient()` (which reads auth cookies via `cookies()`), making them implicitly dynamic regardless of any `revalidate` export.

  **The pattern**:
  1. Create an anonymous Supabase client that does NOT read cookies — used for public data queries
  2. Page component fetches public data (listings, markets, vendor profiles) via the anonymous client → ISR-eligible
  3. User-specific data (tier status, premium pricing, favorites, cart indicators) is fetched client-side after hydration via a small client component
  4. The page exports `revalidate = 300` (or whatever interval) — and it actually works because `cookies()` is never called in the server render path

  **Pages to restructure** (buyer hot path first):
  - `[vertical]/browse/page.tsx` — public listings + client-side tier/premium overlay
  - `[vertical]/listing/[listingId]/page.tsx` — public listing detail + client-side cart/availability
  - `[vertical]/markets/page.tsx` — public markets list
  - `[vertical]/vendors/page.tsx` — public vendors list

  **What the anonymous client looks like**:
  ```typescript
  // src/lib/supabase/anon.ts
  import { createClient } from '@supabase/supabase-js'
  export const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  // No cookies, no auth — reads only public data via RLS anon policies
  ```

  **RLS requirement**: The anon key respects RLS. Public data (published listings, active markets, approved vendors) must be readable by the `anon` role. This is likely already the case since the browse page works for non-logged-in users.

- **Where**: New `src/lib/supabase/anon.ts` + refactored page components
- **Why**: This is the only path to real ISR caching on data pages. Without it, every page view hits a serverless function (~300-800ms TTFB). With it, repeat visits within the revalidation window are served from CDN (~30-80ms TTFB).
- **Impact**: **HIGH** — 5-10x TTFB improvement on the most-visited pages
- **Security impact**: **Negligible** — the anon client can only read data that RLS allows for the `anon` role (public listings, markets, vendors). User-specific data is still fetched via the authenticated client, but client-side. No new data is exposed.
  - **Verify**: Ensure RLS policies on listings, markets, vendors, and vendor_profiles allow `anon` SELECT for published/active/approved rows. If any policy requires `auth.uid()` for SELECT on public data, it would need adjustment — but this would also mean non-logged-in users can't browse, which is unlikely.
- **Stability impact**: **Negligible** — user-specific overlays (tier badges, premium prices) appear after hydration instead of on first paint. Brief visual shift possible, but content is identical.
- **Trade-off verdict**: **Acceptable** — standard pattern for Next.js apps with auth + ISR. Used by major Next.js apps (Vercel's own docs site, e-commerce templates).
- **Effort**: 4-6 hours per page (browse page first as proof of concept)
- **Dependencies**: ME-1 (remove force-dynamic from layout) should happen first as cleanup, but is not strictly required — the anon client approach works regardless because it avoids `cookies()` entirely.

### AC-5: Add client-side data caching (SWR or React Query) for interactive pages

- **What**: Add `swr` or `@tanstack/react-query` for client-side data caching on pages that refetch frequently (orders, notifications, vendor dashboard)
- **Where**: New lib setup + 10-15 pages that do client-side `fetch()` calls
- **Why**: Currently, every page navigation triggers fresh API calls with no client-side cache. Navigating away from orders and back → full refetch. With SWR/React Query:
  - Instant display of cached data on revisit
  - Background revalidation updates silently
  - Reduced API call volume
  - Automatic retry on failure
  - Deduplication of concurrent requests
- **Impact**: **Medium-High** — dramatically improves perceived speed of page-to-page navigation on interactive pages
- **Security impact**: **Negligible** — cached data is same data the user already saw. Cache clears on auth change.
- **Stability impact**: **Negligible** — adds a dependency but SWR/React Query are industry-standard. SWR is only 4KB.
- **Trade-off verdict**: Acceptable
- **Effort**: 4-6 hours (initial setup + convert 5-10 key pages)
- **Dependencies**: None

---

## Section 4: Infrastructure & Tier Opportunities

### IT-1: Vercel Free Tier — Features available but not used

| Feature | Status | Opportunity |
|---------|--------|-------------|
| **ISR (Incremental Static Regeneration)** | Configured but inactive | Several pages export `revalidate` values (browse=300s, markets=600s, etc.) but ISR is **silently overridden** because these pages call `createClient()` which invokes `cookies()`, auto-opting into dynamic rendering. The `force-dynamic` on the layout is redundant — `cookies()` already forces dynamic. To unlock ISR, pages need to be restructured to use an anonymous Supabase client for public data (see AC-6). |
| **Edge Middleware** | ✅ Used | Middleware handles auth refresh, vertical validation, locale sync. Already optimized. |
| **Image Optimization** | ✅ Used | `next/image` deployed. Missing AVIF format (QW-4). |
| **Streaming/Suspense** | ❌ Not used | Zero `loading.tsx` files, zero `<Suspense>` boundaries. Free feature, significant impact. |
| **Edge Functions** | Not used | API routes run on serverless (Node.js). Edge is available but requires Edge Runtime compatibility. Most routes use Node APIs (Stripe, Supabase client), so Edge isn't viable for most. |
| **Stale-While-Revalidate** | Partially used | Some API routes set SWR headers. Unlocked by ISR + API cache headers. |
| **Static Asset Caching** | Default | Vercel auto-caches `/_next/static/` with immutable headers. No additional config needed. |

**Verdict**: The free tier already includes everything needed. The problem isn't missing features — it's not using the features already available (ISR, streaming).

### IT-2: Supabase Paid Plan — Connection pooling

- **What**: Supabase Pro includes Supavisor connection pooler in two modes:
  - **Transaction mode** (port 6543) — best for serverless (connection per query, no session state)
  - **Session mode** (port 5432) — persistent connections, supports prepared statements
- **Where**: Supabase project settings → Database → Connection Pooling
- **Why**: Vercel serverless functions create a new database connection per invocation. With 157 API routes potentially running concurrently, connection overhead adds up. Transaction mode pools connections efficiently.
- **Current status**: Likely using direct connections (default). Need to verify if `DATABASE_URL` in Vercel uses the pooler port.
- **Impact**: **Medium** — reduces connection overhead, especially under concurrent load
- **Security impact**: None — same auth, same RLS
- **Stability impact**: **Negligible** — transaction mode drops session state between queries, but Supabase JS client is designed for this
- **Trade-off verdict**: Acceptable
- **Effort**: 30 minutes (change connection string to pooler URL)
- **Dependencies**: Verify Supabase plan includes Supavisor (Pro and above)
- **Cost**: Already included in current paid plan

### IT-3: Supabase — Consider adding `pg_stat_statements` for query monitoring

- **What**: Enable the `pg_stat_statements` extension to monitor slow queries
- **Where**: Supabase SQL editor
- **Why**: Without query monitoring, we're guessing which queries are slow. This extension tracks execution time, call count, and rows returned for every query.
- **Impact**: **Low** directly, but **enables** targeted optimization
- **Security impact**: None — read-only monitoring
- **Stability impact**: None — lightweight extension, negligible overhead
- **Trade-off verdict**: Acceptable
- **Effort**: 15 minutes
- **Dependencies**: Supabase Pro plan (already on paid plan)

### IT-4: Paid tier upgrades — NOT recommended at this time

| Upgrade | Cost | Benefit | Recommendation |
|---------|------|---------|----------------|
| Vercel Pro ($20/mo) | $20/mo | 10s function timeout → 60s, more bandwidth, Edge Config | **Not needed** — current function timeouts are fine, bandwidth is low for early-stage app |
| Supabase → Team ($599/mo) | $599/mo | SOC2, custom domains, SLA | **Not needed** — no enterprise requirements yet |
| CDN (Cloudflare Pro) | $25/mo | Custom cache rules, image optimization | **Not needed** — Vercel includes CDN on free tier |
| Upstash Pro | $10/mo | 30K commands/day vs 10K | **Not needed** — current rate limiting volume is well under 10K/day |

**Bottom line**: There are no paid upgrades worth the cost at this stage. All meaningful speed improvements are available on current tiers through code/config changes.

---

## Section 5: Buyer Hot Path Optimization Plan

The buyer hot path: **Landing → Browse → Listing Detail → Add to Cart → Checkout → Order Status**

### Current State Assessment

| Step | Page | Rendering | Caching | Data Pattern | TTFB (est.) |
|------|------|-----------|---------|--------------|-------------|
| Landing | `[vertical]/page.tsx` | Server | ❌ Dynamic (force-dynamic layout + may use cookies) | Light queries | ~400ms |
| Browse | `[vertical]/browse/page.tsx` | Server | ❌ Dynamic (`revalidate=300` configured but inactive — `cookies()` via `createClient()` overrides) | 5-7 DB calls, parallel | ~600ms |
| Listing Detail | `[vertical]/listing/[listingId]/page.tsx` | Server | ❌ Dynamic (explicit `force-dynamic` + `cookies()`) | 3-4 DB calls + availability RPC | ~500ms |
| Add to Cart | Client-side | N/A | N/A | API call to `/api/cart/items` | N/A |
| Checkout | `[vertical]/checkout/page.tsx` | Client | N/A | 3 useEffect chains, sequential | ~800ms to interactive |
| Order Status | `[vertical]/buyer/orders/[id]/page.tsx` | Client | N/A | useEffect data fetch | ~600ms to interactive |

### Optimized State — Two tiers of improvement

**Tier A — Achievable without restructuring (streaming + loading states):**

| Step | Change | Perceived Speed Improvement |
|------|--------|-----------------------------|
| Landing | ME-1 removes force-dynamic → static for pages that don't use `createClient()` | Moderate (if landing doesn't call createClient) |
| Browse | ME-2 adds `loading.tsx` → instant skeleton while data loads | **HIGH** — perceived FCP drops to near-instant |
| Listing Detail | ME-2 adds `loading.tsx` → instant skeleton | **HIGH** — same |
| Checkout | ME-5 batches expired order cleanup; AC-1 converts to server component with streaming | Medium to HIGH — eliminates blank→loading→content flash |
| Order Status | AC-1 converts to server component with streaming | Medium — eliminates useEffect loading flash |
| All pages | QW-1 compresses 6.6MB image; QW-4 enables AVIF | Medium — faster asset loading |

**Tier B — Requires AC-6 restructuring (ISR via public/private data split):**

| Step | Change | New TTFB (est.) | Improvement |
|------|--------|-----------------|-------------|
| Browse | AC-6: anonymous client for public data + `revalidate=300` | ~50ms (CDN) | ~550ms faster |
| Listing Detail | AC-6: anonymous client + `revalidate=60` | ~50ms (CDN) | ~450ms faster |
| Markets | AC-6: anonymous client + `revalidate=600` | ~50ms (CDN) | ~350ms faster |
| Vendors | AC-6: anonymous client + `revalidate=600` | ~50ms (CDN) | ~350ms faster |

### Prioritized Implementation Sequence for Hot Path

**Immediate wins (no restructuring):**
1. **ME-2**: Add loading.tsx skeletons for browse + listing detail (highest bang-for-buck)
2. **QW-1**: Compress food-truck-lifestyle.png (landing page)
3. **QW-4**: Enable AVIF image format (all images)
4. **ME-1**: Remove force-dynamic from layout (unlocks static for informational pages)
5. **ME-5**: Batch expired order cleanup (checkout)

**Larger effort (restructuring):**
6. **AC-1**: Convert checkout + order pages to server components with streaming
7. **AC-6**: Restructure browse + listing detail for ISR (public/private data split)

---

## Recommended Implementation Order

Sequenced for maximum cumulative impact with least risk, prioritizing changes with no security/stability trade-offs first.

### Phase 1: Zero-risk quick wins (1 session, ~3 hours)

| Order | Item | Impact | Risk |
|-------|------|--------|------|
| 1 | **QW-1**: Compress food-truck-lifestyle.png | HIGH | None |
| 2 | **QW-2**: Remove/compress duplicate logos | Medium | None |
| 3 | **QW-4**: Enable AVIF in next.config | Medium | None |
| 4 | **QW-5**: Fix/remove WebVitals component | Low | None |

### Phase 2: Streaming & skeletons ⭐ HIGHEST IMPACT (1 session, ~3 hours)

| Order | Item | Impact | Risk |
|-------|------|--------|------|
| 5 | **ME-2**: Add loading.tsx for hot path routes | **HIGH** | None |
| 6 | **ME-3**: Lazy-load chart.js | Medium | None |
| 7 | **ME-1**: Remove force-dynamic from layout (cleanup + unlocks static pages) | Low-Medium | None |

### Phase 3: API & caching improvements (1 session, ~2 hours)

| Order | Item | Impact | Risk |
|-------|------|--------|------|
| 8 | **QW-3A**: Add Cache-Control to more API routes | Medium | None |
| 9 | **ME-5**: Batch expired order cleanup | Medium | Negligible |
| 10 | **ME-6**: Replace select('*') with explicit columns | Low-Medium | Negligible |

### Phase 4: Database optimization (1 session, ~2 hours)

| Order | Item | Impact | Risk |
|-------|------|--------|------|
| 11 | **ME-4**: Add missing indexes | Medium | None |
| 12 | **IT-2**: Enable connection pooler | Medium | Negligible |
| 13 | **IT-3**: Enable pg_stat_statements | Low | None |

### Phase 5: Architectural refactoring (3-5 sessions)

| Order | Item | Impact | Risk |
|-------|------|--------|------|
| 14 | **AC-5**: Add SWR for client-side caching | Medium-High | Negligible |
| 15 | **AC-1**: Convert client pages to server components with streaming | HIGH | Negligible |
| 16 | **AC-2**: Code-split vendor markets page | Medium | None |
| 17 | **AC-3**: Cursor-based DB pagination | Medium | Negligible |
| 18 | **AC-4**: Optimize markets RLS policy | Medium | Must verify equivalence |
| 19 | **AC-6**: Public/private data split for ISR on browse + listing detail | **HIGH** | Negligible (verify RLS anon policies) |

---

## Appendix A: Findings That Are NOT Performance Issues

These were investigated and found to be correctly implemented:

- **Supabase client creation**: Uses `@supabase/ssr` correctly, no connection leaks
- **Service client usage**: All uses are behind admin role gates — no security shortcuts for speed
- **Image uploads**: Already compress to 1200px/80% JPEG before storing — well optimized
- **N+1 queries on browse page**: Already batched using `get_listings_accepting_status()` RPC
- **Vertical CSS var injection**: Synchronous computation, negligible cost
- **Font loading**: Using `next/font` with Latin subset — optimal
- **Service worker**: Lightweight (72 lines), push-only — no caching overhead
- **Sentry**: Conditionally loaded, 10% sampling, minimal impact

## Appendix B: Existing Good Practices

Credit where due — these patterns are already well-implemented:

1. **Batch availability RPC** (`get_listings_accepting_status`) — single call for 50+ listings
2. **Parallel API fetches** — `Promise.all` used in 17 API routes
3. **ISR configured on browse page** — `revalidate = 300` is set (currently inactive due to `cookies()` — see AC-6 for the path to activate it)
4. **CDN cache headers** on public API routes (listings, markets, nearby)
5. **Image optimization pipeline** — upload compression + next/image for display
6. **Middleware is lightweight** — auth refresh + 3 quick checks, no heavy computation
7. **Server-side browse page** — data fetched at render, not in useEffect
8. **Comprehensive indexing** — 17+ indexes on listings, 13 on order_items, 10 on subscriptions

## Appendix C: Not Investigated (Out of Scope)

- **Third-party API latency** (Stripe, Resend, Twilio) — external, can't optimize
- **DNS resolution time** — depends on registrar/CDN configuration
- **Client device performance** — varies by user hardware
- **Network conditions** — depends on user's connection
