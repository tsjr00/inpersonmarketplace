# 19 — Admin ⚠ money

<!-- map-stamp: domain=admin; verified=2026-07-18; commit=b9f82116 -->
<!-- map-claims
src/app/api/admin/**
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
| `vendors/pending-event-applications` | Pending event application queue | No |

### Events
`events/route.ts` (list catering requests) · `events/[id]` (status transitions; approval auto-creates the event market + token) ⚠ · `events/[id]/payments` ⚠ (company deposit + final settlement) · `events/[id]/settlement` ⚠ (the heaviest money logic in admin) · `events/[id]/invite` · `events/[id]/rematch` · `events/[id]/generate-waves` · `events/[id]/repeat` · `event-ratings` (moderate: approve/hide).

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

**Components** (`components/admin/`, 7 files): `AdminSidebar` / `AdminNav` (chrome) · `VendorVerificationPanel` (the three-gate UI) · `AdminMobileRow` (compressed <640px row; takes exactly one of `href` or `rightAction`) · `AdminResponsiveStyles` (shared CSS, included once per page) · `Pagination` · `ManagerHistoryPanel` (read-only manager-assignment audit).

**Pages** exist in two parallel trees:
- **`app/admin/**`** (20 pages) — the global console with its **own login and MFA flow** (`/admin/login`, `/admin/mfa/setup`, `/admin/mfa/verify`), separate from vertical user auth.
- **`app/[vertical]/admin/**`** — the vertical-scoped mirror: `admins`, `analytics`, `users`, `vendors` (+ `[vendorId]`), `vendor-activity`, `listings`, `markets`, `events` (+ `[id]/settlement`), `errors`, `error-logs`, `feedback`, `event-ratings`, `order-issues`, `knowledge`, `reports`, `stripe-reconcile`.

Money-touching pages: `analytics` and `reports` in both trees. The `listings`, `users` and `vendors` list pages carry a 2-minute cache.
