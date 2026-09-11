# Launch Readiness Code Review — 2026-09-10

**Purpose:** Fresh, code-read sweep of the app before the prod push + live launch. Scored on
SECURITY / STABILITY / TRAFFIC-SPIKE READINESS / EFFICIENCY. Prior audit files were NOT used as
sources of truth (owner instruction) — every finding below was read from the code in this
session and carries a `path:line` citation or an UNVERIFIED label.

**Method:** Incremental Research Protocol. Each area below is a recovery point: findings are
written the moment they are verified, before moving to the next area. Agents (if used) only
locate; Claude reads and cites.

**Scoring key (per area, 1–10):** 9–10 launch-grade · 7–8 solid, minor gaps · 5–6 workable but
a known weak point · ≤4 likely failure point, fix before launch.

**Scope at scan (2026-09-10):** 302 API routes · 149 pages · 226 lib files · 228 components ·
90 test files · ~262K LOC · 220 applied migrations · 7 Vercel crons (`vercel.json`).
Git: main `6fdf6760` (tax batch 2, dark) · staging `d34eae7f` · prod `e946c2c0` (~82 behind).

---

## Checklist (✅ = findings written below)

- [x] A. Edge & platform layer — middleware, headers/CSP, next.config, Sentry, env handling
- [x] B. Rate limiting & abuse controls — coverage across routes, Upstash dependency
- [x] C. Auth & authorization — admin gates, service-client discipline, vertical scoping
- [x] D. Database security — RLS coverage, SECURITY DEFINER, anon-executable RPCs (migration text; live DB unverified)
- [x] E. Money paths — checkout/session, cart, webhook checkout handler (read-only review)
- [x] F. Crons & background work — auth, budgets, idempotency, staging-preview caveat
- [x] G. Error handling & observability — withErrorTracing coverage, dropped PostgREST errors
- [x] H. Traffic-spike readiness — per-request auth cost, hot-path query counts, caching, external quotas
- [x] I. Efficiency — bundle (build run this session), comms cost, hot path
- [x] J. Tests & guardrails — suite run: 90 files / 2207 pass
- [x] K. Dependencies & build — npm audit run: 1 critical (next), 16 high
- [x] Final scorecard + prioritized fix list

**Headline (owner-facing):** Security 7 · Stability 8 · Traffic-spike readiness 4 · Efficiency 6. Money paths are strong. The launch-day risk is traffic: uncached browse page, IP-keyed rate limits (shared NAT at a market), Upstash quota, plus a critical Next.js advisory. One real security defect: stored XSS via JSON-LD (trivial fix). Details + fix list at the bottom of this file.

---

## Findings

(sections appended as each area completes)

### A. Edge & platform layer — ✅ read 2026-09-10

**Read:** `src/middleware.ts` (whole), `src/lib/supabase/middleware.ts` (whole), `next.config.ts` (whole), `src/lib/supabase/server.ts` (whole), `src/lib/supabase/anon.ts`.

| # | Finding | Severity | Evidence |
|---|---|---|---|
| A1 | Security headers are complete and sane: nosniff, X-Frame DENY, HSTS 1y+subdomains, Referrer-Policy, Permissions-Policy, CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. | ✅ good | `next.config.ts:9-58` |
| A2 | CSP `script-src` includes `'unsafe-inline'` → the CSP does NOT stop injected inline scripts; XSS protection rests entirely on React escaping. Nonce/hash-based CSP would close it but needs a rewrite of every inline `<style>`/`<script>` block. | 🟡 medium (accept for launch, backlog) | `next.config.ts:41` |
| A3 | Middleware runs on every non-static request and calls `supabase.auth.getUser()` each time (session refresh). For a signed-in user this is a network round-trip to Supabase Auth per page/API hit. Anonymous requests (no auth cookie) short-circuit inside the SDK — UNVERIFIED (SDK-internal). Traffic implication: the auth service is on the hot path for every logged-in request. | 🟡 medium (traffic) | `src/lib/supabase/middleware.ts:33` · matcher `src/middleware.ts:70` |
| A4 | Vertical allowlist rewrites unknown first segments to `/not-found` (C-5) and enforces canonical domain per vertical with 308. Sensitive paths get `Cache-Control: no-store`. | ✅ good | `src/middleware.ts:42-49` |
| A5 | `createServiceClient()` is a bare factory (no auth check). A guarded variant `createVerifiedServiceClient()` exists but the bare one is what 206/302 routes import (see C). Discipline is per-route, not structural. | 🟠 see C | `src/lib/supabase/server.ts:33-44` |
| A6 | Sentry is wired via `withSentryConfig`, auto-disabled without DSN; 5xx-only capture in the tracing wrapper. | ✅ good | `next.config.ts:76-82`, `src/lib/errors/with-error-tracing.ts:81-86` |
| A7 | `images.remotePatterns` restricted to Supabase public storage; AVIF/WebP enabled. | ✅ good | `next.config.ts:61-70` |

### B. Rate limiting & abuse controls — ✅ read 2026-09-10

**Read:** `src/lib/rate-limit.ts` (whole). Coverage counted by grep over all 302 `route.ts` files (presence only).

| # | Finding | Severity | Evidence |
|---|---|---|---|
| B1 | Limiter = Upstash sliding window, shared across instances; falls back to per-instance in-memory on Redis error (weakened, not open; logged). | ✅ good design | `rate-limit.ts:174-205` |
| B2 | **Upstash quota is a spike ceiling.** File header: "free tier: 10K commands/day; each check = 2 commands" → ~5K checks/day. Once exhausted, every check errors → fallback to per-instance memory → effective limit = instances × limit. On a launch-day spike this is exactly when it degrades. UNVERIFIED which Upstash plan prod uses — owner must confirm. | 🔴 high (traffic) if free tier | `rate-limit.ts:5` |
| B3 | 280/302 routes call `checkRateLimit`. Of the 22 without: 7 crons (secret-gated, fine), 2 webhooks (Stripe signature-gated; Resend — check), health/manifest/locale/icon (fine). **Unprotected and worth a look:** `auth/send-email`, `buyer/chipin`, `buyer/slot-availability`, `market-manager/[marketId]/attendance`, `vendor/markets/[id]/seasons`, `vendor/orders/[id]/confirm-cash-complete`, `vendor/week-schedule`, `admin/moderation-test`. | 🟠 medium — see B4/B5 | grep count this session |
| B4 | `auth/send-email` has no rate limit → (to verify in C) potential email-bombing / Resend-cost vector. | ⏳ verify in C | — |
| B5 | Burst + endpoint-scan detection are in-memory and informational only (never block). | ℹ️ | `rate-limit.ts:128-165` |
| B6 | IP extraction trusts `x-forwarded-for` first value. On Vercel that header is set by the platform, so spoofing is not possible from the client. Fine on Vercel; would be a problem elsewhere. | ✅ ok on Vercel | `rate-limit.ts:212-223` |

### G. Error handling & observability — ✅ (partial; coverage) read 2026-09-10

| # | Finding | Severity | Evidence |
|---|---|---|---|
| G1 | 294/302 routes wrapped in `withErrorTracing` (logs to `error_logs`, Sentry on 5xx, standardized JSON). The 8 unwrapped: `admin/moderation-test`, `apple-touch-icon`, `auth/callback`, `health`, `locale`, `manifest`, `vendor/orders/[id]/confirm-cash-complete`, `vendor/week-schedule`. `confirm-cash-complete` is an order-status mutation without tracing — see E. | 🟠 medium (2 routes) | grep this session; `with-error-tracing.ts:40-107` |
| G2 | `observed()` wrapper exists to surface dropped PostgREST errors; schema-class codes forced to `high` severity. Header notes ~830 unwrapped `const { data } = await …` sites as of 2026-08-29 — the sweep is incremental, not complete. Residual risk: silent failures in un-swept routes. | 🟡 medium (stability) | `src/lib/errors/observe.ts:3-25` |
| G3 | Refusal telemetry (mig 222) records rule-firings independently of the 90-day error_logs prune. | ✅ good | `with-error-tracing.ts:62-77` |
| G4 | Server PAGES (not routes) log Supabase errors with `console.error` only — e.g. the browse page's listings/zip/RPC failures never reach `error_logs`. A degraded browse page under load would be invisible to Protocol 8. | 🟡 medium | `browse/page.tsx:530-538, 585-587, 668-669, 768-770` |

### C. Auth & authorization — ✅ read 2026-09-10

**Read (whole files):** `lib/auth/admin.ts`, `lib/supabase/server.ts`, `api/auth/callback`, `api/auth/send-email`, `api/admin/login`, and all 18 routes that use the service client without a visible auth helper (bundles/[bundleId], buyer/slot-availability, buyer-interests, event-approved-vendors, markets/nearby, markets/[id]/optin-public, trucks/where-today, vendor-leads, vendors/nearby [first 90 lines only], events/[token]/{select,validate-capacity,validate-order-cap,verify-code,waves}, orders/reconfirm/[token], webhooks/resend).

| # | Finding | Severity | Evidence |
|---|---|---|---|
| C1 | Admin gating is consistent: `requireAdmin` (pages), `verifyAdminForApi` / `verifyAdminScope` (routes); `hasPlatformAdminRole` is strict (S4-2 fix); optional MFA behind `REQUIRE_ADMIN_MFA`. | ✅ | `lib/auth/admin.ts:18-73, 155-163, 191-270` |
| C2 | All 18 "no visible auth" service-client routes are public-by-design and field-scoped (lead capture, nearby search, token-bearer event/reconfirm flows, public bundle detail). No real auth gap found. | ✅ | e.g. `slot-availability/route.ts:203-206`, `reconfirm/[token]/route.ts:1101-1110` |
| C3 | `auth/send-email` is a Supabase hook verified by `standardwebhooks` signature (closes B4); `webhooks/resend` verifies Svix. | ✅ | `send-email/route.ts:138-158`; `webhooks/resend/route.ts:48-60` |
| C4 | `auth/callback` rejects absolute / protocol-relative `next` values (open-redirect guard). | ✅ | `auth/callback/route.ts:20-24` |
| C5 | **Input validation is ad hoc.** `zod` is a dependency but 0/302 routes import it; `lib/validation.ts` is imported by 1 route; 159 routes call `request.json()` with no shared validator. Bodies are type-cast and checked field-by-field. Correctness depends on each route's diligence. | 🟠 medium | counts this session; `checkout/session/route.ts:70-79` |
| C6 | `events/[token]/select` POST moves money (auto-refunds deselected fee-payers) with the event token as the ONLY credential. Documented design. Token generation: see C9. | 🟡 | `select/route.ts:297-546` |
| C7 | `verify-code` compares the access code with `===` (not timing-safe) but is limited to 5/min/IP. Acceptable. | ℹ️ | `verify-code/route.ts:1001-1026` |
| C8 | `buyer/slot-availability` is public, unauthenticated, **no rate limit**, 3 service-role queries per call. Cheap amplification target. | 🟠 medium | `slot-availability/route.ts:211-266` |
| C9 | `event_token` = slug + 18 url-safe chars from 15 random bytes (~108 bits) via `randomBytes`. Strong for NEW events; the comment records that tokens issued before this change used a timestamp-derived 6-char suffix and remain valid (additive change). Any still-live legacy event is weaker — UNVERIFIED whether any exist in prod. | ✅ new / ⏳ legacy | `lib/events/event-actions.ts:99-117` |
| C10 | **Stored XSS via JSON-LD.** Listing title/description, market-box name/description, and vendor profile name/description (all vendor-supplied) are embedded with plain `JSON.stringify` inside `<script type="application/ld+json">`. `JSON.stringify` does not escape `<`, so a description containing `</script><script>…` breaks out and executes for every buyer viewing the page. The code comment says "no user input" — that is wrong. CSP does not backstop this (A2, `unsafe-inline`). Requires an approved vendor (semi-trusted) but is a one-line fix (`.replace(/</g,'\\u003c')`). Profanity filter (`content-moderation.ts`) does not cover this. | 🔴 high (security) | `listing/[listingId]/page.tsx:215-242`; `market-box/[id]/page.tsx:~110-130`; `vendor/[vendorId]/profile/page.tsx:460`; `lib/marketing/json-ld.ts:68-110` |

### D. Database security — ✅ (migration-text level) read 2026-09-10

⚠ What the migrations SAY. Live prod policies are UNVERIFIED (owner rule: query the live env before any deploy decision).

| # | Finding | Severity | Evidence |
|---|---|---|---|
| D1 | RLS enabled on **92/92** tables created by migrations (a first regex missed 3 `cause_*` tables due to column-aligned whitespace; confirmed at `213:139-141`). | ✅ | `20260731_213_community_chip_in.sql:139-141` |
| D2 | 250 `SECURITY DEFINER` functions; 63 `REVOKE … FROM anon/public`. Live anon grants (deduped): SELECT on views `market_vendor_counts`, `active_markets`; EXECUTE on `get_listings_within_radius`, `get_listings_accepting_status`, `is_event_market`, `is_private_event_market`, `user_vendor_market_ids`. All read-only helpers. The 20+ commented-out `GRANT … TO anon` lines are the mig-149/152 lock-down record. Re-enumerate from live `pg_proc` ACLs before launch. | ✅ / verify live | grep this session |
| D3 | Service-role key used in 206 routes via `createServiceClient()` and directly in 6 (3 admin, 3 crons). No client component references it. | ✅ | grep this session |
| D4 | `orders.order_number` has a UNIQUE index — a `Math.random()` collision surfaces as an insert error (500, logged), never a silent duplicate. | ✅ | `20260321_095_prod_sync_triggers_indexes_policies.sql:371-372` |

### E. Money paths — ✅ read 2026-09-10 (checkout/session, cart/items, cart/validate whole; webhooks partial)

| # | Finding | Severity | Evidence |
|---|---|---|---|
| E1 | Ordering is safe: Stripe session FIRST → order + items insert → `atomic_decrement_inventory` (raises on shortfall) → failure unwinds only what was decremented and expires the session. Bundle slot claim mirrors it. | ✅ | `session/route.ts:1067-1103, 1112-1138, 1172-1223, 1231-1266` |
| E2 | Abandoned-session cleanup expires the Stripe session BEFORE cancelling (never cancels a possibly-paid order); guarded cancel prevents double-restore; session reuse only for tip-free listing carts. | ✅ | `:144-184, :215-278` |
| E3 | Prices, fees, discounts, tax come from DB + `pricing.ts`; client supplies ids/quantities/tip/chipin; tip and chipin capped and re-validated server-side. | ✅ | `:82-109, :727-764` |
| E4 | Cart-add validates quantity ≥ 1, listing↔vertical, listing↔market membership, schedule/date via RPC, FT time slot format. Integer-ness is enforced by the RPC's `integer` parameter. | ✅ | `cart/items/route.ts:74-76, 95-113, 129-148, 152-169, 179-185` |
| E5 | Session route accepts `marketId`/`scheduleId`/`pickupDate` from the request body for items NOT in the DB cart, with placeholder market name/type and no listing↔market check in this route. The normal client path goes through cart-add (validated); a direct API caller could record an arbitrary `order_items.market_id`. Payout math is unaffected. | 🟡 low-medium | `session/route.ts:497-517` |
| E6 | **Rate limits are keyed by IP on 331 of 335 call sites; only 4 include the user id; `compositeKey()` is used once.** Checkout is 5/min/IP; vendor fulfill/confirm 30/min/IP; cart/orders reads 60/min/IP. Shoppers and vendors at a physical market share one Wi-Fi NAT, and mobile carriers use CGNAT. Six buyers checking out in the same minute from one IP → 429s. Ten vendors in Pickup Mode on market Wi-Fi share one 30/min fulfill bucket. **This is the most concrete launch-day failure point found.** | 🔴 high (traffic) | `session/route.ts:60-66`; `rate-limit.ts:96-101`; grep counts this session |
| E7 | Webhook route: signature verified → 400 (no retry); handler failure → 500 (Stripe retries up to 72h); per-handler idempotency (`existingPayment` guard, "already paid — idempotent skip" in season/booth/park handlers). No global processed-event-id table; idempotency is per-handler by domain row state. | ✅ (design) | `webhooks/stripe/route.ts:20-49`; `lib/stripe/webhooks.ts:220-226, 1525, 1773, 1855` |
| E8 | `cart/validate` GET fails CLOSED on query error and records a refusal; paired-rule with cart/items enforced by test. | ✅ | `cart/validate/route.ts:73-86, 187-192` |

### H. Traffic-spike readiness — ✅ read 2026-09-10

| # | Finding | Severity | Evidence |
|---|---|---|---|
| H1 | **The browse page (main buyer funnel) is fully dynamic and uncached** (`force-dynamic`, required by the location cookie — Session 59 vault). Every request: `auth.getUser()` + (signed-in) `user_profiles` + **the entire published catalog for the vertical with nested vendor/market/schedule/image joins, no DB-level pagination** + optional `zip_codes` + optional PostGIS RPC (`page_size: 1000`) + `get_listings_accepting_status` RPC (page slice, or ALL listings when "available now" is on). `PERFORMANCE_BASELINE.md` still says browse is ISR — stale. | 🔴 high | `browse/page.tsx:26-28, 250-276, 462-536, 640-700, 760-804`; `PERFORMANCE_BASELINE.md` "Browse Page ISR" |
| H2 | `get_listings_accepting_status` is documented as the slowest operation (LATERAL per listing) and runs on every browse request under H1. | 🟠 | `browse/page.tsx:764, 792` |
| H3 | `/markets`, `/vendors`, `/help` are ISR (600/600/300 s); admin lists 60–120 s; `markets/nearby` and `events/[token]/waves` send `s-maxage`. Good coverage outside browse. | ✅ | grep this session |
| H4 | Middleware `auth.getUser()` on every request (A3). | 🟡 | `lib/supabase/middleware.ts:33` |
| H5 | Upstash quota ceiling (B2) degrades limiting exactly during a spike. | 🔴 if free tier | `rate-limit.ts:5` |
| H6 | IP-keyed limits + shared NAT (E6). | 🔴 | see E6 |
| H7 | Client polling is conservative (notifications 15/30 min; FT vendor orders 2/10 min; FM 60/180 min) with focus/navigation refetch. Not a spike amplifier. | ✅ | `lib/polling-config.ts:18-31` |
| H8 | `maxDuration` set on 18 money/cron routes (30–300 s); crons carry a soft budget and stop between phases. | ✅ | grep this session; `cron/expire-orders/route.ts:67-100` |
| H9 | Supabase compute tier / connection headroom and Vercel plan — UNVERIFIED (not in repo). Owner to confirm. | ⏳ | — |

### J. Tests & guardrails — ✅ run 2026-09-10

| # | Finding | Severity | Evidence |
|---|---|---|---|
| J1 | `npx vitest run`: **90 files / 2207 tests, all passing** (39.9 s). Suites include money-structure, pricing-conservation, money-authorization, flow-integrity, paired-rules coverage, codebase-map coverage, guardrail contracts, performance-baseline, db-constraints/order-lifecycle/subscription-lifecycle integration. | ✅ | run this session |
| J2 | Pre-commit = lint-staged + tsc + vitest; pre-push = build + Playwright; hooks also block history rewrites and out-of-window prod pushes. | ✅ | `rules/git-and-deployment.md` (process), hooks not re-read this session |
| J3 | Gaps the suite cannot see: rate-limit key composition (E6), page-level `console.error` sinks (G4), JSON-LD escaping (C10), dependency CVEs (K). None of these is a business rule, so no test pins them. | ℹ️ | — |

### F. Crons & background work — ✅ read 2026-09-10

**Read:** `cron/expire-orders/route.ts:1-120` (auth + budget), `cron/remit-cause-funds/route.ts` (whole), `vercel.json`. 7 crons: expire-orders (daily, 20+ phases), event-reconfirm (hourly), vendor-activity-scan (daily), vendor-quality-checks (daily), surveys (hourly), park-docs-review (hourly 12–02 UTC), remit-cause-funds (weekly Mon).

| # | Finding | Severity | Evidence |
|---|---|---|---|
| F1 | Every cron checks `CRON_SECRET` with a timing-safe compare; `expire-orders` additionally skips on non-production `VERCEL_ENV`. | ✅ | `expire-orders/route.ts:33-42, 72-89`; `remit-cause-funds/route.ts:17-30` |
| F2 | `expire-orders` has a 270 s soft budget checked between phases + `maxDuration = 300` so a hard kill cannot strand later phases mid-write. | ✅ | `expire-orders/route.ts:60-100` |
| F3 | `expire-orders` is a 20+-phase monolith (~3,400+ lines by the escape helpers at `:1777`, `:3415`). A failure in one phase's query shape affects the daily run for every later phase only via the budget guard. Operational risk, not a bug. | 🟡 | file size; `expire-orders/route.ts:1777, 3415` |
| F4 | `remit-cause-funds` (moves money via Stripe transfers) has no `maxDuration` and no non-production guard; delegates to `runCauseRemitSweep`. Vercel does not run crons on previews, so the guard is moot in practice. Sweep idempotency UNVERIFIED (lib not read). | 🟡 | `remit-cause-funds/route.ts:1-34` |
| F5 | Known caveat: staging previews never run crons — every cron path is untested on staging unless curled. | ℹ️ (process) | memory 2026-09-06; `expire-orders/route.ts:72-74` |

### K. Dependencies & build — ✅ run 2026-09-10

`npm audit --omit=dev`: **32 vulnerabilities (1 critical, 16 high, 14 moderate, 1 low)**. Stack versions: Next 16.1.6 (installed), React 19.2.3, stripe 20.1.2, supabase-js 2.89.0, @sentry/nextjs 10.40.

| # | Finding | Severity | Evidence |
|---|---|---|---|
| K1 | **`next` 16.1.6 carries a CRITICAL advisory set** (GHSA-ggv3-7p47-pfv8 HTTP request smuggling in rewrites; unbounded `next/image` disk cache; postponed-resume DoS; null-origin Server Actions CSRF bypass; Server Components DoS). Fix range: > 16.3.2. The app uses `NextResponse.rewrite` in middleware and `next/image`. On Vercel the platform mitigates some (image optimizer is Vercel's), but this is a direct dependency and the advisory list includes DoS classes relevant to a spike. Build also warns the `middleware` file convention is deprecated in favor of `proxy`. | 🔴 high — upgrade before launch | `npm audit` this session; `package.json:29`; `src/middleware.ts:46`; build log |
| K2 | Transitive highs with plausible runtime reach: `ws` 8.18.3 (via supabase realtime-js — memory-exhaustion DoS; realtime is UNVERIFIED as used server-side), `axios`/`form-data` (via twilio — SSRF/CRLF), `sharp` (via next — only if the local image optimizer runs; Vercel uses its own). `nodemailer`/`mailparser` via `resend` are inbound-parsing paths the app never calls. `serialize-javascript`, `postcss`, `rollup`, `minimatch`, `picomatch`, `brace-expansion`, `browserslist` are build-time. | 🟡 | `npm ls` this session |
| K3 | `npm audit fix` claims to cover all 32 — but a Next major-minor bump (16.1 → 16.3+) is NOT a "fix" run; it is a framework upgrade needing the full build + Playwright backstop. Do it as its own commit. | ℹ️ | — |

### I. Efficiency — ✅ 2026-09-10

| # | Finding | Severity | Evidence |
|---|---|---|---|
| I1 | Bundle (fresh `npm run build`, exit 0, this session): **169 chunks / 6.1 MB / largest 555 KB** (the Next framework chunk). vs 2026-07-14 baseline 160 / 5.9 MB / 541 KB — organic growth from two months of features (bundles, VIP, tax, events UX); under the 200-chunk ceiling. No single bad import evident. | ✅ | build log 2026-09-10 07:40 |
| I2 | Browse-page per-request cost (H1) is the dominant efficiency issue: whole-catalog fetch + JS-side filtering/pagination on every hit. The vault forbids removing the cookie path, but the cookie only affects the FILTER — the catalog fetch itself could be cached per (vertical, category, search) and filtered after. That is a design option for the owner, not a recommendation to change vaulted code. | 🟠 | `browse/page.tsx:462-536, 787` |
| I3 | Comms cost is designed in: in-app always; push preferred; SMS only as fallback when push is off; digest consolidation; polling is slow and off-peak-aware. | ✅ | `lib/polling-config.ts`; `notifications/service.ts` (not re-read) |
| I4 | Sentry traces sampled at 10 % server/edge — low overhead, adequate for launch diagnostics. | ✅ | `sentry.server.config.ts:5`, `sentry.edge.config.ts:5` |
| I5 | `vendors/nearby` (589 lines) and `markets/nearby` do PostGIS RPC → JS visibility filter → JS pagination, with `s-maxage=300` on markets. Fine at launch scale. | ✅ | `markets/nearby/route.ts:549-605` |

---

## Scorecard (1–10)

| Dimension | Score | One-line basis |
|---|---|---|
| **Security** | **7** | Strong foundation (headers, RLS 92/92, admin scoping, signed webhooks, service-key discipline, strong tokens). Pulled down by C10 (stored XSS via JSON-LD, trivial fix), K1 (critical Next advisory), A2 (`unsafe-inline` CSP = no XSS backstop), C5 (no schema validation layer). |
| **Stability** | **8** | Money paths are the best-engineered part of the app: Stripe-first ordering, guarded unwinds, idempotent webhooks, dead-order auto-refund, 2207 green tests incl. money-authorization/conservation/structure suites. Residual: ~800 un-`observed()` query sites, page-level console-only error sinks (G4), monolithic daily cron (F3). |
| **Traffic-spike readiness** | **4** | Three independent failure points that all fire on a busy launch day: (1) browse page is uncached and fetches the whole catalog per request (H1/H2); (2) rate limits are keyed by IP so a market's Wi-Fi or a carrier NAT shares one bucket — checkout 5/min (E6); (3) Upstash quota exhaustion degrades limiting exactly then (B2, plan UNVERIFIED). Plus Next 16.1.6 DoS advisories (K1). None is hard to fix; all are unfixed today. |
| **Efficiency** | **6** | Good discipline elsewhere (ISR on markets/vendors/help, batched RPCs, conservative polling, comms cost control) but the highest-traffic page does the most work per request. Bundle within recorded ceilings (pending this session's build numbers). |

## Prioritized fix list (owner decides; nothing here is built)

**Before prod push / launch (each is small):**
1. **E6 — key rate limits by user id where a session exists** (checkout, cart, orders, vendor fulfill/confirm). `compositeKey(ip, userId)` already exists. Keep IP-only for anonymous routes. ~1-line change per route; protected files need per-file approval (checkout/session, cart/items, cart/validate, fulfill, reject).
2. **C10 — escape `<` in every JSON-LD `JSON.stringify` sink** (5 pages + helper). One helper function; no protected files.
3. **K1 — upgrade `next` to ≥ 16.3.3** as its own commit with full build + Playwright; rename `middleware.ts` → `proxy.ts` only if the upgrade requires it (deprecation, not removal, in 16.x — UNVERIFIED for 16.3).
4. **B2 — confirm the Upstash plan for prod** (owner). If free tier, upgrade or accept per-instance degradation knowingly.
5. **H1 — decide the browse-page caching posture.** Options: (a) accept dynamic for launch and watch Supabase CPU; (b) cache the catalog fetch per (vertical, category, search) with a short TTL and keep cookie filtering after the fetch — touches a vaulted file, needs the vault diff + owner go.
6. **C8 — add `checkRateLimit` to `buyer/slot-availability`** (public, 3 queries/call).

**Soon after launch:**
7. G4 — route page-level Supabase errors through `observed()`/`logError` so a degraded browse page shows up in Protocol 8.
8. C5 — adopt `zod` (already installed) for the ~20 highest-risk POST bodies (checkout, cart, vendor order actions, event select).
9. A2 — move to nonce-based CSP (removes `unsafe-inline`); larger refactor.
10. D2 — re-enumerate live anon grants + `relrowsecurity` on prod before the migration paste batch (238→247).
11. K2 — `npm audit fix` for the transitive set after K1 lands; verify twilio/supabase still build.
12. F3 — consider splitting `expire-orders` by phase group (operational, not urgent).

## What was NOT verified (be explicit)
- Live prod RLS policies / anon ACLs (D) — migration text only.
- Upstash and Supabase plan tiers; Vercel plan (B2/H9).
- `runCauseRemitSweep` idempotency (F4); `vendors/nearby` beyond its first 90 lines; `checkout/success` beyond its guard lines; `webhooks.ts` beyond `handleCheckoutComplete`; `expire-orders` beyond its header.
- Whether Supabase realtime (`ws`) is instantiated server-side (K2).
- Playwright/e2e coverage content (not run).
