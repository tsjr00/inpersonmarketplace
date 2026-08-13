# PRODUCTION DEPLOY RUNBOOK — 2026-08-13

**Prod is at `f141c6e6`. Local `main` = `e7150228`. This ships 72 commits.**

> ⚠ **STOP — read "Warnings" at the bottom before starting.** Two of them can
> block or break this deploy: the push window, and the fact that **migrations
> must run BEFORE the code push**.

---

## ORDER OF OPERATIONS — do not reorder

1. **STEP 1** — run the verification query below on **Prod**. It tells us what is
   actually missing, because the repo's own bookkeeping is not trustworthy (see
   Warning 2).
2. **STEP 2** — apply the missing migrations on **Prod**, in numeric order.
3. **STEP 3** — re-run the verification query. Every row should read `PRESENT`.
4. **STEP 4** — push code to prod.
5. **STEP 5** — post-push smoke checks.

**Migrations go FIRST.** The code being pushed expects tables and columns that
prod does not have yet. Push code first and pages that touch them will error.
Applying the migrations first is safe in the other direction: every one of them
is additive, and the currently-deployed prod code simply ignores new columns.

---

## STEP 1 — What is actually missing on Prod?

Read-only. Run on **Prod**.

```sql
SELECT '212 markets.cover_image_url' AS migration,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='markets' AND column_name='cover_image_url')
       THEN 'PRESENT' ELSE 'MISSING' END AS status
UNION ALL SELECT '213 cause_beneficiaries table',
       CASE WHEN to_regclass('public.cause_beneficiaries') IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '213 cause_campaigns table',
       CASE WHEN to_regclass('public.cause_campaigns') IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '213 cause_ledger table',
       CASE WHEN to_regclass('public.cause_ledger') IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '213 cause_remittances table',
       CASE WHEN to_regclass('public.cause_remittances') IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '214 markets.tax_jurisdictions',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='markets' AND column_name='tax_jurisdictions')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '215 fn clear_tax_jurisdiction_verification_on_address_change',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc
         WHERE proname='clear_tax_jurisdiction_verification_on_address_change')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '216 vendor_profiles.pickup_capacity_total_per_slot',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='vendor_profiles' AND column_name='pickup_capacity_total_per_slot')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '217 market_vendors.revoked_at',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='market_vendors' AND column_name='revoked_at')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '218 cause_beneficiaries.onboarding_token',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='cause_beneficiaries' AND column_name='onboarding_token')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '219 fn sync_event_request_to_market',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='sync_event_request_to_market')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '220 event_change_requests table',
       CASE WHEN to_regclass('public.event_change_requests') IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '221 event_change_requests.preorder_value_cents_at_request',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='event_change_requests' AND column_name='preorder_value_cents_at_request')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '222 rule_refusals table',
       CASE WHEN to_regclass('public.rule_refusals') IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '223 pickup-dates acceptance branch',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc
         WHERE proname='get_available_pickup_dates' AND prosrc LIKE '%response_status%')
       THEN 'PRESENT' ELSE 'MISSING' END
UNION ALL SELECT '210 auto_create_vendor_schedules FT skip',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc
         WHERE proname='auto_create_vendor_schedules' AND prosrc LIKE '%food_trucks%')
       THEN 'PRESENT' ELSE 'MISSING' END
ORDER BY 1;
```

**Interpretation:** every `MISSING` row names a migration to run in STEP 2.
The `210` row settles a genuinely open question — its prod status was never
confirmed (see Warning 2). If 210 shows MISSING, apply it **before** anything
else, since it is older than the rest.

---

## STEP 2 — Apply, in this order

Only the ones STEP 1 reported `MISSING`. **All of these are idempotent**
(`IF NOT EXISTS` / `CREATE OR REPLACE`), so re-running one that is already
present is a harmless no-op — if in doubt, run it.

| # | File | What it adds |
|---|---|---|
| 210 | `applied/20260725_210_skip_ft_park_auto_schedule.sql` | Function replace: approval stops auto-creating FT schedules. ⚠ only if MISSING |
| 212 | `applied/20260729_212_market_cover_image.sql` | `markets.cover_image_url` |
| 213 | `20260731_213_community_chip_in.sql` | 4 new tables (`cause_*`) |
| 214 | `20260801_214_tax_jurisdiction_storage.sql` | Tax columns on `markets` |
| 215 | `20260801_215_tax_jurisdiction_reverify_on_address_change.sql` | Trigger fn: clears tax verification when an address changes |
| 216 | `20260802_216_ft_pickup_slot_capacity.sql` | Pickup-capacity columns on `vendor_profiles` |
| 217 | `20260803_217_market_vendor_revoked_state.sql` | `market_vendors.revoked_at` / `revoked_by` |
| 218 | `20260805_218_cause_onboarding_token.sql` | Token columns on `cause_beneficiaries` — **needs 213 first** |
| 219 | `20260808_219_sync_event_request_to_market.sql` | Function `sync_event_request_to_market` |
| 220 | `20260809_220_event_change_requests.sql` | Table `event_change_requests` |
| 221 | `20260809_221_change_request_value_at_stake.sql` | Column on that table — **needs 220 first** |
| 222 | `20260809_222_rule_refusals.sql` | Table `rule_refusals` (refusal telemetry) |
| 223 | `20260810_223_events_sell_on_acceptance.sql` | Replaces `get_available_pickup_dates` — events sell on acceptance |

**⛔ DO NOT APPLY migration 225.** It is written but deliberately parked and has
never run anywhere. It REMOVES a branch (can only take rows away) and has not
been verified against a live FM event. See `backlog.md` → "T-39 PARKED".

**224 is already on Prod** (applied 2026-08-12) — nothing to do.

---

## STEP 3 — Re-run STEP 1

Every row should read `PRESENT` except `210` if you decide to leave it.

---

## STEP 4 — Push code

```sh
git checkout main && git push origin main
```

⚠ The pre-push hook enforces the production window (21:00–06:59 CT) and will
**block outside it**. See Warning 1.

---

## STEP 5 — After the push

1. Vercel build succeeded — **check the build status, not just that the push
   landed.** Prod has served a stale commit for days in the past because the
   push succeeded and the build failed.
2. Critical path: landing page loads, login works, browse loads, a listing page
   loads.
3. FT locations: a ZIP + 25-mile search returns the food parks (this is the
   T-60 repair, already applied to prod's database on 2026-08-12 — the code
   ships now).
4. Events: the public events page shows the two service-path cards.

---

## ⚠ WARNINGS

**1. The push window will block this.** Production pushes are allowed
21:00–06:59 CT and the pre-push hook enforces it. At the time of writing it is
mid-morning CT. The override is
`PUSH_WINDOW_OVERRIDE=hotfix git push origin main`, and it exists for
emergencies — **this deploy is not one.** Either wait for tonight, or decide
deliberately to override and say so.

**2. The repo cannot tell you what is on Prod. This is why STEP 1 exists.**
Three separate contradictions found today:
- Migration **212** sits in `migrations/applied/` (the folder that means
  "applied everywhere") while its changelog row says **Prod PENDING**.
- Migration **211** was marked "Prod PENDING" for two weeks while it had in fact
  run on Prod on 2026-07-31 — that false status is part of why the T-60
  regression went unnoticed.
- Migration **215**'s row records only Staging; Dev and Prod are unstated.
- Migration **210**'s prod status has never been confirmed.
Trust the query, not the folder and not the changelog.

**3. This is a 72-commit jump.** A week of work lands at once: the T-60
location-search repair, the events fixes, the uninvited-event leak (T-67), the
organizer dashboard rework, refusal telemetry, chip-in, and tax jurisdictions.
If something breaks after this, the blast radius is wide and bisecting is
painful. Prod having **no live shoppers** is what makes this acceptable.

**4. T-72 has not been verified in a browser.** It touches
`api/checkout/success/route.ts`, the post-payment route. The change is additive
and degrades to today's behaviour if the lookup fails, and it passed build and
tests — but nobody has completed a real event order and clicked "Continue
shopping". Assessed at ~1–2% risk of breaking, ~15% of simply not working.

**5. Known-unresolved bugs are shipping.** Deliberate, per your call. The
matching cluster (T-63/64/70) is unchanged: matching never re-runs, so a vendor
who becomes eligible after an event is created is never invited. T-55, T-58,
T-61, T-62 also unfixed. None are regressions — they exist on prod today in the
same or worse form.

**6. Two config checks worth doing while you are in there:**
- Is `UPSTASH_REDIS_REST_URL` set on **Prod**? If not, rate limiting has only
  ever been per-instance there (see backlog → "RATE LIMITER DOES NOT FAIL OPEN").
- `SCHEMA_SNAPSHOT.md`'s Enum Types table is stale and **not covered by its own
  STALE banner** — it omits `platform_admin` / `regional_admin`, added in March.
  Docs only, no deploy impact, but it misleads the next session.

**7. After the deploy, the snapshot needs its bookkeeping updated** — every
migration row that currently says "Prod PENDING" and is now applied. That is a
documentation task for immediately after, not before.
