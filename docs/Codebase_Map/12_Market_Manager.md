# 12 — Market Manager (farmers-market side) ⚠ money

<!-- map-stamp: domain=market-manager; verified=2026-08-07; commit=00f234c8 -->
<!-- map-claims
src/app/api/market-manager/**
src/app/api/markets/**
src/lib/markets/**
src/components/market-manager/**
src/app/[vertical]/market-manager/**
src/app/[vertical]/markets/**
src/app/[vertical]/market-manager-program/**
src/components/markets/**
-->

The **second money path**: vendors rent selling space from venue operators. This file covers the farmers-market side; the food-truck park equivalent is [13_FT_Park.md](13_FT_Park.md). Both share the `markets` table, the `booth_credits` ledger, and most of `lib/markets/**`.

---

## Read this first

1. `lib/markets/manager-auth.ts` — every manager route's gate.
2. `app/[vertical]/market-manager/[marketId]/dashboard/page.tsx:197-211` — **the FM/FT fork.** One dashboard route renders `FtParkDashboardBody` or `FmDashboardBody` depending on the market. This is the single clearest boundary between the two venue domains.
3. `lib/markets/season-booking.ts` + `api/vendor/markets/[id]/book-season/route.ts` — the money path end to end.
4. `lib/markets/settlement-math.ts` (44 lines, pure) then `seasons/[seasonId]/settlement/route.ts` — the settlement rule and its enforcement.
5. `lib/markets/cancel-credit.ts` + migration 168 — the credit formula and the redemption RPC.
6. **`lib/markets/cancel-date-cascade.ts` — the highest-blast-radius file in the repository.** Read its header block (`:8-35`) before touching anything in it.

## Manager auth

`lib/markets/manager-auth.ts` exports `isMarketManager` / `getMarketManagerState`, matching on **either** `manager_user_id` **or** `manager_email` and requiring `manager_status='active'` — a suspended manager reads as a non-manager. The page shell enforces it at `market-manager/[marketId]/layout.tsx:37-45`, redirecting to `access-suspended` or `access-removed`.

Note that **market manager is not a `UserRole`** in the platform role system — see [16_Auth_RLS_Verticals.md](16_Auth_RLS_Verticals.md).

## The flow: market creation → settlement

1. **Creation.** A public application (`market-manager/intake/route.ts:12-31`) creates a `markets` row in `status='pending'`; the vertical field drives `vertical_id` and `park_mode`. Admin promotion and edits go through `api/markets/[id]/route.ts:88`.
2. **Schedule + season window.** `PUT .../schedules/route.ts` atomically replaces `market_schedules` and `markets.season_start/end` behind an `acknowledged: true` gate.
3. **Booth inventory.** Size tiers with weekly prices (`booth-inventory/route.ts`), then a market-wide booth-label range whose count must equal the sum of inventory counts (`booth-labels/route.ts:9-21`). Any inventory mutation runs `booth-label-drift-server.ts`, which **auto-clears a now-stale label range and warns rather than blocking**.
4. **Payments enabled.** `stripe/onboard` creates the market's Connect Express account; `stripe/status` lazily syncs `stripe_charges_enabled` / `payouts_enabled` back from Stripe. Booking routes hard-gate on these.
5. **Opt-in agreement.** The manager selects statements from a curated catalog (managers select, never author). `lib/markets/agreement-version.ts` hashes the selected set into a version; vendors re-accept when it changes. Anonymous invite-link visitors read the terms pre-signup via `api/markets/[id]/optin-public/route.ts`.
6. **Vendor onboarding.** Bulk invite → vendor responds → `vendor-approval/route.ts` toggles `approved`. Booth and tier assignment enforce uniqueness across vendors, placeholders and active rentals via `lib/markets/booth-conflict-checks.ts`.
7. **Season setup.** A season is created in `status='draft'`; `PATCH action='open_prepay'` enforces a 60-day lead cap and a one-season-ahead rule, refusing while a prior season is still `'ended'` (`seasons/route.ts:210`). `set_cap` sets `refund_cap_days`.
8. **Booking + payment** (vendor-initiated — routes live under `api/vendor/`, see [11_Vendor_Orders.md](11_Vendor_Orders.md)):
   - *Single week:* atomic rental insert → credit redemption → `createBoothRentalCheckoutSession`. On Stripe failure the row is deleted so the vendor can retry immediately.
   - *Season/partial:* `createSeasonBookingGroup` → `book_season_atomic` (migration 165), **all-or-nothing**; a per-week conflict surfaces as `SeasonWeekUnavailableError` → 409. Per-week totals are computed through `pricing.ts` and persisted as `total_vendor_cents` / `total_manager_cents`. One Stripe checkout covers the whole group.
9. **Day cancellation.** `cancel-date/route.ts:91-107` writes a `market_date_overrides` row (`status='cancelled'`, with `booth_disposition`), then `runCancelDateCascade` executes four paths:
   - **A** — refund buyer product orders; no vendor-reliability penalty, `cancelled_by='system'`
   - **B** — identify paid booth renters for notification only, no money
   - **C** — credit market-box pickups via the `vendor_skip_week` RPC
   - **D** — park bookings ([13_FT_Park.md](13_FT_Park.md))
10. **Season close.** `end_season` refuses before `end_date`, calls `seasonHasOutstandingDebt`, and sets `'ended'` (opening the make-up window) if debt exists, else `'settled'` directly.
11. **Make-up days.** While `ended`, make-up market days are written as `market_date_overrides` rows with `status='special'`, capped by `potential_makeup_days`. Fulfillment only — no money.
12. **Settlement.** Per group: `cancelledDays` vs `refund_cap_days`, then `owedForGroup` (`settlement-math.ts:18-31`) = `perDayBase × owedDays` where `perDayBase = total_manager_cents / (week_count × activeDaysPerWeek)`. Resolution accepts only `off_platform` or `made_up`, refuses double-settle and zero-shortfall groups, and inserts a **0-amount** `season_settlement` marker row — a resolution record, not value. The season flips to `settled` once `isSeasonFullyResolved` passes. **No Stripe money ever moves backward at settlement.**

## The booth-credit ledger

Shared with the park domain; FM is where it originated. Table: `booth_credits`. **Balance is a plain SUM** of a `(vendor_profile_id, market_id)`'s rows — positive granted, negative redeemed (`booth-credit-balance.ts:17-19`). Allowed `source` values: `season_settlement`, `vendor_cancel_pre`, `vendor_cancel_post`, `redeemed`, `expired` (migration 169), plus `park_date_cancel` (migration 201).

**Minting**
- *Vendor cancels a paid group* — `api/vendor/booth-groups/[groupId]/cancel/route.ts`. Amount from `computeCancelCredit` (`cancel-credit.ts:40-64`) on the **manager-held base**: full before season start, `× (1 − penalty%)` after, net of already-redeemed credit allocated pro-rata. The route claims the group `paid → cancelled` **first**, so a double-submit 409s and cannot double-mint.
- *Season settlement* — a 0-amount marker (above).
- *Park date cancellation* — `park_date_cancel` grants ([13_FT_Park.md](13_FT_Park.md)).

**Redeeming** — RPC `redeem_booth_credit` (migration 168) takes a `pg_advisory_xact_lock` on `(vendor, market)` so concurrent bookings cannot double-spend, computes the SUM balance, applies `LEAST(balance, requested)`, and writes the negative `redeemed` row. **Callers cap the request themselves** so the residual Stripe charge stays ≥ 50¢ and the manager transfer cannot go negative. A redeem failure is best-effort: it is logged and the booking proceeds at full price.

**Releasing** (un-redeeming) — three paths: the `cancel_season_group` RPC for never-paid groups; vendor cancel of a paid redeemed group; and the park sweep / park Stripe-failure compensating inserts, which log `CRITICAL` for manual re-credit if they fail.

**Expiring** — grants carry `expires_at`. Cron Phase 19 (`expire-orders/route.ts:3069-3120`) calls `get_booth_credit_expiry_state` (migration 198); when a `(vendor, market)` pair has a positive balance and no live grant, it inserts one `−balance` `expired` row to zero it — the balance never goes negative. Vendors holding ≥ $50 expiring within 14 days get a warning. If the RPC is missing, the whole phase is skipped and logged.

## Manager routes

| File | Purpose | Money |
|---|---|---|
| `market-manager/intake/route.ts` | Public unauthenticated market/park application; creates a `pending` market + applicant/admin emails | No |
| `[marketId]/booth-inventory/route.ts` · `[inventoryId]/route.ts` | Size tiers with weekly prices; 409 on duplicate `size_label` | **Yes** (price) |
| `[marketId]/booth-labels/route.ts` | Market-wide booth-label range; count must equal total inventory | No |
| `[marketId]/booth-placeholders/route.ts` · `[placeholderId]/route.ts` | Off-platform booth occupants; 409 on duplicate booth number | No |
| `[marketId]/branding/route.ts` · `logo/route.ts` | Market description (1000-char cap) and logo upload/removal | No |
| `[marketId]/schedules/route.ts` | Atomic replace of schedules + season window behind an acknowledgment gate | No |
| `[marketId]/documents/route.ts` · `[documentId]/route.ts` | Verification documents (≤3MB, typed); 1-hour signed URLs; delete is manager-only | No |
| `[marketId]/optin/catalog/route.ts` · `selections/route.ts` | Read the curated statement catalog; PUT selections (delete-all + insert-all) | No |
| `[marketId]/onboarding-acks/route.ts` | Acknowledgments that let a new market legitimately skip onboarding steps | No |
| `[marketId]/vendors/route.ts` · `vendor-approval` · `vendor-invitations` · `vendor-booth` · `vendor-tier` | Vendor roster, approval toggle, bulk invitations, booth-number and size-tier assignment | No |
| `[marketId]/vendor-docs/[vendorProfileId]/route.ts` | Vendor verification docs, gated on the info-sharing consent statement in the acceptance snapshot | No |
| `[marketId]/weekly-rental/[rentalId]/route.ts` | Per-week booth-number override | No |
| `[marketId]/attendance/route.ts` | Vendor check-in/out rows for one market-local date | No |
| `[marketId]/broadcast/route.ts` | One-way manager → vendor announcement; 2 per market per trailing 7 days | No |
| `[marketId]/cancel-date/route.ts` | **Cancels a market day and runs the four-path cascade** | **Yes** |
| `[marketId]/seasons/route.ts` | Season CRUD + state machine (`open_prepay`/`close_prepay`/`set_makeup_days`/`set_cap`/`end_season`) | **Yes** |
| `[marketId]/seasons/[seasonId]/makeup-dates/route.ts` | Post-close make-up days, capped | No |
| `[marketId]/seasons/[seasonId]/settlement/route.ts` | Per-group shortfall view + resolution + clean close | **Yes** |
| `[marketId]/stripe/onboard/route.ts` · `status/route.ts` | Connect Express onboarding and lazy status sync | **Yes** |
| `[marketId]/required-docs/route.ts` | Free-text compliance note (mainly FT — see [13_FT_Park.md](13_FT_Park.md)) | No |

## Public market routes

`api/markets/route.ts` (public list; POST create is admin-only) · `nearby/route.ts` (geo search) · `[id]/route.ts` (detail; PATCH/DELETE admin) · `[id]/schedules/**` · `[id]/vendors/**` (GET roster; POST = vendor applies) · `[id]/vendors-with-listings/route.ts` · `[id]/optin-public/route.ts` (anonymous terms read) · `[id]/follow/route.ts` (`market_favorites`).

## Library (`lib/markets/**` — FM-side)

| File | Purpose |
|---|---|
| `manager-auth.ts` · `manager-queries.ts` | The manager gate; markets a user manages, by vertical |
| `manager-dashboard-stats.ts` | Aggregated dashboard figures (~630 lines); uses `markets.timezone` with an `America/Chicago` fallback |
| `onboarding-progress.ts` | Step completion computed read-only from entered data (no completion flag), honoring the ack toggles |
| `booth-types.ts` · `placeholder-types.ts` · `booth-labels.ts` · `booth-label-drift-server.ts` · `booth-conflict-checks.ts` | Booth inventory, placeholders, label ranges and uniqueness/capacity checks |
| `optin-types.ts` · `optin-public.ts` · `agreement-version.ts` | Opt-in statements, service-side public fetch (RLS is default-deny), and the deterministic agreement-version hash |
| `document-types.ts` | Verification-document taxonomy, mirrored by a DB CHECK |
| `season-window.ts` · `season-weeks.ts` | Season boundaries; enumerates bookable weeks — a week is skipped only when **all** its operating days are cancelled |
| `season-booking.ts` ⚠ | `book_season_atomic` caller; per-week fee totals; persists vendor/manager totals |
| `cancelled-days.ts` · `settlement-math.ts` · `season-debt.ts` | Prepaid-days-later-cancelled counting, pure proration + clean-close gate, and the shared outstanding-debt predicate |
| `cancel-credit.ts` · `booth-credit-balance.ts` | The credit formula and expiry anchor; the SUM balance |
| `season-notifications.ts` | Season-paid notifications; swallows all errors so a webhook is never retried |
| `checkin-eligibility.ts` | Check-in eligibility + geo helpers |
| `market-visibility.ts` · `visible-markets.ts` · `vendors-with-listings.ts` | The buyer-visibility gate (same vendor needs a published listing **and** an active schedule row) and its dashboard breakdown |
| `market-audience.ts` | Resolves notify-target user IDs by audience tier (only `followers` wired today) |
| `cancel-date-cascade.ts` ⚠ | The cancel-a-day engine — four paths, highest blast radius in the repo |

## UI

Pages: **`market-manager`** (picker — new 2026-08-07), `market-manager/[marketId]/dashboard`, `onboarding`, `onboarding/[step]`, `vendor-docs/[vendorProfileId]`, plus `access-suspended` / `access-removed` and the public `market-manager-program` landing page.

**The picker (`market-manager/page.tsx`)** is the index the per-market dashboard never had. The dashboard has always been `[marketId]/dashboard` — one market's data at a time — which is the model the owner wants ("a picker that only loads the data for one market at a time", 2026-08-07). Managers previously reached it via `MarketManagerCard` on the SHOPPER dashboard, which does not survive the move to per-role dashboards. **This page is what the Slice 4 nav points at.** It redirects rather than 403s: zero markets → shopper dashboard, exactly one → straight into it (a one-option picker is a pointless click).

Components (`components/market-manager/`, 42 files — the largest component directory): `FmDashboardBody` (FM shell) · `BoothInventoryManager` · `BoothPlaceholderManager` · `BoothOccupancyGrid` · `VendorBoothList` · `OptinManager` · `MarketAgreementBlock` · `MarketScheduleCard` · `MarketSeasonCard` · `MarketSeasonMakeupWindow` · `MarketSeasonSettlementCard` ⚠ · `MarketStripeConnectCard` ⚠ · `MarketTransactionsCard` ⚠ · `ManagerEarningsCard` ⚠ · `WeeklyBookingsCard`/`WeeklyBookingsList` ⚠ · `MarketCancelDateCard` ⚠ · `MarketBroadcastCard` · `MarketAttendanceCard` · `MarketVisibilityCard` · `MarketBrandingCard` · `OnboardingChecklist` · `InviteVendorBrowser`/`InviteVendorLink` · `VerificationDocumentsCard` · `SurveyResultsCard`/`SurveyExportButton` · `MarketManagerAssignment`, plus manager-specific layout pieces (`ManagerJumpNav`, `ManagerActionSummary`, `ManagerSupportCard`).

**⚠ The card system moved out on 2026-08-07.** `ManagerCard` → `components/dashboard/DashboardCard` (renamed), and `TabbedCard` · `CollapsibleSection` · `GroupHeading` now live in `components/dashboard/` too — see [22_Components_UI.md](22_Components_UI.md). They were promoted so the vendor and shopper dashboards can share the same chrome; the manager dashboard is the reference implementation and is unchanged visually. `MANAGER_NAV_OFFSET` is now `NAV_OFFSET`, exported from `DashboardCard`. `ManagerJumpNav` deliberately stayed here — generalizing navigation is a later slice.

## Cross-cutting

- **`pricing.ts::calculateBoothRentalFees` is the single fee-truth for both venue domains** — FM per-week, FT per-day. Rounding is per line item to match Stripe.
- **`market_date_overrides` is shared**: `status='cancelled'` (both domains), `status='special'` (FM make-up days only).
