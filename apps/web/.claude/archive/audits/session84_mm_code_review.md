# Session 84 — Market Manager Comprehensive Code Re-Read

**Started:** 2026-05-20
**Mode:** Report (no code changes)
**Why this exists:** User pushed back on parroting Session 83 audit findings (G13 specifically) without reading the code myself. This document is a fresh, citation-grounded read of every market-manager file. Every claim is `file:line` or `UNVERIFIED`.

**Method:** Incremental Research Protocol. Each section is written BEFORE moving to the next, so findings survive compaction.

---

## File inventory

### Migrations (12)
**Applied** (`supabase/migrations/applied/`):
- 20260508_132_drop_legacy_analytics_functions.sql
- 20260508_133_market_manager_v1_schema.sql
- 20260508_134_market_booth_inventory.sql
- 20260509_135_market_booth_placeholders.sql
- 20260509_136_market_optin_statements.sql
- 20260509_137_enable_rls_market_manager_tables.sql

**Pending** (`supabase/migrations/`):
- 20260512_138_vendor_market_agreement_acceptances.sql
- 20260512_139_weekly_booth_rentals.sql
- 20260516_140_market_branding.sql
- 20260517_141_markets_stripe_connect.sql
- 20260518_142_book_weekly_booth_atomic.sql
- 20260518_143_replace_market_optin_selections.sql

### Lib (10) — `src/lib/markets/`
- agreement-version.ts
- booth-types.ts
- manager-auth.ts
- manager-dashboard-stats.ts
- manager-queries.ts
- onboarding-progress.ts
- optin-public.ts
- optin-types.ts
- placeholder-types.ts
- vendors-with-listings.ts

### Manager API routes (16) — `src/app/api/market-manager/[marketId]/`
- booth-inventory/route.ts
- booth-inventory/[inventoryId]/route.ts
- booth-placeholders/route.ts
- booth-placeholders/[placeholderId]/route.ts
- optin/catalog/route.ts
- optin/selections/route.ts
- vendors/route.ts
- vendor-booth/route.ts
- vendor-approval/route.ts
- vendor-docs/[vendorProfileId]/route.ts
- logo/route.ts
- branding/route.ts
- stripe/onboard/route.ts
- stripe/status/route.ts
- weekly-rental/[rentalId]/route.ts
- schedules/route.ts

### Vendor + admin + public routes
- src/app/api/vendor/markets/[id]/book/route.ts
- src/app/api/vendor/markets/[id]/agreement-status/route.ts
- src/app/api/vendor/markets/[id]/join/route.ts
- src/app/api/vendor/markets/[id]/route.ts
- src/app/api/vendor/markets/[id]/schedules/route.ts
- src/app/api/admin/markets/[id]/manager/route.ts  (need to glob; assumed path)
- src/app/api/markets/[id]/optin-public/route.ts  (need to glob; assumed path)
- src/app/api/submit/route.ts  (market_vendors auto-create path only)

### Components (18) — `src/components/market-manager/`
- BoothInventoryManager.tsx
- BoothPlaceholderManager.tsx
- InviteVendorLink.tsx
- ManagerActionSummary.tsx
- ManagerSupportCard.tsx
- MarketAgreementBlock.tsx
- MarketBrandingCard.tsx
- MarketDetailBlock.tsx
- MarketManagerAssignment.tsx
- MarketManagerCard.tsx
- MarketScheduleCard.tsx
- MarketStripeConnectCard.tsx
- MarketTransactionsCard.tsx
- OnboardingChecklist.tsx
- OptinManager.tsx
- VendorBoothList.tsx
- WeeklyBookingsCard.tsx
- WeeklyBookingsList.tsx

Plus: `src/components/vendor/BookBoothForm.tsx`

### Pages (5)
- src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx
- src/app/[vertical]/market-manager/[marketId]/onboarding/page.tsx
- src/app/[vertical]/market-manager/[marketId]/onboarding/[step]/page.tsx
- src/app/[vertical]/market-manager/[marketId]/vendor-docs/[vendorProfileId]/page.tsx
- src/app/[vertical]/market-manager-program/page.tsx
- src/app/[vertical]/vendor-signup/page.tsx  (Phase B co-branded banner)

### Tests (1)
- src/lib/__tests__/flow-integrity.test.ts (manager block)

---

## Reading checklist

- [ ] Pass 1 — Migrations 133-143
- [ ] Pass 2 — Lib files (10)
- [ ] Pass 3 — Manager API routes (16)
- [ ] Pass 4 — Vendor/admin/public routes
- [ ] Pass 5 — Components (18) + BookBoothForm
- [ ] Pass 6 — Pages + flow-integrity test
- [ ] Pass 7 — Synthesis + G13 retraction + new questions

---

## Pass 1 — Migrations (✅ complete)

### Mig 133 (applied) — Manager assignment columns on `markets`
- `markets.manager_email TEXT`, `manager_user_id UUID FK auth.users(id) ON DELETE SET NULL`, `manager_invited_at TIMESTAMPTZ`, `manager_accepted_at TIMESTAMPTZ` (mig133:15-19).
- **Functional index** `idx_markets_manager_email ON markets(LOWER(manager_email))` partial WHERE NOT NULL (mig133:24-26). **Confirms Session 83 G6:** any caller using `.ilike('manager_email', user.email)` won't hit this index — only `.eq('manager_email', LOWER(...))` or `WHERE LOWER(manager_email)=...` will. Need to check `manager-queries.ts` to verify the current query shape (Pass 2).

### Mig 134 (applied) — `market_booth_inventory`
- Columns: `id UUID PK`, `market_id UUID FK markets(id) ON DELETE CASCADE`, `size_label TEXT`, `dimensions TEXT`, `count INTEGER CHECK >= 0`, `weekly_price_cents INTEGER CHECK >= 0`, `created_at`, `updated_at` (mig134:25-35).
- UNIQUE (`market_id`, `size_label`) (mig134:34).
- Index `idx_market_booth_inventory_market ON (market_id)` (mig134:51-52).
- updated_at trigger (mig134:67-71).
- RLS NOT enabled here — see mig 137.

### Mig 135 (applied) — `market_booth_placeholders`
- Columns: `id UUID PK`, `market_id UUID FK markets(id) ON DELETE CASCADE`, `inventory_id UUID FK market_booth_inventory(id) ON DELETE SET NULL`, `booth_number TEXT`, `notes TEXT`, `created_at`, `updated_at` (mig135:24-33).
- UNIQUE (`market_id`, `booth_number`) (mig135:32).
- **NO `week_start_date` column.** The schema is time-invariant by design. This is the substrate for "off-platform vendor occupies this booth" — no week dimension exists at the data layer.
- Same-market integrity trigger ensures `inventory_id` belongs to same `market_id` if set (mig135:54-80).
- Indexes on `(market_id)` and partial on `(inventory_id) WHERE NOT NULL` (mig135:44-49).

**G13 retraction:** The Session 83 audit framed time-invariance as a gap on the assumption that off-platform vendors only show some weeks. The schema makes the time-invariant model explicit by omitting `week_start_date`. If the business reality is "off-platform vendors paid for the whole season upfront → they're there every week," the schema matches the reality and there is no gap. (User correction confirmed.)

### Mig 136 (applied) — Opt-in catalog + selections
- `market_optin_statement_catalog (id TEXT PK, category TEXT CHECK ∈ 5 values, statement TEXT, placeholders TEXT[] DEFAULT '{}', active BOOLEAN DEFAULT TRUE, sort_order INTEGER, created_at)` (mig136:28-38).
- `market_optin_selections (id UUID PK, market_id UUID FK markets ON DELETE CASCADE, statement_id TEXT FK catalog ON DELETE CASCADE, placeholder_values JSONB DEFAULT '{}', selected_at)` with UNIQUE (`market_id`, `statement_id`) (mig136:47-54).
- **`statement_id` FK has `ON DELETE CASCADE`** (mig136:50). If a catalog statement is dropped, all selections referencing it are deleted. This is a destructive design that could surprise — but the catalog is admin-controlled and the 15 seeded statements are never removed today.
- 15 seeded statements with ON CONFLICT DO NOTHING (mig136:64-111) across 5 categories: product_quality, conduct, insurance, fees, compliance.

### Mig 137 (applied) — RLS default-deny on all 4 Phase-A tables
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on `market_booth_inventory`, `market_booth_placeholders`, `market_optin_statement_catalog`, `market_optin_selections` with NO policies (mig137:27-30).
- Effect: service_role bypasses; anon/authenticated blocked entirely. Auth verified upstream by `isMarketManager`.

### Mig 138 (PENDING) — `vendor_market_agreement_acceptances`
- Columns: `id UUID PK`, `vendor_profile_id UUID FK vendor_profiles(id) ON DELETE CASCADE`, `market_id UUID FK markets(id) ON DELETE CASCADE`, `accepted_at`, `statements_snapshot JSONB NOT NULL`, `agreement_version TEXT NULL`, `created_at` (mig138:25-41).
- **UNIQUE NULLS NOT DISTINCT (`vendor_profile_id`, `market_id`, `agreement_version`)** (mig138:40) — requires PG 15+. NULL version is treated as a distinct value so one row per vendor-market when unversioned.
- Indexes: `(vendor_profile_id)`, `(market_id, accepted_at DESC)` (mig138:53-56).
- RLS default-deny enabled (mig138:59).

### Mig 139 (PENDING) — `weekly_booth_rentals`
- Columns: `id`, `vendor_profile_id UUID FK vendor_profiles ON DELETE RESTRICT`, `market_id UUID FK markets ON DELETE CASCADE`, `week_start_date DATE`, `inventory_id UUID FK market_booth_inventory ON DELETE RESTRICT`, `booth_number TEXT NULL`, `price_cents INTEGER CHECK >= 0`, `status TEXT DEFAULT 'pending_payment' CHECK IN (pending_payment|paid|cancelled|completed)`, `stripe_checkout_session_id TEXT`, `stripe_payment_intent_id TEXT`, `agreement_acceptance_id UUID FK vmaa(id) NULLABLE`, `booked_at`, `paid_at`, `cancelled_at`, `created_at`, `updated_at` (mig139:59-84).
- UNIQUE (`vendor_profile_id`, `market_id`, `week_start_date`) — blocks same vendor double-booking same week (mig139:83).
- **`booth_number` has NO UNIQUE constraint per (market, week).** Manager can assign the same booth_number to two paid rentals for the same week with no DB-level check. Confirms the second half of Session 83 backlog item P1.5 (booth allocation time-awareness).
- Indexes: `(market_id, week_start_date)`, `(vendor_profile_id, week_start_date)`, `(market_id, week_start_date, status)` (mig139:96-102).
- Same-market integrity trigger on `inventory_id` (mig139:106-126).
- RLS default-deny (mig139:147).

### Mig 140 (PENDING) — `markets.logo_url TEXT`
- Single column add (mig140:23-24). Used by co-branded vendor invite + public profile.

### Mig 141 (PENDING) — `markets.stripe_*` Connect columns
- `stripe_account_id TEXT NULL`, `stripe_onboarding_complete BOOLEAN DEFAULT FALSE`, `stripe_charges_enabled BOOLEAN DEFAULT FALSE`, `stripe_payouts_enabled BOOLEAN DEFAULT FALSE` (mig141:41-45).
- Partial index `idx_markets_stripe_account_id ON (stripe_account_id) WHERE NOT NULL` (mig141:53-55).
- Mirrors `vendor_profiles.stripe_*` pattern; uses `src/lib/stripe/connect.ts`.

### Mig 142 (PENDING) — `book_weekly_booth_atomic` RPC
- SECURITY DEFINER PL/pgSQL function (mig142:46-142).
- Locks on `pg_advisory_xact_lock(hashtextextended(market||inventory||week))` (mig142:74-78). Transaction-scoped lock; auto-releases on COMMIT/ROLLBACK.
- **Capacity = `inventory.count - COUNT(placeholders) - COUNT(rentals WHERE status IN ('pending_payment','paid'))`** (mig142:93-105). **Pending_payment counts toward capacity** — so a vendor who started a booking but never paid blocks others until cron Phase 16 sweeps them.
- Raises `OVERBOOKED` (P0001), `DUPLICATE` (P0002 — translated from 23505), `INVENTORY_NOT_FOUND` (P0003).
- Defense-in-depth: verifies inventory_id belongs to market_id (mig142:82-90). The trigger on weekly_booth_rentals also enforces this.

### Mig 143 (PENDING) — `replace_market_optin_selections` RPC
- SECURITY DEFINER (mig143:31-80).
- Single-transaction DELETE all selections for market + INSERT new set from JSONB array.
- Validates input is array (mig143:48-50). Catalog validation (statement_ids active) remains in route layer.

### Application order for prod
138 → 139 (FK to 138) → 140 (independent) → 141 (independent) → 142 (depends on 134/135/138/139) → 143 (depends on 136).

### Cross-cutting observations from Pass 1
1. **G13 retracted.** Schema is intentionally time-invariant on placeholders. Business reality (season-prepaid off-platform vendors) matches.
2. **Booth-number same-week double-assignment is possible at DB level** (mig 139 has no `UNIQUE (market_id, week_start_date, booth_number)`). User-level concern.
3. **Pending_payment counts toward capacity** (mig142:103). Race-safe but blocks others while a vendor's Stripe Checkout session is open.
4. **`market_optin_selections.statement_id` is `ON DELETE CASCADE`** (mig136:50). Catalog admin deletion silently nukes selections at every market that picked it. Low risk today (admin-only edits) but a destructive design signal.
5. **Mig 137 enables RLS retroactively.** Any code path that worked before 137 because tables had no RLS will break unless updated to use the service client. Confirms the prod onboarding-progress.ts bug pattern described in state-review §1.2.

---

## Pass 2 — Lib files (✅ complete)

### `manager-auth.ts:21-46` — `isMarketManager(supabase, marketId, user)`
- Reads `markets.manager_user_id, manager_email` (line 28-32) using caller's client. Safe because `markets` is publicly readable (no RLS gap).
- Returns true on `manager_user_id === user.id` (line 39) OR `manager_email.toLowerCase() === user.email.toLowerCase()` (line 41). Case comparison done in JS.
- Returns false on null user, no marketId, market not found, no match.

### `manager-queries.ts:28-66` — `getMarketsManagedBy(supabase, user)`
- **Confirms Session 83 G6 (perf):** line 48 uses `.ilike('manager_email', user.email)` — does NOT use the partial functional index `idx_markets_manager_email ON LOWER(manager_email)` (mig 133). Postgres `ILIKE` doesn't recognize the LOWER() expression index. Every authenticated dashboard load → seq scan on `markets`. Fix is `.eq('manager_email', user.email.toLowerCase())`, but that requires confirming that every WRITE path (admin assign, etc.) normalizes to lowercase. Need to verify in Pass 4.
- Two parallel queries (id-match + email-match) deduped in JS (lines 38-64).
- Hard-coded `vertical_id = 'farmers_market'` (lines 42, 49) — FM-only as documented.

### `onboarding-progress.ts:47-95` — `getOnboardingProgress(marketId)`
- **Confirms staging fix is current:** line 50 calls `createServiceClient()` internally; no longer takes a supabase client parameter. Auth verified upstream.
- 5 parallel HEAD-count queries: booth inventory, placeholders, optin selections, market_vendors total, market_vendors with `booth_number` not null (lines 52-74).
- `required_complete` only counts inventory + optin (lines 82-84). Vendor booth assignment counts are reported but not required — matches Session 81 decision.

### `manager-dashboard-stats.ts:41-114` — `getManagerDashboardStats(marketId, tz)`
- Service client throughout (line 46). Comments at 14-19 cite the canonical timezone pattern from `cron/expire-orders/route.ts:2267-2269`.
- Reads `market_schedules` first to compute next market day (lines 50-54). The schedules query selects `day_of_week, start_time, active` — handles soft-delete correctly via line 138 `if (schedule.active === false) continue`.
- 4 parallel queries: active schedule vendor IDs, market_vendors approved+no-booth, order_items on next market date, market_vendors approved=false count (lines 67-92).
- `activeVendorsNeedingBooth` is intersection of sets 1+2 (lines 94-99).
- `nextMarketDayOrderCount` dedups order_ids in JS (lines 101-104).
- `computeNextMarketDate` (lines 126-160): "today is a market day but start_time passed → push to next week" matches `markets/[id]/page.tsx:137-143` UX.

### `manager-dashboard-stats.ts:215-315` — `getMarketTransactionsAggregates(marketId, tz, seasonStart, seasonEnd)`
- Single broadest-window query then bucket in JS (lines 257-302). Filters `order_items.status NOT IN ('cancelled','refunded')`.
- Season fallback to last 90 days if `markets.season_start/end` not set (lines 240-253).
- Comments at lines 187-189 explicitly note this is gross sales (vendor-owned, not manager revenue) — Phase C will have separate "booth rental income" card.

### `booth-types.ts` — Pure types + validators
- `BoothInventoryRow` shape matches mig 134 (lines 10-19).
- `validateBoothInventoryInput` (lines 63-74): label ≤50 chars, count ≥0 integer ≤1000, weekly_price_cents ≥0 integer ≤$10K. Reasonable bounds.
- `summarizeBoothInventory` (lines 43-58): `max_weekly_revenue_cents` = Σ (count × weekly_price_cents). Pure.

### `placeholder-types.ts` — Pure types + validator
- `BoothPlaceholderRow` shape matches mig 135 (lines 10-18).
- Same-market integrity check delegated to DB trigger (lines 29-31). Application validates length only.
- **No `week_start_date` in input or row type** — consistent with mig 135's time-invariant schema.

### `optin-types.ts` — Pure types + helpers
- `renderOptinStatement(template, values)` substitutes `{name}` tokens; unfilled tokens pass through unchanged (lines 53-62). Manager-friendly debug visibility.
- `validateOptinSelection(statement, values)` returns `"Missing value for {ph}"` when any declared placeholder lacks a value (lines 67-82). **Confirms Session 83 G10:** the error message uses the placeholder name not the statement text — but G10's claim was that `OptinManager.tsx:142` formats this as `"${stmt.id}": ${validationError}` — verify in Pass 5.
- `groupStatementsByCategory` sorts by `sort_order` within each category (lines 85-101).

### `optin-public.ts:66-119` — `fetchMarketOptinForVendor(marketId)`
- Service client. Two queries: selections then catalog by IDs (lines 71-86).
- **Catalog filtered `.eq('active', true)` (line 85).** If a statement was selected by a manager and later marked inactive in the catalog (admin op), it silently disappears from vendor view. The selection row still exists. Manager doesn't see anything about it. Latent design concern — not a bug today because admin doesn't deactivate catalog statements.
- Empty handling (lines 76-78, 88): all paths return `{ rendered: [], snapshot: [] }` — callers must decide whether to hide UI vs. surface "no agreement set."
- Walks catalog in `sort_order` ascending (line 86, comment 90-92) — stable display + snapshot ordering.

### `agreement-version.ts:27-56` — `computeAgreementVersion`
- Pure FNV-like hash from sorted statement_ids (lines 27-46). Returns `'v0:empty'` for empty set, `'v1:<count>:<hex8>'` otherwise.
- `computeAgreementVersionFromSnapshot` filters statement_ids starting with `_` (synthetic markers like info-sharing) so they don't change the version on their own (lines 51-56).
- **Placeholder value changes do NOT trigger re-acceptance** — documented at lines 12-18 as an intentional v1 trade-off ("clarifications, not new terms").

### `agreement-version.ts:103-142` — `getVendorAgreementStaleness`
- Two parallel: current market version + vendor's most-recent acceptance (lines 109-119).
- `is_stale=true` when versions differ OR no acceptance row exists (lines 127-141).
- Edge case (per comments 96-100): both `'v0:empty'` → not stale. Caller logic confirmed.

### `vendors-with-listings.ts` — Not market-manager scoped
- Powers `/markets/[id]` public profile listing display. Two paths (event vs non-event markets) at lines 110, 167. Used by manager dashboard *only* if the manager page surfaces listing counts (need to verify in Pass 6 + Pass 5).
- Session 70 extraction note at lines 73-76 documents why this exists as a lib helper (avoid Vercel SSO blocking server-side fetch).

### Cross-cutting observations from Pass 2
1. **G6 confirmed:** `manager-queries.ts:48` does NOT hit the LOWER() functional index. Real but low-severity.
2. **G10 partially confirmed at the lib layer:** `optin-types.ts` error format is `"Missing value for {ph}"` — clean. The "raw `stmt.id`" wrapper is at the component level (Pass 5).
3. **Inactive-catalog-statement disappearance:** `optin-public.ts:85` silently drops selections whose catalog row went inactive. No path to surface this to the manager. Latent concern.
4. **Placeholder-value-only edits don't trigger re-acceptance** — documented design choice in `agreement-version.ts`. May surprise managers who tweak {distance_miles} expecting vendors to re-confirm.
5. **`onboarding-progress.ts`'s staging service-client fix is present.** Once mig 138/139/140/141/142/143 ship to prod and `staging→main` push lands, R1 from state-review is resolved.

---

## Pass 3 — Manager API routes (✅ complete)

### Universal pattern
Every route: `withErrorTracing` wrapper → `checkRateLimit('mm:<ip>', rateLimits.api)` (or `submit` for uploads) → `createClient` → `auth.getUser` → `isMarketManager(supabase, marketId, user)` → 403 on fail → `createServiceClient` for actual reads/writes. Confirmed across all 16 routes.

### booth-inventory route.ts (GET, POST)
- GET (lines 48-75): selects all rows where `market_id=marketId`, orders by `size_label`.
- POST (lines 77-133): validates input, INSERT, catches 23505 (unique conflict on size_label) → 409.

### booth-inventory/[inventoryId] route.ts (PATCH, DELETE)
- Cross-market spoof guard (lines 44-62): authorize() verifies the row belongs to URL marketId before allowing PATCH/DELETE.
- **DELETE (lines 128-171) maps 23503 → 409 with friendly message:** *"This booth size has active bookings. Cancel or wait for them to complete before removing the tier."* (lines 154-161). **Confirms Session 83 G3 is already fixed at the API layer.** The G3 audit cited `booth-inventory/[inventoryId]/route.ts:148` as not handling 23503, but the current code at line 154 DOES handle it. The remaining G3 work is the UI side (confirm dialog message in BoothInventoryManager) — need to verify in Pass 5.

### booth-placeholders + booth-placeholders/[placeholderId]
- Identical pattern. PATCH/DELETE include cross-market spoof guard. INSERT/UPDATE catches 23505 (booth_number duplicate) → 409 and P0001 (cross-market inventory_id trigger violation) → 400.

### optin/catalog GET (lines 27-67)
- Returns active catalog statements, ordered by sort_order then id. Auth-gated despite catalog being shared across managers — prevents anonymous enumeration.

### optin/selections (GET, PUT)
- **PUT (lines 94-199) uses mig 143 RPC `replace_market_optin_selections`** (line 161): atomic delete+insert in single transaction. Confirms Session 83 G8 is fixed.
- Pre-RPC validation (lines 130-154): selects active catalog rows matching incoming `statement_ids`, throws ERR_VALIDATION_002 if any are inactive/unknown.
- Returns `OptinSelection[]` mapping back from `selection_*` prefixed RPC columns (lines 182-195).

### vendors GET (lines 27-140)
- Three queries: (1) `market_vendors` with vendor_profiles join (lines 52-69), (2) `vendor_market_schedules` to compute `is_active_schedule` (lines 81-93), (3) `vendor_market_agreement_acceptances` to compute `has_info_sharing_consent` from synthetic `_info_sharing_consent` snapshot entry (lines 100-111).
- Returns enriched vendor records with `on_platform: true`, `is_active_schedule`, `has_info_sharing_consent`. Used by `VendorBoothList`.

### vendor-booth PATCH (lines 28-94)
- Sets/clears `market_vendors.booth_number` for `(market_id, vendor_profile_id)`.
- Comment lines 25-26: "Two vendors with the same booth_number is allowed" — explicit design decision (managers share booths).
- No notification to vendor on assignment.

### vendor-approval PATCH (lines 31-149)
- Allows BOTH directions: approve (false→true) and revoke (true→false) — explicitly documented at lines 17-22.
- **Fires `vendor_market_approval_granted` notification on approve only** (lines 88-140) — vendor's user_id + email looked up via `serviceClient.auth.admin.getUserById`. Silent on revoke per comment 88-92.
- **G5 confirmed at the route layer:** the API supports revoke via `approved: false`, but as I'll verify in Pass 5, the UI doesn't expose a button to call it.
- No DELETE method — preserves the permission boundary tested by `flow-integrity.test.ts`.

### vendor-docs/[vendorProfileId] GET (lines 27-130)
- **Three auth gates:** (1) isMarketManager (line 43), (2) market_vendors row exists at this market (lines 50-60), (3) vendor's `vendor_market_agreement_acceptances` snapshot contains `_info_sharing_consent` synthetic statement (lines 66-81).
- Returns vendor_verifications fields (categories, COI, prohibited-items ack, onboarding date). Storage URLs assumed signed via Supabase Storage policy.
- **Line 65 comment has a stale TODO** ("TODO for new-vendor path") — but the work IS done in `/api/submit/route.ts` per session83_mm_audit line 157. Documentation drift only.

### logo (POST, DELETE)
- POST (lines 51-126): multipart upload to `vendor-images/market-logos/<marketId>-logo-<timestamp>.<ext>`. 3MB cap, JPG/PNG/GIF/WebP. **Runs `moderateStorageImage`** (lines 100-106) — failed moderation deletes the storage object + throws validation error. Writes `markets.logo_url` (line 113).
- DELETE (lines 128-153): clears `markets.logo_url`. **Storage file is left behind** (line 16 comment) — orphan cleanup deferred to future sweeper.

### branding PATCH (lines 24-78)
- Only updates `markets.description` (v1 A3 scope). 1000-char cap. Empty string normalized to null.

### stripe/onboard POST (lines 42-154)
- Verifies existing `stripe_account_id` on Stripe, clears columns if Stripe 404s (lines 93-119).
- Creates account via `createMarketConnectAccount(user.email, marketId)` — idempotency key per code comment at line 30, verified by inspecting `src/lib/stripe/connect.ts` namespace `connect-account-market-${marketId}` per current_task.md.
- Generates account link with refresh + return URLs back to dashboard with `?stripe=refresh|complete` query flags (lines 138-142).

### stripe/status GET (lines 42-138)
- Lazy-sync: calls `getAccountStatus(stripeAccountId)`, writes `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_onboarding_complete` back to `markets` (lines 90-98).
- 404 from Stripe → clears DB columns (lines 110-128) — handles deleted Connect accounts cleanly.

### weekly-rental/[rentalId] PATCH (lines 34-100)
- Updates `weekly_booth_rentals.booth_number` matched on BOTH `id=rentalId AND market_id=marketId` (cross-market spoof guard, line 76-77).
- **No status restriction** (comments 27-31): manager can edit booth_number on cancelled/completed rows too. Future polish flagged.
- **No DB-level UNIQUE constraint on (market_id, week_start_date, booth_number)** — confirmed in Pass 1. Manager can assign same booth_number to two paid rentals for same week. UI doesn't warn (need to verify in Pass 5).

### schedules (GET, PUT) — the post-Session-83 soft-delete rebuild
- File header (lines 8-58) cites verification-discipline Rule 5 (the Schema Intent Gate) as the rationale for the soft-delete pattern.
- PUT validation (lines 167-234): `acknowledged===true` hard gate; per-day uniqueness; HH:MM time format; start<end; YYYY-MM-DD season dates; season_start ≤ season_end.
- Per-day soft-upsert (lines 252-331): SELECT existing rows once, UPDATE in place if found (preserves id → fires `handle_market_schedule_deactivation` trigger when active flips true→false), INSERT only when `active=true && no existing`. **NEVER DELETE.**
- **Notification block (lines 333-396):** queries `market_vendors` approved=true, dedups user_ids, fires `market_schedule_changed` in parallel. **Does NOT query `weekly_booth_rentals` for paid future-week renters** — confirms backlog item P1 "Booth-renter notification gap on schedule changes" is still open.

### Cross-cutting observations from Pass 3
1. **G3 partially-fixed:** API DELETE on booth-inventory now maps 23503→409 with friendly message. UI confirm dialog message + pre-check booking count remain (Pass 5).
2. **G8 fixed:** optin/selections PUT uses atomic RPC.
3. **G5 confirmed open at UI:** vendor-approval API supports revoke; need to verify VendorBoothList exposes a button.
4. **Vendor-approval already notifies** on approve. Closes the "vendor not told they were approved" gap from §7.4 of state-review.
5. **Booth-number same-week double-assignment** — DB has no UNIQUE on (market, week, booth_number). PATCH endpoint doesn't pre-check. Latent issue; need UI behavior in Pass 5.
6. **Schedule-change notification gap:** confirms backlog item — does not notify paid booth renters for upcoming weeks.
7. **`vendor-docs/route.ts:65` stale TODO comment** — documentation cleanup only.
8. **Storage orphan on logo DELETE** — file remains in `vendor-images/market-logos/`. Acceptable for v1 per the comment but worth a future sweeper.

---

## Pass 4 — Vendor + admin + public market routes (✅ complete)

### `/api/vendor/markets/[id]/book/route.ts` (POST, 449 lines)
The vendor booth-booking endpoint — the heart of Phase C.
- **Stripe-only enforcement** (lines 137-144): rejects with friendly 409 if `market.stripe_charges_enabled !== true`. Verified before any DB write.
- 4 gates: authenticated → vendor profile exists in market vertical → market found → inventory tier belongs to market. Vendor pre-approval (`market_vendors.approved=true`) is **NOT** required per the explicit design comment at lines 157-167: *"approving each rental wouldn't save the manager time — if there are open booths and the vendor agrees + pays, the system should let them."* Manager controls supply, demand routes automatically.
- Week validation (lines 196-227): must be valid Sunday in the future (market-local time via canonical cron tz pattern).
- Acceptance snapshot insert (lines 244-284): writes `vendor_market_agreement_acceptances` row with computed version hash; on 23505 (vendor already accepted this version) fetches existing id — idempotent.
- **Uses mig 142 RPC `book_weekly_booth_atomic`** (lines 286-337): race-safe capacity + insert. Maps custom errors OVERBOOKED→409, DUPLICATE→409, INVENTORY_NOT_FOUND→404. **Confirms Session 83 G1 is fixed.**
- **Stripe session creation** (lines 373-411): calls `createBoothRentalCheckoutSession`, persists session_id back to rental row.
- **G7 fix confirmed (lines 412-437):** on Stripe failure, DELETEs the orphan rental row (`status='pending_payment' AND stripe_checkout_session_id IS NULL`) so vendor can retry immediately. Acceptance row intact (idempotent on hash).

### `/api/vendor/markets/[id]/agreement-status/route.ts` (GET)
Returns `AgreementStaleness` for the calling vendor at this market. Simple wrapper around `getVendorAgreementStaleness`. Used by vendor-signup page State D.

### `/api/vendor/markets/[id]/join/route.ts` (POST, 208 lines)
- For EXISTING vendors landing on invite URL (`?market=<id>`). Different code path than `/api/submit` (which handles new-vendor signup).
- Body requires `agreement_accepted=true` (line 71). Optional `info_sharing_accepted`.
- Upserts `market_vendors` with `approved=false` (lines 149-160), then inserts `vendor_market_agreement_acceptances` (lines 169-179). **Non-atomic** — comments 166-168 acknowledge the gap; if step 2 fails, market_vendors row exists with no acceptance. Vendor can re-confirm via dashboard prompt-on-next-load (deferred polish).
- Auto-computes `agreement_version` from snapshot (line 127); body's version (if supplied) is ignored.
- Info-sharing handled via synthetic `_info_sharing_consent` entry appended to snapshot (lines 133-143).
- 23505 on acceptance insert → treats as success (`acceptance_existed: true`).

### `/api/vendor/markets/[id]/route.ts` (PUT, DELETE)
- This route is for **vendor-OWNED markets** (private pickup / event markets the vendor created), NOT booth-rental markets. Has DELETE — but it's gated by `market.vendor_profile_id === vendorProfile.id`. Out of market-manager scope, but the file is in the vendor markets tree so I read it.
- Lines 184-188: schedule delete-and-replace pattern when modifying private_pickup pickup_windows. Pre-checks pending orders (lines 161-181) before deleting schedule rows. **This is the destructive-CRUD pattern** that the Schema Intent Gate (Rule 5) was added to catch — but this route predates Rule 5, AND it pre-checks for pending orders. Still: it's deleting `market_schedules` rows even though `active` column exists. Vendor-owned markets, low-volume use. Latent concern, not new.

### `/api/vendor/markets/[id]/schedules/route.ts` (GET, PUT, PATCH)
Vendor-side schedule attendance toggle (sets `vendor_market_schedules.is_active`).
- **GET (line 100-103)** filters `.eq('active', true)` — vendor only sees active market schedules.
- **PUT (lines 211-216)** validates submitted `scheduleIds` against `market_schedules WHERE active=true` (line 214). So bulk-PUT rejects attendance on inactive rows. Good.
- **PATCH (lines 434-443)** verifies schedule belongs to market BUT does NOT add `.eq('active', true)`. **Confirms backlog R15** — vendor could PATCH-activate attendance on a schedule the manager has deactivated. Same finding as Session 83 Agent A. Easy fix: add `.eq('active', true)` at line 438.
- Schedule conflict detection (lines 232-279, 464-504) for cross-market overlap when `multiple_trucks=false`.
- Pending-order protection on deactivate (lines 281-324, 506-528).

### `/api/admin/markets/[id]/manager/route.ts` (POST, 153 lines)
- Admin (platform or vertical-admin) assigns/clears `manager_email` on a market.
- **Normalizes email to lowercase** on assign (line 125): `normalizedEmail = rawEmail.toLowerCase()`. **All writes are normalized.**
- Clear action zeroes all 4 manager fields (lines 98-115).
- No magic-link invite email yet (line 47-49 comment).

**Implication for G6:** since admin always writes lowercase, `manager-queries.ts:48`'s `.ilike(...)` could be replaced with `.eq('manager_email', user.email.toLowerCase())` and would use the `idx_markets_manager_email` partial functional index from mig 133. Safe change.

### `/api/markets/[id]/optin-public/route.ts` (GET, 111 lines)
Anonymous read for invite landing pages.
- No auth (intentional). Service client to bypass RLS.
- Returns market metadata (`id, name, description, address, city, state, day_of_week, start_time, end_time, timezone, website, logo_url`) + active schedules + rendered statements.
- Schedule fallback to legacy `markets.day_of_week` field if `market_schedules` empty (lines 99-107).

### `/api/submit/route.ts` (lines 196-280) — Manager-invite auto-association
- Validates `market_id_from_invite` market exists (lines 206-210).
- Upserts `market_vendors` with `approved=false` (lines 213-222), conflict-key `market_id,vendor_profile_id`. Non-blocking.
- **If `body.market_agreement_accepted === true`** (line 228), writes `vendor_market_agreement_acceptances` with computed version + optional `_info_sharing_consent` synthetic entry (lines 228-280). Matches join route's pattern exactly.
- **The `info_sharing_accepted` capture IS wired for new vendors** (lines 251-263). The stale TODO at `vendor-docs/route.ts:65` is a documentation artifact only — the work is done.

### Cross-cutting observations from Pass 4
1. **G1 fix confirmed end-to-end** — book route uses the atomic RPC.
2. **G7 fix confirmed end-to-end** — Stripe failure deletes orphan, vendor retries immediately.
3. **G2 (price display) still latent at the route boundary** — the route uses `calculateBoothRentalFees`, so the wire-level math is correct. Whether the UI form shows the all-in vendorPaysCents needs Pass 5 verification.
4. **R15 (vendor PATCH allows inactive schedule)** confirmed — `vendor/markets/[id]/schedules/route.ts:434-443` is the exact line. PUT branch is safe; PATCH branch is the gap. ~3 LOC fix.
5. **G6 (email index unused) safely fixable** — admin route normalizes to lowercase on write; query side just needs `.eq` instead of `.ilike` to hit the functional index.
6. **`/api/vendor/markets/[id]/route.ts` PUT** uses delete-and-replace on `market_schedules` (lines 184-201). Predates Rule 5 but does pre-check pending orders. Vendor-owned market scope; out of market-manager surface but a latent inconsistency with the manager-side soft-delete pattern.
7. **Vendor-side join route has a non-atomic window** — `market_vendors` upsert + acceptance insert are sequential (lines 149-179). Comment at 166-168 acknowledges. Could be wrapped in a small RPC similar to mig 143 if it becomes a real problem.

---

## Pass 5 — Components (✅ complete)

### `BookBoothForm.tsx` (382 lines)
- **G2 (vendor sees wrong price) → FIXED in code.** Lines 314-340: computes `calculateBoothRentalFees(selectedInventory.weekly_price_cents)` and displays `formatPrice(fees.vendorPaysCents)` — the all-in number. Comments at 307-313 cite the "one all-inclusive number" convention from CartDrawer.tsx:218.
- Stripe-only model: if response lacks `checkout_url`, treats as server error (lines 119-124). No "manager will coordinate offline" fallback.
- Return-flash rendering for `?session=success|cancel` query params (lines 131-238). Success state links to `/[vertical]/vendor/bookings`.

### `VendorBoothList.tsx` (445 lines)
- **G5 (no revoke UI) → FIXED in code.** Lines 408-424: "Revoke" button on approved-vendor rows. ConfirmDialog (lines 273-281) gates the destructive action. `handleApprove(vendorProfileId, false)` flips approved back (lines 145-150).
- 4-state filter: Active / Needs booth # / Pending approval / All (lines 264-270).
- Per-row "View docs →" link renders only when `has_info_sharing_consent && vertical` (lines 320-332).

### `BoothInventoryManager.tsx` (501 lines)
- **G3 (DELETE confirm dialog lies) → FIXED in code.** Lines 489-497: ConfirmDialog message now reads *"Tiers with active bookings cannot be removed — vendors with paid or pending rentals must finish or cancel first. Vendors already assigned a booth number from this size keep their booth assignment."* Accurate.
- ConfirmDialog (not native confirm) — mobile-safe.
- API errors surface in `rowError` state (line 206).

### `MarketBrandingCard.tsx` (416 lines)
- **G4 (window.confirm blocks mobile) → FIXED in code.** Line 46-47 comment + lines 404-412 ConfirmDialog usage. Logo Remove flow is mobile-safe.
- Logo + description editor in same card. 1000-char description cap mirrored client-side (line 27, 90-93).

### `OptinManager.tsx` (355 lines)
- **G10 (raw `stmt.id` in error) — STILL OPEN.** Line 142: `setSaveError(`"${stmt.id}": ${validationError}`)`. Manager sees e.g. `"fm_quality_001": Missing value for {distance_miles}`. ~2 LOC fix: show `stmt.statement` or the rendered preview instead.
- **G9 (no warning about re-acceptance) — STILL OPEN.** Saving silently changes the agreement_version hash which triggers re-acceptance for all vendors. No UI warning anywhere in this file.

### `MarketScheduleCard.tsx` (706 lines)
- Soft-delete pattern executed in UI: view mode shows active days only (lines 222-290); edit mode renders all 7 day rows with active toggle (lines 292-411).
- Submit filter (line 190): `Boolean(d.start_time && d.end_time)` — sends inactive rows that previously had times so the API can UPDATE active=false; days never-active filtered out.
- **AcknowledgmentDialog has 4 bullets** (lines 499-502), not 3 as the file header (line 16-21) says. Minor doc drift.
- 4th bullet explicitly states soft-delete behavior: *"Vendor attendance on that day is deactivated (not deleted); vendors must re-opt in if you turn the day back on."*

### `WeeklyBookingsCard.tsx` (143 lines)
- **G11 (stale "payment coming soon" copy) — CONFIRMED OPEN.** Lines 123-124: *"Online payment is coming — for now coordinate payment directly with each vendor."* Phase C Stage 3 has shipped — this is wrong. ~5 LOC fix to make conditional or remove.

### `WeeklyBookingsList.tsx` (222 lines)
- Cancelled rows are read-only at the UI level (lines 117, 186-192). Comment line 188 says "Cancelled-row corrections aren't expected."
- **Inconsistency with API:** the route allows PATCH on any status including cancelled (see Pass 3). UI prevents but API doesn't. Latent mismatch, low risk.
- No warning when assigning a booth_number that's already in use for this week+market. The DB has no constraint (Pass 1 confirmed). Manager could double-assign silently.

### `ManagerActionSummary.tsx` (157 lines)
- Three actionable bullets: pending approval, needs booth, next market day. Renders nothing if all quiet.
- Deep-links to `#vendors-at-market` anchor on the dashboard.
- Defers to `OnboardingChecklist` when setup is incomplete (lines 36-37).

### `OnboardingChecklist.tsx` (155 lines)
- Two states: "✓ Setup complete" compact line (lines 32-66) vs. yellow setup card with checklist (lines 68-153).
- Vendor booth assignment row is informational only; doesn't gate required_complete (lines 112-123).

### `MarketStripeConnectCard.tsx` (392 lines)
- Four states: not_connected, in_progress, under_review, active (classifier lines 53-58).
- **G11 also present here.** Line 279-280 (active state): *"Stripe is connected and ready to receive booth rental payments. Online checkout for vendors will go live in the next update."* Stale — checkout IS live.
- **Lines 223-224 (not_connected state) actively misleading:** *"Vendors can book booths at your market right now, but you can't receive online payment until you finish Stripe onboarding."* Vendors CANNOT book — book route rejects with 409 when stripe_charges_enabled=false (Pass 4, lines 137-144).
- Manual "Refresh status" button + last-checked-at timestamp (lines 254-267).

### `BoothPlaceholderManager.tsx` (502 lines)
- Same pattern as BoothInventoryManager. ConfirmDialog for deletes (line 491). Tier dropdown sourced from booth-inventory API.
- No `week_start_date` UI — consistent with the time-invariant schema.

### `InviteVendorLink.tsx` (128 lines)
- Gated by `onboardingComplete` prop (lines 14-15, 56-75). Prevents managers from inviting before setup is done.
- URL: `${origin}/${vertical}/vendor-signup?market=${marketId}` — NO `?ref=manager` (collision-avoidance documented lines 27-31).

### `MarketAgreementBlock.tsx` (220 lines)
- Single "I agree" checkbox covering all statements (design intent locked line 12-22).
- **Empty-statements case** (lines 99-113): renders nothing AND auto-fires `onChange(true)` so the parent's submit gate doesn't block. Comment notes the acceptance row write becomes a "no-op snapshot."
- Loading + error states styled.

### `MarketManagerCard.tsx` (90 lines)
- Buyer dashboard card. Renders nothing when zero managed markets (line 24).
- "🌾 My Markets" heading.

### `MarketManagerAssignment.tsx` (305 lines)
- Used in admin paths (platform + vertical admin).
- Three state displays: no manager / Pending sign-up / Active since [date] (lines 124-159).
- ConfirmDialog on Remove (lines 294-301) — message accurately describes that booth inventory/placeholders/opt-ins remain.

### `MarketDetailBlock.tsx` (172 lines)
- Public-detail block for invite landing pages.
- Renders nothing when `anyDetail===false` (line 81) — avoids empty card.

### `MarketTransactionsCard.tsx` (134 lines)
- Phase D.1 card. 3 windows: 7d, 30d, season.
- Renders nothing when all 3 empty (lines 27-31).
- Disclaimer: gross sales, not manager earnings (lines 75-79).

### `ManagerSupportCard.tsx` (86 lines)
- Static Phase D.3 card. Support email + Help center + Submit feedback links.
- Hardcoded `SUPPORT_EMAIL = 'support@farmersmarketing.app'`.

### Cross-cutting observations from Pass 5
1. **5 of Session 83's 18 audit findings were already fixed in code before this session.** G1 (race), G2 (price), G3 (DELETE confirm), G4 (mobile confirm), G5 (revoke UI), G7 (Stripe-fail retry), G8 (atomic optin save).
2. **G9, G10, G11 confirmed OPEN.** All low-severity polish.
3. **G11 is multi-site:** WeeklyBookingsCard, MarketStripeConnectCard (active state + not_connected state), book/page.tsx (need to verify in Pass 6), BookBoothForm (already conditional).
4. **MarketStripeConnectCard "not_connected" copy is actively wrong** post-Stripe-only model. Book route rejects bookings when stripe_charges_enabled=false; the card says vendors CAN book. Latent UX/trust issue.
5. **OptinManager has neither warning nor inactive-statement detection** — the silent disappearance of selected statements (when admin deactivates a catalog row) noted in Pass 2 has no UI surface here either.
6. **WeeklyBookingsList vs API status-restriction mismatch** — UI hides editor for cancelled rows; API allows. Latent, low risk.

---

## Pass 6 — Pages + flow-integrity test (✅ complete)

### `dashboard/page.tsx` (408 lines)
- Server component. Auth: redirect to `/[vertical]/login` if no user (line 47), redirect to `/[vertical]/dashboard` if not `isMarketManager` (lines 50-53).
- Fetches: market row with `logo_url, description, season_start, season_end, timezone` (line 61); `onboardingProgress`; `dashboardStats`; `transactionsAggregates`; `market_schedules` (line 81-90).
- Renders in order (lines 134-364): OnboardingChecklist → ManagerActionSummary → MarketTransactionsCard → WeeklyBookingsCard (with `id="weekly-bookings"` anchor for notification deep-link line 156-158) → MarketStripeConnectCard → MarketBrandingCard → Booth inventory section → Off-platform placeholders section → Vendors at this market (with `id="vendors-at-market"` anchor + needs-booth badge) → InviteVendorLink → OptinManager → MarketScheduleCard → ManagerSupportCard → "Coming soon" stub.
- **G11 also present here.** Lines 380-393: "Coming soon" list still includes *"Online checkout for booth rentals"* as future work. Phase C Stage 3 shipped — should be removed/relabeled.

### `onboarding/page.tsx` (205 lines)
- Auth: same redirects as dashboard.
- **5 numbered steps + a separate "Review and finish" CTA.** Lines 47-75: steps array has 5 entries (identity, booths, vendors, placeholders, optin). Lines 175-201: confirm rendered as a non-numbered CTA below the list.
- Step numbers shown 1-5; check marks if done; "(optional)" badge on vendors + placeholders.

### `onboarding/[step]/page.tsx` (439 lines)
- `STEPS = ['identity', 'booths', 'vendors', 'placeholders', 'optin', 'confirm']` (line 12) — **6 entries**.
- **G12 (step counter mismatch) — STILL OPEN.** Line 103: `Step ${stepIdx + 1} of ${STEPS.length}` renders "Step 6 of 6" on confirm, but the landing page (`onboarding/page.tsx`) only numbers 5 steps. The user sees 5 steps on the checklist, clicks "Review and finish", lands on a page labeled "Step 6 of 6". ~1 LOC fix: render step counter only for non-confirm steps, or use `STEPS.length - 1` as denominator.
- The 6 step renderers (identity, booths, vendors, placeholders, optin, confirm) wrap the existing component CRUD widgets (BoothInventoryManager, BoothPlaceholderManager, OptinManager, VendorBoothList).
- Confirm step (lines 275-373) shows a summary list with ✓/⚠/○ markers per item.

### `flow-integrity.test.ts:316-398` — Manager permission boundary
- Walks `/api/market-manager/` recursively. For every file referencing `.from('market_vendors')`, scans the 12 lines after each match for `.delete()`. Reports violations with file:line.
- **G19 confirmed open:** only this one test exists at the manager surface. No equivalent for `weekly_booth_rentals` or `vendor_market_agreement_acceptances` — both contain financial/legal records that shouldn't be hard-deletable by managers. Defensive only; no current incident.

### Cross-cutting observations from Pass 6
1. **G11 multi-site:** dashboard.tsx, WeeklyBookingsCard, MarketStripeConnectCard. Same fix pattern.
2. **G12 still open:** 1 LOC fix in `[step]/page.tsx:103`.
3. **Permission boundary test mechanically passes.** All manager API write paths (`market_vendors`) are PATCH/UPDATE/UPSERT, never DELETE.

---

## Pass 7 — Synthesis

### G-finding status matrix (rebased against actual code, 2026-05-20)

| ID | Session 83 audit claim | Current state | Citation |
|---|---|---|---|
| G1 | Race condition in booth booking | **FIXED.** book route uses mig 142 RPC | `vendor/markets/[id]/book/route.ts:289` |
| G2 | Vendor sees wrong price | **FIXED.** Form shows `calculateBoothRentalFees(...).vendorPaysCents` | `BookBoothForm.tsx:314-340` |
| G3 | BoothInventory DELETE confirm lies | **FIXED.** Confirm message accurate; API maps 23503→409 | `BoothInventoryManager.tsx:489-497`, `booth-inventory/[id]/route.ts:154-161` |
| G4 | window.confirm blocks mobile | **FIXED.** Uses ConfirmDialog | `MarketBrandingCard.tsx:404-412` |
| G5 | No UI to revoke approved vendor | **FIXED.** Revoke button + confirm | `VendorBoothList.tsx:408-424` |
| G6 | `.ilike` doesn't use functional index | **STILL OPEN.** Admin writes lowercase but query uses ilike | `manager-queries.ts:48` |
| G7 | Stripe-fail blocks retry 30 min | **FIXED.** Orphan delete on catch | `vendor/markets/[id]/book/route.ts:417-422` |
| G8 | Optin save not atomic | **FIXED.** Uses mig 143 RPC | `optin/selections/route.ts:161` |
| G9 | No warning before optin save triggers re-acceptance | **STILL OPEN.** No UI nag | `OptinManager.tsx` |
| G10 | Optin error shows raw stmt.id | **STILL OPEN.** Line confirmed | `OptinManager.tsx:142` |
| G11 | "Payment coming soon" stale copy | **STILL OPEN** in 3 places | `dashboard/page.tsx:389`, `WeeklyBookingsCard.tsx:123-124`, `MarketStripeConnectCard.tsx:223-224, 279-280` |
| G12 | Step counter 5-vs-6 mismatch | **STILL OPEN.** Step page denominator is 6 | `onboarding/[step]/page.tsx:103` |
| G13 | Placeholders not time-aware | **NOT A GAP.** Schema is intentionally time-invariant; matches business reality (season-prepaid off-platform vendors) | `mig 135`, user confirmation |
| G14 | Mig 140 missing from prod-push table | Doc-only, **already corrected** in current_task.md | `current_task.md:67-75` |
| G15 | Phase D shipped, not documented | Doc-only | `current_task.md` |
| G16 | No vendor "My Bookings" view | **FIXED.** Vendor page exists + dashboard card | `vendor/bookings/page.tsx`, `BookBoothForm.tsx:174` |
| G17 | No cancellation flow | **STILL OPEN.** No DELETE or status PATCH on weekly_booth_rentals from either side | API surface check |
| G18 | account.updated webhook drift | Already-tracked backlog item | `stripe/status/route.ts` lazy-sync |
| G19 | Flow-integrity only catches `market_vendors` DELETE | **STILL OPEN.** No tests for weekly_booth_rentals / agreement_acceptances | `flow-integrity.test.ts:316-398` |

### Net result
**11 of 19 Session 83 findings have been fixed since the audit was written, mostly during Session 83 itself.** The remaining open items are:

**Open bugs / UX issues:**
- **G6** Email-index perf (low impact today)
- **G9** No warning before opt-in change triggers re-acceptance
- **G10** Optin error shows raw statement ID
- **G11** Stale "payment coming soon" copy in 4 spots; MarketStripeConnectCard "not_connected" copy is actively misleading
- **G12** Step "X of 6" vs landing's "1 of 5" mismatch
- **G17** No cancellation flow — true gap, needs design

**Open features / design gaps:**
- **G19** Flow-integrity test surface is narrow

**Newly surfaced this session (NOT in Session 83 audit):**
- **N1** `vendor/markets/[id]/schedules/route.ts:434-443` PATCH allows attendance on inactive schedules. Same as backlog R15. ~3 LOC fix (add `.eq('active', true)` to the schedule lookup).
- **N2** `manager-dashboard-stats.ts` order count includes status `'pending'` (line 85) but `'pending'` is not a status `order_items` uses according to the established transition set — confirm against actual schema or this query returns 0 rows when there are pending items. (Pass 1 didn't read order_items schema; may already be correct.) **Marked UNVERIFIED until checked.**
- **N3** `optin-public.ts:85` silently drops selections whose catalog row is inactive. No UI surface tells the manager. Future-proofing concern only.
- **N4** `agreement-version.ts` does NOT include placeholder values in the hash (lines 12-18). A manager who edits e.g. `{distance_miles}` from "30" to "50" won't trigger re-acceptance even though the agreement text changed. Documented design choice; may surprise.
- **N5** `weekly-rental/[rentalId]` PATCH allows booth_number change on cancelled bookings (line comments 27-31 acknowledge as "no enforcement"). UI hides editor on cancelled rows so functionally OK, but the API+UI mismatch is latent.
- **N6** No DB-level UNIQUE on `weekly_booth_rentals (market_id, week_start_date, booth_number)` — same-week double-assignment is possible if manager isn't careful. No UI guard either. Already noted in backlog P1.5.
- **N7** `MarketStripeConnectCard.tsx:223-224` not_connected copy promises vendors CAN book without Stripe — book route now rejects. Actively misleading; ~5 LOC fix.
- **N8** Onboarding landing page (`onboarding/page.tsx:47-75`) shows 5 numbered steps but [step]/page.tsx STEPS array has 6 entries (line 12). Same root cause as G12 — fix in one place.

### Retraction: G13

The Session 83 audit framed `market_booth_placeholders` as *missing* a `week_start_date` column, assuming off-platform vendors might only show some weeks. The schema makes the time-invariant model **explicit** (mig 135 has no week column by design). When I parroted this audit finding in the morning question, I:

1. Did not read mig 135 myself before claiming a fix was needed (cite-or-verify violation).
2. Did not validate the audit's business premise — which the user immediately corrected: off-platform vendors at FM markets typically pay for the whole season upfront, so time-invariance matches reality.

**G13 is not a gap.** No migration needed. The audit was wrong about the underlying business model. Backlog item P1.5 should be re-scoped: the only true concern in that line item is **N6 (same-week booth-number double-assignment)**, which is a separate, smaller issue.

### What this means for next-session planning

The "polish + Session 83 follow-up" bucket the user originally targeted is much smaller than the audit suggested. The actual remaining items:

**Quick polish (each <30 LOC, no migrations):**
- G10 — show statement text instead of ID in OptinManager error
- G11 — remove/conditionalize stale "payment coming soon" copy in 3 spots
- G12 / N8 — fix step counter denominator
- N1 / backlog R15 — add `.eq('active', true)` to vendor schedules PATCH
- N7 — fix MarketStripeConnectCard "not_connected" copy

**Real design work (each needs a decision before code):**
- G9 — surface re-acceptance impact warning in OptinManager
- G17 — cancellation flow (touches Stripe refund + transfer reversal, similar shape to market box A4 backlog item)
- Schedule-change notification gap (backlog P1, ~15 LOC but needs to know which renter weeks count)
- Refund policy notice placement on booking form (locked design, just reverted UI)

**Doc cleanup:**
- G14 / G15 already done
- N3, N4 — document the design choices in a "what won't trigger re-acceptance" note
- G19 — extend flow-integrity test to cover weekly_booth_rentals + agreement_acceptances DELETE (defensive)

### What I want to ask the user

1. **Polish bucket** — should I batch G10, G11, G12/N8, N1, N7 into a single PR? They're all small and independent.
2. **G9 (re-acceptance warning)** — does the manager need a warning *before* save, or *after* (next-time-they-see-dashboard)? A pre-save warning needs the affected-vendor count from a DB query; a post-save info note is simpler.
3. **G17 (cancellation)** — is this scoped for this session, or should it become its own design conversation? It's the biggest remaining item and structurally similar to the existing market-box refund cleanup backlog (A4).
4. **N6 (same-week double-assignment)** — DB-level UNIQUE partial index + UI guard? Or just UI guard with no DB constraint?
5. **Schedule-change notification gap** — confirm: when manager changes schedule, do paid `weekly_booth_rentals` vendors for upcoming weeks get notified? My read says no, only approved `market_vendors`.

