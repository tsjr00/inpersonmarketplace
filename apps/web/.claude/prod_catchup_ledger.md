# PROD CATCH-UP LEDGER — migration half (written 2026-10-16; the commit list is regenerated on push night)

**Status: PLANNING. No push date set (owner 2026-10-16: "not ready to push prod").** This file holds the part of the catch-up that does not go stale: which migrations Prod owes, in what order, with what pre-check, plus the config that must (and must not) move with them. The code side (commit list, diff summary, smoke list) is produced on the night, from `git log origin/main..main`, because every commit until then changes it.

Precedents this follows: `prod_push_runbook.md` (2026-07-07, migs 168–183) and `prod_deploy_2026-08-13.md` (migs 213–223). Procedure for the night: `apps/web/.claude/rules/git-and-deployment.md` Rules 4–7 (staging-first, window 9 PM–7 AM CT, one push at a time, teaching-mode explanation) and `apps/web/docs/migration-workflow.md` steps 6–10 for the bookkeeping after.

---
## 1. Baseline (verified 2026-10-16)
| What | Value | Evidence |
|---|---|---|
| Prod code | `origin/main` = `d704d3bb` | `git log origin/main -1` after fetch |
| Prod schema | current through **mig 251** (ALL THREE ENVS rows 244–251, Prod 2026-09-13 evening) | `SCHEMA_SNAPSHOT.md:78-85` |
| Local `main` = `origin/staging` | `ff0cb0d8` (105 commits ahead of Prod; 351 files, +38 232 / −2 044) | `git rev-list --count origin/main..main` |
| Migration files in the root (pending somewhere) | 252–262 (11 files) + **225** (parked forever) + pre-convention historical files | `ls supabase/migrations/*.sql` |

Root files numbered below 252 are **not owed**: the `applied/` convention post-dates them and the snapshot records 123 as "all 3 envs 2026-04-17" (`:213`); 225 is "WRITTEN, NOT APPLIED TO ANY ENVIRONMENT" (`:105`) and is absorbed by 234 (applied) — **never paste 225** (memory, 2026-08-15/16).

---
## 2. The eleven migrations Prod owes — apply class and order
All eleven are ✅ Dev + Staging (owner-applied, post-checks recorded in the snapshot changelog rows cited). "Class" is the file's own banner, read 2026-10-16.

| # | File | Class on Prod | Pre-check | Order constraint | Changelog row |
|---|---|---|---|---|---|
| 252 | `20260915_252_check_subscription_completion_definer` | PASTE-AND-GO (function → SECURITY DEFINER, same body) | optional (expect `prosecdef = false` before) | any order, any time relative to code | `:77` |
| 253 | `20260915_253_schedule_conflict_both_verticals` | PASTE-AND-GO (function replace) | optional (body contains 'food_trucks' before) | **superseded by 262 for this function** — Prod may apply 253 → 262 or **262 alone**; companion code (schedules route) is in the push either way | `:76` |
| 254 | `20260917_254_events_sell_on_selection` | ⚠ **PRE-CHECK FIRST — behaviour change on arrival** (accepted-but-unselected vendors at self-service events stop selling) | **REQUIRED**: header query, READ the rows — real organizers/vendors on Prod | **code first or with it** (shop mirror in code); before 255 | `:75` |
| 255 | `20260918_255_managed_fee_markets_sell_paid_weeks` | ⚠ **PRE-CHECK FIRST — behaviour change on arrival** (managed fee-market vendors without a paid week stop selling) | **REQUIRED**: header query, READ the rows (banner: "Prod holds seed data only — verify") | **254 BEFORE 255** (text = 254 + one predicate) | `:74` |
| 256 | `20260919_256_booth_soft_pins_same_vendor` | ⛔ PRE-CHECK FIRST (DROP+CREATE of `book_weekly_booth_atomic` with a new optional arg; `requested_inventory_id` column; trigger body) | **REQUIRED**: header query 1 must return 0 conflicts; read the pins | after 255; before 257/258 | `:73` |
| 257 | `20260919_257_booth_credits_fm_cancellations` | ⛔ PRE-CHECK FIRST (additive: CHECK values, column, partial unique) | **REQUIRED** by banner (expect 0 rows / column absent) | 254 → 255 → 256 → 257 | `:72` |
| 258 | `20260920_258_booth_tier_label_ranges` | ⛔ PRE-CHECK FIRST (4 columns + `booth_numbering_scheme`, 6 functions, trigger) | **REQUIRED**: 4 new columns ABSENT, the 4 function fingerprints EQUAL the mig-256 values | **256 must precede**; 252 → … → 258 | `:70` |
| 259 | `20260924_259_order_items_tax_source_self_computed` | paste-and-go (idempotent DROP+ADD CHECK) | optional | after 258 or alone | `:69` |
| 260 | `20260924_260_tax_reversal_ledger` | paste-and-go (two new tables, additive) | optional | after 259 or alone | `:68` |
| 261 | `20260925_261_tax_rate_refresh` | paste-and-go (column + table, additive) | optional | after 260 or alone — **BUT see §4: before the first cron run after the code push** | `:66` |
| 262 | `20261009_262_approval_skips_conflicting_days` | PASTE-AND-GO (four trigger-function replaces) | optional (Dev/Staging fingerprints identical; Prod bodies recorded as pre-fix) | **with/after 253** — ship in the same batch as the code; closes the approval-rollback bug Prod cannot hit until 253 lands (backlog "FM APPROVAL FAILS…") | `:64` |

Every file is one safe select-all paste (pre-checks commented, post-check a live trailing SELECT) — `feedback_migration_files_paste_whole`. The four **REQUIRED** pre-checks (254, 255, 256, 258) and 257's are run on **Prod**, on the night, and their rows read before the paste — Staging's results do not transfer (`feedback_query_env_never_trust_deploy_docs`).

---
## 3. Sequence relative to the code push — the one decision the owner must make
Two precedents disagree and the files themselves split:
- 2026-08-13 runbook: **all migrations BEFORE the code push** (additive schema sits unused until the code arrives).
- 261's banner: "On Prod the code lands first (wipe → code → migs)".
- 254's banner: "code must go first or with it"; 255 inherits that.

What the code actually tolerates (from the banners + the function signatures):
- **Safe BEFORE the code push** (old code keeps working): 252, 253/262 (trigger functions; 262's P0020 code only matters to the new route), 256 (new arg is `DEFAULT NULL`, the 5-arg call still resolves), 257, 258 (same signatures), 259, 260, 261.
- **Must land WITH the code, not days before**: 254 and 255. Applying them while the OLD shop code is live makes the SQL gate hide unselected / unpaid vendors while the old shop still lists their menus → buyers see items that fail at checkout (the exact gap the code mirrors close).

**Recommended night sequence (owner decides):**
1. Run the Prod pre-checks for 254, 255, 256, 257, 258 (read-only). Read the rows. Stop on anything unexpected.
2. Apply **252 → 262 → 256 → 257 → 258 → 259 → 260 → 261** (253 skipped — 262 supersedes it; or 253 then 262 if the owner prefers the audit trail).
3. `git push origin main` inside the window (teaching-mode paragraph first; one push).
4. Vercel Prod build **green** (dashboard, not exit code).
5. Apply **254 → 255** immediately after the build is green.
6. Smoke (code-side list written on the night) + the three post-checks the banners name.
7. Bookkeeping: move the 11 files to `applied/`, rewrite the 11 changelog rows to ALL THREE ENVS, `current_task.md`, `CLAUDE_CONTEXT.md` session row — one commit via the staging chain.

**Open question for the owner (not Claude's call):** the 2026-09-18 note "owner wipes Prod first" and 261's "wipe → code → migs". Is a Prod data wipe still intended before this catch-up? It changes step 1 (pre-checks on an empty Prod return 0 rows by construction) and is destructive — `docs/destructive-data-workflow.md` applies if yes.

---
## 4. Config and environment that moves with the code (git-side read of the 105-commit delta)
| Item | What the delta does | Prod action |
|---|---|---|
| `vercel.json` crons | ADDS two entries for `/api/cron/tax-rate-refresh`: `0 9 1 * *` (monthly health check) and `0 9 2-31 1,4,7,10 *` (DAILY in Jan/Apr/Jul/Oct) | Automatic on deploy. **⚠ Timing trap in October:** 09:00 UTC = **04:00 CT**, inside the push window. If the code is pushed before 261 is on Prod, the job runs against missing objects at 04:00 CT. Apply 261 BEFORE the push (§3 step 2) or push after 04:00 CT. |
| `TAX_STREAM1_STAGING` | read in `lib/tax/flags.ts:40-41`, honoured only when `VERCEL_ENV !== 'production'` | **Do NOT set on Prod.** `TAX_STREAM1_PROD = false` in code (`:37`) keeps the tax engine dark on Prod regardless. |
| `CRON_SECRET` | new cron route uses the same guard as existing crons | Already in Prod (runbook 2026-07-07). No change. |
| `RESEND_API_KEY` | one new reader in the delta | Already in Prod. No change. |
| Resend inbound webhook `/api/webhooks/resend` | bounce classification fixed (Permanent/Temporary; `isPermanentBounce`) — same endpoint | No dashboard change. Owner check only: the Resend webhook URL points at the **bare** domain (memory 2026-10-08: `www.` 307s and senders don't follow). |
| New env vars | **none** — `git diff origin/main..main` names only `VERCEL_ENV`, `TAX_STREAM1_STAGING`, `CRON_SECRET`, `RESEND_API_KEY` | — |
| `COMPANY_PAID_ORDERING_ENABLED`, `EXTERNAL_PAYMENTS_ENABLED` | code constants, both off (flow-integrity pins) | Nothing to set. |

Other crons already on Prod (`expire-orders`, `event-reconfirm`, `surveys`) changed bodies in the delta (reversal-ledger writes, tax reversals at expiry) — they need 260 on Prod before their first post-push run; §3 step 2 covers that.

---
## 5. Produced on push night (perishable — do not pre-write)
- `git log --oneline origin/main..main` → the commit list; group by area for the smoke list.
- Smoke list from the diff: FM vendor Markets page + booking (booth model 256–258), FT park booking + holds (F1 guard), events shop (254 mirror), managed-market visibility (255 twins), admin tax pages (dark on Prod — confirm they render and change nothing), bounce webhook (send one test email to a known-bad address; user not suppressed on a Temporary bounce).
- Post-push: `NOTIFY pgrst, 'reload schema'` after the DDL migrations (257, 258, 260, 261) — the 2026-08-13 runbook step 3.
- Vault: after the owner verifies Prod, the owner decides whether `vault` moves (`code-stability.md` Rule 1.3).
