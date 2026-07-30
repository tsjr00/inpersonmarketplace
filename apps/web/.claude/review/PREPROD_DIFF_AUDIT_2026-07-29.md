# Pre-Prod Diff Audit — Relaunch Candidate (2026-07-29)

**You are auditing the exact set of changes about to ship to production.** The goal is to catch prod-bound regressions the owner may not have hand-tested during ~3 weeks of work, BEFORE the combined relaunch push. This is a **review, not a fix** pass. Be thorough, be skeptical, and cite everything.

---

## 0. First actions (do these before anything else)
1. Read, in order: `CLAUDE.md` (root), `apps/web/.claude/rules/*.md` (all 5), `supabase/SCHEMA_SNAPSHOT.md` (skim + the Change Log for migs 184–212), and `apps/web/.claude/current_task.md`.
2. Confirm you are on the right scope (commands in §2). If `git log origin/main` ≠ `62b686f7`, STOP and re-anchor — the range below is wrong and must be recomputed.
3. Create the findings file `apps/web/.claude/review/PREPROD_FINDINGS_LEDGER.md` and write findings to it **as you go** (this diff is large; you WILL be compacted — each written finding is a recovery point).

## 1. Mission & boundaries
- **Find** correctness/security/money/data bugs and regressions in the diff below. Rank by severity.
- **Do NOT** change code, fix, refactor, commit, or push. **Flag, don't fix.** Fixes are a separate owner-gated session.
- **Do NOT** review the whole repo. Only what changed since prod can introduce a *new* prod bug. Review the **diff**.
- If you finish the priority tiers and have budget, widen; if you run low, make sure P0–P2 are complete and say what you didn't reach.

## 2. Scope (hard anchor — the diff only)
- **Prod baseline:** `origin/main` = `62b686f7` (mig 183).
- **Candidate:** `origin/staging` = `f141c6e6` (== local `main`).
- **Range:** `62b686f7..f141c6e6` — **113 commits, 486 files, +37,248 / −3,560**, migrations **184 → 212**.
- Commands (Git Bash; **prefix bracket-path commands with `GIT_LITERAL_PATHSPECS=1`**):
  ```sh
  git diff --stat 62b686f7..f141c6e6                       # the map
  git log --oneline 62b686f7..f141c6e6                     # what shipped
  git diff 62b686f7..f141c6e6 -- <path>                    # a slice
  ```

## 3. Rules you MUST follow (from the project rule files — non-negotiable)
- **Cite or mark UNVERIFIED.** Every claim about behavior needs a `path:line` you personally read, or the literal word UNVERIFIED. No claims from memory or from the diff's commit messages alone.
- **Adversarially verify before reporting.** For each candidate finding, try to DISPROVE it (read the surrounding code, the call sites, the tests). Kill false positives. A 7-finding report that's 100% real beats a 15-finding report with 5 wrong.
- **Confidence markers** on every finding: Confirmed / High / Medium / Low.
- **Schema gate:** before asserting anything about a DB column, read `SCHEMA_SNAPSHOT.md` or the migration that defines it. The snapshot's structured tables are flagged STALE — trust the migration files + `information_schema` over the structured section.
- **Test integrity:** if a test looks wrong, do NOT plan to change it — flag the code/test conflict for the owner.

## 4. Priority order (do top-down; P0–P2 are mandatory)

### P0 — Migrations 184→212 (small surface, worst blast radius)
Read every migration file in `supabase/migrations/` in this range. For each, verify:
- Additive & safe? Any `DROP`, `DELETE`, destructive `ALTER`, or column-type change? (Flag any data-loss risk.)
- Ordering dependencies (e.g., **204 admin-role provisioning must land before the admin-lockdown code is live**; **210 before 211**; **206 before 212**).
- Does the code that uses each new column/function match the migration? (grep the column/fn name across the diff.)
- Snapshot Change Log has an entry (Rule 3).
The 29 files:
```
184 fix_listing_availability_dow_timezone   185 catering_address_reminder
186 booth_assign_honor_manager              187 kb_help_cleanup
188 kb_help_consolidation                   189 optin_event_eligible
190 catering_status_cancelled               191 wave_capacity_recalc_fix
192 park_required_docs_note                 193 wbr_unique_active_only
194 season_days_snapshot                    195 order_ratings_vendor_tie
196 payments_stripe_fee                     197 claim_vendor_fee_deduction
198 booth_credit_expiry_state               199 pickup_dates_park_booking_intersection
200 pickup_dates_exclude_barred             201 park_date_cancel_credit
202 email_suppression                       203 manager_receives_snapshot
204 admin_role_provisioning ⚠ KEYSTONE      205 market_booth_map_url
206 market_required_docs_structured         207 vendor_images_allow_pdf
208 market_insurance_self_cert              209 market_operator_platform_ack
210 skip_ft_park_auto_schedule              211 cleanup_phantom_ft_park_schedules
212 market_cover_image
```

### P1 — Money / critical-path diff (real money — deepest reads)
Diff each of these that changed; trace the money flow end-to-end; check penny math, idempotency, and error/rollback paths:
- `src/lib/pricing.ts` · `src/lib/vendor-limits.ts`
- `src/lib/stripe/payments.ts` · `src/lib/stripe/webhooks.ts`
- `src/app/api/checkout/session/route.ts` · `.../checkout/success/route.ts` · `.../checkout/external/route.ts`
- `src/app/api/cart/items/route.ts` · `.../cart/items/[id]/route.ts` · `.../cart/validate/route.ts`
- `src/app/api/vendor/orders/[id]/reject/route.ts` · `.../fulfill/route.ts` · `.../vendor/payouts/route.ts`
- The booking-atomic RPCs (migs): `book_park_spot_atomic` (172), `book_weekly_booth_atomic` (186), `book_season_atomic`/`confirm_season_paid`/`cancel_season_group`, `get_available_pickup_dates` (199/200), `claim_vendor_fee_deduction` (197), `redeem_booth_credit` / credit expiry (198/201).
- Park-booking + settlement routes under `src/app/api/vendor/markets/[id]/**` and `src/app/api/market-manager/[marketId]/**` (largest money surface; the 2026-07-19 review map-skimmed these — give them real reads now).

### P2 — Admin access lockdown (keystone security)
- Mig **204** + every route changed to use `verifyAdminScope` / `hasAdminRole`. Verify: platform admins retain full access; vertical admins are correctly scoped; no vertical can read another's data; the gate can't be bypassed by a missing/forged vertical param. Cross-check with `src/lib/auth/admin.ts` and `admin-account-integrity.test.ts`.

### P3 — Cross-file flow integrity (where "each file is fine alone" bugs hide)
Trace end-to-end, reading code at each hop (not summarizing): FT park book→pay→webhook→schedule→check-in; vendor signup→verify→onboarding gates; event organizer→agreement→vendor accept→shop→order; market-box subscribe→pickup; manager intake→admin approve→manager onboarding→booth rental. Confirm redirect targets, param contracts, and status reachability.

### P4 — Known anti-patterns (this codebase's repeat offenders — hunt them)
- **Day-of-week vs actual-date** matching (caused the phantom schedules mig 210/211 AND the early-check-in bug). Any logic keyed on `day_of_week`/DOW where it should key on a specific `booking_date`/date.
- **`status` vs `approval_status`** confusion on markets (two separate fields; UI/gates keying on the wrong one).
- **Server validation not matching the UI** (the cert bug: UI optional, route required; UI allowed a value, route rejected it).
- **UTC/timezone** in date math (Vercel runs UTC; market-local date/cutoff logic).
- **Stale redirects / cache** (success_url landing pages; `revalidatePath` missing for a route family; removed `cache:'no-store'` making a route static).
- **RLS vs service-client**: writes that should use the service client (RLS default-deny) silently failing, or service-client used where user-scoping was required.
- **Non-deterministic idempotency keys** (`Date.now()`/random in Stripe keys).
- **Notifications:** `sendNotification` awaited (Vercel kills after response); vertical in options not templateData.

### P5 — UI / copy / everything else (lowest)
Marketing (Section A), branding, empty states, helper text. Only after P0–P4.

## 5. Gates to run (report results in the ledger)
```sh
cd apps/web
npx tsc --noEmit
npm run lint
npx vitest run
npm run build        # SSG/Next-only failures the type system misses
```
All are expected green (they gate pre-commit/pre-push). If any fails on the candidate, that's a P0 finding.

## 6. Slicing strategy (keep it tractable across compaction)
Work one domain slice at a time, write findings, then move on. Suggested slices + representative paths:
1. Migrations (§4 P0) → 2. Money/critical-path (§4 P1) → 3. Admin/RLS (§4 P2) → 4. FT park (`src/app/**/markets/[id]/**`, `market-manager/**`, `components/market-manager/**`, `src/lib/markets/**`) → 5. Events (`**/events/**`, `catering`) → 6. Market boxes → 7. Notifications (`src/lib/notifications/**`) → 8. Marketing/branding/UI.
For each slice: `GIT_LITERAL_PATHSPECS=1 git diff 62b686f7..f141c6e6 -- <slice paths>`, read the changed code + enough surrounding context to verify, then write findings.

## 7. Prior work — don't re-plow, don't trust blindly
A large two-pass logic-testing review ran **2026-07-19** (`apps/web/.claude/logic_testing_round_research.md`, ledger `apps/web/.claude/review/FINDINGS_LEDGER.md`). It covered 12 slices at varying depth. Use it to AVOID re-deriving known-clean areas — but it predates the newest commits and map-skimmed the manager/park route surface, so the diff is still the source of truth. Anything it explicitly marked deferred/backlog is out of scope here (see `apps/web/.claude/backlog.md`).

## 8. Output format — write to `PREPROD_FINDINGS_LEDGER.md` as you go
For each finding:
```
### [SEV] <short title>
- **File:** path:line (the exact line you read)
- **Severity:** Critical | High | Medium | Low   (Critical = money loss / data loss / security / prod-down)
- **Confidence:** Confirmed | High | Medium | Low
- **What:** one sentence — the defect.
- **Failure scenario:** concrete inputs/state → wrong output/crash.
- **Fix rec:** the change (do NOT apply it).
- **Verified by:** what you read/ran to confirm (and what you tried that FAILED to disprove it).
```
Keep a running header: which slices are DONE, which are outstanding. End with:
- A **severity-sorted summary** (Critical first).
- A **"could not verify here — test in prod/staging"** list → becomes the post-push smoke checklist (live Stripe webhooks, VERCEL_ENV crons, real env vars, email delivery).
- An explicit statement of **what you did NOT get to**, if anything.

## 9. Definition of done
- Gates (§5) run + results recorded.
- P0 (migrations), P1 (money), P2 (admin gate) fully covered — or an explicit note of what's left.
- Every reported finding is code-cited and adversarially verified.
- Ledger has the severity-sorted summary + the prod-smoke list.
- No code was changed.

---
**One line to start the fresh session with:** "Read `apps/web/.claude/review/PREPROD_DIFF_AUDIT_2026-07-29.md` and execute it. Report mode — flag, don't fix."
