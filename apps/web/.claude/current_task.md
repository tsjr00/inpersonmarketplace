# Current Task: Session 90 — full review + audit fixes (Items 1-4)

**Updated:** 2026-06-05 (Session 90, in progress)
**Mode:** Fix (audit-fix batch)

## Session 90 status

Full code/systems review done (findings + verification in `apps/web/.claude/session90_review_research.md`). User approved fixing Items 1-4; all implemented + tsc clean + lint clean (2 pre-existing warnings only). NOT committed yet (staging-first pending user approval).

**Implemented (uncommitted):**
- **Item 1 (data integrity, HIGH)** — market_schedules hard-delete → soft-upsert (composite day+start+end key, decision B). Files: `api/admin/markets/[id]/route.ts` (2A), `api/vendor/markets/[id]/route.ts` (2B, also fixed latent HH:MM vs HH:MM:SS key mismatch), `api/markets/[id]/schedules/[scheduleId]/route.ts` (2C → active=false). Supporting: `app/admin/markets/[id]/page.tsx` (filter activeSchedules), `ScheduleManager.tsx` (copy), `api/markets/[id]/schedules/route.ts` POST (reactivate-or-insert). Relies on existing `active` col + trigger_market_schedule_deactivation. RLS update policy verified (mig 004:255).
- **Item 2 (security, MED)** — strong event_token in `lib/events/event-actions.ts` (crypto randomBytes, additive — existing tokens valid). Defense-in-depth already satisfied (state guards select:201-266; tokens not logged).
- **Item 3 (security, LOW)** — `api/market-boxes/route.ts` vertical_id filter now required + friendly 400.
- **Item 4 (UI)** — confirm()→ConfirmDialog (VendorActivityClient), alert()→Toast pattern (both UsersTableClient variants, mirrors ListingsTableClient).

**Pending user approval:** (a) mig 153 (revoke validate_cart_item_schedule from PUBLIC+anon — plan presented, caller audit done: only auth-gated cart/items:152 calls it); (b) doc-line fix CLAUDE_CONTEXT.md:451 (stale — 3 vendor routes already fixed); (c) staging push of Items 1-4.

---

<details><summary>Prior: Session 88 handoff (Phase 1B queued) — still valid</summary>

# Current Task: Session 88 — close-out + Phase 1A shipped + diagnostic mission queued

**Updated:** 2026-06-03 (end of Session 88)
**Mode:** Fix (winding down)

---

## 🟡 Two lingering notes for next session — DO NOT MISS

### Lingering note 1 (carried from Session 87)

**`validate_cart_item_schedule` was missed from mig 152's scope.** It follows the same pattern as `validate_cart_item_inventory` and `validate_cart_item_market` (both covered by mig 152) but was overlooked. Confirmed via Session 87 Prod advisor: still appears in the `anon_security_definer_function_executable` warning list.

When you draft mig 153 (X1b in backlog), include `validate_cart_item_schedule` in the REVOKE list — REVOKE EXECUTE FROM PUBLIC + anon + authenticated, DO-block-wrapped for env conditional safety.

### Lingering note 2 (NEW Session 88)

**Phase 1B (manager export + lockout, second half) is queued.** Mig 154 schema is on Dev + Staging but NOT Prod. Code (lockout layout + 2 access pages + manager-auth helper) is on staging at `68638348`. Phase 1B work:

1. Extend `POST /api/admin/markets/[id]/manager` route to add `suspend` + `restore` actions, and write to `market_manager_history` on assign/clear (currently does neither — just updates `markets.manager_*` columns)
2. Update `MarketManagerAssignment.tsx` component to add suspend/restore buttons
3. New `ManagerHistoryPanel` component showing past assignments + reasons
4. 3 notification templates: `manager_access_removed`, `_suspended`, `_restored` (register in `src/lib/notifications/types.ts` `NotificationType` union + `NOTIFICATION_REGISTRY` + add i18n keys to `lib/locale/messages`)
5. Apply mig 154 to Prod + push Phase 1B code together (single coordinated push, same pattern as Session 87)

Plan doc with full design + state transitions + business rules: `apps/web/.claude/manager_export_and_lockout_plan.md` (Phase 1B starts where the "Build phasing" → Phase 2 estimate begins).

---

## State at end of Session 88

**Branches in sync:**
- Local `main` == `origin/staging` == `68638348`
- `origin/main` (Prod) still at `4fc2356f` (yesterday's COI fix from Session 87 — does not yet have Phase 1A code)

**Reason `origin/main` was not advanced this session:** Phase 1A code is only useful if Phase 1B ships alongside. The lockout layout + helper will redirect any user navigating to a manager URL — but without admin tools to suspend/reassign managers, the new states are unreachable in practice. Holding the Prod push for Phase 1B to bundle code + mig 154 apply + admin UI together.

**Working tree (uncommitted, intentional handoff state):**
- `apps/web/.claude/current_task.md` (this file — being updated)
- `apps/web/.claude/backlog.md` (mig 153 entry + COI item from Session 87, untouched today)
- `apps/web/.claude/settings.local.json` (gitignored / local-only)
- Plus untracked planning docs from earlier today: `session88_prod_readiness_audit.md`, `manager_export_and_lockout_plan.md`, and the new `session89_diagnostic_prompt.md`

---

## What Session 88 accomplished

### Documentation + plans
- **Session 87 close-out** — bookkeeping commit + COI upload-button fix shipped Prod (Session 87 carried over briefly into Session 88's start)
- **Testing protocol** — `apps/web/docs/staging_test_checklist.md` (37 tests, 10 sections, printable for an off-machine tester on a Chromebook)
- **Prod-readiness audit** — `apps/web/.claude/session88_prod_readiness_audit.md` covering market manager data/grant features (8/14 shipped, G2 keystone gap = no CSV/PDF export), booth rentals (no new env vars; 4 Stripe Live items to verify; per-market Stripe Connect onboarding is the launch gate), and events (no new env vars or Stripe config)
- **Manager export + lockout plan** — `apps/web/.claude/manager_export_and_lockout_plan.md` (~20 KB design doc: request-based exports + dashboard lockout, 3 new tables, full state machine, 7 new notification templates planned, 15-18 hour estimated build across 3-4 sessions)
- **Concept: self-serve micro-market (FROG Market)** — `apps/web/.claude/self_serve_micro_market_concept.md` (idea capture, not on roadmap)

### Code (Phase 1A — shipped to staging only)
- **Migration 154** at `supabase/migrations/20260603_154_market_manager_lockout.sql` — applied to Dev + Staging. Adds `market_manager_history` audit table + `markets.manager_status` column + idempotent backfill. RLS enabled, no policies (service-client-only access).
- **`src/lib/markets/manager-auth.ts`** — new `getMarketManagerState()` returning rich enum (`'active' | 'suspended' | 'removed' | 'none'`) + market name. Hardened `isMarketManager()` to require `manager_status === 'active'` (suspended managers blocked at the API layer alongside non-managers).
- **`/[vertical]/market-manager/[marketId]/layout.tsx`** — new server-side guard runs once for all 4 child pages. Redirects on no-user / suspended / removed / none.
- **`/[vertical]/market-manager/access-removed/page.tsx`** — landing page; distinguishes former-manager (with end date) from random-user via history lookup.
- **`/[vertical]/market-manager/access-suspended/page.tsx`** — landing page; preserves assignment messaging.
- **`SCHEMA_SNAPSHOT.md`** changelog updated for mig 154.

Two commits shipped:
- `6ae50a3d` — Phase 1A initial (had a `typography.sizes.md` typo that pre-push build caught)
- `68638348` — fix-forward (`typography.sizes.base`)

### Other observations
- Several gates fired this session: PERF-R8 doc-completeness on mig 154 (forgot SCHEMA_SNAPSHOT entry — fixed), typography.sizes type error on lockout pages (build caught — fix-forward), git branch drift on the fix-forward commit (committed on staging instead of main because we'd been left on staging by a previous failed chain — recovered via `merge --ff-only`).

---

## Diagnostic mission queued for next session

User flagged that overall pace has slowed. A starting prompt for a fresh session was drafted at `apps/web/.claude/session89_diagnostic_prompt.md` — the next session reads it, investigates ~8 named diagnostic targets (rule + hook proliferation, memory file count, pre-commit/pre-push cycle time, error rate per commit, scope creep per session, tool-call efficiency, migration overhead, Rule 7 teaching mode overhead), and produces structured findings + cuts.

**Recommended:** run that diagnostic session BEFORE Phase 1B starts, so Phase 1B benefits from any process improvements identified.

---

## Reference points

### Recent commit history
- `68638348` — fix(market-manager): use typography.sizes.base (Session 88 fix-forward)
- `6ae50a3d` — feat(market-manager): Phase 1A — lockout schema + layout guard + access pages (Session 88)
- `4fc2356f` — fix(vendor-coi): show Upload button for grandfathered approved+empty COI rows (Session 87)
- `5f4f9dd1` — chore(deploy): Session 87 bookkeeping (Session 87)
- `8caf174c` — fix(docs): mig 151 prod rollback recorded + current_task updated (Session 86 close)

### Verification queries for sanity check at next session start

```sql
-- Confirm migration 154 is on Dev + Staging (NOT Prod yet)
-- Run on each env separately:
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'market_manager_history') AS history_table_exists,
  (SELECT column_default FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'markets' AND column_name = 'manager_status') AS manager_status_default;
-- Expected on Dev + Staging: history_table_exists=1, manager_status_default='active'::text
-- Expected on Prod:         history_table_exists=0, manager_status_default=NULL
```

### Phase 1B starting checklist
1. Read this file + `manager_export_and_lockout_plan.md` "Phase 1B" section
2. Confirm mig 154 on Dev + Staging (queries above)
3. Confirm Prod still at `4fc2356f` — Phase 1A code is on staging, not Prod
4. Run the diagnostic session FIRST (read `session89_diagnostic_prompt.md`)
5. Then start Phase 1B with the process improvements identified

### Vault state
Unchanged at `7f895e5` (`vault/pre-session-59`). No vault files touched this session.

</details>
