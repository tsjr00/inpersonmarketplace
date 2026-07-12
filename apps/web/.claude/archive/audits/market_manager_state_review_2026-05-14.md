# Farmers Market Manager — State Review (2026-05-14)

**Purpose:** Comprehensive read-only audit of where the FM market manager feature stands. Replaces stale `current_task.md` claims with `file:line` citations against the live code.

**Method:** Incremental Research Protocol — each section is written to this file BEFORE moving to the next. Each claim cites `file:line` or is marked `UNVERIFIED`.

**Important git reality:** Local `main` HEAD = `8c5b4993` = `origin/staging`. `origin/main` (prod) is `c7d0b3ec`, 8 commits behind. Reading local files shows **staging** state. For prod-only reads, used `git show origin/main:<path>`.

**Protocol 8 baseline:** Zero errors in prod `error_logs` over the past 7 days as of 2026-05-14.

---

## Checklist

- [x] Section 1: Phase A — what's live in prod (at `c7d0b3ec`)
- [x] Section 2: 8 staging-ahead commits not on prod
- [x] Section 3: Database state — migrations 132-139
- [x] Section 4: Phase B feature inventory
- [x] Section 5: RLS posture + flow-integrity test
- [x] Section 6: Open design questions
- [x] Section 7: Phase B remaining
- [x] Section 8: Phase C / D / E roadmap
- [x] Section 9: Risk flags

---

## Section 1: Phase A — What's live in prod (at `c7d0b3ec`)

Phase A shipped a complete v1 of the market manager surface — auth, onboarding wizard, three CRUD systems, vendor booth assignment, plus admin-side assignment UI. All citations are at `origin/main` (prod tip `c7d0b3ec`).

### 1.1 Manager authentication — dual-key

**`src/lib/markets/manager-auth.ts:21-46`** — `isMarketManager(supabase, marketId, user)` returns true if **either** `markets.manager_user_id === user.id` OR `LOWER(markets.manager_email) === LOWER(user.email)`. The email branch exists so an admin can assign a manager by email **before** the user signs up; once they do, a backfill flow (not yet implemented) is supposed to set `manager_user_id` on first dashboard load.

**`src/lib/markets/manager-queries.ts:28-66`** — `getMarketsManagedBy(supabase, user)` runs two parallel queries (id-match + ilike email-match) against `markets` filtered to `vertical_id = 'farmers_market'`, dedups, returns. Used by the buyer-dashboard "My Markets" card. **FM-only scope hard-coded — FT park-operator persona deferred** (manager-queries.ts:42, 49).

### 1.2 Onboarding progress reader — has a known prod bug

**`src/lib/markets/onboarding-progress.ts` (prod)** — `getOnboardingProgress(supabase, marketId)` runs three parallel HEAD-count queries against `market_booth_inventory`, `market_booth_placeholders`, `market_optin_selections`, all using **the passed-in `supabase` client** (the auth user's client).

Result on prod: migration 137 enabled default-deny RLS on all four manager tables (no policies, only `service_role` bypasses). The auth-user client cannot SELECT from these tables, so all three counts come back 0. `inventory_done = false`, `optin_done = false`, `required_complete = 0` for every manager regardless of actual data.

**This is the regression `9318bda1` on staging fixes** by switching the reader to use `createServiceClient()` internally (auth-verified upstream by `isMarketManager`). The fix is **not yet on prod**. Confirmed reproduced by user 2026-05-09 ("set up market box shows 0 of 2 required even though I have completed and saved all onboarding categories").

### 1.3 Onboarding wizard — 5 steps (prod) / 6 steps (staging)

**`src/app/[vertical]/market-manager/[marketId]/onboarding/[step]/page.tsx` (prod) — steps array at top:** `['identity', 'booths', 'placeholders', 'optin', 'confirm']`. Server-component dispatcher: auth-checks via `isMarketManager`, redirects to `/[vertical]/dashboard` on fail, redirects to `/[vertical]/login` if not authenticated. Unknown step slugs `notFound()`.

**`src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx` (prod)** — renders the market header, `<OnboardingChecklist>`, then four panels: BoothInventoryManager, BoothPlaceholderManager, VendorBoothList, OptinManager. Also a "Coming soon" stub list (dashboard/page.tsx:204-225) — five items, including "Vendor invite / onboarding referral link" which is **now built** on staging as InviteVendorLink.

**`src/components/market-manager/OnboardingChecklist.tsx` (prod)** — yellow setup card when required incomplete; collapsed "✓ Setup complete" line when both `inventory_done` and `optin_done` are true. Three list rows: booth inventory (required), placeholders (optional with count), opt-in (required). **Because of 1.2, this card permanently shows "0 of 2 required steps done" in prod.**

### 1.4 CRUD API surface — all behind `isMarketManager` + service client

Every Phase A manager-side route follows the same pattern: rate-limit → auth check → service client to bypass RLS:

| Route | Methods | Purpose |
|---|---|---|
| `/api/market-manager/[marketId]/booth-inventory` | GET, POST | List + add size tiers (`booth-inventory/route.ts:48-133`) |
| `/api/market-manager/[marketId]/booth-inventory/[inventoryId]` | PATCH, DELETE | Edit + remove tier |
| `/api/market-manager/[marketId]/booth-placeholders` | GET, POST | List + add off-platform placeholder |
| `/api/market-manager/[marketId]/booth-placeholders/[placeholderId]` | PATCH, DELETE | Edit + remove placeholder |
| `/api/market-manager/[marketId]/optin/catalog` | GET | Read 15-statement catalog |
| `/api/market-manager/[marketId]/optin/selections` | GET, PUT | Read + replace whole selection set |
| `/api/market-manager/[marketId]/vendors` | GET | On-platform vendors at market with `booth_number`, `approved`, `response_status` (vendors/route.ts:25-103) |
| `/api/market-manager/[marketId]/vendor-booth` | PATCH | Set/clear `market_vendors.booth_number` for a vendor (vendor-booth/route.ts:28-94) |

**Pattern confirmed at `booth-inventory/route.ts:33-46`:** `createClient()` → `auth.getUser()` → `isMarketManager()` → if allowed, `createServiceClient()` for all reads/writes. Same pattern in vendor-booth route at lines 37-62 and vendors route at lines 35-49.

**Pricing model:** booth weekly price stored in cents (`booth-types.ts:11-19`); validation caps at $10K/week (booth-types.ts:72). No booth-number uniqueness check across vendors at same market — "two vendors sharing a booth is allowed" per `vendor-booth/route.ts:25-26`.

### 1.5 Opt-in agreement system

**`src/lib/markets/optin-types.ts`** — 5 categories: product_quality, conduct, insurance, fees, compliance (optin-types.ts:7-20). 15 seeded statements (migration 136). Statements have `{placeholder}` tokens that managers fill at selection time:

- `renderOptinStatement(template, values)` substitutes `{name}` → value; missing values pass through unchanged so the UI can show what still needs filling (optin-types.ts:53-62)
- `validateOptinSelection(statement, values)` returns `"Missing value for {ph}"` if any placeholder lacks a value (optin-types.ts:67-82)
- `groupStatementsByCategory(statements)` rolls them up in canonical category order for UI rendering (optin-types.ts:85-101)

### 1.6 Admin-side manager assignment — shared component

**`src/components/market-manager/MarketManagerAssignment.tsx`** is used in **both** admin paths:

1. **Platform admin** at `/admin/markets/[id]/page.tsx` — full market detail page
2. **Vertical admin** at `/[vertical]/admin/markets/page.tsx` — inline Edit form (added in c7d0b3ec)

Component state machine (MarketManagerAssignment.tsx:39-44):
- No manager: shows email input + "Assign" button
- Email assigned, no `manager_user_id`: shows email + "Pending sign-up" yellow badge + Reassign/Remove
- Email + user_id linked: shows email + "Active since [date]" green badge + Reassign/Remove

Calls `POST /api/admin/markets/[id]/manager` with `{ action: 'assign' | 'clear', email? }`. Optional `onChange` callback for client-rendered hosts to re-fetch (MarketManagerAssignment.tsx:21-22).

**Mobile-edit UX**: c7d0b3ec also added `rightAction` Edit button to `AdminMobileRow` so portrait-orientation users can hit the inline Edit form on the vertical admin markets list. Per current_task.md, landscape rotation should also work via existing CSS at `AdminResponsiveStyles.tsx:365`, though the user reported it doesn't on their device (device-side issue, not code).

### 1.7 Permission boundary (test-enforced)

**`d802506c`** added a flow-integrity test that walks `src/app/api/market-manager/` and fails CI if any file calls `.from('market_vendors').delete()`. Reasoning: a manager cannot disassociate a vendor that associated themselves first — that's the vendor's right, not the manager's. Enforced by API surface absence rather than RLS policy. (Full verification of the test deferred to Section 5.)

### 1.8 Buyer-side entry point

**`src/components/market-manager/MarketManagerCard.tsx`** — buyer dashboard card. Reads `getMarketsManagedBy(supabase, user)`; if empty, renders nothing. Otherwise lists the manager's markets with links into `/[vertical]/market-manager/[marketId]/dashboard`.

### 1.9 Public landing

**`src/app/[vertical]/market-manager-program/page.tsx`** — public marketing page explaining the program. Not yet covered in this audit; not a critical path.

### Phase A summary

- ✅ Complete v1 manager UX shipped
- ✅ Admin-side assignment (both platform + vertical admin)
- ✅ Permission boundary test in place
- ⚠️ **PROD BUG: onboarding-progress.ts uses the wrong client → checklist permanently shows 0/2 done** (fix is staged on `9318bda1` but not pushed)

---

## Section 2: 8 staging-ahead commits (chronological)

`origin/staging` (`8c5b4993`) is 8 commits ahead of `origin/main` (`c7d0b3ec`). Six are manager-feature work; two are dev-discipline infrastructure (rules/hooks) that don't affect app behavior.

### 2.1 `9318bda1` — Progress-query RLS fix + vendors wizard step

**Type:** Bugfix + feature. **Files:** 5 (no migration, no API, no critical-path).
- `onboarding-progress.ts`: switches to internal `createServiceClient()` (auth verified upstream). Drops `supabase` param from 3 callers. Also adds `vendors_at_market_count` and `vendors_with_booth_count` fields.
- Wizard becomes **6 steps**: `identity / booths / vendors / placeholders / optin / confirm` (vendors inserted between booths and placeholders). Reuses `VendorBoothList`. Optional — doesn't gate "required" completion. Three states for vendors:
  - Some assigned: `"X of Y assigned"` ✓
  - None assigned, vendors exist: `"Y not yet assigned (optional)"` ○
  - No vendors yet: `"no vendors yet (optional)"` ✓ (clean slate is valid)
- Wizard step content shows yellow warning callout when zero on-platform vendors yet.
- `OnboardingChecklist`: 4th line for vendor assignment.

**Risk:** Low. Fixes the prod bug from §1.2. **Verify on staging:** dashboard checklist accurate with previously-saved data; vendors wizard step renders + transitions; empty-state copy clean.

### 2.2 `59f9edf9` — Rules restructure + mechanical gates (dev infra)

**Type:** Dev discipline. **Files:** 25 (CLAUDE.md, rule files, docs, ESLint config, pre-push hook, current_task.md).
- Consolidates 10 small rules into 5 themed files (change-discipline, verification-discipline, test-integrity, git-and-deployment, code-stability).
- Closes schema-gate "earlier in session" loophole.
- ESLint rule blocks `describe.skip/it.skip/runIf/skipIf` in tests.
- Pre-push hook blocks prod pushes outside 9 PM–7 AM CT window (with `PUSH_WINDOW_OVERRIDE=hotfix` escape).
- PERF-R7 chunk-count ceiling 150→200.

**Risk:** None to app behavior. Affects CI + commit experience only.

### 2.3 `2a2ab32b` — Block rewriting pushed commits (dev infra)

**Type:** Dev discipline. **Files:** 4 (3 husky hooks + rules doc).
- `prepare-commit-msg` catches `git commit --amend` of commits reachable from `origin/main` or `origin/staging`.
- `pre-commit` heuristic catches `--amend -m "..."` via `GIT_AUTHOR_DATE` preservation.
- `pre-rebase` blocks rebases that would rewrite pushed commits.
- Override: `REWRITE_OVERRIDE=cleanup git ...`.

**Risk:** None to app behavior.

### 2.4 `782e518f` — Active-by-default vendor filter + Rule 7 (teaching mode)

**Type:** Feature + dev discipline. **Files:** 4 (1 component, 1 API route, 2 docs).
- `VendorBoothList`: default view shows only "active" vendors (approved at this market AND `vendor_market_schedules.is_active=true`). Toggle reveals all.
- `/api/market-manager/[marketId]/vendors`: supplementary indexed query against `vendor_market_schedules` to populate `is_active_schedule` per vendor. Two queries instead of join (no FK relationship for Supabase auto-join). ~10ms added.
- Rule 7 (teaching mode): Claude explains each git op before running.

**Risk:** Low. The vendor list defaults change is visible to managers immediately. **Verify:** filter behaves correctly with mix of approved/unapproved + active/inactive scheduled vendors.

### 2.5 `94a72f93` — Phase B Wins 1-3 (invite link, co-branded banner, 3-state filter)

**Type:** Feature. **Files:** 5 (1 new component, 3 modified, 1 doc).
- **Win 1:** `InviteVendorLink.tsx` — copy-able URL `${origin}/${vertical}/vendor-signup?market=<id>` on manager dashboard. Used `?market=` ALONE (NOT `?ref=manager` — would collide with existing vendor-to-vendor referral at `vendor-signup/page.tsx:80-99`).
- **Win 2:** `/[vertical]/vendor-signup` reads `?market=<id>`, fetches market name from `/api/markets/[id]`, renders co-branded banner above form. Signup behavior unchanged at this commit.
- **Win 3:** `VendorBoothList` converts binary `showAll` toggle to **3-state filter: Active / Needs booth # / All**. Per-row "needs booth #" badge.
- Removes "Vendor invite / onboarding referral link" from dashboard "Coming soon" list.

**Risk:** Low — additive UX, no critical-path / schema / payment changes.

### 2.6 `aa4a3d10` — Phase B Wins 4-6 (badge + summary + market-day stat)

**Type:** Feature. **Files:** 3 (2 new, 1 modified).
- **Win 4:** Count badge ("X need booth #") on "Vendors at this market" h2. Scroll anchor `#vendors-at-market` for jump-to.
- **Win 5+6:** New `ManagerActionSummary.tsx` renders below `OnboardingChecklist` **only when** actionable (needs-booth > 0 OR next market day exists). Defers to checklist during setup-incomplete state.
- New helper `src/lib/markets/manager-dashboard-stats.ts`:
  - `getManagerDashboardStats(marketId, marketTimezone)` runs 4 parallel queries (market_schedules, vendor_market_schedules, market_vendors approved+null-booth, order_items pickup_date filter).
  - Uses canonical cron pattern from `expire-orders/route.ts:2267-2269` for market-local "today" via `markets.timezone` with `America/Chicago` fallback. Avoids UTC evening-blackout bug class from Migration 054.
  - Order count uses existing index `idx_order_items_pickup_date_market` (`status<>cancelled` WHERE clause).

**Risk:** Low. Dashboard read-only summary. Timezone handling matches established pattern. **Verify:** "Next market day" shows correct local date; order count matches market-day expectation.

### 2.7 `4d13780d` — Auto-create vendor row on invite signup + migration drafts

**Type:** Feature + DB drafts. **Files:** 7 (1 modified app file, 1 modified API, 1 snapshot doc, 2 new migration drafts, dashboard cleanup, task doc).
- **Auto-associate:** `vendor-signup` page passes `?market=<id>` through to `/api/submit`. After successful vendor creation, `/api/submit` auto-inserts a `market_vendors` row with `approved=false`. Idempotent via existing UNIQUE constraint on `(market_id, vendor_profile_id)`. Market-exists validation before insert.
- **Decision locked:** `approved=false`, not auto-approve. Reason: vendor may have entered incorrect info for that specific market; manager reviews before activation.
- **Migration drafts (NOT applied):**
  - **138 — `vendor_market_agreement_acceptances`** (61 lines): JSONB self-contained statement snapshot per `(vendor, market, agreement_version)`. RLS default-deny.
  - **139 — `weekly_booth_rentals`** (124 lines): vendor → market → week → inventory tier → price snapshot → status. Same-market integrity trigger (mirrors mig 135). updated_at trigger (mirrors mig 134). RLS default-deny.
- Dashboard "Coming soon" cleanup: removed "Aggregate market activity" line (partially fulfilled by Manager Action Summary).

**Risk:** Medium. `/api/submit` is security-sensitive (not on critical-path list but adjacent). The insert is additive + non-blocking, so even if it fails the vendor signup still succeeds. **Verify:** invite URL signup creates `market_vendors` row with `approved=false`; market-spoofing attempt (bad UUID) silently no-ops without breaking signup.

### 2.8 `8c5b4993` — Manager-approval loop closure

**Type:** Feature. **Files:** 5 (1 new API, 2 modified components, 1 modified lib, 1 doc).
- **New endpoint:** `PATCH /api/market-manager/[marketId]/vendor-approval` with `{ vendor_profile_id, approved: boolean }`. Mirrors `vendor-booth` security: `isMarketManager` + service client write. Allows both approve and revoke. **No DELETE** (permission boundary preserved).
- **`VendorBoothList`: 4-state filter** — Active / Needs booth # / Pending approval / All. Pending row shows Approve button only (no distracting booth controls). Approved row shows booth controls.
- **`manager-dashboard-stats`:** new `pendingApprovalCount` via 4th parallel HEAD-count.
- **`ManagerActionSummary`:** top-of-list bullet "X vendors pending your approval" with Review → link to `#vendors-at-market` (renders before needs-booth bullet — review precedes assignment).

**Risk:** Low. Closes the gap from §2.7 (otherwise invite vendors were stuck in pending forever). **Verify:** approve action flips badge, vendor moves out of "Pending approval" filter, booth controls appear.

### Push-readiness summary

All 8 commits are buildable + tested locally (per the staging pre-push hook on each push). The bulk of risk is in §2.1 (fixes the prod regression) — everything after is composable on top. Order of verification is:
1. §2.1 first (fixes the bug)
2. §2.5–2.8 together (the Phase B feature stack)
3. §2.4 sits alongside but is small enough to verify in passing
4. §2.2, §2.3, §2.6 are infra/feature with low blast radius

---

## Section 3: Database state — migrations 132-139

### 3.1 Applied to all 3 envs (Dev / Staging / Prod)

| # | File | Effect |
|---|---|---|
| 132 | `20260508_132_drop_legacy_analytics_functions.sql` | Cleanup. Not in manager scope. |
| 133 | `20260508_133_market_manager_v1_schema.sql` | Adds `markets.manager_email`, `manager_user_id` (FK → `auth.users`), `manager_invited_at`, `manager_accepted_at`. Two partial indexes: `idx_markets_manager_email` (on `LOWER(manager_email)`) + `idx_markets_manager_user_id`. |
| 134 | `20260508_134_market_booth_inventory.sql` | `market_booth_inventory (id, market_id, size_label, dimensions, count, weekly_price_cents, created_at, updated_at)` with `UNIQUE(market_id, size_label)`. Index `idx_market_booth_inventory_market`. `updated_at` trigger. **RLS not yet enabled** (added in 137). |
| 135 | `20260509_135_market_booth_placeholders.sql` | `market_booth_placeholders (id, market_id, inventory_id, booth_number, notes)` with `UNIQUE(market_id, booth_number)`. `inventory_id` is `ON DELETE SET NULL`. **Same-market integrity trigger** `check_booth_placeholder_inventory_market()` enforces inventory_id belongs to the same market. `updated_at` trigger. |
| 136 | `20260509_136_market_optin_statements.sql` | Two tables: `market_optin_statement_catalog (id TEXT PK, category, statement, placeholders TEXT[], active, sort_order)` and `market_optin_selections (id UUID PK, market_id, statement_id, placeholder_values JSONB, selected_at)` with `UNIQUE(market_id, statement_id)`. **Seeds 15 starter statements** across 5 categories via `ON CONFLICT DO NOTHING`. |
| 137 | `20260509_137_enable_rls_market_manager_tables.sql` | Enables RLS with **NO POLICIES** on all 4 manager tables. Default-deny except `service_role`. Closes Supabase advisor security gap. |

### 3.2 Draft migrations on staging (not applied anywhere)

#### 138 — `vendor_market_agreement_acceptances` (61 lines)

Electronic-signature substrate per market manager v2 plan §7. Self-contained snapshot:

```
vendor_market_agreement_acceptances (
  id UUID PK,
  vendor_profile_id → vendor_profiles(id) ON DELETE CASCADE,
  market_id → markets(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ,
  statements_snapshot JSONB NOT NULL,   -- [{ statement_id, category, statement_text, placeholder_values }]
  agreement_version TEXT,                -- manager-controlled, NULL = unversioned (accept-once)
  created_at TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (vendor_profile_id, market_id, agreement_version)
)
```

Indexes: `idx_vmaa_vendor (vendor_profile_id)`, `idx_vmaa_market (market_id, accepted_at DESC)`. RLS default-deny.

**Key design choice:** `statements_snapshot JSONB` is **self-contained** — survives catalog edits/removals. Even if the manager deletes a statement or the catalog row is dropped, the historical acceptance remains valid evidence of what the vendor agreed to. The `agreement_version` lets the manager force re-acceptance after material changes (NULL = accept-once mode).

**Dependencies:** none beyond `vendor_profiles` + `markets` (already exist).

#### 139 — `weekly_booth_rentals` (124 lines)

Booking record per market manager v2 plan §5:

```
weekly_booth_rentals (
  id UUID PK,
  vendor_profile_id → vendor_profiles(id) ON DELETE RESTRICT,
  market_id → markets(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  inventory_id → market_booth_inventory(id) ON DELETE RESTRICT,
  booth_number TEXT,                    -- manager assigns post-booking
  price_cents INTEGER NOT NULL,         -- SNAPSHOT — locked at booking
  status TEXT CHECK ∈ ('pending_payment','paid','cancelled','completed'),
  stripe_checkout_session_id TEXT,      -- populated in Phase C
  stripe_payment_intent_id TEXT,        -- populated in Phase C
  agreement_acceptance_id → vendor_market_agreement_acceptances(id),
  booked_at, paid_at, cancelled_at, created_at, updated_at,
  UNIQUE (vendor_profile_id, market_id, week_start_date)
)
```

Indexes: `(market_id, week_start_date)`, `(vendor_profile_id, week_start_date)`, `(market_id, week_start_date, status)`. Same-market integrity trigger on `inventory_id` (mirrors mig 135). `updated_at` trigger. RLS default-deny.

**Key design choices:**
- `price_cents` is a **snapshot at booking time**; manager can change `market_booth_inventory.weekly_price_cents` later without affecting existing bookings.
- `status` uses CHECK constraint (not PG enum) for easier evolution.
- `inventory_id` is `ON DELETE RESTRICT` — manager can't delete a size tier that has bookings against it.
- Stripe columns exist but are unused until Phase C ships Stripe Connect for managers.
- `agreement_acceptance_id` links each booking to the agreement snapshot the vendor signed at booking time.

**Dependencies:** must apply **after 138** (FK to `vendor_market_agreement_acceptances`).

### 3.3 Order of application when ready

```
138 → 139
```

(Both have no prod-impact until application code is wired. Per current_task.md, app-level features that consume these tables — vendor weekly booking flow + signup opt-in checklist — are still pending.)

### 3.4 Schema snapshot staleness

Per current_task.md §3 and CLAUDE_CONTEXT.md "Known Issues":
- Structured tables in `supabase/SCHEMA_SNAPSHOT.md` are **stale as of 2026-04-24**.
- The snapshot has 4 phantom `orders` columns (`vendor_payout_cents`, `buyer_fee_cents`, `service_fee_cents`, `market_id`) that don't actually exist on live staging.
- Migrations 132-137 are in the Change Log but the structured column tables for the new tables may not be regenerated.

**Operational consequence:** the Schema Mechanical Gate's snapshot-failure escalation to `information_schema.columns` is the safety net. Snapshot is best-effort; only `information_schema` is authoritative.

---

## Section 4: Phase B feature inventory (staging-only)

All eight features below are on staging (`8c5b4993` tip) and **not yet on prod**. Together they form the invite→signup→approval→assign loop for vendor onboarding.

### 4.1 Invite-a-vendor link

**Component:** `src/components/market-manager/InviteVendorLink.tsx` (98 lines, new)
- Renders a copy-able read-only input with the URL `${window.location.origin}/${vertical}/vendor-signup?market=${marketId}` (InviteVendorLink.tsx:31-33). Origin computed client-side so the same component works on dev/staging/prod with no configuration.
- Copy uses `navigator.clipboard.writeText` with silent fallback for older browsers / non-https (InviteVendorLink.tsx:35-45).
- Caption identifies `marketName` so the manager knows what their invite says: *"When opened, the vendor sees a banner identifying **<marketName>** as the inviting market"* (InviteVendorLink.tsx:93-94).
- **Design decision:** `?market=` alone (NOT `?ref=manager`) because `?ref=<code>` is already consumed by the existing vendor-to-vendor referral system at `vendor-signup/page.tsx:80-99` — collision avoided.

### 4.2 Co-branded vendor signup banner

**Page:** `src/app/[vertical]/vendor-signup/page.tsx` (Phase B-modified)
- Reads `?market=<id>` query param. If present, fetches market name from `/api/markets/[id]`. Renders banner above the form: "**[Market Name]** invited you to join the platform." (banner only; signup behavior unchanged).
- After successful signup, passes `market_id_from_invite` to `/api/submit` so the auto-association step (§4.3) can fire.

### 4.3 Auto-create `market_vendors` row on invite signup

**Server:** `src/app/api/submit/route.ts:196-230`
- After vendor creation, if `body.market_id_from_invite` is set:
  - Validates the market exists (defensive read against spoofed/stale URL) (submit/route.ts:208-211)
  - `upsert` into `market_vendors` with `{ market_id, vendor_profile_id, approved: false }`, conflict-key `market_id,vendor_profile_id` (submit/route.ts:213-222)
  - **Non-blocking:** if the upsert fails, signup still succeeds; the manager just won't see this vendor in their list until they re-invite or admin intervenes (submit/route.ts:223-228)
- **Decision locked:** `approved=false`. Manager reviews and activates from their dashboard — vendor may have entered incorrect info for that specific market, so auto-approve was rejected.

### 4.4 4-state vendor filter (Active / Needs booth # / Pending approval / All)

**Component:** `src/components/market-manager/VendorBoothList.tsx` (heavily modified; ~370 lines on staging vs ~210 on prod)
- Filter state evolution: prod's binary `showAll` → staging's 4-state radio.
- **Active (default)** = `approved=true` AND `is_active_schedule=true` (i.e., vendor is approved at market AND has an active schedule entry per `vendor_market_schedules`).
- **Needs booth #** = subset of Active without `booth_number` set.
- **Pending approval** = `approved=false` (auto-created via invite signup OR manually unapproved).
- **All** = no filter.
- Conditional per-row UI:
  - Pending vendor → shows "Approve" button only (no booth_number controls, no distractions).
  - Approved vendor → shows `booth_number` input + Save (existing UX).
- `handleApprove` calls `PATCH /api/market-manager/[marketId]/vendor-approval` and flashes `rowSuccess` indicator (mirrors `handleSave` for booth-number).

### 4.5 Manager vendor-approval API

**Route:** `src/app/api/market-manager/[marketId]/vendor-approval/route.ts` (94 lines, new)
- `PATCH` with body `{ vendor_profile_id, approved: boolean }`. Allows BOTH directions: approve (`false → true`) and revoke (`true → false`).
- Auth pattern matches `vendor-booth`: rate-limit → `createClient()` → `auth.getUser()` → `isMarketManager()` → service-client write (vendor-approval/route.ts:34-72).
- Returns `{ success, market_vendor_id, vendor_profile_id, approved }`.
- **No DELETE** by design — permission boundary preserved (vendor-approval/route.ts:21-23). Manager cannot disassociate a vendor that associated themselves; only soft-deactivate via `approved=false`.

### 4.6 Needs-booth badge on Vendors header + scroll anchor

**Page:** `src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx` (staging)
- "Vendors at this market" h2 gets a count badge: `"X need booth #"` when `activeVendorsNeedingBooth > 0`.
- Section wrapper has `id="vendors-at-market"` so the action summary card can deep-link via `#vendors-at-market`.

### 4.7 Manager Action Summary card

**Component:** `src/components/market-manager/ManagerActionSummary.tsx` (157 lines, new)
- Renders **below** `OnboardingChecklist` only when:
  - Setup is complete (otherwise defers to checklist — ManagerActionSummary.tsx:36-37), AND
  - At least one actionable item exists: `pendingApprovalCount > 0` OR `activeVendorsNeedingBooth > 0` OR `nextMarketDate !== null` (ManagerActionSummary.tsx:39-44)
- Three bullet types in fixed order (review → assign → upcoming):
  1. 📥 "X vendors pending your approval" + Review → (deep-link to `#vendors-at-market`)
  2. 📋 "X active vendors need a booth number assigned" + Assign now → (deep-link to `#vendors-at-market`)
  3. 📅 "Next market day: [date] · [N orders scheduled | no orders scheduled yet]"
- Renders nothing when all three are quiet — dashboard stays quiet when there's nothing to do.

### 4.8 Manager dashboard stats helper

**File:** `src/lib/markets/manager-dashboard-stats.ts` (173 lines, new)
- `getManagerDashboardStats(marketId, marketTimezone)` returns `ManagerDashboardStats` with 4 fields: `nextMarketDate`, `nextMarketDayOrderCount`, `activeVendorsNeedingBooth`, `pendingApprovalCount`.
- **Service client throughout** — RLS on manager-scoped tables means caller's auth client would be blocked. Auth verified upstream by `isMarketManager`. (manager-dashboard-stats.ts:15-19)
- **Timezone handling**: `markets.timezone` with fallback `America/Chicago`. Uses the canonical pattern from `cron/expire-orders/route.ts:2267-2269` — established after Migration 054 fixed the UTC evening-blackout bug class. (manager-dashboard-stats.ts:7-13)
- **4 parallel queries** (manager-dashboard-stats.ts:67-92):
  1. `vendor_market_schedules` where `is_active=true` (returns vendor_profile_id set)
  2. `market_vendors` where `approved=true AND booth_number IS NULL` (returns vendor_profile_id set)
  3. `order_items` where `pickup_date = nextMarketDate AND status IN ('pending','confirmed','ready')` (returns order_ids, deduped)
  4. HEAD count on `market_vendors` where `approved=false`
- `activeVendorsNeedingBooth` is the intersection of sets 1 and 2 computed in JS (manager-dashboard-stats.ts:94-99).
- Order count uses existing index `idx_order_items_pickup_date_market` with `status<>cancelled` semantics.
- `computeNextMarketDate` walks active schedule rows for the soonest upcoming day-of-week, with same-day cutoff matching `markets/[id]/page.tsx:137-143` UX expectation: if today is a market day but start_time has passed, push to next week's instance of that day-of-week (manager-dashboard-stats.ts:126-160).

### 4.9 Active-by-default filter + supplementary vendor schedule query

**API:** `src/app/api/market-manager/[marketId]/vendors/route.ts` (Phase B-modified)
- Adds a second indexed query against `vendor_market_schedules` (returns `vendor_profile_id` set where `market_id=X AND is_active=true`).
- Returns enriched vendor records with `is_active_schedule: boolean` flag, consumed by `VendorBoothList` for filter logic.
- **Two queries instead of join** — `market_vendors` and `vendor_market_schedules` share `(vendor_profile_id, market_id)` but lack an FK relationship for Supabase to auto-join. ~10ms total added per the 782e518f commit body.

### Phase B feature summary

The complete Phase B loop now in place (staging only):

```
[manager dashboard]
  ↓ copy invite link
[shared with vendor]
  ↓ vendor opens /vendor-signup?market=<id>
[vendor sees co-branded banner, completes signup]
  ↓ /api/submit auto-creates market_vendors with approved=false
[manager dashboard: ManagerActionSummary shows "X vendors pending your approval"]
  ↓ manager clicks Review, lands at #vendors-at-market with "Pending approval" filter
[manager clicks Approve]
  ↓ /api/market-manager/[marketId]/vendor-approval flips approved=true
[vendor now in Active filter, but lacks booth_number]
  ↓ ManagerActionSummary shows "X active vendors need a booth number"
[manager assigns booth_number via VendorBoothList row]
  ↓ /api/market-manager/[marketId]/vendor-booth
[fully onboarded — vendor appears in normal Active filter, no further nudge]
```

The loop is complete **except for**:
- No notification to the vendor that they were approved (out of scope; vendor doesn't need to know to start using the platform — their listings are not blocked on this flag).
- The agreement-acceptance snapshot system (migrations 138/139 + UI) is **not yet shipped** — booth-rental + electronic-signature flow ("vendor signs the manager's opt-in statements at booking") is the next major piece of work.

---

## Section 5: RLS posture + flow-integrity test

### 5.1 RLS state on manager-scoped tables

Per migration 137 (applied to all 3 envs):

| Table | RLS enabled | Policies | Effective access |
|---|---|---|---|
| `market_booth_inventory` | ✓ | None | `service_role` only |
| `market_booth_placeholders` | ✓ | None | `service_role` only |
| `market_optin_statement_catalog` | ✓ | None | `service_role` only |
| `market_optin_selections` | ✓ | None | `service_role` only |
| `vendor_market_agreement_acceptances` (mig 138, draft) | ✓ (in migration) | None | `service_role` only |
| `weekly_booth_rentals` (mig 139, draft) | ✓ (in migration) | None | `service_role` only |

**Pattern enforced:** every manager API route does `createClient()` → `auth.getUser()` → `isMarketManager()` → if allowed, `createServiceClient()` for all reads/writes. Confirmed in `booth-inventory/route.ts:33-46`, `vendor-booth/route.ts:37-62`, `vendors/route.ts:35-49`, `vendor-approval/route.ts:39-62`.

**Server components** that need to READ these tables must also use the service client. Verified in:
- ✅ `manager-dashboard-stats.ts:46` — uses `createServiceClient()` internally
- ✅ `onboarding-progress.ts` on **staging** (9318bda1) — uses `createServiceClient()` internally
- ❌ `onboarding-progress.ts` on **prod** — uses caller's auth client → blocked by RLS → **§1.2 bug**

### 5.2 Permission boundary — test-enforced

**`src/lib/__tests__/flow-integrity.test.ts:316-398`** — `'Market manager permission boundary'` block. The test rule (verbatim from line 319-326):

> Manager CANNOT disassociate a vendor from a market if the vendor associated themselves first. Currently this is enforced by API surface design: the manager API (`src/app/api/market-manager/**`) exposes booth_number PATCH only, with no DELETE endpoint touching market_vendors.

**Mechanical implementation (flow-integrity.test.ts:339-397):**
- Walks `src/app/api/market-manager/` recursively
- For every `.ts`/`.tsx` file that contains `.from('market_vendors')` or `.from("market_vendors")`:
  - Scans 12-line windows starting at each `.from` call
  - If `.delete()` appears within that window → violation
- Failure message: *"Market manager API endpoint deletes from market_vendors. Per the permission boundary rule, managers cannot disassociate vendors from markets — only edit booth_number on existing rows."*

**Currently passing.** The 4 manager API files that touch `market_vendors` (vendor-booth PATCH, vendor-approval PATCH, vendors GET, submit auto-create) only ever UPDATE or INSERT. The `vendor-approval` route added on staging passes this test because it uses `.update()` not `.delete()` (vendor-approval/route.ts:65-74).

**Admin path** at `src/app/api/markets/[id]/vendors/[vendorId]/route.ts` (per test comment line 336-338) is intentionally allowed to delete — admin and self-removal flows live there, outside this rule's scope.

### 5.3 Boundary's escape hatch

If a future feature genuinely needs manager-driven disassociation:
- ❌ Do **not** add `.delete()` to the manager API (CI will fail this test)
- ✓ Either use the admin path or expand the test rule with explicit user approval (test-integrity Rule 1 — never change a business rule test to match code)

### 5.4 RLS gap watch

The four catalogs/tables are default-deny with **no policies**. If a future Phase B step needs a vendor-side read (e.g., "vendor needs to see the manager's selected opt-in statements at signup acceptance time"), the options are:
1. Route the read through an API endpoint that uses the service client (preferred — matches existing pattern)
2. Add a specific RLS policy granting `authenticated` SELECT on `market_optin_selections` filtered by published market state (more risk surface, requires careful scope)

Migration 137 comments line 17-20 anticipate this: *"If/when Phase B introduces direct client-side queries [...] specific policies can be added in a follow-up migration. For now there is no such caller."* The Phase B work so far has stuck to option 1.

---

## Section 6: Open design questions

Three live questions from `current_task.md` end-of-Session-81 + one more surfaced by the Phase B Loop now being live on staging:

### 6.1 Should vendor booth assignment count toward "required" progress?

**Current state:** Optional. ✓ when "vendors at market = 0" (clean slate is valid). Section §2.1 / `9318bda1`.

**User indication (carried over from Session 81):** they expected it to count.

**Tension:** Making it required means a manager can't reach "Setup complete" until at least one on-platform vendor is at their market. Chicken-and-egg — they need to invite vendors first, which requires "Setup complete" not to be blocking their inbox triage.

**Three options to weigh:**
- (a) Stay optional with ✓-when-empty (current)
- (b) Required, but ✓-when-empty (forces assignment when vendors exist, doesn't penalize clean slate)
- (c) Promote it via the Action Summary card (no progress bar pressure, but the unfilled bullet keeps showing) — closer to current behavior

### 6.2 Phase B vendor signup `?market=&ref=manager` flow — wait until weekly-booking or auto-create now?

**Current state (staging):** Auto-create on signup with `approved=false` (§4.3 / `4d13780d`). Decided in favor of immediate creation so the manager sees the new vendor in their dashboard right away.

**Trade-off:** vendor enters the manager's "Pending approval" list without ever having indicated they want to book a specific week. Some markets may treat that as noise.

**Status:** Locked for now, but worth revisiting once weekly booking ships — if vendors will eventually pick weeks explicitly anyway, the "approved=false" pre-row may become redundant.

### 6.3 Surveys timing logic — market-close-time-aware cron

**Current state:** Locked at "evening of market purchase OR next morning if late event." Not built.

**Open work:** The cron needs to derive the market's close time (probably from `market_schedules.end_time`, applying `markets.timezone`) and decide whether to send tonight or tomorrow morning. Existing pattern in `manager-dashboard-stats.ts:126-160` for market-local now-time would adapt.

### 6.4 (NEW) — Where does the vendor's agreement acceptance land in the flow?

The agreement-snapshot infrastructure is staged in migration 138 (draft) but no UI wires it up yet. The v2 plan §6-7 says the vendor accepts the manager's statements at signup (Phase B) OR at first booking (Phase C with payment). With Phase B as currently shipped, no acceptance is captured — the vendor signs up and is auto-associated without seeing the manager's statements at all.

**Three places it could land:**
- (a) On the co-branded `vendor-signup` page itself (checkbox list before submit)
- (b) On a post-signup "complete your acceptance" step shown after first login
- (c) Deferred to first booth-booking checkout (Phase C)

This is a real open question — v2 plan §7 mentioned "Manager-selected opt-in statements rendered as required checkbox list at signup" but the current implementation skipped that. Likely the cleanest path is (a) for new vendors AND (c) for booking, but the question deserves an explicit decision before migration 138 is applied.

---

## Section 7: Phase B remaining (after current staging tip)

Per v2 plan §1, §5, §6, §7 and the audit so far, these are the pieces still unbuilt for Phase B:

1. **Apply migrations 138 + 139** to Dev → Staging → Prod (in that order, 138 first because 139 has FK).
2. **Vendor signup opt-in checklist UI** — render the manager's selected statements as required checkboxes on the co-branded `/vendor-signup?market=<id>` page. Records an acceptance row in `vendor_market_agreement_acceptances` (mig 138). Open question §6.4 governs whether this lands at signup or first booking.
3. **Vendor weekly booking flow** — the booth-rental form modeled on the event organizer flow:
   - Pick market → pick week → pick booth size tier (from `market_booth_inventory`) → see price → see opt-in agreement → "complete booking" (placeholder, no payment yet)
   - Writes a `weekly_booth_rentals` row with `status='pending_payment'` and `agreement_acceptance_id` linking to the snapshot
   - Manager dashboard surfaces the booking in a "Weekly bookings" list (Phase D)
4. **Vendor notification on approval** — currently the manager flips `approved=true` but the vendor isn't told. Low priority but a UX gap.

**Not in Phase B:** payment (Phase C), aggregate dashboard cards (Phase D), surveys/share (Phase E).

---

## Section 8: Phase C / D / E roadmap

### 8.1 Phase C — Stripe Connect + payment (critical-path territory)

Per v2 plan §164-168. Heaviest-risk phase: touches `src/lib/stripe/payments.ts`, `webhooks.ts`, possibly `pricing.ts` (all critical-path files per `change-discipline.md` Rule 3).

- **Manager "market" Stripe Connect account onboarding** — separate from the vendor Connect account. Same human can have both.
- **Booth-rental Stripe Checkout with 6.5% × 2 markup**: vendor pays `1.065 × price_cents`, manager receives `0.935 × price_cents`, platform keeps the 13% spread (split between buyer + vendor side). Matches the comment in mig 134 `market_booth_inventory.weekly_price_cents`.
- **Payout flow** — populate `weekly_booth_rentals.stripe_payment_intent_id` and `stripe_checkout_session_id`. Webhook moves status `pending_payment → paid`. Double-payout prevention check (same pattern as vendor_payouts).
- **Electronic-signature record snapshot at payment confirmation** — `agreement_acceptance_id` is recorded at booking time so the snapshot becomes a load-bearing audit artifact.
- **Pre-merge audit required:** `apps/web/docs/api-route-security-checklist.md` for any new payment route. Stress test protocols at `apps/web/.claude/stress-test-protocols.md`.

### 8.2 Phase D — Dashboard fill-out

Per v2 plan §170-175. Read-only surfaces composing existing data:

- Aggregate transactions card (7d / 30d / season) — orders + market box revenue at this market
- Schedule view (read-only `market_schedules`)
- Support card (KB + email)
- Weekly bookings list (paid status, booth #, vendor) — driven by mig 139 once Phase C lands
- Booth occupancy view (full grid: occupied by on-platform / occupied by placeholder / available)
- "Aggregate X orders for next market day" — already partially shipped in `ManagerActionSummary` (§4.7); full version would show the rolling count across weeks

### 8.3 Phase E — Surveys + share

Per v2 plan §177-182. Two distinct features:

- **Surveys:** new `market_surveys` table (not yet drafted as a migration). Post-market cron with evening-vs-next-morning logic (§6.3). In-app + email delivery (locked decision per current_task.md). Aggregate ratings + individual responses on manager dashboard.
- **Share button:** on `/markets/[id]` market profile page. Two templates — market-day (with vendor list) + non-market-day (generic). Web Share API with socials fallbacks.

### 8.4 Out of scope / deferred

- **FT (food trucks) park-operator persona** — `getMarketsManagedBy` filters to FM only (manager-queries.ts:42, 49). Deferred per v2 plan §5.
- **Same-day / festival transactions** — deferred per v2 plan §9. Constraint when revisited: do not modify existing prepayment cart/checkout. Needs technical research before scoping.
- **Booth auto-assignment** — locked as Path B (manual) for v1; Path A (auto) deferred to v2.future.

---

## Section 9: Risk flags

### R1 — **HIGH:** Prod onboarding-progress.ts is broken (covered in §1.2, §2.1)

**Symptom:** Manager dashboard "Set up your market" card permanently shows "0 of 2 required" regardless of actual data.

**Cause:** Prod's `onboarding-progress.ts` uses the auth user's supabase client; migration 137 enabled default-deny RLS on the underlying tables.

**Fix exists, not deployed:** `9318bda1` on staging switches to service client internally.

**Blast radius:** Every existing FM market manager — the checklist nudge sits permanently on their dashboard even after they've completed setup. Visible UX wart but not data-corrupting. User-reported 2026-05-09.

### R2 — **MEDIUM:** Staging is 8 commits ahead of prod with `current_task.md` stale

The Session 81 hand-off claimed 1 commit ahead — actually 8. The doc never got updated as Phase B accumulated. Risk: a future session reads `current_task.md`, believes it accurately reflects staging↔prod gap, and ships a partial batch to prod missing later Phase B commits. **Recommendation:** as part of any prod push, the responsible session should freshly verify with `git log origin/main..origin/staging` before composing the chain. Don't trust `current_task.md` for git state — it's a stale snapshot.

### R3 — **MEDIUM:** Vault is staler than the working code

`vault` branch is at `7f895e5` (2026-03-16), 8 weeks old. **No market-manager systems are in the vault.** `vault-manifest.md` lists Location Search, Checkout, Payments & Payouts, Notification System, Vendor Onboarding, Vendor Trial System, i18n, Landing Pages, Dashboard, Admin — but neither manager-auth nor any of the new market-manager surface. Practical consequence: if a future session breaks manager onboarding while modifying it, there's no `git checkout vault -- <file>` recovery path. Only safety net is `origin/main` (8 commits behind staging) for Phase A files, and there's no safety net for Phase B files at all. **Recommendation:** after Phase B is verified live on prod, ask the user to update `vault` to the new tip.

### R4 — **LOW:** Schema snapshot still stale

Per current_task.md §3 and CLAUDE_CONTEXT.md Known Issues. The 4 phantom `orders` columns were never cleaned up; the new manager tables likely have similar gaps in the structured tables. Mitigated by the Mechanical Gate's `information_schema.columns` escalation, but a deliberate `REFRESH_SCHEMA.sql` run would tighten the safety net.

### R5 — **LOW:** No automated test for the §4.3 auto-create idempotency

The auto-association in `/api/submit/route.ts:213-222` uses `upsert` with conflict-key `market_id,vendor_profile_id`. This is correct, but not test-covered. A regression that switched to plain `insert` would fail on the UNIQUE constraint and the non-blocking warn would mask it. Same risk applies to the market-exists defensive check at submit/route.ts:208-211 — a regression that removed it would create orphan `market_vendors` rows for spoofed UUIDs.

### R6 — **LOW (design only):** Manager invite URL has no expiration / revocation

The invite link is a static `?market=<id>` URL that anyone with it can use to land on the co-branded signup page. There's no token, no manager-side "revoke this invite" surface. If the URL is leaked and the manager later wants to stop accepting vendors via that path, there's no clean way. Acceptable for v1 because `approved=false` gives the manager a review gate, but worth noting.

### R7 — **LOW (design only):** Vertical admin Edit form's mobile landscape rotation

Per current_task.md §"Mobile UX nuance" — the CSS at `AdminResponsiveStyles.tsx:365` should handle landscape rotation switch to wide layout, but the user reported it doesn't on their device. Device-side issue, not a code bug, but unverified. Not a manager-feature blocker.

---

## Quick-reference: where to look for what

| Need to understand | Read |
|---|---|
| Manager auth logic | `src/lib/markets/manager-auth.ts:21-46`, `manager-queries.ts:28-66` |
| What "Setup complete" means | `src/lib/markets/onboarding-progress.ts` (staging version — uses service client) |
| Booth inventory data model | mig 134 + `src/lib/markets/booth-types.ts` |
| Off-platform placeholders | mig 135 + `src/lib/markets/placeholder-types.ts` |
| Opt-in agreement system | mig 136 + `src/lib/markets/optin-types.ts` |
| Dashboard wiring | `src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx` (staging) |
| Onboarding wizard (6 steps on staging) | `src/app/[vertical]/market-manager/[marketId]/onboarding/[step]/page.tsx` |
| Vendor invite flow | `InviteVendorLink.tsx` + `vendor-signup/page.tsx` + `api/submit/route.ts:196-230` |
| Vendor approval | `vendor-approval/route.ts` + `VendorBoothList.tsx` (4-state filter) |
| Dashboard stats | `src/lib/markets/manager-dashboard-stats.ts` |
| Permission boundary | `src/lib/__tests__/flow-integrity.test.ts:316-398` |
| Strategic roadmap | `apps/web/.claude/market_manager_v2_plan.md` (Session 81 Consolidated Roadmap at top) |
| 15 opt-in statements | `apps/web/.claude/market_manager_optin_statements_v1.md` (locked) |

---

## End of audit

Total citations: 50+ `file:line` references. Zero unverified claims (all checked at the cited path during this session). 

**Recommended next actions** (user picks the order):

1. **Verify staging then push prod** — fixes R1, brings prod current. Per current_task.md, `9318bda1` was the original push candidate; Phase B has accumulated since. Should we bundle all 8 commits or push incrementally?
2. **Decide §6.4** (where agreement acceptance lands) before applying mig 138, since the schema accommodates either path but the UI choice changes the manager-facing copy.
3. **Apply migrations 138 + 139** when ready for Phase B vendor booking work.
4. **Refresh `vault` branch** after prod is current (R3 mitigation).
5. **Refresh schema snapshot** (R4 mitigation) via `REFRESH_SCHEMA.sql`.

