# Current Task: Session 92 — growth build + design pass + help content (NEXT SESSION READ THIS)

**Updated:** 2026-06-16 (checkpoint). **Mode:** Fix (hybrid build).

## ⭐ LATEST CHECKPOINT (2026-06-15/16) — READ FIRST

**Prod push DONE:** `528cbba3` shipped to prod 2026-06-15 (the 17-commit growth/design/refund stack + migs 154–158 applied to Prod + the `subscriptionType→type` vendor-upgrade fix). User smoke-testing.

**On `main` but NOT pushed (deferred by user):**
- `a7543556` — FM-only "Market Mgrs." footer link → `/[vertical]/market-manager-program` (on staging, prod push deferred).
- `96620976` — Part B: survey CSV export ("Download CSV" on SurveyResultsCard). COMPLETE. (committed local, unpushed)
- **Part A foundation (UNCOMMITTED at checkpoint → committing now):** mig 159 (`vendor_profiles.production_category TEXT[]` + `sell_eligible BOOLEAN DEFAULT TRUE`) + backstop `sell_eligible` gates at `listings/[id]/publish/route.ts:152` and `market-boxes/route.ts` POST. Both gates are **INERT** (everyone defaults sell_eligible=TRUE). Event selling covered transitively (sales require vendor + published listing).

**Part A REMAINING (next session, focused — see `vendor_categories_and_survey_export_plan.md`):**
1. **Signup front-gate** — the qualifying category question in `[vertical]/vendor-signup/page.tsx` that weeds out cat 3/4 BEFORE a vendor profile is created (existing buyer stays a buyer). Cat 1/2 → existing form. Cat 3/4 → block screen with the CHOSEN copy (Option A, in the plan A2). This is the actual behavior change; the rest is inert until it lands.
2. **`/api/submit`** records `production_category` + computes `sell_eligible` for cat 1/2.
3. Deferred fast-follow: A4 opt-in catalog statement + A5 manager messaging.
- **SEQUENCING:** mig 159 must be applied to Dev+Staging BEFORE the gate code is pushed to staging (the gates `select ... sell_eligible`; without the column the publish + market-box routes would error). So: build front-gate → apply mig 159 (Dev+Staging) → push all of `main` to staging → user tests → prod.

---

## QUICK STATE FOR NEXT SESSION
Long session. Everything below is on `origin/staging` (15 commits ahead of prod `4fc2356`), all tsc/lint/vitest green, NOT on prod yet. Prod push deferred to a 9PM–7AM CT window.

**Staging commits since prod `4fc2356`:** 12ee9069 (Items1-4), a6056031 (mig153 bookkeeping), eeb847fa (refund/fee F1/F2/F4/F5), 6cd16002 (protected-paths gate), 12b0eb9c (growth-A: visibility+earnings+open-booth cards), 52ab733d (growth-B-follows), f2ed2606 (growth-B-broadcast), 81199f61 (growth-1B suspend/restore+history), 6186f2f7 (type=button dialog-submit fix), ea1fd98d (market_vendors→vendor_profiles embed disambig — fixed broadcast 0-recipients + schedule-change-notifies-nobody), 91b1db08 (managerStatus wired into vertical-admin page + local suspend state), 4b3da05f (mm-design pass 1: sticky jump nav + ManagerCard wrapper + money-font fix).

**USER-CONFIRMED on staging:** refund/tip (F5+F2), Phase A, broadcast (rate-limit+delivery), follows button, suspend/unsuspend. Design pass 1 + help content NOT yet visually reviewed.

## OPEN ITEMS (next session)
1. **mig 158 help-articles seed — APPLIED to Dev + Staging 2026-06-14.** File `supabase/migrations/20260614_158_seed_help_articles_mm_events.sql`: 23 knowledge_articles (Market Managers 11 / Booth Rentals 3 / Events 6 / Joining a Market 3). Dollar-quoted ($art$), columns verified against mig 013 table. SCHEMA_SNAPSHOT changelog marked applied. NEXT: user reviews `/farmers_market/help` + `/food_trucks/help` on staging (events are global → show on both) → ships to Prod with the push. File stays in `supabase/migrations/` until Prod has it.
2. **Design pass COMMIT 2 + broadcast history — DONE 2026-06-14, on staging (pending user visual review).** 16 MM components unified on the `ManagerCard` wrapper (or chrome-aligned where the header is interactive): ManagerSupport/Earnings/Transactions/WeeklyBookings/ActionSummary/BoothOccupancy/Survey/VerificationDocs/StripeConnect/Branding/InviteVendorBrowser converted to `<ManagerCard>`; MarketScheduleCard chrome-aligned in place (interactive Edit/Save header kept); MarketVisibility + OnboardingChecklist keep semantic green/amber, gap aligned to 16px. `ManagerCard.title` widened to ReactNode. **Broadcast history:** new `GET /api/market-manager/[marketId]/broadcast` (manager-auth gated) + "Recent announcements" list in MarketBroadcastCard with "X of N used this week"; result boxes folded onto `statusColors`. Gates: tsc 0, vitest 1493/1493, my files lint-clean (1 pre-existing error in EventRequestForm.tsx:241 — full-CI-lint only, not mine). **OPEN Q for user after staging review:** does the sticky jump-nav overlap any global header (adjust `MANAGER_NAV_OFFSET` in ManagerCard.tsx if so).
3. **PROD PUSH (2026-06-15):** (a) ✅ migration-check on Prod = all 5 pending; (b) ✅ migs 154→155→156→157→158 APPLIED to Prod 2026-06-15 (user-confirmed; snapshot marked all-3-envs; files moved to `applied/`); (c) ⬜ `git push origin main` in the 9PM–7AM CT window (ships `4fc2356..0f1e69d9` + this bookkeeping commit, ~18 commits); (d) ⬜ verify Vercel built green; (e) ⬜ prod smoke test (homepage, login, manager dashboard, small purchase path).
4. **Form-button scan: DONE/clean** (ConfirmDialog + MarketManagerAssignment were the only offenders, both fixed).
5. **Backlog future builds (not this push):** vendor product categories (`vendor_product_categories_concept.md` — Phase 1 exclusivity gate / Phase 2 Option C booth-payment-link / Phase 3 Option B), RM/market-operations growth set, F6 cron N+1, admin-notif on failed refunds.

## DECISIONS LOGGED THIS SESSION (decisions.md): composable roles (stack never merge); season prepay no-subscriptions; (+ vendor categories strict cat1&2, Option C first → B later — in concept doc).

---

# Prior: Session 92 — growth build (A + B + 1B shipped to staging)

**ACTIVE (2026-06-13):** Growth feature build per `growth_build_plan.md` (phasing A→B→1B→C→D→E, hybrid mode). Phases A, B (follows + market-day notif + broadcast), 1B (manager suspend/restore + history) all on staging. Deep-dive findings: `session92_events_mm_growth_research.md`; decisions logged (composable roles, season prepay).

## ⚠️ BEFORE PROD PUSH (tonight, 9PM–7AM CT window) — checklist
1. **SCAN: ConfirmDialog / action buttons inside `<form>`** — grep app for `<form` hosts that contain `ConfirmDialog` or action `<button>`s lacking `type="button"`. Root cause of the manager-card dialog bug (fixed `6186f2f7`): default `type=submit` submits the host form. The `[vertical]/admin/markets/page.tsx` market-edit form was the one found; check for siblings (other admin edit forms, vendor/event forms). Fix any with `type="button"`. (ConfirmDialog's OWN buttons already hardened in `6186f2f7`.)
2. **Verify migration state on Prod** (don't trust memory): which of 153/154/155/156/157 are already on Prod vs pending. Apply pending ones IN ORDER before the code push.
3. **Staging tests cleared:** refund/tip (eeb847fa ✓ F5+F2), Phase A (✓), follows/broadcast/1B (⬜ user to test).
4. Push window 9PM–7AM CT; one coordinated `git push origin main` chain; smoke-test prod critical path after.

Staging stack since prod `4fc2356` (13 commits): 12ee9069, a6056031, eeb847fa, 6cd16002, 12b0eb9c, 52ab733d, f2ed2606, 81199f61, 6186f2f7, ea1fd98d (+ earlier). `6186f2f7` = type=button dialog-submit fix (admin manager card). `ea1fd98d` = market_vendors→vendor_profiles embed disambiguation — fixes broadcast 0-recipients AND a PRE-EXISTING prod bug where schedule-change notifications silently went to zero approved vendors (bare ambiguous embed errored → null). Both found during staging testing of B-broadcast/1B.

**Bugs found+fixed during staging testing (all on staging):** 6186f2f7 dialog-form-submit; ea1fd98d broadcast 0-recipients + schedule-change-notifies-nobody (market_vendors embed); 91b1db08 stuck suspend button (vertical-admin page missing managerStatus prop). Stack now 14 commits since prod.

**CONFIRMED working on staging (user):** broadcast (rate limit + delivery, 2 mgr/vendor combos). **Re-tests open after 91b1db08 deploys:** suspend→Restore button flips + restore works; follows button; schedule-change notifies. Then prod push.

---

# Prior: Session 92 — fresh review fixes (F1/F2/F4/F5) → then Stripe LIVE rotation

**Updated:** 2026-06-11 (Session 92)
**Mode:** Fix (user-approved batch: F1 full version, F2 cap=100, F4 logError now + admin-notif to backlog, F6 to backlog)

## Session 92 plan/state

Fresh end-to-end review done (NO prior audit files read, per user direction). Findings + verification: `apps/web/.claude/session92_fresh_review_research.md`. Error-log review: prod clean; staging = resolved Resend incident + benign auth blip.

**Approved fix batch (one commit → staging):**
- **F5** createRefund idempotency-key collision (payments.ts:245). Fix: required `idempotencySuffix` param; 10 call sites enumerated by grep: cancel:225, expire-orders:228, reject:165, resolve-issue:186, webhooks:237/251/438/453, success:240/257. Suffix = order-item id (order paths) / offeringId (MB paths)
- **F4** failed-refund catches console-only → logError, shared code ERR_REFUND_001 (5 sites): expire-orders:229-236, cancel:233-242, reject:173-180, resolve-issue:191-193, success:262-268. Admin notification → backlog
- **F1** vendor_fee_ledger double-billing: **mig 155** (order_item_id col + partial unique idx WHERE type='debit') + recordExternalPaymentFee gains required orderItemId + 23505→benign no-op; claim-first reorder in cron Phase 3.6 (:556-575) AND confirm-external-payment (:108-148). Callers: confirm-external:109 (item.id), fulfill:188 (orderItem id), cron 3.6:558 (item.id)
- **F2** tipPercentage clamp to 100 (session/route.ts:76)

**⚠️ SEQUENCING:** mig 155 must be applied to Dev+Staging BEFORE staging code push (code inserts order_item_id; old schema would break fee recording). Prod: mig before prod push.

**IMPLEMENTED (uncommitted, 2026-06-11):** all of F1/F2/F4/F5 code + mig 155 file (`20260611_155_vendor_fee_ledger_item_idempotency.sql`). 11 files modified: payments.ts (suffix param), webhooks.ts (4 callers), checkout/success (2 callers + ERR_REFUND_001 catch), reject + resolve-issue + cancel (caller + ERR_REFUND_001 catch each), expire-orders (caller + catch + Phase 3.6 claim-first + ERR_FEE_001), confirm-external-payment (claim-first reorder + item.id), fulfill (item.id arg), vendor-fees.ts (orderItemId param + 23505 no-op), checkout/session (tip pct clamp 100). Critical-path approvals given by user for all 6 protected files. **Gates: tsc clean, vitest 1493/1493 green, lint = 1 PRE-EXISTING error in EventRequestForm.tsx:241 (untouched by this batch; react-hooks/set-state-in-effect — will fail full-lint CI; flag to user).**
**NEXT:** user applies mig 155 to Dev + Staging → verify → commit chain → staging push → user tests → (later, in window) mig 155 to Prod + prod push. Note: untracked `apps/web/src/lib/tax/` dir exists, predates session, untouched.

**DONE 2026-06-12 — Stripe LIVE rotation (Session 92):** `STRIPE_SECRET_KEY` (sk_live) + `STRIPE_WEBHOOK_SECRET` rolled in Stripe (key ~1h grace, webhook ~24h overlap), both deleted + re-created as Sensitive in Vercel Production, ONE fresh redeploy of `4fc2356`. **VERIFIED:** (1) sk_live — buyer-premium upgrade reached live checkout.stripe.com (session created server-side via config.ts:5); (2) webhook secret — completed a real buyer-premium purchase (user's own card → platform account, no vendor needed); tier flipped to premium = event received + signature verified with the new secret + handler processed (old env var deleted, so deployment could only hold the new value — overlap ambiguity eliminated); (3) prod error_logs 1-hour window = zero rows. Old key + old whsec auto-expire. **Follow-ups:** (a) cancel (+ optionally refund) the test premium subscription — RENEWS MONTHLY if left; (b) refresh the LOCAL test-mode STRIPE_WEBHOOK_SECRET in .env.local (value accidentally printed into Session 92 chat — test-mode, low stakes); (c) remaining rotation backlog: Staging + Dev Supabase service-role (+ 3 GitHub Actions CI secrets with Staging), sk_test Stripe keys (low stakes).

---

# Prior: Session 90 — full review + audit fixes (Items 1-4)

**Updated:** 2026-06-10 (Session 91 — Prod Supabase service-role rotated + verified; full codebase review done)
**Mode:** Fix (audit-fix batch + secret rotation)

> **NEXT SESSION — quick state:** Secret rotation is the active work. **DONE (rotated + verified):** Twilio, CRON, Resend (incl. prod), Google Vision, Upstash token, **Prod Supabase service-role** (Session 91 — migrated Prod to new sb_publishable/sb_secret keys + disabled legacy JWT-based keys; verified zero user disruption). **REMAINING:** **Stripe LIVE secret key + webhook secret (Prod) — flagged exposed in Vercel, HIGHEST stakes, rotating Session 91**; Staging + Dev Supabase projects (Staging also needs the 3 GitHub Actions CI secrets updated, since CI runs against Staging). Stripe price IDs + publishable key = not secrets (no action). CI does NOT use Stripe (ci.yml only injects Supabase vars). Plus: bookkeeping commit `a6056031` is local-only/unpushed (E2E flake), and Items 1-4 (`12ee9069`) await USER staging-test before prod. Details below in the "Secret Rotation" section. The `current_task.md` edits + `a6056031` are uncommitted/unpushed.

## Session 90 status

Full code/systems review done (findings + verification in `apps/web/.claude/session90_review_research.md`). User approved fixing Items 1-4; all implemented + tsc clean + lint clean (2 pre-existing warnings only). NOT committed yet (staging-first pending user approval).

**Implemented (uncommitted):**
- **Item 1 (data integrity, HIGH)** — market_schedules hard-delete → soft-upsert (composite day+start+end key, decision B). Files: `api/admin/markets/[id]/route.ts` (2A), `api/vendor/markets/[id]/route.ts` (2B, also fixed latent HH:MM vs HH:MM:SS key mismatch), `api/markets/[id]/schedules/[scheduleId]/route.ts` (2C → active=false). Supporting: `app/admin/markets/[id]/page.tsx` (filter activeSchedules), `ScheduleManager.tsx` (copy), `api/markets/[id]/schedules/route.ts` POST (reactivate-or-insert). Relies on existing `active` col + trigger_market_schedule_deactivation. RLS update policy verified (mig 004:255).
- **Item 2 (security, MED)** — strong event_token in `lib/events/event-actions.ts` (crypto randomBytes, additive — existing tokens valid). Defense-in-depth already satisfied (state guards select:201-266; tokens not logged).
- **Item 3 (security, LOW)** — `api/market-boxes/route.ts` vertical_id filter now required + friendly 400.
- **Item 4 (UI)** — confirm()→ConfirmDialog (VendorActivityClient), alert()→Toast pattern (both UsersTableClient variants, mirrors ListingsTableClient).

**Done:** Items 1-4 committed + pushed to staging (commit `12ee9069`, pre-push build+Playwright green). Doc-line CLAUDE_CONTEXT.md:451 fixed. **mig 153 APPLIED to all 3 envs 2026-06-05** (Dev + Staging + Prod; verified `has_function_privilege('anon',...)`=false on each) → file moved to `applied/`, SCHEMA_SNAPSHOT changelog marked applied.

**Remaining (Items 1-4):** USER to TEST Items 1-4 on staging (now live at `12ee9069`) before any prod push. Bookkeeping commit `a6056031` is LOCAL-ONLY (see rotation section). Prod push only after staging test + approval + 9PM-7AM CT window.

---

## Secret Rotation (Session 90 — 2026-06-06/07)

Context: Vercel flagged ~12 env vars as "value visible to anyone with access." Rotating the real secrets and (where possible) marking Sensitive.

### ⚠️ NEXT — HIGHEST PRIORITY: Stripe LIVE secret key + webhook secret (deferred to a focused session, Session 91)

Both `STRIPE_SECRET_KEY` (`sk_live_…`, `src/lib/stripe/config.ts:5`) and `STRIPE_WEBHOOK_SECRET` (`whsec_…`, `src/app/api/webhooks/stripe/route.ts:25`) are flagged **"needs attention" (exposed)** in Vercel. These are the **highest-stakes secrets — the live payment path** — so the rotation was **intentionally deferred to a dedicated, focused session** (do NOT rush at the end of a long session). Empty platform = ideal window. **LIVE = PROD ONLY** (staging/dev use `sk_test_…`, separate + lower-stakes, rotate later). **CI does NOT use Stripe** (`ci.yml` injects only Supabase vars). NOT secrets, skip: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live`, public by design) + all `STRIPE_*_PRICE_ID` (`price_…` identifiers).

**RUNBOOK (use Stripe's built-in grace/overlap so there's always a fallback):**
- **A. Secret key** — Stripe (LIVE mode) → Developers → API keys → **Roll key** → set the OLD key's expiry to a **SHORT grace window (~1 hour, NOT "immediately")** → copy new `sk_live_…` → Vercel **Production**: **delete + re-create `STRIPE_SECRET_KEY` as Sensitive** with the new value.
- **B. Webhook secret** — Stripe → Developers → Webhooks → select the **PROD endpoint** (Session 63 note: prod webhook uses the **Vercel domain** as primary — pick that one, not staging; if multiple endpoints, roll ONLY the prod one) → **Roll secret** with a **~24h overlap** (old + new both valid during transition → no missed payment events) → copy new `whsec_…` → Vercel **Production**: **delete + re-create `STRIPE_WEBHOOK_SECRET` as Sensitive**.
- **C.** ONE **redeploy** of prod (latest/live deployment, fresh build).
- **D. VERIFY with a real small test transaction** on the live site: payment **succeeds** (proves new secret key) AND the order flips to **`paid`** (proves the new webhook secret verified the event). Resend-incident lesson — confirm the deployed build actually uses the new values; don't assume.
- **E.** Old key + old webhook secret **auto-expire** on their windows — nothing to manually revoke.
- **PRE-CHECK:** confirm `.env.local` does NOT hold the **live** `sk_live_…` (dev should use `sk_test_…`). If it does, that copy goes dead after the roll — clean it up.


### DONE — rotated + verified
- **TWILIO_AUTH_TOKEN** — rotated via Twilio secondary token → promoted to primary (old killed). Account SID + From number unchanged. (Decided to KEEP Twilio on — $1.23/mo, turning off risks re-paying $20 setup.)
- **CRON_SECRET** — regenerated (randomBytes), set in Vercel (all envs), redeployed. Old auto-dead (Vercel Cron + routes read current value). `.env.local` left as placeholder (only used for local cron tests).
- **RESEND_API_KEY** — new key in BOTH Vercel entries (Production + "all nonproduction") + `.env.local`; old keys DELETED in Resend. **VERIFIED end-to-end** via a real staging transaction (email arrived + logged in Resend) after the deployment fix below. **Prod email confirmed working 2026-06-09.** RESEND_FROM_EMAIL (not a secret) + RESEND_WEBHOOK_SECRET (no roll option, low stakes) left as-is.
- **GOOGLE_CLOUD_VISION_API_KEY** (2026-06-09) — new key created in GCP (Application restrictions = None; API restriction = Cloud Vision API only), set in all Vercel scopes + `.env.local`, prod + staging redeployed, old key DELETED. Verification skipped by choice (moderation is fail-open — `image-moderation.ts:10-12,45-49` — a bad key only silently skips moderation, never breaks uploads).
- **UPSTASH_REDIS_REST_TOKEN** (2026-06-09) — rotated via Upstash "Reset Credentials" (rotates the TOKEN only, NOT the URL — confirmed: local URL unchanged). New token in the editable Vercel token var + `.env.local`; both envs redeployed; old token auto-killed by the reset. The `UPSTASH_REDIS_REST_URL` var is integration-managed/locked in Vercel (won't save manual edits) — left untouched, correctly. Low-risk (rate-limit falls back to in-memory if Upstash unreachable, `rate-limit.ts:181-186`).
- **SUPABASE_SERVICE_ROLE_KEY — Prod** (2026-06-10, Session 91) — migrated the Prod project to the new API key system: created an `sb_secret_…` key + used the existing `sb_publishable_…`. Swapped both into Vercel **Production** scope (service-role **re-created as Sensitive**, publishable plain). Redeployed prod with a **fresh build (no cache)** so the `NEXT_PUBLIC_` publishable key re-inlined. Verified logged-out browse + login + admin/service-client + session intact. Then **Disabled legacy JWT-based API keys** in Supabase (NOT the JWT secret) → old exposed legacy `service_role` is now dead, **zero user disruption** (stayed logged in through the disable = JWT secret untouched). Consumers cleared first: Sentry (no DB key), Playwright (never prod — `playwright.config.ts:10-11`), CI (Staging project — `.github/workflows/ci.yml`). **Staging + Dev projects NOT yet rotated.**
- **SENTRY_AUTH_TOKEN** (2026-06-10, Session 91) — personal token (NOT integration-managed). Created a new personal token (scopes: **Releases=Admin, Project=Read, all else None**), swapped into the plain Vercel `SENTRY_AUTH_TOKEN` var, prod redeployed. Verified via Sentry → **Settings → Source Maps** showing a fresh **315-file upload** at deploy time (build logs are silent by design — `next.config.ts:85` `silent:true`, so log output is NOT a valid check). New token confirmed working → old personal token safe to revoke. Non-secrets left as-is: `SENTRY_ORG`/`SENTRY_PROJECT` (slugs), `NEXT_PUBLIC_SENTRY_DSN` (public by design — ships in client bundle).

### Vercel "Sensitive" note
Marking an EXISTING var Sensitive is blocked (it's a create-time, one-way setting — would need delete+recreate). Integration-managed vars (Upstash, Sentry) can't be toggled at all. For a SOLO dev the Sensitive flag is low value (only hides values from OTHER people with Vercel access). Decision: rotation is the real win; not chasing Sensitive.

### The email incident — ROOT CAUSE + LESSON
After the Resend rotation, transaction confirmation emails stopped (in-app worked, nothing in Resend). Proven NOT the key (direct Resend API send with the key SUCCEEDED), NOT the domain (both `mail.*` domains verified), NOT the account (email present + `email_order_updates:true`). **Actual cause: a stale/wrong STAGING deployment** — an accidental "Redeploy of old commit `4fc2356`" had reverted staging to old code and that deployment lacked the new key effective. Fix: redeploy the CORRECT commit `12ee9069` → fresh build picked up current env (new key) → email worked.
**Lessons:** (1) env-var changes need a fresh deploy of the CORRECT/latest commit — redeploying an OLD deployment reverts code + may carry stale env. (2) Test on the SAME env you redeployed (use the staging alias URL, not a pinned old-deploy URL). (3) A direct provider API call isolates "key works" from "deployment uses it."

### TODO TOMORROW
1. ~~VERIFY PROD EMAIL~~ — **DONE 2026-06-09**, prod email confirmed working (redeployed `4fc2356` to pick up new Resend key).
2. **Push bookkeeping commit `a6056031`** (local-only: mig 153 → applied/, snapshot "applied" note, this file). Blocked by pre-push E2E **Supabase-connectivity timeouts in the local test runner** (environmental, not code — build compiled fine). Retry the staging chain when connectivity returns, OR `--no-verify` (docs-only commit; needs explicit user OK per rules).
3. **Continue rotating remaining flagged secrets** (priority):
   - ~~GOOGLE_CLOUD_VISION_API_KEY~~ — **DONE 2026-06-09** (new restricted key, old deleted).
   - ~~UPSTASH_REDIS_REST_TOKEN~~ — **DONE 2026-06-09** via Upstash "Reset Credentials" (rotates token only, NOT the URL). New token pasted into the editable Vercel token var + `.env.local`; both envs redeployed. The URL var is integration-managed/locked (won't save manual edits) — left alone, correctly. Low-risk: rate-limit falls back to in-memory if Upstash unreachable (`rate-limit.ts:181-186`).
   - ~~SENTRY_AUTH_TOKEN~~ — **DONE 2026-06-10 (Session 91)** (see DONE section — personal token, not integration-managed; verified via the Source Maps page, since build logs are silenced).
   - UPSTASH_REDIS_REST_URL — not a secret → skip/leave.
   - RESEND_WEBHOOK_SECRET — **SKIP** (no roll in Resend; low-stakes email-event verification only).
   - VAPID_PRIVATE_KEY — **SKIP unless leak suspected** (rotating invalidates ALL push subscriptions + needs NEXT_PUBLIC_VAPID_PUBLIC_KEY changed too).
   - ~~SUPABASE_SERVICE_ROLE_KEY (Prod)~~ — **DONE 2026-06-10 (Session 91)** via new-key migration + disable legacy JWT-based keys (see DONE section). **REMAINING: Staging + Dev projects.** Staging rotation must update BOTH the Vercel **Preview** scope AND the 3 **GitHub Actions** CI secrets (CI runs tests against Staging). Dev = `.env.local` (low urgency — no real data). NOTE: `.env.local` currently holds all 3 projects' keys — the Prod line is now a **dead string**; decide whether to trim it to Dev-only or keep all 3 + secure the file (BitLocker on, keep out of OneDrive/File History).
4. **Backup hygiene** — `apps/web/.env.local` holds ~15 real secrets and is the only secret-bearing file in the repo (gitignored, but copied by any full-folder backup/thumb drive). Confirm BitLocker is on + keep that folder out of OneDrive/File History.
5. **USER: test Items 1-4 on staging** (`12ee9069`) before any prod push.

### Git/deploy state at handoff
- Local `main` = `a6056031` (Items 1-4 + bookkeeping) — bookkeeping NOT pushed.
- `origin/staging` = `12ee9069` (Items 1-4). Staging LIVE deploy = redeploy of `12ee9069` (+ new key). ✅
- `origin/main` (prod) = `4fc2356` (no Items 1-4; new-key status UNVERIFIED → TODO #1).

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
