# Session 83 — Market Manager Comprehensive Code Audit

**Started:** 2026-05-17
**Mode:** Report (no code changes)
**Method:** Incremental Research Protocol. Every claim cites `path:line` from a fresh read.
**Scope:** All `src/lib/markets/*`, `src/app/api/market-manager/**`, `src/components/market-manager/**`, manager pages, vendor-side booking flow, Stripe critical-path pieces, mig 133–141, flow-integrity test.

---

## Files read (45)

- **Lib (10):** manager-auth, manager-queries, onboarding-progress, manager-dashboard-stats, booth-types, placeholder-types, optin-types, optin-public, agreement-version, vendors-with-listings.
- **API (15 manager + 4 vendor + 1 admin + 1 public):** booth-inventory (+id), booth-placeholders (+id), optin/catalog, optin/selections, vendors, vendor-booth, vendor-approval, vendor-docs, logo, branding, stripe/onboard, stripe/status, weekly-rental/[rentalId], plus vendor/markets/[id]/book + join + agreement-status, plus admin/markets/[id]/manager, plus markets/[id]/optin-public.
- **Components (18):** all `src/components/market-manager/*` + BookBoothForm.
- **Pages (5):** dashboard, onboarding (landing + step), vendor-docs, market-manager-program; plus vendor-side `/markets/[id]/book`.
- **Migrations (8):** 133, 134, 135, 137 (applied/); 138, 139, 140, 141 (pending). Mig 136 inferred from 137's reference + types.
- **Tests (1):** flow-integrity.test.ts manager-permission-boundary block.
- **Public:** markets/[id] page logo + disclaimer wiring.

---

## NEW gaps discovered (not on backlog.md or current_task.md)

### G1 — CRITICAL: Race condition in booth-booking availability check
**Where:** `src/app/api/vendor/markets/[id]/book/route.ts:217-242`
**What:** The availability check (`takenThisWeek` HEAD count) and the rental row INSERT are NOT atomic. Two vendors hitting `/book` concurrently can both pass the "remaining > 0" check and both insert rows. The UNIQUE constraint `(vendor_profile_id, market_id, week_start_date)` blocks only the SAME vendor double-booking — it does NOT prevent two DIFFERENT vendors from overbooking the same size on the same week.
**Impact:** Manager ends up with more paid rentals than inventory.count. Vendor pays via Stripe; refund-and-explain falls on the manager.
**Fix shape:** Wrap in a Postgres function (`book_weekly_booth` RPC) that takes a row-level advisory lock on `(market_id, inventory_id, week_start_date)`, counts, and inserts atomically. Same pattern as `atomic_decrement_inventory`. ~30 LOC migration.
**Severity:** HIGH — real money at stake; will hit once two vendors race on a desirable week.

### G2 — REAL BUG: Vendor sees wrong price on booking form
**Where:** `src/components/vendor/BookBoothForm.tsx:373-385`
**What:** The form's "You'll be charged" headline displays the **base** `weekly_price_cents` from inventory (e.g., $25). Stripe Checkout then charges `vendorPaysCents` = round(base × 1.065) = $26.63.
**Impact:** Vendor sees one number, gets charged another. Will generate support tickets and erode trust on every booking.
**Fix shape:** Pass `calculateBoothRentalFees(weekly_price_cents).vendorPaysCents` into the form's price display when manager has Stripe ready (`stripe_charges_enabled`). Show base price + 6.5% breakdown so the user understands the markup. The marketing page (market-manager-program/page.tsx:289-292) already discloses this; the booking flow should too.
**Severity:** HIGH — user-visible misrepresentation of price.

### G3 — REAL BUG: BoothInventoryManager DELETE lies about side effects
**Where:** `src/components/market-manager/BoothInventoryManager.tsx:492` (confirm dialog message)
**What:** Confirm dialog says *"This does not affect any vendor booth assignments."* But mig 139's `weekly_booth_rentals.inventory_id` is `ON DELETE RESTRICT`. If any pending/paid rental references the tier, the Postgres throws 23503 (FK violation). The API handler (`booth-inventory/[inventoryId]/route.ts:148`) doesn't translate 23503 to a friendly 409 — manager sees a vague "Delete failed".
**Impact:** Manager gets a confusing error when trying to remove a size that has bookings. Worse: the dialog implicitly promises it's safe to delete.
**Fix shape:** (a) Update DELETE handler to catch `error.code === '23503'` and return 409 with "This size has X active bookings — cancel them or wait for completion before removing". (b) Update confirm message to mention "Cannot remove sizes with active bookings". (c) Optionally pre-check booking count in the component before showing confirm.
**Severity:** MEDIUM — affects manager UX; no data corruption.

### G4 — REAL BUG: `window.confirm` on mobile blocks logo removal
**Where:** `src/components/market-manager/MarketBrandingCard.tsx:118`
**What:** Uses `confirm('Remove the current logo?...')`. Native `window.confirm` is blocked on mobile per the project's mobile-dialog rule. `BoothInventoryManager` and `BoothPlaceholderManager` correctly use `<ConfirmDialog>` — this one was missed.
**Impact:** Mobile managers cannot remove a logo. Tap → nothing happens.
**Fix shape:** Swap `confirm()` for `<ConfirmDialog>` — same pattern as the other two files.
**Severity:** MEDIUM — affects mobile UX on one specific action.

### G5 — REAL BUG: No UI to revoke a vendor's approval
**Where:** `src/components/market-manager/VendorBoothList.tsx:315` only renders the Approve button when `!v.approved`.
**What:** The vendor-approval API (`vendor-approval/route.ts:17-19, 67-74`) supports both directions — approve AND revoke. Comment explicitly documents revoke is allowed. But the manager UI has no path to call it with `approved: false`. The only way to revoke is via DB.
**Impact:** Manager can't deactivate a problem vendor without contacting support. Common operations request that the dashboard doesn't support.
**Fix shape:** Add a "Revoke" button next to "Save" for approved vendors. Confirm dialog warning that "the vendor's listings still appear but they're marked pending again." API already supports it.
**Severity:** MEDIUM — feature half-built; design intent stated in code but not exposed.

### G6 — REAL BUG: Mig 133 functional index unused
**Where:** Mig 133 creates `idx_markets_manager_email ON markets(LOWER(manager_email)) WHERE manager_email IS NOT NULL`. Query at `src/lib/markets/manager-queries.ts:48` uses `.ilike('manager_email', user.email)`. Postgres `ILIKE` does NOT use a `LOWER()` functional index.
**Impact:** Every authenticated FM dashboard load does a seq scan on `markets` (currently ~hundreds of rows, will grow). Mild perf cost today; will compound.
**Fix shape:** Either (a) change query to `.eq('manager_email', user.email.toLowerCase())` — uses the functional index because all writes already normalize (admin route `manager/route.ts:125`); or (b) add a complementary index for ILIKE (`text_pattern_ops` on lowered).
**Severity:** LOW today (small data); MEDIUM at scale.

### G7 — REAL UX: Stripe-failed booking leaves vendor stuck for 30 min
**Where:** `src/app/api/vendor/markets/[id]/book/route.ts:396-410`
**What:** When `createBoothRentalCheckoutSession` throws, the rental row is left as `status='pending_payment'` with no `stripe_checkout_session_id`. Vendor retry hits the `(vendor, market, week)` UNIQUE constraint and gets a 409 "already booked this week" until the cron Phase 16 orphan sweep clears the row ~30 min later.
**Impact:** Real users blocked from retrying for 30 minutes after a transient Stripe outage with no actionable error message.
**Fix shape:** Two options. (a) In the catch block at line 396, DELETE the orphaned rental row so retry works immediately. (b) Detect the "just-created + no session_id" case on retry and reuse the existing row (try Stripe again). Option (a) is simpler.
**Severity:** MEDIUM — rare event but very confusing when it happens.

### G8 — REAL BUG: Optin selections PUT is not atomic; manager save can flip every vendor to stale
**Where:** `src/app/api/market-manager/[marketId]/optin/selections/route.ts:156-168`
**What:** PUT does "delete all selections → insert new selections" in sequential ops. If the insert fails (network blip, server crash, manager closes tab between ops), the market's effective agreement version becomes `v0:empty`. Next time any vendor at this market calls `agreement-status`, `getVendorAgreementStaleness` returns `is_stale=true` (because their last version was non-empty). Every vendor at the market sees a "your agreement was updated, re-accept" prompt — for no actual change.
**Impact:** Manager doing a routine "tweak my statements" save can cause a partial-fail that requires every vendor to re-accept. Worse, the saved row count looks "wrong" (zero) so the manager thinks they got logged out.
**Fix shape:** Wrap delete+insert in a Postgres function `replace_market_optin_selections(market_id, payload jsonb)` that runs both inside a single transaction. ~20 LOC migration.
**Severity:** MEDIUM — would manifest as confusing widespread re-acceptance prompts.

### G9 — UX: OptinManager doesn't warn when removing a statement causes vendor re-acceptance
**Where:** `src/components/market-manager/OptinManager.tsx:312-351` (save button) and `selections/route.ts` (server effect).
**What:** Saving a different statement set changes the auto-computed `agreement_version` hash, which causes `getVendorAgreementStaleness` to return `is_stale=true` for every previously-accepted vendor at this market. There's no warning to the manager that "saving this will require all X current vendors to re-accept."
**Impact:** Manager makes a tiny edit (e.g., uncheck one statement they decided was redundant) — every vendor gets a "re-accept the agreement" prompt next time they visit. Manager doesn't realize that's the effect.
**Fix shape:** Show a warning above the Save button: "X vendors will be prompted to re-accept the updated agreement on their next visit." Query the count from `vendor_market_agreement_acceptances` joined to `market_vendors`.
**Severity:** LOW — works correctly; just not transparent.

### G10 — UX: OptinManager error shows raw statement ID, not text
**Where:** `OptinManager.tsx:142` — `setSaveError(\`"${stmt.id}": ${validationError}\`)`.
**What:** When a checked statement is missing a placeholder value, the error reads e.g. `"fm_quality_001": Missing value for {distance_miles}`. The manager sees an internal ID, not the statement they're configuring.
**Impact:** Manager has to scroll to find which statement they missed. Friction, not a bug.
**Fix shape:** Use `renderOptinStatement(stmt.statement, s.values)` (the rendered preview) or `stmt.statement` directly in the error message. ~2 LOC fix.
**Severity:** LOW — friction only.

### G11 — UX: Stale "payment coming soon" copy in 3 places
**Where:** Three places now stale because Phase C Stage 3 is shipped:
  - `dashboard/page.tsx:376` — "Online checkout for booth rentals" listed in *Coming soon*.
  - `WeeklyBookingsCard.tsx:122-124` — "Online payment is coming — for now coordinate payment directly with each vendor."
  - `book/page.tsx:189-193` and `BookBoothForm.tsx:424` — "payment coming soon" / "Complete booking (payment coming soon)" button text.
**Impact:** Manager who has finished Stripe Connect onboarding STILL sees copy saying online payment is coming. Confuses both the manager (did my Stripe setup work?) and any vendor reading the booking page.
**Fix shape:** Conditional copy based on `market.stripe_charges_enabled`. Remove the "Coming soon" line entirely on dashboard.
**Severity:** LOW — cosmetic but visible.

### G12 — UX: Onboarding step counter says "Step X of 6" but landing shows 5 numbered steps
**Where:** `onboarding/page.tsx:47-75` (5 numbered) vs `onboarding/[step]/page.tsx:103` shows "Step X of 6" (counting `confirm` as step 6).
**What:** Inconsistent step count between landing and per-step header.
**Severity:** LOW — minor polish.

### G13 — DESIGN GAP: Off-platform placeholders aren't time-aware
**Where:** `src/app/api/vendor/markets/[id]/book/route.ts:226-231` subtracts ALL placeholder rows (no time filter) from capacity. Mig 135 has no `week_start_date` column on placeholders.
**What:** A booth occupied by an off-platform vendor on SOME weeks reduces capacity on ALL weeks. A market with one off-platform vendor who shows up biweekly permanently loses one slot for online booking even on the weeks that vendor isn't there.
**Impact:** Manager has to overstate inventory.count to accommodate, which then misleads when the off-platform vendor IS there.
**Fix shape:** Schema design decision. Two options: (a) add `week_start_date DATE NULL` to `market_booth_placeholders` (NULL = always-occupied, date = that-week-only); (b) separate `weekly_booth_placeholders` table. Probably option (a) — minor schema add.
**Severity:** LOW — only relevant for markets with mixed regular and rotating off-platform vendors.

### G14 — DOC GAP: Migration 140 (`market_branding`/`logo_url`) is missing from current_task.md migration table
**Where:** `current_task.md:65-71` lists migs 138/139/141 with their Dev/Staging/Prod status. Mig 140 is NOT listed.
**What:** `dashboard/page.tsx:61` selects `logo_url` — if mig 140 hadn't been applied to Staging, the dashboard would crash. Therefore mig 140 IS applied to Dev + Staging (matches 138/139/141). But it's missing from the doc.
**Impact:** When the user goes to apply migs to Prod, they could miss 140. Then prod dashboard fails on `logo_url` column-missing.
**Fix shape:** Add row to current_task.md migration table: `| 140 | market_branding (logo_url) | ✅ | ✅ | ❌ pending |`. Apply order is: 138 → 139 → 140 → 141 (140 has no FK dependency on 139, but apply numerically to stay clean).
**Severity:** MEDIUM — operational risk during prod push.

### G15 — DOC GAP: Phase D.1 (market activity card) and D.2 (schedule card) not in current_task.md
**Where:** `manager-dashboard-stats.ts:178-315` defines `getMarketTransactionsAggregates`. `MarketTransactionsCard.tsx` and `MarketScheduleCard.tsx` are wired into the dashboard. `ManagerSupportCard.tsx` (D.3) likewise.
**What:** All three are on staging but current_task.md only describes Phase C Stage 1/1A/2/3 and Phase B closeout. No mention of D.1/D.2/D.3 being shipped.
**Impact:** Future sessions reading current_task.md as the source of truth for "what's on staging" will miss these features. Could result in someone trying to "build" them again.
**Fix shape:** Add a Phase D section to current_task.md "What's on staging" listing the three cards + the new lib function.
**Severity:** LOW-MEDIUM — orientation gap.

### G16 — DESIGN GAP: Booth rentals don't appear in vendor's own dashboard
**Where:** No vendor-side "My Bookings" view found. Search reveals only manager-side `WeeklyBookingsCard`. The success page in `BookBoothForm.tsx` says "Back to vendor dashboard" but the vendor dashboard has no card for upcoming booth rentals.
**What:** After paying for a booth, the vendor has no place to see their bookings. Mig 139 rows are vendor-readable through the rental row's `vendor_profile_id` column, but no UI shows them.
**Impact:** Vendor pays, gets a success page, then has no record of the booking on their dashboard. Has to bookmark the success URL or check Stripe receipts.
**Status:** **Already on backlog** in a less specific form? Searched — no. current_task.md line 133 says "Vendor 'My Bookings' dashboard section (Stage 1 leftover)" as "NOT in this session's work" but it's not as a backlog item.
**Severity:** MEDIUM — Phase C ships the payment but not the receipt flow on vendor side. Important for trust.

### G17 — DESIGN GAP: No way for vendor or manager to cancel a paid booking
**Where:** No DELETE or PATCH-status route found anywhere in `/api/vendor/markets/[id]/*` or `/api/market-manager/[marketId]/weekly-rental/[rentalId]`.
**What:** Mig 139 `status` allows `'cancelled'`. The cron Phase 16 auto-cancels orphans/stale. But there's no API to cancel a PAID booking. If the vendor wants out or the manager needs to cancel the booth, both need to coordinate manually + admin refund via Stripe Dashboard.
**Impact:** No self-service cancellation. Every cancellation is a support ticket plus a Stripe Dashboard refund. Also: refund flow doesn't reverse the manager's transfer (vendor gets refunded, manager keeps the destination-charged portion — like the market box refund issue on backlog).
**Severity:** MEDIUM — operational pain that will surface as soon as anyone has buyer's remorse.

### G18 — DESIGN GAP: Manager Stripe webhook (`account.updated`) drift
**Where:** Lazy-sync only via `GET /stripe/status` (`stripe/status/route.ts:84-98`).
**What:** Already on backlog as P1.0.5 *"Stage 3 account.updated webhook → markets.stripe_* sync (optional)"*. Confirmed by code review.
**Status:** Already tracked.

### G19 — DOC GAP: `phantom-test-spec` — flow integrity test only covers DELETE on market_vendors
**Where:** `flow-integrity.test.ts:339-397`.
**What:** Test asserts manager API doesn't `.delete()` from `market_vendors`. There's no equivalent test for:
  - Manager API writing to `markets` columns OTHER than `description`/`logo_url` (the branding route writes only `description`; logo writes only `logo_url`). A future bad change could expand this without test catching it.
  - Manager API exposing DELETE on protected tables `vendor_market_agreement_acceptances`, `weekly_booth_rentals` (paid bookings should never be hard-deleted).
**Severity:** LOW — defensive only, no current incident.

---

## Notes on items that LOOK like gaps but are correctly designed

- **Vendor docs route `vendor-docs/route.ts:65` has a `TODO for new-vendor path` comment** — this was wired up later in `/api/submit/route.ts` (info-sharing capture verified at line 252). The TODO comment is stale; the work is done. Minor cleanup, not a gap.
- **MarketAgreementBlock auto-fires `onChange(true)` when statements are empty** — by design (`MarketAgreementBlock.tsx:99-114`), produces a `v0:empty` snapshot. Edge cases are handled correctly by `agreement-version.ts` staleness check.
- **No DELETE endpoint on `/api/market-manager/[marketId]/vendors`** — by design, enforces the permission boundary tested in flow-integrity.test.ts.
- **`vendor-booth/route.ts:25-26` allows two vendors to share a booth number** — explicitly documented as intentional.
- **manager-auth.ts uses caller's supabase client to read `markets`** — safe because markets table is publicly readable; not an RLS gap.

---

## Cross-reference against existing backlog/current_task

### Already tracked (won't re-list)
- Failed booth rental purchase notification (backlog P1.1)
- Vendor + manager payment-complete notifications (backlog P1.1)
- Migrations 138/139/141 → Prod + bookkeeping (backlog P1.1, current_task.md)
- Stage 3 amount reconciliation (backlog P1.1)
- account.updated webhook sync (backlog P1.1)
- Item 2 admin manager contact fields — mig 142 + UI (current_task.md)
- Manager-editable schedule UI (current_task.md "What's NOT in this session")
- Proactive manager application form (current_task.md)
- Vendor "My Bookings" dashboard section (current_task.md, but worth bumping severity — see G16)

### NEW (this audit) — summary table

| ID | Severity | Title | Type |
|---|---|---|---|
| G1 | HIGH | Race condition in booth-booking capacity check | Bug |
| G2 | HIGH | Vendor sees base price ($25) but is charged base × 1.065 ($26.63) | Bug |
| G3 | MEDIUM | BoothInventoryManager DELETE confirm lies; PG 23503 unmapped | Bug |
| G4 | MEDIUM | Logo `confirm()` blocked on mobile | Bug |
| G5 | MEDIUM | No UI to revoke approved vendor (API supports it) | Bug |
| G6 | LOW→MED | Functional index on `LOWER(manager_email)` unused by ILIKE query | Perf |
| G7 | MEDIUM | Stripe-fail leaves rental row blocking retry for 30 min | UX |
| G8 | MEDIUM | Optin selections PUT not atomic — failure causes mass re-acceptance | Bug |
| G9 | LOW | No warning before opt-in change triggers vendor re-acceptance | UX |
| G10 | LOW | OptinManager error shows raw `stmt.id` instead of text | UX |
| G11 | LOW | "Payment coming soon" stale in 4 places (Stage 3 shipped) | Copy |
| G12 | LOW | Onboarding step counter 5-vs-6 mismatch | Polish |
| G13 | LOW | Booth placeholders aren't time-aware (always-occupied model) | Design |
| G14 | MEDIUM | Mig 140 missing from current_task.md prod-push table | Doc |
| G15 | LOW→MED | Phase D.1/D.2/D.3 shipped but not in current_task.md | Doc |
| G16 | MEDIUM | Vendor has no UI to see their own booth bookings | Feature |
| G17 | MEDIUM | No self-service booking cancellation; no transfer reversal | Feature |
| G19 | LOW | Flow-integrity test only catches market_vendors DELETE | Test |

(G18 already tracked.)

---

## Final synthesis

**Bugs that should be fixed before next prod push:** G1 (overbooking), G2 (price misrepresentation), G3 (delete-tier crash), G4 (mobile logo block), G14 (mig 140 missing from prod push plan).

**Bugs that should be fixed soon:** G5 (revoke), G7 (stripe-fail retry), G8 (atomic optin save), G11 (stale copy).

**Features missing for a complete Phase C user experience:** G16 (vendor bookings view), G17 (cancellation flow).

**Documentation:** G14, G15, G19 — purely doc cleanup.

**Total new findings:** 18 (G1-G17 + G19). G18 already tracked.
