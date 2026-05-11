# Current Task: Session 81 wrap — Phase A live in prod, regression fix on staging

**Updated:** 2026-05-10 (end of Session 81)
**Mode:** Fix (most recent — was switched from Report during the staging→prod review)

---

## TL;DR for next session

**Session 81 shipped Phase A (Market Manager wizard) to prod plus two follow-ups.** All migrations 132–137 applied to all 3 envs. One regression fix is on staging but **not yet on prod** — awaiting verification.

**State of remotes:**
- `origin/main` (prod) at **`c7d0b3ec`** — Session 80 + Phase A + vertical admin manager assignment
- `origin/staging` at **`9318bda1`** — adds: RLS-blocked progress query fix + vendors wizard step
- 1 commit on staging not yet on prod (`9318bda1`) — the regression fix described below

---

## What landed in Session 81 (chronological)

### Phase A — Market Manager onboarding (shipped to prod 2026-05-09 at `7470e1d5`)

| Commit | What |
|---|---|
| `7eefadb2` | A1: migrations 135 (off-platform placeholders) + 136 (opt-in catalog + 15 seeded statements) + types/helpers + Session 81 roadmap in v2 plan |
| `54fd0335` | A2: booth-placeholders CRUD API + dashboard card |
| `74ed8c07` | A3: opt-in catalog + selections API + manager UI (15-statement picker with placeholder substitution) |
| `a5b2dfcf` | A4: onboarding wizard (5 steps) + ConfirmDialog fix in booth components |
| `d802506c` | A5: permission boundary flow-integrity test (manager can't delete from market_vendors) |
| `7c466329` | Onboarding progress consistency fix (placeholders + Review-and-finish step) |
| `7470e1d5` | **Bookkeeping commit — migrations 132–137 moved to applied/, SCHEMA_SNAPSHOT + MIGRATION_LOG updated, Phase A live on prod** |

### Post-Phase-A follow-up — vertical admin gap (prod 2026-05-09 at `c7d0b3ec`)

User reported the manager assignment UI only existed on platform admin (`/admin/markets/[id]`) — vertical admins had no path to it.

| Commit | What |
|---|---|
| `c7d0b3ec` | **Vertical admin manager assignment + mobile Edit button on /[vertical]/admin/markets.** Moved `MarketManagerAssignment` to `src/components/market-manager/`. Added section to inline Edit form (FM + traditional only). Added Edit button to mobile rows via `AdminMobileRow.rightAction` for portrait usage. Pushed to prod. |

### Regression fix + vendors wizard step (staging only — `9318bda1`)

User reported on prod: "set up market box shows 0 of 2 required and no items completed, even though I have completed and saved all on boarding categories." Plus: "in the onboarding wizard it did not ask me to assign booth numbers to vendors already on the platform."

**Root cause of progress bug:** migration 137 enabled RLS on all 4 market-manager tables with no policies (default-deny except service_role). `getOnboardingProgress` was taking the authenticated user's supabase client and querying those tables for counts — blocked by RLS, always returned 0. The CRUD operations all work because the API routes use `createServiceClient()`. The progress reader was the only path using the wrong client.

| Commit | What |
|---|---|
| `9318bda1` | (1) `getOnboardingProgress` now uses `createServiceClient()` internally (auth verified upstream via `isMarketManager`). Dropped the supabase param from 3 callers. (2) New wizard step `vendors` inserted between booths and placeholders. Uses existing `VendorBoothList` component. Optional — doesn't gate required completion. Shows ✓ if any vendor has a booth assigned OR if no vendors are at the market yet. Empty-state warning copy. Dashboard checklist and confirm step both show the new line. **On staging, NOT prod.** |

---

## Migrations status (all applied to all 3 envs as of 2026-05-09)

| # | What | Files moved to applied/ | In `SCHEMA_SNAPSHOT.md` changelog |
|---|---|---|---|
| 132 | Drop legacy analytics functions | ✓ | ✓ |
| 133 | Market manager v1 schema | ✓ | ✓ |
| 134 | market_booth_inventory table | ✓ | ✓ |
| 135 | market_booth_placeholders table | ✓ | ✓ |
| 136 | Opt-in catalog + selections + 15 seed statements | ✓ | ✓ |
| 137 | Enable RLS on all 4 market manager tables (default-deny) | ✓ | ✓ |

**Schema snapshot structured tables are still STALE as of 2026-04-24.** Backlog item to regenerate via `REFRESH_SCHEMA.sql`. Doesn't block work.

---

## State of the onboarding wizard (post-9318bda1)

Steps in order:
1. `identity` — confirm market details (read-only)
2. `booths` — booth inventory CRUD (size tiers + prices) — REQUIRED
3. `vendors` — assign booth numbers to on-platform vendors at this market — optional, NEW Session 81
4. `placeholders` — off-platform vendor booth occupancy — optional
5. `optin` — pick from 15 vendor agreement statements + fill placeholders — REQUIRED
6. `confirm` — review summary

Confirm step shows ✓/○ for each step with status copy. Required steps drive "Setup complete" state on the dashboard checklist.

---

## Outstanding work (in priority order)

### Immediate next-session candidates

1. **Verify `9318bda1` on staging then push to prod.**
   - Confirm dashboard checklist shows ✓ for previously-saved data
   - Confirm new `vendors` wizard step renders + transitions correctly
   - Confirm empty-state copy renders when no on-platform vendors
   - `git push origin main` once verified

2. **Backlog Task #6 — active filter DONE 2026-05-10.** `VendorBoothList` now defaults to showing approved+scheduled vendors, with a toggle to show all. API extended to query `vendor_market_schedules.is_active`. Pickup count was descoped — per-vendor isn't useful to managers; aggregate "X orders for next market day" moved to Phase D.

3. **Off-platform vendor placeholders UX polish?** Currently shows correctly post-fix. No outstanding bugs.

### Phase B (kicked off 2026-05-10)

**Shipped (6 quick wins, no migration/payment/critical-path):**
- ✅ **Win 1: Invite-a-vendor link** on manager dashboard — `InviteVendorLink.tsx` shows copy-able URL `${origin}/${vertical}/vendor-signup?market=<id>`. Note: used `?market=` ALONE, NOT `?ref=manager` — the `ref` param is already consumed by the vendor-to-vendor referral system (`vendor-signup/page.tsx:80-99`); reusing it would collide.
- ✅ **Win 2: Co-branded vendor signup banner** — `vendor-signup/page.tsx` reads `?market=<id>`, fetches market name from `/api/markets/[id]`, renders banner above the form. Signup behavior unchanged.
- ✅ **Win 3: "Needs booth #" filter** — `VendorBoothList.tsx` toggle is now 3-state (Active / Needs booth # / All). Per-row "needs booth #" badge appears when applicable.
- ✅ **Win 4: "Needs booth #" badge in Vendors header** — count badge on the "Vendors at this market" h2; scroll anchor `#vendors-at-market` for jump-to from the action summary.
- ✅ **Win 5: Next market day stat** — surfaced in the Manager Action Summary card (Win #6) as a bullet showing date + scheduled order count. Bundled with Win #6 per user's option-B choice 2026-05-10 (rather than as a separate header line).
- ✅ **Win 6: Manager Action Summary card** — `ManagerActionSummary.tsx` renders below `OnboardingChecklist` only when there are actionable items (needs-booth count > 0 OR upcoming market day). Defers to checklist during setup. New helper `manager-dashboard-stats.ts` powers it; uses the canonical cron pattern (`expire-orders/route.ts:2267-2269`) for market-local "next market day" computation via `markets.timezone`.

**Remaining Phase B (deeper work, separate sessions):**
- **Vendor weekly booking flow** (modeled on event organizer flow) — pick market → pick week → pick size → see price → see opt-in agreement → "complete booking" placeholder (no payment yet)
- **Auto-create market_vendors row on co-branded signup** — design discussion needed about manager approval workflow (currently the banner is informational only)
- **New migration:** `vendor_market_agreement_acceptances` table + `weekly_booth_rentals` table

### Phase C (critical-path territory — heavy approval needed)

- Manager "market" Stripe Connect account onboarding
- Booth-rental Stripe Checkout with 6.5% × 2 markup
- Payout flow to manager Connect account
- Electronic-signature record snapshot at payment confirmation

### Phase D — dashboard fill-out

- Aggregate transactions card (7d / 30d / season)
- Schedule view (read-only `market_schedules`)
- Support card (KB + email)
- Weekly bookings list
- Booth occupancy grid view
- **Aggregate "X orders for next market day" count** (resets after each market day) — moved here from original Backlog Task #6 scope per 2026-05-10 design discussion; manager doesn't need per-vendor granularity

### Phase E — surveys + share

- Migration: `market_surveys` table
- Post-market survey cron with evening-vs-next-morning logic
- Delivery: in-app + email (locked decision)
- Aggregate ratings + responses on manager dashboard
- Share button + templates on market profile

---

## Critical context — DO NOT FORGET

### RLS model on market manager tables (migration 137)
All 4 tables — `market_booth_inventory`, `market_booth_placeholders`, `market_optin_statement_catalog`, `market_optin_selections` — have RLS enabled with **no policies**. Only `service_role` (used by `createServiceClient()`) bypasses RLS. **The authenticated user's client (`createClient()`) is blocked.**

**Pattern:** All API routes under `src/app/api/market-manager/` use service client. Any server component that needs to READ these tables must also use service client (via `createServiceClient()`), with auth verified upstream by `isMarketManager()`. Do NOT add an RLS policy that allows authenticated reads without a separate design discussion — the default-deny model is intentional.

### Permission boundary rule (flow-integrity test in commit d802506c)
Manager cannot disassociate a vendor from a market if the vendor associated themselves first. Currently enforced by API surface (manager API has no DELETE on market_vendors). Test at `src/lib/__tests__/flow-integrity.test.ts` walks `src/app/api/market-manager/` and fails if any file calls `.from('market_vendors').delete()`. **If you add a DELETE to manager API, that test will block the commit.**

### Critical-path files NOT touched in Session 81
- `src/app/api/cart/*`
- `src/app/api/checkout/external/*`
- `src/lib/pricing.ts`
- `src/lib/vendor-limits.ts` (touched in mig 137 era but only TSConfig type cleanup, no logic change)

### Foreground pushes only
Per user preference (and `feedback_verify_push_by_remote_tip.md`), pre-push hooks run foreground so failures are visible. Background runs hide Playwright flakes that need `rm -rf .next` retries.

### Production push window
**9 PM – 7 AM CT only** per CLAUDE.md. Both prod pushes in Session 81 were authorized within this window or explicitly approved out-of-window by the user.

### Mobile UX nuance
The `/[vertical]/admin/markets` page now has an Edit button as `rightAction` on each mobile row (portrait works). Rotation landscape-switch should also work via CSS at `AdminResponsiveStyles.tsx:365` but the user reported it doesn't on their device — separate device-side issue, not a code bug.

---

## Open design questions

1. **Should vendor booth assignment count toward "required" progress?** Currently optional. User indicated they expected it to count, but committing to "required" means a manager can't reach "Setup complete" until they have at least one on-platform vendor (chicken-and-egg). Current design: optional, but ✓ when "vendors at market = 0" (clean slate is valid).

2. **Phase B vendor signup `?market=&ref=manager` flow** — should it create a `market_vendors` row automatically on signup, or wait until vendor explicitly books a week? Probably the latter, but worth confirming.

3. **Surveys timing logic** — locked at "evening of market purchase OR next morning if late event." Cron needs market-close-time-aware logic. Not built yet.

---

## File locations / quick reference

### Market manager v1 core
- `src/lib/markets/manager-auth.ts` — dual-key auth helper
- `src/lib/markets/manager-queries.ts` — getMarketsManagedBy (FM-scoped)
- `src/lib/markets/booth-types.ts` — inventory types + helpers
- `src/lib/markets/placeholder-types.ts` — placeholder types + validators
- `src/lib/markets/optin-types.ts` — opt-in types + render/validate/group helpers
- `src/lib/markets/onboarding-progress.ts` — **uses service client internally now**

### Manager UI
- `src/components/market-manager/MarketManagerCard.tsx` — buyer dashboard card
- `src/components/market-manager/MarketManagerAssignment.tsx` — admin assignment UI (shared between platform + vertical admin)
- `src/components/market-manager/BoothInventoryManager.tsx` — tier CRUD with ConfirmDialog
- `src/components/market-manager/BoothPlaceholderManager.tsx` — placeholder CRUD with ConfirmDialog
- `src/components/market-manager/VendorBoothList.tsx` — vendor list with booth_number editor
- `src/components/market-manager/OptinManager.tsx` — statement picker with placeholder substitution
- `src/components/market-manager/OnboardingChecklist.tsx` — dashboard yellow card (4 line items now)

### Manager pages
- `src/app/[vertical]/market-manager/[marketId]/dashboard/page.tsx` — main dashboard
- `src/app/[vertical]/market-manager/[marketId]/onboarding/page.tsx` — wizard landing
- `src/app/[vertical]/market-manager/[marketId]/onboarding/[step]/page.tsx` — wizard step dispatcher (6 steps now)
- `src/app/[vertical]/market-manager-program/page.tsx` — public landing
- `src/app/admin/markets/[id]/page.tsx` — platform admin market detail (uses MarketManagerAssignment)
- `src/app/[vertical]/admin/markets/page.tsx` — vertical admin (uses MarketManagerAssignment in inline Edit form)

### Manager API
- `src/app/api/market-manager/[marketId]/booth-inventory/` — GET/POST + [id] PATCH/DELETE
- `src/app/api/market-manager/[marketId]/booth-placeholders/` — GET/POST + [id] PATCH/DELETE
- `src/app/api/market-manager/[marketId]/optin/catalog/` — GET (catalog)
- `src/app/api/market-manager/[marketId]/optin/selections/` — GET + PUT (replace whole set)
- `src/app/api/market-manager/[marketId]/vendor-booth/` — PATCH (booth_number only)
- `src/app/api/market-manager/[marketId]/vendors/` — GET vendor list
- `src/app/api/admin/markets/[id]/manager/` — POST assign/clear

### Tests
- `src/lib/__tests__/flow-integrity.test.ts` — 36 tests including market manager permission boundary

### Planning docs
- `apps/web/.claude/market_manager_v2_plan.md` — strategic plan with Session 81 Consolidated Roadmap at top
- `apps/web/.claude/market_manager_v1_plan.md` — historical reference (superseded banner at top)
- `apps/web/.claude/market_manager_optin_statements_v1.md` — locked at 15 statements

---

## Pending — TOP OF NEXT SESSION

1. **Verify `9318bda1` on staging** — dashboard checklist accurate, wizard `vendors` step works, empty-state copy clean
2. **Push `9318bda1` to prod** — `git push origin main` from main; uses pre-push hook (Playwright). Within 9 PM – 7 AM CT window.
3. **After prod confirmed:** clean working state — no migrations pending, no commits stranded.

Then the user picks the next direction: Phase B kickoff, Task #6 vendor list polish, or something else.

---

## Working tree state at end of Session 81

```
M apps/web/.claude/settings.local.json     (gitignored)
+ many pre-existing untracked planning docs in .claude/ (intentional, historical)
```

All session work is committed. Local `main` matches `origin/main` (= prod). `origin/staging` has one extra commit (`9318bda1`).

---

## When this gets picked up

Read in order:
1. This file (`current_task.md`) — you're here
2. `CLAUDE.md` (root) — project rules
3. `apps/web/.claude/market_manager_v2_plan.md` — Session 81 Consolidated Roadmap at top
4. `apps/web/.claude/rules/verification-discipline.md` (Rule 1) + `apps/web/.claude/rules/change-discipline.md` (Rule 1) — recent user reinforcements about accuracy and not editing without explicit approval

User's working preferences this session:
- **Foreground pushes only** (background hides Playwright flakes that need `.next` clear)
- **Slow down, accuracy over speed** — verify with code reads, don't guess
- **Cite file:line in claims** — don't quote behavior from memory
- **`.next` clear before every chain** to dodge the Turbopack flake — has worked consistently
