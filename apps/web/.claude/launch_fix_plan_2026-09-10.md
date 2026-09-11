# Launch Fix Plan — 2026-09-10 (PLAN ONLY — nothing built)

**Source:** `launch_readiness_review_2026-09-10.md` (the findings). This file is the HOW: options,
recommendation, files, blast radius, tests to ADD, verification, sequencing. Owner picks; every
item still needs its own express "build it" (scoped-go rule). Protected files marked ⚠ need
per-file diff approval at build time.

**Owner's staging test-pass findings:** NOT yet received (owner: "we will cover later"). Section
Z below is reserved for them.

**Research inputs (agents locate, Claude verifies before anything lands here):**
- [x] R1 rate-limit call-site inventory (Sonnet) — verified: 351 calls, 0 after-auth, 0 user-keyed; both test dependencies read (api-route-guards 429-before-401; money-authorization mock lacks compositeKey)
- [x] R2 inline-script / JSON-LD sink inventory + CSP nonce feasibility (Sonnet) — verified: 3 email escaping gaps, PromoteCard document.write, Next nonce-from-request-CSP mechanism
- [x] R3 browse-page caching design options (Opus) — verified: PERF-R1 assertions, PERF-R9 60-day tripwire (fires 2026-09-13), unused market_schedules embed, auth-js anonymous short-circuit, client-side listing writes, LATERAL RPC shape, unstable_cache export
- [x] R4 Next.js 16.1.6 → 16.3.x upgrade path (Opus) — verified locally: latest 16.3.4, Sentry peer ^16, 0 'use server', no rewrites/experimental in config, root lockfile cause; advisory applicability from agent-fetched advisory text
- [x] R5 zod adoption scoping for money/state routes (Sonnet) — verified: vendor/payouts route absent, market-boxes PATCH missing price floor, admin payments no upper bound, cart/items/[id] untyped quantity
- [x] R6 (Claude) cause-remit sweep idempotency, checkout client body source, page-level error sinks, legacy event tokens

---

## Sequencing proposal (owner picks; each line = its own build go + its own staging push)

**Batch 0 — do first, no code risk**
- Item 17: re-measure + correct `PERFORMANCE_BASELINE.md` (docs commit) — or the suite goes red 2026-09-13.
- Item 3: `next@16.3.4` upgrade commit (also protects the owner's Windows dev box). Then item 11.
- Item 4 owner check: Upstash plan. Item 10 owner query: live RLS/ACL on prod.
- Item 18: rules-file correction (owner authorizes).

**Batch 1 — launch-day traffic (the score-4 dimension)**
- Item 1: two-tier rate limiting on the ~20 money/state routes (5 protected diffs).
- Item 5 #1 + #3: trim the browse select; `unstable_cache` the catalog fetch (vaulted-file diff first).
- Item 5 #2: set-based availability RPC (migration + integration test FIRST) — can run in parallel
  with the above because it touches no app code.
- Item 4 code: limiter-degraded visibility in `/api/health` + `logError`.
- Item 6: slot-availability rate limit.

**Batch 2 — security defects (small, no protected files)**
- Item 2: JSON-LD safe serializer + guardrail test.
- Item 16: shared `escapeHtml` + the 3 email builders + PromoteCard.
- Item 8 concrete gap: market-boxes PATCH price floor.

**Batch 3 — hardening, post-launch acceptable**
- Item 9: nonce CSP (after item 2). Item 8: zod adapter + top-20. Item 7: page-level `observed()`.
- Item 13: session-route market-id check (protected). Item 14: legacy event tokens (owner query).
- Item 12: cron split. Item 15: none (resolved).

**Explicit non-changes:** browse page stays `force-dynamic` with the cookie path (vault); no test
expectation is modified anywhere in this plan; `middleware.ts` is not renamed to `proxy.ts`.

**Verification standard for every batch:** pre-commit (lint/tsc/vitest) → staging push → owner Tier-1
smoke list (2-3 items from the diff) → `git log origin/staging` ref check → Vercel build status.

## Stage A results — live PROD catalog queries run by owner 2026-09-11

- **Tables without RLS:** only `spatial_ref_sys` (PostGIS system table). ✅
- **Views:** all 8 application views carry `security_invoker=true` → no RLS bypass via updatable views
  (`active_markets`, `v_failed_approaches`, `vendor_referral_summary` are updatable but run as caller). ✅
- **Anon table grants:** ALL privileges on every table = Supabase default; RLS is the enforcement (my
  earlier "expect SELECT only" was wrong). Policies for `{public}` non-SELECT exist on ~45 tables — their
  USING/WITH CHECK expressions (Query C) decide exposure; pending owner run.
- **🔴 NEW FINDING A-1 — five write-capable SECURITY DEFINER functions are EXECUTE-able by anon (and any
  authenticated user) over PostgREST, and none checks the caller** (bodies read; `auth.uid`/`is_admin`
  absent from their defining files):
  | function | what it writes | callers today | fix |
  |---|---|---|---|
  | `vendor_skip_week(p_pickup_id, p_reason)` | UPDATE market_box_pickups, INSERT extension pickup, UPDATE market_box_subscriptions (mig 124:128-224) | skip route via USER client after its own ownership check (`pickups/[id]/skip/route.ts:9,36,102`); `cancel-date-cascade.ts:376` via service | REVOKE FROM PUBLIC; GRANT service_role; route switches to service client after ownership check (route already owns the check) |
  | `ensure_user_profile(p_user_id, p_email, p_display_name)` | INSERT user_profiles for ARBITRARY user_id/email (085b:56-86) | login page via user client with the caller's own id (`login/page.tsx:110`) | replace param with `auth.uid()` inside the function (any logged-in user can pre-create/poison another user's profile row today — needs the victim's auth uuid) → new function version; REVOKE anon |
  | `cleanup_cart_items_invalid_schedules()` | DELETE cart_items platform-wide; returns user_id + listing titles | none in src | REVOKE FROM PUBLIC; GRANT service_role |
  | `refresh_all_vendor_locations()` / `refresh_vendor_location(uuid)` | DELETE + rebuild vendor_location_cache (nearby search goes empty mid-rebuild) | none in src | REVOKE FROM PUBLIC; GRANT service_role |
  | `scan_vendor_activity(p_vertical_id)` | INSERT scan log, UPDATE/INSERT vendor_activity_flags | cron via SERVICE key only (`vendor-activity-scan/route.ts:18-19,74`) | REVOKE FROM PUBLIC; GRANT service_role — zero app impact |
  Severity: vendor_skip_week = HIGH (subscription/pickup state, callable by anyone with the public anon
  key); the rest MEDIUM (data destruction / cache DoS / flag spam / profile poisoning). Pattern to
  mirror: mig 152 (`REVOKE EXECUTE … FROM PUBLIC`, then explicit GRANTs). Proposed as **mig 248**,
  differential class (behavior changes for anon/authenticated callers) → pre-check counts + the
  skip-route client change in the SAME push. Owner decides.
- **🔴 NEW FINDING A-2 — buyers can rewrite their own order_items money columns via PostgREST, and the
  payout code trusts them.** Query C (owner-run) shows every `{public}` write policy is identity-bound
  EXCEPT the intentional `buyer_interests_insert` (`true`). But identity-bound ≠ safe: `order_items_update`
  (mig 20260201_004) lets the ORDER'S BUYER update any column of their own items (no WITH CHECK, no column
  list); `order_items_insert` (mig 011:90) lets the buyer INSERT items into their own order; `orders_update`
  (mig 011:69) lets the buyer update any column of their own order. The fulfill route transfers exactly
  `orderItem.vendor_payout_cents` (`fulfill/route.ts:341,353,400-401`), same in buyer-confirm
  (`confirm/route.ts:222-272`). Paid gate checks the `payments` table too (`fulfill/route.ts:101-112`),
  so faking `orders.status` alone does NOT unlock a payout — but on a GENUINELY paid order a buyer can
  (a) inflate `vendor_payout_cents` on their items → platform pays a vendor/colluder from its Stripe balance
  at fulfill; (b) INSERT extra items (free goods, attacker-chosen payout) between session creation and
  payment or after. Only DB-level protection today: an `updated_at` trigger (mig 095:108). **Severity: HIGH
  (money).** Load-bearing: `checkout/session/route.ts:1112,1144` inserts orders + order_items with the USER
  client; buyer cancel/confirm/report-issue routes update via user client (inventory: ~60 write sites, client
  per site to be classified before any policy change). **Fix direction (additive-first, per
  feedback_load_bearing_bug_additive_first):** (1) BEFORE INSERT/UPDATE trigger on `order_items` (and
  money columns of `orders`) that RAISEs when `current_user <> 'service_role'` touches
  `vendor_payout_cents / subtotal_cents / platform_fee_cents / unit_price_cents / quantity / listing_id /
  vendor_profile_id / order_id / discount_cents` (status + pickup/ack columns stay writable so vendor and
  buyer routes keep working); (2) ⚠ checkout/session two inserts → `serviceClient` (protected file diff);
  (3) THEN drop `order_items_insert` for buyers and narrow `order_items_update`/`orders_update` with
  WITH CHECK column guards. Mig 248 (functions) and mig 249 (this) — owner decides; each differential.
- **Read-only anon-callable helpers (fine by design):** get_*_within_radius, get_listings_accepting_status,
  get_available_pickup_dates, get_listing_* , get_zip_*, get_vertical_config, can_*/is_*/has_role
  (auth.uid-based, empty for anon), build_pickup_snapshot, calculate_order_item_expiration.

## What this plan did NOT verify
- Live prod RLS/ACLs, Upstash/Supabase/Vercel plan tiers (owner-side).
- Advisory applicability statements come from agent-fetched advisory pages (URLs in R4's transcript);
  the local facts (versions, peers, 0 `'use server'`, no `rewrites()`) were verified by Claude.
- Whether `ws` (supabase realtime) is ever opened server-side.
- `observed()` type compatibility with `.rpc()` builders (check at item 7 build time).
- Exact Upstash command cost after item 1 (2 checks per authenticated request).

---

## Items

### 1. E6 — Rate limits keyed by IP only (🔴 traffic) — R1 inventory VERIFIED (Claude spot-read)
**Inventory (R1, scripted, 351 calls = grep count):** 315 before-auth · 36 public no-auth · **0
after-auth · 0 using `compositeKey` or any user id** (`compositeKey` has 0 route callers — my earlier
"used once" was the helper's own definition). By class: vendor 109, admin 86, buyer 61, market-manager
45, token-bearer 33, public 17. Crons/webhooks: 0 (secret/signature-gated). So there is NO one-line
re-key anywhere; every authenticated route currently limits BEFORE it knows who the user is.
**Two tests pin the current shape (read this session):**
- `api-route-guards.test.ts:206-238` — with an UNAUTHENTICATED mock user and a failing limiter mock,
  `checkout/session` POST, `buyer/orders/[id]/cancel` POST and `cart` GET must return **429, not 401**.
  → the IP check must stay FIRST (before auth). Moving it after auth would fail these = decision point.
- `money-authorization.test.ts:100-105` mocks `@/lib/rate-limit` with only `checkRateLimit`,
  `getClientIp`, `rateLimitResponse`, `rateLimits` and drives the real `fulfill` and `buyer/confirm`
  handlers. → those two routes cannot call `compositeKey` or any NEW export, or the test throws =
  decision point.
**Design that satisfies both tests with ZERO test changes — two-tier, inline keys:**
- Tier 1 (unchanged position, loosened numbers): keep the existing pre-auth `checkRateLimit(`x:${clientIp}`,
  …)` call but give authenticated routes a per-IP ceiling sized for a shared NAT (e.g. checkout 5→60/min,
  fulfill/confirm 30→300/min, `api` 60→600/min). Floods are still stopped; a market's Wi-Fi is not.
- Tier 2 (new, after `auth.getUser()` succeeds): a second `checkRateLimit(`x:u:${user.id}`, <today's
  preset>)` using ONLY the existing exports. Per-user numbers = today's numbers, so a single abusive
  account is capped exactly as before. Two Upstash commands per authenticated request instead of one
  → factor into item 4's quota check.
- Anonymous/public/token-bearer routes: unchanged (IP is all there is); optionally add
  `getRequestFingerprint` to split NAT users on the 17 public routes.
- Presets: add `rateLimits.ipShared` (loose) alongside the existing ones — additive, both test mocks
  spread `rateLimits` as an object so a new key is harmless in api-route-guards (which lists keys
  explicitly — a new preset NAME would be undefined there → routes must not read a preset the mock
  lacks; use inline `{limit, windowSeconds}` objects on the 9 routes that test imports, or add the
  preset to that mock = test change = decision point). Simplest: inline configs on the money routes.
**Rollout order (money routes first, ~20 files):** checkout/session ⚠, checkout/external ⚠, cart/items ⚠,
cart/items/[id] ⚠, cart/validate ⚠, cart, buyer/orders/**, vendor/orders/[id]/{confirm,ready,fulfill ⚠,
reject ⚠,confirm-handoff,resolve-issue}, vendor/orders, market-manager bundles handoff/collect-ack,
vendor/checkins. Then the long tail mechanically.
**Tests to ADD (new files/cases only):** unit — tier-2 key includes the user id and tier-1 does not;
structural (money-structure style, self-policing allowlist) — every POST handler under
`api/{checkout,cart,vendor/orders,buyer/orders}` contains a `:u:${user.id}` limiter call after its
auth resolution, so a new route cannot regress to IP-only.
**Verify on staging:** two accounts in two browsers on one machine → 6 checkouts in a minute → no
429 across accounts; the same account's 6th → 429. Watch `/api/health` limiter mode (item 4).
**Effort:** presets XS · money-route sweep M (5 protected diffs) · long tail M.

### 2. C10 — Stored XSS via JSON-LD (🔴 security) — ⏳ awaiting R2 sink inventory
**Problem (verified):** `JSON.stringify(jsonLd)` inside `<script type="application/ld+json">` on
listing, market-box and vendor-profile pages, with vendor-supplied title/description/name
(`listing/[listingId]/page.tsx:215-242`, `market-box/[id]/page.tsx`, `vendor/[vendorId]/profile/page.tsx:460`,
`lib/marketing/json-ld.ts`). `JSON.stringify` leaves `<` intact → `</script>` breakout.
**Design:** ONE serializer `toJsonLdHtml(obj)` in `lib/marketing/json-ld.ts` =
`JSON.stringify(obj).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')`
(valid JSON escapes; Google parses fine). Every sink calls it; the raw `JSON.stringify(` +
`dangerouslySetInnerHTML` pairing becomes forbidden.
**Tests to ADD:** unit test: a title containing `</script><script>` serializes with no literal `<`;
guardrail test (grep-based, like `codebase-map-coverage`) that fails the commit on any
`dangerouslySetInnerHTML={{ __html: JSON.stringify(` in `src/`.
**Defense in depth:** item 9 (nonce CSP) makes the same class inert even if a new sink slips in.
**Sink inventory (R2, spot-verified by Claude):** 12 `dangerouslySetInnerHTML` script sinks in 10 files.
Vendor-supplied data reaches THREE: `listing/[listingId]/page.tsx:239-241` (title, description),
`market-box/[id]/page.tsx:122-127` (offering name/description, vendor name),
`vendor/[vendorId]/profile/page.tsx:480-483` (business/farm name, description, image URL, social
links). One admin-authored sink: `help/page.tsx:63-70` (knowledge_articles → FAQ JSON-LD; admin-only
writer, still route through the safe serializer). The other 8 are constants (branding, breadcrumbs,
SW registration). No `innerHTML=`/`eval`/`new Function` in `src/`.
**Files:** json-ld.ts + the 4 data-bearing sink pages (none protected); the 8 constant sinks can move
to the helper in the same sweep so the guardrail test has zero allowlist entries. **Effort:** S.

### 3. K1 — Next.js 16.1.6 advisories (🔴 → reclassified: production exposure is MEDIUM, upgrade anyway) — R4 VERIFIED
**Target: `next@16.3.4`** (latest, verified `npm view`). Smallest version clearing the six advisories I
listed = 16.2.3; clearing ALL 31 in npm's aggregate = 16.3.3. Per-advisory patch points (agent-fetched
advisory pages, URLs in R4 transcript): 16.1.7 (rewrites smuggling, image cache, postponed-resume,
Server-Actions CSRF, dev HMR) · 16.2.3 (Server Components DoS) · **16.2.6 GHSA-26hh — middleware bypass
via segment prefetch where "the fix did not apply to `middleware.ts` with Turbopack"** · 16.2.11 (SSRF in
rewrites) · 16.3.3 (AVIF RCE CVSS 9.5; Windows RCE CVSS 9.0).
**What actually applies here (verified locally where possible):**
- Rewrites smuggling / image-cache: advisory text says Vercel-hosted apps are not affected; `next.config.ts`
  has NO `rewrites()` (0 matches) and the one `NextResponse.rewrite` is same-origin (`middleware.ts:46`).
- Server Actions CSRF: 0 `'use server'` in `src/` (grep; presence-only evidence → High, not Confirmed).
- Postponed-resume: needs `experimental.ppr`/`cacheComponents` — `next.config.ts` has no `experimental` (0).
- **GHSA-26hh middleware bypass — APPLIES**: this app is `middleware.ts` + Turbopack, and that middleware
  is the session refresh + vertical allowlist. This is the real reason to ship.
- AVIF RCE: Vercel disabled AVIF platform-wide (agent-fetched Vercel changelog) → prod protected; the
  residual is LOCAL `next dev`/`next start` with bundled `sharp` 0.34.x (`next` optionalDependency
  `^0.34.4`, verified) and user-uploaded images from `*.supabase.co`.
- Windows RCE: Linux runtime on Vercel → prod unaffected; **the owner's Windows dev box running
  `next dev -p 3002` is the exposure** → upgrade locally first, before any further dev sessions.
**Compatibility (verified locally):** `@sentry/nextjs` 10.40 peer = `^16.0.0-0` → no Sentry bump
required; `eslint-config-next` and `@next/bundle-analyzer` have no `next` peer → bump for parity only;
React 19.2.3 satisfies. `middleware.ts` is deprecated-not-removed in 16.3 → **do NOT rename to
`proxy.ts` in this commit** (rename = edge→Node runtime change for every matched request; its own
approved change later). AVIF: `formats` config stays valid, falls through to WebP (already true on Vercel).
**Commit (its own, nothing else in it):**
```
cd apps/web && npm install next@16.3.4 @next/bundle-analyzer@16.3.4 eslint-config-next@16.3.4
npm audit --omit=dev   # expect next gone
```
Files changed: `package.json` (3 pins), `package-lock.json`. ⚠ NEVER run `npm audit fix --omit=dev`
for real — dry-run shows `remove 500` = it prunes devDependencies (Playwright, vitest, tailwind…).
**Verification:** pre-commit (lint/tsc/vitest) → pre-push (build + Playwright) → staging manual: bogus
first segment → 404 rewrite; login + reload `/dashboard` (session refresh); locale cookie sync; images
from supabase render (WebP); Sentry event arrives. Cross-domain 308 only testable on prod domains.
**Keep out:** `proxy.ts` rename; `turbopack.root` warning (two lockfiles: repo root `package.json` holds
only `exceljs` devDependency — cosmetic; fix by `turbopack: { root: __dirname }` or deleting the root
lockfile, owner call).

### 4. B2 — Upstash quota ceiling + silent degradation (🔴 if free tier)
**Owner action:** confirm prod's Upstash plan (Vercel/Upstash dashboard). Free = 10K cmds/day ≈ 5K
checks/day (`rate-limit.ts:5`); a launch day at 2 checks/request-pair will burn that by lunch.
**Code (S):** make the fallback VISIBLE — the catch at `rate-limit.ts:190-203` uses `console.error`
only. Route it through `logError` (throttled, `high`) so Protocol 8 sees "limiter degraded", and
expose `rateLimiter: 'redis' | 'memory'` in `/api/health` (`health/route.ts`) so it is checkable at
a glance on launch day. Optionally record a refusal-registry event (mig 222 pattern).
**Tests to ADD:** unit: Redis throw → result.success still computed AND logError called once.

### 5. H1/H2 — Browse page uncached whole-catalog fetch (🔴 traffic) — R3 memo VERIFIED by Claude
**What the suite pins (read, not assumed — `performance-baseline.test.ts:46-81`):** PERF-R1 asserts
(1) `Promise.all([… auth.getUser() … getLocale() …])`; (2) one `user_profiles` select containing
`buyer_tier` + `preferred_latitude`; (3)/(4) no `getServerLocation`; (5) **exactly 2** literal
`.rpc('get_listings_accepting_status'` call sites, guarded by `if (isAvailableNow` and
`if (paginatedListings.length > 0 && !isAvailableNow)`. It pins NOTHING about `revalidate`/`dynamic`,
`anonSupabase` vs `createClient`, the select shape, or total query count. → Any design that adds or
removes an availability-RPC call site trips PERF-R1 = owner decision point, never a to-do.
**Cost facts (verified):** anonymous no-cookie visitors pay 0 auth round-trips (auth-js short-circuits
with no session — `@supabase/auth-js/dist/main/GoTrueClient.js:1272-1273`) and 2 DB round-trips; the
catalog query has no `.limit()`/`.range()` (`browse/page.tsx:468-541`); the nested `market_schedules`
embed (`:505-511`) is **never read in the render path** (only occurrences in the file: `:71` interface,
`:505` select); the availability RPC is `LEFT JOIN LATERAL get_available_pickup_dates(lid)` per listing
(`migrations/20260905_245_*.sql:46-49`) — one plpgsql SRF invocation per listing.
**Constraint:** `unstable_cache` is available in installed Next 16.1.6 (`node_modules/next/cache.d.ts:1`)
and needs no config flag; `'use cache'` would need `cacheComponents`/`experimental.useCache` (not set) —
do NOT enable weeks before launch. A cached callback cannot call `cookies()`, so the cached fetch must
use `anonSupabase`; listing RLS is public-select for published rows. Behavior delta to disclose: the
nested `markets` embed under the anon key drops private-event markets a signed-in buyer is linked to →
"N pickup locations" on a card could differ for that buyer. Invalidation: vendor listing create/edit is
CLIENT-side (`vendor/listings/ListingForm.tsx:337-347`, `'use client'` + browser client) so there is no
server hook for `revalidateTag`; inventory decrement lives in two protected files. → TTL-only.
**Ranked options (R3, verified):**
1. **(e1) Trim the nested select** — drop `market_schedules` embed + unread `markets` columns
   (`address, city, state, vertical_id, cutoff_hours, timezone, active`); keep `id, name, market_type,
   latitude, longitude` (Haversine intact). S · location risk ~0 · PERF-R1 clean · ⚠ vaulted file.
2. **(d) Set-based rewrite of `get_listings_accepting_status` internals, signature unchanged** —
   one migration, ZERO app-code changes, helps all 5 call sites incl. cart/validate on the checkout
   path. M-L · location risk none · PERF-R1 clean. Precondition: a DB integration test proving
   byte-identical output vs the current function across a fixture matrix (FM traditional / FT park
   paid+free / event accepted / benched / blacked-out / cancelled / cutoff boundary) — written FIRST.
   ⚠ Mig 245 (2-arg signature) is applied Dev+Staging, NOT prod — confirm per env before composing.
3. **(a) `unstable_cache` the catalog fetch only**, key `(vertical, category, search)`, TTL 30-60 s,
   `anonSupabase` inside, all cookie/zip/radius/premium filtering AFTER as today. M · location risk
   low · PERF-R1 clean · ⚠ vaulted. Worst case of the TTL: a sold-out item lingers ≤ TTL and bounces
   at add-to-cart (cart/checkout still validate) — never an oversell.
4. **(e4) Cap the `?available=true` id array** (today unbounded — `page.tsx:765-767`). XS · changes
   results past the cap → owner approval.
5. **(b) Anonymous fast path** (no user, no cookie, no zip → cached page slice + cached availability).
   Biggest win, HIGHEST location risk (the exact Session 59 failure shape); only if 1-3 measurably
   fall short under load; must reuse the two existing RPC call sites or PERF-R1 `:77` fails.
   Precondition test: cookie present ⇒ fast path NOT taken; absent ⇒ taken.
— (c) single SQL RPC and (e2) streamed badges both trip PERF-R1 `:77` and duplicate `vendor-limits.ts`
   tier semantics into SQL → not before launch.
**Rule 2.1 gate:** every one of 1-3 needs a before/after measurement, and there is NO honest browse
baseline today (see item 17). Re-measure first.

### 17. NEW — Performance baseline is stale AND its staleness test fires on 2026-09-13 (⚠ decision point)
`PERFORMANCE_BASELINE.md:3` says `Last measured: 2026-07-14`; `performance-baseline.test.ts:346-362`
throws when that is > 60 days old → the whole suite (and every pre-commit) goes red on **2026-09-13**.
Its browse rows are also wrong (claims ISR + anonSupabase; code is `force-dynamic` + `createClient()`).
Per test-integrity Rule 3 this is NOT a to-do: the owner decides whether to (a) re-measure now
(bundle numbers already captured this session: 169 chunks / 6.1 MB / 555 KB; browse query structure
per item 5) and update the doc's date + browse rows, or (b) let it fire. Recommendation: (a), as a
docs-only commit BEFORE the fix work so item 5's before/after has a truthful baseline.

### 8. C5 — No schema validation layer (🟠) — R5 VERIFIED (spot-checked by Claude)
**Reality check:** 161 routes read a JSON body; 100 in the money/state dirs. The hand-rolled idiom in
`market-manager/**` and `admin/**` is disciplined (typeof + enum + `traced.validation`) — the gap is
that it is per-file and unenforced, plus a long tail of `.catch(() => ({}))` bodies that swallow
malformed JSON instead of 400ing. Adapter: `parseBody(request, schema)` → `ZodError` →
`traced.validation('ERR_VALIDATION_SCHEMA', firstIssue, { field })` (`errors/supabase-errors.ts:157-158`
signature). Existing `validate*` helpers (bundles, booth, park-spot, surveys, tax, event-readiness)
become `.refine()` layers, not replacements. Model schema: `event-requests/route.ts:27-192` (already
the most thoroughly validated body).
**Top of the ranked list (each protected one needs its own diff):** ⚠ checkout/session (`:70-79` bare
cast; tip/chipin silently CLAMPED at `:84,88,733` — no-silent-fallback rule says reject), ⚠
checkout/external (`vertical` unchecked → `orders.vertical_id`), ⚠ cart/items (`quantity` cast, `<1`
only), ⚠ cart/items/[id] (`!quantity || quantity < 1` — no type check, `:35`), ⚠ vendor/orders/[id]/
reject (`reason` only), buyer/orders/[id]/{cancel,cancel-bundle}, vendor/orders/[id]/resolve-issue
(`notes` → DB text + clawback ledger), admin/vendors/[id]/fee-override, admin/events/[id]/
{fee-payments,payments} (`amount_cents` positive but **no upper bound**, `:107-109`), subscriptions/
checkout, vendor/fees/pay, market-manager bundles POST/PATCH (`marginCents` cast at `:89`),
vendor/market-boxes POST/PATCH, events/[token]/select, admin/markets/[id] PUT.
**Concrete gap found (fix regardless of zod):** `vendor/market-boxes/[id]` PATCH copies
`price_4week_cents`/`price_8week_cents` straight into the update (`:285-295`) with NO ≥ $1.00 floor,
while POST enforces it (`market-boxes/route.ts:248-256`). A vendor can PATCH their box to $0 or
negative; Stripe would reject at checkout, buyers see a broken product. S fix, not protected.
**Also:** `checkout/success` is GET-only and `vendor/orders/[id]/fulfill` reads no body — no schema
needed there. `buyer/orders/[id]/cancel-bundle:49` and ~25 market-manager PATCH routes swallow bad
JSON via `.catch(() => ({}))` → replace with the adapter so malformed bodies 400.
**Effort:** adapter S; top-20 sweep M (5 protected diffs inside it).

### 18. NEW — `change-discipline.md` protected-files table lists a route that does not exist
`src/app/api/vendor/payouts/route.ts` is in the Rule 3 table (`change-discipline.md:149`) but
`src/app/api/vendor/payouts` does not exist on disk (`ls` this session). Payout initiation lives in
the fulfill route + `lib/stripe/payments.ts` + `lib/stripe/payout-reconcile.ts`. Rules-file fix:
replace the row with `src/lib/stripe/payout-reconcile.ts` (Phase-5 retry verification, H-9) and
`src/lib/bundles/margin-payout.ts` (bundle margin transfer) — both move money and are unprotected
today. Owner authorizes rules edits.

### 6. C8 — `buyer/slot-availability` has no rate limit (🟠) — READY
**Change:** add the standard 3-line `checkRateLimit(\`slot-availability:${clientIp}\`, rateLimits.api)`
block (this route is anonymous, so IP keying is right — with item 1's loose anonymous tier).
`slot-availability/route.ts:211-221`. Not protected. **Effort:** XS. **Test to ADD:** none beyond the
structural coverage test in item 1 if it includes `api/buyer/**`.

### 7. G4 — Server pages log query failures to console only (🟡 stability) — READY
**Verified:** 25 of 149 `page.tsx` files use `console.error` on query errors; **0** use `observed()`.
Top: browse (9 sites), admin/feedback (8), vendor/orders (7), vendor/pickup (5), checkout (4).
**Design:** wrap the page-level Supabase calls in `observed(query, { table, route: '/[vertical]/browse' })`
(the helper already accepts an explicit `route` for non-API contexts — `observe.ts:38-40`). Behavior
unchanged (data stays null on failure); the error now lands in `error_logs` + Sentry-visible
console. Do browse + vendor/pickup + vendor/orders + checkout first (the launch-day pages).
⚠ browse is vaulted: `git diff vault` first; wrapping a call does not change query count/shape, so
PERF-R assertions should be unaffected — CONFIRM by reading the test before building (R3 reports it).
**Effort:** S per page. **Test to ADD:** none needed (observed() already unit-tested); optional grep
guard "no bare `console.error(` on a supabase error in page.tsx".

### 8. C5 — No schema validation layer (🟠) — ⏳ awaiting R5 top-20 list
Adapter shape: `parseBody(request, schema)` → `traced.validation('ERR_VALIDATION_SCHEMA', firstIssue)`.
Apply to R5's ranked list; protected routes each need diff approval.

### 9. A2 — CSP `script-src 'unsafe-inline'` (🟡, defense in depth for #2) — ⏳ awaiting R2
Nonce for `script-src` only (styles stay `unsafe-inline`; the app has many inline `<style>` blocks).
Middleware mints the nonce, sets the CSP header per request, Next applies it to its own scripts
via the `x-nonce` request header (R2 to confirm for 16.x); the JSON-LD `<script>` tags and the SW
registration script get `nonce={…}`. Stripe/Cloudflare hosts stay allow-listed.
**Mechanism (verified in installed Next 16.1.6):** Next extracts the nonce from the REQUEST's
`Content-Security-Policy` header — `node_modules/next/dist/server/app-render/get-script-nonce-from-header.js:13-45`,
called at `app-render.js:151` — and threads it into every framework-generated script (hydration,
RSC payload). So the CSP header must move from the static `next.config.ts` `headers()` block
(`next.config.ts:41-57, 72-80`) into `src/middleware.ts` set per request on BOTH the forwarded
request headers and the response. Today middleware sets no CSP and no nonce (`middleware.ts:1-81`).
**Only `script-src` and `style-src` carry `unsafe-inline`** (`next.config.ts:45-46`); style stays.
**Manual `nonce=` attributes needed on:** the 12 script sinks from item 2 (same 10 files). NOT
needed: `SentryInit` (dynamic import, `components/layout/SentryInit.tsx`), `WebVitals` (hook +
sendBeacon), Turnstile (`components/auth/Turnstile.tsx:97-111` appends a `src=` script — governed by
the `challenges.cloudflare.com` host entry, which coexists with a nonce as long as
`'strict-dynamic'` is NOT added). `js.stripe.com` has no load site in `src/` (hosted Checkout
redirect) — likely vestigial; leave it, harmless.
**Risk:** any inline script without the nonce silently stops running — the 12-sink list is the
checklist; verify on staging with the browser console open. **Effort:** M. **Sequencing:** after
item 2 (so the same 10 files are touched once).

### 16. NEW — Email HTML builders interpolate vendor/organizer text unescaped (🟠 medium) — READY
Found by R2, verified by Claude. Not browser XSS (mail clients don't run script) but HTML injection
into platform-branded email: a vendor named `<a href=…>Click to claim refund</a>` renders as a live
link in an organizer's inbox. Three sites, each next to a file that already has an escaper:
- `cron/expire-orders/route.ts:2499-2521` — event-results email: `v.name` (vendor business name),
  `event.contact_name`, `event.city/state` raw; the same file defines `esc()` at `:1777`.
- `vendor/events/[marketId]/message/route.ts:126-132` — `vendorName` raw in subject AND body,
  `cReq.contact_name` raw; only the message body is escaped (`:135`).
- `events/[token]/select/route.ts:717-753` — organizer confirmation: `event.contact_name`,
  `event.event_date`, `cuisineList` (vendor listing categories) raw; file has no escaper.
Also `expire-orders/route.ts:3415` uses a partial escaper (`<`/`>` only) for `companyName`.
**Design:** ONE shared `escapeHtml()` in `lib/notifications/email-config.ts` (or a new
`lib/email/escape.ts`); replace the 6 local copies (`vendor-leads:169`, `event-requests:636`,
`support:167`, `market-manager/intake:343`, `surveys/email.ts:31`, `notifications/service.ts:220`)
and wrap the raw sites above. Subjects: strip `\r\n` too (header injection hygiene).
**Tests to ADD:** unit test on the shared escaper; a grep-guard that no `resend.emails.send({`
template in `src/app/api` interpolates `contact_name|business_name|farm_name|vendorName` without
`escapeHtml(`. **Effort:** S. None protected.
**Low, separate:** `vendor/dashboard/PromoteCard.tsx:45-52` `document.write` puts the vendor's own
name unescaped in a print window `<title>` — self-XSS only (the vendor attacks their own browser);
fix with `escapeHtml` when touching the file. `components/vendor/QRCodeCard.tsx` has the same code
and **no importers** (dead — candidate for deletion, owner call).

### 10. D2 — Verify live RLS + anon ACLs on PROD before the migration paste (🟡) — READY (owner runs)
Catalog-only queries (no public-schema table columns — schema gate not triggered):
```sql
-- tables in public WITHOUT row security
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity ORDER BY 1;
-- functions the anon role may EXECUTE (should be the read-only helper set only)
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE') ORDER BY 1;
-- table privileges granted to anon
SELECT table_name, privilege_type FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public' ORDER BY 1,2;
```
Expected: first query → 0 rows; second → the 7 helpers listed in review D2 (+ views); third → SELECT
on public views/tables only, no INSERT/UPDATE/DELETE. Anything else = stop and investigate.

### 11. K2 — Transitive dependency highs (🟡) — R4 dry-run read; no major bumps implied
All targets satisfy the existing caret ranges, so `package.json` would not change — pin explicitly
anyway so a fresh `npm ci` cannot resolve backwards: `@sentry/nextjs@10.74.0` (clears the
OpenTelemetry chain), `resend@6.27.0` (drops `mailparser`/`nodemailer` for `postal-mime` — removes the
nodemailer/linkify-it highs entirely), `svix@1.99.1` (uuid). `sharp` + `postcss` ride along with #3.
`ws` (via supabase realtime-js) and `axios`/`form-data` (via twilio) are NOT cleared by these — they
wait on upstream supabase-js / twilio releases; UNVERIFIED whether realtime is ever opened server-side
(if not, `ws` is dormant). Own commit AFTER #3; same verification chain; smoke: send one auth email
(resend path), one SMS if Twilio is live, one Sentry event. Residual count after install: UNVERIFIED
until re-run.

### 12. F3 — 3,400-line daily cron monolith (🟡 ops) — DEFER
Not a launch blocker (budget guard + per-phase no-ops verified). Post-launch: split by phase group
into separate cron routes with their own `maxDuration`, same `CRON_SECRET` pattern.

### 13. E5 — Session route trusts request `marketId` for items absent from the DB cart (🟡 low-med)
**Verified:** the real client never sends `marketId` (`checkout/page.tsx:567-580` sends listingId,
quantity, scheduleId, pickupDate only); the server overlays the DB cart (`session/route.ts:460-517`).
Only a direct API caller reaches the placeholder path. **Design (S):** in the "items passed in
request" loop (`:497-517`), require the (listing, schedule, date) key to exist in `cartItemPickupMap`
OR verify `listing_markets` membership before accepting `item.marketId`; otherwise
`traced.validation('ERR_CHECKOUT_001', …)`. ⚠ Protected file — diff approval at build time.
**Test to ADD:** money-authorization style: a body with a foreign `marketId` for a listing not sold
there is rejected.

### 14. C9 — Legacy weak event tokens (⏳ owner query) — READY (owner runs; snapshot read this turn)
New tokens are strong (`event-actions.ts:99-117`); tokens issued before that change used a 6-char
timestamp suffix and were kept valid. Find any still-live ones on PROD
(`catering_requests`: `event_token`, `status`, `event_date`, `market_id` — snapshot `SCHEMA_SNAPSHOT.md:559-600`):
```sql
SELECT id, status, event_date, event_token
FROM catering_requests
WHERE event_token IS NOT NULL
  AND status IN ('approved','ready','active')
  AND length(split_part(event_token, '-', array_length(string_to_array(event_token,'-'),1))) < 18
ORDER BY event_date;
```
If rows exist for future events: rotate the token (admin action + re-send the organizer link) or
let them age out; decide per event. Expected on a fresh prod: 0 rows.

### 15. F4 — Cause remittance sweep — RESOLVED, no change
`lib/cause/remit.ts` is deduct-first (ledger −balance before transfer), Stripe idempotency key =
`cause-remit-${remittance.id}` (deterministic), failure writes a compensating +balance row. The
documented crash window (between deduct and transfer) leaves a `pending` remittance with null
`stripe_transfer_id` — under-pay, never double-pay; manual reconciliation query in the file header
(`remit.ts:16-36, 66-105`). Accept for v1 as documented; the atomic-claim RPC (mig 197 pattern)
is the post-launch hardening.
