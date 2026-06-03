# Current Task: Session 87 — Prod sync complete

**Updated:** 2026-06-02 (end-of-session close-out)
**Mode:** Fix (Prod deploy)

---

## 🟢 State at session end

**Prod is fully in sync with Staging.** Local `main`, `origin/main`, and `origin/staging` are all at `8caf174c`. All 13 pending migrations applied to Prod. The X1a security gap (PUBLIC inheritance through `anon`) is now actually closed on all 3 envs.

**No P0 active. No in-flight work blocking next session.**

---

## What Session 87 accomplished

### Phase 2 — Prod DB sync (migrations 138-148 + 149 re-run + new mig 152)

Applied to Prod in order:

| Mig | What |
|---|---|
| 138 | `vendor_market_agreement_acceptances` table (Phase B/C electronic-signature substrate) |
| 139 | `weekly_booth_rentals` table (Phase C booth rental + Stripe Connect, FK to 138) |
| 140 | `markets.logo_url` column (Phase B co-branding) |
| 141 | `markets.stripe_*` columns (Phase C manager Stripe Connect onboarding) |
| 142 | `book_weekly_booth_atomic` RPC (race-safe booth booking) |
| 143 | `replace_market_optin_selections` RPC (atomic opt-in save) |
| 144 | `booth_auto_assignment` (booth label range + auto-pick; DROP+CREATE on 142's RPC) |
| 145 | `market_vendor_tier_and_onboarding_acks` (inventory_id + ack columns) |
| 146 | `booth_number_uniqueness` (3 triggers + CREATE OR REPLACE on RPC) |
| 147 | `market_surveys` table + `user_profiles.survey_emails_opted_out` (Phase E foundation) |
| 148 | `market_documents` table + `market-documents` storage bucket (NEW-7) |
| 149 (re-run) | REVOKE EXECUTE FROM anon on the freshly-created 142/143 functions (idempotent on the 16 already revoked) |
| 152 (NEW) | **REVOKE EXECUTE FROM PUBLIC on all 18 financial / write RPCs** — closes the X1a inheritance gap left by mig 149 |

### Phase 3 — Code push

`git push origin main` via `PUSH_WINDOW_OVERRIDE=hotfix` at ~19:13 CT (~1h 47m before window opens) — justified because Prod DB had new schema with old code running. Pre-push hook ran `npm run build` + Playwright (49 passed + 1 skipped). Override warning logged in push output.

Push ref-update: `bd8a8910..8caf174c  main -> main`. Verified by `git log origin/main -1` = `8caf174c` and `git rev-list --count origin/main..HEAD` = 0.

### Phase 5 — Mig 151 re-apply

Vendor-documents bucket flipped private + broad SELECT policy dropped. Verified:
- `SELECT public FROM storage.buckets WHERE id = 'vendor-documents'` → `false`
- `vendor_documents_select` policy no longer exists
- Existing cert view via signed URL → works
- New cert upload + view round-trip → works

### Phase 6 — Bookkeeping

- 13 migration files moved from `supabase/migrations/` to `supabase/migrations/applied/` (12 via `git mv`, mig 152 via filesystem `mv` since untracked at the time)
- `SCHEMA_SNAPSHOT.md` changelog: 11 entries updated from "Prod pending" to "all 3 envs", mig 151 rewritten to capture re-apply, NEW entry for mig 152 at top
- `backlog.md`: COI upload-button visibility added as P1 (Session 87 discovery during smoke test); old "Migrations 138-143 + push" backlog item marked shipped
- This file rewritten to reflect close-out

Commit + push of bookkeeping is the last step (see "Open at end of session" below).

### New mig 152 — `revoke_public_from_financial_rpcs.sql`

Created during Session 87 after Prod verification revealed mig 149 hadn't actually closed the X1a hole. Discovery query:

```sql
SELECT has_function_privilege('anon', 'public.get_or_create_cart(uuid,text)', 'EXECUTE');
-- returned: true (despite mig 149 having run)
```

ACL inspection showed mig 149 removed direct `anon=` grants but `=X/postgres` (PUBLIC) entries remained. PostgREST exposes a function to `/rest/v1/rpc/<name>` based on effective EXECUTE — PUBLIC inheritance satisfied it, so anon callers could still invoke. Mig 152 closes that.

Caller audit done before draft (Explore agent + spot verification of `apps/web/src/app/api/cart/items/route.ts:27`): zero anon code paths use these 18 functions. Cart pre-signup confirmed auth-gated. Safe to revoke PUBLIC without breaking any flow.

Verified on Dev + Staging before Prod. Staging smoke test (cart add + checkout while authenticated) passed.

---

## Open at end of session (the last bookkeeping step)

The bookkeeping commit is fully staged in the working tree but **not yet committed**. When picking this up:

```bash
# From C:/GitHub/Projects/inpersonmarketplace
git status   # confirm modified files: SCHEMA_SNAPSHOT.md, current_task.md, backlog.md, 13 renamed mig files
git add supabase/migrations/applied/20260602_152_revoke_public_from_financial_rpcs.sql  # untracked file
git add supabase/SCHEMA_SNAPSHOT.md apps/web/.claude/current_task.md apps/web/.claude/backlog.md
# (the 12 git-mv'd mig file renames are already staged)
```

Then commit + push via the explicit chain (Rule 1 of `git-and-deployment.md`):

```bash
git checkout main && \
git commit -m "chore(deploy): Session 87 bookkeeping — 13 migs to applied/ + snapshot + task" && \
git checkout staging && git merge main --ff-only && git push origin staging && \
git checkout main
```

Then push `main` to Prod (push window opens 21:00 CT; this commit is non-urgent so wait for window — no override needed):

```bash
git push origin main
```

---

## Suggested next sessions (user picks)

**Option 1 — COI upload-button visibility fix** (newly logged as P1 in backlog.md). ~15 min frontend change at `COIUpload.tsx:146`. Vendors with grandfathered placeholder rows can't currently upload a real COI; this unblocks them.

**Option 2 — P2 audit backlog** from `apps/web/.claude/post_session84_audit.md`. 11 items remain unverified — most need staging testing. P2-K likely already resolved by X3 signed-URL endpoint; verify.

**Option 3 — Supabase advisor re-check on Prod.** With mig 152 applied, the advisor's X1a warnings should now stay clear permanently (vs the cleared-but-actually-still-exposed state mig 149 left). Verify by re-running advisor.

**Option 4 — Storage bucket cleanup audit.** Several P2/P3 items concern storage bucket policies on listing-images + vendor-images + market-documents that weren't fully tightened. Could batch into a mig 153 (X1b scope per mig 149's roadmap).

**Option 5 — Anything else** from `apps/web/.claude/backlog.md`.

---

## Reference points for next session

### Recent commits
- `8caf174c` — fix(docs): mig 151 prod rollback recorded + current_task updated (Session 86 close)
- (bookkeeping commit will be next, pending Session 88 author)

### State verification queries (for next session sanity check)

```sql
-- Prod is fully synced
-- 1) bucket private?  expect: public=false
SELECT public FROM storage.buckets WHERE id = 'vendor-documents';

-- 2) PUBLIC stripped from financial RPCs?  expect: zero rows
SELECT p.proname, pg_catalog.array_to_string(p.proacl, ', ') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('atomic_decrement_inventory', 'get_or_create_cart', 'reserve_event_wave', 'create_company_paid_order')
  AND EXISTS (SELECT 1 FROM unnest(p.proacl) AS a WHERE a::text LIKE '=%');
```

### Migrations on Prod (post-Session 87)
All migrations through 152 applied. See `SCHEMA_SNAPSHOT.md` Change Log for full history.

### What mig 152 changed in the DB
- REVOKE EXECUTE ... FROM PUBLIC on 18 SECURITY DEFINER functions (14 universal + 2 conditional Phase C + 2 conditional Prod-only)
- No schema, data, or function-body changes
- Verification query embedded in the migration file

### Critical-path files touched in the 52 pushed commits
`lib/stripe/webhooks.ts`, `lib/stripe/payments.ts`, `lib/pricing.ts` (7 commits — Phase C booth rental + audit P1-D webhook fix). Per-file approval was given at commit time during Sessions 83-86. Re-approval not needed for push.

### Vault state
Unchanged at `7f895e5` (`vault/pre-session-59`). No vault files touched this session.
