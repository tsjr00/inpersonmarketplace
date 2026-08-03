# Pre-Prod Diff Audit — Findings Ledger

**Scope:** `62b686f7..f141c6e6` (113 commits, 486 files, migs 184→212)
**Started:** 2026-07-30
**Discipline:** Report mode — flag, don't fix. Every finding code-cited + adversarially verified.

---

## Slice progress
- [x] P0 — Migrations 184→212 — **CLEAN.** All 29 additive/pre-migration-safe, changelog entries present, rollbacks documented. No DROP COLUMN, no data-loss ALTER, no destructive delete. Deploy-sequencing note recorded below (not a code bug).
- [x] P1 — Money / critical-path — **CLEAN.** Deep adversarial reads of webhooks.ts, payments.ts, checkout/session+success+external, cart/items+validate, fulfill, confirm-handoff, reject, resolve-issue, cancel-date-cascade. Every money fix (CHK-1/6, VOR-1/2/8/9/10/15/19, MBX-1/3/7, PRK-10, MGR-3/4/8, S1-6/7) verified correct + internally consistent. pricing/vendor-limits/vendor-fees/payouts UNCHANGED. No money-loss or double-refund/double-payout defect found.
- [x] P2 — Admin access lockdown — **CLEAN, one deploy-order gate (see [KEYSTONE] finding).** `hasPlatformAdminRole` made strict; 35 admin routes tightened to `verifyAdminScope`/strict-platform; gate is fail-closed, forge-proof, membership-checked; no route dropped its auth. admin.test.ts (+137) green.
- [x] P3 — Cross-file flow integrity — **park + cart + upload + EVENT + SEASON traced, CLEAN.** cart/validate `?vertical=` wired; park book→pay→webhook→checkin verified; upload routes gated. **Season settlement (mig 194):** snapshot write market-scoped (seasons:153) ↔ read snapshot-preferred/NULL→live (settlement), divide-by-zero guarded (settlement-math:28), unit-tested. **Event cancel (mig 190):** organizer + admin routes BOTH do EVT-4 (expire→refund-remaining→skip-fulfilled→guarded item/order cancel→free waves) and **share the `${order.id}-event-cancel` idempotency key** → double-cancel can't double-refund. **Wave recalc (mig 191):** 3 live callers (was orphaned), backups excluded on both RPC + generateEventWaves, select route recalcs AFTER backups marked + guarded to events-with-waves. Market-box-subscribe not walked (money verified via webhooks P1).
- [x] P4 — Known anti-patterns — **CLEAN.** No non-deterministic idempotency keys; all `sendNotification` awaited (Promise.all); status vs approval_status correctly split (R3 fix); DOW usages timezone-safe (`Date.UTC().getUTCDay()`) for recurring-schedule conflict only; check-in DOW-vs-date bug verified fixed (parkRows `.eq('booking_date', todayStr)`).
- [ ] P5 — UI / copy — **NOT REACHED** (lowest priority). Marketing/branding/empty-state copy unreviewed.
- [x] Gates (§5): tsc PASS / lint 1 pre-existing err / vitest 1765 PASS / build PASS

---

## Findings

### [KEYSTONE / CRITICAL-IF-MISORDERED] Strict admin helper will lock out ALL admins if mig 204 isn't applied to prod first
- **File:** `src/lib/auth/admin.ts:134-144` (hasPlatformAdminRole now strict — plain `admin` no longer passes) + all 35 `src/app/api/admin/**` routes now calling `verifyAdminScope`/strict-platform.
- **Severity:** Critical (only if deploy order is violated) · **Confidence:** Confirmed
- **What:** This candidate makes `hasPlatformAdminRole` reject the plain `admin` role. Mig 204 (which promotes the two owner accounts to `platform_admin` + provisions `vertical_admins`) is what keeps admin access working. Prod currently has both admin accounts at `role='admin'` with NO platform_admins and ZERO vertical_admins rows (per mig 204's own finding).
- **Failure scenario:** If the code (origin/main push) reaches prod BEFORE mig 204 is applied → both admin accounts, including the owner's, are denied by every scope-checked admin route (fail-closed). Admin surface goes dark until 204 runs.
- **Fix rec (deploy sequencing, NOT a code change):** Apply migs 184→212 (incl. 204) to prod FIRST, then run mig 204's **V2 lockout query** — it must return **0 rows** — and V1 (both accounts resolve as platform_admin), BEFORE pushing origin/main. Staging already has 204 applied + admin tested (this is why the strict code is safe there).
- **Verified by:** Read `admin.ts:134-144` diff (strict), `verifyAdminScope` 174-263 (platform branch gates on it), mig 204 body (additive provisioning), and the 35-route diff (all tightened, none loosened). Staging tip f141c6e6 runs this code and admin works → 204 is live on staging.

### [DEPLOY-NOTE] Migration ordering must precede code deploy (not a bug)
- **What:** Mig 204 (admin_role_provisioning) is additive-first; the strict-helper/scope code depends on the vertical_admins rows it creates. Migs 199→200 both replace `get_available_pickup_dates` (200 = final). 210 before 211.
- **Action:** Apply all migs 184→212 **in filename order** to prod BEFORE pushing the code commits. Filenames already sort correctly. This is the documented relaunch plan; flagging only so it isn't skipped.
- **Verified by:** Read all 29 migration files; ordering guaranteed by lexical filename sort (204 keystone confirmed additive at 20260718_204:28-136).

---

**P1-money verified CLEAN so far (adversarial reads, no findings):**
- `webhooks.ts` (+479): CHK-1 dead-order full auto-refund (deterministic `${orderId}-dead-order` key, shared w/ success route); ADM-2 fee capture non-blocking+idempotent; CHK-6 market-box refund fee-inclusive — **verified matches charge exactly** (metadata `priceCents=termPriceCents` session:776 == charge formula session:710); MBX-1 payout on pre-fee base via `selectBasePriceForTermWeeks`; MBX-3/7 payout status flips scoped to live rows / this transfer id; charge.refunded S1-11 apportionment sums exactly to `amount_refunded` (floor+last-gets-remainder); PRK-10 park stamp reads `bookings` BEFORE flip (webhooks:1706 vs flip:1739) so proration `n` correct & sums to netTotal; MGR-8 net notification amounts mirror payments.ts both-sides credit reduction; CHK-8/9 renewal vertical-scoped.
- `payments.ts` (+20): park-spot credit reduces charge AND transfer equally; caller (book-park-spot:491-493) caps `appliedCreditCents ≤ min(managerReceives, vendorPays−50)` behind `if(creditRequest>0)` → chargedVendor≥50, transfer≥0. Verified.
- `pricing.ts` / `vendor-limits.ts` / `vendor-fees.ts` / `payouts/route.ts`: **UNCHANGED** in diff — core fee math untouched.
- Minor (not filed): park/booth PRK-10 stamp partial-failure `break` leaves some rows NULL → dashboard estimates (mig-203 designed fallback); Stripe-retry idempotent skip won't re-attempt stamp. Low, by-design.

_(more findings written as discovered)_

---

## Gate results
- **tsc --noEmit:** PASS (exit 0)
- **vitest:** PASS — 68 files, 1765 tests (exit 0)
- **npm run lint:** exit 1 — **527 problems (1 error, 526 warnings)**. The single error (`set-state-in-effect` at `src/components/events/EventRequestForm.tsx:241`) is **PRE-EXISTING** (file last modified by 7a0b646d, an ancestor of prod 62b686f7) — NOT introduced by this diff, so not a relaunch regression. Warnings are unused-vars/exhaustive-deps, also mostly pre-existing. Pre-commit uses lint-staged (staged files only) so full-repo lint was never green; pre-push does not run lint. No NEW error from the candidate diff.
- **npm run build:** PASS (exit 0)

---

## Severity-sorted summary

**Bottom line: no code-level correctness/money/security/data defect found in the diff.** The relaunch candidate is exceptionally clean — every money and admin change is defensively engineered, deterministic, idempotent, and internally consistent. Gates green (lint's 1 error is pre-existing, not a regression). The ONLY blocking item is a deploy-ordering requirement, not a code bug.

| # | Severity | Item | Type |
|---|----------|------|------|
| 1 | **Critical (only if deploy misordered)** | Strict `hasPlatformAdminRole` locks out all admins unless mig 204 is applied to prod BEFORE the code push | Deploy sequencing |
| 2 | Info | Migration apply-order (184→212 in filename order; 199→200, 210→211) must precede code | Deploy sequencing |
| — | (none) | No Critical/High/Medium/Low **code** defects survived adversarial verification | — |

Two low, by-design items noted inline under Findings (PRK-10 partial-stamp NULL → dashboard estimate fallback) — not filed as defects.

---

## Could-not-verify-here → prod/staging smoke list (post-push)

These need the live environment (real Stripe, live env vars, VERCEL_ENV crons, email) — verify after the prod push:
1. **BEFORE code push:** mig 204 applied to prod → run its **V2 query = 0 rows** + V1 (both owner accounts resolve as `platform_admin`). If V2 ≠ 0, do NOT push code (finding #1).
2. **Live Stripe webhooks:** a real park-spot payment flips `park_spot_bookings` to paid by `booking_group_id` and stamps `manager_receives_cents` summing to the transfer; a booth rental with an applied booth credit charges/transfers the net amounts.
3. **Dead-order refund:** the CHK-1 path (`${orderId}-dead-order` key) only fires on a genuine stale-tab race — confirm no false auto-refunds in error_logs post-launch.
4. **Fee capture (ADM-2):** `payments.stripe_fee_cents` populates on new charges (balance_transaction availability can lag).
5. **Email suppression (mig 202):** a hard bounce sets `email_suppressed_at` and the in_app notice fires.
6. **Crons (VERCEL_ENV):** Phase 19 booth-credit expiry uses the new `get_booth_credit_expiry_state` RPC; catering address-reminder (mig 185) dedups.
7. **Admin surfaces:** platform admin sees all verticals; (future) vertical admins scoped — currently both real admins are platform, so cross-vertical scoping is untested with a real vertical-only admin.

---

## What I did NOT get to
- **P5 (UI/copy)** — marketing Section A, branding, empty states, helper text: not reviewed (lowest priority).
- **P3 exhaustive flows** — traced park + cart contracts + new upload routes; did NOT walk every event-organizer / market-box-subscribe / season-settlement path end-to-end. The migrations + money code touching them were read; the UI/route glue for those specific flows was not fully traced.
- Vertical-admin cross-vertical data isolation is verified in code + tests but **cannot be exercised in prod** until a real vertical-only admin exists (none do today).
