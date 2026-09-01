# 19 — Admin ⚠ money

<!-- map-stamp: domain=admin; verified=2026-08-30; commit=21f7fdd6 -->
<!-- map-claims
src/app/api/admin/**
src/lib/admin/**
src/lib/vendor-event-application.ts
src/lib/reports/**
src/components/admin/**
src/app/admin/**
src/app/[vertical]/admin/**
src/app/api/errors/**
src/app/cause/onboard/**
-->

51 admin routes across two role tiers. This is also where the platform's revenue reporting lives, which makes a handful of these routes the highest money-density code outside checkout.

---

## Read this first

1. **`lib/auth/admin.ts` end to end** (260 lines) — it defines the entire permission model, and the defect below is visible in it.
2. **`lib/reports/platform-revenue.ts:1-31`** before touching any revenue number. The fee-semantics comment there is the difference between reports that tie to Stripe and reports that don't.
3. For route work, start from the auth-helper matrix below: the six `verifyAdminScope` routes are the intended pattern; the forty `hasAdminRole` routes are the legacy one.

## The permission model

Two role tiers — `admin` (vertical-scoped) and `platform_admin` — stored redundantly in **two live columns**, `user_profiles.role` (singular) and `user_profiles.roles` (array). Every check reads both. Vertical assignments live in a separate `vertical_admins` table.

| Helper | Purpose |
|---|---|
| `requireAdmin()` | Page-level; redirects on failure. Enforces MFA only when `REQUIRE_ADMIN_MFA === 'true'`. **Not used by any API route.** |
| `hasAdminRole(profile)` | Sync boolean — true for `admin` *or* `platform_admin` |
| `verifyAdminForApi()` | API-safe, no redirect. Explicitly meant to run **before** `createServiceClient()` |
| `verifyAdminScope(verticalId)` | The scope-enforcement helper. Distinguishes `null` (unauthenticated) from `{authorized: false}` (known admin, wrong vertical) |
| `isPlatformAdminCheck()` | The strict platform-admin test — correct |

**Enforcement is inconsistent across the 51 routes:**

| Helper used | Count | Which |
|---|---|---|
| `verifyAdminScope` (intended pattern) | 6 | `error-logs`, `event-ratings`, `feedback`, `quality-checks`, `reports`, `stripe-reconcile` |
| `verifyAdminForApi` | 4 | the three `analytics/*` routes and `knowledge` |
| `hasAdminRole` inline (legacy) | 40 | all vendor verification, all event/settlement/payment, all market routes, and `fee-override` |
| none | 1 | `admin/login` (pre-auth entry point) |

## ⚠ Known defect — vertical admins receive platform scope

**Confirmed 2026-07-18 by direct read; open, not yet triaged.**

`hasPlatformAdminRole` (`lib/auth/admin.ts:134-140`) returns true for `role === 'admin'` as well as `'platform_admin'`, making it functionally identical to `hasAdminRole` directly above it. `verifyAdminScope` gates its "platform admins can access everything" short-circuit on that helper (`:192-201`), so **the `vertical_admins` membership check at `:204-214` is unreachable for anyone holding the `admin` role** — a vertical admin requesting another vertical receives `authorized: true` with that vertical as `effectiveVerticalId`.

The code's structure shows this was not the intent: the `isAdmin && requestedVerticalId` branch exists specifically to scope `admin` users and is dead as written, and the doc comment at `:100-102` states *"Vertical admins (regular 'admin' role) can only manage their specific vertical."*

**Blast radius:** exactly the six routes that use `verifyAdminScope` — which are the money and PII routes it was introduced to protect.

**⚠ The bug is currently load-bearing — do not "just fix" the helper.** Production SQL (2026-07-18) found **zero platform admins**: both admin accounts hold `role='admin'` with no `vertical_admins` rows. Admin access works *because* the helper wrongly accepts `admin`. Making it strict without provisioning first locks both accounts — including the owner's — out of every scope-checked route. Note `lib/auth/admin-accounts.ts` is titled "Required platform admin accounts" and its integrity test asserts only that the hardcoded email list exists; it never queries the database, so it would not have caught this.

**Owner-decided remediation sequence (in flight):**
1. **Migration 204** (`20260718_204_admin_role_provisioning.sql`) — additive only: grants `platform_admin` to both accounts, chief flag to the owner, `vertical_admins` rows for every vertical. Nothing is revoked, so there is no window where anyone loses access.
2. Owner tests admin surfaces; re-runs verification query V2, which must return **zero rows**.
3. *Then* `hasPlatformAdminRole` is made strict, activating both `verifyAdminScope` and the dormant fix in `admin/errors/route.ts`.
4. The 39 unscoped routes are audited (money routes first) and routed through `verifyAdminScope`, with a structural test forcing every `api/admin/**` route through a sanctioned helper.
5. Regional manager is designed on the corrected hierarchy.

**The intended hierarchy** (owner, 2026-07-18): platform admin ⊃ vertical admin. Platform admins have everything vertical admins have plus cross-vertical reach; vertical admins see only their own vertical. There is no blanket "admin" tier — the legacy `'admin'` enum value *is* how a vertical admin is represented in code.

**Second-order concern:** the money-moving routes (`vendors/[id]/fee-override`, `events/[id]/payments`, `events/[id]/settlement`, `backfill-stripe-fees`) use bare `hasAdminRole` with no vertical scoping at all, so their cross-vertical isolation depends on route-local filtering rather than the shared helper. Whether each compensates internally is **UNVERIFIED per route.**

## Revenue reporting — the fee-semantics trap

`lib/reports/platform-revenue.ts` documents the rule that makes reports reconcile:

**`order_items.platform_fee_cents` is the COMBINED buyer + vendor percentage fee (~13%)** and excludes flat fees, the small-order fee, and tips. Treating it as the buyer-side 6.5% produced figures that did not tie to Stripe — that was a real reporting defect, not a rounding disagreement.

The correct decomposition:
```
grossPlatform = total_cents − Σ vendor_payout_cents − vendorTipShare
net           = gross − estimatedStripeCost − Σ refunds
```
where Stripe cost is estimated at 2.9% + $0.30 **per PaymentIntent** (zero for external-payment orders), and `actualStripeFeeCents` from `payments.stripe_fee_cents` overrides the estimate when captured.

**`total_cents` and tip are order-level and must be counted once per order.** One order is one Stripe charge regardless of vendor count; a multi-vendor cart has multiple `order_items` each with its own payout and transfer. Iterating `order_items` and adding `total_cents` per item multi-counts by item count. Callers group by `order_id` and call once per order.

Consequence worth stating plainly: **platform revenue is not attributable per vendor** — flats, small-order fee and tip are per order. Per-vendor reports show payout and tip share only.

## Routes

### Access control & identity
`admin/login` (the only route with no admin helper — it's the entry point) · `admins/route.ts` (list/create platform admins) · `admins/[userId]` (revoke) · `verticals/route.ts` · `verticals/[verticalId]/admins/route.ts` · `verticals/[verticalId]/admins/[adminId]` · `users/[id]` (edit profile).

### Vendor verification & gates
| Route | Purpose | Money |
|---|---|---|
| `vendors/[id]/verify` | Gate 1 — business verification | No |
| `vendors/[id]/verify-category` | Gate 2 — per-category documents | No |
| `vendors/[id]/verify-coi` | Gate 3 — Certificate of Insurance | No |
| `vendors/[id]/fast-track` | Override approving **all three gates at once** | No |
| `vendors/[id]/approve` · `reject` | Vendor approval decisions | No |
| `vendors/[id]/event-approval` | Event-eligibility approval | No |
| `vendors/[id]/fee-override` | **Overrides a vendor's platform fee rate** (floor 3.6%) | **YES** |
| `vendors/pending-event-applications` | Pending event application queue — includes applications from not-yet-approved vendors, flagged `eligible:false` (owner decision 2026-08-15) | No |

"Has applied" for event approval is defined ONCE in `src/lib/vendor-event-application.ts` (`getEventApplicationState` — reads `profile_data.event_readiness`), used by the queue API and both vendor detail pages (root + `[vertical]`). Collapsed 2026-08-15 from 3 hand-kept copies.

### Events
`events/route.ts` (list catering requests) · `events/[id]` (status transitions; approval auto-creates the event market + token) ⚠ · `events/[id]/payments` ⚠ (company deposit + final settlement) · `events/[id]/fee-payments` ⚠ (2026-08-16: Event Vendor FEE rows + manual full refund WITH transfer reversal, allowed on paid AND forfeited — the support override; distinct from `payments`, which is company-paid money) · `events/[id]/settlement` ⚠ (the heaviest money logic in admin) · `events/[id]/invite` · `events/[id]/rematch` · `events/[id]/generate-waves` · `events/[id]/repeat` · `event-ratings` (moderate: approve/hide).

### Markets
`markets/route.ts` · `markets/[id]` (edit/remove — the delete guard blocks on booth/park/credit history so a market delete can't cascade-wipe paid history across 22 referencing tables) · `markets/[id]/manager` (assign/clear/suspend/restore) · `markets/[id]/documents` + `[documentId]` (1-hour signed URLs, guarded against cross-market id spoofing) · `markets/[id]/duplicates`.

### Money & finance tooling
| Route | Purpose |
|---|---|
| `reports/route.ts` ⚠ | The revenue/report engine — highest money density of any admin route |
| `stripe-reconcile/route.ts` ⚠ | Natural-language Stripe reconciliation, vertical-scoped |
| `backfill-stripe-fees/route.ts` ⚠ | Backfills `payments.stripe_fee_cents` from Stripe (default 100, max 500 per call; repeat until `remaining: 0`) |
| `analytics/overview` · `top-vendors` · `trends` | Platform KPIs from live `orders` + `market_box_subscriptions` (a legacy SQL analytics function was abandoned) |
| `cause/beneficiaries/[id]/connect` | Community Chip In beneficiary onboarding. `mode:'email'` (default) sends the org a durable invitation; `mode:'open'` hands the admin a link for walking them through it live. GET reads Stripe status live — never cached, so an org can't reach the remit sweep before it can actually be paid |
| **`src/app/cause/onboard/[token]` ⚠ PUBLIC** | **Not an admin route — unauthenticated, lives here because the admin flow owns it.** Mints a FRESH Stripe account link on every visit and 303-redirects. Exists because Stripe account links expire in minutes, are single-use, and get eaten by mail scanners, so they cannot be emailed; we email this durable url instead. Token is a bearer credential granting only "start onboarding for this org" — revoke by nulling `cause_beneficiaries.onboarding_token` (mig 218) |

### Ops, moderation, support
`errors/route.ts` + `errors/[id]` (error reports with resolution history and similar-report matching) · `error-logs` (the aggregated `error_logs` dashboard) · `order-issues` · `feedback` · `quality-checks` (scan history + active findings from the cron) · `listings/[id]` (moderate) · `knowledge` (KB articles; admins see unpublished) · `moderation-test` (diagnostic: is Google Vision reachable — uploads nothing) · `vendor-activity/flags` + `[id]` · `vendor-activity/referrals` (referral credits) · `vendor-activity/settings`.

## UI

**Components** (`components/admin/`): **`AdminShell` — the ONE admin chrome for both tiers** (admin UI rebuild phase 1, owner 2026-08-30): sticky bar with scope pills (only held scopes; "Platform" pill = platform admins), ☰ grouped menu (Operate / People & places / Money / Quality / System) listing every top-level admin page with live queue badges, amber attention dot. Rendered by BOTH admin layouts; presentation-only (server layouts resolve data). `AdminSidebar` / `AdminNav` are RETIRED chrome (files kept, rendered nowhere — flow-integrity forbids `<AdminNav` returning) · `VendorVerificationPanel` (the three-gate UI) · `AdminMobileRow` (compressed <640px row; takes exactly one of `href` or `rightAction`) · `AdminResponsiveStyles` (shared CSS, included once per page) · `Pagination` · `ManagerHistoryPanel` (read-only manager-assignment audit).

**Page merges (phase 3, 2026-08-30, in progress):** duplicated platform/vertical page-pairs collapse into one implementation each under `components/admin/`, both routes becoming thin wrappers (auth gates unchanged per route). Done: **users** — `UsersAdminPage.tsx` (server, scope = vertical | null-for-all) + `UsersAdminTable.tsx` (client superset: vertical column/filter on all-scope, drill-in links, buyer-tier expiry, per-scope tier options — the old platform copy offered FT tiers against FM data). The three superseded per-route clients were DELETED with owner approval 2026-08-30 (grep-verified zero importers; one of them had none even before the merge). **listings** — `ListingsAdminPage.tsx` (server) + `ListingsAdminTable.tsx` (client): one row-list at all widths, suspend/unsuspend kept; three filter repairs — search is server-side now (the old copies searched only the fetched page), the all-scope vertical filter uses the text slug (the old UUID option values could never match `listings.vertical_id`), and the status filter gained Paused (suspended). Both superseded `ListingsTableClient` copies deleted (grep-verified zero importers). **admins** — `AdminsManager.tsx` (client, mode = platform | vertical): merges the UI shape ONLY — the two modes manage different permission systems (platform admins on user_profiles via `/api/admin/admins`; vertical admins as vertical_admins rows via `/api/admin/verticals/[id]/admins`), and every endpoint + S4-2 permission gate is kept verbatim per mode; one row-list at all widths (the old platform copy had no mobile view). **error-logs** — `ErrorLogsAdminPage.tsx` (client, optional vertical prop): both copies already shared GET /api/admin/error-logs (verifyAdminScope), so the merge is client-only; superset = 90-day window + Active-window line (platform) + row-list and Error Reports cross-link (vertical). **errors** — `ErrorReportsAdminPage.tsx` (client, optional vertical prop): shared APIs already (/api/admin/errors[+/id], RLS + in-route platform gates untouched); superset = Level filter/Copy-Context/breadcrumbs/similar-reports (platform) ∪ full action set + card previews (vertical); vertical's fixed drawer replaced by the inline sticky split panel. the Record Fix Attempt form is WIRED (2026-08-31, owner-approved): action record_fix_attempt on the [id] PATCH → `recordFixAttempt()` into error_resolutions, platform-admin only (was a success-banner stub that saved nothing). **order-issues** — `OrderIssuesAdminPage.tsx` (client, optional vertical prop): shared API already (both tiers may update; S4-2 scoping untouched); superset = Closed tab + age chips (vertical) ∪ FT/FM chip on all-scope rows (platform). **analytics ⚠ money** — `AnalyticsAdminPage.tsx` (client, optional vertical prop): both copies were the same client over the same three APIs; the merge changed NO API code, figures, or money labels — each mode keeps its exact pre-merge metric set (revenue semantic stays gross product subtotal excl. fees, per the route docs). **cause — DELIBERATELY NOT MERGED** (2026-08-31): the pair is an intentional permission split, not duplication — platform page = full money management (beneficiaries/Stripe onboarding/remittances/campaigns); vertical page = the owner-decided read-only reduced list (2026-08-04 "read plus attach"; reduction enforced server-side). One component would blur that money boundary for zero dedup gain. **reports ⚠ money** — `ReportsAdminPage.tsx` (client, optional vertical prop): generators untouched (one shared POST route; ADM-1 scopes vertical admins server-side); platform keeps the vertical selector + the six accounting reports; vertical keeps the CSV|Quality tabs. ⚠ pre-existing, owner-flagged: the accounting category is curated CLIENT-side only — the API serves those reportIds (vertical-scoped) to any admin who posts them directly. **event-ratings** — `EventRatingsAdminPage.tsx` (client, optional vertical prop): shared API already; the real split is kept — moderation buttons render only in platform mode, matching the PATCH route's platform-admin-only gate (ADM-4); vertical stays read-only. Tab counts scoped per vertical (was a global-counts defect).

**Hubs (phase 2, 2026-08-30):** both admin dashboards (`app/admin/page.tsx`, `app/[vertical]/admin/page.tsx`) are thin wrappers over `components/admin/AdminHubZones.tsx` + `lib/admin/hub-data.ts` — zones: "Needs you now" (queue tiles from the shared badge set + stuck-orders/stale-vendors red flags) → per-vertical command cards (platform) → rolling 24h/7d activity snapshot → Totals (every stat the old hubs showed, preserved) → Browse tiles generated from `nav.ts`. The platform hub's old inline 5-row pending table intentionally moved behind the pending-vendors tile.

**`src/lib/admin/`** (phase 1, 2026-08-30): `nav.ts` — the single nav definition both tiers render, plus `NAV_EXEMPT_PAGES` (drill-ins/pre-auth); flow-integrity holds it to the filesystem in both directions, so a new admin page cannot fall out of navigation. `queue-badges.ts` — `getAdminQueueBadges(service, vertical|null)`: parallel HEAD counts for the owner-approved queue set (pending vendors 'submitted' · pending markets · event requests new/reviewing · open order issues · error reports pending/acknowledged · activity flags pending · unremitted cause paid_at NULL, platform-only); failures log via observed() and render 0. `shell-data.ts` — resolves scopes (verticals table ∩ admin's grants) + groups + badges for the layouts. Full redesign plan: `apps/web/.claude/admin_ui_redesign_research.md` (phases 2–7 pending).

**Pages** exist in two parallel trees:
- **`app/admin/**`** (20 pages) — the global console with its **own login and MFA flow** (`/admin/login`, `/admin/mfa/setup`, `/admin/mfa/verify`), separate from vertical user auth.
- **`app/[vertical]/admin/**`** — the vertical-scoped mirror: `admins`, `analytics`, `users`, `vendors` (+ `[vendorId]`), `vendor-activity`, `listings`, `markets`, `events` (+ `[id]/settlement`), `errors`, `error-logs`, `feedback`, `event-ratings`, `order-issues`, `knowledge`, `reports`, `stripe-reconcile`.

Money-touching pages: `analytics` and `reports` in both trees. The `listings`, `users` and `vendors` list pages carry a 2-minute cache.
