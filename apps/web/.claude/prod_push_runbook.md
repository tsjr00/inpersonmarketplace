# PROD PUSH RUNBOOK — Phase E remainder + FT park-manager + help (2026-07-07)

**Scope:** 16 migrations (168→183) + 43 commits (`426deff4..62b686f7`). Bundles Phase E credit/make-up (168–170) + FT park-manager (171–183) + all staging fixes + help KB.
**Prod baseline CONFIRMED at 167** (2026-07-07: `has_166=true, has_168=false, has_171=false`). Staging signed off by user.

## State (verified 2026-07-07)
- local `main` = `origin/staging` = **`62b686f7`**; prod `origin/main` = **`426deff4`**; 43 commits between (clean FF).
- All 16 migration files present in `supabase/migrations/` (none in `applied/` yet).

## STEP 1 — Apply migrations 168→183 to PROD, in numeric order (USER runs; NOT window-gated)
Safe to do BEFORE the code push: all additive (new tables/cols/functions) or idempotent data; current prod code tolerates them (it just ignores the new schema). ROLLBACK block in each file.
```
168 booth_credit_redemption            176 optin_catalog_vertical_cleanup
169 booth_credit_rental_and_expiry     177 markets_operator_keep_pct
170 season_potential_makeup_days       178 optin_universal_neutral_wording
171 ft_park_spots                       179 park_vendor_vetting
172 park_spot_bookings                  180 park_docs_notified
173 park_standing_reservations          181 optin_conduct_prohibited_lawful
174 park_standing_occurrences           182 park_standing_start_date
175 ft_optin_vertical_tag               183 seed_manager_operator_knowledge
```
Dep order satisfied by numeric order (176←175, 178←176, 181←178; 169 recreates the fn from 168). 168/169 use CREATE OR REPLACE / same signatures → backward-compatible with live code.

**Post-apply check (prod):**
```sql
SELECT to_regclass('public.park_spots') IS NOT NULL AS has_171,             -- TRUE
       to_regclass('public.park_vendor_vetting') IS NOT NULL AS has_179,    -- TRUE
       (SELECT count(*) FROM knowledge_articles WHERE category='For Park Operators') AS kb_183; -- 10
```

## STEP 2 — Push code to prod (CLAUDE runs, WITH user go, IN WINDOW 9 PM–7 AM CT)
Only after Step 1 confirmed. Teaching-mode explanation at the moment. Command:
```
git push origin main        # fast-forwards 426deff4 -> 62b686f7; pre-push hook: window + build + Playwright
```
- Window check WILL fire (prod). If outside 21:00–06:59 CT it blocks (override `PUSH_WINDOW_OVERRIDE=hotfix` — NOT recommended; this is a feature push, not a hotfix).
- If Turbopack Playwright flake: `rm -rf apps/web/.next` + retry.

## STEP 3 — Verify (CLAUDE + user)
- Vercel PROD build **succeeds** (dashboard — not just push exit 0).
- Smoke: pages load · login · a cart/checkout money-path check · an FT park dashboard · new help categories at `/food_trucks/help` + `/farmers_market/help`.
- Cron note: FT prod-only crons (occurrence gen, no-show, docs-review via `vercel.json`) start running once deployed — expected. `CRON_SECRET` already in prod. No new env vars.

## STEP 4 — Post-push bookkeeping (CLAUDE, then ONE commit, with go)
- Move `168→183` files → `supabase/migrations/applied/`.
- Add a batch-apply line to `SCHEMA_SNAPSHOT.md` changelog (mirror the 159–163 / 164–167 lines): "Migrations 168–183 APPLIED to PROD <date>…".
- Update `current_task.md`.
- Commit + push (staging chain; this is bookkeeping, safe any time).

## Rollback posture
- Build fails → Vercel keeps the last good deploy; prod code unchanged. Fix forward + re-push.
- Migrations are additive → applying them without the code deploy does NOT break live prod code.
- Per-migration ROLLBACK blocks exist if a specific migration must be reverted.
