# 16 — Auth, RLS & Multi-Vertical Isolation

<!-- map-stamp: domain=auth-rls-verticals; verified=2026-07-18; commit=b9f82116 -->
<!-- map-claims
src/app/api/auth/**
src/lib/auth/**
src/lib/supabase/**
src/lib/vertical/**
src/lib/validation/**
src/lib/onboarding/**
src/components/auth/**
src/app/login/**
src/app/signup/**
src/app/[vertical]/login/**
src/app/[vertical]/signup/**
src/app/[vertical]/forgot-password/**
src/app/[vertical]/reset-password/**
src/app/[vertical]/confirm-email/**
src/app/admin/login/**
src/app/admin/mfa/**
-->

**Read this before your first route.** The two things new developers get wrong here are choosing the wrong Supabase client and forgetting the vertical filter. Both are silent failures.

---

## Read this first

1. `lib/supabase/server.ts` — the entire client-factory decision lives in one file.
2. `middleware.ts` — understand that it **refreshes sessions but does not authorize**.
3. `lib/auth/admin.ts` — every admin path flows through it; read `verifyAdminScope` carefully, and see [§ known defect](#known-defect--vertical-admins-receive-platform-scope).
4. `lib/auth/vertical-gate.ts` + `lib/validation/vertical.ts` — the isolation contract and its permissive fallbacks.

## The auth model

**Middleware does not authorize.** `middleware.ts:41` calls `updateSession`, whose entire auth job is `supabase.auth.getUser()` (`lib/supabase/middleware.ts:33`) to rotate the session cookie. There is no role check and no route protection in middleware. What it *does* enforce: cross-domain vertical redirects (`:31-39`), the vertical allowlist that rewrites unknown first segments to `/not-found` (`:44-47`), and `Cache-Control: no-store` on sensitive paths (`:49-51`).

**Authorization is therefore per-route and per-page** — explicit calls to `requireAdmin()`, `verifyAdminForApi()`, `enforceVerticalAccess()`, or an inline `supabase.auth.getUser()` — with Postgres RLS as the backstop.

## The four Supabase client factories

| Factory | File | Key | Reads cookies | Use when |
|---|---|---|---|---|
| `createClient()` (browser) | `lib/supabase/client.ts:3` | anon | via browser storage | Client components |
| `createClient()` (server) | `lib/supabase/server.ts:5` | anon | yes | **The default** for server components and API routes. Runs as the logged-in user, so RLS applies |
| `anonSupabase` | `lib/supabase/anon.ts:12` | anon | **no** | Public read-only data where you want ISR. Not touching `cookies()` is exactly what keeps a page cacheable (`anon.ts:5-10`) |
| `createServiceClient()` | `lib/supabase/server.ts:32` | **service role — bypasses RLS** | no | Admin/system operations only |

**The rule: never call `createServiceClient()` without verifying the caller first.** Two sanctioned patterns exist:

- `createVerifiedServiceClient()` (`server.ts:56-83`) — authenticates, checks admin, returns the service client or throws.
- `verifyAdminForApi()` then conditionally construct. The canonical example is `app/api/listings/route.ts:37`: `const supabase = isAdmin ? createServiceClient() : await createClient()`, with the check at `:28` and a security comment at `:24-25` warning that an `?admin=true` query param alone is insufficient.

## Multi-vertical isolation — application-level, not RLS-level

This is the single most important thing to understand about the data model's safety.

There are **189 occurrences of `.eq('vertical_id', …)`** in application code. The RLS policies that mention `vertical_id` are almost entirely *admin-scoping* policies of the form `is_admin_for_vertical(vertical_id)` — defined as `is_platform_admin() OR is_vertical_admin(p_vertical_id)`.

**So RLS narrows admins to their vertical, but it does not stop an ordinary authenticated read from crossing verticals.** The `.eq('vertical_id', vertical)` filter in the query does. Omitting that filter in a new route is a silent cross-vertical data leak with no test or policy to catch it.

The layers, in order:

1. **Domain routing** — `middleware.ts:18-39` maps `food_trucks` → foodtruckn.app, `farmers_market` → farmersmarketing.app.
2. **Route allowlist** — `middleware.ts:44-47` against `VALID_VERTICALS`.
3. **Page gate** — `enforceVerticalAccess()` (`lib/auth/vertical-gate.ts:19-67`). Note two permissive fallbacks: admins bypass entirely (`:36-38`), and **a user with an empty `verticals` array is allowed through** (`:60-62`).
4. **Query filter** — the manual `.eq('vertical_id', …)`. This is the real boundary.
5. **RLS** — admin scoping only.

> **`fire_works` is a third entry in `VALID_VERTICALS`** (`lib/validation/vertical.ts:6`) but has no terminology config registered (`lib/vertical/configs/index.ts:9-12`). Middleware will route `/fire_works/*`, and `resolveConfig` silently falls back to farmers-market copy (`lib/vertical/terminology.ts:17`) rather than 404ing. Pricing constants for it exist in `pricing.ts:51`. Treat it as a partially-scaffolded third vertical, not a live one.

## The role model

Roles live in `user_profiles`, split across **two columns that are both live**: a legacy `role` enum and a `roles` text array. Every check must consult both — that is the entire reason `lib/auth/roles.ts:23` exists (`profile.role === role || profile.roles?.includes(role)`).

`UserRole` (`roles.ts:9`) = `buyer | vendor | admin | platform_admin | regional_admin`.

Two things that surprise people:

- **Market manager is not a `UserRole`.** The manager surface is gated separately through `lib/markets/manager-auth.ts` (dual-key match on `manager_user_id` OR `manager_email`, requiring `manager_status='active'`) — see [12_Market_Manager.md](12_Market_Manager.md).
- **Vertical-admin assignments live in a separate `vertical_admins` table**, consulted at `admin.ts:209-213`.

**Admin MFA** is enforced in `requireAdmin` only when `REQUIRE_ADMIN_MFA === 'true'` (`admin.ts:60-75`) — **off by default**. aal1 → aal2 redirects to `/admin/mfa/verify`; no enrolled TOTP redirects to `/admin/mfa/setup`.

## Known defect — vertical admins receive platform scope

**Confirmed 2026-07-18 by direct read; not yet triaged.**

`hasPlatformAdminRole` (`lib/auth/admin.ts:134-140`) returns true for `role === 'admin'` as well as `platform_admin` — making it functionally identical to `hasAdminRole` directly above it. `verifyAdminScope` gates its "platform admins can access everything" short-circuit on that helper (`:192-201`), so **the `vertical_admins` membership check at `:204-214` is unreachable for anyone holding the `admin` role**, and a vertical admin who requests another vertical receives `authorized: true` with that vertical as `effectiveVerticalId`.

The code's own structure shows this was not the intent: the `isAdmin && requestedVerticalId` branch exists specifically to scope `admin` users, and the doc comment at `:100-102` states *"Vertical admins (regular 'admin' role) can only manage their specific vertical."* Compare `isPlatformAdminCheck()` (`:104-118`), which performs the strict check correctly.

**Blast radius:** the six routes that use `verifyAdminScope` (`error-logs`, `event-ratings`, `feedback`, `quality-checks`, `reports`, `stripe-reconcile`) — which are the *money and PII* routes it was introduced to protect. Exposure is zero if every current admin is intended to be platform-wide. See [19_Admin.md](19_Admin.md).

## Files

| File | Purpose |
|---|---|
| `middleware.ts` | Domain→vertical redirect enforcement, session refresh, vertical allowlist 404, no-store on sensitive paths, locale cookie mirroring |
| `lib/supabase/middleware.ts` | Cookie-bridged SSR client used only to refresh the session |
| `lib/supabase/client.ts` · `server.ts` · `anon.ts` · `types.ts` | The client factories (above) and generated DB types |
| `lib/auth/roles.ts` | Role predicates reading both `role` and `roles`: `hasRole`, `hasAnyRole`, `isAdmin`, `isBuyer`, `isVendor`, `isRegionalAdmin`, `isPlatformAdmin` |
| `lib/auth/admin.ts` | `requireAdmin` (pages, redirecting), `verifyAdminForApi` (routes, boolean), `verifyAdminScope` (vertical scoping), `hasAdminRole`, `hasPlatformAdminRole`, `isPlatformAdminCheck` |
| `lib/auth/vertical-gate.ts` | `enforceVerticalAccess` — the server-page vertical guard |
| `lib/auth/admin-accounts.ts` | `REQUIRED_ADMIN_EMAILS` — hardcoded must-always-be-admin accounts, a lockout regression guard |
| `lib/auth/protected-route.tsx` | `ProtectedRoute` server-component wrapper |
| `lib/vertical/index.ts` · `terminology.ts` · `types.ts` · `configs/**` | The terminology system: `term()`, `getContent()`, radius options, premium flags, per-vertical and per-locale config (`farmers-market{,.es}.ts`, `food-trucks{,.es}.ts`) |
| `lib/validation/vertical.ts` | `VALID_VERTICALS`, `validateVertical`, `requireVertical` — the single source of truth for vertical IDs |
| `lib/validation/vendor-signup.ts` | Zod schema for vendor signup |
| `lib/onboarding/category-requirements.ts` | Maps product categories to Texas DSHS / cottage-food permit requirements |
| `app/api/auth/callback/route.ts` | PKCE code→session exchange; infers the landing vertical from `vendor_profiles` when `next` is absent |
| `app/api/auth/me/route.ts` | Rate-limited current-user probe; returns `{user:null}` with 200 when signed out |
| `app/api/auth/send-email/route.ts` | Supabase Send-Email hook → Resend with per-vertical branding; vertical detected from path → domain → metadata |
| `components/auth/Turnstile.tsx` | Cloudflare Turnstile CAPTCHA widget |

**There is no `src/app/auth/**/page.tsx` tree.** Auth pages live at `app/login/`, `app/signup/`, `app/vendor-signup/` and the per-vertical `app/[vertical]/{login,signup,forgot-password,reset-password,confirm-email}/`.
